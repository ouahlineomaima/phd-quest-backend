// All writes, replacements and drops are confined to these two owned random databases.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),mongoose=require('mongoose');require('reflect-metadata');
const {NestFactory}=require('@nestjs/core'),{Module}=require('@nestjs/common'),{ConfigModule,ConfigService}=require('@nestjs/config'),{getConnectionToken}=require('@nestjs/mongoose');
const load=(file,name)=>require('../../dist/'+file)[name];
const DatabaseModule=load('database/database.module','DatabaseModule'),BackupModule=load('modules/backup/backup.module','BackupModule'),validateEnvironment=load('config/environment','validateEnvironment'),configureApi=load('common/configure-api','configureApi');
const Backup=load('modules/backup/business/services/backup.service','BackupService'),Repo=load('modules/backup/persistence/repositories/backup.repository','BackupRepository'),Plans=load('modules/weekly-plans/business/services/weekly-plans.service','WeeklyPlansService'),Tasks=load('modules/weekly-plans/business/services/task-progress.service','TaskProgressService'),Goals=load('modules/goals/business/services/goals.service','GoalsService'),Meetings=load('modules/supervisor-meetings/business/services/meetings.service','MeetingsService'),Clock=load('common/application-clock','ApplicationClock'),Focus=load('modules/focus-sessions/business/services/focus-sessions.service','FocusSessionsService');
const names=Array.from({length:2},()=>`phd_quest_meetings_validation_${randomUUID().replaceAll('-','')}`);
const uris=names.map(name=>{const uri=new URL(process.env.MONGODB_URI);uri.pathname='/'+name;return uri.toString();});
async function create(uri,index){class Owned{}Module({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,ignoreEnvVars:true,load:[()=>validateEnvironment({...process.env,MONGODB_URI:uri,NODE_ENV:'test',APP_TIMEZONE:'Africa/Casablanca'})]}),DatabaseModule,BackupModule]})(Owned);const app=await NestFactory.create(Owned,{logger:false,bodyParser:false});configureApi(app,app.get(ConfigService));await app.listen(0,'127.0.0.1');assert.equal(app.get(getConnectionToken()).name,names[index]);return app;}
test('Supervisor Meeting Tracker: isolated API, relationships, history and atomic backups',async t=>{
 let source,target;
 try{
  source=await create(uris[0],0);target=await create(uris[1],1);
  const base=`http://127.0.0.1:${source.getHttpServer().address().port}/api`,backup=source.get(Backup),targetBackup=target.get(Backup),plans=source.get(Plans),tasks=source.get(Tasks),goals=source.get(Goals),service=source.get(Meetings),connection=source.get(getConnectionToken()),clock=source.get(Clock);
  async function call(path,method='GET',body,status=200){const res=await fetch(base+path,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await res.json();assert.equal(res.status,status,JSON.stringify(value));return value;}
  const example=require('../../docs/contracts/weekly-plan.v1.example.json');
  const makeWeek=async weekId=>{const end=new Date(weekId+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);return plans.confirm({...structuredClone(example),weekId,startDate:weekId,endDate:end.toISOString().slice(0,10),tasks:[{...example.tasks[0],id:'shared-task',date:weekId,xpReward:10}]});};
  const weekA=await makeWeek('2026-11-15'),weekB=await makeWeek('2026-11-22'),refs=['2026-11-15:shared-task','2026-11-22:shared-task'];
  const goal=await goals.create({title:'Owned research goal',type:'research'});
  const end=new Date(Date.now()-10000),start=new Date(+end-60000);await source.get(Focus).save({sessionId:randomUUID(),mode:'countdown',targetSeconds:60,startedAt:start.toISOString(),endedAt:end.toISOString(),focusedSeconds:60,taskRef:null,completionType:'target-reached'});
  const before=(await backup.export()).data;let a,b,meeting,other,pre,post;
  const future=new Date(Date.now()+86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
  await t.test('supervisor lifecycle, required associations and strict DTO/security validation',async()=>{
   a=await call('/supervisors','POST',{name:'Primary supervisor',role:'primary',email:'supervisor@example.org'},201);b=await call('/supervisors','POST',{name:'Co supervisor',role:'co_supervisor',institution:'Owned institute'},201);
   await call('/supervisors/'+a.id,'PATCH',{notes:'Persistent contact notes'});await call('/supervisors','POST',{name:' '},400);await call('/supervisors','POST',{name:'Invalid',role:'root'},400);await call('/supervisors','POST',{name:'Invalid',email:'bad'},400);
   const input={title:'Research review',scheduledAt:future,supervisorIds:[a.id,b.id],type:'hybrid',notes:{agenda:'Review evidence',discussion:'Discussion',feedback:'Feedback',decisions:'Keep direction'},goalIds:[goal.id],checkpointRefs:[{levelNumber:0,checkpointId:'research-environment-ready'}],documents:[{label:'Paper',url:'https://example.org/paper'}]};
   for(const edit of [p=>p.supervisorIds=[],p=>delete p.supervisorIds,p=>p.supervisorIds=[a.id,a.id],p=>p.supervisorIds=['0'.repeat(24)],p=>p.scheduledAt='2026-11-17T10:00',p=>p.scheduledAt='2026-02-30T10:00:00Z',p=>p.type='automatic',p=>p.goalIds=['0'.repeat(24)],p=>p.checkpointRefs=[{levelNumber:0,checkpointId:'absent'}],p=>p.documents=[{label:'Unsafe',url:'javascript:alert(1)'}],p=>p.documents=[{label:'Unsafe',url:'file:///local'}],p=>p.status='completed',p=>p.notes.feedback=null]){const bad=structuredClone(input);edit(bad);await call('/supervisor-meetings','POST',bad,400);}
   meeting=await call('/supervisor-meetings','POST',input,201);assert.equal(meeting.supervisors.length,2);assert.equal(meeting.status,'scheduled');assert.equal(meeting.linkedGoals[0].title,goal.title);
   await call('/supervisor-meetings/bad','GET',undefined,400);await call('/supervisor-meetings/'+('0'.repeat(24)),'GET',undefined,404);
   other=await call('/supervisor-meetings','POST',{title:'Past scheduled meeting',scheduledAt:past,supervisorIds:[a.id]},201);assert.equal(other.status,'scheduled');
  });
  await t.test('two phases, cross-week many-to-many task links and independent manual progress',async()=>{
   let result=await call(`/supervisor-meetings/${meeting.id}/actions`,'POST',{title:'Prepare review',phase:'pre_meeting',dueDate:'2026-11-01',linkedTaskIds:refs},201);pre=result.actions[0];assert.deepEqual(pre.progress,{completed:0,total:2,linked:2,missing:0,percentage:0});
   result=await call(`/supervisor-meetings/${meeting.id}/actions`,'POST',{title:'Follow up',phase:'post_meeting'},201);post=result.actions[1];assert.equal(post.progress.percentage,null);assert.equal(post.progress.linked,0);
   await call(`/supervisor-meetings/${other.id}/actions`,'POST',{title:'Shared elsewhere',phase:'post_meeting',linkedTaskIds:[refs[0]]},201);
   for(const input of [{title:'Duplicate',phase:'pre_meeting',linkedTaskIds:[refs[0],refs[0]]},{title:'Dangling',phase:'post_meeting',linkedTaskIds:['2026-11-15:missing']},{title:'Bad day',phase:'post_meeting',linkedTaskIds:['2026-11-16:shared-task']},{title:'Bad date',phase:'post_meeting',dueDate:'2026-02-30'},{title:'Bad phase',phase:'none'},{title:'Missing phase'},{title:'Injected',phase:'pre_meeting',progress:100}])await call(`/supervisor-meetings/${meeting.id}/actions`,'POST',input,400);
   await tasks.change(weekA.id,'shared-task','complete',12);let detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.actions[0].progress.percentage,50);assert.equal(detail.actions[0].status,'pending');assert.equal((await call('/supervisor-meetings/'+other.id)).actions[0].progress.percentage,100);
   await tasks.change(weekB.id,'shared-task','complete',15);detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.actions[0].progress.percentage,100);assert.equal(detail.actions[0].status,'pending');
   await tasks.change(weekA.id,'shared-task','reopen');detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.actions[0].progress.percentage,50);
   const snapshot=(await backup.export()).data;
   await call(`/supervisor-meetings/${meeting.id}/actions/${pre.id}`,'PATCH',{status:'completed',phase:'post_meeting'});detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.actions[0].phase,'post_meeting');assert.deepEqual(detail.actions[0].linkedTaskIds,refs);assert.equal(detail.actions[0].status,'completed');assert.equal(detail.actions[0].progress.percentage,50);
   const after=(await backup.export()).data;for(const section of ['weeklyPlans','xpTransactions','dailyActivity','roadmapLevels','goals','achievements','focusSessions'])assert.deepEqual(after[section],snapshot[section]);
  });
  await t.test('rescheduling, independently editable notes, completion, archived supervisors and filters',async()=>{
   const old=await call('/supervisor-meetings/'+meeting.id);await call('/supervisor-meetings/'+meeting.id,'PATCH',{scheduledAt:new Date(Date.now()+172800000).toISOString(),notes:{agenda:'Updated agenda'}});
   let detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.notes.feedback,old.notes.feedback);assert.equal(detail.notes.agenda,'Updated agenda');assert.deepEqual(detail.actions,old.actions);
   await call(`/supervisor-meetings/${meeting.id}/status`,'PATCH',{status:'completed'});detail=await call('/supervisor-meetings/'+meeting.id);assert.equal(detail.actions.find(x=>x.id===post.id).status,'pending');assert.equal(detail.notes.decisions,'Keep direction');
   await call('/supervisors/'+b.id+'/archive','PATCH',{});assert.equal((await call('/supervisors')).length,1);assert.equal((await call('/supervisors?archived=archived'))[0].id,b.id);detail=await call('/supervisor-meetings/'+meeting.id);assert.ok(detail.supervisors.find(x=>x.id===b.id).archivedAt);
   await call('/supervisor-meetings/'+meeting.id,'PATCH',{title:'Rescheduled review',supervisorIds:[a.id,b.id]});await call('/supervisor-meetings','POST',{title:'Archived not allowed',scheduledAt:future,supervisorIds:[b.id]},400);
   assert.equal((await call('/supervisor-meetings?status=completed&supervisorId='+b.id)).items.length,1);assert.equal((await call('/supervisor-meetings/actions?phase=post_meeting&status=completed')).items.length,1);
   assert.equal((await call('/supervisor-meetings/actions?status=open&due=overdue')).items.length,0);await call(`/supervisor-meetings/${meeting.id}/actions/${pre.id}`,'PATCH',{phase:'pre_meeting',status:'pending'});assert.equal((await call('/supervisor-meetings/actions?phase=pre_meeting&due=overdue')).items.length,1);
   assert.equal((await call('/supervisor-meetings/actions?meetingId='+meeting.id+'&dueDate=2026-11-01')).items.length,1);await call('/supervisor-meetings/actions?dueDate=2026-02-30','GET',undefined,400);
   const summary=await call('/supervisor-meetings/summary');assert.equal(summary.completed,1);assert.equal(summary.preparation,1);assert.equal(summary.followUp,2);assert.equal(summary.overdue,1);assert.equal((await call('/supervisor-meetings/'+other.id)).status,'scheduled');
  });
  await t.test('concurrent action writes and missing historical references remain safe',async()=>{
   await Promise.all(['Concurrent A','Concurrent B'].map(title=>call(`/supervisor-meetings/${other.id}/actions`,'POST',{title,phase:'pre_meeting'},201)));assert.equal((await call('/supervisor-meetings/'+other.id)).actions.length,3);
   // This deliberate replacement is confined to the owned disposable database.
   await connection.collection('weekly_plans').updateOne({_id:new mongoose.Types.ObjectId(weekA.id)},{$pull:{tasks:{id:'shared-task'}}});
   // Remove its dependent immutable records in the owned fixture so the existing global backup validator remains valid.
   await connection.collection('xp_transactions').deleteOne({sourceId:refs[0]});
   await connection.collection('daily_activity').updateMany({},{$pull:{events:{sourceId:refs[0]}}});
   for(const day of await connection.collection('daily_activity').find().toArray()){if(!day.events.length)await connection.collection('daily_activity').deleteOne({_id:day._id});else{const dates=day.events.map(e=>e.occurredAt).sort((a,b)=>a-b);await connection.collection('daily_activity').updateOne({_id:day._id},{$set:{taskCompletionCount:day.events.length,firstActivityAt:dates[0],lastActivityAt:dates.at(-1)}});}}
   // A historical achievement may depend on the removed fixture; clear only the owned fixture's unlocks.
   await connection.collection('achievements').updateMany({},{$set:{unlockedAt:null}});
   await connection.collection('goals').deleteOne({_id:new mongoose.Types.ObjectId(goal.id)});
   await connection.collection('roadmap_levels').updateOne({levelNumber:0},{$set:{'checkpoints.0.id':'replacement-checkpoint'}});
   const detail=await call('/supervisor-meetings/'+meeting.id),action=detail.actions.find(a=>a.id===pre.id);assert.equal(action.progress.missing,1);assert.equal(action.progress.percentage,100);assert.equal(action.progress.total,1);assert.equal(action.status,'pending');assert.equal(action.linkedTasks[0].missing,true);assert.equal(detail.linkedGoals[0].missing,true);assert.equal(detail.linkedCheckpoints[0].missing,true);
   await call(`/supervisor-meetings/${meeting.id}/actions/${pre.id}`,'PATCH',{description:'Preserve unavailable historical link',linkedTaskIds:refs});
   await call('/supervisor-meetings/'+meeting.id,'PATCH',{goalIds:[goal.id],checkpointRefs:[{levelNumber:0,checkpointId:'research-environment-ready'}]});
  });
  let saved;
  await t.test('meeting archive preserves notes/actions; action removal leaves weekly records intact',async()=>{
   const snapshot=(await backup.export()).data;const action=(await call('/supervisor-meetings/'+other.id)).actions[1];await call(`/supervisor-meetings/${other.id}/actions/${action.id}`,'DELETE',{});assert.equal((await call('/supervisor-meetings/'+other.id)).actions.length,2);assert.deepEqual((await backup.export()).data.weeklyPlans,snapshot.weeklyPlans);
   const prior=await call('/supervisor-meetings/'+meeting.id);await call('/supervisor-meetings/'+meeting.id+'/archive','PATCH',{});const archived=await call('/supervisor-meetings/'+meeting.id);assert.deepEqual(archived.notes,prior.notes);assert.deepEqual(archived.actions,prior.actions);assert.deepEqual(archived.supervisorIds,prior.supervisorIds);assert.equal((await call('/supervisor-meetings')).items.length,1);assert.equal((await call('/supervisor-meetings?archived=archived')).items.length,1);assert.equal((await call('/supervisor-meetings/actions?archived=archived')).items.length,2);
   await call('/supervisor-meetings/'+meeting.id,'PATCH',{title:'Not allowed'},409);await call(`/supervisor-meetings/${meeting.id}/actions`,'POST',{title:'Not allowed',phase:'pre_meeting'},409);
   saved=await backup.export();assert.equal(saved.schemaVersion,1);assert.equal(saved.counts.supervisors,2);assert.equal(saved.counts.supervisorMeetings,2);assert.equal(saved.counts.focusSessions,1);
  });
  await t.test('new backup round trip retains every field and missing historical association',async()=>{
   const preview=await targetBackup.preview(saved);await targetBackup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await targetBackup.export()).data,saved.data);
   const detail=await target.get(Meetings).detail(meeting.id);assert.equal(detail.actions[0].progress.missing,1);assert.equal(detail.supervisors[1].name,'Co supervisor');assert.ok(detail.archivedAt);assert.equal(detail.notes.feedback,'Feedback');
  });
  await t.test('invalid backup and injected storage failure never partially overwrite data',async()=>{
   const snapshot=(await targetBackup.export()).data;
   for(const mutate of [f=>f.counts.supervisors++,f=>delete f.data.supervisors,f=>f.data.supervisorMeetings[0].supervisorIds=['0'.repeat(24)],f=>f.data.supervisorMeetings[0].documents=[{label:'Unsafe',url:'javascript:alert(1)'}],f=>f.data.supervisorMeetings[0].actions[0].phase='invalid',f=>f.data.supervisorMeetings[0].actions[0].linkedTaskIds=[refs[0],refs[0]],f=>f.data.supervisorMeetings[0].actions[0].createdAt='not-a-date',f=>f.data.supervisorMeetings[0].notes={agenda:'Lost fields'},f=>f.data.supervisors[0].email='not-an-email']){const bad=structuredClone(saved);mutate(bad);await assert.rejects(targetBackup.preview(bad),e=>e.getStatus()===400);assert.deepEqual((await targetBackup.export()).data,snapshot);}
   const repo=target.get(Repo),replace=repo.replace.bind(repo),preview=await targetBackup.preview(saved);repo.replace=async(...args)=>{await replace(...args);throw new Error('Injected meeting restore failure');};await assert.rejects(targetBackup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'}),/Injected meeting/);repo.replace=replace;assert.deepEqual((await targetBackup.export()).data,snapshot);
   const stale=await targetBackup.preview(saved);await target.get(Meetings).createSupervisor({name:'Concurrent change'});await assert.rejects(targetBackup.restore({backup:saved,...stale,confirmation:'REPLACE ALL DATA'}),e=>e.getStatus()===409);
  });
  await t.test('legacy v1 and Focus-era backups initialize meeting collections empty',async()=>{
   const old=structuredClone(saved);for(const s of ['supervisors','supervisorMeetings']){delete old.data[s];delete old.counts[s];}let preview=await targetBackup.preview(old);await targetBackup.restore({backup:old,...preview,confirmation:'REPLACE ALL DATA'});let result=await targetBackup.export();assert.equal(result.counts.supervisors,0);assert.equal(result.counts.supervisorMeetings,0);assert.deepEqual(result.data.focusSessions,saved.data.focusSessions);
   delete old.data.focusSessions;delete old.counts.focusSessions;preview=await targetBackup.preview(old);await targetBackup.restore({backup:old,...preview,confirmation:'REPLACE ALL DATA'});result=await targetBackup.export();assert.equal(result.counts.focusSessions,0);assert.deepEqual(result.data.weeklyPlans,saved.data.weeklyPlans);
  });
 }finally{if(source)await source.close();if(target)await target.close();for(let i=0;i<names.length;i++){assert.match(names[i],/^phd_quest_meetings_validation_[a-f0-9]{32}$/);const db=await mongoose.createConnection(uris[i]).asPromise();assert.equal(db.name,names[i]);await db.dropDatabase();await db.close();}}
});
