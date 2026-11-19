#!/usr/bin/env node
// Bootstraps a throwaway sample project from this checkout, for the template's own CI
// (.github/workflows/template.yml) and for trying a template change locally:
//
//   node bootstrap/smoke.mjs --stack cloudflare-web --environments production,staging --out /tmp/sample
//
// Copies this checkout's files (tracked and untracked, not ignored) to --out, makes it a git repo, and runs
// bootstrap/init.mjs there with fixed sample answers. --out must not exist yet.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const out = opt('out');
if (!out) {
  console.error('Usage: node bootstrap/smoke.mjs --out <dir> [--stack s] [--environments e]');
  process.exit(2);
}
if (existsSync(out)) {
  console.error(`${out} exists; pick a new folder.`);
  process.exit(2);
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && existsSync(join(ROOT, f)));
for (const f of files) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  copyFileSync(join(ROOT, f), join(out, f));
}
run('git', ['init', '--quiet', '--initial-branch=main'], out);
run('git', ['add', '-A'], out);
run(
  'node',
  [
    'bootstrap/init.mjs',
    '--yes',
    '--name',
    'Sample App',
    '--owner',
    'Sam',
    '--repo',
    'example/sample-app',
    '--stack',
    opt('stack', 'none'),
    '--environments',
    opt('environments', 'production'),
    '--production-host',
    'sample.example.com',
  ],
  out,
);
