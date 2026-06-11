import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, MessageSquare, Languages, ScrollText,
  ListChecks, TrendingUp, Loader2, Copy, Brain, Tag,
} from "lucide-react";

/**
 * AI Workbench — single page exposing the 6 /intelligence/ai/* endpoints.
 *
 * Each tab is a focused tool: pure input/output, audit trail in the
 * backend, no DB writes here. Result panel is a pre/json view with a
 * copy button so the operator can paste the result into a ticket / draft
 * email / report.
 */
export default function AiWorkbench() {
  return (
    <PageShell
      title="منصة الذكاء الاصطناعي"
      subtitle="6 أدوات لمعالجة النصوص والبيانات — كل نتيجة مُدوَّنة في سجل تدقيق ai_*"
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "لوحة الذكاء", href: "/intelligence" },
        { label: "منصة AI" },
      ]}
    >
      <Tabs defaultValue="categorize" dir="rtl">
        <TabsList className="grid grid-cols-3 lg:grid-cols-6 gap-1 mb-4">
          <TabsTrigger value="categorize" className="text-xs gap-1">
            <Tag className="h-3 w-3" /> تصنيف
          </TabsTrigger>
          <TabsTrigger value="draft-reply" className="text-xs gap-1">
            <MessageSquare className="h-3 w-3" /> مسودة رد
          </TabsTrigger>
          <TabsTrigger value="translate" className="text-xs gap-1">
            <Languages className="h-3 w-3" /> ترجمة
          </TabsTrigger>
          <TabsTrigger value="summarize" className="text-xs gap-1">
            <ScrollText className="h-3 w-3" /> تلخيص
          </TabsTrigger>
          <TabsTrigger value="evaluate-rules" className="text-xs gap-1">
            <ListChecks className="h-3 w-3" /> تقييم قواعد
          </TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs gap-1">
            <TrendingUp className="h-3 w-3" /> توقّع
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categorize"><CategorizeTool /></TabsContent>
        <TabsContent value="draft-reply"><DraftReplyTool /></TabsContent>
        <TabsContent value="translate"><TranslateTool /></TabsContent>
        <TabsContent value="summarize"><SummarizeTool /></TabsContent>
        <TabsContent value="evaluate-rules"><EvaluateRulesTool /></TabsContent>
        <TabsContent value="forecast"><ForecastTool /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ─── Shared result panel ────────────────────────────────────────────────────

function ResultPanel({ result, loading }: { result: unknown; loading: boolean }) {
  const { toast } = useToast();
  if (loading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline ml-2" />
          جاري المعالجة...
        </CardContent>
      </Card>
    );
  }
  if (!result) return null;
  const text = typeof result === "string"
    ? result
    : JSON.stringify(result, null, 2);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" /> النتيجة
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(text);
            toast({ title: "تم النسخ" });
          }}
        >
          <Copy className="h-3.5 w-3.5 ml-1" /> نسخ
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="text-xs bg-muted/30 p-3 rounded-md whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
          {text}
        </pre>
      </CardContent>
    </Card>
  );
}

// ─── Hook shared by every tab ───────────────────────────────────────────────

