// Thin wrapper around the Replit AI Integrations Anthropic proxy.
// Reads AI_INTEGRATIONS_ANTHROPIC_API_KEY + AI_INTEGRATIONS_ANTHROPIC_BASE_URL.

const KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const BASE = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!KEY || !BASE) {
  throw new Error(
    "self-heal: missing AI_INTEGRATIONS_ANTHROPIC_API_KEY / AI_INTEGRATIONS_ANTHROPIC_BASE_URL env vars",
  );
}

export async function ask({ model, system, user, maxTokens = 4096 }) {
  const url = `${BASE.replace(/\/$/, "")}/v1/messages`;
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${text.slice(0, 500)}`);
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`anthropic non-JSON: ${text.slice(0, 200)}`); }
  const content = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return { text: content, raw: json, usage: json.usage };
}

// Extract first JSON object from a model response (handles ```json fences too).
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) throw new Error("no JSON object found in model response");
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error("unterminated JSON object in model response");
  return JSON.parse(candidate.slice(start, end));
}
