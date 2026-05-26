/**
 * Anthropic AI client — concrete implementation of the AiClient
 * contract from `../ai.ts`. Uses the @anthropic-ai/sdk already
 * installed for aiEngine.ts.
 *
 * Activation: when AI_INTEGRATIONS_ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL
 * are configured in lib/config.ts (the existing env vars used by
 * aiEngine.ts), index.ts at boot calls setAiClient(new AnthropicAiClient(...)).
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AiClient,
  TemplateSuggestion,
  ReportSummary,
  LetterDraft,
} from "../ai.js";
import { logger } from "../../logger.js";
import { recordAiUsage } from "../../aiUsage.js";

// Default model — Claude Haiku 4.5 matches aiEngine.ts and is the
// cost/latency sweet spot for the doc-platform workloads (template
// suggestions, summaries, drafts). Bump to Sonnet for higher quality
// when budget allows.
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 8192;

export class AnthropicAiClient implements AiClient {
  name = "anthropic";
  private client: Anthropic | null = null;

  constructor(private opts: { apiKey?: string; baseURL?: string; model?: string }) {
    if (opts.apiKey) {
      this.client = new Anthropic({
        apiKey: opts.apiKey,
        baseURL: opts.baseURL,
      });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  private async call(systemPrompt: string, userPrompt: string, feature: string): Promise<string> {
    if (!this.client) throw new Error("AI_NOT_CONFIGURED");
    const model = this.opts.model ?? MODEL;
    const startedAt = Date.now();
    try {
      const msg = await this.client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      void recordAiUsage({
        provider: "anthropic",
        model,
        feature,
        promptTokens: msg.usage?.input_tokens ?? 0,
        completionTokens: msg.usage?.output_tokens ?? 0,
        durationMs: Date.now() - startedAt,
        status: "success",
      });
      const block = msg.content[0];
      return block?.type === "text" ? block.text : "";
    } catch (err) {
      void recordAiUsage({
        provider: "anthropic",
        model,
        feature,
        promptTokens: 0,
        completionTokens: 0,
        durationMs: Date.now() - startedAt,
        status: "error",
        errorCode: (err as Error)?.name ?? "AI_ERROR",
      });
      throw err;
    }
  }

  private parseJsonStrict<T>(raw: string, fallback: T): T {
    // The model occasionally wraps JSON in ```json fences. Strip them.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch (err) {
      logger.warn(`[print/ai] failed to parse LLM JSON output: ${(err as Error).message}`);
      return fallback;
    }
  }

  async suggestTemplate(input: {
    entityType: string;
    sampleData: Record<string, unknown>;
    locale: string;
  }): Promise<TemplateSuggestion> {
    const system =
      "You are a print-template designer for an Arabic-first ERP (Ghaith). " +
      "Given an entity type and a sample data payload, suggest the best document layout. " +
      'Return ONLY JSON with shape: {"suggestedSections":[string],"suggestedTokens":[string],"rationale":string}. ' +
      "Tokens follow the {{entity.X}}, {{branch.letterhead}}, {{client.name}}, {{system.verifyBlock}} convention. " +
      "Sections are top-to-bottom blocks (e.g. 'letterhead', 'buyer-block', 'items-table', 'totals', 'verify-block', 'footer').";
    const user = `Entity type: ${input.entityType}\nLocale: ${input.locale}\nSample data (truncated):\n\`\`\`json\n${JSON.stringify(input.sampleData, null, 2).slice(0, 3000)}\n\`\`\`\nSuggest the layout.`;
    const raw = await this.call(system, user, "print.suggest_template");
    const parsed = this.parseJsonStrict<{
      suggestedSections?: string[];
      suggestedTokens?: string[];
      rationale?: string;
    }>(raw, { suggestedSections: [], suggestedTokens: [], rationale: "" });
    return {
      entityType: input.entityType,
      suggestedSections: parsed.suggestedSections ?? [],
      suggestedTokens: parsed.suggestedTokens ?? [],
      rationale: parsed.rationale ?? "",
    };
  }

  async summariseReport(input: {
    title: string;
    rows: Record<string, unknown>[];
    locale: string;
  }): Promise<ReportSummary> {
    const system =
      "You summarise tabular Arabic business reports for an ERP cover page. " +
      'Return ONLY JSON with shape: {"oneLine":string,"paragraphs":[string],"highlights":[string]}. ' +
      "oneLine is at most 120 chars. paragraphs has 2-3 entries. highlights has 3-5 entries. " +
      `Reply in ${input.locale === "ar" ? "Arabic" : "English"}.`;
    // Truncate the rows payload — large reports overflow context. The
    // first 100 rows + total count are enough for a summary.
    const sample = input.rows.slice(0, 100);
    const user = `Title: ${input.title}\nTotal rows: ${input.rows.length}\nFirst ${sample.length} rows:\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\``;
    const raw = await this.call(system, user, "print.summarise_report");
    const parsed = this.parseJsonStrict<{
      oneLine?: string;
      paragraphs?: string[];
      highlights?: string[];
    }>(raw, { oneLine: "", paragraphs: [], highlights: [] });
    return {
      title: input.title,
      oneLine: parsed.oneLine ?? "",
      paragraphs: parsed.paragraphs ?? [],
      highlights: parsed.highlights ?? [],
    };
  }

  async draftLetter(input: {
    purpose: string;
    addressee: string;
    facts: Record<string, unknown>;
    locale: "ar" | "en";
    tone?: "formal" | "warm" | "stern";
  }): Promise<LetterDraft> {
    const tone = input.tone ?? "formal";
    const system =
      `You draft Arabic-first official letters for an ERP. ` +
      `Tone: ${tone}. Locale: ${input.locale}. ` +
      'Return ONLY JSON: {"subject":string,"body":string}. ' +
      "The body is plain text with paragraph breaks; no HTML tags. " +
      "Keep the body under 400 words.";
    const user = `Purpose: ${input.purpose}\nAddressee: ${input.addressee}\nFacts:\n\`\`\`json\n${JSON.stringify(input.facts, null, 2)}\n\`\`\`\nDraft the letter.`;
    const raw = await this.call(system, user, "print.draft_letter");
    const parsed = this.parseJsonStrict<{ subject?: string; body?: string }>(raw, {
      subject: "",
      body: "",
    });
    return {
      subject: parsed.subject ?? input.purpose,
      body: parsed.body ?? "",
      tone,
      language: input.locale,
    };
  }

  async detectAuditAnomalies(input: {
    rows: Array<{ userId: number; entityType: string; createdAt: string; isReprint: boolean }>;
  }): Promise<{ anomalies: Array<{ userId: number; reason: string; severity: "info" | "warn" | "alert" }> }> {
    // Rule-based pre-filter so we don't burn a model call on the obvious
    // patterns. Only escalate to the LLM when the rules say "weird shape".
    const byUser = new Map<number, { reprints: number; total: number; last: string }>();
    for (const r of input.rows) {
      const u = byUser.get(r.userId) ?? { reprints: 0, total: 0, last: "" };
      u.total++;
      if (r.isReprint) u.reprints++;
      if (r.createdAt > u.last) u.last = r.createdAt;
      byUser.set(r.userId, u);
    }
    const ruleHits: Array<{ userId: number; reason: string; severity: "info" | "warn" | "alert" }> = [];
    for (const [userId, stats] of byUser) {
      if (stats.reprints > 50) {
        ruleHits.push({ userId, reason: `${stats.reprints} reprints in window`, severity: "alert" });
      } else if (stats.reprints > 10 && stats.reprints / Math.max(1, stats.total) > 0.5) {
        ruleHits.push({
          userId,
          reason: `>50% of prints are reprints (${stats.reprints}/${stats.total})`,
          severity: "warn",
        });
      }
    }
    return { anomalies: ruleHits };
  }
}

/**
 * Build the Anthropic client from the typed config (FND-003 — env vars
 * are validated in lib/config.ts). Returns a client that's
 * isAvailable=false when no API key is set; caller registers it anyway
 * so the registry slot is filled.
 */
export async function anthropicClientFromConfig(): Promise<AnthropicAiClient> {
  const { config } = await import("../../config.js");
  return new AnthropicAiClient({
    apiKey: config.ai.anthropicApiKey,
    baseURL: config.ai.anthropicBaseUrl,
  });
}
