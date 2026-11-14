require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module, Controller, Post, Get, Body } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { IsString } = require('class-validator');
const { validateEnvironment } = require('../../dist/config/environment');
const { configureApi } = require('../../dist/common/configure-api');

// These routes exist only in the test process, never in AppModule.
class Input {}
IsString()(Input.prototype, 'title');
class ProbeController {
  submit(input) { return { title: input.title, transformed: input instanceof Input }; }
  fail() { throw new Error('database-secret-password'); }
}
Controller('probe')(ProbeController);
Post()(ProbeController.prototype, 'submit', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'submit'));
Body()(ProbeController.prototype, 'submit', 0);
Reflect.defineMetadata('design:paramtypes', [Input], ProbeController.prototype, 'submit');
Get('fail')(ProbeController.prototype, 'fail', Object.getOwnPropertyDescriptor(ProbeController.prototype, 'fail'));
class TestModule {}
Module({ controllers: [ProbeController] })(TestModule);

test('HTTP API conventions without external services', async t => {
  const app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
  t.after(() => app.close());
  configureApi(app, new ConfigService(validateEnvironment({ MONGODB_URI: 'mongodb://unused/test', BODY_LIMIT_BYTES: 1024 })));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const send = body => fetch(`${base}/api/probe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  await t.test('prefix, DTO transformation and CORS', async () => {
    const response = await fetch(`${base}/api/probe`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:4200' }, body: JSON.stringify({ title: 'valid' }) });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
    assert.deepEqual(await response.json(), { title: 'valid', transformed: true });
    const denied = await fetch(`${base}/api/probe/fail`, { headers: { origin: 'https://untrusted.example' } });
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });
  await t.test('unexpected fields are rejected safely', async () => {
    const response = await send(JSON.stringify({ title: 'valid', extra: 'private-value' }));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.equal(body.details[0].field, 'extra');
    assert.doesNotMatch(JSON.stringify(body), /private-value/);
  });
  await t.test('malformed JSON and oversized bodies use the global format', async () => {
    for (const [payload, status, code] of [['{"title":', 400, 'INVALID_JSON'], [JSON.stringify({ title: 'x'.repeat(2048) }), 413, 'PAYLOAD_TOO_LARGE']]) {
      const response = await send(payload);
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.code, code);
      assert.equal(body.path, '/api/probe');
      assert.ok(Number.isFinite(Date.parse(body.timestamp)));
    }
  });
  await t.test('missing routes and unexpected failures do not leak internals or queries', async () => {
    for (const [path, status, code] of [['/missing?token=sensitive', 404, 'NOT_FOUND'], ['/api/probe/fail?token=sensitive', 500, 'INTERNAL_ERROR']]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.code, code);
      assert.doesNotMatch(JSON.stringify(body), /database-secret-password|sensitive|stack/);
    }
  });
});
