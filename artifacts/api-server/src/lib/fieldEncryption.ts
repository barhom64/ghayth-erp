import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "node:crypto";
import { logger } from "./logger.js";
import { rawExecute } from "./rawdb.js";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getFieldEncryptionKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FIELD_ENCRYPTION_KEY is required in production — do NOT fall back to JWT_SECRET");
    }
    const fallback = process.env.JWT_SECRET;
    if (!fallback) throw new Error("FIELD_ENCRYPTION_KEY required");
    logger.warn("[fieldEncryption] FIELD_ENCRYPTION_KEY not set — falling back to JWT_SECRET. Set a dedicated key before production.");
    return createHash("sha256").update(fallback).digest();
  }
  return createHash("sha256").update(secret).digest();
}

function getHmacKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FIELD_ENCRYPTION_KEY is required in production");
    }
    const fallback = process.env.JWT_SECRET;
    if (!fallback) throw new Error("FIELD_ENCRYPTION_KEY required");
    return createHash("sha256").update("hmac:" + fallback).digest();
  }
  return createHash("sha256").update("hmac:" + secret).digest();
}

export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getFieldEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + encrypted.toString("hex") + ":" + tag.toString("hex");
}

export function decryptField(ciphertext: string): string {
  if (!ciphertext || !ciphertext.includes(":")) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  const [ivHex, dataHex, tagHex] = parts;
  try {
    const key = getFieldEncryptionKey();
    const iv = Buffer.from(ivHex!, "hex");
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(Buffer.from(tagHex!, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex!, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    logger.error(e, "fieldEncryption: decryption failed — possible key mismatch or data corruption");
    return "***DECRYPTION_FAILED***";
  }
}

export function blindIndex(value: string): string {
  if (!value) return "";
  return createHmac("sha256", getHmacKey()).update(value.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export const SENSITIVE_PILGRIM_FIELDS = [
  "passportNumber",
  "visaNumber",
  "mofaNumber",
  "borderNumber",
] as const;

export type SensitivePilgrimField = (typeof SENSITIVE_PILGRIM_FIELDS)[number];

export function encryptPilgrimRow(row: Record<string, any>): Record<string, any> {
  const result = { ...row };
  for (const field of SENSITIVE_PILGRIM_FIELDS) {
    if (result[field] && !isEncrypted(result[field])) {
      const hash = blindIndex(result[field]);
      result[`${field}_hash`] = hash;
      result[field] = encryptField(result[field]);
    }
  }
  return result;
}

export function decryptPilgrimRow<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  const result: Record<string, any> = { ...row };
  for (const field of SENSITIVE_PILGRIM_FIELDS) {
    if (result[field] && isEncrypted(result[field])) {
      result[field] = decryptField(result[field]);
    }
  }
  return result as T;
}

function isEncrypted(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(":");
  return parts.length === 3 && parts[0]!.length === IV_LEN * 2;
}

export interface SensitiveAccessAudit {
  companyId: number;
  userId: number;
  action: string;
  entity: string;
  entityId?: number;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

export function logSensitiveAccess(audit: SensitiveAccessAudit): void {
  rawExecute(
    `INSERT INTO audit_umrah_access ("companyId","userId",action,entity,"entityId","ipAddress","userAgent",details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      audit.companyId, audit.userId, audit.action, audit.entity,
      audit.entityId ?? null, audit.ipAddress ?? null, audit.userAgent ?? null,
      audit.details ? JSON.stringify(audit.details) : null,
    ]
  ).catch((e) => logger.error(e, "sensitive access audit log failed"));
}
