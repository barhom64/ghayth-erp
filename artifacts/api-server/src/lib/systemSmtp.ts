/**
 * System SMTP — the single runtime resolver for "بريد نظام غيث" (#2137).
 *
 * THE GAP THIS CLOSES: the operator saves SMTP credentials through
 * /admin/vendor-settings → vendor_secrets (encrypted via secrets.ts),
 * but processEmailQueue() read a DIFFERENT source — integrations.config
 * per company, with the password still encrypted (never decrypted) and
 * no env fallback. Two sources of truth: the UI said "configured", the
 * worker failed silently. Every runtime SMTP consumer now goes through
 * resolveSystemSmtpConfig() and nothing else.
 *
 * Resolution order (owner-mandated, #2137 §3.1 — first match wins):
 *   1. vendor_secrets slug='smtp' when status='active'  → source 'db'
 *      (the platform system mailbox the operator manages in the UI —
 *      rep@door.sa).
 *   2. integrations row (type smtp/email, active, companyId match)
 *      → source 'tenant'. COMPATIBILITY ONLY: this is where legacy
 *      per-company configs live; secrets are decrypted here (the old
 *      worker read them raw). No new writes target this path.
 *   3. env (SMTP_* via config.ts) only when no UI config exists
 *      → source 'env'.
 *   4. none → null. Callers fail with a clear Arabic message that
 *      never carries a secret.
 *
 * NOTHING in this module logs, throws, or returns a secret in any
 * error path — see scrubSmtpSecrets().
 */
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";
import { decryptSecret, isEncrypted } from "./secrets.js";
import { getVendorConfig, getCompanyVendorConfig } from "./vendorSettings.js";
import { config as appConfig } from "./config.js";

