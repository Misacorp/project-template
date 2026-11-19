import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import {
  UserError,
  applyConditions,
  buildConfig,
  buildPlan,
  fillPlaceholders,
  formatJson,
  mergeSettings,
  normaliseHost,
  repoFromRemote,
  slugify,
  stagingHostFor,
} from './lib.mjs';

const base = {
  name: 'Sample App',
  ownerName: 'Sam',
  repo: 'example/sample-app',
};

describe('answers', () => {
  it('slugifies names', () => {
    assert.equal(slugify('Leet Créatures!'), 'leet-creatures');
    assert.equal(slugify('***'), 'app');
  });

  it('reads the repo from a remote', () => {
    assert.equal(repoFromRemote('https://github.com/Misacorp/creatures.git'), 'Misacorp/creatures');
    assert.equal(repoFromRemote('git@github.com:Misacorp/creatures'), 'Misacorp/creatures');
    assert.equal(repoFromRemote('http://proxy/git/Misacorp/creatures'), undefined);
  });

  it('normalises hosts and rejects junk', () => {
    assert.equal(normaliseHost(' https://App.Example.com/ '), 'app.example.com');
    assert.throws(() => normaliseHost('localhost'), UserError);
    assert.throws(() => normaliseHost('a b.com'), UserError);
    assert.equal(stagingHostFor('app.example.com'), 'app-staging.example.com');
  });

  it('builds a production-only config without a stack', () => {
    const c = buildConfig(base);
    assert.equal(c.slug, 'sample-app');
    assert.equal(c.owner.github, 'example');
    assert.deepEqual(Object.keys(c.environments), ['production']);
    assert.deepEqual(c.environments.production.branches, ['main']);
    assert.equal(c.environments.production.url, undefined);
  });

  it('allows staging without a stack (no urls to compare)', () => {
    const c = buildConfig({ ...base, environments: 'production,staging' });
    assert.deepEqual(Object.keys(c.environments), ['production', 'staging']);
  });

  it('builds staging and urls for cloudflare-web', () => {
    const c = buildConfig({
      ...base,
      stack: 'cloudflare-web',
      environments: 'production,staging',
      productionHost: 'sample.example.com',
    });
    assert.equal(c.environments.production.url, 'https://sample.example.com');
    assert.equal(c.environments.staging.url, 'https://sample-staging.example.com');
    assert.deepEqual(c.environments.staging.branches, []);
    assert.deepEqual(c.environments.staging.secrets, [
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_ID',
    ]);
  });

  it('rejects bad answers', () => {
    assert.throws(() => buildConfig({ ...base, name: ' ' }), /needs a name/);
    assert.throws(() => buildConfig({ ...base, stack: 'rails' }), /Unknown stack/);
    assert.throws(() => buildConfig({ ...base, environments: 'staging' }), /Unknown environments/);
    assert.throws(() => buildConfig({ ...base, repo: 'nope' }), /not a GitHub repository/);
    assert.throws(
      () =>
        buildConfig({
          ...base,
          stack: 'cloudflare-web',
          environments: 'production,staging',
          productionHost: 'a.example.com',
          stagingHost: 'a.example.com',
        }),
      /different hosts/,
    );
  });
});

describe('applyConditions', () => {
  const text = [
    'top',
    '# @if staging',
    'staging line',
    '# @else',
    'production only',
    '# @endif',
    '<!-- @if !staging -->',
    'no staging',
    '<!-- @endif -->',
    '  // @if cloudflare-web',
    '  // @if staging',
    '  nested',
    '  // @endif',
    '  // @endif',
    'end',
  ].join('\n');

  it('keeps the staging branch', () => {
    assert.equal(
      applyConditions(text, { staging: true, 'cloudflare-web': true }),
      'top\nstaging line\n  nested\nend',
    );
  });

  it('keeps the else branch', () => {
    assert.equal(applyConditions(text, {}), 'top\nproduction only\nno staging\nend');
  });

  it('an inactive parent hides an active child', () => {
    assert.equal(applyConditions(text, { staging: true }), 'top\nstaging line\nend');
  });

  it('reports unbalanced markers with the line', () => {
    assert.throws(
      () => applyConditions('# @if staging\nx', {}, 'f.yml'),
      /f\.yml:1: @if without @endif/,
    );
    assert.throws(() => applyConditions('# @endif', {}, 'f.yml'), /@endif without @if/);
    assert.throws(() => applyConditions('# @else', {}, 'f.yml'), /@else without @if/);
  });

  it('leaves similar text alone', () => {
    const s = '# @iffy\nrun: echo "@if staging"';
    assert.equal(applyConditions(s, {}), s);
  });
});

