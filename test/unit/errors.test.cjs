const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException, InternalServerErrorException, NotFoundException } = require('@nestjs/common');
const { Error: MongooseError, mongo } = require('mongoose');
const { ApiExceptionFilter } = require('../../dist/common/api-exception.filter');
function format(error) {
  let status, body;
  const response = { status(value) { status = value; return this; }, json(value) { body = value; } };
  new ApiExceptionFilter().catch(error, { switchToHttp: () => ({ getRequest: () => ({ url: '/api/example?token=secret' }), getResponse: () => response }) });
  assert.equal(status, body.statusCode);
  assert.equal(body.path, '/api/example');
  assert.ok(Number.isFinite(Date.parse(body.timestamp)));
  assert.ok('details' in body);
  assert.doesNotMatch(JSON.stringify(body), /secret|stack/);
  return body;
}
test('HTTP errors use stable codes and validation details', () => {
  assert.equal(format(new NotFoundException()).code, 'NOT_FOUND');
  const body = format(new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Request validation failed', details: [{ field: 'title' }] }));
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.details[0].field, 'title');
});
test('unexpected and HTTP 500 errors never expose internal messages', () => {
  for (const error of [new Error('secret'), new InternalServerErrorException('secret')]) {
    assert.equal(format(error).message, 'An unexpected error occurred');
  }
});
test('parser and database failures map to safe client errors', () => {
  assert.equal(format(Object.assign(new Error('secret'), { type: 'entity.too.large' })).statusCode, 413);
  assert.equal(format(Object.assign(new Error('secret'), { type: 'entity.parse.failed' })).code, 'INVALID_JSON');
  assert.equal(format(new MongooseError.CastError('ObjectId', 'secret', '_id')).statusCode, 400);
  assert.equal(format(new mongo.MongoServerError({ code: 11000, message: 'secret' })).statusCode, 409);
  assert.equal(format(new mongo.MongoNetworkError('secret')).statusCode, 503);
});
