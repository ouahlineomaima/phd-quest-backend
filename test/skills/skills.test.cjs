// All writes/restores/drops are restricted to two verified, randomly owned databases.
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),mongoose=require('mongoose');require('reflect-metadata');
const {NestFactory}=require('@nestjs/core'),{Module}=require('@nestjs/common'),{ConfigModule,ConfigService}=require('@nestjs/config'),{getConnectionToken}=require('@nestjs/mongoose');
const load=(file,name)=>require('../../dist/'+file)[name];
const DatabaseModule=load('database/database.module','DatabaseModule'),BackupModule=load('modules/backup/backup.module','BackupModule'),validateEnvironment=load('config/environment','validateEnvironment'),configureApi=load('common/configure-api','configureApi');
const Backup=load('modules/backup/business/services/backup.service','BackupService'),Repo=load('modules/backup/persistence/repositories/backup.repository','BackupRepository'),Plans=load('modules/weekly-plans/business/services/weekly-plans.service','WeeklyPlansService'),Tasks=load('modules/weekly-plans/business/services/task-progress.service','TaskProgressService'),Goals=load('modules/goals/business/services/goals.service','GoalsService'),Roadmap=load('modules/roadmap/business/services/roadmap.service','RoadmapService');
const sections=['skillCategories','researchSkills','skillTreeState'];
const names=Array.from({length:2},()=>`phd_quest_skills_validation_${randomUUID().replaceAll('-','')}`),uris=names.map(name=>{const uri=new URL(process.env.MONGODB_URI);uri.pathname='/'+name;return uri.toString();});
async function create(uri,index){class Owned{}Module({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,ignoreEnvVars:true,load:[()=>validateEnvironment({...process.env,MONGODB_URI:uri,NODE_ENV:'test',APP_TIMEZONE:'Africa/Casablanca'})]}),DatabaseModule,BackupModule]})(Owned);const app=await NestFactory.create(Owned,{logger:false,bodyParser:false});configureApi(app,app.get(ConfigService));await app.listen(0,'127.0.0.1');assert.equal(app.get(getConnectionToken()).name,names[index]);return app;}
test('Research Skill Tree: isolated lifecycle, manual proficiency, readiness, history and atomic backups',async t=>{
 let source,target;
 try{
  source=await create(uris[0],0);target=await create(uris[1],1);
  const base=`http://127.0.0.1:${source.getHttpServer().address().port}/api/research-skills`,backup=source.get(Backup),targetBackup=target.get(Backup),connection=source.get(getConnectionToken()),plans=source.get(Plans),tasks=source.get(Tasks),goals=source.get(Goals),roadmap=source.get(Roadmap);
  async function call(path='',method='GET',body,status=200){let version;const parts=path.split('/').filter(Boolean);if(method!=='GET'&&parts.length&&(method!=='POST'||parts[1]==='evidence')){const current=await(await fetch(base)).json();const row=parts[0]==='categories'?current.categories.find(c=>c.id===parts[1]):current.skills.find(c=>c.id===parts[0]);version=row?.editVersion;}const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(version?{'if-match':JSON.stringify(version)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;}
  const tree=()=>call(),find=async id=>(await tree()).skills.find(s=>s.id===id),targeted=(skill,level)=>skill.targeted.find(g=>g.targetLevel===level),untargeted=(skill,type)=>skill.untargeted.find(g=>g.sourceType===type);
  let category,skill,second,third,evidence,saved;
  const initial=(await backup.export()).data;
  await t.test('read does not seed; explicit concurrent initialization is atomic and idempotent',async()=>{
   let state=await tree();assert.equal(state.initialized,false);assert.deepEqual(state.categories,[]);assert.deepEqual(state.skills,[]);assert.deepEqual((await backup.export()).data,initial);
   await Promise.all([call('/initialize','POST',{},201),call('/initialize','POST',{},201)]);state=await tree();assert.equal(state.initialized,true);assert.equal(state.categories.length,6);assert.equal(state.skills.length,24);assert.ok(state.skills.every(s=>s.proficiency===0));assert.equal(new Set(state.skills.map(s=>s.id)).size,24);
   await call('/initialize','POST',{},201);assert.equal((await tree()).skills.length,24);assert.equal((await backup.export()).counts.skillTreeState,1);
  });
  await t.test('custom categories and skills, ordering, strict validation and cycle prevention',async()=>{
   category=await call('/categories','POST',{name:'Custom research',description:'Owned validation category',icon:'book',color:'purple',sortOrder:12},201);
   await call('/categories/'+category.id,'PATCH',{name:'Specialist research',sortOrder:2});
   skill=await call('','POST',{categoryId:category.id,name:'Method evaluation',sortOrder:5},201);second=await call('','POST',{categoryId:category.id,name:'Evidence synthesis',prerequisiteIds:[skill.id]},201);third=await call('','POST',{categoryId:category.id,name:'Research argument',prerequisiteIds:[second.id]},201);
   await call('/'+skill.id,'PATCH',{prerequisiteIds:[skill.id]},400);await call('/'+skill.id,'PATCH',{prerequisiteIds:[third.id]},400);await call('/'+skill.id,'PATCH',{prerequisiteIds:[second.id,second.id]},400);
   await call('','POST',{name:'Invalid category',categoryId:'0'.repeat(24)},404);
   for(const input of [{name:' ',categoryId:category.id},{name:'Injected proficiency',categoryId:category.id,proficiency:4}])await call('','POST',input,400);
   await call('/'+skill.id,'PATCH',{name:'Evaluate research methods',sortOrder:1});assert.equal((await find(skill.id)).sortOrder,1);
   await call('/categories','POST',{name:'Unsafe icon',icon:'<svg onload=alert(1)>',color:'purple'},400);
  });
  await t.test('manual proficiency supports skipping/decreasing and no-op history without hard prerequisite locks',async()=>{
   await call('/'+third.id+'/proficiency','PATCH',{level:4,confirm:true,justification:'Independent assessment'});let current=await find(third.id);assert.equal(current.proficiency,4);assert.equal(current.proficiencyHistory.length,1);assert.equal(current.proficiencyHistory[0].fromLevel,0);assert.equal(current.proficiencyHistory[0].toLevel,4);assert.equal((await call('/summary')).advanced,1);
   await call('/'+third.id+'/proficiency','PATCH',{level:4,confirm:true});assert.equal((await find(third.id)).proficiencyHistory.length,1);
   await call('/'+third.id+'/proficiency','PATCH',{level:1,confirm:true,justification:'Reassessment'});assert.equal((await find(third.id)).proficiencyHistory.length,2);
   for(const input of [{level:5,confirm:true},{level:-1,confirm:true},{level:2},{level:2,confirm:false},{level:2.5,confirm:true}])await call('/'+third.id+'/proficiency','PATCH',input,400);
   assert.equal((await find(skill.id)).proficiency,0);assert.equal((await call('/summary')).inDevelopment,1);const unchanged=(await backup.export()).data;for(const section of Object.keys(initial).filter(s=>!sections.includes(s)))assert.deepEqual(unchanged[section],initial[section]);
  });
  const example=require('../../docs/contracts/weekly-plan.v1.example.json');
  const makeWeek=async weekId=>{const end=new Date(weekId+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+6);return plans.confirm({...structuredClone(example),weekId,startDate:weekId,endDate:end.toISOString().slice(0,10),tasks:[{...example.tasks[0],id:'practice',date:weekId,xpReward:10}]});};
  const weekA=await makeWeek('2026-11-15'),weekB=await makeWeek('2026-11-22'),goal=await goals.create({title:'Owned skill goal',type:'research'}),refs=['2026-11-15:practice','2026-11-22:practice'];
  const association=(sourceType,sourceId,targetLevel=null)=>({sourceType,sourceId,targetLevel});
  const links=[association('weekly_task',refs[0],2),association('research_goal',goal.id,2),association('roadmap_checkpoint','0:research-environment-ready',2),association('weekly_task',refs[1])];
  await t.test('individual targets coexist, can change, share sources and reject duplicate/dangling activities',async()=>{
   await call('/'+skill.id,'PATCH',{associations:links});await call('/'+second.id,'PATCH',{associations:[association('weekly_task',refs[0],4)]});
   for(const associations of [[links[0],links[0]],[association('weekly_task',refs[0],0)],[association('research_goal',goal.id,5)],[association('weekly_task','2026-11-15:missing',2)],[association('weekly_task','2026-11-16:practice')],[association('research_goal','0'.repeat(24))],[association('roadmap_checkpoint','0:missing')]])await call('/'+skill.id,'PATCH',{associations},400);
   await call('/'+skill.id,'PATCH',{associations:links.map((l,i)=>i===0?{...l,targetLevel:3}:l)});assert.equal((await find(skill.id)).associations[0].targetLevel,3);await call('/'+skill.id,'PATCH',{associations:links});await call('/'+second.id,'PATCH',{associations:[{sourceType:'weekly_task',sourceId:refs[0]}]});assert.equal((await find(second.id)).associations[0].targetLevel,null);await call('/'+second.id,'PATCH',{associations:[association('weekly_task',refs[0],4)]});
  });
  await t.test('mixed targeted readiness, separate Option B indicators, reopen and manual independence',async()=>{
   let current=await find(skill.id);assert.equal(targeted(current,2).total,3);assert.equal(targeted(current,2).ready,false);assert.equal(untargeted(current,'weekly_task').total,1);assert.equal(untargeted(current,'research_goal').percentage,null);
   await tasks.change(weekA.id,'practice','complete',10);await goals.transition(goal.id,'complete');current=await find(skill.id);assert.equal(targeted(current,2).completed,2);assert.equal(targeted(current,2).percentage,67);assert.equal(targeted(current,2).ready,false);
   await roadmap.checkpoint(0,'research-environment-ready',{completed:true});current=await find(skill.id);assert.equal(targeted(current,2).ready,true);assert.equal(current.proficiency,0);assert.equal(untargeted(current,'weekly_task').completed,0);assert.equal(targeted(await find(second.id),4).ready,true);
   await tasks.change(weekA.id,'practice','reopen');assert.equal(targeted(await find(skill.id),2).ready,false);await tasks.change(weekA.id,'practice','complete',10);await call('/'+skill.id+'/proficiency','PATCH',{level:3,confirm:true});await goals.transition(goal.id,'reopen');current=await find(skill.id);assert.equal(targeted(current,2).ready,false);assert.equal(current.proficiency,3);
  });
  await t.test('evidence CRUD, safe protocols, credential rejection and absence of source side effects',async()=>{
   const before=(await backup.export()).data;
   let result=await call('/'+skill.id+'/evidence','POST',{title:'Assessment note',type:'note',description:'Reasoned evidence'},201);let current=await find(skill.id);evidence=current.evidence.at(-1);assert.ok(evidence.id);
   await call('/'+skill.id+'/evidence/'+evidence.id,'PATCH',{title:'Updated assessment',description:'More detail'});assert.equal((await find(skill.id)).evidence.find(e=>e.id===evidence.id).title,'Updated assessment');
   await call('/'+skill.id+'/evidence','POST',{title:'Paper',type:'external_link',url:'https://example.org/paper'},201);
   for(const url of ['javascript:alert(1)','file:///private','https://user:password@example.org'])await call('/'+skill.id+'/evidence','POST',{title:'Unsafe',type:'external_link',url},400);
   await call('/'+skill.id+'/evidence/'+evidence.id,'DELETE',{});assert.equal((await find(skill.id)).evidence.some(e=>e.id===evidence.id),false);
   const after=(await backup.export()).data;for(const section of Object.keys(before).filter(s=>!sections.includes(s)))assert.deepEqual(after[section],before[section]);
  });
  await t.test('missing historical links suppress targeted readiness and round trip transparently',async()=>{
   const current=await find(skill.id),missing=association('research_goal','0'.repeat(24),2);
   await connection.collection('research_skills').updateOne({_id:new mongoose.Types.ObjectId(skill.id)},{$set:{associations:[...current.associations.map(({sourceType,sourceId,targetLevel})=>({sourceType,sourceId,targetLevel})),missing]}});
   const resolved=await find(skill.id);assert.equal(targeted(resolved,2).missing,1);assert.equal(targeted(resolved,2).percentage,null);assert.equal(targeted(resolved,2).ready,false);assert.ok(resolved.associations.some(a=>a.missing));
   await call('/'+skill.id,'PATCH',{description:'Historical missing link retained'});saved=await backup.export();const preview=await targetBackup.preview(saved);await targetBackup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await targetBackup.export()).data,saved.data);
  });
  await t.test('invalid target/cycle/evidence/marker backups and injected rollback leave all collections intact',async()=>{
   const before=(await targetBackup.export()).data;
   const targetSkill=f=>f.data.researchSkills.find(s=>s.id===skill.id),targetSecond=f=>f.data.researchSkills.find(s=>s.id===second.id);
   for(const mutate of [f=>targetSkill(f).associations[0].targetLevel=0,f=>targetSkill(f).prerequisiteIds=[third.id],f=>targetSkill(f).proficiency=9,f=>targetSkill(f).evidence[0].url='javascript:alert(1)',f=>targetSkill(f).categoryId='0'.repeat(24),f=>f.data.skillTreeState.push(f.data.skillTreeState[0]),f=>{targetSecond(f).id=skill.id;},f=>targetSkill(f).proficiencyHistory[0].toLevel=4]){const bad=structuredClone(saved);mutate(bad);await assert.rejects(targetBackup.preview(bad),e=>e.getStatus()===400);assert.deepEqual((await targetBackup.export()).data,before);}
   const repo=target.get(Repo),replace=repo.replace.bind(repo),preview=await targetBackup.preview(saved);repo.replace=async(...args)=>{await replace(...args);throw new Error('Injected Skill Tree restore failure');};await assert.rejects(targetBackup.restore({backup:saved,...preview,confirmation:'REPLACE ALL DATA'}),/Injected Skill Tree/);repo.replace=replace;assert.deepEqual((await targetBackup.export()).data,before);
  });
  await t.test('archiving preserves history, category policy and initialization marker without reseeding',async()=>{
   const prior=await find(skill.id);await call('/'+skill.id+'/archive','PATCH',{});await call('/'+skill.id,'PATCH',{name:'Forbidden'},409);await call('/'+skill.id+'/proficiency','PATCH',{level:4,confirm:true},409);
   let current=await find(skill.id);assert.deepEqual(current.proficiencyHistory,prior.proficiencyHistory);assert.deepEqual(current.evidence,prior.evidence);
   await call('/categories/'+category.id+'/archive','PATCH',{});await call('/categories/'+category.id,'PATCH',{name:'Forbidden'},409);
   const state=await tree();for(const s of state.skills.filter(s=>!s.archivedAt&&s.categoryId!==category.id))await call('/'+s.id+'/archive','PATCH',{});
   await call('/initialize','POST',{},201);const after=await tree();assert.equal(after.skills.length,state.skills.length);assert.equal(after.initialized,true);
   const archived=await backup.export(),preview=await targetBackup.preview(archived);await targetBackup.restore({backup:archived,...preview,confirmation:'REPLACE ALL DATA'});assert.deepEqual((await targetBackup.export()).data,archived.data);
  });
  await t.test('legacy, Focus-era and Meeting-era backups restore empty uninitialized trees',async()=>{
   const old=structuredClone(saved);for(const section of sections){delete old.data[section];delete old.counts[section];}
   for(const omitted of [[],['supervisors','supervisorMeetings'],['supervisors','supervisorMeetings','focusSessions']]){const input=structuredClone(old);for(const section of omitted){delete input.data[section];delete input.counts[section];}const preview=await targetBackup.preview(input);await targetBackup.restore({backup:input,...preview,confirmation:'REPLACE ALL DATA'});const restored=await targetBackup.export();for(const section of sections)assert.equal(restored.counts[section],0);assert.deepEqual(restored.data.weeklyPlans,saved.data.weeklyPlans);}
  });
 }finally{if(source)await source.close();if(target)await target.close();for(let i=0;i<names.length;i++){assert.match(names[i],/^phd_quest_skills_validation_[a-f0-9]{32}$/);const db=await mongoose.createConnection(uris[i]).asPromise();assert.equal(db.name,names[i]);await db.dropDatabase();await db.close();}}
});
