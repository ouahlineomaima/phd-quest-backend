import { Logger } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { correlate, diagnosticMethod, diagnosticRoute } from './request-context';
export function requestLogging(logger: Pick<Logger, 'log'> = new Logger('HTTP')) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const context = correlate(request, response);
    response.once('finish', () =>
      logger.log(
        JSON.stringify({
          requestId: context.requestId,
          method: diagnosticMethod(request),
          path: diagnosticRoute(request),
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - context.started),
        }),
      ),
    );
    next();
  };
}
