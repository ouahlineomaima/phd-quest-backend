const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createValidationPipe } = require('../../dist/common/validation');
const { ImportPlanDto } = require('../../dist/modules/weekly-plans/api/dtos/import-plan.dto');
const {
  calendarOrdinal,
  calendarDates,
  validatePlan,
} = require('../../dist/modules/weekly-plans/business/services/plan-validation');
const {
  WeeklyPlansService,
} = require('../../dist/modules/weekly-plans/business/services/weekly-plans.service');
const example = require('../../docs/contracts/weekly-plan.v1.example.json');
const { mongo } = require('mongoose');
const copy = () => structuredClone(example);
const decode = (value) =>
  createValidationPipe().transform(value, { type: 'body', metatype: ImportPlanDto });

test('canonical example normalizes and previews without any write', async () => {
  const value = copy();
  value.title = `  ${value.title}  `;
  const dto = await decode(value);
  const preview = await new WeeklyPlansService({
    exists: async () => false,
    insert: () => assert.fail('Preview wrote data'),
  }).preview(dto);
  assert.equal(preview.plan.title, example.title);
  assert.equal(preview.totals.estimatedMinutes, 75);
  assert.equal(preview.totals.potentialXp, 25);
  assert.equal(preview.days.length, 7);
  assert.equal(preview.canImport, true);
});
test('preview reports duplicate-week warnings without writing', async () => {
  const preview = await new WeeklyPlansService({ exists: async () => true }).preview(
    await decode(copy()),
  );
  assert.equal(preview.canImport, false);
  assert.equal(preview.conflicts[0].code, 'WEEK_EXISTS');
});
test('strict DTOs reject progress injection, unknown fields, coercion and invalid bounds', async () => {
  for (const mutate of [
    (p) => (p.schemaVersion = 2),
    (p) => delete p.title,
    (p) => (p.title = '  '),
    (p) => (p.previewValidated = true),
    (p) => (p.notes = null),
    (p) => (p.objectives = []),
    (p) => (p.tasks[0].status = 'completed'),
    (p) => (p.tasks[0].actualMinutes = 500),
    (p) => (p.tasks[0].completedAt = '2026-11-15'),
    (p) => (p.tasks[0].estimatedMinutes = '30'),
    (p) => (p.tasks[0].estimatedMinutes = 0),
    (p) => (p.tasks[0].estimatedMinutes = 1441),
    (p) => (p.tasks[0].xpReward = -1),
    (p) => (p.tasks[0].xpReward = 1001),
    (p) => (p.tasks[0].xpReward = 0.1),
    (p) => (p.tasks[0].isOptional = 'false'),
    (p) => (p.tasks[0].id = 'Bad ID'),
    (p) => (p.tasks[0].deliverable = ''),
    (p) => (p.tasks = [null]),
    (p) => (p.tasks = Array.from({ length: 201 }, () => p.tasks[0])),
  ]) {
    const p = copy();
    mutate(p);
    await assert.rejects(decode(p));
  }
});
test('semantic errors identify dates and duplicate task paths', async () => {
  for (const [mutate, field] of [
    [(p) => (p.startDate = '2026-02-30'), 'startDate'],
    [(p) => (p.startDate = '2026-11-16'), 'startDate'],
    [(p) => (p.weekId = '2026-11-22'), 'weekId'],
    [(p) => (p.endDate = '2026-11-22'), 'endDate'],
    [(p) => (p.tasks[0].date = '2026-11-22'), 'tasks.0.date'],
    [(p) => (p.tasks[0].date = '2026-02-30'), 'tasks.0.date'],
    [(p) => (p.tasks[1].id = p.tasks[0].id), 'tasks.1.id'],
  ]) {
    const p = copy();
    mutate(p);
    const dto = await decode(p);
    assert.throws(
      () => validatePlan(dto),
      (error) => error.getResponse().details.some((item) => item.field === field),
    );
  }
});
test('calendar arithmetic handles leap years, DST-adjacent weeks and year rollover without timezone conversion', () => {
  assert.equal(calendarOrdinal('2024-02-29') + 1, calendarOrdinal('2024-03-01'));
  assert.equal(calendarOrdinal('2100-02-29'), null);
  for (const [start, end] of [
    ['2026-12-27', '2027-01-02'],
    ['2026-03-08', '2026-03-14'],
    ['2024-02-25', '2024-03-02'],
  ]) {
    const p = { ...copy(), weekId: start, startDate: start, endDate: end, tasks: [] };
    validatePlan(p);
    assert.equal(calendarDates(start)[6], end);
  }
});
test('confirmation revalidates without trusting preview and preserves existing weeks', async () => {
  let writes = 0;
  const service = new WeeklyPlansService({
    exists: async () => true,
    insert: () => {
      writes++;
    },
  });
  const invalid = copy();
  invalid.tasks[1].id = invalid.tasks[0].id;
  await assert.rejects(service.confirm(invalid), (error) => error.getStatus() === 400);
  await assert.rejects(
    service.confirm(copy()),
    (error) => error.getStatus() === 409 && error.getResponse().code === 'WEEK_EXISTS',
  );
  assert.equal(writes, 0);
});
test('a concurrent duplicate-index error becomes a safe explicit week conflict', async () => {
  const service = new WeeklyPlansService(
    {
      exists: async () => false,
      insert: async () => {
        throw new mongo.MongoServerError({ code: 11000, message: 'private database detail' });
      },
    },
    { transaction: (work) => work({}), collection: () => ({ updateOne: async () => {} }) },
  );
  await assert.rejects(service.confirm(copy()), (error) => {
    assert.equal(error.getStatus(), 409);
    assert.equal(error.getResponse().code, 'WEEK_EXISTS');
    assert.doesNotMatch(JSON.stringify(error.getResponse()), /private database detail/);
    return true;
  });
});
test('oversized imports are rejected before persistence', async () => {
  const p = copy();
  p.tasks = Array.from({ length: 200 }, (_, index) => ({
    ...p.tasks[0],
    id: `task-${index}`,
    description: 'x'.repeat(2000),
    deliverable: 'x'.repeat(500),
  }));
  assert.throws(
    () => validatePlan(p),
    (error) => error.getStatus() === 413,
  );
});
