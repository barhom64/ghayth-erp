/**
 * Central environment configuration — the single validated source of truth
 * for every `process.env` value the API server depends on.
 *
 * Why this exists
 * ---------------
 * Before this module ~48 environment variables were read ad-hoc via
 * `process.env.X` (often `process.env.X || "fallback"`) scattered across the
 * codebase. A typo'd or missing variable surfaced as a confusing runtime
 * error deep inside a request — or worse, silently took a fallback that was
 * wrong for production. In an ERP that is unacceptable: silent env failures
 * are catastrophic.
 *
 * What this module guarantees
 * ---------------------------
 *   1. Parsing + coercion of every known variable through a zod schema that
 *      NEVER throws — every field has a `.catch(...)` fallback. Importing
 *      `config` is therefore always safe, including from unit tests that do
 *      not provide a full environment.
 *   2. A separate, semantic validation pass (`collectEnvIssues`) that checks
 *      *requiredness* and *format* and produces a human-readable problem list.
 *   3. `assertEnvOrExit()` — called exactly once at startup by `index.ts` —
 *      which prints a clear, actionable report and exits the process when a
 *      fatal misconfiguration is found. This is the fail-fast gate.
 *
 * Rules for the rest of the codebase
 * ----------------------------------
 *   - Startup-critical code MUST read `config.*`, never `process.env.*`.
 *   - `process.env.X || "fallback"` is banned — defaults live in the schema.
 *
 * This file intentionally imports nothing from the application (only `zod`)
 * and reports through `console` rather than the pino logger, so it is free of
 * circular-import hazards and works before logging is configured.
 */
import { z } from "zod";

export type NodeEnv = "development" | "staging" | "production" | "test";

// ───────────────────────── zod field builders ─────────────────────────────
// Every builder yields a schema that NEVER throws on parse: invalid or
// missing input falls back to the supplied default via `.catch(...)`.

/** Required-ish string: empty string when absent (requiredness checked later). */
const reqStr = () => z.string().catch("");

/** Optional string: `undefined` when absent or blank. */
const optStr = () =>
  z
    .string()
    .trim()
    .min(1)
    .optional()
    .catch(undefined);

/** Integer from env, falling back to `def` on absent/garbage input. */
const intEnv = (def: number) => z.coerce.number().int().catch(def);

/** Boolean from env — only the literal strings true/1/yes count as true. */
const boolEnv = (def: boolean) =>
  z
    .preprocess((v) => {
      if (v === undefined || v === null || v === "") return def;
      const s = String(v).trim().toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }, z.boolean())
    .catch(def);

// ───────────────────────────── the schema ─────────────────────────────────

