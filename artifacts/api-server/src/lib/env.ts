/**
 * Centralised environment configuration & startup validation.
 *
 * Production Hardening — Phase 0 (Env Validation). This module is the single
 * place that reads, classifies and validates the API server's runtime
 * environment. It is imported FIRST from index.ts so the consolidated guard
 * runs — and fails fast — before any other module's ad-hoc `process.env`
 * check (auth.ts, rawdb.ts, …).
 *
 * Secrets are NEVER printed: the guard reports a secret as present/absent
 * and a character count, never its value.
 */
import { logger } from "./logger.js";

export type EnvClass =
  | "required" // server cannot boot without it, in any environment
  | "required-production" // hard-required only when NODE_ENV=production
  | "optional" // optional tuning knob
  | "provider" // provider-specific integration (ZATCA, Mudad, WhatsApp, …)
  | "replit" // injected by the Replit platform
  | "test"; // test / CI / dev-only

interface EnvSpec {
  name: string;
  cls: EnvClass;
  secret: boolean;
  desc: string;
  /** Emit a production warning (not a boot failure) when missing in prod. */
  prodWarn?: boolean;
  /** Returns an error string when a present value is invalid, else null. */
  validate?: (value: string) => string | null;
}

const minLen =
  (n: number) =>
  (v: string): string | null =>
    v.length < n ? `must be at least ${n} characters (got ${v.length})` : null;

const positiveInt = (v: string): string | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0
    ? null
    : `must be a positive integer (got "${v}")`;
};

/**
 * The runtime environment surface of the API server. Tooling-only variables
 * (benchmarks, e2e, audit scripts) are intentionally NOT listed here — this
 * registry covers what the server process itself reads.
 */
