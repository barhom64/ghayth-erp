import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Request-scoped correlation context. A single id is assigned per request and
// carried through the async call stack, so the pino `mixin` in lib/logger.ts
// can stamp `reqId` onto every log line without changing any call site.
interface RequestContext {
  reqId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The correlation id of the in-flight request, or undefined outside one. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.reqId;
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
  storage.run({ reqId }, () => next());
}
