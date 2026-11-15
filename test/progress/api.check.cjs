const assert=require('node:assert/strict');const mongoose=require('mongoose');
const {calendarDates}=require('../../dist/common/calendar');
(async()=>{
 const base=process.env.PROGRESS_TEST_BASE_URL;assert.ok(base,'Set the isolated test API URL');assert.notEqual(new URL(base).port,'3000');
 const uri=process.env.PROGRESS_TEST_DB_URI;assert.match(new URL(uri).pathname,/^\/phd_quest_phase5_validation_[a-f0-9]{32}$/);
 const connection=await mongoose.createConnection(uri).asPromise();
 try {
  assert.equal(await connection.db.collection('weekly_plans').countDocuments(),0,'Use an empty, owned test database');
  const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const patch=(id,task,action,data={})=>fetch(`${base}/weekly-plans/${id}/tasks/${task}/${action}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  const fixture=structuredClone(require('../../docs/contracts/weekly-plan.v1.example.json'));
  fixture.weekId=fixture.startDate='2099-01-04';fixture.endDate='2099-01-10';fixture.title='Owned Phase 5 API fixture';fixture.tasks.forEach((task,index)=>task.date=calendarDates(fixture.startDate)[index]);fixture.tasks[1].xpReward=0;
  const imported=await post('/weekly-plans/import/confirm',fixture);assert.equal(imported.status,201);const plan=await imported.json();
  assert.equal((await (await fetch(base+'/gamification/summary')).json()).totalXp,0);
  assert.equal((await patch(plan.id,fixture.tasks[0].id,'complete',{actualMinutes:-1})).status,400);
  assert.equal((await patch(plan.id,'unknown','complete')).status,404);
  const results=await Promise.all(Array.from({length:4},()=>patch(plan.id,fixture.tasks[0].id,'complete',{actualMinutes:25}).then(async response=>{assert.equal(response.status,200);return response.json()})));
  assert.equal(results.filter(item=>item.changed).length,1);assert.equal(results.reduce((sum,item)=>sum+item.xpAwarded,0),10);
  const repeated=await (await patch(plan.id,fixture.tasks[0].id,'complete',{actualMinutes:99})).json();assert.equal(repeated.changed,false);assert.equal(repeated.plan.tasks[0].actualMinutes,25);
  assert.equal((await patch(plan.id,fixture.tasks[0].id,'reopen',{actualMinutes:2})).status,400);
  const reopened=await (await patch(plan.id,fixture.tasks[0].id,'reopen')).json();assert.equal(reopened.gamification.totalXp,10);assert.equal(reopened.weeklyProgress.completedTasks,0);assert.equal(reopened.plan.tasks[0].completedAt,null);
  const recompleted=await (await patch(plan.id,fixture.tasks[0].id,'complete',{actualMinutes:28})).json();assert.equal(recompleted.xpAwarded,0);
  const zero=await (await patch(plan.id,fixture.tasks[1].id,'complete')).json();assert.equal(zero.xpAwarded,0);assert.equal(zero.gamification.currentStreak,1);assert.equal(zero.gamification.todayActivity.taskCompletionCount,3);
  assert.equal(zero.weeklyProgress.completionPercent,100);assert.equal(zero.weeklyProgress.actualRecordedMinutes,28);
  assert.equal(await connection.db.collection('xp_transactions').countDocuments(),1);
  const day=await connection.db.collection('daily_activity').findOne({date:zero.gamification.todayActivity.date});assert.equal(day.events.length,3);assert.notEqual(day.date,fixture.startDate);
  console.log('PASS: isolated API import/complete/repeat/concurrency/reopen/recomplete/zero-XP, strict input, live summary and persisted activity.');
 } finally {await connection.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
