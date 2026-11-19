const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  { randomUUID } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { isolated } = require('../safety/isolated.cjs');
const { reserveDatabase, releaseDatabase } = require('../safety/owned-database.cjs');
const mongoose = require('mongoose');
test('cleanup refuses a replaced ownership marker and preserves the database until proof is restored', async () => {
  const uri = new URL(process.env.MONGODB_URI);
  uri.pathname = '/phd_quest_stage4_' + randomUUID().replaceAll('-', '');
  await reserveDatabase(uri.toString());
  const c = await mongoose.createConnection(uri.toString()).asPromise();
  const marker = await c.collection('_test_owner').findOne();
  try {
    await c.collection('_test_owner').deleteMany({});
    await c.collection('_test_owner').insertOne({ _id: 'foreign-owner' });
    await assert.rejects(releaseDatabase(uri.toString()), /Ownership/);
    assert.equal(await c.collection('_test_owner').countDocuments(), 1);
  } finally {
    await c.collection('_test_owner').deleteMany({});
    await c.collection('_test_owner').insertOne(marker);
    await c.close();
    await releaseDatabase(uri.toString());
  }
});
test('Focus aggregates retain Node calendar semantics at DST, midnight and Sunday boundaries', async () => {
  let own;
  try {
    const uri = new URL(process.env.MONGODB_URI);
    uri.pathname = '/phd_quest_stage4_' + randomUUID().replaceAll('-', '');
    own = await isolated(uri.toString());
    const {
        FocusSessionsService,
      } = require('../../dist/modules/focus-sessions/business/services/focus-sessions.service'),
      { ApplicationClock, localDateAt } = require('../../dist/common/application-clock'),
      { sundayWeek } = require('../../dist/modules/dashboard/business/services/sunday-week');
    const now = new Date('2026-11-01T06:30:00Z'),
      clock = own.app.get(ApplicationClock);
    clock.now = () => now;
    const rows = [
      '2024-01-01T00:00:00Z',
      '2026-10-31T23:59:59Z',
      '2026-11-01T00:00:00Z',
      '2026-11-01T05:30:00Z',
      '2026-11-01T06:30:00Z',
      '2026-11-01T23:30:00Z',
      '2026-11-02T00:30:00Z',
    ].map((date, i) => ({
      sessionId: randomUUID(),
      endedAt: new Date(date),
      focusedSeconds: 59 + i * 31,
      mode: i % 2 ? 'countdown' : 'stopwatch',
      completionType: 'target-reached',
    }));
    await own.connection.collection('focus_sessions').insertMany(rows);
    for (const timezone of ['UTC', 'Africa/Casablanca', 'America/New_York', 'Pacific/Apia']) {
      own.app.get(ConfigService).set('APP_TIMEZONE', timezone);
      const today = localDateAt(now, timezone),
        week = sundayWeek(today),
        seconds = (predicate) =>
          rows
            .filter((row) => predicate(localDateAt(row.endedAt, timezone)))
            .reduce((sum, row) => sum + row.focusedSeconds, 0);
      const expected = {
        timezone,
        today,
        weekId: week.weekId,
        todayMinutes: Math.floor(seconds((date) => date === today) / 60),
        weekMinutes: Math.floor(
          seconds((date) => date >= week.startDate && date <= week.endDate) / 60,
        ),
        overallMinutes: Math.floor(seconds(() => true) / 60),
        sessionCount: rows.length,
        completedCountdowns: rows.filter((row) => row.mode === 'countdown').length,
      };
      assert.deepEqual(await own.app.get(FocusSessionsService).summary(), expected);
    }
  } finally {
    if (own) await own.cleanup();
  }
});
