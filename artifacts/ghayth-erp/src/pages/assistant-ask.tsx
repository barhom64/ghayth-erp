import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { apiFetch, useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// اسأل غيث — واجهة المساعد الذكي. تستهلك:
//   GET  /assistant/suggestions  (الأسئلة المتاحة)
//   POST /assistant/ask { q }    (نية مُدقَّقة → بيانات)
// آمن: الخادم لا يولّد SQL — يطابق نية معروفة فقط.
// ─────────────────────────────────────────────────────────────────────────────

interface AskResult {
  matched: boolean;
  answerAr: string;
  rows?: Record<string, unknown>[];
  suggestions?: string[];
}

export default function AssistantAsk() {
  const { data: sugg } = useApiQuery<{ suggestions: string[] }>(["assistant-suggestions"], "/assistant/suggestions");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);

  const suggestions = sugg?.suggestions ?? [];

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text) return;
    setQ(text);
    setLoading(true);
    setResult(null);
    try {
      const r = await apiFetch<AskResult>("/assistant/ask", { method: "POST", body: JSON.stringify({ q: text }) });
      setResult(r);
    } catch {
      setResult({ matched: false, answerAr: "تعذّر تنفيذ السؤال، حاول مرة أخرى." });
    } finally {
      setLoading(false);
    }
  };

  const columns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

  return (
    <PageShell
      title="اسأل غيث"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { label: "اسأل غيث" }]}
      subtitle="اسأل عن موظفيك ومالك وعملياتك بالعربية"
    >
      <div className="space-y-4 max-w-3xl">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(q); }}
                placeholder="مثال: من تأخر أكثر هذا الشهر؟"
                className="flex-1"
              />
              <Button onClick={() => ask(q)} disabled={loading || !q.trim()}>
                <Send className="h-4 w-4 me-1" /> اسأل
              </Button>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="text-xs border rounded-full px-3 py-1 hover:bg-surface-subtle text-muted-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {loading && (
          <div className="text-center text-muted-foreground py-8">
            <Sparkles className="w-8 h-8 mx-auto mb-2 animate-pulse" /> جاري البحث…
          </div>
        )}

        {result && !loading && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> {result.answerAr}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.matched && result.rows && result.rows.length > 0 ? (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        {columns.map((c) => (
                          <th key={c} className="text-start py-2 px-2 font-medium">{c.replace(/_/g, " ")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b">
                          {columns.map((c) => (
                            <td key={c} className="py-2 px-2">{String(row[c] ?? "—")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !result.matched && result.suggestions ? (
                <div className="flex flex-wrap gap-2">
                  {result.suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="text-xs border rounded-full px-3 py-1 hover:bg-surface-subtle">{s}</button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد نتائج.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
