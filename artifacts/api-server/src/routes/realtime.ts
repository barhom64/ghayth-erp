// ════════════════════════════════════════════════════════════════════════════
// /api/realtime/stream — live server→client push (SSE).
//
// Holds an open Server-Sent-Events connection per client and streams a tiny
// frame whenever something changes in the client's company (via realtimeHub).
// The frontend invalidates its react-query caches on each frame so the change
// appears without a manual refresh — web and native app stay live-linked.
//
// Auth: EventSource cannot set an Authorization header, so this route accepts
// the access token three ways, in order: `?access_token=` query (the native
// app, which has no cookies), the `erp_access` cookie (web, auto-sent), or a
// Bearer header. It is mounted BEFORE the global authMiddleware for that
// reason and authenticates itself.
// ════════════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { verifyToken } from "../lib/auth.js";
import { rawQuery } from "../lib/rawdb.js";
import { addClient, removeClient } from "../lib/realtimeHub.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/stream", async (req, res) => {
  // ── authenticate (query token | cookie | bearer) ──
  const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : undefined;
  const cookieToken: string | undefined = req.cookies?.erp_access;
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const token = queryToken || cookieToken || bearer;
  if (!token) { res.status(401).end(); return; }

  let userId: number;
  let assignmentId: number;
  try {
    const payload = verifyToken(token);
    userId = payload.userId;
    assignmentId = payload.assignmentId;
  } catch {
    res.status(401).end();
    return;
  }

  // Derive the tenant from the active assignment — never trust a client-sent
  // companyId. One small query; the connection then lives for minutes/hours.
  const [row] = await rawQuery<{ companyId: number }>(
    `SELECT "companyId" FROM employee_assignments WHERE id = $1 AND status = 'active'`,
    [assignmentId],
  ).catch(() => [] as { companyId: number }[]);
  if (!row?.companyId) { res.status(403).end(); return; }
  const companyId = row.companyId;

  // ── open the SSE stream ──
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering (nginx) so frames flush
  });
  res.write(`retry: 5000\n`);                 // client reconnect backoff
  res.write(`data: ${JSON.stringify({ type: "ready" })}\n\n`);

  const client = { res, userId };
  addClient(companyId, client);

  // Keepalive comment every 25s so idle proxies don't drop the connection.
  const keepalive = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch { /* closed */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(keepalive);
    removeClient(companyId, client);
  });
  logger.debug({ companyId, userId }, "[realtime] client connected");
});

export default router;
