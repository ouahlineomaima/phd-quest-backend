// Every mutation targets only the random database owned by this check.
const assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto'),
  mongoose = require('mongoose');
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core'),
  { Module } = require('@nestjs/common'),
  { ConfigModule } = require('@nestjs/config');
const { DatabaseModule } = require('../../dist/database/database.module'),
  { BackupModule } = require('../../dist/modules/backup/backup.module'),
  { validateEnvironment } = require('../../dist/config/environment');
const load = (path, name) => require('../../dist/' + path)[name];
const Roadmap = load('modules/roadmap/business/services/roadmap.service', 'RoadmapService'),
  Repository = load(
    'modules/roadmap/persistence/repositories/roadmap.repository',
    'RoadmapRepository',
  ),
  Backup = load('modules/backup/business/services/backup.service', 'BackupService'),
  Goals = load('modules/goals/business/services/goals.service', 'GoalsService'),
  Importer = load(
    'modules/roadmap/business/services/roadmap-import.service',
    'RoadmapImportService',
  ),
  Achievements = load(
    'modules/achievements/business/services/achievements.service',
    'AchievementsService',
  );
const namespace = 'phd_quest_camp_validation_' + randomUUID().replaceAll('-', ''),
  uri = new URL(process.env.MONGODB_URI);
