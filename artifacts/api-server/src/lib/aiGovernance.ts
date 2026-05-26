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
import { decryptSecret, isEncrypted } from "./secrets.js";

/** Capability slugs an AI provider can advertise. New capabilities go here. */
export type AiCapability = "generation" | "stt" | "embedding" | "image";

export interface AiProviderRow {
  id: number;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  defaultModel: string | null;
  /** Capabilities the provider exposes — used by callers to find the right registry slot. */
  capabilities: AiCapability[];
  /** Optional custom endpoint (overrides the provider's default). */
  endpoint: string | null;
  /** Free-form config. Secret keys (apiKey, accessToken, …) are encrypted at rest. */
  config: Record<string, unknown>;
  notes: string | null;
}

/** Keys inside `config` that hold a credential — encrypted via secrets.ts. */
export const PROVIDER_SECRET_KEYS = new Set([
  "apiKey", "accessToken", "secret", "authToken", "token",
  "appSecret", "clientSecret", "privateKey",
]);

/**
 * Replace every secret key inside `config` with its decrypted value
 * if it looks encrypted. Mutates a copy — never the input. Returns
 * empty config if the input is malformed (never throws).
 */
export function decryptProviderConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (PROVIDER_SECRET_KEYS.has(k) && typeof v === "string" && isEncrypted(v)) {
      out[k] = decryptSecret(v) ?? "";
    } else {
      out[k] = v;
    }
  }
  return out;
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
 * hammer the table. `config` comes back DECRYPTED — callers can read
 * apiKey / token fields directly.
 */
export async function getActiveProvider(slug: string): Promise<AiProviderRow | null> {
  const cached = providerCache.get(slug);
  if (fresh(cached)) return cached.value;
  try {
    const [row] = await rawQuery<AiProviderRow>(
      `SELECT id, slug, name, status, priority, "defaultModel",
              capabilities, endpoint, config, notes
         FROM ai_providers
        WHERE slug = $1 AND status = 'active'
        LIMIT 1`,
      [slug],
    );
    const decrypted = row ? { ...row, config: decryptProviderConfig(row.config) } : null;
    providerCache.set(slug, { value: decrypted, expiresAt: Date.now() + TTL_MS });
    return decrypted;
  } catch (err) {
    logger.warn(err, `[aiGovernance] getActiveProvider(${slug}) failed`);
    return null;
  }
}

/**
 * Active providers that advertise `capability`, ordered by priority
 * (lowest first). Used by callers like pbxControl to find the live
 * STT provider without hard-coding a slug. `config` comes back
 * DECRYPTED for each row. Never throws — returns [] on DB error so
 * the caller falls back to its "vendor not configured" branch.
 */
export async function getActiveProvidersByCapability(capability: AiCapability): Promise<AiProviderRow[]> {
  try {
    const rows = await rawQuery<AiProviderRow>(
      `SELECT id, slug, name, status, priority, "defaultModel",
              capabilities, endpoint, config, notes
         FROM ai_providers
        WHERE status = 'active' AND capabilities ? $1
        ORDER BY priority ASC, id ASC`,
      [capability],
    );
    return rows.map((r) => ({ ...r, config: decryptProviderConfig(r.config) }));
  } catch (err) {
    logger.warn(err, `[aiGovernance] getActiveProvidersByCapability(${capability}) failed`);
    return [];
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
