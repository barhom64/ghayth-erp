import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Correlation context for one unit of execution. A single id is assigned per
// unit — an HTTP request OR a background unit (a cron job run, a cross-domain
// event delivery) — and carried through the async call stack, so the pino
// `mixin` in lib/logger.ts can stamp `reqId` onto every log line without
// changing any call site.
interface CorrelationContext {
  reqId: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

/** The correlation id of the in-flight execution unit, or undefined outside one. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.reqId;
}

/**
 * Run `fn` inside a correlation context carrying `reqId`. Used to give a
 * background execution unit — a cron job run, a cross-domain event delivery —
 * the same per-unit log correlation an HTTP request gets from
 * `requestContextMiddleware`: every log line emitted within `fn` and its async
 * continuations is stamped with `reqId`.
 */
export function runWithCorrelationId<T>(reqId: string, fn: () => T): T {
  return storage.run({ reqId }, fn);
}

/**
 * First middleware in the chain. Assigns a correlation id (honouring an
 * inbound `X-Request-Id` so an upstream proxy/caller's id is preserved),
 * echoes it back as the `X-Request-Id` response header, mirrors it onto
 * `req.id` so pino-http's access log uses the same id, and runs the rest of
 * the request inside an AsyncLocalStorage context.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers["x-request-id"];
  const reqId = (typeof inbound === "string" && inbound.trim()) || randomUUID();
  (req as { id?: string }).id = reqId;
  res.setHeader("X-Request-Id", reqId);
  runWithCorrelationId(reqId, () => next());
}