uri.pathname = '/' + namespace;
let app;
const create = async () => {
  class Owned {}
  Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => validateEnvironment({ ...process.env, MONGODB_URI: uri.toString() })],
      }),
      DatabaseModule,
      BackupModule,
    ],
  })(Owned);
  const server = await NestFactory.create(Owned, { logger: false, bodyParser: false });
  require('../../dist/common/configure-api').configureApi(
    server,
    server.get(require('@nestjs/config').ConfigService),
  );
  await server.listen(0, '127.0.0.1');
  return server;
};
(async () => {
  try {
    app = await create();
    const roadmap = app.get(Roadmap),
      backup = app.get(Backup),
      repo = app.get(Repository),
      goals = app.get(Goals),
      importer = app.get(Importer),
      connection = app.get(require('@nestjs/mongoose').getConnectionToken());
    const base = 'http://127.0.0.1:' + app.getHttpServer().address().port + '/api/roadmap/0';
    for (const body of [
      { title: ' ' },
      { title: 'x'.repeat(161) },
      { title: null },
      {},
      { unknown: 'x' },
    ]) {
      const response = await fetch(base, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    let response = await fetch(base, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'HTTP title update' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, 'HTTP title update');
    assert.equal((await roadmap.detail(0)).title, 'HTTP title update');
    let levels = await roadmap.list(),
      camp = levels.find((l) => l.levelNumber === 0);
    assert.equal(levels.length, 13);
    assert.equal(camp.year, null);
    assert.equal(camp.objectives.length, 5);
    assert.equal(camp.title, 'HTTP title update');
    assert.equal(camp.status, 'current');
    assert.ok(levels.slice(1).every((l) => l.status === 'locked'));
    await assert.rejects(roadmap.complete(0), (e) => e.getStatus() === 409);
    await assert.rejects(roadmap.complete(1), (e) => e.getStatus() === 409);
    await assert.rejects(
      roadmap.checkpoint(1, 'chapter-1-review', { completed: true }),
      (e) => e.getStatus() === 409,
    );
    const { createValidationPipe } = require('../../dist/common/validation'),
      { EditLevelDto } = require('../../dist/modules/roadmap/api/dtos/roadmap.dto');
    const validate = (body) =>
      createValidationPipe().transform(body, { type: 'body', metatype: EditLevelDto });
    for (const body of [
      { title: '' },
      { title: ' ' },
      { title: 'x'.repeat(161) },
      { title: null },
      { title: 1 },
      { description: null },
      { unsupported: 'x' },
    ])
      await assert.rejects(validate(body), (e) => e.getStatus() === 400);
    await validate({ title: 'New camp name' });
    await validate({ description: 'Description only' });
    await assert.rejects(roadmap.edit(0), (e) => e.getStatus() === 400);
    const originalCamp = await roadmap.detail(0);
    await roadmap.edit(0, undefined, '  My preparation chapter  ');
    camp = await roadmap.detail(0);
    assert.equal(camp.title, 'My preparation chapter');
    assert.deepEqual(camp.checkpoints, originalCamp.checkpoints);
    assert.equal(camp.status, 'current');
    await roadmap.edit(0, 'Description-only update');
    assert.equal((await roadmap.detail(0)).title, 'My preparation chapter');
    await roadmap.edit(1, undefined, 'Future research chapter');
    assert.equal((await roadmap.detail(1)).status, 'locked');
    const goal = await goals.create({
      title: 'Environment ready',
      type: 'research',
      relatedRoadmapLevel: 0,
    });
    await goals.transition(goal.id, 'complete');
    await roadmap.linkGoals(0, 'research-environment-ready', [goal.id]);
    assert.equal((await roadmap.detail(0)).checkpoints[0].progress.percentage, 100);
    assert.equal((await roadmap.detail(0)).checkpoints[0].completed, false);
    await roadmap.checkpoint(0, 'research-environment-ready', {
      completed: true,
      evidence: 'Workspace configured and subject agreed',
    });
    await Promise.all([roadmap.complete(0), roadmap.complete(0)]);
    assert.equal((await roadmap.detail(0)).status, 'completed');
    assert.equal((await roadmap.detail(1)).status, 'current');
    assert.ok((await roadmap.list()).slice(2).every((l) => l.status === 'locked'));
    assert.equal(
      (await app.get(Achievements).read()).find((a) => a.code === 'first_level').unlockedAt,
      null,
    );
    assert.equal(await connection.collection('xp_transactions').countDocuments(), 0);
    assert.equal(await connection.collection('daily_activity').countDocuments(), 0);
    let file = await backup.export();
    let preview = await backup.preview(file);
    await backup.restore({
      backup: file,
      digest: preview.digest,
      revision: preview.revision,
      confirmation: 'REPLACE ALL DATA',
    });
    assert.deepEqual((await backup.export()).data, file.data);
    for (const mutate of [
      (f) => (f.data.roadmapLevels.find((l) => l.levelNumber === 0).year = 1),
      (f) => (f.data.roadmapLevels.find((l) => l.levelNumber === 0).status = 'locked'),
      (f) =>
        (f.data.roadmapLevels.find((l) => l.levelNumber === 0).checkpoints[0].goalIds = [
          '0'.repeat(24),
        ]),
    ]) {
      const bad = structuredClone(file);
      mutate(bad);
      await assert.rejects(backup.preview(bad), (e) => e.getStatus() === 400);
    }
    // A legacy advanced workspace gains current camp; saved research history is retained while progression pauses.
    await roadmap.checkpoint(1, 'chapter-1-review', { completed: true });
    await roadmap.complete(1);
    await roadmap.checkpoint(2, 'chapter-2-review', {
      completed: true,
      evidence: 'Retain this already-recorded work',
    });
    await goals.edit(goal.id, { relatedRoadmapLevel: 1 });
    file = await backup.export();
    const legacy = structuredClone(file);
    legacy.data.roadmapLevels = legacy.data.roadmapLevels.filter((l) => l.levelNumber > 0);
    legacy.counts.roadmapLevels = 12;
    preview = await backup.preview(legacy);
    assert.equal(preview.preparationCampAdded, true);
    await backup.restore({
      backup: legacy,
      digest: preview.digest,
      revision: preview.revision,
      confirmation: 'REPLACE ALL DATA',
    });
    let after = await backup.export();
    for (const section of [
      'goals',
      'weeklyPlans',
      'xpTransactions',
      'dailyActivity',
      'achievements',
    ])
      assert.deepEqual(after.data[section], legacy.data[section]);
    for (const before of legacy.data.roadmapLevels) {
      const actual = after.data.roadmapLevels.find((l) => l.levelNumber === before.levelNumber);
      assert.deepEqual(actual, {
        ...before,
        status: before.status === 'current' ? 'locked' : before.status,
      });
    }
    assert.equal((await roadmap.detail(0)).status, 'current');
    assert.equal((await roadmap.detail(2)).status, 'locked');
    const invalidLegacy = structuredClone(legacy);
    invalidLegacy.data.goals[0].relatedRoadmapLevel = 0;
    await assert.rejects(backup.preview(invalidLegacy), (e) => e.getStatus() === 400);
    await roadmap.checkpoint(0, 'research-environment-ready', { completed: true });
    await roadmap.complete(0);
    assert.equal((await roadmap.detail(2)).status, 'current');
    assert.equal(
      (await roadmap.detail(2)).checkpoints[0].evidence,
      'Retain this already-recorded work',
    );
    // Exercise the additive startup upgrade and the former dual-current camp state.
    await connection.collection('roadmap_levels').deleteOne({ levelNumber: 0 });
    await Promise.all([repo.onModuleInit(), repo.onModuleInit()]);
    assert.equal((await roadmap.detail(0)).status, 'current');
    assert.equal((await roadmap.detail(2)).status, 'locked');
    await backup.export();
    await roadmap.checkpoint(0, 'research-environment-ready', { completed: true });
    await roadmap.complete(0);
    assert.equal((await roadmap.detail(2)).status, 'current');
    await repo.onModuleInit();
    assert.equal((await roadmap.detail(2)).status, 'current');
    const sample = require('../../docs/contracts/roadmap.v1.example.json'),
      oldSample = structuredClone(sample);
    oldSample.levels = oldSample.levels.filter((l) => l.levelNumber > 0);
    let p = await importer.preview(oldSample);
    assert.equal(p.totals.levels, 13);
    assert.equal((await importer.preview(sample)).digest, p.digest);
    await importer.confirm({
      roadmap: oldSample,
      digest: p.digest,
      revision: p.revision,
      confirmation: 'REPLACE ROADMAP',
    });
    assert.equal((await roadmap.detail(0)).status, 'current');
    assert.ok((await roadmap.list()).slice(1).every((l) => l.status === 'locked'));
    const beforeYearEdit = (await backup.export()).data,
      yearBase = base.replace('/0', '/years/');
    const staleYearPreview = await importer.preview(sample);
    for (const [year, body] of [
      [0, { title: 'Invalid' }],
      [4, { title: 'Invalid' }],
      [1, { title: '' }],
      [1, { title: ' ' }],
      [1, { title: null }],
      [1, { title: 'x'.repeat(161) }],
      [1, { title: 'Valid', extra: true }],
    ]) {
      const res = await fetch(yearBase + year, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 400);
    }
    for (let year = 1; year <= 3; year++) {
      const res = await fetch(yearBase + year, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '  Custom year ' + year + '  ' }),
      });
      assert.equal(res.status, 200);
      assert.equal(
        (await res.json()).find((level) => level.levelNumber === (year - 1) * 4 + 1).yearTitle,
        'Custom year ' + year,
      );
    }
    await assert.rejects(
      importer.confirm({
        roadmap: sample,
        digest: staleYearPreview.digest,
        revision: staleYearPreview.revision,
        confirmation: 'REPLACE ROADMAP',
      }),
      (e) => e.getStatus() === 409,
    );
    let yearBackup = await backup.export();
    for (const section of [
      'goals',
      'weeklyPlans',
      'xpTransactions',
      'dailyActivity',
      'achievements',
    ])
      assert.deepEqual(yearBackup.data[section], beforeYearEdit[section]);
    for (const row of yearBackup.data.roadmapLevels) {
      const { yearTitle, updatedAt, ...work } = row;
      const { updatedAt: oldUpdated, ...previous } = beforeYearEdit.roadmapLevels.find(
        (level) => level.levelNumber === row.levelNumber,
      );
      assert.deepEqual(work, previous);
    }
    for (const mutate of [
      (f) =>
        (f.data.roadmapLevels.find((level) => level.levelNumber === 0).yearTitle =
          'Invalid camp year'),
      (f) =>
        (f.data.roadmapLevels.find((level) => level.levelNumber === 2).yearTitle =
          'Invalid anchor'),
      (f) => (f.data.roadmapLevels.find((level) => level.levelNumber === 1).yearTitle = ''),
    ]) {
      const bad = structuredClone(yearBackup);
      mutate(bad);
      await assert.rejects(backup.preview(bad), (e) => e.getStatus() === 400);
    }
    preview = await backup.preview(yearBackup);
    await backup.restore({
      backup: yearBackup,
      digest: preview.digest,
      revision: preview.revision,
      confirmation: 'REPLACE ALL DATA',
    });
    assert.deepEqual((await backup.export()).data, yearBackup.data);
    const saved = (await backup.export()).data;
    await app.close();
    app = await create();
    assert.deepEqual((await app.get(Backup).export()).data, saved);
    console.log(
      'PASS Preparation Camp: single current chapter, manual gate/unlock, concurrent completion, validated title/description edits, preserved checkpoint identity/history, goal links, new/legacy backup restore, additive migration, resumed advanced work, imports, year-title HTTP validation, unchanged research work, year-title backup round-trip and restart persistence.',
    );
  } finally {
    if (app) await app.close();
    assert.match(namespace, /^phd_quest_camp_validation_[a-f0-9]{32}$/);
    const db = await mongoose.createConnection(uri.toString()).asPromise();
    assert.equal(db.name, namespace);
    await db.dropDatabase();
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
