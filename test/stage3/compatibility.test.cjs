const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const { isolated } = require('../safety/isolated.cjs');
test('owned workspace retains Focus manual application, XP, streak history and old/new backups', async () => {
  let own;
  try {
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/phd_quest_stage2_' + randomUUID().replaceAll('-', '');
    own = await isolated(uri.toString());
    const call = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(own.base + path, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      return value;
    };
    const week = structuredClone(require('../../docs/contracts/weekly-plan.v1.example.json'));
    Object.assign(week, { weekId: '2026-11-15', startDate: '2026-11-15', endDate: '2026-11-21' });
    week.tasks = [{ ...week.tasks[0], id: 'focus-task', date: '2026-11-15', xpReward: 10 }];
    const plan = await call('/weekly-plans/import/confirm', 'POST', week, 201);
    const endedAt = new Date(Date.now() - 10000).toISOString(),
      sessionId = randomUUID();
    await call(
      '/focus-sessions',
      'POST',
      {
        sessionId,
        mode: 'countdown',
        targetSeconds: 60,
        startedAt: new Date(Date.parse(endedAt) - 60000).toISOString(),
        endedAt,
        focusedSeconds: 60,
        taskRef: week.weekId + ':focus-task',
        completionType: 'target-reached',
      },
      201,
    );
    const pending = await call('/weekly-plans/' + plan.id);
    assert.equal(pending.tasks[0].status, 'pending');
    assert.equal(await own.connection.collection('xp_transactions').countDocuments(), 0);
    await call('/focus-sessions/' + sessionId + '/apply-time', 'POST', { confirm: true }, 201);
    assert.equal(await own.connection.collection('xp_transactions').countDocuments(), 0);
    await call('/weekly-plans/' + plan.id + '/tasks/focus-task/complete', 'PATCH', {});
    await call('/weekly-plans/' + plan.id + '/tasks/focus-task/complete', 'PATCH', {});
    assert.equal(await own.connection.collection('xp_transactions').countDocuments(), 1);
    const { BackupService } = require('../../dist/modules/backup/business/services/backup.service'),
      backup = own.app.get(BackupService),
      saved = await backup.export();
    assert.equal(saved.data.focusSessions.length, 1);
    let preview = await backup.preview(saved);
    await backup.restore({ backup: saved, ...preview, confirmation: 'REPLACE ALL DATA' });
    assert.deepEqual((await backup.export()).data, saved.data);
    const old = structuredClone(saved);
    for (const section of [
      'focusSessions',
      'supervisors',
      'supervisorMeetings',
      'skillCategories',
      'researchSkills',
    ]) {
      delete old.data[section];
      delete old.counts[section];
    }
    preview = await backup.preview(old);
    await backup.restore({ backup: old, ...preview, confirmation: 'REPLACE ALL DATA' });
    const restored = await backup.export();
    assert.deepEqual(restored.data.xpTransactions, saved.data.xpTransactions);
    assert.deepEqual(restored.data.dailyActivity, saved.data.dailyActivity);
    assert.deepEqual(restored.data.weeklyPlans, saved.data.weeklyPlans);
    assert.equal(restored.data.focusSessions.length, 0);
  } finally {
    if (own) await own.cleanup();
  }
});
