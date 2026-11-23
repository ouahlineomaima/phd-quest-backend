const { test } = require('node:test'),
  assert = require('node:assert/strict');
const {
  measuredMilliseconds,
  sessionView,
  LEASE_MS,
  ACTIVITY_MS,
  activityWindow,
} = require('../../dist/modules/focus-sessions/business/services/focus-lifecycle');
const at = new Date('2026-11-23T10:00:00Z');
test('breaks retain their full rest target while research work uses the bounded activity window', () => {
  assert.equal(activityWindow({ kind: 'focus', targetSeconds: 1500 }), ACTIVITY_MS);
  assert.equal(activityWindow({ kind: 'break', targetSeconds: 900 }), 900000 + LEASE_MS);
});
const row = (fields = {}) => ({
  state: 'running',
  focusedSeconds: 10,
  confirmedMilliseconds: 10500,
  intervalStartedAt: at,
  lastHeartbeatAt: at,
  leaseUntil: new Date(+at + LEASE_MS),
  activityUntil: new Date(+at + ACTIVITY_MS),
  targetSeconds: null,
  ...fields,
});
test('running accounting uses timestamps and retains fractional confirmed seconds', () =>
  assert.equal(measuredMilliseconds(row(), new Date(+at + 1250)), 11750));
test('pause excludes all paused duration', () =>
  assert.equal(measuredMilliseconds(row({ state: 'paused' }), new Date(+at + 100000)), 10500));
test('lease expiry uses the exact last confirmation with no grace', () => {
  assert.equal(measuredMilliseconds(row(), new Date(+at + LEASE_MS)), 10500);
  assert.equal(measuredMilliseconds(row(), new Date(+at + 86400000)), 10500);
});
test('activity expiration also cuts off scheduled unattended heartbeats', () =>
  assert.equal(
    measuredMilliseconds(row({ activityUntil: new Date(+at + 1000) }), new Date(+at + 2000)),
    10500,
  ));
test('recovery view is paused without mutating the stored row', () => {
  const original = row(),
    before = JSON.stringify(original),
    view = sessionView(original, new Date(+at + LEASE_MS));
  assert.equal(view.state, 'paused');
  assert.equal(view.recovered, true);
  assert.equal(JSON.stringify(original), before);
});
test('server clock rollback cannot produce negative running time', () =>
  assert.equal(measuredMilliseconds(row(), new Date(+at - 10000)), 10500));
test('countdown is capped exactly at its target', () =>
  assert.equal(measuredMilliseconds(row({ targetSeconds: 11 }), new Date(+at + 10000)), 11000));
test('legacy saved seconds remain unchanged without lifecycle metadata', () =>
  assert.equal(measuredMilliseconds({ focusedSeconds: 73 }, at), 73000));
