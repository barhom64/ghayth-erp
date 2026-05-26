/**
 * AI usage tracking — one row per LLM request, written to ai_request_logs.
 *
 * Two responsibilities only:
 *   1. compute cost from token counts using a static price table
 *   2. fire-and-forget the row insert so the request path never blocks
 *      on observability writes
 *
 * Pricing is per-million-token rates from Anthropic's public list. New
 * providers/models go in PRICING below; if a model is unknown we keep
 * the row but log a warning + a $0 cost — better to surface usage with
 * "?" than to drop it because we hadn't updated the table yet.
 *
 * Why a separate module from observability.ts: the observability facade
 * is vendor-neutral and synchronous (logs/metrics live in memory).
 * Usage tracking is durable + persisted to a tenant table, so it
 * belongs next to the AI engines and behind the same "never throw
 * upward" guarantee — never break an AI request because cost logging
 * failed.
 */
import { rawExecute } from "./rawdb.js";
import { logger } from "./logger.js";

export type AiStatus = "success" | "error";

export interface AiUsageRecord {
  /** Tenant the request was made for. Null for system-level calls. */
  companyId?: number | null;
  /** User who triggered the request. Null for cron/system. */
  userId?: number | null;
  /** Provider identifier — extend PRICING below when adding more. */
  provider?: string;
  /** Model identifier as sent on the wire (e.g. "claude-haiku-4-5"). */
  model: string;
  /** Feature key — module.action shape ("reception.categorize", "print.suggest_template"). */
  feature: string;
  /** Tokens in the request prompt + system message. */
  promptTokens?: number;
  /** Tokens in the response. */
  completionTokens?: number;
  /** Wall-clock duration of the model call, in milliseconds. */
  durationMs: number;
  /** Outcome of the call. Default "success". */
  status?: AiStatus;
  /** Short error code/category when status="error". */
  errorCode?: string | null;
}

/**
 * Per-million-token USD prices. Keys can be exact (`provider:model`) or
 * a model-family prefix (`provider:claude-haiku-4-5`) — the lookup
 * tries an exact match first, then walks back to the longest prefix
 * match, so a dated/suffixed model id (`claude-haiku-4-5-20251001`)
 * still resolves to its family's price without an exact entry. New
 * families go in this table; price changes update existing entries.
 * Old rows keep the price they were inserted with (cost is computed
 * at write time, not on read).
 */
const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  // Anthropic — Claude 4.x family. Add a date-suffixed entry if a
  // specific version needs its own price; otherwise the prefix
  // match below carries the family-level price through.
  "anthropic:claude-haiku-4-5":  { inputPerMTok: 1.0,  outputPerMTok: 5.0  },
  "anthropic:claude-sonnet-4-6": { inputPerMTok: 3.0,  outputPerMTok: 15.0 },
  "anthropic:claude-opus-4-7":   { inputPerMTok: 15.0, outputPerMTok: 75.0 },
};

/** Resolve a price entry for `provider:model`, falling back to the longest matching prefix. */
function resolvePrice(provider: string, model: string): { inputPerMTok: number; outputPerMTok: number } | null {
  const exactKey = `${provider}:${model}`;
  if (PRICING[exactKey]) return PRICING[exactKey];
  // Walk back the model string by removing trailing -segments until
  // we hit a prefix that's in the table. Handles dated suffixes like
  // `claude-haiku-4-5-20251001` falling back to `claude-haiku-4-5`.
  const parts = model.split("-");
  while (parts.length > 1) {
    parts.pop();
    const prefixKey = `${provider}:${parts.join("-")}`;
    if (PRICING[prefixKey]) return PRICING[prefixKey];
  }
  return null;
}

/**
 * Cost in USD for one call. Returns 0 (with a warning) for unknown
 * provider/model pairs so the row is still recorded — surfacing "we
 * spent ?$ on an unknown model" is better than silently dropping it.
 */
export function computeAiCostUsd(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = resolvePrice(provider, model);
  if (!price) {
    logger.warn({ provider, model }, "[aiUsage] no pricing entry — cost recorded as $0");
    return 0;
  }
  const inUsd  = (promptTokens     / 1_000_000) * price.inputPerMTok;
  const outUsd = (completionTokens / 1_000_000) * price.outputPerMTok;
  // Round to 6 decimals so the numeric(12,6) column never gets a value
  // that would be silently truncated by the driver.
  return Math.round((inUsd + outUsd) * 1_000_000) / 1_000_000;
}

/**
 * Persist one AI request row. Fire-and-forget by design: an AI call
 * that succeeded must never fail because we couldn't log its cost.
 * Errors are caught and logged here so callers can `await` if they
 * want, or float the promise.
 */
export async function recordAiUsage(record: AiUsageRecord): Promise<void> {
  const provider = record.provider ?? "anthropic";
  const promptTokens     = record.promptTokens     ?? 0;
  const completionTokens = record.completionTokens ?? 0;
  const totalTokens      = promptTokens + completionTokens;
  const status           = record.status ?? "success";
  const costUsd          = computeAiCostUsd(provider, record.model, promptTokens, completionTokens);

  try {
    await rawExecute(
      `INSERT INTO ai_request_logs
         ("companyId", "userId", provider, model, feature,
          "promptTokens", "completionTokens", "totalTokens",
          "costUsd", "durationMs", status, "errorCode")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.companyId ?? null,
        record.userId ?? null,
        provider,
        record.model,
        record.feature,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        record.durationMs,
        status,
        record.errorCode ?? null,
      ],
    );
  } catch (err) {
    // Never throw upward — observability writes are best-effort.
    logger.warn(err, "[aiUsage] failed to insert ai_request_logs row");
  }
}
