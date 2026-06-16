/**
 * Vendor Settings — DB-first, env-fallback config for every external
 * integration (#1139 §6 "كل شيء قابل للتحكم من الواجهة").
 *
 * Before this module, vendor credentials lived in env vars only:
 *   PBX_WEBHOOK_SECRET, WHATSAPP_*, SMTP_*, VAPID_*, RBAC_SIEM_*, …
 * That made wiring a vendor a shell-access task. With vendor_secrets
 * (migration 219) the operator manages the same values from the UI;
 * this helper is the single seam every runtime caller goes through.
 *
 * Read order:
 *   1. vendor_secrets row whose slug matches the requested vendor.
 *      Status must be 'active'. Secrets in config are decrypted.
 *   2. integrations row (companyId IS NULL OR matches caller) whose
 *      type matches. Used for per-tenant overrides.
 *   3. typed `config` (env-backed) fallback. Allows existing
 *      deployments to keep working without re-configuring through the UI.
 *
 * Cache: 60s TTL. Invalidate from the write endpoints after a save.
 * The cache is keyed by slug so a tenant-specific override doesn't
 * pollute the platform-wide read; a future per-tenant variant adds
 * `companyId` to the key.
 */
import { rawQuery, rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";
import { decryptSecret, isEncrypted } from "./secrets.js";
import { config as appConfig } from "./config.js";

/** Slugs the operator can manage via /admin/vendor-settings. */
export type VendorSlug =
  | "pbx-webhook"
  | "whatsapp"
  | "smtp"
  | "vapid"
  | "siem"
  | "zatca"
  | "microsoft365";

export interface VendorConfig {
  /** Active iff the operator flipped the row to status='active'. */
  active: boolean;
  /** Decrypted secret payload. Empty object if no row or row disabled. */
  config: Record<string, unknown>;
  /** Where the values came from — useful in the UI status banner. */
  source: "db" | "env" | "none";
}

/**
 * Secret key names — same allowlist aiGovernance uses, plus the names
 * the vendor_secrets seed rows use. A key in this set is encrypted at
 * rest and decrypted on read.
 */
const SECRET_KEYS = new Set<string>([
  "apiKey", "accessToken", "secret", "authToken", "token",
  "appSecret", "clientSecret", "privateKey",
  "webhookSecret", "verifyToken", "password",
  "authHeader",
]);

function decryptConfigInPlace(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEYS.has(k) && typeof v === "string" && isEncrypted(v)) {
      out[k] = decryptSecret(v) ?? "";
    } else {
      out[k] = v;
    }
  }
  return out;
}

const TTL_MS = 60_000;
interface CacheEntry { value: VendorConfig; expiresAt: number; }
const cache = new Map<VendorSlug, CacheEntry>();

/** Drop the cache so the next read picks up an admin save immediately. */
export function invalidateVendorSettingsCache(): void {
  cache.clear();
}

/**
 * Returns the env-var values for a given vendor slug. Called as a
 * fallback when no DB row is active. Centralised here so every
 * runtime caller looking up vendor config does it through the same
 * map (and so the master-plan dashboard can list the env names it
 * expects).
 */
function envFallback(slug: VendorSlug): Record<string, string> {
  switch (slug) {
    case "pbx-webhook":
      return { webhookSecret: appConfig.pbx.webhookSecret ?? "" };
    case "whatsapp":
      return {
        verifyToken: appConfig.whatsapp.verifyToken ?? "",
        accessToken: appConfig.whatsapp.accessToken ?? "",
        phoneId: appConfig.whatsapp.phoneId ?? "",
        appSecret: appConfig.whatsapp.appSecret ?? "",
      };
    case "smtp":
      return {
        host: appConfig.smtp.host ?? "",
        port: String(appConfig.smtp.port ?? 587),
        user: appConfig.smtp.user ?? "",
        password: appConfig.smtp.pass ?? "",
        from: appConfig.smtp.from ?? "",
        secure: String(appConfig.smtp.secure ?? false),
      };
    case "vapid":
      return {
        publicKey: appConfig.vapid.publicKey ?? "",
        privateKey: appConfig.vapid.privateKey ?? "",
        subject: appConfig.vapid.subject ?? "mailto:admin@ghayth.app",
      };
    case "siem":
      return {
        webhookUrl: appConfig.rbac.siemWebhookUrl ?? "",
        authHeader: appConfig.rbac.siemAuthHeader ?? "",
      };
    case "zatca":
      return {
        defaultProvider: appConfig.zatca.defaultProvider ?? "",
        prodUrl: appConfig.zatca.prodUrl ?? "",
        sandboxUrl: appConfig.zatca.sandboxUrl ?? "",
      };
    case "microsoft365":
      // Azure AD app registration credentials. The operator creates an
      // app in https://portal.azure.com → App registrations, sets the
      // redirect URI to {APP_URL}/api/mailboxes/oauth/microsoft365/callback,
      // copies the client id + client secret here.
      return {
        clientId: appConfig.microsoft365.clientId ?? "",
        clientSecret: appConfig.microsoft365.clientSecret ?? "",
        redirectUri: appConfig.microsoft365.redirectUri ?? "",
      };
    default:
      return {};
  }
}

