// The pure logic of `node bootstrap/init.mjs`: placeholders, conditional blocks and the plan of files to
// write. Only node: built-ins. The fs-touching parts take the repo root as a parameter so tests can run on a
// temp directory.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** An error with a message meant for the person running the tool (no stack trace). */
export class UserError extends Error {}

export const STACKS = ['none', 'cloudflare-web'];
export const ENVIRONMENT_SETS = {
  production: ['production'],
  'production,staging': ['production', 'staging'],
};

// ---------------------------------------------------------------------------------------------
// Answers

/** "My Cool App!" becomes "my-cool-app". */
export function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

/** `https://github.com/Owner/repo.git` or `git@github.com:Owner/repo` becomes `Owner/repo`. */
export function repoFromRemote(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : undefined;
}

/** A bare hostname: no scheme, path, port or spaces. */
export function normaliseHost(input) {
  const host = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    throw new UserError(`"${input}" is not a hostname (for example app.example.com).`);
  }
  return host;
}

/** The staging host suggested for a production host: app.example.com becomes app-staging.example.com. */
export function stagingHostFor(host) {
  const [first, ...rest] = host.split('.');
  return [`${first}-staging`, ...rest].join('.');
}

/** Checks the answers and fills in what follows from them. Returns the project config object. */
export function buildConfig(answers) {
  const name = (answers.name ?? '').trim();
  if (!name) throw new UserError('The project needs a name.');
  const slug = answers.slug?.trim() || slugify(name);
  if (!/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) {
    throw new UserError(`"${slug}" is not a valid slug (lowercase letters, digits and dashes).`);
  }
  const ownerName = (answers.ownerName ?? '').trim();
  if (!ownerName) throw new UserError('The owner needs a name.');
  const repo = (answers.repo ?? '').trim();
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
    throw new UserError(`"${repo}" is not a GitHub repository (owner/name).`);
  }
  const ownerGithub = (answers.ownerGithub ?? '').trim() || repo.split('/')[0];
  const commitEmail = (answers.commitEmail ?? '').trim();
  if (commitEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(commitEmail)) {
    throw new UserError(`"${commitEmail}" is not an email address.`);
  }
  const stack = answers.stack ?? 'none';
  if (!STACKS.includes(stack)) {
    throw new UserError(`Unknown stack "${stack}". Choose one of: ${STACKS.join(', ')}.`);
  }
  const envNames = ENVIRONMENT_SETS[answers.environments ?? 'production'];
  if (!envNames) {
    throw new UserError(
      `Unknown environments "${answers.environments}". Choose one of: ${Object.keys(ENVIRONMENT_SETS).join(', ')}.`,
    );
  }

  const environments = {};
  for (const env of envNames) {
    const entry = {
      deploysFrom: env === 'production' ? 'push to main' : 'manual run',
      branches: env === 'production' ? ['main'] : [],
      secrets: [],
    };
    if (stack === 'cloudflare-web') {
      const host =
        env === 'production'
          ? normaliseHost(answers.productionHost ?? '')
          : normaliseHost(
              answers.stagingHost || stagingHostFor(normaliseHost(answers.productionHost ?? '')),
            );
      entry.url = `https://${host}`;
      entry.secrets = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
    }
    environments[env] = entry;
  }
  if (environments.staging?.url && environments.staging.url === environments.production.url) {
    throw new UserError('Staging and production need different hosts.');
  }

  return {
    $comment:
      'Written by bootstrap/init.mjs. Read by scripts/github-setup.mjs, scripts/decisions.mjs and (with a stack) scripts/deployed.mjs. Edit freely; then re-run node scripts/github-setup.mjs.',
    name,
    slug,
    repo,
    owner: { name: ownerName, github: ownerGithub, ...(commitEmail ? { commitEmail } : {}) },
    stack,
    created: answers.today ?? new Date().toISOString().slice(0, 10),
    environments,
  };
}

/** The flags that `@if` blocks test, from a project config. */
export function flagsFor(config) {
  return {
    staging: 'staging' in config.environments,
    stack: config.stack !== 'none',
    'commit-email': Boolean(config.owner.commitEmail),
    [config.stack]: true,
  };
}

