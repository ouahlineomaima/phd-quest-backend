const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {isolated}=require('./isolated.cjs'),contract=require('../../docs/contracts/domain-values.v1.json');
const load=(file,name)=>require('../../dist/'+file)[name];
const Backup=load('modules/backup/business/services/backup.service','BackupService'),Repo=load('modules/backup/persistence/repositories/backup.repository','BackupRepository'),Roadmap=load('modules/roadmap/business/services/roadmap.service','RoadmapService');
function fields(name,row){for(const field of contract.responses[name])assert.ok(Object.hasOwn(row,field),name+'.'+field);}
test('Stage 2: read purity, repository contracts, achievement commands and checkpoint generations',async t=>{
 let own;
 try{
  const uri=new URL(process.env.MONGODB_URI);uri.pathname='/phd_quest_stage2_'+randomUUID().replaceAll('-','');own=await isolated(uri.toString());const{app,connection,base}=own,backup=app.get(Backup);
  const revision=async()=>(await connection.collection('_application_control').findOne({_id:'writes'}))?.revision??0;
  const call=async(path,method='GET',body,version,status=200)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(version?{'if-match':JSON.stringify(version)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
  let category,skill,profile,meeting,checkpointIdentity;
  await t.test('dashboard/achievement/roadmap GETs are read-only and preserve a fresh backup preview',async()=>{
   const saved=await backup.export(),preview=await backup.preview(saved),rev=await revision();
   for(let i=0;i<3;i++){await call('/dashboard');await call('/achievements');await call('/roadmap');}
   assert.equal(await revision(),rev);assert.deepEqual((await backup.export()).data,saved.data);assert.equal((await backup.preview(saved)).revision,preview.revision);
   await backup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await backup.export()).data,saved.data);
  });
  await t.test('eligible awards persist during commands, with no duplicate XP or achievement rows',async()=>{
   const example=structuredClone(require('../../docs/contracts/weekly-plan.v1.example.json'));Object.assign(example,{weekId:'2026-11-15',startDate:'2026-11-15',endDate:'2026-11-21'});example.tasks=[{...example.tasks[0],id:'stage2-task',date:'2026-11-15',xpReward:100}];
   const plan=await call('/weekly-plans/import/confirm','POST',example,undefined,201);assert.ok((await call('/achievements')).find(a=>a.code==='first_plan').unlockedAt);
   const completion=await call(`/weekly-plans/${plan.id}/tasks/stage2-task/complete`,'PATCH',{actualMinutes:10});assert.equal(completion.xpAwarded,100);assert.equal((await call(`/weekly-plans/${plan.id}/tasks/stage2-task/complete`,'PATCH',{})).xpAwarded,0);
   const awards=await call('/achievements');for(const code of ['first_task','hundred_xp','first_plan'])assert.ok(awards.find(a=>a.code===code).unlockedAt);const before=await backup.export();
   await Promise.all([call('/achievements/evaluate','POST',{}),call('/achievements/evaluate','POST',{})]);assert.deepEqual((await backup.export()).data,before.data);assert.equal(await connection.collection('xp_transactions').countDocuments(),1);
   const rev=await revision();await call('/achievements');await call('/dashboard');assert.equal(await revision(),rev);
  });
  await t.test('legacy eligible-but-locked records are never changed by reads and can be evaluated explicitly',async()=>{
   await connection.collection('achievements').updateOne({code:'hundred_xp'},{$set:{unlockedAt:null}});const before=(await backup.export()).data,rev=await revision();assert.equal((await call('/achievements')).find(a=>a.code==='hundred_xp').unlockedAt,null);await call('/dashboard');assert.equal(await revision(),rev);assert.deepEqual((await backup.export()).data,before);await call('/achievements/evaluate','POST',{});assert.ok((await call('/achievements')).find(a=>a.code==='hundred_xp').unlockedAt);
  });
  await t.test('typed skill/category/supervisor/meeting responses match the checked wire contract',async()=>{
   category=await call('/research-skills/categories','POST',{name:'Stage 2 category'},undefined,201);fields('SkillCategory',category);profile=await call('/supervisors','POST',{name:'Stage 2 supervisor'},undefined,201);fields('Supervisor',profile);
   const linked=await call('/research-skills','POST',{name:'Stage 2 skill',categoryId:category.id,associations:[{sourceType:'roadmap_checkpoint',sourceId:'0:research-environment-ready',targetLevel:2}]},undefined,201);skill=await call('/research-skills/'+linked.id);fields('ResearchSkill',skill);fields('Association',skill.associations[0]);checkpointIdentity=skill.associations[0].checkpointIdentity;assert.match(checkpointIdentity,/^[a-f0-9-]{36}$/);
   meeting=await call('/supervisor-meetings','POST',{title:'Stage 2 meeting',scheduledAt:'2026-12-01T10:00:00Z',supervisorIds:[profile.id],checkpointRefs:[{levelNumber:0,checkpointId:'research-environment-ready'}]},undefined,201);fields('Meeting',meeting);assert.equal(meeting.checkpointRefs[0].checkpointIdentity,checkpointIdentity);
   skill=await call('/research-skills/'+skill.id+'/proficiency','PATCH',{level:2,confirm:true},skill.editVersion);fields('ProficiencyChange',skill.proficiencyHistory[0]);assert.ok(!('at' in skill.proficiencyHistory[0]));
   for(const sourceType of ['typo',0])await call('/research-skills/'+skill.id,'PATCH',{associations:[{sourceType,sourceId:'0:research-environment-ready'}]},skill.editVersion,400);
   for(const level of ['Developing','2',2.5,5])await call('/research-skills/'+skill.id+'/proficiency','PATCH',{level,confirm:true},skill.editVersion,400);
  });
  await t.test('compatible title/validation edits retain identity, manual proficiency and editor tokens',async()=>{
   const skillVersion=skill.editVersion,meetingVersion=meeting.editVersion;await app.get(Roadmap).edit(0,undefined,'Preparation title edit');await app.get(Roadmap).checkpoint(0,'research-environment-ready',{completed:true});
   const current=await call('/research-skills/'+skill.id);assert.equal(current.associations[0].checkpointIdentity,checkpointIdentity);assert.equal(current.targeted.find(g=>g.targetLevel===2).ready,true);assert.equal(current.proficiency,2);assert.equal(current.editVersion,skillVersion);meeting=await call('/supervisor-meetings/'+meeting.id);assert.equal(meeting.linkedCheckpoints[0].completed,true);assert.equal(meeting.editVersion,meetingVersion);
   meeting=await call('/supervisor-meetings/'+meeting.id+'/actions','POST',{title:'Manual action',phase:'post_meeting',status:'pending',linkedTaskIds:['2026-11-15:stage2-task']},meetingVersion,201);fields('MeetingAction',meeting.actions[0]);assert.equal(meeting.actions[0].progress.percentage,100);assert.equal(meeting.actions[0].status,'pending');
  });
  await t.test('replacement reusing public checkpoint IDs cannot retarget historical links',async()=>{
   const levels=await call('/roadmap'),roadmap={schemaVersion:1,roadmapId:'stage2-replacement',title:'Owned replacement',durationYears:3,levels:levels.map(l=>({levelNumber:l.levelNumber,title:l.title,description:l.description,objectives:l.objectives,checkpoints:l.checkpoints.map(c=>({id:c.id,title:'New generation '+c.title,required:c.mandatory}))}))};
   const preview=await call('/roadmap/import/preview','POST',{roadmap});assert.equal((await call('/roadmap/import/preview','POST',{roadmap})).digest,preview.digest);assert.ok(preview.roadmap.levels.every(l=>l.checkpoints.every(c=>!('checkpointIdentity' in c))));await call('/roadmap/import/confirm','POST',{roadmap,digest:preview.digest,revision:preview.revision,confirmation:'REPLACE ROADMAP'},undefined,201);
   const current=await call('/research-skills/'+skill.id);assert.equal(current.associations[0].missing,true);assert.equal(current.associations[0].resolution,'missing');assert.equal(current.targeted.find(g=>g.targetLevel===2).ready,false);assert.equal(current.proficiency,2);
   meeting=await call('/supervisor-meetings/'+meeting.id);assert.equal(meeting.linkedCheckpoints[0].missing,true);assert.equal(meeting.linkedCheckpoints[0].completed,null);assert.equal(meeting.actions[0].status,'pending');assert.equal(meeting.actions[0].progress.percentage,100);
   const replacement=(await call('/roadmap'))[0].checkpoints[0];assert.notEqual(replacement.checkpointIdentity,checkpointIdentity);
   await app.get(Roadmap).checkpoint(0,'research-environment-ready',{completed:true});assert.equal((await call('/research-skills/'+skill.id)).targeted.find(g=>g.targetLevel===2).ready,false);
   // Deliberate unlink/relink attests to the new checkpoint; no automatic migration.
   const cleared=await call('/research-skills/'+skill.id,'PATCH',{associations:[]},current.editVersion);await call('/research-skills/'+skill.id,'PATCH',{associations:[{sourceType:'roadmap_checkpoint',sourceId:'0:research-environment-ready',targetLevel:2}]},cleared.editVersion);assert.equal((await call('/research-skills/'+skill.id)).targeted.find(g=>g.targetLevel===2).ready,true);
  });
  await t.test('new backup identities round-trip; rollback keeps identities and editor versions',async()=>{
   const saved=await backup.export(),skillBefore=await call('/research-skills/'+skill.id),preview=await backup.preview(saved),repo=app.get(Repo),replace=repo.replace.bind(repo);repo.replace=async(...args)=>{await replace(...args);throw new Error('Stage 2 rollback');};try{await assert.rejects(backup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'}),/Stage 2 rollback/);}finally{repo.replace=replace;}
   assert.deepEqual((await backup.export()).data,saved.data);assert.equal((await call('/research-skills/'+skill.id)).editVersion,skillBefore.editVersion);
   const fresh=await backup.preview(saved);await backup.restore({backup:saved,...fresh,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await backup.export()).data,saved.data);assert.notEqual((await call('/research-skills/'+skill.id)).editVersion,skillBefore.editVersion);assert.equal((await call('/research-skills/'+skill.id)).targeted.find(g=>g.targetLevel===2).ready,true);
  });
  await t.test('identity-less legacy backups remain accepted and checkpoint progress stays explicitly unverified',async()=>{
   const legacy=await backup.export();for(const level of legacy.data.roadmapLevels)for(const checkpoint of level.checkpoints)delete checkpoint.checkpointIdentity;for(const row of legacy.data.researchSkills)for(const link of row.associations)delete link.checkpointIdentity;for(const row of legacy.data.supervisorMeetings)for(const ref of row.checkpointRefs)delete ref.checkpointIdentity;
   const preview=await backup.preview(legacy);await backup.restore({backup:legacy,...preview,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await backup.export()).data,legacy.data);
   const current=await call('/research-skills/'+skill.id);assert.equal(current.associations[0].resolution,'unverified');assert.equal(current.associations[0].completed,false);assert.equal(current.targeted.find(g=>g.targetLevel===2).ready,false);assert.equal(current.proficiency,2);
   const linked=await call('/supervisor-meetings/'+meeting.id);assert.equal(linked.linkedCheckpoints[0].resolution,'unverified');assert.equal(linked.linkedCheckpoints[0].completed,null);assert.equal(linked.actions[0].status,'pending');assert.equal(linked.actions[0].progress.percentage,100);
   const rev=await revision(),before=(await backup.export()).data;await call('/dashboard');await call('/achievements');await call('/research-skills');await call('/supervisor-meetings');assert.equal(await revision(),rev);assert.deepEqual((await backup.export()).data,before);
  });
  await t.test('malformed backup primitive shapes fail safely rather than being coerced or traversed unchecked',async()=>{
   const saved=await backup.export();for(const change of [f=>f.data.researchSkills[0].proficiency='2',f=>f.data.supervisorMeetings[0].notes.agenda={},f=>f.data.roadmapLevels[0].checkpoints[0].completed='true',f=>f.data.researchSkills[0].prerequisiteIds={},f=>f.data.weeklyPlans[0].tasks=null]){const bad=structuredClone(saved);change(bad);await assert.rejects(backup.preview(bad),e=>e.getStatus()===400);}
  });
 }finally{if(own)await own.cleanup();}
});
