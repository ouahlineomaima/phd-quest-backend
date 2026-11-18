import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_CONTEXT = Symbol('requestContext');
const REQUEST_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export interface RequestContext {
  requestId: string;
  started: number;
}
export interface DiagnosticRequest {
  headers?: IncomingMessage['headers'];
  method?: string;
  url?: string;
  originalUrl?: string;
  baseUrl?: string;
  route?: { path?: unknown };
  [REQUEST_CONTEXT]?: RequestContext;
}
export interface CorrelationResponse {
  setHeader?: (name: string, value: string) => unknown;
}
export function correlate(
  request: DiagnosticRequest,
  response?: CorrelationResponse,
): RequestContext {
  let context = request[REQUEST_CONTEXT];
  if (!context) {
    const supplied = request.headers?.['x-request-id'];
    context = {
      requestId:
        typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID(),
      started: performance.now(),
    };
    request[REQUEST_CONTEXT] = context;
  }
  response?.setHeader?.('X-Request-ID', context.requestId);
  return context;
}
export function diagnosticRoute(request: DiagnosticRequest): string {
  const route = request.route?.path;
  // Only framework-owned route templates enter logs. Raw URLs may contain notes,
  // tokens, personal data or attacker-controlled log-injection text.
  return typeof route === 'string' && /^\/[A-Za-z0-9_:/.*-]*$/.test(route) ? route : '/[unmatched]';
}
export function diagnosticMethod(request: DiagnosticRequest): string {
  return /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|CONNECT|TRACE)$/.test(request.method ?? '')
    ? (request.method ?? 'UNKNOWN')
    : 'UNKNOWN';
}
