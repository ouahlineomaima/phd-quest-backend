const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { validateEnvironment } = require('../../dist/config/environment');
const { databaseOptions } = require('../../dist/database/database.options');
const { ConfigService } = require('@nestjs/config');

test('rs0 supports atomic multi-collection rollback and commit', { timeout: 30000 }, async () => {
  const options = databaseOptions(new ConfigService(validateEnvironment(process.env)));
  const { uri, retryAttempts, retryDelay, verboseRetryLog, connectionErrorFactory, ...driverOptions } = options;
  const connection = await mongoose.createConnection(uri, driverOptions).asPromise();
  const database = connection.useDb('_foundation_validation');
  const suffix = randomUUID().replaceAll('-', '');
  const names = [`phase2_first_${suffix}`, `phase2_second_${suffix}`];
  const session = await connection.startSession();
  try {
    const first = await database.db.createCollection(names[0]);
    const second = await database.db.createCollection(names[1]);
    await assert.rejects(session.withTransaction(async () => {
      await first.insertOne({ marker: 'rollback' }, { session });
      await second.insertOne({ marker: 'rollback' }, { session });
      throw new Error('deliberate rollback');
    }), /deliberate rollback/);
    assert.equal(await first.countDocuments(), 0);
    assert.equal(await second.countDocuments(), 0);
    await session.withTransaction(async () => {
      await first.insertOne({ marker: 'commit' }, { session });
      await second.insertOne({ marker: 'commit' }, { session });
    });
    assert.equal(await first.countDocuments({ marker: 'commit' }), 1);
    assert.equal(await second.countDocuments({ marker: 'commit' }), 1);
  } finally {
    await session.endSession();
    // Only this test's unique collections are removed; application data is untouched.
    try {
      for (const name of names) await database.db.dropCollection(name).catch(error => { if (error.code !== 26) throw error; });
    } finally { await connection.close(); }
  }
});
