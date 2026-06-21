import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

// ───────────────────────── Infra-admin recipient pattern ─────────────────────
// Shared dispatch helpers for platform-level ("infra") alerts that may not map
// to any single tenant — Redis rate-limit fallback, event-DLQ backlog, and
// (Task #822) recurring suppression-trace write failures. Extracted from
// cronScheduler so the same recipient resolution + email-queue path can be
// reused outside the cron context (e.g. from the notification engine) without
// dragging in the cron module or risking an import cycle. Depends ONLY on
// rawdb / logger / config — never on notificationService — so the notification
// engine can import it safely.

export interface RateLimitAdminRecipient {
  companyId: number;
  assignmentId: number;
  email: string | null;
}

// A configurable list of "infra admin" recipient emails that get platform
// alerts even if they aren't a GM/owner of any tenant. Sources are merged
// (env + system_settings), de-duplicated case-insensitively, and applied on
// top of the per-tenant GM list.
const INFRA_ADMIN_EMAILS_SETTING_KEY = "infra_admin_emails";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

function getInfraAdminEmailsFromEnv(): string[] {
  return parseEmailList(config.admin.infraAdminEmails.join(","));
}

async function getInfraAdminEmailsFromSettings(): Promise<string[]> {
  try {
    const rows = await rawQuery<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
      [INFRA_ADMIN_EMAILS_SETTING_KEY]
    );
    if (rows.length === 0 || !rows[0]?.value) return [];
    const v = rows[0].value;
    // Accept both a JSON array (["a@x", "b@y"]) and a delimited string.
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((s) => s.length > 0 && EMAIL_RE.test(s));
      }
    } catch {
      /* fall through to delimited parsing */
    }
    return parseEmailList(v);
  } catch (e) {
    logger.error(e, "[infraAlerts] infra admin emails settings lookup failed");
    return [];
  }
}

export async function getInfraAdminEmails(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (e: string) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  for (const e of getInfraAdminEmailsFromEnv()) push(e);
  for (const e of await getInfraAdminEmailsFromSettings()) push(e);
  return out;
}

// Pivot company id used to satisfy the `outbound_queue."companyId"` column for
// infra-admin emails (which are platform-wide, not tenant-scoped). Prefers a
// company we already touched (admins[0]) so we never invent a foreign-key
// mismatch; falls back to any active company.
export async function getPivotCompanyId(admins: RateLimitAdminRecipient[]): Promise<number | null> {
  if (admins.length > 0 && admins[0]) return admins[0].companyId;
  try {
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM companies ORDER BY id ASC LIMIT 1`
    );
    return rows[0]?.id ?? null;
  } catch (e) {
    logger.error(e, "[infraAlerts] pivot company lookup failed");
    return null;
  }
}

export async function sendInfraAdminEmails(
  emails: string[],
  pivotCompanyId: number | null,
  type: string,
  title: string,
  body: string,
  excludeEmails: Iterable<string> = []
): Promise<number> {
  if (emails.length === 0 || pivotCompanyId === null) return 0;
  // Dedupe against mailboxes that already received the same alert another way
  // — same human shouldn't get the same page twice.
  const exclude = new Set<string>();
  for (const e of excludeEmails) {
    if (e) exclude.add(e.toLowerCase());
  }
  let queued = 0;
  for (const toEmail of emails) {
    if (exclude.has(toEmail.toLowerCase())) continue;
    try {
      await rawExecute(
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, "recipientName", subject, body,
            status, "refType", "createdAt", "updatedAt")
         VALUES ($1, 'email', $2, 'Infra Admin', $3, $4, 'pending', 'system_health', NOW(), NOW())`,
        [pivotCompanyId, toEmail, title, body]
      );
      queued++;
    } catch (e) {
      logger.error(e, `[infraAlerts] failed to queue infra-admin email for ${toEmail} (${type})`);
    }
  }
  return queued;
}