const EnvSchema = z.object({
  // -- core ----------------------------------------------------------------
  NODE_ENV: z
    .enum(["development", "staging", "production", "test"])
    .catch("development"),
  // Set to "true" by the Vitest runner. Folded into `config.isTest` so
  // test-only branches do not have to probe process.env directly.
  VITEST: boolEnv(false),
  PORT: intEnv(0), // 0 = unset/invalid sentinel; validated below
  HOSTNAME: optStr(),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .catch("info"),

  // -- database ------------------------------------------------------------
  DATABASE_URL: reqStr(),
  PG_POOL_MAX: intEnv(20),

  // -- auth / crypto -------------------------------------------------------
  JWT_SECRET: reqStr(),
  FIELD_ENCRYPTION_KEY: optStr(),
  SECRETS_ENCRYPTION_KEY: optStr(),

  // -- cache / queue -------------------------------------------------------
  REDIS_URL: optStr(),
  REDIS_HOST: optStr(),
  REDIS_PORT: intEnv(6379),

  // -- cors ----------------------------------------------------------------
  CORS_ORIGINS: optStr(),
  CORS_ORIGIN: optStr(),
  REPLIT_DEV_DOMAIN: optStr(),
  REPLIT_DEPLOYMENT_URL: optStr(),
  // Public origin used when embedding URLs inside generated documents
  // (Print Platform QR verify URLs, email links, etc.). Falls back to
  // the Replit deployment URL when set, otherwise to an empty string
  // — in which case the QR encodes a relative path /api/print/verify/:id
  // that still works for scans within the same browser session.
  PUBLIC_BASE_URL: optStr(),

  // -- bootstrap / seed ----------------------------------------------------
  ADMIN_EMAIL: optStr(),
  ADMIN_PASSWORD: optStr(),
  FLEET_PASSWORD: optStr(),
  INFRA_ADMIN_EMAILS: optStr(),
  SEED_DEMO_DATA: boolEnv(false),

  // -- events --------------------------------------------------------------
  PERSIST_ALL_EVENTS: boolEnv(false),

  // -- fleet telematics (#1354) -------------------------------------------
  // Production deployments reject http(s://) CMSV6 base URLs by default.
  // Lab/dev environments can opt out via this flag; the SSRF guard is
  // unaffected (private IPs are still rejected regardless of scheme).
  FLEET_TELEMATICS_ALLOW_HTTP: boolEnv(false),
  // Default TTL (seconds) for the signed proxy token issued at video
  // session open. Clamped 15..300 below. The client must redeem the
  // token within this window; expired tokens return 401 from the proxy.
  FLEET_TELEMATICS_PROXY_TTL_SEC: intEnv(60),
  // Per-IP rate limit on the anonymous webhook endpoint (requests/minute).
  // Default 3000/min comfortably covers 100+ vehicles each pushing ~20
  // events/min with headroom for retries — vendors that push more should
  // be tested then this raised explicitly via env. Operators can lower
  // it for hostile-traffic protection. Clamped 100..60000 to stop a
  // typo from disabling the cap entirely.
  FLEET_TELEMATICS_WEBHOOK_RATE_LIMIT: intEnv(3000),

  // -- object storage ------------------------------------------------------
  PUBLIC_OBJECT_SEARCH_PATHS: optStr(),
  PRIVATE_OBJECT_DIR: optStr(),
  STORAGE_DRIVER: z.enum(["replit", "local"]).catch("replit"),
  STORAGE_LOCAL_DIR: optStr(),

  // -- web push ------------------------------------------------------------
  VAPID_PUBLIC_KEY: optStr(),
  VAPID_PRIVATE_KEY: optStr(),
  VAPID_SUBJECT: optStr(),

  // -- ai ------------------------------------------------------------------
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: optStr(),
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: optStr(),

  // -- print platform delivery (Phase 9) -----------------------------------
  // SMTP_* enable the email DeliveryChannel; PRINT_WEBHOOK_SIGNING_SECRET
  // enables HMAC signatures on the webhook channel.
  SMTP_HOST: optStr(),
  SMTP_PORT: optStr(),
  SMTP_USER: optStr(),
  SMTP_PASS: optStr(),
  SMTP_FROM: optStr(),
  SMTP_SECURE: optStr(),
  PRINT_WEBHOOK_SIGNING_SECRET: optStr(),

  // -- whatsapp ------------------------------------------------------------
  WHATSAPP_VERIFY_TOKEN: optStr(),
  WHATSAPP_ACCESS_TOKEN: optStr(),
  WHATSAPP_PHONE_ID: optStr(),
  WHATSAPP_APP_SECRET: optStr(),
  PBX_WEBHOOK_SECRET: optStr(),

  // -- microsoft 365 (graph) ----------------------------------------------
  // Azure AD app registration credentials for mailbox OAuth.
  MICROSOFT365_CLIENT_ID: optStr(),
  MICROSOFT365_CLIENT_SECRET: optStr(),
  MICROSOFT365_REDIRECT_URI: optStr(),

  // -- zatca / e-invoice ---------------------------------------------------
  EINVOICE_DEFAULT_PROVIDER: optStr(),
  ZATCA_FATOORA_PROD_URL: optStr(),
  ZATCA_FATOORA_SANDBOX_URL: optStr(),
  ZATCA_CLEARANCE_TIMEOUT_MS: intEnv(30_000),
  ZATCA_RETRY_BASE_DELAY_MS: intEnv(60_000),
  ZATCA_RETRY_BATCH_SIZE: intEnv(20),
  ZATCA_RETRY_MAX_ATTEMPTS: intEnv(5),
  ZATCA_ALLOW_CSR_GEN: boolEnv(false),
  /** M1 batch11 — real Fatoora gateway base URL.
   *  When set, lib/zatcaClient.ts uses it for submission.
   *  Falls back to ZATCA_FATOORA_PROD_URL / ZATCA_FATOORA_SANDBOX_URL. */
  ZATCA_API_BASE: optStr(),
  /** Dev-only escape hatch: when "1", lib/zatcaClient.ts returns
   *  synthetic accepted responses without network calls. Production
   *  refuses to read this — see lib/zatcaClient.ts:resolveBaseUrl. */
  ZATCA_TEST_MODE: optStr(),

  // -- N15 Ejar (Saudi rental registry) -----------------------------------
  EJAR_API_BASE: optStr(),
  EJAR_CLIENT_ID: optStr(),
  EJAR_CLIENT_SECRET: optStr(),
  EJAR_LANDLORD_NID: optStr(),
  EJAR_TEST_MODE: optStr(),
  /** Reader mode for the read-side adapter (ejarContractReader.ts).
   *  Accepted values: 'mock' (default, deterministic fixtures) or
   *  'real' (calls the real Ejar read endpoint — not yet wired,
   *  throws by design until that lands). */
  EJAR_READER_MODE: optStr(),

  // -- N16 Sadad (SAMA bill payment) --------------------------------------
  SADAD_API_BASE: optStr(),
  SADAD_MERCHANT_ID: optStr(),
  SADAD_API_KEY: optStr(),
  SADAD_BILLER_CODE: optStr(),
  SADAD_WEBHOOK_SECRET: optStr(),
  SADAD_TEST_MODE: optStr(),

  // -- N17 Nusk (Ministry of Hajj live API) -------------------------------
  NUSK_API_BASE: optStr(),
  NUSK_API_KEY: optStr(),
  NUSK_AGENT_ID: optStr(),
  NUSK_TEST_MODE: optStr(),

  // -- mudad ---------------------------------------------------------------
  MUDAD_PROD_URL: optStr(),
  MUDAD_SANDBOX_URL: optStr(),
  MUDAD_REQUEST_TIMEOUT_MS: intEnv(30_000),

  // -- fx ------------------------------------------------------------------
  ECB_FX_FEED_URL: optStr(),
  ECB_FETCH_TIMEOUT_MS: intEnv(15_000),
  FX_RATE_STALENESS_ALERT_DAYS: intEnv(3),

  // -- rbac ----------------------------------------------------------------
  RBAC_EMERGENCY_MODE: boolEnv(false),
  RBAC_SIEM_WEBHOOK_URL: optStr(),
  RBAC_SIEM_AUTH_HEADER: optStr(),

  // -- idempotency ---------------------------------------------------------
  IDEMPOTENCY_TTL_HOURS: intEnv(24),

  // -- observability / tracing --------------------------------------------
  // OpenTelemetry OTLP trace endpoint. When unset, tracing stays inert and
  // the OTel loader hook is never registered (see otel.ts / lib/tracing.ts).
  OTEL_EXPORTER_OTLP_ENDPOINT: optStr(),

  // -- operational knobs (introduced with the foundation hardening work) ---
  // Threshold above which a single DB query is logged + counted as "slow"
  // by the observability layer (lib/observability.ts).
  SLOW_QUERY_MS: intEnv(500),
  // How long a /readyz dependency-probe result is cached before being
  // re-evaluated, so high-frequency orchestrator probes never hammer the DB.
  READYZ_CACHE_MS: intEnv(5_000),
  // Per-dependency probe timeout for /readyz. A probe exceeding this is
  // classified `unavailable` rather than hanging the readiness check.
  HEALTH_PROBE_TIMEOUT_MS: intEnv(2_000),

  // #1812 — Google Maps API key fallback. Per-company key in
  // transport_planning_settings.mapProviderApiKey takes precedence;
  // this env var is the fallback for single-tenant deployments where
  // every company shares one billing account.
  GOOGLE_MAPS_API_KEY: z.string().optional().catch(undefined),
});

