require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { HealthService } = require('../../dist/modules/health/business/services/health.service');
const { HealthController } = require('../../dist/modules/health/api/controllers/health.controller');
const { configureApi } = require('../../dist/common/configure-api');
const { validateEnvironment } = require('../../dist/config/environment');

test('health endpoint reports success and database failure without external services', async t => {
  const config = new ConfigService(validateEnvironment({ MONGODB_URI: 'mongodb://unused/test' }));
  let failing = false;
  const connection = { readyState: 1, db: { admin: () => ({ command: async () => { if (failing) throw new Error('secret'); } }) } };
  class TestModule {}
  Module({ controllers: [HealthController], providers: [{ provide: HealthService, useFactory: () => new HealthService(connection, config) }] })(TestModule);
  const app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
  t.after(() => app.close());
  configureApi(app, config);
  await app.listen(0, '127.0.0.1');
  const url = `${await app.getUrl()}/api/health`;
  const healthy = await fetch(url);
  assert.equal(healthy.status, 200);
  const body = await healthy.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'up');
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  failing = true;
  const unhealthy = await fetch(url);
  assert.equal(unhealthy.status, 503);
  const failure = await unhealthy.json();
  assert.equal(failure.code, 'DATABASE_UNAVAILABLE');
  assert.deepEqual(failure.details, [{ status: 'error', database: 'down' }]);
  assert.ok(Number.isFinite(Date.parse(failure.timestamp)));
  assert.doesNotMatch(JSON.stringify(failure), /secret|stack/);
});