export const ENV_REGISTRY: EnvSpec[] = [
  // ── Core — required to boot in every environment ──
  { name: "DATABASE_URL", cls: "required", secret: true, desc: "Postgres connection string" },
  { name: "JWT_SECRET", cls: "required", secret: true, desc: "JWT signing secret (>=32 chars)", validate: minLen(32) },
  { name: "PORT", cls: "required", secret: false, desc: "HTTP listen port", validate: positiveInt },

  // ── Core — required only in production ──
  { name: "FIELD_ENCRYPTION_KEY", cls: "required-production", secret: true, desc: "Key for at-rest PII column encryption" },

  // ── Optional — tuning & operational knobs ──
  { name: "NODE_ENV", cls: "optional", secret: false, desc: "Runtime mode (development|production|test)" },
  { name: "LOG_LEVEL", cls: "optional", secret: false, desc: "pino log level (default: info)" },
  { name: "PG_POOL_MAX", cls: "optional", secret: false, desc: "Max Postgres pool connections (default: 20)", validate: positiveInt },
  { name: "HOSTNAME", cls: "optional", secret: false, desc: "Instance hostname for logs/diagnostics" },
  { name: "SECRETS_ENCRYPTION_KEY", cls: "optional", secret: true, desc: "Key for DB-stored integration secrets", prodWarn: true, validate: minLen(16) },
  { name: "ADMIN_EMAIL", cls: "optional", secret: false, desc: "Bootstrap admin email (default account otherwise)" },
  { name: "ADMIN_PASSWORD", cls: "optional", secret: true, desc: "Bootstrap admin password (default otherwise)" },
  { name: "FLEET_PASSWORD", cls: "optional", secret: true, desc: "Bootstrap fleet service-account password" },
  { name: "INFRA_ADMIN_EMAILS", cls: "optional", secret: false, desc: "Comma-separated infra-admin allowlist" },
  { name: "REDIS_URL", cls: "optional", secret: true, desc: "Redis URL — shared rate-limit store (in-memory fallback)" },
  { name: "REDIS_HOST", cls: "optional", secret: false, desc: "Redis host (standalone form)" },
  { name: "REDIS_PORT", cls: "optional", secret: false, desc: "Redis port (standalone form)" },
  { name: "CORS_ORIGINS", cls: "optional", secret: false, desc: "Comma-separated allowed CORS origins" },
  { name: "CORS_ORIGIN", cls: "optional", secret: false, desc: "Comma-separated allowed CORS origins (legacy alias)" },
  { name: "PERSIST_ALL_EVENTS", cls: "optional", secret: false, desc: "Persist every emitted event to event_logs" },
  { name: "IDEMPOTENCY_TTL_HOURS", cls: "optional", secret: false, desc: "Idempotency-key retention window" },
  { name: "FX_RATE_STALENESS_ALERT_DAYS", cls: "optional", secret: false, desc: "Days before a cached FX rate is flagged stale" },
  { name: "RBAC_EMERGENCY_MODE", cls: "optional", secret: false, desc: "Bypass RBAC checks — emergency use only" },
  { name: "EINVOICE_DEFAULT_PROVIDER", cls: "optional", secret: false, desc: "Default e-invoice provider id" },
  { name: "PUBLIC_OBJECT_SEARCH_PATHS", cls: "optional", secret: false, desc: "Object-storage public search paths" },
  { name: "PRIVATE_OBJECT_DIR", cls: "optional", secret: false, desc: "Object-storage private directory" },

  // ── Provider-specific — optional integrations ──
  { name: "VAPID_PUBLIC_KEY", cls: "provider", secret: false, desc: "Web-push VAPID public key" },
  { name: "VAPID_PRIVATE_KEY", cls: "provider", secret: true, desc: "Web-push VAPID private key" },
  { name: "VAPID_SUBJECT", cls: "provider", secret: false, desc: "Web-push VAPID subject (mailto:)" },
  { name: "AI_INTEGRATIONS_ANTHROPIC_API_KEY", cls: "provider", secret: true, desc: "Anthropic API key for AI features" },
  { name: "AI_INTEGRATIONS_ANTHROPIC_BASE_URL", cls: "provider", secret: false, desc: "Anthropic API base URL override" },
  { name: "WHATSAPP_ACCESS_TOKEN", cls: "provider", secret: true, desc: "WhatsApp Business access token" },
  { name: "WHATSAPP_VERIFY_TOKEN", cls: "provider", secret: true, desc: "WhatsApp webhook verify token" },
  { name: "WHATSAPP_PHONE_ID", cls: "provider", secret: false, desc: "WhatsApp Business phone-number id" },
  { name: "ZATCA_FATOORA_PROD_URL", cls: "provider", secret: false, desc: "ZATCA Fatoora production endpoint" },
  { name: "ZATCA_FATOORA_SANDBOX_URL", cls: "provider", secret: false, desc: "ZATCA Fatoora sandbox endpoint" },
  { name: "ZATCA_CLEARANCE_TIMEOUT_MS", cls: "provider", secret: false, desc: "ZATCA clearance request timeout" },
  { name: "ZATCA_RETRY_BASE_DELAY_MS", cls: "provider", secret: false, desc: "ZATCA retry base delay" },
  { name: "ZATCA_RETRY_BATCH_SIZE", cls: "provider", secret: false, desc: "ZATCA retry batch size" },
  { name: "ZATCA_RETRY_MAX_ATTEMPTS", cls: "provider", secret: false, desc: "ZATCA retry max attempts" },
  { name: "ZATCA_ALLOW_CSR_GEN", cls: "provider", secret: false, desc: "Allow operator-UI CSR generation" },
  { name: "MUDAD_PROD_URL", cls: "provider", secret: false, desc: "Mudad payroll production endpoint" },
  { name: "MUDAD_SANDBOX_URL", cls: "provider", secret: false, desc: "Mudad payroll sandbox endpoint" },
  { name: "MUDAD_REQUEST_TIMEOUT_MS", cls: "provider", secret: false, desc: "Mudad request timeout" },
  { name: "ECB_FX_FEED_URL", cls: "provider", secret: false, desc: "ECB FX reference feed URL" },
  { name: "ECB_FETCH_TIMEOUT_MS", cls: "provider", secret: false, desc: "ECB FX feed fetch timeout" },
  { name: "RBAC_SIEM_WEBHOOK_URL", cls: "provider", secret: false, desc: "External SIEM webhook for RBAC events" },
  { name: "RBAC_SIEM_AUTH_HEADER", cls: "provider", secret: true, desc: "Authorization header for the SIEM webhook" },

  // ── Replit platform — injected by the host ──
  { name: "REPLIT_DEV_DOMAIN", cls: "replit", secret: false, desc: "Replit dev domain (CORS allowlisting)" },
  { name: "REPLIT_DEPLOYMENT_URL", cls: "replit", secret: false, desc: "Replit deployment URL (CORS allowlisting)" },

  // ── Test / CI / dev-only ──
  { name: "SEED_DEMO_DATA", cls: "test", secret: false, desc: "Seed demo + e2e bench data on boot" },
];

const CORS_VARS = ["CORS_ORIGINS", "CORS_ORIGIN", "REPLIT_DEV_DOMAIN", "REPLIT_DEPLOYMENT_URL"];

