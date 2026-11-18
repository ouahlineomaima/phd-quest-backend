import { browserWriteBoundary } from './browser-write-boundary';
import { MAX_BACKUP_BYTES } from '../modules/backup/persistence/interfaces/backup.interface';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppEnvironment } from '../config/environment';
import { ApiExceptionFilter } from './api-exception.filter';
import { createValidationPipe } from './validation';
import { requestLogging } from './request-logging';

export function configureApi(app: NestExpressApplication, config: ConfigService<AppEnvironment, true>) {
  app.use(requestLogging());
  app.use(browserWriteBoundary(config.get('CORS_ORIGINS', { infer: true }).split(',')));
  // Only backup uploads receive the larger, bounded allowance; plan-import limits remain unchanged.
  app.use('/api/backup', require('express').json({ limit: MAX_BACKUP_BYTES + 4096 }));
  app.useBodyParser('json', { limit: config.get('BODY_LIMIT_BYTES', { infer: true }) });
  // Normalize parser errors before Nest converts SyntaxError and discards its type marker.
  app.use((error: unknown, _request: IncomingMessage, _response: ServerResponse, next: (error?: unknown) => void) => {
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.parse.failed') return next(new BadRequestException({ code: 'INVALID_JSON', message: 'Malformed JSON request' }));
      if (error.type === 'entity.too.large' || error.type === 'parameters.too.many') return next(new PayloadTooLargeException({ code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large' }));
      if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') return next(new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported request encoding' }));
    }
    next(error);
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }).split(',') });
  app.enableShutdownHooks();
}
