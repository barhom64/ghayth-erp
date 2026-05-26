/**
 * Print AI Layer — Phase 11 of the Print Platform.
 *
 * Interfaces for AI-assisted document workflows:
 *   • Suggest a template layout given an entityType + sample data
 *   • Summarise a multi-page report into a one-paragraph executive blurb
 *   • Generate an official-letter draft from a structured request
 *   • Detect layout regressions across template versions
 *   • Detect anomalies in printed audit logs ("user X printed 200 reprints in 1h")
 *
 * This file is the CONTRACT. The concrete implementation needs an LLM
 * provider (Anthropic Claude is the obvious match given the existing
 * AI_INTEGRATIONS_ANTHROPIC_BASE_URL env in lib/config.ts).
 *
 * No-op by default: when no AI client is registered, every helper
 * returns `{ ok: false, error: "AI_NOT_CONFIGURED" }`. Wire in the
 * provider, register it via `setAiClient(...)`, and the helpers light
 * up.
 */

import { logger } from "../logger.js";

export interface TemplateSuggestion {
  entityType: string;
  suggestedSections: string[];
  suggestedTokens: string[];
  rationale: string;
}

export interface ReportSummary {
  title: string;
  oneLine: string;
  paragraphs: string[];
  /** Top 3-5 insights the LLM extracted — used for the cover page. */
  highlights: string[];
}

export interface LetterDraft {
  subject: string;
  body: string;
  tone: "formal" | "warm" | "stern";
  language: "ar" | "en";
}

export interface AiClient {
  /** Implementation name — "anthropic", "noop", etc. */
  name: string;
  /** True when credentials are present and the client is wired. */
  isAvailable(): boolean;
  suggestTemplate(input: {
    entityType: string;
    sampleData: Record<string, unknown>;
    locale: string;
  }): Promise<TemplateSuggestion>;
  summariseReport(input: {
    title: string;
    rows: Record<string, unknown>[];
    locale: string;
  }): Promise<ReportSummary>;
  draftLetter(input: {
    purpose: string;
    addressee: string;
    facts: Record<string, unknown>;
    locale: "ar" | "en";
    tone?: "formal" | "warm" | "stern";
  }): Promise<LetterDraft>;
  detectAuditAnomalies(input: {
    rows: Array<{ userId: number; entityType: string; createdAt: string; isReprint: boolean }>;
  }): Promise<{ anomalies: Array<{ userId: number; reason: string; severity: "info" | "warn" | "alert" }> }>;
}

class NoopAiClient implements AiClient {
  name = "noop";
  isAvailable(): boolean {
    return false;
  }
  async suggestTemplate(): Promise<TemplateSuggestion> {
    throw new Error("AI_NOT_CONFIGURED");
  }
  async summariseReport(): Promise<ReportSummary> {
    throw new Error("AI_NOT_CONFIGURED");
  }
  async draftLetter(): Promise<LetterDraft> {
    throw new Error("AI_NOT_CONFIGURED");
  }
  async detectAuditAnomalies(): Promise<{ anomalies: [] }> {
    return { anomalies: [] };
  }
}

let activeClient: AiClient = new NoopAiClient();

export function setAiClient(client: AiClient): void {
  activeClient = client;
  logger.info(`[print/ai] client set to ${client.name} (available=${client.isAvailable()})`);
}

/**
 * Boot-time registration. Reads the same env vars aiEngine.ts uses so
 * a deployment that has Anthropic configured for OTHER AI features
 * gets the print-AI helpers for free.
 */
export async function registerDefaultAiClient(): Promise<void> {
  const { anthropicClientFromConfig } = await import("./ai/anthropicClient.js");
  setAiClient(await anthropicClientFromConfig());
}

export function getAiClient(): AiClient {
  return activeClient;
}

export function isAiAvailable(): boolean {
  return activeClient.isAvailable();
}

// ─── Safe wrappers ───────────────────────────────────────────────────────
// Public callers go through these — they fall through to NoopAiClient
// gracefully when no provider is configured, so a feature that depends
// on AI can show a "feature disabled" affordance instead of crashing.

export async function trySuggestTemplate(
  input: Parameters<AiClient["suggestTemplate"]>[0],
): Promise<{ ok: true; result: TemplateSuggestion } | { ok: false; error: string }> {
  if (!activeClient.isAvailable()) return { ok: false, error: "AI_NOT_CONFIGURED" };
  try {
    return { ok: true, result: await activeClient.suggestTemplate(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function trySummariseReport(
  input: Parameters<AiClient["summariseReport"]>[0],
): Promise<{ ok: true; result: ReportSummary } | { ok: false; error: string }> {
  if (!activeClient.isAvailable()) return { ok: false, error: "AI_NOT_CONFIGURED" };
  try {
    return { ok: true, result: await activeClient.summariseReport(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function tryDraftLetter(
  input: Parameters<AiClient["draftLetter"]>[0],
): Promise<{ ok: true; result: LetterDraft } | { ok: false; error: string }> {
  if (!activeClient.isAvailable()) return { ok: false, error: "AI_NOT_CONFIGURED" };
  try {
    return { ok: true, result: await activeClient.draftLetter(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
