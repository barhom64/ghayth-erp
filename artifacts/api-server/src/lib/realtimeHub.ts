// ════════════════════════════════════════════════════════════════════════════
// realtimeHub — server→client live push over SSE (Server-Sent Events).
//
// Purpose: when ANYTHING changes on the server (every operational write goes
// through emitEvent → eventBus), push a tiny notification to that company's
// connected clients so their UI refetches and the change "jumps" in without a
// manual refresh — the web and the native app stay live-linked.
//
// Why SSE (not WebSocket): one-way server→client is all we need (the client
// already sends changes via the normal API); SSE rides plain HTTP, passes the
// same CORS/auth, works in the Capacitor WebView, and auto-reconnects — far
// less moving parts than a WS server.
//
// Tenant isolation: clients are bucketed by companyId; an event is delivered
// ONLY to clients of its own company. A client is registered after auth, so
// it can only ever land in its own bucket.
// ════════════════════════════════════════════════════════════════════════════
import type { Response } from "express";
import { eventBus } from "./eventBus.js";
import { logger } from "./logger.js";

interface Client {
  res: Response;
  userId: number;
}

// companyId → set of connected clients.
const buckets = new Map<number, Set<Client>>();

export function realtimeClientCount(companyId?: number): number {
  if (companyId != null) return buckets.get(companyId)?.size ?? 0;
  let n = 0;
  for (const set of buckets.values()) n += set.size;
  return n;
}

export function addClient(companyId: number, client: Client): void {
  let set = buckets.get(companyId);
  if (!set) { set = new Set(); buckets.set(companyId, set); }
  set.add(client);
}

export function removeClient(companyId: number, client: Client): void {
  const set = buckets.get(companyId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) buckets.delete(companyId);
}

/** Serialise + write one SSE frame; swallows a dead socket. */
function writeFrame(res: Response, payload: unknown): void {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* socket already closed — cleanup happens on the 'close' event */
  }
}

/** Push an event to every client of one company (tenant-scoped). */
export function broadcast(companyId: number, data: { action: string; entity: string; entityId: number }): void {
  const set = buckets.get(companyId);
  if (!set || set.size === 0) return;
  for (const client of set) writeFrame(client.res, { type: "event", ...data });
}

let wired = false;
/**
 * Wire the hub to the event bus ONCE at boot. Every stamped event is
 * broadcast to its company's clients. Never throws into the bus.
 */
export function initRealtimeHub(): void {
  if (wired) return;
  wired = true;
  eventBus.onAny(({ event, payload }) => {
    const companyId = (payload as { companyId?: number })?.companyId;
    const entity = (payload as { entity?: string })?.entity;
    const entityId = (payload as { entityId?: number })?.entityId;
    if (typeof companyId !== "number") return; // can't route without a tenant
    broadcast(companyId, { action: String(event), entity: String(entity ?? ""), entityId: Number(entityId ?? 0) });
  });
  logger.info("[realtime] hub wired to event bus");
}
