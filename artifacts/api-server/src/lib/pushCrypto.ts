import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from "crypto";

function getPushSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required for push encryption");
  return secret;
}

export function getPushEncryptionKey(): Buffer {
  return createHash("sha256").update(getPushSecret()).digest();
}

export function hashPushEndpoint(endpoint: string): string {
  return createHmac("sha256", getPushSecret()).update(endpoint).digest("hex");
}

export function encryptPushEndpoint(endpoint: string): { encrypted: string; success: boolean } {
  const key = getPushEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(endpoint, "utf8"), cipher.final()]);
  return { encrypted: iv.toString("hex") + ":" + encrypted.toString("hex"), success: true };
}

export function decryptPushEndpoint(encryptedEndpoint: string): string {
  if (!encryptedEndpoint.includes(":")) return encryptedEndpoint;
  const [ivHex, dataHex] = encryptedEndpoint.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted endpoint format");
  const key = getPushEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
