import { ForbiddenException, UnsupportedMediaTypeException } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'node:http';

// Browser write protection, not authentication. Originless JSON CLI requests are
// intentional; cross-site forms cannot supply application/json without preflight.
export function browserWriteBoundary(origins: string[]) {
  const trusted = new Set(origins);
  return (request: IncomingMessage, _response: ServerResponse, next: (error?:unknown)=>void) => {
    if (['GET','HEAD','OPTIONS'].includes(request.method ?? '')) return next();
    const origin = request.headers.origin;
    if (origin !== undefined && !trusted.has(origin)) return next(new ForbiddenException({code:'UNTRUSTED_ORIGIN',message:'This browser origin is not allowed to change application data.'}));
    // Fetch Metadata also rejects originless cross-site browser traffic. Forwarded
    // headers and Host never grant trust. Missing metadata remains valid for CLI.
    if (origin === undefined && request.headers['sec-fetch-site'] === 'cross-site') return next(new ForbiddenException({code:'UNTRUSTED_ORIGIN',message:'Cross-site browser writes are not allowed.'}));
    const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
    if (contentType !== 'application/json') return next(new UnsupportedMediaTypeException({code:'UNSUPPORTED_MEDIA_TYPE',message:'Mutating requests require Content-Type: application/json, including empty commands.'}));
    next();
  };
}