type RawEnv = z.infer<typeof EnvSchema>;

// ──────────────────────────── public config ───────────────────────────────

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isStaging: boolean;
  readonly isTest: boolean;

  readonly port: number;
  readonly hostname: string;
  readonly logLevel: string;

  readonly databaseUrl: string;
  readonly pgPoolMax: number;

  readonly jwtSecret: string;
  readonly fieldEncryptionKey: string | undefined;
  readonly secretsEncryptionKey: string | undefined;

  /** Normalised, de-duplicated CORS allowlist (no trailing slashes). */
  readonly corsOrigins: readonly string[];

  /** Raw REPLIT_DEV_DOMAIN — used to whitelist Replit preview subdomains in dev. */
  readonly replitDevDomain: string | undefined;

  /** Public origin embedded into URLs that leave the server — Print Platform
   *  QR verify links, outbound emails, etc. Defaults to REPLIT_DEPLOYMENT_URL
   *  when set, otherwise empty (in which case relative `/api/...` paths are
   *  used and only work for scans from the same host). */
  readonly publicBaseUrl: string;

  readonly redis: {
    readonly url: string | undefined;
    readonly host: string | undefined;
    readonly port: number;
    /** True when any Redis connection info was supplied. */
    readonly configured: boolean;
  };

  readonly seedDemoData: boolean;
  readonly persistAllEvents: boolean;

  /** Fleet telematics — #1354 production hardening flags. */
  readonly fleetTelematics: {
    /** When false (default in production), reject `http://` CMSV6 URLs. */
    readonly allowHttp: boolean;
    /** Video proxy token TTL — clamped 15..300 seconds. */
    readonly proxyTtlSec: number;
    /** Per-IP webhook rate limit (req/min). Clamped 100..60000. */
    readonly webhookRateLimit: number;
  };

  readonly admin: {
    readonly email: string | undefined;
    readonly password: string | undefined;
    readonly fleetPassword: string | undefined;
    readonly infraAdminEmails: readonly string[];
  };

  readonly objectStorage: {
    /** Selected storage backend — see lib/storage/. */
    readonly driver: "replit" | "local";
    /** Root directory for the local-filesystem driver. */
    readonly localDir: string | undefined;
    readonly publicSearchPaths: readonly string[];
    readonly privateDir: string | undefined;
    /** True when object storage has enough config to be usable. */
    readonly configured: boolean;
  };

  readonly vapid: {
    readonly publicKey: string | undefined;
    readonly privateKey: string | undefined;
    readonly subject: string | undefined;
    readonly configured: boolean;
  };

  readonly ai: {
    readonly anthropicApiKey: string | undefined;
    readonly anthropicBaseUrl: string | undefined;
  };

  /** SMTP configuration for Print Platform email delivery (Phase 9). */
  readonly smtp: {
    readonly host: string | undefined;
    readonly port: number;
    readonly user: string | undefined;
    readonly pass: string | undefined;
    readonly from: string | undefined;
    readonly secure: boolean;
  };

  /** Print Platform configuration (Phase 9 webhook signing). */
  readonly print: {
    readonly webhookSigningSecret: string | undefined;
  };

  readonly whatsapp: {
    readonly verifyToken: string | undefined;
    readonly accessToken: string | undefined;
    readonly phoneId: string | undefined;
    readonly appSecret: string | undefined;
    readonly configured: boolean;
  };

  readonly pbx: {
    readonly webhookSecret: string | undefined;
  };

  readonly microsoft365: {
    readonly clientId: string | undefined;
    readonly clientSecret: string | undefined;
    readonly redirectUri: string | undefined;
    readonly configured: boolean;
  };

  readonly zatca: {
    readonly defaultProvider: string | undefined;
    readonly prodUrl: string | undefined;
    readonly sandboxUrl: string | undefined;
    readonly clearanceTimeoutMs: number;
    readonly retryBaseDelayMs: number;
    readonly retryBatchSize: number;
    readonly retryMaxAttempts: number;
    readonly allowCsrGen: boolean;
    /** M1 batch11. */
    readonly apiBase: string | undefined;
    readonly testMode: boolean;
  };

  readonly ejar: {
    readonly apiBase: string | undefined;
    readonly clientId: string | undefined;
    readonly clientSecret: string | undefined;
    readonly landlordNid: string | undefined;
    readonly testMode: boolean;
    readonly readerMode: "mock" | "real";
  };

  readonly sadad: {
    readonly apiBase: string | undefined;
    readonly merchantId: string | undefined;
    readonly apiKey: string | undefined;
    readonly billerCode: string | undefined;
    readonly webhookSecret: string | undefined;
    readonly testMode: boolean;
  };

  readonly nusk: {
    readonly apiBase: string | undefined;
    readonly apiKey: string | undefined;
    readonly agentId: string | undefined;
    readonly testMode: boolean;
  };

  readonly mudad: {
    readonly prodUrl: string | undefined;
    readonly sandboxUrl: string | undefined;
    readonly requestTimeoutMs: number;
  };

  readonly fx: {
    readonly feedUrl: string | undefined;
    readonly fetchTimeoutMs: number;
    readonly stalenessAlertDays: number;
  };

  readonly rbac: {
    readonly emergencyMode: boolean;
    readonly siemWebhookUrl: string | undefined;
    readonly siemAuthHeader: string | undefined;
  };

  readonly idempotencyTtlHours: number;

  /** OpenTelemetry OTLP trace endpoint — tracing is inert when undefined. */
  readonly otelExporterEndpoint: string | undefined;

  /** Operational knobs consumed by the health + observability layers. */
  readonly ops: {
    readonly slowQueryMs: number;
    readonly readyzCacheMs: number;
    readonly healthProbeTimeoutMs: number;
  };
  /** #1812 maps provider fallback key (per-company key in DB takes precedence). */
  readonly googleMapsApiKey: string | null;
}

