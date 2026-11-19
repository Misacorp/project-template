#!/usr/bin/env node
// SessionStart hook: makes this checkout commit as the owner, so a squash merge on GitHub adds no
// "Co-authored-by" line for an agent identity (CLAUDE.md, Pull requests). Sets the repository-local
// user.name and user.email from project.config.json (owner.name, owner.commitEmail), or in the template
// itself from bootstrap/owner.json. Local config wins over the global one a cloud session sets, and
// worktrees share it. Does nothing without an email. Never fails the session.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** { name, email } from the project config, else the template's owner defaults, else null. */
export function identityFrom(projectConfig, templateOwner) {
  const fromProject = projectConfig?.owner;
  if (fromProject?.commitEmail) {
    return { name: fromProject.github || fromProject.name, email: fromProject.commitEmail };
  }
  if (templateOwner?.commitEmail) {
    return { name: templateOwner.github || templateOwner.name, email: templateOwner.commitEmail };
  }
  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw || '{}');
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const who = identityFrom(
    readJson(join(root, 'project.config.json')),
    readJson(join(root, 'bootstrap', 'owner.json')),
  );
  if (!who || !/^[^\s@<>]+@[^\s@<>]+$/.test(who.email)) return;
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const current = (key) => {
    try {
      return git('config', '--local', '--get', key).trim();
    } catch {
      return '';
    }
  };
  if (current('user.email') !== who.email) git('config', '--local', 'user.email', who.email);
  if (who.name && current('user.name') !== who.name)
    git('config', '--local', 'user.name', who.name);
}

if (process.argv[1]?.endsWith('git-identity.mjs')) {
  main().catch(() => {
    // A hook must never break the session.
  });
}