// Resolve one GM/owner per company (with their login email if any). Used by
// the rate-limit, DLQ, and suppression-trace-failure alerts so the recipient
// set stays consistent across infra alerts.
export async function getRateLimitAlertRecipients(): Promise<RateLimitAdminRecipient[]> {
  try {
    return await rawQuery<RateLimitAdminRecipient>(
      `SELECT DISTINCT ON (ea."companyId")
              ea."companyId" AS "companyId",
              ea.id          AS "assignmentId",
              u.email        AS "email"
       FROM employee_assignments ea
       LEFT JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN users u ON u."employeeId" = e.id
       WHERE ea.role IN ('general_manager','owner') AND ea.status = 'active'
       ORDER BY ea."companyId",
                CASE ea.role WHEN 'owner' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END,
                ea.id`
    );
  } catch (e) {
    logger.error(e, "[infraAlerts] rate-limit alert recipient lookup failed");
    return [];
  }
}

// ─────────────────── Suppression-trace write-failure observability ───────────
// Task #822. When a notification is silently dropped (opt-out / quiet hours /
// user prefs) the engine writes a best-effort "suppression trace" so support
// can later answer "why didn't this arrive?". That insert is swallowed on
// failure so it can never resurrect a delivery. The downside is that a
// recurring trace-write failure (e.g. a drifted status-CHECK constraint, as
// hit in Task #807/#817) only ever reaches the logs and pages nobody. This
// counter surfaces a *repeated* failure as a rate-limited infra alert without
// changing the zero-delivery semantics — the insert stays best-effort and this
// path never throws.

export interface SuppressionFailureTrackerState {
  /** Failures accumulated in the current rolling window. */
  count: number;
  /** Epoch ms the current counting window started (0 = no window yet). */
  windowStart: number;
  /** Epoch ms of the last alert dispatched (0 = never) — the cooldown gate. */
  lastAlertedAt: number;
}

// A run of failures must reach this many within the window before paging.
export const SUPPRESSION_FAILURE_ALERT_THRESHOLD = 5;
// Failures older than this don't count toward a fresh spike — a couple of
// isolated failures hours apart are noise, not an outage.
export const SUPPRESSION_FAILURE_WINDOW_MS = 10 * 60_000;
// One page per 30 min so a constraint outage (every dispatch failing) cannot
// flood recipients. Matches the rate-limit alerter's cooldown.
export const SUPPRESSION_FAILURE_REALERT_COOLDOWN_MS = 30 * 60_000;

export interface SuppressionFailureDecision {
  shouldAlert: boolean;
  /** Failure count observed in the window at decision time (incl. this one). */
  failuresInWindow: number;
  /** The state to persist after applying this failure. */
  state: SuppressionFailureTrackerState;
}

/**
 * Pure decision function — extracted so the threshold/window/cooldown logic is
 * unit-testable without a DB or a clock. Given the prior tracker state and the
 * current time, records one more failure and decides whether it crosses the
 * paging threshold. On a fired alert the window resets and the cooldown clock
 * starts, so a sustained outage pages once per cooldown rather than per insert.
 */
export function evaluateSuppressionFailure(
  prev: SuppressionFailureTrackerState,
  now: number,
  opts: { threshold?: number; windowMs?: number; cooldownMs?: number } = {}
): SuppressionFailureDecision {
  const threshold = opts.threshold ?? SUPPRESSION_FAILURE_ALERT_THRESHOLD;
  const windowMs = opts.windowMs ?? SUPPRESSION_FAILURE_WINDOW_MS;
  const cooldownMs = opts.cooldownMs ?? SUPPRESSION_FAILURE_REALERT_COOLDOWN_MS;

  // Decay: start a fresh window if there was none or the old one elapsed.
  let count = prev.count;
  let windowStart = prev.windowStart;
  if (windowStart === 0 || now - windowStart > windowMs) {
    count = 0;
    windowStart = now;
  }
  count += 1; // this failure

  const cooledDown = prev.lastAlertedAt === 0 || now - prev.lastAlertedAt >= cooldownMs;
  const shouldAlert = count >= threshold && cooledDown;

  if (shouldAlert) {
    // Reset the window and arm the cooldown so the next page waits a full
    // cooldown even if every subsequent insert keeps failing.
    return {
      shouldAlert: true,
      failuresInWindow: count,
      state: { count: 0, windowStart: now, lastAlertedAt: now },
    };
  }
  return {
    shouldAlert: false,
    failuresInWindow: count,
    state: { count, windowStart, lastAlertedAt: prev.lastAlertedAt },
  };
}

