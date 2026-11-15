const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const mongoose = require('mongoose');
const {roadmapSchema} = require('../../dist/modules/roadmap/persistence/models/roadmap.model');
const {RoadmapRepository} = require('../../dist/modules/roadmap/persistence/repositories/roadmap.repository');
const {RoadmapService} = require('../../dist/modules/roadmap/business/services/roadmap.service');
(async () => {
 const namespace = 'phd_quest_phase6_validation_' + randomUUID().replaceAll('-', '');
 const uri = new URL(process.env.MONGODB_URI); uri.pathname = '/' + namespace;
 const connection = await mongoose.createConnection(uri.toString()).asPromise();
 try {
  const model = connection.model('RoadmapLevel', roadmapSchema);
  const repository = new RoadmapRepository(model, connection);
  await Promise.all([repository.onModuleInit(), repository.onModuleInit()]);
  const service = new RoadmapService(repository, {now: () => new Date()}, connection);
  assert.equal((await service.list()).length, 12);
  await assert.rejects(service.complete(2), e => e.getStatus() === 409);
  await assert.rejects(service.complete(1), e => e.getStatus() === 409);
  await assert.rejects(service.checkpoint(2, 'chapter-2-review', {completed:true}), e => e.getStatus() === 409);
  await service.edit(1, 'My provisional direction');
  await service.checkpoint(1, 'chapter-1-review', {completed:true,evidence:'Reviewed outcomes'});
  await service.checkpoint(1, 'chapter-1-review', {completed:false});
  assert.ok((await service.detail(1)).checkpoints[0].firstValidatedAt);
  await repository.onModuleInit();
  assert.equal((await service.detail(1)).description, 'My provisional direction');
  await assert.rejects(service.complete(1), e => e.getStatus() === 409);
  for (let number = 1; number <= 12; number++) {
   await service.checkpoint(number, `chapter-${number}-review`, {completed:true});
   await Promise.all([service.complete(number),service.complete(number)]);
  }
  assert.equal(await model.countDocuments(), 12);
  assert.equal((await service.list()).filter(l => l.status === 'completed').length,12);
  await assert.rejects(service.checkpoint(1, 'chapter-1-review', {completed:false}), e => e.getStatus() === 409);
  assert.equal(await connection.collection('xp_transactions').countDocuments(),0);
  console.log('PASS roadmap: concurrent seed, preserved edits, correction, locked levels, mandatory checks, concurrent completion, all 12 levels, no XP.');
 } finally {
  assert.equal(connection.name, namespace); assert.match(namespace,/^phd_quest_phase6_validation_[a-f0-9]{32}$/);
  await connection.dropDatabase(); await connection.close();
 }
})().catch(e => {console.error(e);process.exitCode=1});