/** The values `{{NAME}}` placeholders take, from a project config. */
export function placeholdersFor(config) {
  const host = (env) => (config.environments[env]?.url ?? '').replace(/^https:\/\//, '');
  return {
    PROJECT_NAME: config.name,
    PROJECT_SLUG: config.slug,
    REPO: config.repo,
    OWNER_NAME: config.owner.name,
    OWNER_GITHUB: config.owner.github,
    PRODUCTION_HOST: host('production'),
    STAGING_HOST: host('staging'),
    TODAY: config.created,
  };
}

// ---------------------------------------------------------------------------------------------
// Text processing

/**
 * A marker line: `# @if staging`, `// @if !staging`, `<!-- @else -->`, `/* @endif *\/`. The whole line is
 * the marker; it is removed from the output.
 */
const MARKER =
  /^\s*(?:#|\/\/|<!--|\/\*)\s*@(if|else|endif)\b\s*(!?[a-z][a-z0-9-]*)?\s*(?:-->|\*\/)?\s*$/;

/** Keeps or drops the lines between `@if <flag>` / `@else` / `@endif` markers. Blocks nest. */
export function applyConditions(text, flags, file = 'text') {
  const out = [];
  const stack = []; // each: { active, parentActive, sawElse, line }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = MARKER.exec(line);
    const active = stack.length === 0 || stack[stack.length - 1].active;
    if (!m) {
      if (active) out.push(applyInline(line, flags, `${file}:${i + 1}`));
      else out.push(DROPPED);
      return;
    }
    out.push(DROPPED);
    const [, kind, cond] = m;
    if (kind === 'if') {
      if (!cond) throw new UserError(`${file}:${i + 1}: @if needs a flag.`);
      const negate = cond.startsWith('!');
      const value = Boolean(flags[negate ? cond.slice(1) : cond]);
      stack.push({
        active: active && value !== negate,
        parentActive: active,
        sawElse: false,
        line: i + 1,
      });
    } else if (kind === 'else') {
      const top = stack[stack.length - 1];
      if (!top || top.sawElse) throw new UserError(`${file}:${i + 1}: @else without @if.`);
      top.sawElse = true;
      top.active = top.parentActive && !top.active;
    } else {
      if (!stack.pop()) throw new UserError(`${file}:${i + 1}: @endif without @if.`);
    }
  });
  if (stack.length) {
    throw new UserError(`${file}:${stack[stack.length - 1].line}: @if without @endif.`);
  }
  return collapseDropped(out).join('\n');
}

const DROPPED = Symbol('dropped');

/** `<!-- @if flag -->kept<!-- @else -->other<!-- @endif -->` inside one line (Markdown and HTML only). */
const INLINE =
  /<!-- @if (!?[a-z][a-z0-9-]*) -->([\s\S]*?)(?:<!-- @else -->([\s\S]*?))?<!-- @endif -->/g;

