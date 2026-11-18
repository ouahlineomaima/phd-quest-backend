const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process'),mongoose=require('mongoose');
test('an early isolated smoke assertion still closes its API and removes only its verified database',async()=>{
 const name='phd_quest_smoke_'+randomUUID().replaceAll('-',''),uri=new URL(process.env.MONGODB_URI);uri.pathname='/'+name;
 const before=await mongoose.createConnection(uri.toString()).asPromise();try{assert.equal(before.name,name);assert.equal((await before.db.listCollections().toArray()).length,0);}finally{await before.close();}
 const result=spawnSync(process.execPath,['test/plans/api.smoke.cjs','--isolated','--fail-after-confirm'],{encoding:'utf8',timeout:60000,env:{...process.env,SMOKE_MONGODB_URI:uri.toString(),API_BASE_URL:''}});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/Injected isolated smoke failure after confirmation/);
 const after=await mongoose.createConnection(uri.toString()).asPromise();try{assert.equal(after.name,name);assert.equal((await after.db.listCollections().toArray()).length,0,'Injected failure must leave no API-owned collections');}finally{await after.close();}
});
