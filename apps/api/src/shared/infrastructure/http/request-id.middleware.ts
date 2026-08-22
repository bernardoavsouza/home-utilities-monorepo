import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & { requestId?: string };

/**
 * The incoming id is echoed in the response header and in every log line, so it
 * is only reused when it looks like an id: bounded length, no separators or
 * control characters that could forge a log entry.
 */
const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function sanitizeRequestId(incoming: unknown): string | undefined {
  if (typeof incoming !== 'string') {
    return undefined;
  }

  const candidate = incoming.trim();
  if (candidate.length === 0 || candidate.length > REQUEST_ID_MAX_LENGTH) {
    return undefined;
  }

  return REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined;
}

export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const requestId =
    sanitizeRequestId(req.header('x-request-id')) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
