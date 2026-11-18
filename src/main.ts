import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppEnvironment, validateEnvironment } from './config/environment';

async function bootstrap() {
  // Fail invalid configuration before loading the growing feature-module tree.
  // Reuse the same validator and .env handling as AppModule; never log values.
  await ConfigModule.forRoot({ validate: validateEnvironment });
  const { AppModule } = await import('./app.module');
  const { NestFactory } = await import('@nestjs/core');
  const { configureApi } = await import('./common/configure-api');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
  });
  const config = app.get(ConfigService<AppEnvironment, true>);
  configureApi(app, config);
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
void bootstrap().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith('Invalid environment configuration:'))
    Logger.error(error.message, 'Bootstrap');
  Logger.error(
    'Backend startup failed. Check configuration validation and database availability.',
    'Bootstrap',
  );
  process.exit(1);
});
