const { isolated } = require('../safety/isolated.cjs');
const { randomUUID } = require('node:crypto');
// Run only against a separately started API using an owned validation database.
const assert = require('node:assert/strict'),
  mongoose = require('mongoose');
(async () => {
  const uri = new URL(process.env.MONGODB_URI);
  uri.pathname = '/phd_quest_stage4_' + randomUUID().replaceAll('-', '');
  const own = await isolated(uri.toString());
  const base = new URL(own.base),
    db = own.connection;
  const call = async (path, method = 'GET', body, status = 200) => {
    const r = await fetch(base.href.replace(/\/$/, '') + '/' + path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    assert.equal(r.status, status, JSON.stringify(value));
    return value;
  };
  try {
    assert.equal(await db.collection('weekly_plans').countDocuments(), 0);
    const empty = await call('dashboard');
    assert.equal(empty.week.planId, null);
    assert.equal(empty.week.baselineMinutes, 360);
    assert.equal(empty.gamification.totalXp, 0);
    assert.equal(empty.research.current.levelNumber, 0);
    assert.equal(empty.achievements.unlocked, 0);
    await call('roadmap/2/complete', 'POST', { confirm: true }, 409);
    await call('roadmap/1/complete', 'POST', {}, 400);
    await call('roadmap/1/complete', 'POST', { confirm: false }, 400);
    await call('roadmap/1/checkpoints/chapter-1-review', 'PATCH', { completed: null }, 400);
    await call(
      'roadmap/1/checkpoints/chapter-1-review',
      'PATCH',
      { completed: true, evidence: null },
      400,
    );
    await call('roadmap/1', 'PATCH', { description: '   ' }, 400);
    await call('goals', 'POST', { title: ' ', type: 'research' }, 400);
    await call(
      'goals',
      'POST',
      { title: 'Invalid', type: 'research', targetDate: '2026-02-30' },
      400,
    );
    await call('goals', 'POST', { title: 'Invalid', type: 'research', status: 'completed' }, 400);
    const goal = await call(
      'goals',
      'POST',
      { title: 'Owned API goal', type: 'research', relatedRoadmapLevel: 1 },
      201,
    );
    assert.ok(
      await db.collection('goals').findOne({ _id: new mongoose.Types.ObjectId(goal.id) }),
      'API must point to the owned database',
    );
    await call('goals/' + goal.id, 'PATCH', { title: 'Edited API goal' });
    assert.equal((await call('goals')).length, 1);
    await call('goals/' + goal.id + '/complete', 'PATCH', {});
    await call('goals/' + goal.id + '/reopen', 'PATCH', {});
    await call('roadmap/0/checkpoints/research-environment-ready', 'PATCH', { completed: true });
    await call('roadmap/0/complete', 'POST', { confirm: true }, 201);
    await call('roadmap/1/checkpoints/chapter-1-review', 'PATCH', {
      completed: true,
      evidence: 'Owned review',
    });
    await call('roadmap/1/checkpoints/chapter-1-review', 'PATCH', { completed: false });
    const historical = await call('achievements');
    assert.ok(historical.find((a) => a.code === 'first_checkpoint').unlockedAt);
    assert.ok(historical.find((a) => a.code === 'first_goal').unlockedAt);
    const example = require('../../docs/contracts/weekly-plan.v1.example.json');
    const input = {
      ...structuredClone(example),
      weekId: empty.week.weekId,
      startDate: empty.week.startDate,
      endDate: empty.week.endDate,
      title: 'Owned Phase 6 current week',
    };
    input.tasks = Array.from({ length: 10 }, (_, i) => ({
      ...example.tasks[0],
      id: 'owned-' + i,
      title: 'Owned research task ' + i,
      date: empty.today,
      estimatedMinutes: 30,
      xpReward: 10,
    }));
    const plan = await call('weekly-plans/import/confirm', 'POST', input, 201);
    for (const task of plan.tasks)
      await call(`weekly-plans/${plan.id}/tasks/${task.id}/complete`, 'PATCH', {
        actualMinutes: 3,
      });
    let dashboard = await call('dashboard');
    assert.equal(dashboard.gamification.totalXp, 100);
    assert.equal(dashboard.gamification.playerLevel, 2);
    assert.equal(dashboard.research.current.levelNumber, 1);
    assert.equal(dashboard.week.progress.completionPercent, 100);
    assert.equal(dashboard.week.plannedMinutes, 300);
    assert.equal(dashboard.week.progress.actualRecordedMinutes, 30);
    assert.equal(dashboard.week.todayTasks.length, 10);
    assert.equal(dashboard.goals.activeCount, 1);
    assert.equal(dashboard.recentActivity.length, 10);
    const repeat = await call(`weekly-plans/${plan.id}/tasks/owned-0/complete`, 'PATCH', {
      actualMinutes: 90,
    });
    assert.equal(repeat.changed, false);
    assert.equal(repeat.xpAwarded, 0);
    await call(`weekly-plans/${plan.id}/tasks/owned-0/reopen`, 'PATCH', {});
    dashboard = await call('dashboard');
    assert.equal(dashboard.week.progress.completionPercent, 90);
    assert.equal(dashboard.gamification.totalXp, 100);
    assert.equal(dashboard.week.progress.actualRecordedMinutes, 30);
    await call('roadmap/1/checkpoints/chapter-1-review', 'PATCH', { completed: true });
    await Promise.all([
      call('roadmap/1/complete', 'POST', { confirm: true }, 201),
      call('roadmap/1/complete', 'POST', { confirm: true }, 201),
    ]);
    await call('roadmap/1/checkpoints/chapter-1-review', 'PATCH', { completed: false }, 409);
    const first = await call('achievements'),
      second = await call('achievements');
    assert.equal(first.filter((a) => a.unlockedAt).length, 7);
    assert.deepEqual(
      first.map((a) => a.unlockedAt),
      second.map((a) => a.unlockedAt),
    );
    await call('goals/' + goal.id + '/archive', 'PATCH', {});
    await call('goals/' + goal.id + '/reopen', 'PATCH', {}, 409);
    assert.equal((await call('goals?status=archived&type=research')).length, 1);
    dashboard = await call('dashboard');
    assert.equal(dashboard.research.current.levelNumber, 2);
    assert.equal(dashboard.goals.activeCount, 0);
    assert.equal(dashboard.gamification.totalXp, 100);
    assert.equal(await db.collection('xp_transactions').countDocuments(), 10);
    console.log(
      'PASS HTTP: strict DTOs, empty/populated current week, goal lifecycle, historical achievements, task XP, independent research progression, dashboard totals and bounded activity.',
    );
  } finally {
    await own.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
