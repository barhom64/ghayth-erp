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
import { useState } from "react";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  XCircle, AlertOctagon, MessageSquare, RefreshCw, Eye,
} from "lucide-react";

interface ProviderRow {
  id: number;
  slug: string;
  name: string;
  status: "active" | "disabled" | "failover-only";
  priority: number;
  defaultModel: string | null;
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

export default function AdminAiGovernance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [newPromptOpen, setNewPromptOpen] = useState(false);
  const [viewPromptId, setViewPromptId] = useState<number | null>(null);
  const [reviewPromptId, setReviewPromptId] = useState<number | null>(null);

  const { data: overview, isLoading: ovLoading, error: ovError, refetch: refetchOverview } =
    useApiQuery<Overview>(["ai-governance-overview"], "/admin/ai-governance/overview");

  const { data: providersResp, isLoading: prLoading, refetch: refetchProviders } =
    useApiQuery<{ data: ProviderRow[] }>(["ai-governance-providers"], "/admin/ai-governance/providers");

  const { data: promptsResp, isLoading: pmLoading, refetch: refetchPrompts } =
    useApiQuery<{ data: PromptRow[] }>(["ai-governance-prompts"], "/admin/ai-governance/prompts");

  const providers = providersResp?.data ?? [];
  const prompts = promptsResp?.data ?? [];
  const reviewQueue = overview?.reviewQueue ?? [];

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
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    { key: "priority", header: "الأولوية", render: (r) => (
      <span className="font-mono text-xs">{r.priority}</span>
    )},
    { key: "defaultModel", header: "النموذج الافتراضي", render: (r) => (
      <span className="font-mono text-xs">{r.defaultModel ?? "—"}</span>
    )},
    { key: "actions", header: "إجراءات", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => updateProvider.mutate({
        id: r.id, body: { status: r.status === "active" ? "disabled" : "active" },
      })}>
        {r.status === "active" ? "تعطيل" : "تفعيل"}
      </Button>
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
        <Button variant="ghost" size="sm" onClick={() => setViewPromptId(r.id)}>
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
      </div>
    )},
  ];

  return (
    <PageShell
      title="حوكمة الذكاء الاصطناعي"
      subtitle="سجلّ المزوّدات، كتالوج الـ prompts، ومركز المراجعة"
      actions={
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="w-4 h-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={ovLoading && !overview} error={ovError} onRetry={refetchOverview}>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><BookOpen className="w-4 h-4 me-1" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="providers"><Server className="w-4 h-4 me-1" />المزوّدون</TabsTrigger>
            <TabsTrigger value="prompts"><Sparkles className="w-4 h-4 me-1" />الـ Prompts</TabsTrigger>
            <TabsTrigger value="review"><ClipboardCheck className="w-4 h-4 me-1" />مركز المراجعة ({reviewQueue.length})</TabsTrigger>
          </TabsList>

          {/* ── Overview ──────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
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
                    <Sparkles className="w-4 h-4" />الـ Prompts
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
            <div className="flex justify-end">
              <Button onClick={() => setNewPromptOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />مسوّدة جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <PageStateWrapper isLoading={pmLoading && prompts.length === 0} compact onRetry={refetchPrompts}>
                  <DataTable columns={promptColumns} data={prompts} noToolbar pageSize={0} />
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
      </PageStateWrapper>
    </PageShell>
  );
}

// ─────────────────────── Dialogs ──────────────────────────────────────────

function NewProviderDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<ProviderRow>) => void; isSubmitting: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [defaultModel, setDefaultModel] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل مزوّد جديد</DialogTitle>
          <DialogDescription>يضاف للسجل وتصبح حالته الافتراضية "نشط".</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>المعرّف (slug)</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="anthropic" />
          </div>
          <div>
            <Label>الاسم</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Anthropic Claude" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الأولوية</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div>
              <Label>النموذج الافتراضي</Label>
              <Input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="claude-haiku-4-5" />
            </div>
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
            disabled={isSubmitting || !slug || !name}
            onClick={() => onSubmit({
              slug, name, priority,
              defaultModel: defaultModel || null,
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
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>User Template (اختياري)</Label>
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
            {prompt.description && (
              <div>
                <Label className="text-xs text-muted-foreground">الوصف</Label>
                <p className="text-sm">{prompt.description}</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">System Prompt</Label>
              <pre className="bg-surface-subtle rounded p-3 text-xs font-mono whitespace-pre-wrap break-words">
                {prompt.systemPrompt}
              </pre>
            </div>
            {prompt.userTemplate && (
              <div>
                <Label className="text-xs text-muted-foreground">User Template</Label>
                <pre className="bg-surface-subtle rounded p-3 text-xs font-mono whitespace-pre-wrap break-words">
                  {prompt.userTemplate}
                </pre>
              </div>
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
