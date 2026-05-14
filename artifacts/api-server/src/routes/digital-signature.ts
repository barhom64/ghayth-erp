import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent, generateTimeRef } from "../lib/businessHelpers.js";
import { handleRouteError, ValidationError , zodParse } from "../lib/errorHandler.js";
import { logger } from "../lib/logger.js";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";

const requestOtpSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.union([z.coerce.number(), z.string().min(1)]),
  action: z.string().min(1),
});

const verifySignatureSchema = z.object({
  otp: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.union([z.coerce.number(), z.string().min(1)]),
  action: z.string().min(1),
});

const router = Router();

interface OtpRecordRow {
  id: number;
}

interface SignatureLogRow {
  id: number;
  companyId: number;
  userId: number | null;
  documentId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  signatureRef: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  userAgent: string | null;
  otpRef: number | null;
  createdAt: string;
  userName: string | null;
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getDeviceFingerprint(req: Request): string {
  const ua = req.headers["user-agent"] || "";
  const accept = req.headers["accept"] || "";
  const lang = req.headers["accept-language"] || "";
  const raw = `${ua}|${accept}|${lang}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function getClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = String(forwarded).split(",").map((s) => s.trim());
    return ips[0] || "unknown";
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}

router.post("/request-otp", authorize({ feature: "documents", action: "create" }), async (req, res: Response) => {
  try {
    const body = zodParse(requestOtpSchema.safeParse(req.body));
    const scope = (req as any).scope!;
    const { entityType, entityId, action } = body;
    if (!entityType || !entityId || !action) {
      throw new ValidationError("entityType و entityId و action مطلوبة");
    }
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const ip = getClientIP(req);
    const deviceFingerprint = getDeviceFingerprint(req);
    const userAgent = req.headers["user-agent"] || "";

    await rawExecute(
      `INSERT INTO digital_signature_otps ("companyId","userId","documentId","entityType","entityId",action,otp,"expiresAt","ipAddress","deviceFingerprint","userAgent",used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)`,
      [scope.companyId, scope.userId, String(entityId), entityType, String(entityId), action, otp, expiresAt.toISOString(), ip, deviceFingerprint, userAgent]
    );

    logger.info({ userId: scope.userId, entityType, entityId, action, ip }, "Digital signature OTP requested");

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "request_otp",
      entity: entityType, entityId: Number(entityId),
      after: { action, ip, deviceFingerprint },
    }).catch((e) => logger.error(e, "digital-signature background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "digital_signature.otp_requested", entity: "digital_signature_otps", entityId: Number(entityId), details: JSON.stringify({ entityType, entityId, action, ip }) }).catch((e) => logger.error(e, "digital-signature background task failed"));

    res.json({
      message: "تم إرسال رمز التحقق (OTP) — صالح لمدة 10 دقائق",
      otp,
      expiresAt: expiresAt.toISOString(),
      ip,
      deviceFingerprint,
    });
  } catch (err: any) {
    handleRouteError(err, res, "Request OTP error");
  }
});

router.post("/verify", authorize({ feature: "documents", action: "create" }), async (req, res: Response) => {
  try {
    const body = zodParse(verifySignatureSchema.safeParse(req.body));
    const scope = (req as any).scope!;
    const { otp, entityType, entityId, action } = body;
    if (!otp || !entityType || !entityId || !action) {
      throw new ValidationError("جميع الحقول مطلوبة: otp, entityType, entityId, action");
    }

    const ip = getClientIP(req);
    const deviceFingerprint = getDeviceFingerprint(req);
    const userAgent = req.headers["user-agent"] || "";

    const [record] = await rawQuery<OtpRecordRow>(
      `SELECT id FROM digital_signature_otps WHERE "companyId"=$1 AND "userId"=$2 AND "entityType"=$3 AND "entityId"=$4 AND action=$5 AND otp=$6 AND used=false AND "expiresAt" > NOW() ORDER BY "createdAt" DESC LIMIT 1`,
      [scope.companyId, scope.userId, entityType, String(entityId), action, String(otp)]
    );

    if (!record) {
      throw new ValidationError("رمز التحقق غير صحيح أو منتهي الصلاحية");
    }

    const signatureRef = generateTimeRef("SIG");
    await withTransaction(async (client) => {
      await client.query(`UPDATE digital_signature_otps SET used=true, "usedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [record.id, scope.companyId]);
      await client.query(
        `INSERT INTO digital_signature_logs ("companyId","userId","documentId","entityType","entityId",action,"signatureRef","ipAddress","deviceFingerprint","userAgent","otpRef") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [scope.companyId, scope.userId, String(entityId), entityType, String(entityId), action, signatureRef, ip, deviceFingerprint, userAgent, record.id]
      );
    });

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: `digital_signature:${action}`,
      entity: entityType,
      entityId: Number(entityId),
      after: { signatureRef, ip, deviceFingerprint, action, verifiedAt: new Date().toISOString() },
    }).catch((e) => logger.error(e, "digital-signature background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "digital_signature.verified", entity: "digital_signature_logs", entityId: Number(entityId), details: JSON.stringify({ entityType, entityId, action, signatureRef, ip }) }).catch((e) => logger.error(e, "digital-signature background task failed"));

    res.json({
      verified: true,
      signatureRef,
      entityType,
      entityId,
      action,
      ip,
      deviceFingerprint,
      userAgent,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    handleRouteError(err, res, "Verify signature error");
  }
});

router.get("/logs", authorize({ feature: "documents", action: "create" }), async (req, res: Response) => {
  try {
    const scope = (req as any).scope!;
    const { entityType, entityId } = req.query as Record<string, string | undefined>;
    const conditions = [`dsl."companyId"=$1`];
    const params: unknown[] = [scope.companyId];
    if (entityType) { params.push(entityType); conditions.push(`dsl."entityType"=$${params.length}`); }
    if (entityId) { params.push(String(entityId)); conditions.push(`dsl."entityId"=$${params.length}`); }
    const rows = await rawQuery<SignatureLogRow>(
      `SELECT dsl.*, e.name AS "userName" FROM digital_signature_logs dsl LEFT JOIN users u ON u.id=dsl."userId" LEFT JOIN employees e ON e.id=u."employeeId" WHERE ${conditions.join(" AND ")} ORDER BY dsl."createdAt" DESC LIMIT 100`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err: any) {
    handleRouteError(err, res, "Signature logs error");
  }
});

export default router;
