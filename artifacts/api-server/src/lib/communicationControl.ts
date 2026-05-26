/**
 * Communication Control Plane helpers — provider failover + DLP scan.
 *
 * Mirrors the shape of lib/aiGovernance.ts so an operator who knows
 * one knows the other. The send-side seam looks like:
 *
 *   for (const p of await getActiveProviders('email')) {
 *     const dlp = await applyDlp(body, 'email', companyId);
 *     if (dlp.blocked) throw new ForbiddenError(dlp.reason);
 *     try { await send(p, dlp.body); break; }
 *     catch (err) { logger.warn(err, `[${p.slug}] failed, falling back`); }
 *   }
 *
 * No real send call is plumbed here — wiring the actual outbound
 * paths (email_queue / whatsapp_queue / sms_queue) to this seam is a
 * follow-up. This module gives the control surface its inputs.
 *
 * Caching: provider + rule rows are read-mostly. A 60-second TTL
 * keeps the runtime cheap without making rule-edits invisible for
 * minutes after the operator saves them.
 */
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

export type Channel = "email" | "whatsapp" | "sms" | "pbx" | "webhook";

export interface CommunicationProviderRow {
  id: number;
  channel: Channel;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  config: Record<string, unknown>;
  notes: string | null;
}

export interface DlpRuleRow {
  id: number;
  companyId: number | null;
  name: string;
  description: string | null;
  channel: Channel | null;
  pattern: string;
  action: "flag" | "redact" | "block";
  replacement: string | null;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
}

export interface DlpResult {
  /** Body after redaction (unchanged if no rule fired or only 'flag' rules fired). */
  body: string;
  /** True if any matched rule has action='block'. */
  blocked: boolean;
  /** Human-readable reason when blocked. */
  reason: string | null;
  /** Every rule that fired, in match order. */
  matches: Array<{
    ruleId: number;
    ruleName: string;
    action: "flag" | "redact" | "block";
    severity: "info" | "warning" | "critical";
    matchedText: string;
  }>;
}

// ─────────────────────── caches ─────────────────────────────────────────

const TTL_MS = 60_000;

interface CacheEntry<T> { value: T; expiresAt: number; }
const providersCache = new Map<Channel, CacheEntry<CommunicationProviderRow[]>>();
const rulesCache     = new Map<string, CacheEntry<DlpRuleRow[]>>();

function fresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

/**
 * Drop both caches. Called by the admin write endpoints so a
 * freshly-saved provider/rule becomes visible immediately.
 */
export function invalidateCommunicationControlCache(): void {
  providersCache.clear();
  rulesCache.clear();
}

// ─────────────────────── providers ──────────────────────────────────────

/**
 * Returns providers for `channel` ordered by priority (lowest first).
 * 'failover-only' providers come AFTER 'active' providers regardless
 * of their priority numbers, so the runtime tries primaries first.
 */
export async function getActiveProviders(channel: Channel): Promise<CommunicationProviderRow[]> {
  const cached = providersCache.get(channel);
  if (fresh(cached)) return cached.value;
  try {
    const rows = await rawQuery<CommunicationProviderRow>(
      `SELECT id, channel, slug, name, status, priority, config, notes
         FROM communication_providers
        WHERE channel = $1 AND status <> 'disabled'
        ORDER BY (status = 'failover-only') ASC, priority ASC`,
      [channel],
    );
    providersCache.set(channel, { value: rows, expiresAt: Date.now() + TTL_MS });
    return rows;
  } catch (err) {
    logger.warn(err, `[communicationControl] getActiveProviders(${channel}) failed`);
    return [];
  }
}

// ─────────────────────── DLP ────────────────────────────────────────────

/**
 * Load DLP rules applicable to a (channel, companyId) — platform-wide
 * rules + the tenant's own rules. Cached per (channel, companyId).
 */
async function loadDlpRules(channel: Channel, companyId: number | null): Promise<DlpRuleRow[]> {
  const cacheKey = `${channel}:${companyId ?? "system"}`;
  const cached = rulesCache.get(cacheKey);
  if (fresh(cached)) return cached.value;
  try {
    const rows = await rawQuery<DlpRuleRow>(
      `SELECT id, "companyId", name, description, channel, pattern, action, replacement, severity, enabled
         FROM communication_dlp_rules
        WHERE enabled = true
          AND (channel = $1 OR channel IS NULL)
          AND ("companyId" = $2 OR "companyId" IS NULL)
        ORDER BY severity DESC, id ASC`,
      [channel, companyId],
    );
    rulesCache.set(cacheKey, { value: rows, expiresAt: Date.now() + TTL_MS });
    return rows;
  } catch (err) {
    logger.warn(err, `[communicationControl] loadDlpRules(${channel}) failed`);
    return [];
  }
}

/**
 * Compile a regex from a user-supplied pattern. POSIX regex flavour;
 * we wrap with try/catch so a malformed pattern doesn't crash the
 * outbound path. Returns null on compile failure (rule is skipped
 * with a warning).
 */
function compileRulePattern(rule: DlpRuleRow): RegExp | null {
  try {
    // POSIX `\m` / `\M` word-boundary tokens are Postgres-side; in JS
    // we translate to `\b`. Anything else passes through.
    const jsPattern = rule.pattern.replace(/\\m|\\M/g, "\\b");
    return new RegExp(jsPattern, "g");
  } catch (err) {
    logger.warn({ err, ruleId: rule.id, pattern: rule.pattern }, "[communicationControl] invalid regex; skipping rule");
    return null;
  }
}

/**
 * Scan an outbound message against DLP rules. Always returns a
 * DlpResult — `blocked: true` if any matched rule had action='block';
 * `body` may have been redacted. Never throws.
 */
export async function applyDlp(
  body: string,
  channel: Channel,
  companyId: number | null,
): Promise<DlpResult> {
  const rules = await loadDlpRules(channel, companyId);
  const matches: DlpResult["matches"] = [];
  let mutated = body;
  let blocked = false;
  let blockReason: string | null = null;

  for (const rule of rules) {
    const re = compileRulePattern(rule);
    if (!re) continue;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mutated)) !== null) {
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        severity: rule.severity,
        matchedText: m[0],
      });
      // Prevent infinite loop on zero-width matches.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches.some((mm) => mm.ruleId === rule.id)) {
      if (rule.action === "block") {
        blocked = true;
        blockReason = blockReason ?? `محتوى محظور من قاعدة DLP: ${rule.name}`;
      } else if (rule.action === "redact") {
        const replacement = rule.replacement ?? "[REDACTED]";
        const reGlobal = compileRulePattern(rule);
        if (reGlobal) mutated = mutated.replace(reGlobal, replacement);
      }
      // 'flag' is informational; body is unchanged, not blocked.
    }
  }

  return { body: mutated, blocked, reason: blockReason, matches };
}
