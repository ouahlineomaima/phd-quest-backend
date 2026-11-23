const { test } = require('node:test'),
  assert = require('node:assert/strict');
const {
  measuredMilliseconds,
  sessionView,
} = require('../../dist/modules/focus-sessions/business/services/focus-lifecycle');
const at = new Date('2026-11-23T10:00:00Z');
const row = (fields = {}) => ({
  state: 'running',
  focusedSeconds: 10,
  confirmedMilliseconds: 10500,
  intervalStartedAt: at,
  lastHeartbeatAt: at,
  leaseUntil: new Date(+at + 45000),
  activityUntil: new Date(+at + 300000),
  targetSeconds: null,
  ...fields,
});
for (const [name, duration] of [
  ['tab switching for ten minutes', 600000],
  ['thirty minutes of inactivity', 1800000],
  ['three hours without clients or heartbeats', 10800000],
  ['sleep beyond the previous seven-day cap', 8 * 86400000],
]) {
  test(name + ' preserves running state and the complete timestamp duration', () => {
    const original = row(),
      before = JSON.stringify(original),
      view = sessionView(original, new Date(+at + duration));
    assert.equal(view.state, 'running');
    assert.equal(view.elapsedMilliseconds, 10500 + duration);
    assert.equal(view.recovered, false);
    assert.equal(JSON.stringify(original), before);
  });
}
test('pause freezes accumulated fractional milliseconds', () =>
  assert.equal(measuredMilliseconds(row({ state: 'paused' }), new Date(+at + 100000)), 10500));
test('stopped measured duration cannot grow', () =>
  assert.equal(measuredMilliseconds(row({ state: 'stopped' }), new Date(+at + 10800000)), 10500));
test('server clock rollback cannot create negative running time', () =>
  assert.equal(measuredMilliseconds(row(), new Date(+at - 10000)), 10500));
test('countdown targets do not truncate or automatically finalize work', () =>
  assert.equal(measuredMilliseconds(row({ targetSeconds: 11 }), new Date(+at + 60000)), 70500));
test('legacy saved seconds remain unchanged', () =>
  assert.equal(measuredMilliseconds({ focusedSeconds: 73 }, at), 73000));
test('previously auto-paused sessions remain paused', () => {
  const view = sessionView(row({ state: 'paused', recovered: true }), new Date(+at + 10800000));
  assert.equal(view.state, 'paused');
  assert.equal(view.elapsedMilliseconds, 10500);
});