// Shared-store tracker (Task #841). The counter/window/cooldown previously
// lived in plain in-process memory, so each app server counted and cooled down
// independently — a sustained outage could page on-call once *per replica*, or
// take longer to cross the threshold on any single server when load-balanced.
// The state now lives in a single `system_settings` row (NULL company/branch)
// so the whole fleet shares one counter and one cooldown, matching the
// cron rate-limit / infra-critical-digest alerters' persistence pattern.
const SUPPRESSION_FAILURE_STATE_KEY = "suppression_failure_alerter_state";

// Transaction-scoped advisory lock keys serializing the read-modify-write so
// concurrent failures across replicas can't lose increments or double-page.
// Two int32 keys (pg_advisory_xact_lock(int4,int4)); arbitrary but stable.
const SUPPRESSION_FAILURE_LOCK_KEY_A = 0x494e4652; // "INFR"
const SUPPRESSION_FAILURE_LOCK_KEY_B = 0x53555050; // "SUPP"

const EMPTY_SUPPRESSION_FAILURE_STATE: SuppressionFailureTrackerState = {
  count: 0,
  windowStart: 0,
  lastAlertedAt: 0,
};

async function loadSuppressionFailureState(): Promise<SuppressionFailureTrackerState> {
  const rows = await rawQuery<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
    [SUPPRESSION_FAILURE_STATE_KEY]
  );
  if (rows.length === 0 || !rows[0]?.value) return { ...EMPTY_SUPPRESSION_FAILURE_STATE };
  try {
    const parsed = JSON.parse(rows[0].value) as Partial<SuppressionFailureTrackerState>;
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      windowStart: typeof parsed.windowStart === "number" ? parsed.windowStart : 0,
      lastAlertedAt: typeof parsed.lastAlertedAt === "number" ? parsed.lastAlertedAt : 0,
    };
  } catch {
    return { ...EMPTY_SUPPRESSION_FAILURE_STATE };
  }
}