describe('fillPlaceholders', () => {
  it('fills names and never touches GitHub expressions', () => {
    assert.equal(
      fillPlaceholders('{{PROJECT_NAME}} ${{ github.sha }} ${{X}}', { PROJECT_NAME: 'Sample' }),
      'Sample ${{ github.sha }} ${{X}}',
    );
  });

  it('rejects unknown names', () => {
    assert.throws(() => fillPlaceholders('{{NOPE}}', {}, 'a.md'), /a\.md: unknown placeholder/);
  });
});

describe('mergeSettings', () => {
  it('adds deny rules once, in order', () => {
    const merged = mergeSettings(
      { permissions: { deny: ['a', 'b'] }, hooks: { x: 1 } },
      { permissions: { deny: ['b', 'c'] } },
    );
    assert.deepEqual(merged, { permissions: { deny: ['a', 'b', 'c'] }, hooks: { x: 1 } });
  });
});

describe('buildPlan', () => {
  function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'bootstrap-'));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return root;
  }

  it('renders own files, overlays the stack, drops empty files and template-only paths', () => {
    const root = repo({
      'README.md': '# {{PROJECT_NAME}}\n',
      'same.md': 'unchanged\n',
      'docs/staging.md': '<!-- @if staging -->\nstaging notes\n<!-- @endif -->\n',
      '.claude/settings.json': '{"permissions":{"deny":["a"]}}',
      '.github/workflows/template.yml': 'x',
      'bootstrap/init.mjs': 'x',
      'bootstrap/stacks/cloudflare-web/files/apps/web/index.html':
        '<title>{{PROJECT_NAME}}</title>\n',
      'bootstrap/stacks/cloudflare-web/files/README.md': '# {{PROJECT_NAME}} (stack)\n',
      'bootstrap/stacks/cloudflare-web/files/icon.png': 'binary',
      'bootstrap/stacks/cloudflare-web/claude-settings.json': '{"permissions":{"deny":["b"]}}',
    });
    const own = [
      'README.md',
      'same.md',
      'docs/staging.md',
      '.claude/settings.json',
      '.github/workflows/template.yml',
      'bootstrap/init.mjs',
    ];
    const config = buildConfig({
      ...base,
      stack: 'cloudflare-web',
      productionHost: 'a.example.com',
    });
    const plan = buildPlan(root, own, config);
    assert.equal(plan.write.get('README.md'), '# Sample App (stack)\n');
    assert.equal(plan.write.get('apps/web/index.html'), '<title>Sample App</title>\n');
    assert.equal(String(plan.write.get('icon.png')), 'binary');
    assert.equal(plan.write.has('same.md'), false);
    assert.deepEqual(JSON.parse(plan.write.get('.claude/settings.json')).permissions.deny, [
      'a',
      'b',
    ]);
    assert.equal(JSON.parse(plan.write.get('project.config.json')).slug, 'sample-app');
    assert.deepEqual(plan.remove, [
      '.github/workflows/template.yml',
      'bootstrap/init.mjs',
      'docs/staging.md',
    ]);
  });
});

describe('formatJson', () => {
  it('writes short arrays inline and long ones expanded, like Prettier', () => {
    const long = Array.from({ length: 12 }, (_, i) => `ITEM_NUMBER_${i}`);
    assert.equal(
      formatJson({ a: ['x', 'y'], b: [], c: {}, d: { e: 1 }, long }),
      `{\n  "a": ["x", "y"],\n  "b": [],\n  "c": {},\n  "d": {\n    "e": 1\n  },\n  "long": [\n${long.map((v) => `    "${v}"`).join(',\n')}\n  ]\n}`,
    );
  });
});

describe('applyConditions gaps', () => {
  it('leaves one blank line where a block was dropped', () => {
    const md = 'a\n\n<!-- @if staging -->\n\nstaging\n\n<!-- @endif -->\n\nb\n';
    assert.equal(applyConditions(md, {}), 'a\n\nb\n');
    assert.equal(applyConditions(md, { staging: true }), 'a\n\nstaging\n\nb\n');
  });
});

describe('inline conditions', () => {
  it('picks the matching part of a line', () => {
    const line =
      'a<!-- @if staging --> and staging<!-- @endif -->; b<!-- @if x -->X<!-- @else -->Y<!-- @endif -->';
    assert.equal(applyConditions(line, { staging: true }), 'a and staging; bY');
    assert.equal(applyConditions(line, { x: true }), 'a; bX');
  });

  it('rejects a marker that is neither a whole line nor an inline pair', () => {
    assert.throws(
      () => applyConditions('text # @if staging', {}, 'f.yml'),
      /f\.yml:1: a marker must be/,
    );
    assert.throws(() => applyConditions('x <!-- @if staging --> y', {}), /a marker must be/);
  });
});
