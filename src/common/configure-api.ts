import { ConfigService } from '@nestjs/config';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppEnvironment } from '../config/environment';
import { ApiExceptionFilter } from './api-exception.filter';
import { createValidationPipe } from './validation';

export function configureApi(app: NestExpressApplication, config: ConfigService<AppEnvironment, true>) {
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT_BYTES', { infer: true }) });
  app.useBodyParser('urlencoded', { limit: config.get('BODY_LIMIT_BYTES', { infer: true }), extended: false, parameterLimit: 100 });
  // Normalize parser errors before Nest converts SyntaxError and discards its type marker.
  app.use((error: unknown, _request: IncomingMessage, _response: ServerResponse, next: (error?: unknown) => void) => {
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.parse.failed') return next(new BadRequestException({ code: 'INVALID_JSON', message: 'Malformed JSON request' }));
      if (error.type === 'entity.too.large') return next(new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large' }));
    }
    next(error);
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }).split(',') });
  app.enableShutdownHooks();
}
