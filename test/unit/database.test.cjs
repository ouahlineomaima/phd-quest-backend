const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { validateEnvironment } = require('../../dist/config/environment');
const { databaseOptions } = require('../../dist/database/database.options');

test('database uses validated timeouts and retries and disables silent command buffering', () => {
  const config = validateEnvironment({ MONGODB_URI: 'mongodb://mongodb:27017/phd_quest?replicaSet=rs0', MONGO_CONNECT_TIMEOUT_MS: '800', MONGO_RETRY_ATTEMPTS: '2', MONGO_RETRY_DELAY_MS: '200' });
  const options = databaseOptions(new ConfigService(config));
  assert.equal(options.uri, config.MONGODB_URI);
  assert.equal(options.connectTimeoutMS, 800);
  assert.equal(options.serverSelectionTimeoutMS, 800);
  assert.equal(options.retryAttempts, 2);
  assert.equal(options.retryDelay, 200);
  assert.equal(options.bufferCommands, false);
  assert.equal(options.autoCreate, false);
  assert.match(options.connectionErrorFactory(new Error('secret')).message, /MongoDB connection failed/);
  assert.doesNotMatch(options.connectionErrorFactory(new Error('secret')).message, /secret/);
});
test('production disables automatic indexing', () => {
  const options = databaseOptions(new ConfigService(validateEnvironment({ MONGODB_URI: 'mongodb://unused/test', NODE_ENV: 'production' })));
  assert.equal(options.autoIndex, false);
});
