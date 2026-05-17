import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";

// Idempotency middleware for sensitive financial POSTs.
//
// Contract: when the client sends an `Idempotency-Key` header with a POST
// request to a guarded endpoint, we look up (companyId, userId, method,
// path, key) in `idempotency_keys`. If a previous request with the SAME
// body hash already completed, we replay its cached status + JSON body
// (without re-executing the route). If the same key is replayed with a
// different body, we return 422 (key reuse with different payload). If
// the key is brand new, we insert a "pending" row, then capture
// res.status/res.json/res.send/res.end output and persist it on response
// finish.
//
// The header is OPTIONAL: requests without it pass through unchanged so
// existing callers keep working. The DB unique constraint guarantees we
// never persist two rows for the same key. When the key IS present and
// the idempotency store is unreachable we fail closed (503) — letting a
// financial write through without replay protection would defeat the
// whole point of the middleware.

const HEADER = "idempotency-key";
// TTL in hours for cached idempotency rows. Configurable via env so the
// cleanup cron and the middleware lookup window stay in sync. Defaults to
// 24h — long enough to catch retries from flaky clients without letting
// the table grow unbounded.
export const IDEMPOTENCY_TTL_HOURS: number = (() => {
  const raw = process.env.IDEMPOTENCY_TTL_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
})();
const TTL_HOURS = IDEMPOTENCY_TTL_HOURS;
const MAX_KEY_LEN = 200;
const MAX_BODY_BYTES = 200_000;