/** Split a comma-separated env value into a clean, de-duplicated list. */
function splitList(value: string | undefined, stripTrailingSlash = false): string[] {
  if (!value) return [];
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => (stripTrailingSlash ? p.replace(/\/$/, "") : p));
  return Array.from(new Set(parts));
}

function buildConfig(env: RawEnv): AppConfig {
  const nodeEnv = env.NODE_ENV as NodeEnv;

  const corsOrigins = Array.from(
    new Set([
      ...splitList(env.CORS_ORIGINS, true),
      ...splitList(env.CORS_ORIGIN, true),
      ...(env.REPLIT_DEV_DOMAIN ? [`https://${env.REPLIT_DEV_DOMAIN}`] : []),
      ...(env.REPLIT_DEPLOYMENT_URL
        ? [env.REPLIT_DEPLOYMENT_URL.replace(/\/$/, "")]
        : []),
    ]),
  );

  // Public base URL used to build absolute, user-facing links (password
  // reset / invitation / account activation in #2137, QR-verify links in
  // print). Precedence:
  //   1. PUBLIC_BASE_URL — explicit operator override.
  //   2. REPLIT_DEPLOYMENT_URL — set automatically on Replit deploys.
  //   3. The first configured CORS origin — this is the frontend origin
  //      the browser actually reaches the system on, which is exactly
  //      where the /reset-password and /activate routes live. CORS_ORIGINS
  //      is a fatal-required setting in production (see validation below),
  //      so this fallback is always populated there. An https origin is
  //      preferred over a bare-http/localhost one when both are present.
  // No domain is ever hardcoded; when nothing is configured the value
  // stays empty and the auth flow's operational gate refuses to email a
  // broken link.
  const corsBaseFallback =
    corsOrigins.find((o) => o.startsWith("https://")) ?? corsOrigins[0] ?? "";
  const publicBaseUrl = (
    env.PUBLIC_BASE_URL ||
    env.REPLIT_DEPLOYMENT_URL ||
    corsBaseFallback ||
    ""
  ).replace(/\/$/, "");

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isDevelopment: nodeEnv === "development",
    isStaging: nodeEnv === "staging",
    // True under NODE_ENV=test or when run by the Vitest runner.
    isTest: nodeEnv === "test" || env.VITEST,

    port: env.PORT,
    hostname: env.HOSTNAME ?? "api-server",
    logLevel: env.LOG_LEVEL,

    databaseUrl: env.DATABASE_URL,
    pgPoolMax: env.PG_POOL_MAX,

    jwtSecret: env.JWT_SECRET,
    fieldEncryptionKey: env.FIELD_ENCRYPTION_KEY,
    secretsEncryptionKey: env.SECRETS_ENCRYPTION_KEY,

    corsOrigins,
    replitDevDomain: env.REPLIT_DEV_DOMAIN,
    publicBaseUrl,

    redis: {
      url: env.REDIS_URL,
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      configured: Boolean(env.REDIS_URL || env.REDIS_HOST),
    },

    seedDemoData: env.SEED_DEMO_DATA,
    persistAllEvents: env.PERSIST_ALL_EVENTS,
    fleetTelematics: {
      allowHttp: env.FLEET_TELEMATICS_ALLOW_HTTP,
      proxyTtlSec: Math.min(300, Math.max(15, env.FLEET_TELEMATICS_PROXY_TTL_SEC)),
      webhookRateLimit: Math.min(60000, Math.max(100, env.FLEET_TELEMATICS_WEBHOOK_RATE_LIMIT)),
    },

    admin: {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      fleetPassword: env.FLEET_PASSWORD,
      infraAdminEmails: splitList(env.INFRA_ADMIN_EMAILS),
    },

    objectStorage: {
      driver: env.STORAGE_DRIVER,
      localDir: env.STORAGE_LOCAL_DIR,
      publicSearchPaths: splitList(env.PUBLIC_OBJECT_SEARCH_PATHS),
      privateDir: env.PRIVATE_OBJECT_DIR,
      configured: Boolean(env.PRIVATE_OBJECT_DIR),
    },

    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
      subject: env.VAPID_SUBJECT,
      configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    },

    ai: {
      anthropicApiKey: env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      anthropicBaseUrl: env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    },

    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
      secure: env.SMTP_SECURE === "true",
    },

    print: {
      webhookSigningSecret: env.PRINT_WEBHOOK_SIGNING_SECRET,
    },

    whatsapp: {
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneId: env.WHATSAPP_PHONE_ID,
      appSecret: env.WHATSAPP_APP_SECRET,
      configured: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_ID),
    },

    pbx: {
      webhookSecret: env.PBX_WEBHOOK_SECRET,
    },

    microsoft365: {
      clientId: env.MICROSOFT365_CLIENT_ID,
      clientSecret: env.MICROSOFT365_CLIENT_SECRET,
      redirectUri: env.MICROSOFT365_REDIRECT_URI,
      configured: Boolean(env.MICROSOFT365_CLIENT_ID && env.MICROSOFT365_CLIENT_SECRET),
    },

    zatca: {
      defaultProvider: env.EINVOICE_DEFAULT_PROVIDER,
      prodUrl: env.ZATCA_FATOORA_PROD_URL,
      sandboxUrl: env.ZATCA_FATOORA_SANDBOX_URL,
      clearanceTimeoutMs: env.ZATCA_CLEARANCE_TIMEOUT_MS,
      retryBaseDelayMs: env.ZATCA_RETRY_BASE_DELAY_MS,
      retryBatchSize: env.ZATCA_RETRY_BATCH_SIZE,
      retryMaxAttempts: env.ZATCA_RETRY_MAX_ATTEMPTS,
      allowCsrGen: env.ZATCA_ALLOW_CSR_GEN,
      apiBase: env.ZATCA_API_BASE,
      testMode: env.ZATCA_TEST_MODE === "1",
    },

    ejar: {
      apiBase: env.EJAR_API_BASE,
      clientId: env.EJAR_CLIENT_ID,
      clientSecret: env.EJAR_CLIENT_SECRET,
      landlordNid: env.EJAR_LANDLORD_NID,
      testMode: env.EJAR_TEST_MODE === "1",
      readerMode: (env.EJAR_READER_MODE ?? "mock").toLowerCase() === "real" ? "real" : "mock",
    },

    sadad: {
      apiBase: env.SADAD_API_BASE,
      merchantId: env.SADAD_MERCHANT_ID,
      apiKey: env.SADAD_API_KEY,
      billerCode: env.SADAD_BILLER_CODE,
      webhookSecret: env.SADAD_WEBHOOK_SECRET,
      testMode: env.SADAD_TEST_MODE === "1",
    },

    nusk: {
      apiBase: env.NUSK_API_BASE,
      apiKey: env.NUSK_API_KEY,
      agentId: env.NUSK_AGENT_ID,
      testMode: env.NUSK_TEST_MODE === "1",
    },

    mudad: {
      prodUrl: env.MUDAD_PROD_URL,
      sandboxUrl: env.MUDAD_SANDBOX_URL,
      requestTimeoutMs: env.MUDAD_REQUEST_TIMEOUT_MS,
    },

    fx: {
      feedUrl: env.ECB_FX_FEED_URL,
      fetchTimeoutMs: env.ECB_FETCH_TIMEOUT_MS,
      stalenessAlertDays: env.FX_RATE_STALENESS_ALERT_DAYS,
    },

    rbac: {
      emergencyMode: env.RBAC_EMERGENCY_MODE,
      siemWebhookUrl: env.RBAC_SIEM_WEBHOOK_URL,
      siemAuthHeader: env.RBAC_SIEM_AUTH_HEADER,
    },

    idempotencyTtlHours: env.IDEMPOTENCY_TTL_HOURS,

    otelExporterEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,

    ops: {
      slowQueryMs: env.SLOW_QUERY_MS,
      readyzCacheMs: env.READYZ_CACHE_MS,
      healthProbeTimeoutMs: env.HEALTH_PROBE_TIMEOUT_MS,
    },
    googleMapsApiKey: env.GOOGLE_MAPS_API_KEY ?? null,
  };
}