function useAiCall<TBody>(path: string) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const { toast } = useToast();
  async function run(body: TBody) {
    setLoading(true);
    setResult(null);
    try {
      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "حدث خطأ غير متوقع";
      toast({ title: "فشلت العملية", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  return { run, loading, result };
}

// ─── 1. Categorize ──────────────────────────────────────────────────────────

function CategorizeTool() {
  const [message, setMessage] = useState("");
  const { run, loading, result } = useAiCall<{ message: string }>("/intelligence/ai/categorize");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" /> تصنيف رسالة واردة</CardTitle>
          <CardDescription>
            صنّف رسالة (واتساب، إيميل، تذكرة دعم) ضمن نوع الاستفسار وأولويته — لتوجيهها للقسم المناسب.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>نص الرسالة</Label>
            <Textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ألصق هنا الرسالة من العميل..."
            />
          </div>
          <Button
            onClick={() => run({ message })}
            disabled={!message.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Brain className="h-4 w-4 ml-1" />}
            صنّف الآن
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}

// ─── 2. Draft Reply ─────────────────────────────────────────────────────────

function DraftReplyTool() {
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const { run, loading, result } = useAiCall<{
    ticketTitle: string;
    ticketDescription: string;
  }>("/intelligence/ai/draft-reply");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> مسودة رد على تذكرة</CardTitle>
          <CardDescription>
            ولّد مسودة رد مهني على تذكرة دعم. الرد يحتاج مراجعة بشرية قبل الإرسال.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>عنوان التذكرة</Label>
            <Input
              value={ticketTitle}
              onChange={(e) => setTicketTitle(e.target.value)}
              placeholder="مثال: مشكلة في فاتورة الإيجار"
            />
          </div>
          <div>
            <Label>تفاصيل التذكرة</Label>
            <Textarea
              rows={4}
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              placeholder="نص التذكرة من العميل..."
            />
          </div>
          <Button
            onClick={() => run({ ticketTitle, ticketDescription })}
            disabled={!ticketTitle.trim() || !ticketDescription.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <MessageSquare className="h-4 w-4 ml-1" />}
            ولّد مسودة
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}

// ─── 3. Translate ───────────────────────────────────────────────────────────

function TranslateTool() {
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState<"ar" | "en">("ar");
  const { run, loading, result } = useAiCall<{ text: string; targetLanguage: "ar" | "en" }>(
    "/intelligence/ai/translate",
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> ترجمة</CardTitle>
          <CardDescription>
            ترجمة نصوص قانونية أو تجارية بين العربية والإنجليزية — مع الحفاظ على المصطلحات الفنية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>النص المُترجَم منه</Label>
              <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div>
              <Label>إلى اللغة</Label>
              <Select value={targetLanguage} onValueChange={(v) => setTargetLanguage(v as "ar" | "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">الإنجليزية</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="mt-2 text-xs">
                مكتشف تلقائي → {targetLanguage === "ar" ? "العربية" : "English"}
              </Badge>
            </div>
          </div>
          <Button
            onClick={() => run({ text, targetLanguage })}
            disabled={!text.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Languages className="h-4 w-4 ml-1" />}
            ترجم
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}

// ─── 4. Summarize ───────────────────────────────────────────────────────────

function SummarizeTool() {
  const [content, setContent] = useState("");
  const [maxLength, setMaxLength] = useState<string>("200");
  const { run, loading, result } = useAiCall<{ content: string; maxLength?: number }>(
    "/intelligence/ai/summarize",
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> تلخيص</CardTitle>
          <CardDescription>
            لخّص مستند طويل (عقد، مذكرة، تقرير) إلى أهم النقاط — مفيد للمراجعة السريعة قبل الاجتماعات.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>النص الكامل</Label>
            <Textarea
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="ألصق محتوى المستند هنا..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الحد الأقصى للكلمات (اختياري)</Label>
              <Input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={() => run({
              content,
              ...(maxLength ? { maxLength: Number(maxLength) } : {}),
            })}
            disabled={!content.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <ScrollText className="h-4 w-4 ml-1" />}
            لخّص
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}

// ─── 5. Evaluate Rules ──────────────────────────────────────────────────────

function EvaluateRulesTool() {
  const [contextJson, setContextJson] = useState('{\n  "tenantStatus": "overdue",\n  "monthsOverdue": 2\n}');
  const [dataJson, setDataJson] = useState('{\n  "rentAmount": 5000\n}');
  const [rulesJson, setRulesJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { run, loading, result } = useAiCall<{
    context: unknown;
    data: unknown;
    rules?: unknown;
  }>("/intelligence/ai/evaluate-rules");

  const submit = () => {
    setError(null);
    try {
      const body: { context: unknown; data: unknown; rules?: unknown } = {
        context: JSON.parse(contextJson),
        data: JSON.parse(dataJson),
      };
      if (rulesJson.trim()) body.rules = JSON.parse(rulesJson);
      run(body);
    } catch (e) {
      setError("JSON غير صالح — تأكد من أن البنية صحيحة");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> تقييم قواعد</CardTitle>
          <CardDescription>
            قيّم سياق + بيانات مقابل قواعد عمل. كل الحقول JSON. للمستخدمين المتقدمين فقط.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>السياق (context) JSON</Label>
              <Textarea rows={6} value={contextJson} onChange={(e) => setContextJson(e.target.value)} className="font-mono text-xs" />
            </div>
            <div>
              <Label>البيانات (data) JSON</Label>
              <Textarea rows={6} value={dataJson} onChange={(e) => setDataJson(e.target.value)} className="font-mono text-xs" />
            </div>
          </div>
          <div>
            <Label>القواعد (rules) JSON — اختياري</Label>
            <Textarea
              rows={4}
              value={rulesJson}
              onChange={(e) => setRulesJson(e.target.value)}
              className="font-mono text-xs"
              placeholder="اتركه فارغاً لاستخدام القواعد الافتراضية"
            />
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <ListChecks className="h-4 w-4 ml-1" />}
            قيّم
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}

// ─── 6. Forecast ────────────────────────────────────────────────────────────

function ForecastTool() {
  const [metricName, setMetricName] = useState("monthly_revenue");
  const [historicalJson, setHistoricalJson] = useState(
    '[\n  { "month": "2026-01", "value": 100000 },\n  { "month": "2026-02", "value": 110000 },\n  { "month": "2026-03", "value": 105000 }\n]',
  );
  const [error, setError] = useState<string | null>(null);
  const { run, loading, result } = useAiCall<{
    metricName: string;
    historicalData: unknown;
  }>("/intelligence/ai/forecast");

  const submit = () => {
    setError(null);
    try {
      run({ metricName, historicalData: JSON.parse(historicalJson) });
    } catch (e) {
      setError("JSON للبيانات التاريخية غير صالح");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> توقّع مؤشر</CardTitle>
          <CardDescription>
            توقّع قيمة مؤشر (إيرادات، مصاريف، إشغال، …) بناءً على بياناته التاريخية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>اسم المؤشر</Label>
            <Input
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
              placeholder="مثال: monthly_revenue"
            />
          </div>
          <div>
            <Label>البيانات التاريخية (JSON Array)</Label>
            <Textarea
              rows={8}
              value={historicalJson}
              onChange={(e) => setHistoricalJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <Button onClick={submit} disabled={!metricName.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <TrendingUp className="h-4 w-4 ml-1" />}
            توقّع
          </Button>
        </CardContent>
      </Card>
      <ResultPanel result={result} loading={loading} />
    </div>
  );
}
