import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config.js";

/**
 * Symmetric encryption for secrets stored in the database
 * (e.g. SMS auth tokens, WhatsApp access tokens).
 *
 * Uses AES-256-GCM with a per-value random IV. The ciphertext is stored
 * as a single string: "enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>".
 *
 * The master key is derived from config.secretsEncryptionKey (env
 * SECRETS_ENCRYPTION_KEY) via scrypt. In production this MUST be set to a
 * strong value (at least 32 characters of high entropy). The derivation
 * salt is fixed so the same env value always yields the same runtime key.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const KDF_SALT = Buffer.from("ghayth-erp-secrets-v1", "utf8");

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = config.secretsEncryptionKey;
  if (!raw || raw.length < 16) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY environment variable is required and must be at least 16 characters"
    );
  }
  cachedKey = scryptSync(raw, KDF_SALT, 32);
  return cachedKey;
}

/** Returns true when the value looks like an already-encrypted payload. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts a plaintext string for at-rest storage. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypts a payload produced by encryptSecret. If the value is not in
 * encrypted form, it is returned unchanged (legacy plaintext rows remain
 * readable until migrated).
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!isEncrypted(value)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, ctB64] = parts;
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const ct = Buffer.from(ctB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
