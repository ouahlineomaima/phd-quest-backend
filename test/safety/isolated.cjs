// Creates its own API and verifies an empty, explicitly named UUID database before any write.
const assert = require('node:assert/strict');
const { reserveDatabase, releaseDatabase } = require('./owned-database.cjs');
require('reflect-metadata');
const pattern = /^phd_quest_(smoke|stage1|stage2|stage3|stage4)_[a-f0-9]{32}$/;
function target(uri, api) {
  if (api)
    throw new Error(
      'External API_BASE_URL is forbidden: the isolated API must be created by this process.',
    );
  if (!uri)
    throw new Error(
      'Explicit disposable SMOKE_MONGODB_URI and --isolated are required; the running application is never a fallback.',
    );
  const parsed = new URL(uri),
    name = decodeURIComponent(parsed.pathname.slice(1));
  if (
    !['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
    !pattern.test(name) ||
    parsed.searchParams.has('dbName')
  )
    throw new Error(
      'Refusing unverified database: use phd_quest_smoke_<32 hex UUID> (never phd_quest).',
    );
  return name;
}
async function isolated(uri, extra = {}) {
  const name = target(uri);
  await reserveDatabase(uri);
  let app;
  async function cleanup() {
    try {
      if (app) await app.close();
    } finally {
      await releaseDatabase(uri);
    }
  }
  try {
    const { NestFactory } = require('@nestjs/core'),
      { Module } = require('@nestjs/common'),
      { ConfigModule, ConfigService } = require('@nestjs/config'),
      { getConnectionToken } = require('@nestjs/mongoose');
    const { DatabaseModule } = require('../../dist/database/database.module'),
      { BackupModule } = require('../../dist/modules/backup/backup.module'),
      { DashboardModule } = require('../../dist/modules/dashboard/dashboard.module'),
      { HealthModule } = require('../../dist/modules/health/health.module');
    const { validateEnvironment } = require('../../dist/config/environment'),
      { configureApi } = require('../../dist/common/configure-api');
    class Owned {}
    Module({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () =>
              validateEnvironment({ ...process.env, ...extra, MONGODB_URI: uri, NODE_ENV: 'test' }),
          ],
        }),
        DatabaseModule,
        BackupModule,
        DashboardModule,
        HealthModule,
      ],
    })(Owned);
    app = await NestFactory.create(Owned, { logger: false, bodyParser: false });
    assert.equal(app.get(getConnectionToken()).name, name);
    configureApi(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    return {
      app,
      connection: app.get(getConnectionToken()),
      base: `http://127.0.0.1:${app.getHttpServer().address().port}/api`,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
module.exports = { target, isolated };
