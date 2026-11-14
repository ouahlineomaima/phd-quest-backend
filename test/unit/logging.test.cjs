const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { requestLogging } = require('../../dist/common/request-logging');

test('request logging records completed responses without query, header or body secrets', () => {
  const lines = [];
  const response = new EventEmitter();
  response.statusCode = 413;
  let nextCalled = false;
  requestLogging({ log: line => lines.push(line) })({ method: 'POST', url: '/api/example?token=secret', headers: { authorization: 'secret' }, body: { password: 'secret' } }, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(lines.length, 0);
  response.emit('finish');
  response.emit('finish');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.method, 'POST');
  assert.equal(entry.path, '/api/example');
  assert.equal(entry.statusCode, 413);
  assert.ok(entry.durationMs >= 0);
  assert.doesNotMatch(lines[0], /secret|authorization|password/);
});