async function saveSuppressionFailureState(state: SuppressionFailureTrackerState): Promise<void> {
  // Upsert against the partial unique index covering
  // `(key) WHERE "companyId" IS NULL AND "branchId" IS NULL`
  // (migration 006_system_settings_table.sql) — same idiom as the cron
  // rate-limit alerter so a concurrent tick atomically replaces the JSON blob.
  await rawExecute(
    `INSERT INTO system_settings (key, value, "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (key) WHERE "companyId" IS NULL AND "branchId" IS NULL
     DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
    [SUPPRESSION_FAILURE_STATE_KEY, JSON.stringify(state)]
  );
}

/** Test-only reset so the shared counter doesn't leak across cases. */
export async function __resetSuppressionFailureTracker(): Promise<void> {
  await saveSuppressionFailureState({ ...EMPTY_SUPPRESSION_FAILURE_STATE });
}

/**
 * Test-only clock rewind: subtract `ms` from the tracker's windowStart and
 * lastAlertedAt so a test can simulate the rolling window and/or the re-alert
 * cooldown elapsing without waiting real wall-clock time. No-op on zeroed
 * (never-set) fields so it can't accidentally arm a cooldown that never fired.
 * Lets an e2e test prove a sustained outage pages a SECOND time once the
 * cooldown has elapsed, against the real dispatch path (Task #833). Operates on
 * the shared store under the same advisory lock as the live path (Task #841).
 */
export async function __rewindSuppressionFailureClock(ms: number): Promise<void> {
  await withTransaction(async () => {
    await rawQuery(`SELECT pg_advisory_xact_lock($1::int, $2::int)`, [
      SUPPRESSION_FAILURE_LOCK_KEY_A,
      SUPPRESSION_FAILURE_LOCK_KEY_B,
    ]);
    const s = await loadSuppressionFailureState();
    await saveSuppressionFailureState({
      count: s.count,
      windowStart: s.windowStart === 0 ? 0 : s.windowStart - ms,
      lastAlertedAt: s.lastAlertedAt === 0 ? 0 : s.lastAlertedAt - ms,
    });
  });
}

async function dispatchSuppressionFailureAlert(
  companyId: number,
  reason: string,
  errMsg: string,
  failuresInWindow: number
): Promise<void> {
  const title = "تنبيه: تعذّر تسجيل أثر حظر الإشعارات بشكل متكرر";
  const body =
    `فشل تسجيل أثر الإشعارات المحجوبة (suppression trace) في ` +
    `notification_delivery_log ${failuresInWindow} مرة خلال فترة وجيزة ` +
    `(آخر سبب: ${reason}، الشركة ${companyId}). قد يدل ذلك على قيد CHECK ` +
    `غير متوافق على عمود status — تحقّق من القيد ` +
    `notification_delivery_log_status_check وسجلّات الترحيل. رسالة الخطأ: ${errMsg}`;

  const admins = await getRateLimitAlertRecipients();
  const infraEmails = await getInfraAdminEmails();
  const pivot = await getPivotCompanyId(admins);
  const gmEmails = admins.map((a) => a.email).filter((e): e is string => !!e);

  // Page infra on-call + each company's GM/owner by email (same recipient set
  // as the rate-limit / DLQ alerts), de-duped case-insensitively.
  const allEmails: string[] = [];
  const seenEmail = new Set<string>();
  for (const e of [...gmEmails, ...infraEmails]) {
    const k = e.toLowerCase();
    if (seenEmail.has(k)) continue;
    seenEmail.add(k);
    allEmails.push(e);
  }
  const queued = await sendInfraAdminEmails(
    allEmails,
    pivot,
    "suppression_trace_failure",
    title,
    body
  );

  // Surface in-app too (alerts screen) — one smart_alert per company so a GM
  // who isn't watching email still sees the degradation. Best-effort.
  let alertsInserted = 0;
  for (const a of admins) {
    try {
      await rawExecute(
        `INSERT INTO smart_alerts ("companyId", type, severity, title, description, "relatedType", "relatedId", "isRead", "isDismissed", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, NOW())`,
        [a.companyId, "notification_trace_failure", "critical", title, body, "system_health", null]
      );
      alertsInserted++;
    } catch (e) {
      logger.error(e, `[infraAlerts] suppression-failure smart_alert insert failed for company ${a.companyId}`);
    }
  }

  logger.warn(
    `[infraAlerts] suppression-trace write failures crossed threshold ` +
      `(${failuresInWindow} in window) — paged ${queued} email(s), ${alertsInserted} in-app alert(s)`
  );
}

/**
 * Record one suppression-trace write failure. Increments the fleet-shared
 * counter (in `system_settings`) and, on a repeated failure crossing the
 * threshold (rate-limited by the cooldown), dispatches an infra alert. The
 * counter/window/cooldown read-modify-write runs inside a transaction-scoped
 * advisory lock so concurrent failures across multiple app servers can't lose
 * increments or double-page — a sustained outage pages exactly once per
 * cooldown across the whole fleet (Task #841). NEVER throws — the caller's
 * best-effort, zero-delivery semantics must be preserved.
 */
export async function noteSuppressionTraceFailure(
  companyId: number,
  reason: string,
  err: unknown
): Promise<void> {
  try {
    const decision = await withTransaction(async () => {
      // Serialize the whole load → evaluate → save against other replicas so
      // the threshold/cooldown gate is consistent fleet-wide. The lock is
      // transaction-scoped, so it auto-releases on commit/rollback.
      await rawQuery(`SELECT pg_advisory_xact_lock($1::int, $2::int)`, [
        SUPPRESSION_FAILURE_LOCK_KEY_A,
        SUPPRESSION_FAILURE_LOCK_KEY_B,
      ]);
      const prev = await loadSuppressionFailureState();
      const d = evaluateSuppressionFailure(prev, Date.now());
      await saveSuppressionFailureState(d.state);
      return d;
    });
    if (!decision.shouldAlert) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    await dispatchSuppressionFailureAlert(companyId, reason, errMsg, decision.failuresInWindow);
  } catch (e) {
    logger.error(e, "[infraAlerts] noteSuppressionTraceFailure failed");
  }
}

// ─────────────── New-critical-infra-alert digest decision (Task #831) ─────────
// The infra-alerts page (GET /intelligence/alerts/infra) lets admins SEE recent
// platform alerts, but a new unacknowledged critical `system_health` alert only
// gets noticed if someone opens the page. This pure decision function backs a
// scheduled digest that pages infra admins (in-app + email, reusing the same
// recipient resolution as the rate-limit alerter) when a NEW unacknowledged
// critical alert appears, while a cooldown keeps a sustained outage (many
// alerts firing in a row) from spamming the same on-call humans repeatedly.

// One page per 30 min, matching the rate-limit / suppression-trace alerters so
// a burst of critical alerts pages once and then stays quiet for the window.
export const INFRA_CRITICAL_DIGEST_REALERT_COOLDOWN_MS = 30 * 60_000;

export interface InfraCriticalDigestState {
  /** Highest smart_alert id already paged for — the "already seen" watermark. */
  lastMaxAlertId: number;
  /** Epoch ms of the last digest dispatched (0 = never) — the cooldown gate. */
  lastAlertedAt: number;
}

export interface InfraCriticalDigestDecision {
  shouldAlert: boolean;
  /** Ids newer than the watermark (the candidates that motivated this run). */
  newAlertIds: number[];
  /** The state to persist after applying this decision. */
  state: InfraCriticalDigestState;
}

/**
 * Pure decision function — extracted so the watermark + cooldown logic is
 * unit-testable without a DB or a clock. Given the prior state and the set of
 * currently-open (unacknowledged) critical `system_health` alert ids, decides
 * whether to page.
 *
 * - Only ids strictly greater than `lastMaxAlertId` count as "new".
 * - If there are new ids but we're still within the cooldown, the watermark is
 *   intentionally NOT advanced so those alerts batch into the next eligible run
 *   rather than being silently skipped forever.
 * - On a fired digest the watermark advances to the highest new id and the
 *   cooldown clock arms, so a sustained outage pages once per cooldown.
 */
export function evaluateInfraCriticalDigest(
  prev: InfraCriticalDigestState,
  openCriticalAlertIds: number[],
  now: number,
  cooldownMs: number = INFRA_CRITICAL_DIGEST_REALERT_COOLDOWN_MS
): InfraCriticalDigestDecision {
  const newAlertIds = openCriticalAlertIds.filter((id) => id > prev.lastMaxAlertId);
  if (newAlertIds.length === 0) {
    return { shouldAlert: false, newAlertIds, state: prev };
  }
  const cooledDown = prev.lastAlertedAt === 0 || now - prev.lastAlertedAt >= cooldownMs;
  if (!cooledDown) {
    // Hold the watermark so these new alerts re-qualify on the next run once
    // the cooldown elapses — never advance it without actually paging.
    return { shouldAlert: false, newAlertIds, state: prev };
  }
  const maxId = newAlertIds.reduce((m, id) => Math.max(m, id), prev.lastMaxAlertId);
  return {
    shouldAlert: true,
    newAlertIds,
    state: { lastMaxAlertId: maxId, lastAlertedAt: now },
  };
}

// ─────────────── Admin-tunable infra-critical digest config (Task #834) ──────
// The digest (Task #831) used to page on a fixed rule: any new unacknowledged
// CRITICAL system_health alert, with a hard-coded 30-min cooldown. This config
// lets a system admin tune which severities trigger a page (the threshold) and
// how long the re-alert cooldown lasts — without a code change. Stored as a
// single system-level system_settings row (companyId/branchId NULL); absent or
// invalid fields fall back to the defaults, which reproduce today's behaviour.
export const INFRA_CRITICAL_DIGEST_CONFIG_KEY = "infra_critical_digest_config";

export const INFRA_CRITICAL_DIGEST_DEFAULT_COOLDOWN_MINUTES =
  INFRA_CRITICAL_DIGEST_REALERT_COOLDOWN_MS / 60_000; // 30

export type InfraSeverityThreshold = "info" | "warning" | "critical";

export const INFRA_CRITICAL_DIGEST_DEFAULT_SEVERITY_THRESHOLD: InfraSeverityThreshold = "critical";

// Severity ranking: higher number = more severe. The digest pages for any open
// alert whose severity is at or ABOVE the configured threshold, so a threshold
// of 'warning' pages on both warning and critical alerts.
export const INFRA_SEVERITY_RANK: Record<InfraSeverityThreshold, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export const INFRA_CRITICAL_DIGEST_MIN_COOLDOWN_MINUTES = 1;
export const INFRA_CRITICAL_DIGEST_MAX_COOLDOWN_MINUTES = 1440; // 24h

export interface InfraCriticalDigestConfig {
  severityThreshold: InfraSeverityThreshold;
  cooldownMinutes: number;
}

export const INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG: InfraCriticalDigestConfig = {
  severityThreshold: INFRA_CRITICAL_DIGEST_DEFAULT_SEVERITY_THRESHOLD,
  cooldownMinutes: INFRA_CRITICAL_DIGEST_DEFAULT_COOLDOWN_MINUTES,
};

/**
 * The set of severities that meet or exceed `threshold` — the values the digest
 * query filters on. e.g. 'warning' → ['warning','critical'], 'critical' →
 * ['critical'] (today's default).
 */
export function severitiesAtOrAbove(threshold: InfraSeverityThreshold): InfraSeverityThreshold[] {
  const min = INFRA_SEVERITY_RANK[threshold] ?? INFRA_SEVERITY_RANK.critical;
  return (Object.keys(INFRA_SEVERITY_RANK) as InfraSeverityThreshold[]).filter(
    (sev) => INFRA_SEVERITY_RANK[sev] >= min
  );
}

/**
 * Validate + coerce a stored or client-posted config blob (string JSON or
 * object), falling back to the safe defaults for any missing/invalid field so
 * the digest always has a sane threshold + cooldown. Pure — unit-testable.
 */
export function parseInfraCriticalDigestConfig(raw: unknown): InfraCriticalDigestConfig {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") obj = parsed as Record<string, unknown>;
    } catch {
      /* leave obj empty → defaults */
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const t = obj.severityThreshold;
  const severityThreshold: InfraSeverityThreshold =
    t === "info" || t === "warning" || t === "critical"
      ? t
      : INFRA_CRITICAL_DIGEST_DEFAULT_SEVERITY_THRESHOLD;
  const rawCooldown = Number(obj.cooldownMinutes);
  const cooldownMinutes =
    Number.isFinite(rawCooldown) &&
    rawCooldown >= INFRA_CRITICAL_DIGEST_MIN_COOLDOWN_MINUTES &&
    rawCooldown <= INFRA_CRITICAL_DIGEST_MAX_COOLDOWN_MINUTES
      ? Math.round(rawCooldown)
      : INFRA_CRITICAL_DIGEST_DEFAULT_COOLDOWN_MINUTES;
  return { severityThreshold, cooldownMinutes };
}

// ─────────── Per-company digest config override (Task #845) ──────────────────
// The Task #834 config above was a single system-wide value (companyId/branchId
// NULL). In a multi-tenant deployment different companies may want different
// paging sensitivity, so the surface now supports a per-company override that
// FALLS BACK to the system default. Storage stays in system_settings under the
// same key: the system default lives on the (companyId IS NULL, branchId IS
// NULL) row; a company override lives on a (companyId = X, branchId IS NULL)
// row. Both read/write paths use a SELECT-then-UPDATE/INSERT idiom so they do
// not depend on a partial unique index covering the company-scoped row.

/**
 * Load the digest config for a given scope from system_settings, falling back
 * to the safe defaults (today's behaviour) when unset or on any read error.
 *
 * - `companyId` omitted/null → the SYSTEM-LEVEL row only (companyId IS NULL).
 *   Backward-compatible with the original Task #834 behaviour.
 * - `companyId` set → the company override row if present, otherwise the
 *   system-level default, otherwise the built-in defaults. This is the
 *   "company override → system default" resolution the cron and routes rely on.
 */
export async function loadInfraCriticalDigestConfig(
  companyId?: number | null
): Promise<InfraCriticalDigestConfig> {
  try {
    if (companyId != null) {
      const overrideRows = await rawQuery<{ value: string }>(
        `SELECT value FROM system_settings WHERE key = $1 AND "companyId" = $2 AND "branchId" IS NULL`,
        [INFRA_CRITICAL_DIGEST_CONFIG_KEY, companyId]
      );
      if (overrideRows.length > 0 && overrideRows[0]?.value) {
        return parseInfraCriticalDigestConfig(overrideRows[0].value);
      }
    }
    const rows = await rawQuery<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
      [INFRA_CRITICAL_DIGEST_CONFIG_KEY]
    );
    if (rows.length === 0 || !rows[0]?.value) return { ...INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG };
    return parseInfraCriticalDigestConfig(rows[0].value);
  } catch (e) {
    logger.error(e, "[infraAlerts] infra critical digest config load failed");
    return { ...INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG };
  }
}

/** True when a company has its own override row (vs. inheriting the default). */
export async function hasInfraCriticalDigestCompanyOverride(companyId: number): Promise<boolean> {
  try {
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM system_settings WHERE key = $1 AND "companyId" = $2 AND "branchId" IS NULL`,
      [INFRA_CRITICAL_DIGEST_CONFIG_KEY, companyId]
    );
    return rows.length > 0;
  } catch (e) {
    logger.error(e, "[infraAlerts] infra critical digest override check failed");
    return false;
  }
}

