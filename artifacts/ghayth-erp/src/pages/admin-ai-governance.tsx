/**
 * Admin → AI Governance (#1139 §4).
 *
 * Three tabs:
 *   1. Overview      — provider/prompt counts + the in-review queue
 *   2. Providers     — registry list + add/edit/disable
 *   3. Prompts       — versioned catalog + drafting + status transitions
 *   4. Review Center — pending prompts awaiting reviewer decisions
 *
 * The page is intentionally a single file (under ~500 lines) — the
 * tabs share state (the lists are small) and a single PageShell keeps
 * the navigation flat. Forms use the existing apiFetch + tanstack
 * mutation pattern from finance pages.
 */
import { useState, useEffect } from "react";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Server, Sparkles, ClipboardCheck, BookOpen, Plus, Send, CheckCircle2,
  XCircle, AlertOctagon, MessageSquare, Eye, FlaskConical, PlayCircle, TestTube, ExternalLink,
} from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

type AiCapability = "generation" | "stt" | "embedding" | "image";

interface ProviderRow {
  id: number;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  defaultModel: string | null;
  capabilities: AiCapability[];
  endpoint: string | null;
  config: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PromptRow {
  id: number;
  slug: string;
  version: number;
  title: string;
  description: string | null;
  status: "draft" | "in_review" | "approved" | "deprecated" | "rejected";
  ownerUserId: number | null;
  approvedUserId: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ReviewRow {
  id: number;
  promptId: number;
  reviewerId: number;
  decision: "approved" | "changes_requested" | "rejected";
  comments: string | null;
  createdAt: string;
}

interface PromptDetail extends PromptRow {
  systemPrompt: string;
  userTemplate: string | null;
}

interface TestCaseRow {
  id: number;
  promptSlug: string;
  name: string;
  description: string | null;
  input: Record<string, unknown>;
  expectedContains: string | null;
  ownerUserId: number | null;
  enabled: boolean;
  createdAt: string;
}

interface EvaluationRow {
  id: number;
  promptId: number;
  promptSlug: string;
  promptVersion: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  totalCostUsd: number;
  totalTokens: number;
  durationMs: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
}

interface EvaluationResultRow {
  id: number;
  caseName: string | null;
  status: string;
  passed: boolean | null;
  expectedContains: string | null;
  actualOutput: string | null;
  tokens: number;
  costUsd: number;
  durationMs: number;
  errorMessage: string | null;
}

interface SimulateResult {
  promptSlug: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  costUsdRounded: number;
  durationMs: number;
  error?: string;
}

interface Overview {
  providers: Array<{ status: string; count: number }>;
  prompts: Array<{ status: string; count: number }>;
  reviewQueue: PromptRow[];
  collectedAt: string;
}

function statusLabel(s: string): string {
  return ({
    draft: "مسودّة",
    in_review: "قيد المراجعة",
    approved: "معتمد",
    deprecated: "متوقّف",
    rejected: "مرفوض",
    active: "نشط",
    disabled: "معطّل",
    "failover-only": "احتياطي فقط",
  } as Record<string, string>)[s] ?? s;
}

type AiConnTest = {
  configured: boolean;
  apiKeySet: boolean;
  baseUrlSet: boolean;
  model: string;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
};

export default function AdminAiGovernance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [newPromptOpen, setNewPromptOpen] = useState(false);
  const [viewPromptId, setViewPromptId] = useState<number | null>(null);
  const [reviewPromptId, setReviewPromptId] = useState<number | null>(null);
  const [simulatePromptId, setSimulatePromptId] = useState<number | null>(null);
  const [evaluatePrompt, setEvaluatePrompt] = useState<PromptRow | null>(null);
  const [editProvider, setEditProvider] = useState<ProviderRow | null>(null);

  // حالة/اختبار تفعيل الذكاء الاصطناعي (LLM) — يتحقّق من ضبط المفتاح + استجابة المزوّد.
  const [connTest, setConnTest] = useState<AiConnTest | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  async function runConnectionTest() {
    setTestingConn(true);
    try {
      setConnTest((await apiFetch("/admin/ai-governance/connection-test")) as AiConnTest);
    } catch (e) {
      setConnTest({
        configured: false, apiKeySet: false, baseUrlSet: false, model: "",
        reachable: false, latencyMs: null,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTestingConn(false);
    }
  }

  const { data: overview, isLoading: ovLoading, error: ovError, refetch: refetchOverview } =
    useApiQuery<Overview>(["ai-governance-overview"], "/admin/ai-governance/overview");

  const { data: providersResp, isLoading: prLoading, refetch: refetchProviders } =
    useApiQuery<{ data: ProviderRow[] }>(["ai-governance-providers"], "/admin/ai-governance/providers");

  const { data: promptsResp, isLoading: pmLoading, refetch: refetchPrompts } =
    useApiQuery<{ data: PromptRow[] }>(["ai-governance-prompts"], "/admin/ai-governance/prompts");

  const providers = providersResp?.data ?? [];
  const prompts = promptsResp?.data ?? [];
  const reviewQueue = overview?.reviewQueue ?? [];

  // Print wiring — the versioned prompt catalog is the primary records-level
  // list on this page (providers is a smaller registry/config table).
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<PromptRow>(prompts);

  const refreshAll = () => {
    void refetchOverview();
    void refetchProviders();
    void refetchPrompts();
  };

  // ─── Mutations ───────────────────────────────────────────────────────
  const createProvider = useMutation({
    mutationFn: (b: Partial<ProviderRow>) => apiFetch("/admin/ai-governance/providers", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => {
      toast({ title: "تم إنشاء المزوّد" });
      setNewProviderOpen(false);
      refreshAll();
    },
    onError: (e: Error) => toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" }),
  });

  const updateProvider = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ProviderRow> }) =>
      apiFetch(`/admin/ai-governance/providers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل التحديث", description: e.message, variant: "destructive" }),
  });

  const createPrompt = useMutation({
    mutationFn: (b: Record<string, unknown>) => apiFetch("/admin/ai-governance/prompts", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "تم إنشاء المسوّدة" }); setNewPromptOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل الإنشاء", description: e.message, variant: "destructive" }),
  });

  const submitReview = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/ai-governance/prompts/${id}/submit-review`, { method: "POST" }),
    onSuccess: () => { toast({ title: "أُرسل للمراجعة" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل الإرسال", description: e.message, variant: "destructive" }),
  });

  const reviewPrompt = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { decision: string; comments?: string } }) =>
      apiFetch(`/admin/ai-governance/prompts/${id}/reviews`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: "تم تسجيل المراجعة" }); setReviewPromptId(null); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل التسجيل", description: e.message, variant: "destructive" }),
  });

  const approvePrompt = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/ai-governance/prompts/${id}/approve`, { method: "POST" }),
    onSuccess: () => { toast({ title: "تمت الموافقة" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const deprecatePrompt = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/ai-governance/prompts/${id}/deprecate`, { method: "POST" }),
    onSuccess: () => { toast({ title: "تم الإيقاف" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  // ─── Columns ─────────────────────────────────────────────────────────
  const providerColumns: DataTableColumn<ProviderRow>[] = [
    { key: "slug", header: "المعرّف", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.slug}</span>
    )},
    { key: "name", header: "الاسم", render: (r) => <span className="text-xs">{r.name}</span> },
    { key: "capabilities", header: "القدرات", render: (r) => (
      <div className="flex gap-1 flex-wrap">
        {(r.capabilities ?? []).map((c) => (
          <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
        ))}
      </div>
    )},
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "priority", header: "الأولوية", render: (r) => (
      <span className="font-mono text-xs">{r.priority}</span>
    )},
    { key: "defaultModel", header: "النموذج الافتراضي", render: (r) => (
      <span className="font-mono text-xs">{r.defaultModel ?? "—"}</span>
    )},
    { key: "apiKey", header: "مفتاح API", render: (r) => {
      // The list endpoint returns "*****" when a key is set, empty
      // string when not — operator sees at a glance whether the
      // provider can actually be called.
      const key = (r.config as { apiKey?: string })?.apiKey;
      return key === "*****"
        ? <Badge variant="outline" className="text-[10px] text-status-success-foreground">مضبوط</Badge>
        : <Badge variant="outline" className="text-[10px] text-muted-foreground">غير مضبوط</Badge>;
    }},
    { key: "actions", header: "إجراءات", render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setEditProvider(r)}>
          تعديل
        </Button>
        <Button variant="ghost" size="sm" onClick={() => updateProvider.mutate({
          id: r.id, body: { status: r.status === "active" ? "disabled" : "active" },
        })}>
          {r.status === "active" ? "تعطيل" : "تفعيل"}
        </Button>
      </div>
    )},
  ];

  const promptColumns: DataTableColumn<PromptRow>[] = [
    { key: "slug", header: "المعرّف", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.slug}</span>
    )},
    { key: "version", header: "الإصدار", render: (r) => (
      <Badge variant="outline" className="font-mono">v{r.version}</Badge>
    )},
    { key: "title", header: "العنوان", render: (r) => <span className="text-xs">{r.title}</span> },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "updatedAt", header: "آخر تحديث", render: (r) => (
      <span className="text-xs">{formatDateAr(r.updatedAt)}</span>
    )},
    { key: "actions", header: "إجراءات", render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button asChild variant="ghost" size="sm" title="فتح صفحة التفاصيل">
          <Link href={`/admin/ai-governance/prompts/${r.id}`}>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setViewPromptId(r.id)} title="عرض سريع">
          <Eye className="w-3 h-3" />
        </Button>
        {r.status === "draft" && (
          <Button variant="ghost" size="sm" onClick={() => submitReview.mutate(r.id)}>
            <Send className="w-3 h-3 me-1" />للمراجعة
          </Button>
        )}
        {r.status === "in_review" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setReviewPromptId(r.id)}>
              <MessageSquare className="w-3 h-3 me-1" />راجِع
            </Button>
            <Button variant="ghost" size="sm" onClick={() => approvePrompt.mutate(r.id)}>
              <CheckCircle2 className="w-3 h-3 me-1" />اعتمد
            </Button>
          </>
        )}
        {r.status === "approved" && (
          <Button variant="ghost" size="sm" onClick={() => deprecatePrompt.mutate(r.id)}>
            <XCircle className="w-3 h-3 me-1" />أوقف
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setSimulatePromptId(r.id)}>
          <PlayCircle className="w-3 h-3 me-1" />جرّب
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEvaluatePrompt(r)}>
          <FlaskConical className="w-3 h-3 me-1" />قيّم
        </Button>
      </div>
    )},
  ];

  return (
    <PageShell
      title="حوكمة الذكاء الاصطناعي"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "حوكمة الذكاء الاصطناعي" },
      ]}
      subtitle="سجلّ المزوّدات، كتالوج الموجّهات، ومركز المراجعة"
      actions={
        <RefreshAction onRefresh={refreshAll} />
      }
    >
      <PageStateWrapper isLoading={ovLoading && !overview} error={ovError} onRetry={refetchOverview}>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><BookOpen className="w-4 h-4 me-1" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="providers"><Server className="w-4 h-4 me-1" />المزوّدون</TabsTrigger>
            <TabsTrigger value="prompts"><Sparkles className="w-4 h-4 me-1" />الموجّهات (Prompts)</TabsTrigger>
            <TabsTrigger value="review"><ClipboardCheck className="w-4 h-4 me-1" />مركز المراجعة ({reviewQueue.length})</TabsTrigger>
          </TabsList>

          {/* ── Overview ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            {/* ── حالة تفعيل الذكاء الاصطناعي (LLM) ─────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />حالة تفعيل الذكاء الاصطناعي (LLM)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button size="sm" variant="outline" onClick={runConnectionTest} disabled={testingConn}>
                    {testingConn ? "جاري الاختبار…" : "اختبار الاتصال"}
                  </Button>
                  {connTest && (
                    <span
                      className={`text-sm font-medium ${
                        connTest.reachable
                          ? "text-status-success-foreground"
                          : connTest.configured
                            ? "text-status-warning-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {connTest.reachable
                        ? `✓ مُفعّل ويستجيب (${connTest.latencyMs} مللي ثانية)`
                        : connTest.configured
                          ? "⚠️ مضبوط لكن لا يستجيب"
                          : "غير مُفعّل"}
                    </span>
                  )}
                </div>
                {connTest ? (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      المفتاح: {connTest.apiKeySet ? "مضبوط ✓" : "غير مضبوط ✗"} · عنوان الخدمة:{" "}
                      {connTest.baseUrlSet ? "مضبوط ✓" : "غير مضبوط ✗"} · النموذج:{" "}
                      <span className="font-mono">{connTest.model || "—"}</span>
                    </div>
                    {connTest.error && (
                      <div className="text-status-danger-foreground">{connTest.error}</div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    اضغط «اختبار الاتصال» للتحقّق من التفعيل. يتم التفعيل بضبط متغيّرَي البيئة{" "}
                    <span className="font-mono">AI_INTEGRATIONS_ANTHROPIC_API_KEY</span> و{" "}
                    <span className="font-mono">AI_INTEGRATIONS_ANTHROPIC_BASE_URL</span> ثم إعادة تشغيل الخادم.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Server className="w-4 h-4" />المزوّدون
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {(overview?.providers ?? []).map((p) => (
                    <div key={p.status} className="flex justify-between text-sm">
                      <span>{statusLabel(p.status)}</span>
                      <span className="font-mono font-semibold">{p.count}</span>
                    </div>
                  ))}
                  {(overview?.providers ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">لا توجد مزوّدات مسجّلة بعد.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />الموجّهات (Prompts)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {(overview?.prompts ?? []).map((p) => (
                    <div key={p.status} className="flex justify-between text-sm">
                      <span>{statusLabel(p.status)}</span>
                      <span className="font-mono font-semibold">{p.count}</span>
                    </div>
                  ))}
                  {(overview?.prompts ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">لا توجد prompts مسجّلة بعد.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {reviewQueue.length > 0 && (
              <Card className="border-status-warning-surface">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-status-warning-foreground" />
                    قائمة الانتظار للمراجعة ({reviewQueue.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {reviewQueue.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm bg-status-warning-surface/40 p-3 rounded">
                      <div>
                        <p className="font-medium">
                          <span className="font-mono text-xs">{p.slug}</span> <Badge variant="outline" className="text-[10px]">v{p.version}</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">{p.title}</p>
                        <p className="text-[11px] text-muted-foreground">منذ: {formatDateAr(p.updatedAt)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => { setViewPromptId(p.id); setTab("prompts"); }}>
                          <Eye className="w-3 h-3 me-1" />استعرض
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setReviewPromptId(p.id)}>
                          <MessageSquare className="w-3 h-3 me-1" />راجِع
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Providers ─────────────────────────────────────────── */}
          <TabsContent value="providers" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setNewProviderOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />مزوّد جديد
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <PageStateWrapper isLoading={prLoading && providers.length === 0} compact onRetry={refetchProviders}>
                  <DataTable columns={providerColumns} data={providers} noToolbar pageSize={0} />
                </PageStateWrapper>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Prompts ───────────────────────────────────────────── */}
          <TabsContent value="prompts" className="space-y-3">
            <div className="flex justify-end items-center gap-2">
              <PrintButton
                entityType="report_admin_ai_governance"
                entityId="list"
                size="icon"
                payload={() => ({
                  entity: { title: "كتالوج الموجّهات (Prompts) — حوكمة الذكاء الاصطناعي", total: printRows.length },
                  items: printRows.map((p: PromptRow) => ({
                    "المعرّف": p.slug,
                    "الإصدار": p.version,
                    "العنوان": p.title,
                    "الحالة": statusLabel(p.status),
                    "آخر تحديث": p.updatedAt,
                  })),
                })}
              />
              <Button onClick={() => setNewPromptOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />مسوّدة جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <PageStateWrapper isLoading={pmLoading && prompts.length === 0} compact onRetry={refetchPrompts}>
                  <DataTable columns={promptColumns} data={prompts} onSortedDataChange={setPrintRows} noToolbar pageSize={0} />
                </PageStateWrapper>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Review center ─────────────────────────────────────── */}
          <TabsContent value="review" className="space-y-3">
            {reviewQueue.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-status-success-foreground mb-2" />
                  <p className="text-sm">لا توجد prompts قيد المراجعة حالياً.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {reviewQueue.map((p) => (
                  <Card key={p.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span><span className="font-mono">{p.slug}</span> <Badge variant="outline">v{p.version}</Badge></span>
                        <span className="text-xs text-muted-foreground font-normal">{formatDateAr(p.updatedAt)}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-2">{p.title}</p>
                      {p.description && <p className="text-xs text-muted-foreground mb-3">{p.description}</p>}
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setViewPromptId(p.id)}>
                          <Eye className="w-3 h-3 me-1" />استعرض المحتوى
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setReviewPromptId(p.id)}>
                          <MessageSquare className="w-3 h-3 me-1" />سجّل مراجعة
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => approvePrompt.mutate(p.id)}>
                          <CheckCircle2 className="w-3 h-3 me-1" />اعتمد
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <NewProviderDialog
          open={newProviderOpen}
          onClose={() => setNewProviderOpen(false)}
          onSubmit={(b) => createProvider.mutate(b)}
          isSubmitting={createProvider.isPending}
        />
        <NewPromptDialog
          open={newPromptOpen}
          onClose={() => setNewPromptOpen(false)}
          onSubmit={(b) => createPrompt.mutate(b)}
          isSubmitting={createPrompt.isPending}
        />
        <ViewPromptDialog
          promptId={viewPromptId}
          onClose={() => setViewPromptId(null)}
        />
        <ReviewPromptDialog
          promptId={reviewPromptId}
          onClose={() => setReviewPromptId(null)}
          onSubmit={(b) => reviewPromptId && reviewPrompt.mutate({ id: reviewPromptId, body: b })}
          isSubmitting={reviewPrompt.isPending}
        />
        <SimulatePromptDialog
          promptId={simulatePromptId}
          onClose={() => setSimulatePromptId(null)}
        />
        <EvaluatePromptDialog
          prompt={evaluatePrompt}
          onClose={() => setEvaluatePrompt(null)}
        />
        <EditProviderDialog
          provider={editProvider}
          onClose={() => setEditProvider(null)}
          onSubmit={(b) => editProvider && updateProvider.mutate({ id: editProvider.id, body: b })}
          isSubmitting={updateProvider.isPending}
        />
      </PageStateWrapper>
    </PageShell>
  );
}

