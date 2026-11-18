const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('real application startup fails fast and safely for invalid configuration', () => {
  const child = spawnSync(process.execPath, ['dist/main.js'], {
    env: { ...process.env, MONGODB_URI: 'sensitive-password', PORT: 'invalid', NODE_ENV: 'test' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(child.error, undefined);
  assert.notEqual(child.status, 0);
  const output = child.stdout + child.stderr;
  assert.match(output, /Invalid environment configuration/);
  assert.match(output, /MONGODB_URI/);
  assert.match(output, /PORT/);
  assert.doesNotMatch(output, /sensitive-password/);
});
