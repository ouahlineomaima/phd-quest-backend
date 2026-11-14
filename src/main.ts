import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApi } from './common/configure-api';
import { AppEnvironment } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, abortOnError: false });
  const config = app.get(ConfigService<AppEnvironment, true>);
  configureApi(app, config);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
void bootstrap().catch(() => {
  Logger.error('Backend startup failed. Check configuration validation and database availability.', 'Bootstrap');
  process.exit(1);
});