// ─────────────────────── Dialogs ──────────────────────────────────────────

const ALL_CAPABILITIES: AiCapability[] = ["generation", "stt", "embedding", "image"];

function NewProviderDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<ProviderRow>) => void; isSubmitting: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [defaultModel, setDefaultModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");
  const [capabilities, setCapabilities] = useState<AiCapability[]>(["generation"]);
  const toggleCap = (c: AiCapability) =>
    setCapabilities((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل مزوّد جديد</DialogTitle>
          <DialogDescription>
            اختر القدرات (يمكن واحدة أو أكثر) — مزوّد STT يُستهلَك تلقائياً من /admin/pbx-control.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <Label>المعرّف (slug)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="openai-whisper" />
          </div>
          <div>
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI Whisper" />
          </div>
          <div>
            <Label>القدرات</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_CAPABILITIES.map((c) => (
                <Button
                  key={c}
                  variant={capabilities.includes(c) ? "default" : "outline"}
                  size="sm"
                  type="button"
                  onClick={() => toggleCap(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الأولوية</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div>
              <Label>النموذج الافتراضي</Label>
              <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="whisper-1" />
            </div>
          </div>
          <div>
            <Label>نقطة الاتصال (Endpoint) — اختياري للـ STT و custom hosts</Label>
            <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1/audio/transcriptions" />
          </div>
          <div>
            <Label>مفتاح API (يُشفَّر قبل الحفظ)</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              يُحفظ مشفّراً عبر SECRETS_ENCRYPTION_KEY ولا يُعاد عرضه. اتركه فارغاً إن لم يكن المزوّد يتطلّب مصادقة.
            </p>
          </div>
          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            rateLimitAware
            disabled={isSubmitting || !slug || !name || capabilities.length === 0}
            onClick={() => onSubmit({
              slug, name, priority, capabilities,
              defaultModel: defaultModel || null,
              endpoint: endpoint || null,
              config: apiKey ? { apiKey } : {},
              notes: notes || null,
            })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPromptDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Record<string, unknown>) => void; isSubmitting: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userTemplate, setUserTemplate] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>مسوّدة prompt جديدة</DialogTitle>
          <DialogDescription>
            إذا كان الـ slug موجوداً، ستُنشأ نسخة جديدة (إصدار +1) بحالة "مسوّدة".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <Label>المعرّف (slug)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="reception.categorize" />
          </div>
          <div>
            <Label>العنوان</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>موجّه النظام (System Prompt)</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>قالب المستخدم (اختياري)</Label>
            <Textarea
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            rateLimitAware
            disabled={isSubmitting || !slug || !title || !systemPrompt}
            onClick={() => onSubmit({
              slug, title,
              description: description || null,
              systemPrompt,
              userTemplate: userTemplate || null,
            })}
          >
            حفظ المسوّدة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewPromptDialog({ promptId, onClose }: {
  promptId: number | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: prompt } = useApiQuery<PromptDetail>(
    ["ai-governance-prompt", String(promptId ?? 0)],
    promptId ? `/admin/ai-governance/prompts/${promptId}` : null,
    { enabled: !!promptId },
  );
  const { data: reviewsResp } = useApiQuery<{ data: ReviewRow[] }>(
    ["ai-governance-prompt-reviews", String(promptId ?? 0)],
    promptId ? `/admin/ai-governance/prompts/${promptId}/reviews` : null,
    { enabled: !!promptId },
  );
  const reviews = reviewsResp?.data ?? [];

  // PATCH /admin/ai-governance/prompts/:id — edit draft body. Only
  // visible when the prompt is still a draft; once submitted for review
  // the server rejects edits.
  const [editing, setEditing] = useState(false);
  const [draftSystem, setDraftSystem] = useState("");
  const [draftUser, setDraftUser] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const startEdit = () => {
    if (!prompt) return;
    setDraftSystem(prompt.systemPrompt ?? "");
    setDraftUser(prompt.userTemplate ?? "");
    setDraftTitle(prompt.title ?? "");
    setDraftDesc(prompt.description ?? "");
    setEditing(true);
  };
  const editMut = useMutation({
    mutationFn: (b: Record<string, unknown>) =>
      apiFetch(`/admin/ai-governance/prompts/${promptId}`, { method: "PATCH", body: JSON.stringify(b) }),
    onSuccess: () => {
      toast({ title: "تم تحديث المسوّدة" });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["ai-governance-prompt", String(promptId ?? 0)] });
      qc.invalidateQueries({ queryKey: ["ai-governance-prompts"] });
    },
    onError: (e: Error) => toast({ title: "فشل التحديث", description: e.message, variant: "destructive" }),
  });
  const submitEdit = () => {
    if (!draftSystem.trim() || !draftTitle.trim()) return;
    editMut.mutate({
      title: draftTitle,
      description: draftDesc || null,
      systemPrompt: draftSystem,
      userTemplate: draftUser || null,
    });
  };

  return (
    <Dialog open={!!promptId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {prompt ? (
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm">{prompt.slug}</span>
                <Badge variant="outline">v{prompt.version}</Badge>
                <PageStatusBadge status={prompt.status} />
              </span>
            ) : "تحميل..."}
          </DialogTitle>
          {prompt?.title && <DialogDescription>{prompt.title}</DialogDescription>}
        </DialogHeader>
        {prompt && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {editing ? (
              <>
                <div>
                  <Label className="text-xs">العنوان *</Label>
                  <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full h-8 px-2 text-sm border rounded" />
                </div>
                <div>
                  <Label className="text-xs">الوصف</Label>
                  <Textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={2} />
                </div>
                <div>
                  <Label className="text-xs">موجّه النظام (System Prompt) *</Label>
                  <Textarea value={draftSystem} onChange={(e) => setDraftSystem(e.target.value)} rows={8}
                    className="font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs">قالب المستخدم</Label>
                  <Textarea value={draftUser} onChange={(e) => setDraftUser(e.target.value)} rows={4}
                    className="font-mono text-xs" />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={submitEdit} disabled={editMut.isPending || !draftSystem.trim() || !draftTitle.trim()}>
                    حفظ التعديل
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>إلغاء</Button>
                </div>
              </>
            ) : (
              <>
                {prompt.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">الوصف</Label>
                    <p className="text-sm">{prompt.description}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">موجّه النظام (System Prompt)</Label>
                  <pre className="bg-surface-subtle rounded p-3 text-xs font-mono whitespace-pre-wrap break-words">
                    {prompt.systemPrompt}
                  </pre>
                </div>
                {prompt.userTemplate && (
                  <div>
                    <Label className="text-xs text-muted-foreground">قالب المستخدم</Label>
                    <pre className="bg-surface-subtle rounded p-3 text-xs font-mono whitespace-pre-wrap break-words">
                      {prompt.userTemplate}
                    </pre>
                  </div>
                )}
                {prompt.status === "draft" && (
                  <Button variant="outline" size="sm" onClick={startEdit}>
                    تعديل المسوّدة
                  </Button>
                )}
              </>
            )}
            {reviews.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">المراجعات ({reviews.length})</Label>
                <div className="space-y-2 mt-2">
                  {reviews.map((r) => (
                    <div key={r.id} className={cn(
                      "p-2 rounded border text-sm",
                      r.decision === "approved" && "bg-status-success-surface border-status-success-surface",
                      r.decision === "changes_requested" && "bg-status-warning-surface/40 border-status-warning-surface",
                      r.decision === "rejected" && "bg-status-error-surface border-status-error-surface",
                    )}>
                      <div className="flex items-center gap-2 text-xs">
                        <PageStatusBadge status={r.decision} />
                        <span className="text-muted-foreground">{formatDateAr(r.createdAt)}</span>
                      </div>
                      {r.comments && <p className="text-xs mt-1">{r.comments}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewPromptDialog({ promptId, onClose, onSubmit, isSubmitting }: {
  promptId: number | null; onClose: () => void;
  onSubmit: (b: { decision: string; comments?: string }) => void; isSubmitting: boolean;
}) {
  const [decision, setDecision] = useState<"approved" | "changes_requested" | "rejected">("approved");
  const [comments, setComments] = useState("");

  return (
    <Dialog open={!!promptId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل مراجعة</DialogTitle>
          <DialogDescription>لا يحقّ لمؤلّف الـ prompt مراجعته (Separation-of-Duties).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>القرار</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant={decision === "approved" ? "default" : "outline"}
                size="sm" onClick={() => setDecision("approved")}
              >
                <CheckCircle2 className="w-4 h-4 me-1" />موافقة
              </Button>
              <Button
                variant={decision === "changes_requested" ? "default" : "outline"}
                size="sm" onClick={() => setDecision("changes_requested")}
              >
                طلب تعديلات
              </Button>
              <Button
                variant={decision === "rejected" ? "default" : "outline"}
                size="sm" onClick={() => setDecision("rejected")}
              >
                <XCircle className="w-4 h-4 me-1" />رفض
              </Button>
            </div>
          </div>
          <div>
            <Label>التعليقات</Label>
            <Textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            rateLimitAware
            disabled={isSubmitting}
            onClick={() => onSubmit({ decision, comments: comments || undefined })}
          >
            تسجيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SimulatePromptDialog({ promptId, onClose }: {
  promptId: number | null; onClose: () => void;
}) {
  const [userPrompt, setUserPrompt] = useState("");
  const [result, setResult] = useState<SimulateResult | null>(null);
  const { data: prompt } = useApiQuery<PromptDetail>(
    ["ai-governance-prompt-sim", String(promptId ?? 0)],
    promptId ? `/admin/ai-governance/prompts/${promptId}` : null,
    { enabled: !!promptId },
  );
  const run = useMutation({
    mutationFn: () => apiFetch<SimulateResult>(`/admin/ai-governance/prompts/${promptId}/simulate`, {
      method: "POST", body: JSON.stringify({ userPrompt }),
    }),
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast({ title: "فشل التشغيل", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!promptId} onOpenChange={(v) => { if (!v) { onClose(); setUserPrompt(""); setResult(null); }}}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {prompt ? <>محاكاة الـ prompt: <span className="font-mono text-sm">{prompt.slug}</span> v{prompt.version}</> : "تحميل..."}
          </DialogTitle>
          <DialogDescription>
            يُشغَّل بالنموذج الإنتاجي (Claude Haiku 4.5) — التكلفة محتسبة وستظهر في مرصد المراقبة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {prompt && (
            <div>
              <Label className="text-xs text-muted-foreground">موجّه النظام (System Prompt) — مرجعي</Label>
              <pre className="bg-surface-subtle p-2 rounded text-[11px] font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">{prompt.systemPrompt}</pre>
            </div>
          )}
          <div>
            <Label>مدخل المستخدم</Label>
            <Textarea value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} rows={5} className="font-mono text-xs" />
          </div>
          <Button rateLimitAware disabled={run.isPending || !userPrompt || !prompt} onClick={() => run.mutate()}>
            <PlayCircle className="w-4 h-4 me-1" />{run.isPending ? "جاري التشغيل..." : "شغّل"}
          </Button>
          {result && (
            <div className="space-y-2 border-t pt-3">
              {result.error ? (
                <div className="bg-status-error-surface text-status-error-foreground p-2 rounded text-sm">
                  <AlertOctagon className="w-4 h-4 inline me-1" />{result.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="bg-surface-subtle p-2 rounded"><span className="text-muted-foreground">المدة</span><br /><span className="font-mono font-semibold">{result.durationMs}ms</span></div>
                    <div className="bg-surface-subtle p-2 rounded"><span className="text-muted-foreground">رموز الموجّه</span><br /><span className="font-mono font-semibold">{result.promptTokens}</span></div>
                    <div className="bg-surface-subtle p-2 rounded"><span className="text-muted-foreground">رموز الإكمال</span><br /><span className="font-mono font-semibold">{result.completionTokens}</span></div>
                    <div className="bg-surface-subtle p-2 rounded"><span className="text-muted-foreground">التكلفة</span><br /><span className="font-mono font-semibold">${result.costUsdRounded.toFixed(4)}</span></div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">المخرَج</Label>
                    <pre className="bg-surface-subtle p-3 rounded text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{result.output}</pre>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EvaluatePromptDialog({ prompt, onClose }: {
  prompt: PromptRow | null; onClose: () => void;
}) {
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const slug = prompt?.slug ?? "";
  const { data: casesResp, refetch: refetchCases } = useApiQuery<{ data: TestCaseRow[] }>(
    ["ai-governance-test-cases", slug],
    prompt ? `/admin/ai-governance/prompts/${encodeURIComponent(slug)}/test-cases` : null,
    { enabled: !!prompt },
  );
  const { data: evalsResp, refetch: refetchEvals } = useApiQuery<{ data: EvaluationRow[] }>(
    ["ai-governance-evals", String(prompt?.id ?? 0)],
    prompt ? `/admin/ai-governance/prompts/${prompt.id}/evaluations` : null,
    { enabled: !!prompt },
  );
  const cases = casesResp?.data ?? [];
  const evals = evalsResp?.data ?? [];

  const run = useMutation({
    mutationFn: () => apiFetch(`/admin/ai-governance/prompts/${prompt!.id}/evaluate`, { method: "POST" }),
    onSuccess: () => { toast({ title: "اكتمل التقييم" }); refetchEvals(); },
    onError: (e: Error) => toast({ title: "فشل التقييم", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={!!prompt} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {prompt ? <>تقييم الـ prompt: <span className="font-mono text-sm">{prompt.slug}</span> v{prompt.version}</> : ""}
          </DialogTitle>
          <DialogDescription>
            يُشغَّل الـ prompt الحالي ضد كل حالات الاختبار الذهبية المفعّلة للـ slug. اختبارها مفعّلة فقط.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Test cases */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">حالات الاختبار ({cases.length})</Label>
              <Button variant="outline" size="sm" onClick={() => setNewCaseOpen(true)}>
                <Plus className="w-3 h-3 me-1" />حالة جديدة
              </Button>
            </div>
            {cases.length > 0 ? (
              <div className="space-y-1">
                {cases.map((c) => (
                  <div key={c.id} className="text-xs bg-surface-subtle p-2 rounded">
                    <p className="font-medium">{c.name} {c.enabled ? "" : <Badge variant="outline" className="text-[9px] ms-1">معطّلة</Badge>}</p>
                    {c.description && <p className="text-muted-foreground">{c.description}</p>}
                    <p className="font-mono text-[10px] text-muted-foreground mt-1">input: {JSON.stringify(c.input).slice(0, 100)}</p>
                    {c.expectedContains && <p className="text-[10px] text-muted-foreground">expectedContains: "{c.expectedContains}"</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد حالات اختبار بعد لهذا الـ slug. أضف حالة لبدء التقييم.</p>
            )}
            <div className="mt-3">
              <Button rateLimitAware disabled={run.isPending || cases.length === 0} onClick={() => run.mutate()}>
                <TestTube className="w-4 h-4 me-1" />{run.isPending ? "جاري التقييم..." : `شغّل التقييم (${cases.length} حالة)`}
              </Button>
            </div>
          </div>

          {/* Past evaluation runs */}
          {evals.length > 0 && (
            <div className="border-t pt-3">
              <Label className="text-sm mb-2 block">آخر تقييمات ({evals.length})</Label>
              <div className="space-y-1">
                {evals.slice(0, 10).map((e) => (
                  <EvaluationRunRow key={e.id} run={e} />
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
        {prompt && (
          <NewTestCaseDialog
            open={newCaseOpen}
            slug={slug}
            onClose={() => setNewCaseOpen(false)}
            onSuccess={() => { refetchCases(); setNewCaseOpen(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Expandable evaluation run summary — click to fetch per-case results
// from /admin/ai-governance/evaluations/:id/results. Lazy so the
// dialog stays fast when 50 runs exist but only one is interesting.
function EvaluationRunRow({ run }: { run: EvaluationRow }) {
  const [expanded, setExpanded] = useState(false);
  const { data: resultsResp } = useApiQuery<{ data: EvaluationResultRow[] }>(
    ["ai-eval-results", String(run.id)],
    expanded ? `/admin/ai-governance/evaluations/${run.id}/results` : null,
    { enabled: expanded },
  );
  const results: EvaluationResultRow[] = resultsResp?.data ?? [];
  return (
    <div className={cn(
      "text-xs rounded border",
      run.failedCases > 0 ? "bg-status-error-surface/40 border-status-error-surface" :
      run.skippedCases > 0 ? "bg-status-warning-surface/40 border-status-warning-surface" :
      "bg-status-success-surface border-status-success-surface",
    )}>
      <button
        type="button"
        className="w-full text-start p-2 cursor-pointer hover:bg-black/5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <span>
            <Badge variant="outline" className="text-[10px]">v{run.promptVersion}</Badge>
            <span className="ms-2">{run.passedCases}/{run.totalCases} نجحت</span>
            {run.failedCases > 0 && <span className="ms-2 text-status-error-foreground">{run.failedCases} فشلت</span>}
            {run.skippedCases > 0 && <span className="ms-2 text-status-warning-foreground">{run.skippedCases} تخطّت</span>}
          </span>
          <span className="text-[10px] text-muted-foreground">
            ${run.totalCostUsd.toFixed(4)} · {run.totalTokens} tok · {run.durationMs}ms · {formatDateAr(run.startedAt)}
          </span>
        </div>
      </button>
      {expanded && results.length > 0 && (
        <div className="border-t bg-white px-2 py-2 space-y-1">
          {results.map((r) => (
            <div key={r.id} className="text-[10px] flex items-start gap-2">
              <span className={cn(
                "inline-block px-1.5 py-0.5 rounded font-mono",
                r.passed ? "bg-status-success-surface text-status-success-foreground" :
                r.passed === false ? "bg-status-error-surface text-status-error-foreground" :
                "bg-status-warning-surface text-status-warning-foreground",
              )}>{r.status}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{r.caseName || "—"}</p>
                {r.errorMessage && <p className="text-status-error-foreground line-clamp-2">{r.errorMessage}</p>}
                {r.actualOutput && (
                  <p className="text-muted-foreground line-clamp-1 font-mono">{r.actualOutput.slice(0, 200)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {expanded && results.length === 0 && (
        <p className="border-t bg-white p-2 text-[10px] text-muted-foreground">لا توجد نتائج تفصيلية</p>
      )}
    </div>
  );
}

function NewTestCaseDialog({ open, slug, onClose, onSuccess }: {
  open: boolean; slug: string; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inputJson, setInputJson] = useState('{}');
  const [expectedContains, setExpectedContains] = useState("");
  const create = useMutation({
    mutationFn: () => {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(inputJson); }
      catch { throw new Error("الـ input ليس JSON صالحاً"); }
      return apiFetch("/admin/ai-governance/test-cases", {
        method: "POST",
        body: JSON.stringify({
          promptSlug: slug, name,
          description: description || null,
          input,
          expectedContains: expectedContains || null,
        }),
      });
    },
    onSuccess: () => { toast({ title: "أُضيفت الحالة" }); onSuccess(); },
    onError: (e: Error) => toast({ title: "فشل الإضافة", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حالة اختبار جديدة لـ {slug}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>الوصف</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div>
            <Label>المدخل (JSON)</Label>
            <Textarea rows={4} className="font-mono text-xs" value={inputJson} onChange={(e) => setInputJson(e.target.value)} />
          </div>
          <div>
            <Label>المتوقَّع يحتوي (اختياري)</Label>
            <Input value={expectedContains} onChange={(e) => setExpectedContains(e.target.value)} placeholder="نص يجب أن يحتويه المخرَج" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={create.isPending || !name} onClick={() => create.mutate()}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProviderDialog({ provider, onClose, onSubmit, isSubmitting }: {
  provider: ProviderRow | null; onClose: () => void;
  onSubmit: (b: Partial<ProviderRow>) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [defaultModel, setDefaultModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");
  const [capabilities, setCapabilities] = useState<AiCapability[]>([]);
  const [status, setStatus] = useState<"active" | "disabled" | "failover-only">("active");
  const toggleCap = (c: AiCapability) =>
    setCapabilities((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  // Hydrate state from the provider being edited each time the dialog
  // opens — including the apiKey-set badge so the operator sees "*****"
  // and knows the key is present without it being revealed.
  useEffect(() => {
    if (!provider) return;
    setName(provider.name);
    setPriority(provider.priority);
    setDefaultModel(provider.defaultModel ?? "");
    setEndpoint(provider.endpoint ?? "");
    setNotes(provider.notes ?? "");
    setCapabilities(provider.capabilities ?? ["generation"]);
    setStatus(provider.status);
    setApiKey((provider.config as { apiKey?: string })?.apiKey === "*****" ? "*****" : "");
  }, [provider]);

  if (!provider) return null;
  return (
    <Dialog open={!!provider} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل المزوّد: <span className="font-mono text-sm">{provider.slug}</span></DialogTitle>
          <DialogDescription>
            اترك حقل API Key على "*****" للحفاظ على المفتاح الحالي، أو امسحه وأدخل قيمة جديدة.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>الحالة</Label>
            <div className="flex gap-2 mt-2">
              {(["active", "disabled", "failover-only"] as const).map((s) => (
                <Button key={s} variant={status === s ? "default" : "outline"} size="sm" type="button" onClick={() => setStatus(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>القدرات</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_CAPABILITIES.map((c) => (
                <Button key={c} variant={capabilities.includes(c) ? "default" : "outline"} size="sm" type="button" onClick={() => toggleCap(c)}>
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>الأولوية</Label><Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></div>
            <div><Label>النموذج الافتراضي</Label><Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} /></div>
          </div>
          <div><Label>نقطة الاتصال (Endpoint)</Label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} /></div>
          <div>
            <Label>مفتاح API</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="اتركه على ***** للإبقاء على القيمة الحالية" />
          </div>
          <div><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !name || capabilities.length === 0} onClick={() => {
            const body: Partial<ProviderRow> = {
              name, status, priority, capabilities,
              defaultModel: defaultModel || null,
              endpoint: endpoint || null,
              notes: notes || null,
            };
            // Only send config if the operator typed something. The
            // server preserves "*****" → existing value, and never sees
            // the user's plain key on round-trips that didn't touch it.
            if (apiKey !== "") {
              body.config = { apiKey };
            }
            onSubmit(body);
          }}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
