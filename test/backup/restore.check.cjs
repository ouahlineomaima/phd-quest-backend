const { reserveDatabase, releaseDatabase } = require('../safety/owned-database.cjs');
// All destructive checks are restricted to the two random namespaces created here.
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
const createOwned = async (uri) => {
  await reserveDatabase(uri);
  class OwnedApplication {}
  Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => validateEnvironment({ ...process.env, MONGODB_URI: uri })],
      }),
      DatabaseModule,
      BackupModule,
    ],
  })(OwnedApplication);
  return NestFactory.createApplicationContext(OwnedApplication, { logger: false });
};
const load = (path, name) => require('../../dist/' + path)[name];
const BackupService = load('modules/backup/business/services/backup.service', 'BackupService');
const BackupRepository = load(
  'modules/backup/persistence/repositories/backup.repository',
  'BackupRepository',
);
const WeeklyPlansService = load(
  'modules/weekly-plans/business/services/weekly-plans.service',
  'WeeklyPlansService',
);
const TaskProgressService = load(
  'modules/weekly-plans/business/services/task-progress.service',
  'TaskProgressService',
);
const GoalsService = load('modules/goals/business/services/goals.service', 'GoalsService');
const RoadmapService = load('modules/roadmap/business/services/roadmap.service', 'RoadmapService');
const AchievementsService = load(
  'modules/achievements/business/services/achievements.service',
  'AchievementsService',
);
const GamificationService = load(
  'modules/gamification/business/services/gamification.service',
  'GamificationService',
);
const ApplicationClock = load('common/application-clock', 'ApplicationClock');
const { sundayWeek } = require('../../dist/modules/dashboard/business/services/sunday-week');
const names = Array.from(
  { length: 2 },
  () => 'phd_quest_phase7_validation_' + randomUUID().replaceAll('-', ''),
);
const originalUri = process.env.MONGODB_URI;
const uris = names.map((name) => {
  const u = new URL(originalUri);
  u.pathname = '/' + name;
  return u.toString();
});
let source, target;
(async () => {
  try {
    source = await createOwned(uris[0]);
    const plans = source.get(WeeklyPlansService),
      tasks = source.get(TaskProgressService),
      goals = source.get(GoalsService),
      roadmap = source.get(RoadmapService),
      achievements = source.get(AchievementsService),
      gam = source.get(GamificationService),
      clock = source.get(ApplicationClock),
      backup = source.get(BackupService);
    const now = new Date(),
      today = clock.dateAt(now),
      week = sundayWeek(today),
      example = require('../../docs/contracts/weekly-plan.v1.example.json');
    const input = {
      ...structuredClone(example),
      weekId: week.weekId,
      startDate: week.startDate,
      endDate: week.endDate,
      title: 'Owned backup validation',
    };
    input.tasks = Array.from({ length: 10 }, (_, i) => ({
      ...example.tasks[0],
      id: 'backup-' + i,
      title: 'Backup task ' + i,
      date: today,
      estimatedMinutes: 30,
      xpReward: 10,
    }));
    const plan = await plans.confirm(input);
    const sourceDb = await mongoose.createConnection(uris[0]).asPromise();
    // Owned historical fixture: the plan existed before its seven days of task activity.
    const past = new Date(now);
    past.setUTCDate(past.getUTCDate() - 10);
    await sourceDb
      .collection('weekly_plans')
      .updateOne({ _id: new mongoose.Types.ObjectId(plan.id) }, { $set: { createdAt: past } });
    // Command-time awards now occur during the historical task transitions, so the
    // owned achievement definitions must also exist before that simulated history.
    await sourceDb.collection('achievements').updateMany({}, { $set: { createdAt: past } });
    await sourceDb.close();
    const realNow = clock.now.bind(clock);
    for (let i = 0; i < 10; i++) {
      const at = new Date(now);
      at.setUTCDate(at.getUTCDate() - 7 + Math.min(i, 6));
      clock.now = () => new Date(at);
      await tasks.change(plan.id, 'backup-' + i, 'complete', 5);
    }
    clock.now = realNow;
    await tasks.change(plan.id, 'backup-0', 'reopen');
    await roadmap.checkpoint(0, 'research-environment-ready', { completed: true });
    await roadmap.complete(0);
    await roadmap.checkpoint(1, 'chapter-1-review', {
      completed: true,
      evidence: 'Historical checkpoint evidence',
    });
    await roadmap.complete(1);
    await roadmap.checkpoint(2, 'chapter-2-review', { completed: true });
    await roadmap.checkpoint(2, 'chapter-2-review', { completed: false });
    const goal = await goals.create({
      title: 'Historical goal',
      type: 'research',
      relatedWeekId: week.weekId,
      relatedRoadmapLevel: 2,
    });
    await goals.transition(goal.id, 'complete');
    await goals.transition(goal.id, 'reopen');
    assert.equal((await achievements.read()).filter((a) => a.unlockedAt).length, 8);
    const saved = await backup.export();
    assert.equal(saved.counts.xpTransactions, 10);
    assert.equal(saved.counts.dailyActivity, 7);
    assert.equal(saved.settings.timezone, clock.timezone);
    assert.equal(JSON.stringify(saved).includes('MONGODB_URI'), false);
    assert.equal(JSON.stringify(saved).includes('"_id"'), false);
    const clean = JSON.stringify(saved.data);
    const preview = await backup.preview(saved);
    assert.equal(preview.policy, 'replace-all');
    for (const mutate of [
      (b) => delete b.data.goals,
      (b) => (b.schemaVersion = 99),
      (b) => b.data.weeklyPlans.push(b.data.weeklyPlans[0]),
      (b) => b.counts.goals++,
      (b) => b.data.xpTransactions[0].amount++,
      (b) => (b.data.xpTransactions[0].metadata.planId = '0'.repeat(24)),
      (b) => (b.data.dailyActivity[0].date = '2026-02-30'),
      (b) => (b.data.roadmapLevels[11].status = 'current'),
      (b) => (b.data.weeklyPlans[0].tasks[0].completedAt = 'not-a-date'),
      (b) => (b.data.goals[0].status = 'completed'),
      (b) => (b.settings.timezone = 'Etc/UTC'),
      (b) => (b.data.achievements[0].code = 'unknown'),
      (b) => (b.data.goals[0].$where = 'arbitrary'),
      (b) => (b.data.weeklyPlans[0].objectives = [' '.repeat(301) + 'x']),
      (b) => (b.data.weeklyPlans[0].tasks[0].deliverable = ' '.repeat(501) + 'x'),
    ]) {
      const bad = structuredClone(saved);
      mutate(bad);
      await assert.rejects(backup.preview(bad), (e) => e.getStatus() === 400);
      assert.equal(JSON.stringify((await backup.export()).data), clean);
    }
    target = await createOwned(uris[1]);
    const destination = target.get(BackupService),
      destinationRepo = target.get(BackupRepository),
      targetGoals = target.get(GoalsService);
    assert.equal((await destination.export()).counts.weeklyPlans, 0);
    let p = await destination.preview(saved);
    await destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' });
    assert.deepEqual((await destination.export()).data, saved.data);
    const summary = await target.get(GamificationService).summary();
    const sourceSummary = await gam.summary();
    delete summary.asOf;
    delete sourceSummary.asOf;
    assert.deepEqual(summary, sourceSummary);
    assert.equal(summary.totalXp, 100);
    assert.equal(summary.longestStreak, 7);
    assert.equal(
      (await target.get(AchievementsService).read()).filter((a) => a.unlockedAt).length,
      8,
    );
    await assert.rejects(
      destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' }),
      (e) => e.getStatus() === 409,
    );
    p = await destination.preview(saved);
    await targetGoals.edit(goal.id, { title: 'Original survives failures' });
    const original = (await destination.export()).data;
    await assert.rejects(
      destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' }),
      (e) => e.getStatus() === 409,
    );
    assert.deepEqual((await destination.export()).data, original);
    p = await destination.preview(saved);
    await assert.rejects(
      destination.restore({ backup: saved, ...p, confirmation: 'yes' }),
      (e) => e.getStatus() === 400,
    );
    const ready = destinationRepo.transactionReady.bind(destinationRepo);
    destinationRepo.transactionReady = async () => false;
    await assert.rejects(
      destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' }),
      (e) => e.getStatus() === 503,
    );
    destinationRepo.transactionReady = ready;
    assert.deepEqual((await destination.export()).data, original);
    const replace = destinationRepo.replace.bind(destinationRepo);
    destinationRepo.replace = async (...args) => {
      await replace(...args);
      throw new Error('Injected failure after all replacement writes');
    };
    await assert.rejects(
      destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' }),
      /Injected failure/,
    );
    destinationRepo.replace = replace;
    assert.deepEqual((await destination.export()).data, original);
    await destination.restore({ backup: saved, ...p, confirmation: 'REPLACE ALL DATA' });
    assert.deepEqual((await destination.export()).data, saved.data);
    const extra = {
      ...structuredClone(example),
      weekId: '2099-01-04',
      startDate: '2099-01-04',
      endDate: '2099-01-10',
      title: 'Target-only reference',
    };
    extra.tasks.forEach((t) => (t.date = extra.startDate));
    await target.get(WeeklyPlansService).confirm(extra);
    p = await destination.preview(saved);
    let entered, release;
    const started = new Promise((resolve) => (entered = resolve)),
      held = new Promise((resolve) => (release = resolve));
    destinationRepo.replace = async (...args) => {
      await replace(...args);
      entered();
      await held;
    };
    const restoring = destination.restore({
      backup: saved,
      ...p,
      confirmation: 'REPLACE ALL DATA',
    });
    await started;
    const linking = targetGoals
      .create({ title: 'Concurrent link', type: 'weekly', relatedWeekId: extra.weekId })
      .then(
        () => null,
        (e) => e,
      );
    release();
    await restoring;
    destinationRepo.replace = replace;
    assert.equal((await linking).getStatus(), 400);
    assert.deepEqual((await destination.export()).data, saved.data);
    const repeatTask = await target
      .get(TaskProgressService)
      .change(plan.id, 'backup-0', 'complete');
    assert.equal(repeatTask.xpAwarded, 0);
    assert.equal(repeatTask.gamification.totalXp, 100);
    console.log(
      'PASS backup: complete export; 15 invalid-file cases; fresh-install restore; stable IDs/timestamps; XP, streak, checkpoint and unlock history; explicit confirmation; stale/repeated requests; replica-set preflight; injected rollback; concurrent reference safety; task XP after restore.',
    );
  } finally {
    if (source) await source.close();
    if (target) await target.close();
    for (let i = 0; i < names.length; i++) {
      assert.match(names[i], /^phd_quest_phase7_validation_[a-f0-9]{32}$/);
      await releaseDatabase(uris[i]);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
