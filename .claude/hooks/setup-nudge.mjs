#!/usr/bin/env node
// SessionStart hook (matcher "startup"): while docs/setup.md has open boxes, reminds Claude to raise the
// owner's one-time setup steps. It only adds context; it never blocks. Silent in the template itself
// (bootstrap/ is there) and once every box is ticked.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += String(chunk);
  const input = JSON.parse(raw || '{}');
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const file = join(root, 'docs', 'setup.md');
  if (existsSync(file) && !existsSync(join(root, 'bootstrap', 'init.mjs'))) {
    const open = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => /^\s*- \[ \]/.test(line))
      .map(
        (line) =>
          line
            .replace(/^\s*- \[ \]\s*/, '')
            .replace(/\*\*/g, '')
            .split('.')[0],
      );
    if (open.length) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: [
              'Setup reminder (from the setup-nudge hook, not from the owner):',
              `docs/setup.md has ${open.length} open one-time step(s): ${open.join('; ')}.`,
              'Read docs/setup.md, check what you can verify yourself, and raise the rest with the owner once,',
              'as one numbered list, early in the session. Tick confirmed steps in your next PR.',
            ].join(' '),
          },
        }),
      );
    }
  }
} catch {
  // A hook must never break the session.
}
