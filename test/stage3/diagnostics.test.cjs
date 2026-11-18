const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events'),
  path = require('node:path');
require('reflect-metadata');
const { requestLogging } = require('../../dist/common/request-logging'),
  { ApiExceptionFilter } = require('../../dist/common/api-exception.filter'),
  { safeErrorDiagnostic } = require('../../dist/common/safe-error-diagnostic');
const { BadRequestException, ConflictException, ForbiddenException } = require('@nestjs/common');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function harness(supplied) {
  const lines = [],
    response = new EventEmitter(),
    headers = {};
  response.statusCode = 500;
  response.setHeader = (name, value) => (headers[name] = value);
  const request = {
    headers: { 'x-request-id': supplied, authorization: 'PRIVATE_AUTH', cookie: 'PRIVATE_COOKIE' },
    method: 'POST',
    url: '/api/probe/private-research-title?token=PRIVATE_TOKEN',
    route: { path: '/api/probe/:id' },
    body: { notes: 'PRIVATE_NOTES' },
  };
  requestLogging({ log: (line) => lines.push(JSON.parse(line)) })(request, response, () => {});
  return { request, response, headers, lines };
}
test('request correlation is generated, returned and shared with safe completion logs', () => {
  const h = harness();
  assert.match(h.headers['X-Request-ID'], UUID);
  h.response.emit('finish');
  assert.equal(h.lines[0].requestId, h.headers['X-Request-ID']);
  assert.equal(h.lines[0].path, '/api/probe/:id');
  assert.ok(h.lines[0].durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(h.lines), /PRIVATE|private-research-title/);
});
test('only canonical client UUIDs are accepted; invalid identifiers never enter logs', () => {
  const accepted = '12345678-1234-4123-8123-123456789abc';
  assert.equal(harness(accepted).headers['X-Request-ID'], accepted);
  for (const id of [
    'PRIVATE_NOTES',
    'bad\nPRIVATE_TOKEN',
    ['PRIVATE_AUTH'],
    'x'.repeat(1000),
    'https://PRIVATE_TOKEN',
  ]) {
    const h = harness(id);
    assert.match(h.headers['X-Request-ID'], UUID);
    h.response.emit('finish');
    assert.doesNotMatch(JSON.stringify(h.lines), /PRIVATE/);
  }
});
test('unmatched routes never log attacker-controlled path segments', () => {
  const h = harness();
  delete h.request.route;
  h.response.emit('finish');
  assert.equal(h.lines[0].path, '/[unmatched]');
  assert.doesNotMatch(JSON.stringify(h.lines), /PRIVATE|private-research-title/);
});
function format(error) {
  const h = harness(),
    errors = [];
  let body;
  h.response.status = (code) => {
    h.response.statusCode = code;
    return h.response;
  };
  h.response.json = (value) => (body = value);
  new ApiExceptionFilter({ error: (line) => errors.push(JSON.parse(line)) }).catch(error, {
    switchToHttp: () => ({ getRequest: () => h.request, getResponse: () => h.response }),
  });
  h.response.emit('finish');
  return { ...h, body, errors };
}
test('unexpected diagnostics keep safe code locations and cause categories but omit messages/content', () => {
  const cause = new Error('mongodb://PRIVATE_AUTH:PRIVATE_TOKEN@private/database');
  const error = new TypeError('PRIVATE_NOTES', { cause });
  error.stack =
    'TypeError: PRIVATE_NOTES\n at sensitiveFunction (' +
    path.resolve(__dirname, '../../src/common/api-exception.filter.ts') +
    ':1:1)\n at arbitrary (/private/PRIVATE_COOKIE.js:1:1)';
  const h = format(error);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].requestId, h.headers['X-Request-ID']);
  assert.equal(h.errors[0].requestId, h.lines[0].requestId);
  assert.equal(h.errors[0].category, 'UnexpectedError');
  assert.equal(h.errors[0].diagnostic.type, 'TypeError');
  assert.deepEqual(h.errors[0].diagnostic.frames, ['src/common/api-exception.filter.ts:1:1']);
  assert.equal(h.errors[0].diagnostic.cause.type, 'Error');
  assert.equal(h.body.message, 'An unexpected error occurred');
  assert.equal(h.body.statusCode, 500);
  assert.doesNotMatch(
    JSON.stringify(h.errors),
    /PRIVATE|mongodb:|sensitiveFunction|private-research-title/,
  );
  assert.doesNotMatch(JSON.stringify(h.body), /PRIVATE|stack|diagnostic|requestId/);
});
test('validation, stale-record and origin errors keep their public semantics without internal-error logs', () => {
  for (const error of [
    new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Check title',
      details: [{ field: 'title' }],
    }),
    new ConflictException({
      code: 'STALE_RECORD',
      message: 'Changed elsewhere',
      details: { currentVersion: 'current' },
    }),
    new ForbiddenException({ code: 'UNTRUSTED_ORIGIN', message: 'Origin rejected' }),
  ]) {
    const h = format(error);
    assert.equal(h.body.statusCode, error.getStatus());
    assert.equal(h.body.code, error.getResponse().code);
    assert.deepEqual(h.errors, []);
    assert.match(h.headers['X-Request-ID'], UUID);
  }
});
test('cyclic/hostile causes cannot leak content or prevent a sanitized response', () => {
  const error = new Error('PRIVATE_NOTES');
  error.cause = error;
  assert.ok(JSON.stringify(safeErrorDiagnostic(error)).length < 10000);
  const hostile = new Error('PRIVATE_TOKEN');
  Object.defineProperty(hostile, 'cause', {
    get() {
      throw new Error('PRIVATE_NOTES');
    },
  });
  assert.deepEqual(safeErrorDiagnostic(hostile), { type: 'Error', frames: [] });
  assert.equal(format(hostile).body.statusCode, 500);
});
test('real HTTP failures expose the same safe request ID as exactly one diagnostic log', async () => {
  const { Module, Controller, Post, Body } = require('@nestjs/common'),
    { NestFactory } = require('@nestjs/core'),
    { ConfigService } = require('@nestjs/config'),
    { IsString } = require('class-validator'),
    { configureApi } = require('../../dist/common/configure-api'),
    { validateEnvironment } = require('../../dist/config/environment');
  class Input {}
  IsString()(Input.prototype, 'title');
  class Probe {
    submit(input) {
      throw new Error(input.title, { cause: new Error('PRIVATE_DB_SECRET') });
    }
  }
  Controller('probe')(Probe);
  Post()(Probe.prototype, 'submit', Object.getOwnPropertyDescriptor(Probe.prototype, 'submit'));
  Body()(Probe.prototype, 'submit', 0);
  Reflect.defineMetadata('design:paramtypes', [Input], Probe.prototype, 'submit');
  class Owned {}
  Module({ controllers: [Probe] })(Owned);
  const errors = [],
    app = await NestFactory.create(Owned, { bodyParser: false, logger: false });
  try {
    configureApi(
      app,
      new ConfigService(validateEnvironment({ MONGODB_URI: 'mongodb://unused/test' })),
    );
    app.useGlobalFilters(
      new ApiExceptionFilter({ error: (line) => errors.push(JSON.parse(line)) }),
    );
    await app.listen(0, '127.0.0.1');
    const response = await fetch((await app.getUrl()) + '/api/probe?token=PRIVATE_QUERY', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:4200',
        'x-request-id': '12345678-1234-4123-8123-123456789abc',
      },
      body: JSON.stringify({ title: 'PRIVATE_RESEARCH_NOTES' }),
    });
    assert.equal(response.status, 500);
    assert.match(response.headers.get('x-request-id'), UUID);
    assert.match(response.headers.get('access-control-expose-headers'), /x-request-id/i);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].requestId, response.headers.get('x-request-id'));
    assert.equal(errors[0].path, '/api/probe');
    assert.doesNotMatch(JSON.stringify(errors), /PRIVATE/);
    assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE|stack/);
  } finally {
    await app.close();
  }
});
