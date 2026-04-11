import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import crypto from "node:crypto";
import type { Request, Response } from "express";

const router = Router();
router.use(authMiddleware);

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

router.post("/request-otp", async (req, res: Response) => {
  try {
    const scope = (req as any).scope!;
    const { entityType, entityId, action } = req.body;
    if (!entityType || !entityId || !action) {
      res.status(400).json({ error: "entityType و entityId و action مطلوبة" });
      return;
    }
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const ip = getClientIP(req);
    const deviceFingerprint = getDeviceFingerprint(req);
    const userAgent = req.headers["user-agent"] || "";

    await rawExecute(
      `INSERT INTO digital_signature_otps ("companyId","userId","entityType","entityId",action,otp,"expiresAt","ipAddress","deviceFingerprint","userAgent",used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
      [scope.companyId, scope.userId, entityType, String(entityId), action, otp, expiresAt.toISOString(), ip, deviceFingerprint, userAgent]
    );

    console.log(`[DIGITAL_SIGNATURE] OTP requested by user ${scope.userId} for ${entityType}#${entityId} action=${action} IP=${ip}`);

    res.json({
      message: "تم إرسال رمز التحقق (OTP) — صالح لمدة 10 دقائق",
      otp,
      expiresAt: expiresAt.toISOString(),
      ip,
      deviceFingerprint,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/verify", async (req, res: Response) => {
  try {
    const scope = (req as any).scope!;
    const { otp, entityType, entityId, action } = req.body;
    if (!otp || !entityType || !entityId || !action) {
      res.status(400).json({ error: "جميع الحقول مطلوبة: otp, entityType, entityId, action" });
      return;
    }

    const ip = getClientIP(req);
    const deviceFingerprint = getDeviceFingerprint(req);
    const userAgent = req.headers["user-agent"] || "";

    const [record] = await rawQuery<any>(
      `SELECT * FROM digital_signature_otps WHERE "companyId"=$1 AND "userId"=$2 AND "entityType"=$3 AND "entityId"=$4 AND action=$5 AND otp=$6 AND used=false AND "expiresAt" > NOW() ORDER BY "createdAt" DESC LIMIT 1`,
      [scope.companyId, scope.userId, entityType, String(entityId), action, String(otp)]
    );

    if (!record) {
      res.status(401).json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
      return;
    }

    await rawExecute(`UPDATE digital_signature_otps SET used=true, "usedAt"=NOW() WHERE id=$1`, [record.id]);

    const signatureRef = `SIG-${Date.now().toString(36).toUpperCase()}`;
    await rawExecute(
      `INSERT INTO digital_signature_logs ("companyId","userId","entityType","entityId",action,"signatureRef","ipAddress","deviceFingerprint","userAgent","otpRef") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, scope.userId, entityType, String(entityId), action, signatureRef, ip, deviceFingerprint, userAgent, record.id]
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: `digital_signature:${action}`,
      entity: entityType,
      entityId: Number(entityId),
      after: { signatureRef, ip, deviceFingerprint, action, verifiedAt: new Date().toISOString() },
    }).catch(console.error);

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
    res.status(500).json({ error: err.message });
  }
});

router.get("/logs", async (req, res: Response) => {
  try {
    const scope = (req as any).scope!;
    const { entityType, entityId } = req.query as any;
    const conditions = [`"companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (entityType) { params.push(entityType); conditions.push(`"entityType"=$${params.length}`); }
    if (entityId) { params.push(String(entityId)); conditions.push(`"entityId"=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT dsl.*, e.name AS "userName" FROM digital_signature_logs dsl LEFT JOIN employees e ON e.id=dsl."userId" WHERE ${conditions.join(" AND ")} ORDER BY dsl."createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