/** A present value is one that is defined and not blank. */
function isPresent(raw: string | undefined): raw is string {
  return raw != null && raw.trim() !== "";
}

export interface EnvVarStatus {
  name: string;
  cls: EnvClass;
  secret: boolean;
  present: boolean;
  /** Length of a present secret value — never the value itself. */
  chars?: number;
}

export interface EnvReport {
  ok: boolean;
  isProduction: boolean;
  errors: string[];
  warnings: string[];
  vars: EnvVarStatus[];
}

/**
 * Pure inspection of the current environment — no logging, no process exit.
 * Returns the classified status of every registered variable plus the lists
 * of hard errors and soft warnings.
 */
export function inspectEnv(): EnvReport {
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];
  const vars: EnvVarStatus[] = [];

  for (const spec of ENV_REGISTRY) {
    const raw = process.env[spec.name];
    const status: EnvVarStatus = {
      name: spec.name,
      cls: spec.cls,
      secret: spec.secret,
      present: isPresent(raw),
    };
    vars.push(status);

    const hardRequired =
      spec.cls === "required" ||
      (spec.cls === "required-production" && isProduction);

    if (!isPresent(raw)) {
      if (hardRequired) {
        errors.push(`${spec.name} is required but not set — ${spec.desc}`);
      } else if (spec.cls === "required-production" && !isProduction) {
        warnings.push(`${spec.name} is unset — required before deploying to production (${spec.desc})`);
      } else if (spec.prodWarn && isProduction) {
        warnings.push(`${spec.name} is unset in production — ${spec.desc}`);
      }
      continue;
    }

    if (spec.secret) status.chars = raw.length;

    if (spec.validate) {
      const err = spec.validate(raw);
      if (err) errors.push(`${spec.name} ${err}`);
    }
  }

  // CORS: in production at least one origin source should be configured,
  // otherwise cross-origin browser clients are blocked.
  if (isProduction && !CORS_VARS.some((n) => isPresent(process.env[n]))) {
    warnings.push(
      "No CORS origin configured (CORS_ORIGINS / CORS_ORIGIN / REPLIT_*) — cross-origin browser clients will be rejected",
    );
  }

  return { ok: errors.length === 0, isProduction, errors, warnings, vars };
}

/**
 * Validate the environment and emit the startup guard output. On a hard
 * error this logs every problem and exits the process (fail-fast). Secrets
 * are never logged — only presence and character counts.
 */
export function validateEnv(opts: { exitOnError?: boolean } = {}): EnvReport {
  const report = inspectEnv();

  const byClass: Record<string, { set: number; total: number }> = {};
  for (const v of report.vars) {
    const bucket = (byClass[v.cls] ??= { set: 0, total: 0 });
    bucket.total += 1;
    if (v.present) bucket.set += 1;
  }

  logger.info(
    {
      nodeEnv: process.env.NODE_ENV ?? "development",
      byClass,
      present: report.vars.filter((v) => v.present).map((v) => v.name),
      missing: report.vars.filter((v) => !v.present).map((v) => v.name),
    },
    "[env] startup environment guard",
  );

  for (const w of report.warnings) logger.warn(`[env] ${w}`);

  if (!report.ok) {
    for (const e of report.errors) logger.error(`[env] ${e}`);
    logger.error(
      `[env] environment validation failed with ${report.errors.length} error(s) — refusing to start`,
    );
    if (opts.exitOnError) process.exit(1);
    return report;
  }

  logger.info(`[env] environment validation passed (${report.vars.length} variables checked)`);
  return report;
}

/**
 * Typed, validated read access to the core runtime configuration. New code
 * should read config through this object rather than `process.env` directly;
 * existing call sites are migrated incrementally (Phase 1 — Config
 * centralization).
 */
export const config = {
  get nodeEnv(): string {
    return process.env.NODE_ENV ?? "development";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
  get isDevelopment(): boolean {
    return (process.env.NODE_ENV ?? "development") === "development";
  },
  get port(): number {
    return Number(process.env.PORT);
  },
  get logLevel(): string {
    return process.env.LOG_LEVEL ?? "info";
  },
  get pgPoolMax(): number {
    return Number(process.env.PG_POOL_MAX) || 20;
  },
} as const;

// Auto-run the guard on import so the consolidated, fail-fast report runs
// before any other module's ad-hoc env check when this is the first import
// in index.ts. Skipped under the test runner (index.ts is never the test
// entrypoint, so this only affects a real server boot).
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  validateEnv({ exitOnError: true });
}