/**
 * Persist the digest config for a given scope. Uses a SELECT-then-UPDATE/INSERT
 * (matching settings.ts /general) so it does not depend on a partial unique
 * index existing on system_settings for the company-scoped row.
 *
 * - `companyId` omitted/null → write the SYSTEM-LEVEL default row.
 * - `companyId` set → write that company's override row.
 */
export async function saveInfraCriticalDigestConfig(
  config: InfraCriticalDigestConfig,
  companyId?: number | null
): Promise<void> {
  const value = JSON.stringify(config);
  if (companyId != null) {
    const existing = await rawQuery<{ id: number }>(
      `SELECT id FROM system_settings WHERE key = $1 AND "companyId" = $2 AND "branchId" IS NULL`,
      [INFRA_CRITICAL_DIGEST_CONFIG_KEY, companyId]
    );
    if (existing.length > 0) {
      await rawExecute(
        `UPDATE system_settings SET value = $1, "updatedAt" = NOW()
          WHERE key = $2 AND "companyId" = $3 AND "branchId" IS NULL`,
        [value, INFRA_CRITICAL_DIGEST_CONFIG_KEY, companyId]
      );
    } else {
      await rawExecute(
        `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3)`,
        [INFRA_CRITICAL_DIGEST_CONFIG_KEY, value, companyId]
      );
    }
    return;
  }
  const existing = await rawQuery<{ id: number }>(
    `SELECT id FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
    [INFRA_CRITICAL_DIGEST_CONFIG_KEY]
  );
  if (existing.length > 0) {
    await rawExecute(
      `UPDATE system_settings SET value = $1, "updatedAt" = NOW()
        WHERE key = $2 AND "companyId" IS NULL AND "branchId" IS NULL`,
      [value, INFRA_CRITICAL_DIGEST_CONFIG_KEY]
    );
  } else {
    await rawExecute(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2)`,
      [INFRA_CRITICAL_DIGEST_CONFIG_KEY, value]
    );
  }
}

