const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { isolated } = require('../safety/isolated.cjs');
const load = (file, name) => require('../../dist/' + file)[name];
test('integrated task timer lifecycle, security, application and backup invariants', async (t) => {
  let own, restored;
  const originalNow = mongoose.now;
  try {
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/phd_quest_stage4_' + randomUUID().replaceAll('-', '');
    own = await isolated(uri.toString(), { CORS_ORIGINS: 'http://localhost:4200' });
    const clock = own.app.get(load('common/application-clock', 'ApplicationClock'));
    let now = Date.now() - 8 * 3600000;
    clock.now = () => new Date(now);
    mongoose.now = () => new Date(now);
    const plans = own.app.get(
      load('modules/weekly-plans/business/services/weekly-plans.service', 'WeeklyPlansService'),
    );
    const tasks = own.app.get(
      load('modules/weekly-plans/business/services/task-progress.service', 'TaskProgressService'),
    );
    const backup = own.app.get(
      load('modules/backup/business/services/backup.service', 'BackupService'),
    );
    const example = require('../../docs/contracts/weekly-plan.v1.example.json');
    const week = {
      ...structuredClone(example),
      weekId: '2026-11-22',
      startDate: '2026-11-22',
      endDate: '2026-11-28',
      tasks: ['pending', 'complete', 'missing'].map((id) => ({
        ...example.tasks[0],
        id,
        date: '2026-11-22',
      })),
    };
    await own.connection
      .collection('achievements')
      .updateMany({}, { $set: { createdAt: new Date(now - 1000) } });
    const plan = await plans.confirm(week);
    await tasks.change(plan.id, 'complete', 'complete', 7);
    const xp = await own.connection.collection('xp_transactions').find().toArray();
    const ref = week.weekId + ':pending';
    const call = async (path, body, version, status = body === undefined ? 200 : 201, origin) => {
      const response = await fetch(own.base + '/focus-sessions' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          ...(version ? { 'if-match': '"' + version + '"' } : {}),
          ...(origin ? { origin } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      return value;
    };
    const startBody = (taskRef = ref) => ({
      sessionId: randomUUID(),
      ownerId: randomUUID(),
      kind: 'focus',
      mode: 'stopwatch',
      targetSeconds: null,
      taskRef,
    });
    let active, stopped;
    await t.test('task-linked start and retry reuse a single authoritative session', async () => {
      const input = startBody();
      active = await call('/start', input);
      assert.equal((await call('/start', input)).sessionId, active.sessionId);
      assert.equal(active.taskTitle, week.tasks[0].title);
      await call('/start', startBody(), undefined, 409);
    });
    await t.test('a persistence constraint prevents a second active slot', async () => {
      const original = await own.connection
        .collection('focus_sessions')
        .findOne({ sessionId: active.sessionId });
      delete original._id;
      original.sessionId = randomUUID();
      await assert.rejects(own.connection.collection('focus_sessions').insertOne(original), {
        code: 11000,
      });
    });
    await t.test(
      'heartbeats confirm server time and reject replay or wrong ownership',
      async () => {
        now += 15000;
        const heartbeat = {
          ownerId: active.ownerId,
          ownerToken: active.ownerToken,
          sequence: 1,
          activity: false,
        };
        active = await call('/' + active.sessionId + '/heartbeat', heartbeat);
        assert.equal(active.focusedSeconds, 15);
        await call('/' + active.sessionId + '/heartbeat', heartbeat, undefined, 409);
        await call(
          '/' + active.sessionId + '/heartbeat',
          { ...heartbeat, sequence: 2, ownerId: randomUUID() },
          undefined,
          409,
        );
      },
    );
    await t.test('pause, repeated pause and resume exclude paused intervals', async () => {
      now += 5500;
      const previous = active.editVersion;
      active = await call('/' + active.sessionId + '/pause', {}, previous);
      assert.equal(active.confirmedMilliseconds, 20500);
      assert.equal(
        (await call('/' + active.sessionId + '/pause', {}, previous)).confirmedMilliseconds,
        20500,
      );
      now += 60000;
      active = await call(
        '/' + active.sessionId + '/resume',
        { ownerId: randomUUID() },
        active.editVersion,
      );
      assert.equal(active.confirmedMilliseconds, 20500);
    });
    await t.test(
      'multi-tab ownership handoff invalidates the old token and stale commands',
      async () => {
        const previous = active;
        now += 1000;
        active = await call(
          '/' + active.sessionId + '/claim',
          { ownerId: randomUUID() },
          active.editVersion,
        );
        await call(
          '/' + active.sessionId + '/heartbeat',
          {
            ownerId: previous.ownerId,
            ownerToken: previous.ownerToken,
            sequence: 1,
            activity: true,
          },
          undefined,
          409,
        );
        await call('/' + active.sessionId + '/pause', {}, previous.editVersion, 409);
      },
    );
    await t.test(
      'three hours without clients or heartbeats remain running; GET and reconciliation never pause',
      async () => {
        now += 3 * 3600000;
        const revision = await own.connection
          .collection('_application_control')
          .findOne({ _id: 'writes' });
        const current = await call('/current');
        assert.equal(current.state, 'running');
        assert.equal(current.recovered, false);
        assert.equal(current.elapsedMilliseconds, active.confirmedMilliseconds + 3 * 3600000);
        assert.deepEqual(
          await own.connection.collection('_application_control').findOne({ _id: 'writes' }),
          revision,
        );
        active = await call('/' + active.sessionId + '/heartbeat', {
          ownerId: active.ownerId,
          ownerToken: active.ownerToken,
          sequence: 1,
          activity: true,
        });
        active = await call('/' + active.sessionId + '/reconcile', {}, active.editVersion);
        assert.equal(active.state, 'running');
      },
    );
    await t.test(
      'only explicit pause/resume/stop finalize time; concurrent commands do not double count',
      async () => {
        now += 2000;
        const paused = await Promise.all([
          call('/' + active.sessionId + '/pause', {}, active.editVersion),
          call('/' + active.sessionId + '/pause', {}, active.editVersion),
        ]);
        active = paused[0];
        assert.equal(active.confirmedMilliseconds, paused[1].confirmedMilliseconds);
        now += 600000;
        assert.equal((await call('/current')).elapsedMilliseconds, active.confirmedMilliseconds);
        active = await call(
          '/' + active.sessionId + '/resume',
          { ownerId: randomUUID() },
          active.editVersion,
        );
        now += 2000;
        const result = await Promise.all([
          call('/' + active.sessionId + '/stop', {}, active.editVersion),
          call('/' + active.sessionId + '/stop', {}, active.editVersion),
        ]);
        stopped = result[0];
        assert.equal(stopped.focusedSeconds, result[1].focusedSeconds);
        assert.equal(await call('/current'), null);
        assert.equal((await plans.detail(plan.id)).tasks[0].actualMinutes, 0);
        await call(
          '/' + stopped.sessionId + '/resume',
          { ownerId: randomUUID() },
          stopped.editVersion,
          409,
        );
      },
    );
    await t.test(
      'correction validates strict numbers and never changes measured time',
      async () => {
        for (const value of [-1, 1.5, '3', null, 1441])
          await call(
            '/' + stopped.sessionId + '/correction',
            { effectiveMinutes: value },
            stopped.editVersion,
            400,
          );
        await call(
          '/' + stopped.sessionId + '/correction',
          { effectiveMinutes: 3 },
          undefined,
          428,
        );
        const saved = await call(
          '/' + stopped.sessionId + '/correction',
          { effectiveMinutes: 3 },
          stopped.editVersion,
        );
        assert.equal(saved.focusedSeconds, stopped.focusedSeconds);
        assert.equal(saved.effectiveSeconds, 180);
        stopped = saved;
      },
    );
    await t.test('concurrent corrected applications add actual minutes exactly once', async () => {
      const input = { confirm: true, effectiveMinutes: 3, expectedActualMinutes: 0 };
      const applied = await Promise.all(
        Array.from({ length: 5 }, () =>
          call('/' + stopped.sessionId + '/apply-time', input, stopped.editVersion),
        ),
      );
      assert.ok(applied.every((s) => s.appliedMinutes === 3));
      assert.equal(applied[0].actualMinutesBefore, 0);
      assert.equal(applied[0].actualMinutesAfter, 3);
      assert.equal((await plans.detail(plan.id)).tasks[0].actualMinutes, 3);
      await call(
        '/' + stopped.sessionId + '/correction',
        { effectiveMinutes: 5 },
        applied[0].editVersion,
        409,
      );
    });
    await t.test(
      'later manual edits preserve application provenance and retries do not add again',
      async () => {
        await tasks.change(plan.id, 'complete', 'reopen');
        await tasks.change(plan.id, 'complete', 'complete', 50);
        active = await call('/start', startBody(week.weekId + ':complete'));
        now += 1000;
        let s = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        await call(
          '/' + s.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 2, expectedActualMinutes: 50 },
          s.editVersion,
        );
        await tasks.change(plan.id, 'complete', 'reopen');
        await tasks.change(plan.id, 'complete', 'complete', 12);
        await call(
          '/' + s.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 2 },
          s.editVersion,
        );
        assert.equal((await plans.detail(plan.id)).tasks[1].actualMinutes, 12);
      },
    );
    await t.test(
      'multiple short sessions use deterministic whole minutes including zero',
      async () => {
        for (const minutes of [0, 2]) {
          active = await call('/start', startBody());
          now += 1000;
          const s = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
          await call(
            '/' + s.sessionId + '/apply-time',
            { confirm: true, effectiveMinutes: minutes },
            s.editVersion,
          );
        }
        assert.equal((await plans.detail(plan.id)).tasks[0].actualMinutes, 5);
      },
    );
    await t.test(
      'missing references preserve sessions and cannot be relinked by title',
      async () => {
        active = await call('/start', startBody(week.weekId + ':missing'));
        now += 1000;
        const s = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        await own.connection
          .collection('weekly_plans')
          .updateOne({ weekId: week.weekId }, { $pull: { tasks: { id: 'missing' } } });
        assert.equal((await call('/' + s.sessionId + '/application-preview')).task, null);
        await call(
          '/' + s.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 1 },
          s.editVersion,
          409,
        );
      },
    );
    await t.test(
      'concurrent starts produce one winner; standalone stop stays separate',
      async () => {
        const results = await Promise.allSettled([
          call('/start', startBody(null)),
          call('/start', startBody(null)),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        active = await call('/current');
        now += 1000;
        const s = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        await call(
          '/' + s.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 1 },
          s.editVersion,
          409,
        );
      },
    );
    await t.test('trusted-origin JSON and If-Match boundaries remain enforced', async () => {
      await call('/start', startBody(), undefined, 403, 'https://untrusted.invalid');
      active = await call('/start', startBody(), undefined, 201, 'http://localhost:4200');
      await call(
        '/' + active.sessionId + '/pause',
        {},
        active.editVersion,
        400,
        'http://localhost:4200',
      );
      assert.equal((await call('/current')).state, 'running');
      await call('/' + active.sessionId + '/pause', {}, undefined, 428);
      await call('/' + active.sessionId + '/stop', {}, active.editVersion);
    });
    await t.test(
      'ten minutes in another tab and thirty minutes of inactivity never expire the timer',
      async () => {
        active = await call('/start', startBody(null));
        now += 600000;
        assert.equal((await call('/current')).elapsedMilliseconds, 600000);
        now += 1200000;
        assert.equal((await call('/current')).elapsedMilliseconds, 1800000);
        active = await call('/' + active.sessionId + '/heartbeat', {
          ownerId: active.ownerId,
          ownerToken: active.ownerToken,
          sequence: 1,
          activity: false,
        });
        assert.equal(active.state, 'running');
        assert.equal(active.elapsedMilliseconds, 1800000);
        await call('/' + active.sessionId + '/stop', {}, active.editVersion);
      },
    );
    await t.test(
      'legacy lease metadata is ignored; previously paused sessions never silently resume',
      async () => {
        active = await call('/start', startBody(null));
        const heartbeat = new Date(active.lastHeartbeatAt);
        await own.connection.collection('focus_sessions').updateOne(
          { sessionId: active.sessionId },
          {
            $unset: { timerPolicy: 1 },
            $set: {
              leaseUntil: new Date(+heartbeat + 45000),
              activityUntil: new Date(+heartbeat + 300000),
            },
          },
        );
        now += 3 * 3600000;
        const current = await call('/current');
        assert.equal(current.state, 'running');
        assert.equal(current.elapsedMilliseconds, 10800000);
        active = await call('/' + active.sessionId + '/pause', {}, active.editVersion);
        await own.connection
          .collection('focus_sessions')
          .updateOne(
            { sessionId: active.sessionId },
            { $unset: { timerPolicy: 1 }, $set: { recovered: true } },
          );
        now += 600000;
        assert.equal((await call('/current')).state, 'paused');
        assert.equal((await call('/current')).elapsedMilliseconds, 10800000);
        await call('/' + active.sessionId + '/stop', {}, active.editVersion);
      },
    );
    await t.test(
      'countdown targets require explicit stop and preserve overtime without applying time',
      async () => {
        active = await call('/start', { ...startBody(), mode: 'countdown', targetSeconds: 60 });
        for (let i = 1; i <= 4; i++) {
          now += 15000;
          active = await call('/' + active.sessionId + '/heartbeat', {
            ownerId: active.ownerId,
            ownerToken: active.ownerToken,
            sequence: i,
            activity: true,
          });
        }
        assert.equal(active.state, 'running');
        now += 60000;
        active = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        assert.equal(active.focusedSeconds, 120);
        assert.equal(active.completionType, 'target-reached');
        assert.equal((await plans.detail(plan.id)).tasks[0].actualMinutes, 5);
      },
    );
    await t.test(
      'an intervening manual task edit conflicts with the preview rather than overwriting it',
      async () => {
        active = await call('/start', startBody(week.weekId + ':complete'));
        now += 1000;
        const s = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        await tasks.change(plan.id, 'complete', 'reopen');
        await tasks.change(plan.id, 'complete', 'complete', 13);
        await call(
          '/' + s.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 2, expectedActualMinutes: 12 },
          s.editVersion,
          409,
        );
        assert.equal((await plans.detail(plan.id)).tasks[1].actualMinutes, 13);
      },
    );
    await t.test(
      'a fifteen-minute break stays running until explicit stop and remains outside focus history',
      async () => {
        const history = await call('');
        active = await call('/start', {
          ...startBody(null),
          kind: 'break',
          mode: 'countdown',
          targetSeconds: 900,
        });
        for (let i = 1; i <= 60; i++) {
          now += 15000;
          active = await call('/' + active.sessionId + '/heartbeat', {
            ownerId: active.ownerId,
            ownerToken: active.ownerToken,
            sequence: i,
            activity: false,
          });
        }
        assert.equal(active.state, 'running');
        active = await call('/' + active.sessionId + '/stop', {}, active.editVersion);
        assert.equal(active.focusedSeconds, 900);
        assert.equal((await call('')).total, history.total);
        await call(
          '/' + active.sessionId + '/apply-time',
          { confirm: true, effectiveMinutes: 15 },
          active.editVersion,
          409,
        );
      },
    );
    await t.test(
      'v1 backups preserve manual running anchors, applied status and fresh tokens; old backups remain compatible',
      async () => {
        active = await call('/start', startBody());
        now += 15000;
        active = await call('/' + active.sessionId + '/heartbeat', {
          ownerId: active.ownerId,
          ownerToken: active.ownerToken,
          sequence: 1,
          activity: false,
        });
        now = Date.now();
        const saved = await backup.export();
        for (const mutate of [
          (rows) => {
            rows.find((r) => r.activeSlot).ownerToken = 'invalid';
          },
          (rows) => {
            rows.find((r) => r.activeSlot).leaseUntil = new Date(
              Date.now() + 86400000,
            ).toISOString();
          },
          (rows) => {
            rows.find((r) => r.sessionId === stopped.sessionId).actualMinutesAfter = 4;
          },
          (rows) => {
            rows.find((r) => r.sessionId === stopped.sessionId).effectiveSeconds = 181;
          },
          (rows) => {
            const r = rows.find((r) => r.activeSlot);
            delete r.state;
          },
        ]) {
          const invalid = structuredClone(saved);
          mutate(invalid.data.focusSessions);
          await assert.rejects(backup.preview(invalid));
        }
        const uri2 = new URL(process.env.MONGODB_URI);
        uri2.pathname = '/phd_quest_stage4_' + randomUUID().replaceAll('-', '');
        restored = await isolated(uri2.toString());
        const targetBackup = restored.app.get(
          load('modules/backup/business/services/backup.service', 'BackupService'),
        );
        const preview = await targetBackup.preview(saved);
        await targetBackup.restore({
          backup: saved,
          digest: preview.digest,
          revision: preview.revision,
          confirmation: 'REPLACE ALL DATA',
        });
        const current = await restored.connection
          .collection('focus_sessions')
          .findOne({ activeSlot: 'workspace' });
        assert.equal(current.state, 'running');
        assert.equal(current.intervalStartedAt.toISOString(), active.intervalStartedAt);
        assert.equal(current.confirmedMilliseconds, active.confirmedMilliseconds);
        assert.equal(current.ownerToken, null);
        assert.notEqual(current.editVersion, active.editVersion);
        const lifecycle = restored.app.get(
          load(
            'modules/focus-sessions/business/services/focus-lifecycle.service',
            'FocusLifecycleService',
          ),
        );
        await assert.rejects(
          lifecycle.command(
            active.sessionId,
            'pause',
            '"' + active.editVersion + '"',
            randomUUID(),
          ),
          /changed in another/,
        );
        const roundtrip = await targetBackup.export();
        const BackupRepository = load(
          'modules/backup/persistence/repositories/backup.repository',
          'BackupRepository',
        );
        const repository = restored.app.get(BackupRepository),
          originalReplace = repository.replace.bind(repository);
        const beforeRollback = await restored.connection
          .collection('focus_sessions')
          .find()
          .sort({ sessionId: 1 })
          .toArray();
        const retryPreview = await targetBackup.preview(saved);
        repository.replace = async (...args) => {
          await originalReplace(...args);
          throw new Error('Injected timer restore rollback');
        };
        try {
          await assert.rejects(
            targetBackup.restore({
              backup: saved,
              digest: retryPreview.digest,
              revision: retryPreview.revision,
              confirmation: 'REPLACE ALL DATA',
            }),
            /Injected timer restore rollback/,
          );
        } finally {
          repository.replace = originalReplace;
        }
        assert.deepEqual(
          await restored.connection
            .collection('focus_sessions')
            .find()
            .sort({ sessionId: 1 })
            .toArray(),
          beforeRollback,
        );
        const focusService = restored.app.get(
          load(
            'modules/focus-sessions/business/services/focus-sessions.service',
            'FocusSessionsService',
          ),
        );
        await focusService.apply(stopped.sessionId, 3, stopped.editVersion);
        assert.equal(
          (await restored.connection.collection('weekly_plans').findOne({ weekId: week.weekId }))
            .tasks[0].actualMinutes,
          5,
        );
        assert.equal(
          roundtrip.data.focusSessions.find((s) => s.sessionId === stopped.sessionId)
            .appliedMinutes,
          3,
        );
        assert.equal(
          roundtrip.data.focusSessions.find((s) => s.sessionId === stopped.sessionId)
            .focusedSeconds,
          stopped.focusedSeconds,
        );
        const heartbeatEra = structuredClone(saved);
        const oldActive = heartbeatEra.data.focusSessions.find((record) => record.activeSlot);
        delete oldActive.timerPolicy;
        oldActive.leaseUntil = new Date(
          Date.parse(oldActive.lastHeartbeatAt) + 45000,
        ).toISOString();
        oldActive.activityUntil = new Date(
          Date.parse(oldActive.lastHeartbeatAt) + 300000,
        ).toISOString();
        const oldPreview = await targetBackup.preview(heartbeatEra);
        await targetBackup.restore({
          backup: heartbeatEra,
          digest: oldPreview.digest,
          revision: oldPreview.revision,
          confirmation: 'REPLACE ALL DATA',
        });
        const oldRestored = await lifecycle.current();
        assert.equal(oldRestored.state, 'paused');
        assert.equal(oldRestored.elapsedMilliseconds, oldActive.confirmedMilliseconds);
        const legacy = structuredClone(saved);
        legacy.data.focusSessions = [];
        legacy.counts.focusSessions = 0;
        // No pending duration may claim legacy compatibility without its application provenance.
        legacy.data.weeklyPlans[0].tasks[0].actualMinutes = 0;
        assert.ok(await targetBackup.preview(legacy));
      },
    );
    await t.test('timer actions leave XP and streak history unchanged', async () => {
      assert.deepEqual(await own.connection.collection('xp_transactions').find().toArray(), xp);
    });
  } finally {
    mongoose.now = originalNow;
    if (restored) await restored.cleanup();
    if (own) await own.cleanup();
  }
});
