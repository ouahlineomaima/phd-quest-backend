import { Logger } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';

export function requestLogging(logger: Pick<Logger, 'log'> = new Logger('HTTP')) {
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const started = performance.now();
    // Capture before Express routing can alter the URL. Never log queries, headers or bodies.
    const path = (request.url ?? '/').split('?')[0];
    response.once('finish', () =>
      logger.log(
        JSON.stringify({
          method: request.method,
          path,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    next();
  };
}