/**
 * Remove a company's override row so it falls back to the system default.
 * No-op if there was no override. The system-level default row is never
 * touched here (pass no companyId to edit that via saveInfraCriticalDigestConfig).
 */
export async function deleteInfraCriticalDigestCompanyOverride(companyId: number): Promise<void> {
  await rawExecute(
    `DELETE FROM system_settings WHERE key = $1 AND "companyId" = $2 AND "branchId" IS NULL`,
    [INFRA_CRITICAL_DIGEST_CONFIG_KEY, companyId]
  );
}

/**
 * Build an effective-config resolver for the cron scan in ONE pair of queries
 * instead of N per-company round-trips. Loads the system default row plus every
 * company override row, then returns a function mapping a companyId to its
 * effective config (company override → system default → built-in defaults).
 */
export async function buildInfraCriticalDigestConfigResolver(): Promise<
  (companyId: number) => InfraCriticalDigestConfig
> {
  let systemConfig: InfraCriticalDigestConfig = { ...INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG };
  const overrides = new Map<number, InfraCriticalDigestConfig>();
  try {
    const rows = await rawQuery<{ companyId: number | null; value: string }>(
      `SELECT "companyId", value FROM system_settings WHERE key = $1 AND "branchId" IS NULL`,
      [INFRA_CRITICAL_DIGEST_CONFIG_KEY]
    );
    for (const r of rows) {
      if (!r.value) continue;
      const cfg = parseInfraCriticalDigestConfig(r.value);
      if (r.companyId == null) systemConfig = cfg;
      else overrides.set(r.companyId, cfg);
    }
  } catch (e) {
    logger.error(e, "[infraAlerts] infra critical digest config resolver load failed");
  }
  return (companyId: number) => overrides.get(companyId) ?? systemConfig;
}
