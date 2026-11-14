const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HealthService } = require('../../dist/modules/health/business/services/health.service');
const config = { get: () => 5000 };

test('health requires connected database and a bounded successful ping', async () => {
  let called = false;
  const connection = { readyState: 1, db: { admin: () => ({ command: async (command, options) => {
    assert.deepEqual(command, { ping: 1 });
    assert.equal(options.timeoutMS, 2000);
    called = true;
  } }) } };
  const health = await new HealthService(connection, config).check();
  assert.equal(called, true);
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'up');
  assert.ok(Number.isFinite(Date.parse(health.timestamp)));
});
test('health reports sanitized 503 for disconnected and ping-failure states', async () => {
  for (const connection of [
    { readyState: 0 }, { readyState: 1 },
    { readyState: 1, db: { admin: () => ({ command: async () => { throw new Error('secret-host-and-password'); } }) } },
  ]) {
    await assert.rejects(new HealthService(connection, config).check(), error => {
      assert.equal(error.getStatus(), 503);
      assert.equal(error.getResponse().code, 'DATABASE_UNAVAILABLE');
      assert.deepEqual(error.getResponse().details, [{ status: 'error', database: 'down' }]);
      assert.doesNotMatch(JSON.stringify(error.getResponse()), /secret/);
      return true;
    });
  }
});
