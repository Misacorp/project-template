#!/usr/bin/env node
// Turns a fresh copy of the template into a project. Run it once, from the repo root, right after
// "Use this template":
//
//   node bootstrap/init.mjs                 asks the questions below
//   node bootstrap/init.mjs --name "My App" --owner Misa --environments production,staging \
//     --stack cloudflare-web --production-host app.example.com --yes
//
// It asks for the project name, the owner, the environments (production only, or production and staging)
// and the stack (none, or cloudflare-web: a pnpm workspace with a Vite + Preact frontend and one
// Cloudflare Worker). Then it fills in the placeholders, keeps or drops the `@if` blocks, copies the
// stack's files in, writes project.config.json and removes bootstrap/ (keep it with --keep-bootstrap).
// --dry-run prints the plan and writes nothing. Plain Node, no dependencies.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  ENVIRONMENT_SETS,
  STACKS,
  UserError,
  buildConfig,
  buildPlan,
  flagsFor,
  normaliseHost,
  render,
  repoFromRemote,
  slugify,
  stagingHostFor,
} from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Usage: node bootstrap/init.mjs [options]

  --name <text>              project name, for example "Leet Creatures"
  --slug <slug>              short lowercase name for packages and workers (default: from the name)
  --owner <name>             the owner's name, as agents address them in CLAUDE.md
  --github <login>           the owner's GitHub login for CODEOWNERS (default: the repo owner)
  --commit-email <email>     the email agents commit with, as the owner (their GitHub no-reply address)
  --repo <owner/name>        the GitHub repository (default: from git remote origin)
  --environments <set>       ${Object.keys(ENVIRONMENT_SETS).join(' | ')}
  --stack <stack>            ${STACKS.join(' | ')}
  --production-host <host>   cloudflare-web: the production custom domain, for example app.example.com
  --staging-host <host>      cloudflare-web: the staging custom domain (default: <first>-staging.<rest>)
  --yes                      don't ask; use the options and the defaults
  --dry-run                  print what would change, write nothing
  --keep-bootstrap           keep bootstrap/ and the template's own workflow afterwards
  --force                    run even though project.config.json exists`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new UserError(`Unexpected argument "${arg}".\n\n${USAGE}`);
    const name = arg.slice(2);
    if (['yes', 'dry-run', 'keep-bootstrap', 'force', 'help'].includes(name)) flags[name] = true;
    else if (i + 1 < argv.length) flags[name] = argv[++i];
    else throw new UserError(`--${name} needs a value.`);
  }
  return flags;
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function ask(rl, question, fallback, check = (v) => v) {
  for (;;) {
    const hint = fallback ? ` [${fallback}]` : '';
    const answer = (await rl.question(`${question}${hint}: `)).trim() || fallback || '';
    try {
      return check(answer);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      console.log(`  ${err.message}`);
    }
  }
}

function choice(options) {
  return (v) => {
    if (!options.includes(v)) throw new UserError(`Choose one of: ${options.join(', ')}.`);
    return v;
  };
}

/** The owner defaults kept in bootstrap/owner.json, if it is there. */
function ownerDefaults() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'bootstrap', 'owner.json'), 'utf8'));
  } catch {
    return {};
  }
}

async function gather(flags) {
  const owner = ownerDefaults();
  const answers = {
    name: flags.name,
    slug: flags.slug,
    ownerName: flags.owner ?? owner.name,
    ownerGithub: flags.github ?? owner.github,
    commitEmail: flags['commit-email'] ?? owner.commitEmail,
    repo: flags.repo ?? repoFromRemote(git(['remote', 'get-url', 'origin'])),
    environments: flags.environments ?? 'production',
    stack: flags.stack ?? 'none',
    productionHost: flags['production-host'],
    stagingHost: flags['staging-host'],
  };
  if (flags.yes) return answers;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    answers.name = await ask(rl, 'Project name', answers.name);
    answers.slug = await ask(rl, 'Slug', answers.slug ?? slugify(answers.name), (v) => slugify(v));
    answers.ownerName = await ask(
      rl,
      "Owner's name (agents address them by it)",
      answers.ownerName,
    );
    answers.repo = await ask(rl, 'GitHub repository (owner/name)', answers.repo);
    answers.ownerGithub = await ask(
      rl,
      "Owner's GitHub login (CODEOWNERS)",
      answers.ownerGithub ?? answers.repo.split('/')[0],
    );
    console.log(
      '\nAgents commit as the owner, so a squash merge adds no Co-authored-by line. Use your GitHub\n' +
        'no-reply address (GitHub, Settings, Emails: <id>+<login>@users.noreply.github.com).',
    );
    answers.commitEmail = await ask(rl, 'Commit email (empty: decide later)', answers.commitEmail);
    console.log(
      '\nEnvironments: "production" deploys every merge to main. "production,staging" adds a staging\n' +
        'environment that only a manual run of the deploy workflow updates, from any branch.',
    );
    answers.environments = await ask(
      rl,
      `Environments (${Object.keys(ENVIRONMENT_SETS).join(' | ')})`,
      answers.environments,
      choice(Object.keys(ENVIRONMENT_SETS)),
    );
    console.log(
      '\nStacks: "none" keeps only the process, CI, security and agent tooling. "cloudflare-web" adds a\n' +
        'pnpm workspace with a Vite + Preact frontend and one Cloudflare Worker that serves it and /api,\n' +
        'deployed by GitHub Actions to custom domains on your Cloudflare account.',
    );
    answers.stack = await ask(rl, `Stack (${STACKS.join(' | ')})`, answers.stack, choice(STACKS));
    if (answers.stack === 'cloudflare-web') {
      answers.productionHost = await ask(
        rl,
        'Production host (a domain on your Cloudflare account)',
        answers.productionHost,
        normaliseHost,
      );
      if (answers.environments.includes('staging')) {
        answers.stagingHost = await ask(
          rl,
          'Staging host',
          answers.stagingHost ?? stagingHostFor(answers.productionHost),
          normaliseHost,
        );
      }
    }
  } finally {
    rl.close();
  }
  return answers;
}

/**
 * Decisions that only hold with staging or with a stack live in bootstrap/decisions/<flag>/<topic>.md. They
 * are added to the project's topic files when that flag is on, then `fix` sorts them in and rewrites the index.
 */
function addDecisions(config) {
  const on = Object.entries(flagsFor(config))
    .filter(([, value]) => value)
    .map(([flag]) => flag);
  for (const flag of on) {
    const dir = join(ROOT, 'bootstrap', 'decisions', flag);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const entries = render(
        readFileSync(join(dir, file), 'utf8'),
        config,
        `decisions/${flag}/${file}`,
      );
      appendFileSync(join(ROOT, 'docs', 'design', 'decisions', file), `\n${entries.trim()}\n`);
    }
  }
  execFileSync('node', ['scripts/decisions.mjs', 'fix', '--quiet'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return;
  }
  if (existsSync(join(ROOT, 'project.config.json')) && !flags.force) {
    throw new UserError(
      'project.config.json exists, so this project is already bootstrapped. Use --force to run again.',
    );
  }

  const config = buildConfig(await gather(flags));
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean);
  if (files.length === 0)
    throw new UserError('Run this inside the git checkout of the new project.');
  const plan = buildPlan(ROOT, files, config);
  if (flags['keep-bootstrap']) {
    plan.remove = plan.remove.filter(
      (f) => !f.startsWith('bootstrap/') && f !== '.github/workflows/template.yml',
    );
  }

  console.log(`\n${config.name} (${config.slug}), ${config.repo}, owner ${config.owner.name}`);
  console.log(
    `Environments: ${Object.keys(config.environments).join(', ')}. Stack: ${config.stack}.`,
  );
  console.log(`\nWrite ${plan.write.size} files, remove ${plan.remove.length}.`);
  if (flags['dry-run']) {
    for (const f of [...plan.write.keys()].sort()) console.log(`  write  ${f}`);
    for (const f of plan.remove) console.log(`  remove ${f}`);
    return;
  }

  for (const [path, content] of plan.write) {
    const abs = join(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  addDecisions(config);
  for (const path of plan.remove) rmSync(join(ROOT, path), { force: true });
  if (!flags['keep-bootstrap']) rmSync(join(ROOT, 'bootstrap'), { recursive: true, force: true });

  const steps = [];
  if (config.stack === 'cloudflare-web') {
    steps.push('pnpm install --frozen-lockfile', 'pnpm check');
  }
  steps.push(
    'git add -A && git commit -m "Bootstrap the project from the template" && git push',
    `node scripts/github-setup.mjs --user ${config.owner.github}   (rules, merge settings, environments, secrets; needs the gh CLI)`,
    'The rest is in docs/setup.md; agents remind you while a step is open.',
  );
  console.log(`\nDone. Next:\n${steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`);
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
