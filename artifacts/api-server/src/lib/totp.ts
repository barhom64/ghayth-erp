//
// src/lib/totp.ts
//
// تنفيذ TOTP (RFC 6238) فوق HOTP (RFC 4226) بـ node:crypto فقط — بلا تبعية
// خارجية. يُستخدم للمصادقة الثنائية (#2712). دالّة التحقق نقية وقابلة للاختبار
// بمتجهات RFC 6238 القياسية (انظر tests/unit/totp.test.ts).
//
// التشفير الافتراضي: HMAC-SHA1، خطوة 30ث، 6 أرقام — وهو ما تتوقّعه تطبيقات
// المصادقة (Google Authenticator / Authy / Microsoft Authenticator).
//
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ── Base32 (RFC 4648، بلا padding — كما تتوقّعه تطبيقات المصادقة) ──────────────
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // tolerate stray chars
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── HOTP (RFC 4226) ──────────────────────────────────────────────────────────
/** عدّاد 64-بت big-endian → كود HOTP بعدد أرقام محدّد. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, "0");
}

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────────
/** كود TOTP عند لحظة زمنية (بالثواني) — مفتاح خام Buffer. للاختبار/الداخل. */
export function totpAt(secret: Buffer, timeSec: number, step = 30, digits = 6): string {
  return hotp(secret, Math.floor(timeSec / step), digits);
}

/** سرّ TOTP عشوائي بصيغة Base32 (افتراضي 160-بت كما يوصي RFC 4226). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** رابط otpauth:// لعرضه كـQR في تطبيق المصادقة. */
export function otpauthURL(opts: {
  secret: string;
  label: string;
  issuer: string;
  digits?: number;
  step?: number;
}): string {
  const { secret, label, issuer, digits = 6, step = 30 } = opts;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(step),
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`;
}

/**
 * يتحقق من رمز TOTP مقابل سرّ Base32 ضمن نافذة ±window خطوة (افتراضي ±1 =
 * ±30ث، يسامح انحراف ساعة الجهاز). مقارنة ثابتة الزمن. يقبل 6–8 أرقام.
 */
export function verifyTOTP(
  secretBase32: string,
  token: string,
  opts: { window?: number; step?: number; digits?: number; now?: number } = {},
): boolean {
  const { window = 1, step = 30, digits = 6, now = Date.now() } = opts;
  const cleaned = (token || "").replace(/\s/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(cleaned)) return false;
  const secret = base32Decode(secretBase32);
  if (secret.length === 0) return false;
  const counter = Math.floor(now / 1000 / step);
  for (let w = -window; w <= window; w++) {
    const candidate = hotp(secret, counter + w, digits);
    const a = Buffer.from(candidate);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// ── الرموز الاحتياطية ────────────────────────────────────────────────────────
/** رموز احتياطية عشوائية بصيغة "xxxxx-xxxxx" (hex). تُعرض مرة واحدة فقط. */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** تجزئة رمز احتياطي للتخزين (لا يُحفظ بنصّ صريح). يتجاهل الشرطات/المسافات/الحالة. */
export function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update((code || "").replace(/[\s-]/g, "").toLowerCase())
    .digest("hex");
}