// ─────────────────────── secrets classification ───────────────────────────

/**
 * Environment keys that carry secret material. Anything listed here is
 * masked by `describeConfig()` so it can never leak into a health endpoint,
 * a log line, or an error report.
 */
export const SECRET_ENV_KEYS: readonly string[] = [
  "DATABASE_URL", // contains the DB password
  "JWT_SECRET",
  "FIELD_ENCRYPTION_KEY",
  "SECRETS_ENCRYPTION_KEY",
  "REDIS_URL", // may contain a password
  "ADMIN_PASSWORD",
  "FLEET_PASSWORD",
  "VAPID_PRIVATE_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "RBAC_SIEM_AUTH_HEADER",
];

// ─────────────────────── semantic validation ──────────────────────────────

export type EnvIssueSeverity = "fatal" | "warn";

export interface EnvIssue {
  readonly key: string;
  readonly severity: EnvIssueSeverity;
  readonly message: string;
  readonly hint: string;
}

const POSTGRES_URL = /^postgres(?:ql)?:\/\//i;

/**
 * Validate requiredness + format. Returns every problem found — `fatal`
 * issues block startup, `warn` issues are surfaced but allowed.
 *
 * This is intentionally separate from the zod schema: the schema's job is
 * to coerce and never throw; this function's job is to decide what is
 * actually acceptable for the current `NODE_ENV`.
 */
