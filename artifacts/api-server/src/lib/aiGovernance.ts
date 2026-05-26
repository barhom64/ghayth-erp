/**
 * AI Governance helpers — read-side facade over ai_providers + ai_prompts.
 *
 * The runtime never reads the raw tables; it goes through these helpers
 * so the lookup contract is uniform (slug-first, cache the hot path).
 * Writes are owned by routes/admin-ai-governance.ts and the review
 * lifecycle there.
 *
 * Caching: provider + prompt rows change rarely (a few times a quarter)
 * but get read on every AI call. A 60-second TTL is more than enough
 * to stay fresh for ops without burning a DB round-trip per call.
 */
import { rawQuery } from "./rawdb.js";
import { logger } from "./logger.js";

export interface AiProviderRow {
  id: number;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  defaultModel: string | null;
  config: Record<string, unknown>;
  notes: string | null;
}

export interface AiPromptRow {
  id: number;
  slug: string;
  version: number;
  title: string;
  description: string | null;
  systemPrompt: string;
  userTemplate: string | null;
  status: "draft" | "in_review" | "approved" | "deprecated" | "rejected";
  ownerUserId: number | null;
  approvedUserId: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T | null;
  expiresAt: number;
}

const providerCache = new Map<string, CacheEntry<AiProviderRow>>();
const promptCache   = new Map<string, CacheEntry<AiPromptRow>>();

function fresh<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

/**
 * Active provider for `slug`. Returns null if the slug isn't registered
 * or has been disabled. Cached for TTL_MS so the AI hot path doesn't
 * hammer the table.
 */
export async function getActiveProvider(slug: string): Promise<AiProviderRow | null> {
  const cached = providerCache.get(slug);
  if (fresh(cached)) return cached.value;
  try {
    const [row] = await rawQuery<AiProviderRow>(
      `SELECT id, slug, name, status, priority, "defaultModel", config, notes
         FROM ai_providers
        WHERE slug = $1 AND status = 'active'
        LIMIT 1`,
      [slug],
    );
    providerCache.set(slug, { value: row ?? null, expiresAt: Date.now() + TTL_MS });
    return row ?? null;
  } catch (err) {
    logger.warn(err, `[aiGovernance] getActiveProvider(${slug}) failed`);
    return null;
  }
}

/**
 * Latest approved prompt for `slug`. Returns null if no approved version
 * exists — caller decides whether to fall back to a hardcoded prompt or
 * surface an error. Cached for TTL_MS.
 */
export async function getApprovedPrompt(slug: string): Promise<AiPromptRow | null> {
  const cached = promptCache.get(slug);
  if (fresh(cached)) return cached.value;
  try {
    const [row] = await rawQuery<AiPromptRow>(
      `SELECT id, slug, version, title, description,
              "systemPrompt", "userTemplate", status,
              "ownerUserId", "approvedUserId", "approvedAt",
              "createdAt", "updatedAt"
         FROM ai_prompts
        WHERE slug = $1 AND status = 'approved'
        ORDER BY version DESC
        LIMIT 1`,
      [slug],
    );
    promptCache.set(slug, { value: row ?? null, expiresAt: Date.now() + TTL_MS });
    return row ?? null;
  } catch (err) {
    logger.warn(err, `[aiGovernance] getApprovedPrompt(${slug}) failed`);
    return null;
  }
}

/**
 * Drop the in-memory caches. Called after a write in the governance
 * route so a freshly-approved prompt becomes visible immediately
 * without waiting for the TTL.
 */
export function invalidateAiGovernanceCache(): void {
  providerCache.clear();
  promptCache.clear();
}
