const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { sundayWeek } = require('../../dist/modules/dashboard/business/services/sunday-week');
const { localDateAt } = require('../../dist/common/application-clock');
test('Sunday-start calendar weeks across year boundaries and configured local midnight', () => {
  assert.equal(sundayWeek('2026-11-15').weekId, '2026-11-15');
  assert.equal(sundayWeek('2026-11-21').weekId, '2026-11-15');
  assert.equal(sundayWeek('2027-01-01').weekId, '2026-12-27');
  assert.equal(sundayWeek('2028-03-01').endDate, '2028-03-04');
  const local = localDateAt(new Date('2026-03-28T23:30:00Z'), 'Africa/Casablanca');
  assert.equal(local, '2026-03-29');
  assert.equal(sundayWeek(local).weekId, '2026-03-29');
});
