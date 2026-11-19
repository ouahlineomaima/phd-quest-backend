const assert = require('node:assert/strict');
const { assertRuntime } = require('../../scripts/runtime.cjs');
const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
// Existing legacy namespaces remain explicit; arbitrary database names are refused.
const pattern =
  /^phd_quest_(?:(?:smoke|stage[1-4])|(?:phase[567]|focus|meetings|skills|links|camp|roadmap)_validation|(?:meetings|skills)_browser)_[a-f0-9]{32}$/;
const owners = new Map();
function disposableName(uri) {
  assertRuntime();
  assert.ok(uri, 'An explicit test MongoDB URI is required');
  const parsed = new URL(uri);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(
    ['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) &&
      pattern.test(name) &&
      !parsed.searchParams.has('dbName'),
    'Refusing non-disposable database',
  );
  assert.ok(
    !process.env.API_BASE_URL &&
      !process.env.PROGRESS_TEST_BASE_URL &&
      !process.env.RESEARCH_TEST_BASE_URL,
    'External application API overrides are forbidden',
  );
  return name;
}
async function reserveDatabase(uri) {
  const name = disposableName(uri);
  assert.ok(
    !owners.has(name),
    'Disposable target must be empty; an existing reservation cannot start another application',
  );
  const connection = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  try {
    assert.equal(connection.name, name);
    assert.equal(
      (await connection.db.listCollections().toArray()).length,
      0,
      'Disposable target must be empty before any application initialization',
    );
    const owner = randomUUID();
    await connection.collection('_test_owner').insertOne({ _id: owner });
    owners.set(name, { owner, uri });
  } finally {
    await connection.close();
  }
}
async function releaseDatabase(uri) {
  const name = disposableName(uri),
    entry = owners.get(name);
  if (!entry) return;
  assert.ok(entry.uri === uri, 'Cleanup connection must match the reservation');
  const connection = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  try {
    assert.equal(connection.name, name);
    assert.ok(
      await connection.collection('_test_owner').findOne({ _id: entry.owner }),
      'Ownership marker required before cleanup',
    );
    await connection.dropDatabase();
    owners.delete(name);
  } finally {
    await connection.close();
  }
}
async function verifyOwnedDatabase(uri) {
  const name = disposableName(uri),
    entry = owners.get(name);
  assert.ok(
    entry && entry.uri === uri,
    "An explicit restart requires this process's existing reservation",
  );
  const connection = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  try {
    assert.equal(connection.name, name);
    assert.ok(
      await connection.collection('_test_owner').findOne({ _id: entry.owner }),
      'Restart ownership proof required',
    );
  } finally {
    await connection.close();
  }
}
module.exports = { disposableName, reserveDatabase, releaseDatabase, verifyOwnedDatabase };
