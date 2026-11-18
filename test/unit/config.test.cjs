const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvironment } = require('../../dist/config/environment');
const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/phd_quest?replicaSet=rs0&directConnection=true',
};

test('configuration defaults support host and Docker replica-set URIs', () => {
  const config = validateEnvironment(valid);
  assert.equal(config.PORT, 3000);
  assert.equal(config.NODE_ENV, 'development');
  assert.equal(config.BODY_LIMIT_BYTES, 1048576);
  assert.equal(
    validateEnvironment({ MONGODB_URI: 'mongodb://mongodb:27017/phd_quest?replicaSet=rs0' })
      .MONGO_RETRY_ATTEMPTS,
    3,
  );
});
test('configuration normalizes explicit settings', () => {
  const config = validateEnvironment({
    ...valid,
    PORT: '3001',
    NODE_ENV: 'test',
    CORS_ORIGINS: 'http://localhost:4200, https://example.com',
    MONGO_RETRY_ATTEMPTS: '0',
  });
  assert.equal(config.PORT, 3001);
  assert.equal(config.MONGO_RETRY_ATTEMPTS, 0);
  assert.equal(config.CORS_ORIGINS, 'http://localhost:4200,https://example.com');
});
for (const [key, values] of Object.entries({
  MONGODB_URI: ['', 'https://example.com', 'mongodb://', 'mongodb://host:abc/db'],
  PORT: ['', '0', '-1', '65536', '1.5', ' 3000 ', '3e3'],
  NODE_ENV: ['staging', ''],
  CORS_ORIGINS: [
    '',
    '*',
    'http://user:password@localhost:4200',
    'http://localhost:4200/path',
    'file:///tmp',
  ],
  BODY_LIMIT_BYTES: ['0', '10485761'],
  MONGO_CONNECT_TIMEOUT_MS: ['99', '60001'],
  MONGO_RETRY_ATTEMPTS: ['-1', '11'],
  MONGO_RETRY_DELAY_MS: ['-1', '30001'],
})) {
  test(`configuration rejects invalid ${key}`, () => {
    for (const value of values)
      assert.throws(() => validateEnvironment({ ...valid, [key]: value }), new RegExp(key));
  });
}
test('configuration aggregates safe errors without exposing secrets', () => {
  assert.throws(
    () => validateEnvironment({ MONGODB_URI: 'secret-password', PORT: 'bad' }),
    (error) => {
      assert.match(error.message, /MONGODB_URI/);
      assert.match(error.message, /PORT/);
      assert.doesNotMatch(error.message, /secret-password/);
      return true;
    },
  );
});
