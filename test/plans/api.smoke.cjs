// Explicit live smoke check. Own records only; never deletes by week/date alone.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { calendarDates } = require('../../dist/modules/weekly-plans/business/services/plan-validation');
const example = require('../../docs/contracts/weekly-plan.v1.example.json');

(async () => {
  const base = process.env.API_BASE_URL || 'http://localhost:3000/api';
  const marker = `Phase 4 API validation ${randomUUID()}`;
  const connection = await mongoose.createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const collection = connection.db.collection('weekly_plans');
  const owned = [];
  const post = (endpoint, body) => fetch(`${base}/weekly-plans/import/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  try {
    let start = '2099-01-04';
    while (await collection.findOne({ weekId: start })) start = calendarDates(calendarDates(start)[6])[1];
    const dates = calendarDates(start);
    const plan = { ...structuredClone(example), title: marker, weekId: start, startDate: start, endDate: dates[6] };
    plan.tasks.forEach((task, index) => task.date = dates[index]);
    assert.equal((await post('preview', '{"schemaVersion":')).status, 400);
    for (const mutate of [p => p.schemaVersion = 2, p => p.tasks[1].id = p.tasks[0].id, p => p.tasks[0].date = '2099-02-30', p => p.tasks[0].estimatedMinutes = -1, p => p.tasks[0].status = 'completed']) {
      const invalid = structuredClone(plan); mutate(invalid);
      const response = await post('preview', invalid); assert.equal(response.status, 400);
      assert.ok((await response.json()).details.length > 0);
    }
    const preview = await post('preview', plan); assert.equal(preview.status, 200);
    const result = await preview.json(); assert.equal(result.canImport, true);
    assert.equal(result.totals.estimatedMinutes, 75); assert.equal(result.days.length, 7);
    assert.equal(await collection.countDocuments({ title: marker }), 0, 'Preview must not persist');
    const confirmations = await Promise.all([post('confirm', plan), post('confirm', plan)]);
    assert.deepEqual(confirmations.map(response => response.status).sort(), [201, 409]);
    const saved = await confirmations.find(response => response.status === 201).json(); owned.push(saved.id);
    assert.equal(saved.tasks[0].status, 'pending'); assert.equal(saved.tasks[0].actualMinutes, 0); assert.equal(saved.tasks[0].completedAt, null);
    assert.equal(await collection.countDocuments({ weekId: start }), 1);
    assert.equal((await collection.findOne({ _id: new mongoose.Types.ObjectId(saved.id), title: marker })).tasks[0].id, plan.tasks[0].id);
    const duplicate = await post('preview', plan); assert.equal((await duplicate.json()).canImport, false);
    const when = new Date('2099-01-04T12:00:00Z');
    await collection.updateOne({ _id: new mongoose.Types.ObjectId(saved.id), title: marker }, { $set: { 'tasks.0.status': 'completed', 'tasks.0.actualMinutes': 35, 'tasks.0.completedAt': when } });
    const conflict = await post('confirm', plan); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'WEEK_EXISTS');
    const detail = await fetch(`${base}/weekly-plans/${saved.id}`); assert.equal(detail.status, 200);
    const retrieved = await detail.json(); assert.equal(retrieved.tasks[0].status, 'completed'); assert.equal(retrieved.tasks[0].actualMinutes, 35);
    assert.equal(retrieved.tasks[0].completedAt, when.toISOString());
    const list = await (await fetch(`${base}/weekly-plans`)).json(); assert.ok(list.some(item => item.id === saved.id));
    assert.ok(list.every(item => !('tasks' in item)));
    assert.ok(list.every((item, index) => index === 0 || list[index - 1].startDate >= item.startDate));
    assert.equal((await fetch(`${base}/weekly-plans/${new mongoose.Types.ObjectId()}`)).status, 404);
    assert.equal((await fetch(`${base}/weekly-plans/not-an-id`)).status, 400);
    const indexes = await collection.indexes(); assert.ok(indexes.some(index => index.unique && index.key.weekId === 1));
    console.log('PASS: validation, read-only preview, concurrent confirmation, unique index, MongoDB readback, lightweight list/detail, and existing progress preservation.');
  } finally {
    for (const id of owned) await collection.deleteOne({ _id: new mongoose.Types.ObjectId(id), title: marker });
    assert.equal(await collection.countDocuments({ title: marker }), 0, 'Own smoke record cleanup');
    await connection.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
