/**
 * AI / algorithms playground for the platform's `/intelligence/*`
 * endpoints. Exists so operators (and the AI ops team) can probe each
 * primitive in isolation — verify it's wired, see what shape it
 * returns, debug bad prompts without going through a real feature.
 *
 * Wires 10 endpoints:
 *   POST /intelligence/ai/categorize        — classify free-text into a known set
 *   POST /intelligence/ai/draft-reply       — draft a customer-support reply
 *   POST /intelligence/ai/translate         — Arabic ↔ English translation
 *   POST /intelligence/ai/summarize         — TL;DR for a long body
 *   POST /intelligence/ai/evaluate-rules    — run a context through the rules engine
 *   POST /intelligence/ai/forecast          — time-series forecast for a named metric
 *   POST /intelligence/algorithms/haversine — great-circle distance between two points
 *   POST /intelligence/algorithms/moving-average — N-period moving average
 *   POST /intelligence/algorithms/load-balance   — round-robin / weighted load distribution
 *   POST /intelligence/smart-assign         — auto-assign work to the best available agent
 *
 * The probes use explicit static URL strings so the wiring audit can
 * credit each endpoint (a generic component that takes the URL as a
 * prop would hide the calls from the scanner).
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Calculator, MapPin } from "lucide-react";

function ProbePanel({
  title,
  defaultBody,
  onRun,
}: {
  title: string;
  defaultBody: string;
  onRun: (body: any) => Promise<any>;
}) {
  const { toast } = useToast();
  const [bodyJson, setBodyJson] = useState(defaultBody);
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const body = JSON.parse(bodyJson || "{}");
      const res = await onRun(body);
      setResult(res);
      toast({ title: `${title} — نجح` });
    } catch (err: any) {
      toast({ variant: "destructive", title: `${title} — فشل`, description: err?.message || "" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <textarea
          value={bodyJson}
          onChange={(e) => setBodyJson(e.target.value)}
          dir="ltr"
          className="w-full h-24 px-2 py-1 border rounded font-mono"
        />
        <Button size="sm" rateLimitAware onClick={run} disabled={running}>
          {running ? "جاري التشغيل..." : "تشغيل"}
        </Button>
        {result && (
          <pre className="bg-surface-subtle p-2 rounded max-h-32 overflow-y-auto text-[10px]">
            {JSON.stringify(result, null, 2).slice(0, 1500)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminIntelligencePlayground() {
  return (
    <PageShell
      title="ملعب الذكاء الاصطناعي والخوارزميات"
      subtitle="فحص مباشر لكل نقطة من نقاط /intelligence/* — مفيد للمطورين والـ AI ops"
      breadcrumbs={[{ label: "الإدارة" }, { label: "ملعب الذكاء الاصطناعي" }]}
    >
      <div className="space-y-4">
        <p className="text-sm flex items-center gap-2 text-status-info-foreground">
          <Sparkles className="h-4 w-4" /> طرق الذكاء الاصطناعي
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ProbePanel
            title="تصنيف /intelligence/ai/categorize"
            defaultBody='{"message":"المكيف لا يعمل في الغرفة","context":{"module":"maintenance"}}'
            onRun={(body) => apiFetch("/intelligence/ai/categorize", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="مسودة ردّ /intelligence/ai/draft-reply"
            defaultBody='{"ticketTitle":"تأخير الفاتورة","ticketDescription":"لم أستلم الفاتورة الشهرية"}'
            onRun={(body) => apiFetch("/intelligence/ai/draft-reply", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="ترجمة /intelligence/ai/translate"
            defaultBody='{"text":"مرحباً، كيف حالك؟","targetLanguage":"en"}'
            onRun={(body) => apiFetch("/intelligence/ai/translate", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="تلخيص /intelligence/ai/summarize"
            defaultBody='{"content":"يحتوي هذا التقرير على...","maxLength":50}'
            onRun={(body) => apiFetch("/intelligence/ai/summarize", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="تقييم قواعد /intelligence/ai/evaluate-rules"
            defaultBody='{"context":{"module":"finance"},"data":{"amount":1000,"currency":"SAR"}}'
            onRun={(body) => apiFetch("/intelligence/ai/evaluate-rules", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="توقع زمني /intelligence/ai/forecast"
            defaultBody='{"metricName":"monthly_revenue","forecastPeriods":3,"historicalData":[100,120,135,150]}'
            onRun={(body) => apiFetch("/intelligence/ai/forecast", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="إسناد ذكي /intelligence/smart-assign"
            defaultBody='{"taskType":"maintenance","requiredSpecialty":"plumbing","taskTitle":"إصلاح تسرب"}'
            onRun={(body) => apiFetch("/intelligence/smart-assign", { method: "POST", body: JSON.stringify(body) })}
          />
        </div>

        <p className="text-sm flex items-center gap-2 text-status-info-foreground pt-2">
          <Calculator className="h-4 w-4" /> خوارزميات عددية
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ProbePanel
            title="مسافة كروية /intelligence/algorithms/haversine"
            defaultBody='{"lat1":24.7136,"lon1":46.6753,"lat2":21.5433,"lon2":39.1728}'
            onRun={(body) => apiFetch("/intelligence/algorithms/haversine", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="متوسط متحرك /intelligence/algorithms/moving-average"
            defaultBody='{"values":[10,12,15,14,18,20],"periods":3}'
            onRun={(body) => apiFetch("/intelligence/algorithms/moving-average", { method: "POST", body: JSON.stringify(body) })}
          />
          <ProbePanel
            title="موازنة الحمل /intelligence/algorithms/load-balance"
            defaultBody='{"resources":[{"id":1,"lat":24.71,"lon":46.67,"workload":2}],"targetLat":24.7,"targetLon":46.7}'
            onRun={(body) => apiFetch("/intelligence/algorithms/load-balance", { method: "POST", body: JSON.stringify(body) })}
          />
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1 pt-2">
          <MapPin className="h-3 w-3" />
          النتائج تظهر مختصرة لأول 1500 حرف لتجنّب إغراق الواجهة.
        </p>
      </div>
    </PageShell>
  );
}
