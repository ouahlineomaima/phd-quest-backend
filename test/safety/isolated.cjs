// Creates its own API and verifies an empty, explicitly named UUID database before any write.
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {randomUUID} = require('node:crypto');
require('reflect-metadata');
const pattern = /^phd_quest_(smoke|stage1|stage2)_[a-f0-9]{32}$/;
function target(uri, api) {
  if (api) throw new Error('External API_BASE_URL is forbidden: the isolated API must be created by this process.');
  if (!uri) throw new Error('Explicit disposable SMOKE_MONGODB_URI and --isolated are required; the running application is never a fallback.');
  const parsed = new URL(uri), name = decodeURIComponent(parsed.pathname.slice(1));
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) || !pattern.test(name) || parsed.searchParams.has('dbName')) throw new Error('Refusing unverified database: use phd_quest_smoke_<32 hex UUID> (never phd_quest).');
  return name;
}
async function isolated(uri, extra = {}) {
  const name = target(uri), owner = randomUUID();
  const probe = await mongoose.createConnection(uri).asPromise();
  assert.equal(probe.name, name);
  try {
    assert.equal((await probe.db.listCollections().toArray()).length, 0, 'Disposable target must be empty; refusing existing records');
    await probe.collection('_test_owner').insertOne({_id:owner});
  } finally { await probe.close(); }
  let app;
  async function cleanup() {
    if (app) await app.close();
    target(uri);const db = await mongoose.createConnection(uri).asPromise();
    try { assert.equal(db.name,name);assert.ok(await db.collection('_test_owner').findOne({_id:owner}),'Ownership proof required for cleanup');await db.dropDatabase(); }
    finally { await db.close(); }
  }
  try {
    const {NestFactory}=require('@nestjs/core'),{Module}=require('@nestjs/common'),{ConfigModule,ConfigService}=require('@nestjs/config'),{getConnectionToken}=require('@nestjs/mongoose');
    const {DatabaseModule}=require('../../dist/database/database.module'),{BackupModule}=require('../../dist/modules/backup/backup.module'),{DashboardModule}=require('../../dist/modules/dashboard/dashboard.module'),{HealthModule}=require('../../dist/modules/health/health.module');
    const {validateEnvironment}=require('../../dist/config/environment'),{configureApi}=require('../../dist/common/configure-api');
    class Owned {} Module({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true,ignoreEnvVars:true,load:[()=>validateEnvironment({...process.env,...extra,MONGODB_URI:uri,NODE_ENV:'test'})]}),DatabaseModule,BackupModule,DashboardModule,HealthModule]})(Owned);
    app=await NestFactory.create(Owned,{logger:false,bodyParser:false});
    assert.equal(app.get(getConnectionToken()).name,name);
    configureApi(app,app.get(ConfigService));await app.listen(0,'127.0.0.1');
    return {app,connection:app.get(getConnectionToken()),base:`http://127.0.0.1:${app.getHttpServer().address().port}/api`,cleanup};
  } catch(error) { await cleanup();throw error; }
}
module.exports={target,isolated};
