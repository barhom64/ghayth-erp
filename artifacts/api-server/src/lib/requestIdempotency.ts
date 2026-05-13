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

