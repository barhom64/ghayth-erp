import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { recordAiUsage } from "./aiUsage.js";

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;
  const baseURL = config.ai.anthropicBaseUrl;
  const apiKey = config.ai.anthropicApiKey;
  if (!baseURL || !apiKey) return null;
  client = new Anthropic({ apiKey, baseURL });
  return client;
}

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 8192;

export interface AiCallContext {
  companyId?: number | null;
  userId?: number | null;
}

/**
 * Single seam every aiEngine helper goes through. Always records a row
 * in ai_request_logs (success or failure) so the observability pane
 * (#1139 §5) can show cost-per-feature. Token counts come from the
 * Anthropic response; for failures we record zero tokens but still
 * stamp the duration so a feature with a 100% error rate is visible
 * even when no tokens are actually billed.
 */
async function callAI(
  systemPrompt: string,
  userPrompt: string,
  feature: string,
  ctx?: AiCallContext,
): Promise<string> {
  const c = getClient();
  if (!c) {
    return "[AI غير مفعل: يرجى تكوين AI_INTEGRATIONS_ANTHROPIC_BASE_URL و AI_INTEGRATIONS_ANTHROPIC_API_KEY]";
  }
  const startedAt = Date.now();
  try {
    const msg = await c.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const durationMs = Date.now() - startedAt;
    void recordAiUsage({
      companyId: ctx?.companyId ?? null,
      userId: ctx?.userId ?? null,
      provider: "anthropic",
      model: MODEL,
      feature,
      promptTokens: msg.usage?.input_tokens ?? 0,
      completionTokens: msg.usage?.output_tokens ?? 0,
      durationMs,
      status: "success",
    });
    const block = msg.content[0];
    return block?.type === "text" ? block.text : "";
  } catch (err) {
    void recordAiUsage({
      companyId: ctx?.companyId ?? null,
      userId: ctx?.userId ?? null,
      provider: "anthropic",
      model: MODEL,
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

export interface CategorizeResult {
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  suggestedDepartment: string;
  summary: string;
}

export async function receptionCategorize(message: string, context?: string, ctx?: AiCallContext): Promise<CategorizeResult> {
  const system = `أنت موظف استقبال ذكي في نظام ERP. مهمتك تصنيف الرسائل الواردة.
أجب بـ JSON فقط بالشكل: {"category":"string","priority":"low|normal|high|urgent","suggestedDepartment":"string","summary":"string"}
الفئات المتاحة: support, crm, hr, finance, maintenance, general`;

  const prompt = `${context ? `السياق: ${context}\n` : ""}الرسالة: ${message}`;
  try {
    const raw = await callAI(system, prompt, "reception.categorize", ctx);
    const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    const parsed = JSON.parse(json);
    return {
      category: parsed.category ?? "general",
      priority: parsed.priority ?? "normal",
      suggestedDepartment: parsed.suggestedDepartment ?? "general",
      summary: parsed.summary ?? message.substring(0, 100),
    };
  } catch {
    return { category: "general", priority: "normal", suggestedDepartment: "general", summary: message.substring(0, 100) };
  }
}

export async function responderDraft(ticketTitle: string, ticketDescription: string, history?: string, ctx?: AiCallContext): Promise<string> {
  const system = `أنت موظف دعم عملاء محترف في شركة خدمات. مهمتك صياغة ردود احترافية ومفيدة على تذاكر الدعم.
اكتب ردًا واضحًا ومهذبًا ومفيدًا باللغة العربية.`;

  const prompt = `العنوان: ${ticketTitle}
الوصف: ${ticketDescription}
${history ? `تاريخ المحادثة:\n${history}` : ""}
اكتب ردًا احترافيًا:`;
  return callAI(system, prompt, "responder.draft", ctx);
}

export async function translatorTranslate(text: string, targetLanguage: "ar" | "en", ctx?: AiCallContext): Promise<string> {
  const system = `أنت مترجم محترف متخصص في الترجمة بين العربية والإنجليزية.
ترجم النص المعطى إلى اللغة ${targetLanguage === "ar" ? "العربية" : "الإنجليزية"} بدقة عالية.
أعطِ الترجمة فقط بدون أي شرح إضافي.`;

  return callAI(system, `ترجم هذا النص:\n${text}`, "translator.translate", ctx);
}

export async function summarizerSummarize(content: string, maxLength?: number, ctx?: AiCallContext): Promise<string> {
  const system = `أنت مختص في تلخيص النصوص والمحادثات الطويلة.
لخص المحتوى المعطى بشكل موجز وواضح باللغة العربية${maxLength ? ` في أقل من ${maxLength} كلمة` : ""}.`;

  return callAI(system, `لخص هذا المحتوى:\n${content}`, "summarizer.summarize", ctx);
}

export interface RulesEngineInput {
  context: string;
  data: Record<string, unknown>;
  rules?: string[];
}

export interface RulesEngineResult {
  assessment: string;
  suggestedActions: string[];
  riskLevel: "low" | "medium" | "high";
  reasoning: string;
}

export async function rulesEngineEvaluate(input: RulesEngineInput, ctx?: AiCallContext): Promise<RulesEngineResult> {
  const system = `أنت محرك قواعد أعمال ذكي. تقيّم البيانات وفق قواعد العمل وتقترح إجراءات.
أجب بـ JSON فقط: {"assessment":"string","suggestedActions":["string"],"riskLevel":"low|medium|high","reasoning":"string"}`;

  const prompt = `السياق: ${input.context}
البيانات: ${JSON.stringify(input.data)}
${input.rules ? `القواعد:\n${input.rules.join("\n")}` : ""}`;

  try {
    const raw = await callAI(system, prompt, "rules_engine.evaluate", ctx);
    const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    const parsed = JSON.parse(json);
    return {
      assessment: parsed.assessment ?? "تقييم غير متاح",
      suggestedActions: parsed.suggestedActions ?? [],
      riskLevel: parsed.riskLevel ?? "medium",
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return { assessment: "خطأ في التقييم", suggestedActions: [], riskLevel: "medium", reasoning: "" };
  }
}

export interface PredictorInput {
  metricName: string;
  historicalData: { date: string; value: number }[];
  forecastPeriods?: number;
}

export interface PredictorResult {
  forecast: { period: string; predictedValue: number }[];
  trend: "increasing" | "decreasing" | "stable";
  confidence: number;
  insights: string;
}

export async function predictorForecast(input: PredictorInput, ctx?: AiCallContext): Promise<PredictorResult> {
  const system = `أنت نظام تنبؤ ذكي يحلل البيانات التاريخية ويتوقع الاتجاهات المستقبلية.
أجب بـ JSON فقط: {"forecast":[{"period":"string","predictedValue":number}],"trend":"increasing|decreasing|stable","confidence":number,"insights":"string"}
الثقة بين 0 و 1.`;

  const prompt = `المقياس: ${input.metricName}
البيانات التاريخية: ${JSON.stringify(input.historicalData)}
عدد الفترات المطلوبة: ${input.forecastPeriods ?? 3}`;

  try {
    const raw = await callAI(system, prompt, "predictor.forecast", ctx);
    const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
    const parsed = JSON.parse(json);
    return {
      forecast: parsed.forecast ?? [],
      trend: parsed.trend ?? "stable",
      confidence: parsed.confidence ?? 0.5,
      insights: parsed.insights ?? "",
    };
  } catch {
    return { forecast: [], trend: "stable", confidence: 0.5, insights: "خطأ في التنبؤ" };
  }
}

export const aiEngine = {
  receptionCategorize,
  responderDraft,
  translatorTranslate,
  summarizerSummarize,
  rulesEngineEvaluate,
  predictorForecast,
};