export interface SystemSmtpConfig {
  host: string;
  port: number;
  /** true ⇒ implicit TLS (465). false ⇒ plain/STARTTLS (587/25). */
  secure: boolean;
  username: string | null;
  /** Decrypted. NEVER serialise this object into a response/log/audit. */
  password: string | null;
  fromEmail: string;
  /** Display name — defaults to «نظام غيث». */
  fromName: string;
  replyTo: string | null;
  /** Optional second attempt (e.g. Hostinger 587 STARTTLS after 465). */
  fallbackPort: number | null;
  source: "db" | "tenant" | "env";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function boolish(v: unknown, dflt: boolean): boolean {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (s === "true" || s === "1" || s === "ssl") return true;
  if (s === "false" || s === "0" || s === "starttls") return false;
  return dflt;
}

function maybeDecrypt(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (isEncrypted(s)) return decryptSecret(s);
  return s;
}

/**
 * Parse a stored `from` that may be either a bare address
 * ("rep@door.sa") or a display form ("نظام غيث <rep@door.sa>").
 */
function splitFrom(from: string): { email: string; name: string | null } {
  const m = /^(.*)<([^<>@\s]+@[^<>\s]+)>\s*$/.exec(from);
  if (m) return { email: m[2].trim(), name: m[1].trim().replace(/^"|"$/g, "") || null };
  return { email: from.trim(), name: null };
}

function fromShape(raw: Record<string, unknown>, source: SystemSmtpConfig["source"]): SystemSmtpConfig | null {
  const host = str(raw.host);
  const port = Number(str(raw.port) || 0);
  if (!host || !Number.isFinite(port) || port <= 0) return null;

  const username = str(raw.user ?? raw.username) || null;
  const storedFrom = str(raw.from ?? raw.fromEmail);
  const parsed = storedFrom ? splitFrom(storedFrom) : { email: "", name: null };
  const fromEmail = parsed.email || username || "";
  if (!fromEmail) return null;

  return {
    host,
    port,
    secure: boolish(raw.secure, port === 465),
    username,
    password: maybeDecrypt(raw.password ?? raw.pass),
    fromEmail,
    fromName: str(raw.fromName) || parsed.name || "نظام غيث",
    replyTo: str(raw.replyTo) || null,
    fallbackPort: Number(str(raw.fallbackPort) || 0) || null,
    source,
  };
}

/**
 * THE single SMTP source of truth. Every runtime consumer —
 * processEmailQueue, the vendor-settings verify test, the real
 * test-send endpoint — calls this and only this.
 *
 * Returns null when no valid config exists anywhere; callers surface
 * «لا يوجد إعداد SMTP صالح — اضبط بريد النظام من إعدادات المزوّدات»
 * (never a secret, never a stack).
 */
export async function resolveSystemSmtpConfig(companyId?: number | null): Promise<SystemSmtpConfig | null> {
  // 0. Per-company mailbox ("بريد الشركة") — a vendor_secrets row whose
  //    "companyId" matches the caller (migration 388). An ACTIVE company row
  //    OVERRIDES the platform default; a company with no row falls through to
  //    the platform mailbox below, so behaviour is unchanged for everyone who
  //    hasn't set one. This is the only step that depends on companyId.
  if (companyId) {
    try {
      const company = await getCompanyVendorConfig("smtp", companyId);
      if (company.active) {
        const cfg = fromShape(company.config, "db");
        if (cfg) return cfg;
      }
    } catch (err) {
      logger.warn(err, "[systemSmtp] per-company vendor_secrets read failed — trying platform");
    }
  }

  // 1. Operator-managed platform mailbox (vendor_secrets, decrypted by
  //    vendorSettings). Only counts when the row itself is the source —
  //    getVendorConfig's own env fallback is handled in step 3 so the
  //    documented order stays observable.
  try {
    const vendor = await getVendorConfig("smtp");
    if (vendor.active && vendor.source === "db") {
      const cfg = fromShape(vendor.config, "db");
      if (cfg) return cfg;
    }
  } catch (err) {
    logger.warn(err, "[systemSmtp] vendor_secrets read failed — trying next source");
  }

  // 2. Legacy per-company integrations row — compatibility fallback,
  //    now WITH decryption (the old worker read the ciphertext raw).
  if (companyId) {
    try {
      const [row] = await rawQuery<{ config: Record<string, unknown> | null }>(
        `SELECT config FROM integrations
          WHERE "companyId" = $1 AND type IN ('smtp', 'email') AND status = 'active'
          ORDER BY id DESC LIMIT 1`,
        [companyId],
      );
      if (row?.config) {
        const cfg = fromShape(row.config, "tenant");
        if (cfg) return cfg;
      }
    } catch (err) {
      logger.warn(err, "[systemSmtp] integrations read failed — trying env");
    }
  }

  // 3. Env fallback — only when no UI-managed config exists.
  const env = appConfig.smtp;
  if (env.host) {
    const cfg = fromShape(
      { host: env.host, port: env.port, user: env.user, password: env.pass, from: env.from, secure: env.secure },
      "env",
    );
    if (cfg) return cfg;
  }

  return null;
}

/** RFC 5322 display-form sender: «نظام غيث <rep@door.sa>». */
export function formatFromHeader(cfg: SystemSmtpConfig): string {
  return cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail;
}

/**
 * Strip any credential material from an error string before it can
 * reach a queue row, log line, audit entry, event payload, or API
 * response. Belt-and-braces: SMTP errors don't normally echo the
 * password, but a misconfigured value pasted into the host field (or a
 * provider echoing the AUTH line) must never persist anywhere.
 */
export function scrubSmtpSecrets(text: string, cfg: SystemSmtpConfig | null): string {
  let out = text;
  if (cfg?.password) out = out.split(cfg.password).join("*****");
  if (cfg?.password) {
    const b64 = Buffer.from(cfg.password, "utf8").toString("base64");
    out = out.split(b64).join("*****");
  }
  return out;
}

/** nodemailer transport options for a resolved config (primary attempt). */
export function smtpTransportOptions(cfg: SystemSmtpConfig, portOverride?: number): Record<string, unknown> {
  const port = portOverride ?? cfg.port;
  return {
    host: cfg.host,
    port,
    secure: portOverride ? portOverride === 465 : cfg.secure,
    auth: cfg.username && cfg.password ? { user: cfg.username, pass: cfg.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
}
