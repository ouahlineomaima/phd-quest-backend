import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'AggregateError',
  'HttpException',
  'InternalServerErrorException',
  'MongoServerError',
  'MongoNetworkError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
]);
export interface SafeErrorDiagnostic {
  type: string;
  frames: string[];
  cause?: SafeErrorDiagnostic;
}
export function safeErrorDiagnostic(error: unknown): SafeErrorDiagnostic {
  try {
    return diagnostic(error);
  } catch {
    return { type: 'Error', frames: [] };
  }
}
function diagnostic(error: unknown, depth = 0, seen = new Set<unknown>()): SafeErrorDiagnostic {
  if (!(error instanceof Error) || seen.has(error)) return { type: 'UnknownError', frames: [] };
  seen.add(error);
  const frames: string[] = [];
  // Error messages and function names can contain research content. Retain only
  // existing code locations under this application, plus Node internal locations.
  for (const line of (error.stack ?? '').split('\n').slice(1)) {
    const match = /(?:\(|\s)((?:[A-Za-z]:)?[^()\s]+):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    const [, file, row, column] = match;
    if (/^node:internal\/[a-zA-Z0-9_/-]+$/.test(file)) {
      frames.push(`${file}:${row}:${column}`);
    } else {
      const full = resolve(file),
        local = relative(process.cwd(), full).replaceAll('\\', '/');
      if (
        isAbsolute(local) ||
        local.startsWith('../') ||
        !/^(src|dist|node_modules)\/[a-zA-Z0-9_@./-]+\.(?:[cm]?js|ts)$/.test(local) ||
        !existsSync(full)
      )
        continue;
      frames.push(`${local}:${row}:${column}`);
    }
    if (frames.length >= 12) break;
  }
  return {
    type: ERROR_TYPES.has(error.name) ? error.name : 'Error',
    frames,
    ...(depth < 2 && error.cause instanceof Error
      ? { cause: diagnostic(error.cause, depth + 1, seen) }
      : {}),
  };
}
