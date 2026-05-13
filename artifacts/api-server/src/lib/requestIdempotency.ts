import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

// Resolve a stable per-request token used as the deterministic suffix for
// journal sourceKey values when there is no upstream domain record. Honours
// the standard `Idempotency-Key` HTTP header so retried POSTs collapse onto
// the same journal entry; falls back to a UUID so the value is never a
// Date.now() timestamp (which would silently defeat the GL idempotency
// check in financialEngine.postJournalEntry).
export function requestIdempotencyToken(req: Request): string {
  const header = req.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed && /^[A-Za-z0-9_:.-]{8,128}$/.test(trimmed)) {
    return trimmed;
  }
  return randomUUID();
}

// Surface the engine's idempotency-replay flag back to the caller so a
// retried POST is observably a no-op (instead of looking like a fresh
// posting). Sets `X-Idempotent-Replay` and, when the caller passed one,
// echoes `Idempotency-Key` so middleboxes / clients can correlate.
export function markIdempotencyReplay(req: Request, res: Response, replayed: boolean): void {
  res.setHeader("X-Idempotent-Replay", replayed ? "true" : "false");
  const header = req.headers["idempotency-key"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === "string" && raw.trim()) {
    res.setHeader("Idempotency-Key", raw.trim());
  }
}

// Convenience wrapper for routes that want both the response header AND
// a `idempotentReplay` field in the JSON body. Spread the return value
// into `res.json({...})` so clients with no header access (e.g. browser
// fetch with `mode: 'no-cors'`) can still observe the replay.
export function idempotencyResponseMeta(
  req: Request,
  res: Response,
  replayed: boolean
): { idempotentReplay: boolean } {
  markIdempotencyReplay(req, res, replayed);
  return { idempotentReplay: replayed };
}

// Read a dry-run flag from the request (query `?dryRun=true` or body
// `dryRun: true`). Used by booking endpoints that want to return the
// computed journal lines without actually posting — useful for UI
// "review before post" panels on expense / voucher / manual journal.
export function isDryRun(req: Request): boolean {
  const fromQuery = String(
    typeof req.query?.dryRun === "string" ? req.query.dryRun : ""
  ).toLowerCase();
  if (fromQuery === "true" || fromQuery === "1") return true;
  const body = req.body as Record<string, unknown> | undefined;
  if (body && (body.dryRun === true || body.dryRun === "true" || body.dryRun === 1)) {
    return true;
  }
  return false;
}

