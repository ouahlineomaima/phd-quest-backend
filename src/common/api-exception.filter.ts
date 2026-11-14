import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Error as MongooseError, mongo } from 'mongoose';

const httpCodes: Record<number, string> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR', 503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<{ originalUrl?: string; url: string }>();
    const response = host.switchToHttp().getResponse();
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown = [];
    if (error instanceof HttpException) {
      statusCode = error.getStatus();
      code = httpCodes[statusCode] ?? 'HTTP_ERROR';
      const body = error.getResponse();
      // Only deliberately public HTTP errors may expose supplied messages.
      if (statusCode < 500 || (statusCode === 503 && typeof body === 'object' && 'code' in body && body.code === 'DATABASE_UNAVAILABLE')) {
        if (typeof body === 'string') message = body;
        else {
          const value = body as { code?: string; message?: string | string[]; details?: unknown };
          code = value.code ?? code;
          message = typeof value.message === 'string' ? value.message : 'Request failed';
          details = value.details ?? [];
        }
      } else if (statusCode === 503) message = 'Service unavailable';
      if (statusCode === 404) message = 'Resource not found';
    } else if (error instanceof MongooseError.CastError || error instanceof MongooseError.ValidationError) {
      statusCode = 400; code = 'INVALID_DATA'; message = 'Invalid data supplied';
    } else if (error instanceof mongo.MongoServerError && error.code === 11000) {
      statusCode = 409; code = 'CONFLICT'; message = 'Resource already exists';
    } else if (error instanceof MongooseError.MongooseServerSelectionError || error instanceof mongo.MongoNetworkError || error instanceof mongo.MongoServerSelectionError) {
      statusCode = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is unavailable';
    }
    // Body-parser errors are raised before controllers and have a stable type marker.
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.too.large') {
        statusCode = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request payload is too large';
      } else if (error.type === 'entity.parse.failed') {
        statusCode = 400; code = 'INVALID_JSON'; message = 'Malformed JSON request';
      }
    }
    response.status(statusCode).json({
      statusCode, code, message, details, timestamp: new Date().toISOString(),
      path: (request.originalUrl ?? request.url).split('?')[0],
    });
  }
}