function hashBody(body: unknown): string {
  let payload: string;
  try {
    payload = JSON.stringify(body ?? {});
  } catch {
    payload = String(body ?? "");
  }
  if (payload.length > MAX_BODY_BYTES) {
    payload = payload.slice(0, MAX_BODY_BYTES);
  }
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function idempotency() {
  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawKey = req.headers[HEADER];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key) {
      next();
      return;
    }
    if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LEN) {
      res.status(400).json({
        error: "Idempotency-Key غير صالح",
        code: "IDEMPOTENCY_KEY_INVALID",
        fix: `استخدم مفتاحاً نصياً بطول 1 إلى ${MAX_KEY_LEN} حرف`,
      });
      return;
    }
    const scope = req.scope;
    if (!scope) {
      next();
      return;
    }

    const method = req.method.toUpperCase();
    // Use the concrete request path (baseUrl + path), NOT the route template
    // (req.route.path). The template would collapse `/invoices/123/payment`
    // and `/invoices/456/payment` into the same idempotency bucket.
    const concretePath = (req.baseUrl || "") + req.path;
    const path = concretePath.split("?")[0];
    const requestHash = hashBody(req.body);

    try {
      const existing = await rawQuery<{
        requestHash: string;
        statusCode: number | null;
        responseBody: unknown;
        createdAt: Date;
      }>(
        `SELECT "requestHash", "statusCode", "responseBody", "createdAt"
           FROM idempotency_keys
          WHERE "companyId" = $1 AND "userId" = $2 AND method = $3 AND path = $4 AND key = $5
            AND "createdAt" > NOW() - ($6 || ' hours')::interval
          LIMIT 1`,
        [scope.companyId, scope.userId, method, path, key, String(TTL_HOURS)]
      );

      if (existing.length > 0) {
        const row = existing[0];
        if (row.requestHash !== requestHash) {
          res.status(422).json({
            error: "تم إعادة استخدام Idempotency-Key مع جسم طلب مختلف",
            code: "IDEMPOTENCY_KEY_REUSE_MISMATCH",
            fix: "أعد المحاولة بمفتاح جديد أو بنفس بيانات الطلب الأصلي",
          });
          return;
        }
        if (row.statusCode == null) {
          res.status(409).json({
            error: "طلب سابق بنفس Idempotency-Key قيد المعالجة",
            code: "IDEMPOTENCY_KEY_IN_FLIGHT",
            fix: "انتظر اكتمال الطلب الأصلي قبل إعادة المحاولة",
          });
          return;
        }
        res.setHeader("Idempotency-Replayed", "true");
        res.status(row.statusCode).json(row.responseBody);
        return;
      }

      try {
        await rawExecute(
          `INSERT INTO idempotency_keys
             ("companyId","userId",method,path,key,"requestHash")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [scope.companyId, scope.userId, method, path, key, requestHash]
        );
      } catch (insertErr: any) {
        // Race: another concurrent request just inserted the same key.
        if (insertErr?.code === "23505") {
          res.status(409).json({
            error: "طلب سابق بنفس Idempotency-Key قيد المعالجة",
            code: "IDEMPOTENCY_KEY_IN_FLIGHT",
            fix: "انتظر اكتمال الطلب الأصلي قبل إعادة المحاولة",
          });
          return;
        }
        throw insertErr;
      }
    } catch (err: any) {
      // Fail CLOSED when the client sent a key but the idempotency store
      // is unreachable. Silently letting the financial handler run without
      // replay protection would defeat the purpose of the middleware and
      // re-introduce the double-charge risk we're guarding against.
      logger.error(err, "[idempotency] store unavailable — refusing request");
      res.status(503).json({
        error: "خدمة الحماية من الدفع المكرر غير متاحة حالياً",
        code: "IDEMPOTENCY_STORE_UNAVAILABLE",
        fix: "أعد المحاولة بعد قليل",
      });
      return;
    }

    let captured: { status: number; body: unknown; isJson: boolean } | null = null;
    let pendingStatus = 200;
    const origStatus = res.status.bind(res);
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    const origEnd = res.end.bind(res) as Response["end"];

    res.status = (code: number) => {
      pendingStatus = code;
      return origStatus(code);
    };
    res.json = (body: unknown) => {
      captured = { status: res.statusCode || pendingStatus, body, isJson: true };
      return origJson(body);
    };
    res.send = ((body?: unknown) => {
      // Only capture if json() didn't already snapshot (express's res.json
      // calls res.send internally, and we don't want to overwrite the
      // structured body with its serialized string form).
      if (!captured) {
        captured = { status: res.statusCode || pendingStatus, body, isJson: false };
      }
      // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
      return origSend(body as any);
    }) as Response["send"];
    res.end = ((...args: unknown[]) => {
      if (!captured) {
        const maybeBody = args.length > 0 && typeof args[0] !== "function" ? args[0] : null;
        captured = { status: res.statusCode || pendingStatus, body: maybeBody, isJson: false };
      }
      // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
      return (origEnd as any)(...args);
    }) as Response["end"];

    res.on("finish", () => {
      const status = captured?.status ?? res.statusCode;

      // Persist 2xx responses only; 4xx/5xx (and uncaptured paths) should
      // not lock the key — drop the placeholder row so retries can run.
      if (!captured || status < 200 || status >= 300) {
        rawExecute(
          `DELETE FROM idempotency_keys
             WHERE "companyId" = $1 AND "userId" = $2 AND method = $3 AND path = $4 AND key = $5
               AND "statusCode" IS NULL`,
          [scope.companyId, scope.userId, method, path, key]
        ).catch((e) => logger.error(e, "[idempotency] cleanup of failed key failed"));
        return;
      }

      // Only JSON bodies are safely replayable as JSON. Non-JSON
      // responses (raw send/end with strings or buffers) drop the
      // placeholder so the client can simply retry.
      if (!captured.isJson) {
        rawExecute(
          `DELETE FROM idempotency_keys
             WHERE "companyId" = $1 AND "userId" = $2 AND method = $3 AND path = $4 AND key = $5
               AND "statusCode" IS NULL`,
          [scope.companyId, scope.userId, method, path, key]
        ).catch((e) => logger.error(e, "[idempotency] non-json cleanup failed"));
        return;
      }

      let bodyJson: string;
      try {
        bodyJson = JSON.stringify(captured.body ?? null);
      } catch {
        bodyJson = "null";
      }
      if (bodyJson.length > MAX_BODY_BYTES) {
        rawExecute(
          `DELETE FROM idempotency_keys
             WHERE "companyId" = $1 AND "userId" = $2 AND method = $3 AND path = $4 AND key = $5
               AND "statusCode" IS NULL`,
          [scope.companyId, scope.userId, method, path, key]
        ).catch((e) => logger.error(e, "[idempotency] oversize cleanup failed"));
        return;
      }
      rawExecute(
        `UPDATE idempotency_keys
            SET "statusCode" = $1, "responseBody" = $2::jsonb, "completedAt" = NOW()
          WHERE "companyId" = $3 AND "userId" = $4 AND method = $5 AND path = $6 AND key = $7`,
        [status, bodyJson, scope.companyId, scope.userId, method, path, key]
      ).catch((e) => logger.error(e, "[idempotency] response persist failed"));
    });

    next();
  };
}
