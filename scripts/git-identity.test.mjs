import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identityFrom } from '../.claude/hooks/git-identity.mjs';

test('prefers the project config, then the template defaults', () => {
  const owner = { name: 'Sam', github: 'sam', commitEmail: '1+sam@users.noreply.github.com' };
  assert.deepEqual(identityFrom({ owner }, { github: 'x', commitEmail: 'x@y.z' }), {
    name: 'sam',
    email: '1+sam@users.noreply.github.com',
  });
  assert.deepEqual(identityFrom(null, { name: 'Misa', github: 'Misacorp', commitEmail: 'm@n.o' }), {
    name: 'Misacorp',
    email: 'm@n.o',
  });
});

test('gives nothing without an email', () => {
  assert.equal(identityFrom({ owner: { name: 'Sam', github: 'sam' } }, null), null);
  assert.equal(identityFrom(null, null), null);
});