function collectEnvIssues(cfg: AppConfig, raw: NodeJS.ProcessEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const prod = cfg.isProduction;

  // -- always required -----------------------------------------------------
  if (!cfg.databaseUrl) {
    issues.push({
      key: "DATABASE_URL",
      severity: "fatal",
      message: "DATABASE_URL is not set — the server cannot reach its database.",
      hint: "Set DATABASE_URL to a postgres connection string, e.g. postgres://user:pass@host:5432/db",
    });
  } else if (!POSTGRES_URL.test(cfg.databaseUrl)) {
    issues.push({
      key: "DATABASE_URL",
      severity: "fatal",
      message: "DATABASE_URL does not look like a postgres connection string.",
      hint: "It must start with postgres:// or postgresql://",
    });
  }

  if (!cfg.jwtSecret) {
    issues.push({
      key: "JWT_SECRET",
      severity: "fatal",
      message: "JWT_SECRET is not set — auth token signing/verification is impossible.",
      hint: "Generate one with: openssl rand -hex 32",
    });
  } else if (cfg.jwtSecret.length < 32) {
    issues.push({
      key: "JWT_SECRET",
      severity: "fatal",
      message: `JWT_SECRET is too short (${cfg.jwtSecret.length} chars) — the auth layer requires at least 32.`,
      hint: "Generate a stronger value with: openssl rand -hex 32",
    });
  }

  if (!Number.isInteger(cfg.port) || cfg.port <= 0 || cfg.port > 65535) {
    issues.push({
      key: "PORT",
      severity: "fatal",
      message:
        raw.PORT === undefined
          ? "PORT is not set — the server does not know which port to bind."
          : `PORT="${raw.PORT}" is not a valid TCP port.`,
      hint: "Set PORT to an integer between 1 and 65535 (e.g. 8080).",
    });
  }

  // -- required in production ---------------------------------------------
  if (prod && !cfg.fieldEncryptionKey) {
    issues.push({
      key: "FIELD_ENCRYPTION_KEY",
      severity: "fatal",
      message:
        "FIELD_ENCRYPTION_KEY is not set in production — sensitive columns " +
        "(national IDs, passports, banking details) cannot be encrypted at rest.",
      hint: "Generate a dedicated key with: openssl rand -hex 32 (loss of this key makes encrypted data unrecoverable).",
    });
  }

  if (cfg.secretsEncryptionKey && cfg.secretsEncryptionKey.length < 16) {
    issues.push({
      key: "SECRETS_ENCRYPTION_KEY",
      severity: prod ? "fatal" : "warn",
      message: `SECRETS_ENCRYPTION_KEY is too short (${cfg.secretsEncryptionKey.length} chars) — at least 16 are required.`,
      hint: "Generate one with: openssl rand -hex 32",
    });
  } else if (prod && !cfg.secretsEncryptionKey) {
    issues.push({
      key: "SECRETS_ENCRYPTION_KEY",
      severity: "fatal",
      message:
        "SECRETS_ENCRYPTION_KEY is not set in production — integration secrets " +
        "(SMS / WhatsApp tokens) cannot be encrypted at rest.",
      hint: "Generate one with: openssl rand -hex 32",
    });
  }

  if (prod && cfg.corsOrigins.length === 0) {
    issues.push({
      key: "CORS_ORIGINS",
      severity: "fatal",
      message:
        "No CORS origins are configured in production — every browser request " +
        "from the frontend will be rejected.",
      hint: "Set CORS_ORIGINS to a comma-separated list of allowed origins (no trailing slash).",
    });
  }

  if (prod && !cfg.publicBaseUrl) {
    // Reachable only if CORS_ORIGINS held no usable origin (the fatal
    // check above normally prevents this). Without a base URL, every
    // user-facing link email (password reset / invitation / activation)
    // hits the operational gate and is refused.
    issues.push({
      key: "PUBLIC_BASE_URL",
      severity: "warn",
      message:
        "No public base URL could be resolved (PUBLIC_BASE_URL unset and no usable " +
        "CORS origin) — password-reset, invitation and activation link emails will be refused.",
      hint: "Set PUBLIC_BASE_URL to the frontend origin (e.g. https://app.example.com), or ensure CORS_ORIGINS lists it.",
    });
  }

  // -- format warnings -----------------------------------------------------
  if (cfg.redis.url && !/^rediss?:\/\//i.test(cfg.redis.url)) {
    issues.push({
      key: "REDIS_URL",
      severity: "warn",
      message: "REDIS_URL does not start with redis:// or rediss:// — it may fail to connect.",
      hint: "Expected form: redis://[:password@]host:port",
    });
  }

  if (cfg.pgPoolMax < 1) {
    issues.push({
      key: "PG_POOL_MAX",
      severity: "warn",
      message: `PG_POOL_MAX=${cfg.pgPoolMax} is below 1 — falling back to the pool default may behave unexpectedly.`,
      hint: "Set PG_POOL_MAX to a positive integer (default 20).",
    });
  }

  // -- production posture warnings ----------------------------------------
  if (prod && cfg.seedDemoData) {
    issues.push({
      key: "SEED_DEMO_DATA",
      severity: "warn",
      message: "SEED_DEMO_DATA=true in production — demo data will be loaded into the live database.",
      hint: "Set SEED_DEMO_DATA=false for production deployments.",
    });
  }

  if (prod && cfg.rbac.emergencyMode) {
    issues.push({
      key: "RBAC_EMERGENCY_MODE",
      severity: "warn",
      message: "RBAC_EMERGENCY_MODE=true — all RBAC permission checks are bypassed.",
      hint: "This is an emergency-only switch. Set RBAC_EMERGENCY_MODE=false once the incident is over.",
    });
  }

  if (prod && !cfg.redis.configured) {
    issues.push({
      key: "REDIS_URL",
      severity: "warn",
      message:
        "Redis is not configured in production — rate-limit counters fall back to " +
        "per-replica memory and reset on every restart.",
      hint: "Set REDIS_URL so caps are shared across restarts and replicas.",
    });
  }

  if (cfg.objectStorage.driver === "local" && !cfg.objectStorage.localDir) {
    issues.push({
      key: "STORAGE_LOCAL_DIR",
      severity: "fatal",
      message:
        "STORAGE_DRIVER=local but STORAGE_LOCAL_DIR is not set — the " +
        "local-filesystem storage adapter has no root directory.",
      hint: "Set STORAGE_LOCAL_DIR to a writable directory, or use STORAGE_DRIVER=replit.",
    });
  }

  return issues;
}

