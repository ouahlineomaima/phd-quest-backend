const { reserveDatabase, releaseDatabase } = require('../safety/owned-database.cjs');
const assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  mongoose = require('mongoose');
const { goalSchema } = require('../../dist/modules/goals/persistence/models/goal.model');
const {
  GoalsRepository,
} = require('../../dist/modules/goals/persistence/repositories/goals.repository');
const { GoalsService } = require('../../dist/modules/goals/business/services/goals.service');
(async () => {
  const namespace = 'phd_quest_phase6_validation_' + randomUUID().replaceAll('-', '');
  const uri = new URL(process.env.MONGODB_URI);
  uri.pathname = '/' + namespace;
  const connection = await mongoose.createConnection(uri.toString()).asPromise();
  let verified = false;
  try {
    assert.equal(connection.name, namespace);
    assert.equal((await connection.db.listCollections().toArray()).length, 0);
    await reserveDatabase(uri.toString());
    verified = true;
    const model = connection.model('Goal', goalSchema),
      repository = new GoalsRepository(model, connection);
    await repository.onModuleInit();
    const service = new GoalsService(repository, { now: () => new Date() }, connection, {
      evaluateCurrent: async () => [],
    });
    await assert.rejects(
      service.create({ title: 'Invalid date', type: 'research', targetDate: '2026-02-30' }),
      (e) => e.getStatus() === 400,
    );
    await assert.rejects(
      service.create({ title: 'Missing plan', type: 'weekly', relatedWeekId: '2026-11-15' }),
      (e) => e.getStatus() === 400,
    );
    await assert.rejects(
      service.create({ title: 'Missing chapter', type: 'research', relatedRoadmapLevel: 1 }),
      (e) => e.getStatus() === 400,
    );
    const goal = await service.create({
      title: 'Independent goal',
      type: 'monthly',
      targetDate: '2026-12-31',
    });
    await service.edit(goal.id, { title: 'Edited goal', targetDate: null });
    assert.equal((await service.list({}))[0].title, 'Edited goal');
    const completed = await service.transition(goal.id, 'complete');
    assert.ok(completed.firstCompletedAt);
    const repeat = await service.transition(goal.id, 'complete');
    assert.deepEqual(repeat.completedAt, completed.completedAt);
    const reopened = await service.transition(goal.id, 'reopen');
    assert.equal(reopened.completedAt, null);
    assert.deepEqual(reopened.firstCompletedAt, completed.firstCompletedAt);
    await service.transition(goal.id, 'archive');
    await service.transition(goal.id, 'archive');
    await assert.rejects(service.transition(goal.id, 'reopen'), (e) => e.getStatus() === 409);
    await assert.rejects(
      service.edit(goal.id, { title: 'Overwrite' }),
      (e) => e.getStatus() === 409,
    );
    assert.equal((await service.list({ status: 'archived', type: 'monthly' })).length, 1);
    assert.equal(await connection.collection('xp_transactions').countDocuments(), 0);
    console.log(
      'PASS goals: date/reference validation, independent creation, edit, completion idempotency, reopen history, archive policy, filters, no XP.',
    );
  } finally {
    assert.equal(connection.name, namespace);
    assert.match(namespace, /^phd_quest_phase6_validation_[a-f0-9]{32}$/);
    if (verified) await releaseDatabase(uri.toString());
    await connection.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