/**
 * Resolve a vendor's config. DB → env → none. Cached for TTL_MS.
 * Never throws — observability writes are best-effort and so is the
 * fallback chain.
 */
export async function getVendorConfig(slug: VendorSlug): Promise<VendorConfig> {
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let result: VendorConfig;
  try {
    const [row] = await rawQuery<{ status: string; config: Record<string, unknown> }>(
      `SELECT status, config FROM vendor_secrets WHERE slug = $1 LIMIT 1`,
      [slug],
    );
    if (row && row.status === "active") {
      result = {
        active: true,
        config: decryptConfigInPlace(row.config),
        source: "db",
      };
    } else {
      const env = envFallback(slug);
      const hasAnyEnv = Object.values(env).some((v) => v && v.length > 0);
      result = hasAnyEnv
        ? { active: true, config: env, source: "env" }
        : { active: false, config: {}, source: "none" };
    }
  } catch (err) {
    logger.warn(err, `[vendorSettings] getVendorConfig(${slug}) failed; falling back to env`);
    const env = envFallback(slug);
    const hasAnyEnv = Object.values(env).some((v) => v && v.length > 0);
    result = hasAnyEnv
      ? { active: true, config: env, source: "env" }
      : { active: false, config: {}, source: "none" };
  }

  cache.set(slug, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

/**
 * Synchronous reads that runtime hot paths need (e.g. verifyPbxSignature
 * inside an Express handler). We can't await in those without changing
 * the call site signature; this function returns the LAST cached value,
 * or env fallback if the cache is empty. Pair with a periodic warm
 * call from a startup hook to populate the cache.
 */
export function getCachedVendorConfigSync(slug: VendorSlug): VendorConfig {
  const cached = cache.get(slug);
  if (cached) return cached.value;
  const env = envFallback(slug);
  const hasAnyEnv = Object.values(env).some((v) => v && v.length > 0);
  return hasAnyEnv
    ? { active: true, config: env, source: "env" }
    : { active: false, config: {}, source: "none" };
}

/**
 * Boot-time guarantee that the operator-facing vendor cards exist.
 *
 * WHY (belt-and-suspenders over migration 219/340): the six rows are
 * seeded by migration 219, but on installs whose schema dump predates
 * the seed AND whose baseline-cutoff marks 219 as "applied" without
 * running its INSERT, the rows are orphaned — /admin/vendor-settings
 * renders empty ("طبّق migration 219 أولاً"). Migration 340 backfills
 * them, but a single migration only runs once and only if the
 * migration-runner reaches it. This ensure-step runs on EVERY boot, so
 * the cards are guaranteed regardless of migration-runner / deploy
 * timing edge cases.
 *
 * SAFETY: writes ONLY to vendor_secrets (canonical table, no bypass),
 * idempotent via ON CONFLICT (slug) DO NOTHING, contains ZERO secrets
 * (every credential field is ""). A row the operator has already
 * configured (e.g. an active smtp with a real password) is left
 * completely untouched — only MISSING slugs are inserted. Non-fatal:
 * the caller wraps this in try/catch like the other boot seeds.
 */
export async function ensureVendorSecretsSeed(): Promise<void> {
  await rawExecute(
    `INSERT INTO public.vendor_secrets (slug, name, description, status, config)
     VALUES
       ('pbx-webhook', 'PBX Webhook Signing', 'HMAC secret used to verify inbound PBX webhooks (/api/communications/pbx/*).',
        'disabled', '{"webhookSecret":""}'::jsonb),
       ('whatsapp', 'WhatsApp Business Cloud API', 'Meta Cloud API credentials for sending + receiving messages.',
        'disabled', '{"accessToken":"","verifyToken":"","phoneId":"","appSecret":""}'::jsonb),
       ('smtp', 'Email (SMTP)', 'SMTP relay used by notificationEngine for outbound email.',
        'disabled', '{"host":"","port":"587","user":"","password":"","from":"","secure":"false"}'::jsonb),
       ('vapid', 'Web Push (VAPID)', 'VAPID keys used by lib/notificationService for browser push notifications.',
        'disabled', '{"publicKey":"","privateKey":"","subject":"mailto:admin@ghayth.app"}'::jsonb),
       ('siem', 'SIEM forwarder', 'Optional webhook RBAC violations get mirrored to.',
        'disabled', '{"webhookUrl":"","authHeader":""}'::jsonb),
       ('zatca', 'ZATCA Fatoora', 'Saudi e-invoice clearance endpoints + provider.',
        'disabled', '{"defaultProvider":"","prodUrl":"","sandboxUrl":""}'::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
  );
}

/**
 * Warm every cached slug on boot so the first synchronous read after
 * server start returns DB values (or a known-good env fallback)
 * without depending on the request's timing. Called from app boot.
 */
export async function warmVendorSettingsCache(): Promise<void> {
  const slugs: VendorSlug[] = ["pbx-webhook", "whatsapp", "smtp", "vapid", "siem", "zatca", "microsoft365"];
  await Promise.all(slugs.map((s) => getVendorConfig(s)));
}