// ──────────────────────────── module init ─────────────────────────────────
// `EnvSchema.parse` cannot throw — every field has a `.catch` fallback — so
// `config` is always a fully-formed object, even with a broken environment.

export const config: AppConfig = buildConfig(EnvSchema.parse(process.env));

const envIssues: EnvIssue[] = collectEnvIssues(config, process.env);

/** All environment problems detected at boot (fatal + warn). */
export function getEnvIssues(): readonly EnvIssue[] {
  return envIssues;
}

/** True when at least one fatal misconfiguration was detected. */
export function hasFatalEnvIssues(): boolean {
  return envIssues.some((i) => i.severity === "fatal");
}

function renderReport(): string {
  const fatal = envIssues.filter((i) => i.severity === "fatal");
  const warn = envIssues.filter((i) => i.severity === "warn");
  const lines: string[] = [];
  // The banner reflects severity: a warning-only report must NOT claim the
  // check "FAILED" — startup succeeds when there are no fatal issues.
  const banner =
    fatal.length > 0
      ? "ENVIRONMENT CONFIGURATION CHECK FAILED"
      : "ENVIRONMENT CONFIGURATION — WARNINGS";
  lines.push("");
  lines.push("══════════════════════════════════════════════════════════════════");
  lines.push(`  ${banner}`);
  lines.push("══════════════════════════════════════════════════════════════════");
  lines.push(`  NODE_ENV = ${config.nodeEnv}`);
  lines.push("");
  if (fatal.length > 0) {
    lines.push(`  ${fatal.length} fatal problem(s) — the server cannot start:`);
    lines.push("");
    for (const i of fatal) {
      lines.push(`  ✗ [${i.key}] ${i.message}`);
      lines.push(`      → ${i.hint}`);
      lines.push("");
    }
  }
  if (warn.length > 0) {
    lines.push(`  ${warn.length} warning(s):`);
    lines.push("");
    for (const i of warn) {
      lines.push(`  ! [${i.key}] ${i.message}`);
      lines.push(`      → ${i.hint}`);
      lines.push("");
    }
  }
  lines.push("  See .env.example and docs/DEPLOYMENT.md for the full reference.");
  lines.push("══════════════════════════════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}

/**
 * Fail-fast startup gate. Call this exactly once, as early as possible in
 * the startup path (see `index.ts`). When a fatal misconfiguration exists it
 * prints an actionable report and exits with code 1 — the process never
 * reaches the point where the bad value would cause a confusing failure deep
 * inside a request. Warnings are printed but do not block startup.
 */
export function assertEnvOrExit(): void {
  if (envIssues.length === 0) return;
  // Use console directly: this runs before/independent of logger config and
  // must be visible even when LOG_LEVEL would otherwise suppress it.
  console.error(renderReport());
  if (hasFatalEnvIssues()) {
    process.exit(1);
  }
}

/**
 * A redacted, JSON-safe snapshot of the effective configuration. Secret
 * values (see `SECRET_ENV_KEYS`) are reported only as `"set"` / `"unset"`,
 * never their contents — safe to expose on an operator health endpoint.
 */
export function describeConfig(): Record<string, unknown> {
  const mask = (v: string | undefined): string => (v ? "set" : "unset");
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    hostname: config.hostname,
    logLevel: config.logLevel,
    databaseUrl: mask(config.databaseUrl || undefined),
    pgPoolMax: config.pgPoolMax,
    jwtSecret: mask(config.jwtSecret || undefined),
    fieldEncryptionKey: mask(config.fieldEncryptionKey),
    secretsEncryptionKey: mask(config.secretsEncryptionKey),
    corsOrigins: config.corsOrigins,
    redis: {
      configured: config.redis.configured,
      url: mask(config.redis.url),
    },
    seedDemoData: config.seedDemoData,
    persistAllEvents: config.persistAllEvents,
    objectStorage: {
      driver: config.objectStorage.driver,
      configured: config.objectStorage.configured,
      publicSearchPaths: config.objectStorage.publicSearchPaths.length,
    },
    vapidConfigured: config.vapid.configured,
    whatsappConfigured: config.whatsapp.configured,
    rbacEmergencyMode: config.rbac.emergencyMode,
    ops: config.ops,
    envIssues: {
      fatal: envIssues.filter((i) => i.severity === "fatal").length,
      warn: envIssues.filter((i) => i.severity === "warn").length,
    },
  };
}
