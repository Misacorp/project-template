import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostsFrom, matchesExpected, parseConfig, pickTarget } from './deployed.mjs';

const SHA = 'a'.repeat(40);

test('reads only a plain branch name and a 40-character hex commit', () => {
  assert.deepEqual(parseConfig({ version: SHA, branch: 'claude/x_y.z' }), {
    version: SHA,
    branch: 'claude/x_y.z',
  });
  assert.deepEqual(parseConfig({ version: 'dev', branch: 'has space' }), {
    version: null,
    branch: null,
  });
  assert.deepEqual(parseConfig(null), { version: null, branch: null });
});

test('matches a commit when one was resolved, else a branch name', () => {
  const deployed = { version: SHA, branch: 'feature' };
  assert.equal(matchesExpected(deployed, undefined, null), true);
  assert.equal(matchesExpected(deployed, 'HEAD', SHA), true);
  assert.equal(matchesExpected(deployed, 'HEAD', 'b'.repeat(40)), false);
  assert.equal(matchesExpected(deployed, 'feature', null), true);
  assert.equal(matchesExpected(deployed, 'other', null), false);
  assert.equal(matchesExpected({ version: null, branch: null }, 'feature', null), false);
});

test('takes hosts only from plain https urls in the config', () => {
  const hosts = hostsFrom({
    environments: {
      production: { url: 'https://app.example.com' },
      staging: { url: 'https://app-staging.example.com' },
      odd: { url: 'https://evil.example.com/path?x' },
      none: {},
    },
  });
  assert.deepEqual(hosts, {
    production: 'https://app.example.com',
    staging: 'https://app-staging.example.com',
  });
  assert.deepEqual(hostsFrom(null), {});
});

test('picks staging by default, production without staging, and refuses unknown names', () => {
  const both = { production: 'https://a.example.com', staging: 'https://b.example.com' };
  assert.equal(pickTarget({}, both), 'staging');
  assert.equal(pickTarget({ prod: true }, both), 'production');
  assert.equal(pickTarget({}, { production: 'https://a.example.com' }), 'production');
  assert.throws(() => pickTarget({ env: 'qa' }, both), /no environment "qa"/);
});