function applyInline(line, flags, where) {
  const result = line.replace(INLINE, (_, cond, yes, no = '') => {
    const negate = cond.startsWith('!');
    return Boolean(flags[negate ? cond.slice(1) : cond]) !== negate ? yes : no;
  });
  if (/(?:<!--|\/\/|#|\/\*)\s*@(?:if|else|endif)\b/.test(result)) {
    throw new UserError(
      `${where}: a marker must be a whole line, or an inline <!-- @if x -->...<!-- @endif --> pair.`,
    );
  }
  return result;
}

/**
 * Removes the gaps that dropped lines leave: after a run of dropped lines, blank lines are skipped while the
 * text before already ends in a blank line (or is the start of the file). So "a, blank, marker, blank, b"
 * becomes "a, blank, b", as a formatter would write it.
 */
function collapseDropped(lines) {
  const kept = [];
  let afterDrop = false;
  for (const line of lines) {
    if (line === DROPPED) {
      afterDrop = true;
      continue;
    }
    if (
      afterDrop &&
      line.trim() === '' &&
      (kept.length === 0 || kept[kept.length - 1].trim() === '')
    ) {
      continue;
    }
    afterDrop = false;
    kept.push(line);
  }
  return kept;
}

/**
 * Replaces `{{NAME}}` (capitals, digits and underscores only, so GitHub's `${{ expr }}` never matches) with
 * its value. An unknown name is an error, so a typo never ships.
 */
export function fillPlaceholders(text, values, file = 'text') {
  return text.replace(/(?<!\$)\{\{([A-Z][A-Z0-9_]*)\}\}/g, (whole, name) => {
    if (!(name in values)) throw new UserError(`${file}: unknown placeholder ${whole}.`);
    return values[name];
  });
}

/** Both steps for one file. */
export function render(text, config, file) {
  return fillPlaceholders(
    applyConditions(text, flagsFor(config), file),
    placeholdersFor(config),
    file,
  );
}

/**
 * JSON as Prettier writes it (printWidth 100): objects one key per line, arrays of plain values on one line
 * when they fit. So a written config passes `prettier --check` as is.
 */
export function formatJson(value, indent = '', width = 100, prefix = 0) {
  const next = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      // The line is indent, the `"key": ` prefix, the array and a trailing comma.
      if (indent.length + prefix + inline.length + 1 <= width) return inline;
    }
    return `[\n${value.map((v) => `${next}${formatJson(v, next, width)}`).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const body = entries
      .map(([k, v]) => {
        const key = `${JSON.stringify(k)}: `;
        return `${next}${key}${formatJson(v, next, width, key.length)}`;
      })
      .join(',\n');
    return `{\n${body}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** Adds the stack's deny rules to .claude/settings.json (kept in order, no duplicates). */
export function mergeSettings(settings, extra) {
  const deny = [...(settings.permissions?.deny ?? [])];
  for (const rule of extra.permissions?.deny ?? []) if (!deny.includes(rule)) deny.push(rule);
  return { ...settings, permissions: { ...settings.permissions, deny } };
}

// ---------------------------------------------------------------------------------------------
// The plan

const TEXT_EXT =
  /\.(md|mjs|js|cjs|ts|tsx|mts|json|jsonc|yml|yaml|html|css|txt|toml)$|(^|\/)(\.[a-z]+rc|\.gitignore|\.gitattributes|\.gitleaksignore|\.prettierignore|\.editorconfig|\.nvmrc|CODEOWNERS|_headers)$/;

/** Is this path processed as text (conditions and placeholders), or copied byte for byte? */
export function isText(path) {
  return TEXT_EXT.test(path);
}

function walk(dir, root = dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) files.push(...walk(abs, root));
    else files.push(relative(root, abs).split(sep).join('/'));
  }
  return files;
}

/** Paths owned by the template itself, removed once a project is bootstrapped. */
export const TEMPLATE_ONLY = ['bootstrap/', '.github/workflows/template.yml'];

/**
 * What init writes, as { write: Map<path, string | Buffer>, remove: string[] }.
 * `files` is the repo's own file list (git ls-files). Stack files overlay the repo's files of the same path.
 * A text file that renders to only whitespace is not written (and removed if it exists): that is how a
 * whole file is made conditional.
 */
export function buildPlan(root, files, config) {
  const write = new Map();
  const remove = new Set();
  const own = files.filter((f) => !TEMPLATE_ONLY.some((t) => f === t || f.startsWith(t)));
  const stackDir = join(root, 'bootstrap', 'stacks', config.stack);
  const stackFiles =
    config.stack !== 'none' && existsSync(join(stackDir, 'files'))
      ? walk(join(stackDir, 'files'))
      : [];

  const sources = new Map(own.map((f) => [f, join(root, f)]));
  for (const f of stackFiles) sources.set(f, join(stackDir, 'files', f));

  for (const [path, abs] of sources) {
    if (!isText(path)) {
      if (abs.startsWith(stackDir)) write.set(path, readFileSync(abs));
      continue;
    }
    const before = readFileSync(abs, 'utf8');
    const after = render(before, config, path);
    if (after.trim() === '') {
      if (own.includes(path)) remove.add(path);
    } else if (after !== before || abs.startsWith(stackDir)) {
      write.set(path, after);
    }
  }

  const extraSettings = join(stackDir, 'claude-settings.json');
  if (config.stack !== 'none' && existsSync(extraSettings)) {
    const path = '.claude/settings.json';
    const current = JSON.parse(write.get(path) ?? readFileSync(join(root, path), 'utf8'));
    const merged = mergeSettings(current, JSON.parse(readFileSync(extraSettings, 'utf8')));
    write.set(path, `${formatJson(merged)}\n`);
  }

  write.set('project.config.json', `${formatJson(config)}\n`);
  for (const f of files) if (TEMPLATE_ONLY.some((t) => f === t || f.startsWith(t))) remove.add(f);
  return { write, remove: [...remove].sort() };
}
