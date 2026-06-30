import { useState } from "react";
import { useRoute, Link } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormGrid,
  FormTextField,
  FormTextareaField,
} from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Sparkles, FileCheck2, FileWarning, Beaker, History,
  CheckCircle2, XCircle, MessageSquare, Edit, Clock,
} from "lucide-react";
import { formatDateAr, formatNumber } from "@/lib/formatters";

interface PromptDetail {
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
  systemPrompt: string;
  userTemplate: string | null;
}

interface ReviewRow {
  id: number;
  reviewerId: number;
  reviewerName?: string;
  decision: "approved" | "changes_requested" | "rejected";
  comments: string | null;
  createdAt: string;
}

interface TestCaseRow {
  id: number;
  promptSlug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  expectedContains: string | null;
  createdAt: string;
}

interface EvaluationRow {
  id: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  totalCostUsd: number | string;
  totalTokens: number;
  durationMs: number;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  approved: "معتمد",
  deprecated: "مهجور",
  rejected: "مرفوض",
};

// Mirrors the Arabic labels shown in the reviews table's decision column.
const DECISION_LABELS: Record<string, string> = {
  approved: "اعتماد",
  rejected: "رفض",
  changes_requested: "طلب تعديلات",
};

function statusTone(s: string) {
  if (s === "approved") return "bg-emerald-100 text-emerald-800";
  if (s === "in_review") return "bg-status-info-surface text-status-info-foreground";
  if (s === "rejected") return "bg-status-error-surface text-status-error-foreground";
  if (s === "deprecated") return "bg-surface-subtle text-muted-foreground";
  return "bg-status-warning-surface text-status-warning-foreground";
}

const promptEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب").max(300),
  description: z.string().optional().default(""),
  systemPrompt: z.string().min(1, "موجّه النظام مطلوب"),
  userTemplate: z.string().optional().default(""),
});
type PromptEditForm = z.infer<typeof promptEditSchema>;

export default function AdminAiPromptDetailPage() {
  const [, params] = useRoute("/admin/ai-governance/prompts/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);

  // Bare-template URLs (no `id ? URL : null` wrapper) so the wiring
  // audit's static scanner can credit each endpoint individually. The
  // `enabled` third arg still gates the actual fetch until id is known.
  const promptQ = useApiQuery<PromptDetail>(
    ["ai-prompt", String(id)],
    `/admin/ai-governance/prompts/${id}`,
    !!id,
  );
  const prompt = promptQ.data;

  const reviewsQ = useApiQuery<{ data: ReviewRow[] }>(
    ["ai-prompt-reviews", String(id)],
    `/admin/ai-governance/prompts/${id}/reviews`,
    !!id,
  );
  const testCasesQ = useApiQuery<{ data: TestCaseRow[] }>(
    ["ai-prompt-test-cases", prompt?.slug ?? ""],
    `/admin/ai-governance/prompts/${prompt?.slug}/test-cases`,
    !!prompt?.slug,
  );
  const evaluationsQ = useApiQuery<{ data: EvaluationRow[] }>(
    ["ai-prompt-evaluations", String(id)],
    `/admin/ai-governance/prompts/${id}/evaluations`,
    !!id,
  );

  const reviews = reviewsQ.data?.data ?? [];
  const testCases = testCasesQ.data?.data ?? [];
  const evaluations = evaluationsQ.data?.data ?? [];

  // Print wiring (DETAIL page) — print this prompt's review decision trail.
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<ReviewRow>(reviews);

  const reviewColumns: DataTableColumn<ReviewRow>[] = [
    {
      key: "decision",
      header: "القرار",
      render: (r) => {
        const tone =
          r.decision === "approved" ? "bg-emerald-100 text-emerald-800" :
          r.decision === "rejected" ? "bg-status-error-surface text-status-error-foreground" :
          "bg-status-warning-surface text-status-warning-foreground";
        const label =
          r.decision === "approved" ? "اعتماد" :
          r.decision === "rejected" ? "رفض" :
          "طلب تعديلات";
        const Icon =
          r.decision === "approved" ? CheckCircle2 :
          r.decision === "rejected" ? XCircle :
          FileWarning;
        return <Badge className={tone}><Icon className="h-3 w-3 me-1" />{label}</Badge>;
      },
    },
    { key: "reviewerName", header: "المراجع", render: (r) => r.reviewerName ?? `مستخدم #${r.reviewerId}` },
    {
      key: "comments",
      header: "ملاحظات",
      render: (r) => r.comments
        ? <span className="text-sm text-muted-foreground line-clamp-2">{r.comments}</span>
        : "—",
    },
    { key: "createdAt", header: "التاريخ", render: (r) => formatDateAr(r.createdAt) },
  ];

  const testCaseColumns: DataTableColumn<TestCaseRow>[] = [
    { key: "name", header: "الاسم", render: (t) => <span className="font-medium">{t.name}</span> },
    {
      key: "enabled",
      header: "مفعّلة",
      render: (t) => t.enabled
        ? <Badge className="bg-emerald-100 text-emerald-800">نعم</Badge>
        : <Badge variant="outline">لا</Badge>,
    },
    {
      key: "expectedContains",
      header: "متوقع يحتوي",
      render: (t) => t.expectedContains
        ? <code className="text-xs">{t.expectedContains}</code>
        : "—",
    },
    {
      key: "description",
      header: "الوصف",
      render: (t) => t.description
        ? <span className="text-sm text-muted-foreground line-clamp-1">{t.description}</span>
        : "—",
    },
  ];

  const evalColumns: DataTableColumn<EvaluationRow>[] = [
    {
      key: "status",
      header: "الحالة",
      render: (e) => {
        const tone =
          e.status === "completed" ? "bg-emerald-100 text-emerald-800" :
          e.status === "failed" ? "bg-status-error-surface text-status-error-foreground" :
          e.status === "running" ? "bg-status-info-surface text-status-info-foreground" :
          "bg-status-warning-surface text-status-warning-foreground";
        const label =
          e.status === "completed" ? "مكتمل" :
          e.status === "failed" ? "فاشل" :
          e.status === "running" ? "قيد التشغيل" :
          "معلق";
        return <Badge className={tone}>{label}</Badge>;
      },
    },
    {
      key: "totalCases",
      header: "النتائج",
      render: (e) => (
        <div className="text-xs font-mono">
          <span className="text-emerald-700">{e.passedCases}</span>
          {" / "}
          <span className="text-status-error-foreground">{e.failedCases}</span>
          {" / "}
          <span className="text-muted-foreground">{e.skippedCases}</span>
          {" "}
          <span className="text-muted-foreground">(من {e.totalCases})</span>
        </div>
      ),
    },
    {
      key: "totalCostUsd",
      header: "التكلفة",
      render: (e) => <span className="font-mono text-xs">${Number(e.totalCostUsd ?? 0).toFixed(4)}</span>,
    },
    {
      key: "totalTokens",
      header: "الرموز",
      render: (e) => <span className="font-mono text-xs">{formatNumber(e.totalTokens)}</span>,
    },
    {
      key: "durationMs",
      header: "المدة",
      render: (e) => <span className="text-xs">{(e.durationMs / 1000).toFixed(2)}s</span>,
    },
    {
      key: "startedAt",
      header: "بدأ في",
      render: (e) => <span className="text-xs">{formatDateAr(e.startedAt)}</span>,
    },
  ];

  return (
    <PageShell
      title={prompt?.title || "تفاصيل الموجّه"}
      subtitle={prompt ? `${prompt.slug} — v${prompt.version}` : undefined}
      breadcrumbs={[
        { label: "الإدارة" },
        { href: "/admin/ai-governance", label: "حوكمة الذكاء" },
        { label: "الموجّه" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {prompt && id && (
            <PrintButton
              entityType="report_admin_ai_prompt"
              entityId={String(id)}
              size="icon"
              payload={() => ({
                entity: {
                  title: `مراجعات الموجّه: ${prompt.slug} v${prompt.version}`,
                  total: printRows.length,
                },
                items: printRows.map((r: ReviewRow) => ({
                  "القرار": DECISION_LABELS[r.decision] ?? r.decision,
                  "المراجع": r.reviewerName ?? `مستخدم #${r.reviewerId}`,
                  "ملاحظات": r.comments ?? "—",
                  "التاريخ": r.createdAt,
                })),
              })}
            />
          )}
          <Button asChild variant="outline" className="gap-2">
            <Link href="/admin/ai-governance">
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
          {prompt && (
            <GuardedButton
              perm="admin:update"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={prompt.status !== "draft"}
              className="gap-2"
            >
              <Edit className="h-4 w-4" />
              تعديل
            </GuardedButton>
          )}
        </div>
      }
    >
      <PageStateWrapper {...promptQ}>
        {prompt && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                  <Badge className={statusTone(prompt.status)}>{STATUS_LABELS[prompt.status]}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">الإصدار</p>
                  <p className="text-xl font-bold font-mono">v{prompt.version}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">المراجعات</p>
                  <p className="text-xl font-bold">{formatNumber(reviews.length)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">آخر تقييم</p>
                  <p className="text-sm">
                    {evaluations[0] ? formatDateAr(evaluations[0].startedAt) : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  المعلومات الأساسية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">المعرف</p>
                  <p className="font-mono">{prompt.slug}</p>
                </div>
                {prompt.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">الوصف</p>
                    <p>{prompt.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">موجّه النظام (System Prompt)</p>
                  <pre className="whitespace-pre-wrap text-xs bg-surface-subtle p-3 rounded border font-mono">
                    {prompt.systemPrompt}
                  </pre>
                </div>
                {prompt.userTemplate && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">قالب المستخدم</p>
                    <pre className="whitespace-pre-wrap text-xs bg-surface-subtle p-3 rounded border font-mono">
                      {prompt.userTemplate}
                    </pre>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t text-xs">
                  <div>
                    <p className="text-muted-foreground"><Clock className="inline h-3 w-3 me-1" />تاريخ الإنشاء</p>
                    <p>{formatDateAr(prompt.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground"><History className="inline h-3 w-3 me-1" />آخر تحديث</p>
                    <p>{formatDateAr(prompt.updatedAt)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="reviews" dir="rtl">
              <TabsList>
                <TabsTrigger value="reviews">
                  <MessageSquare className="h-4 w-4 me-1" />
                  المراجعات ({reviews.length})
                </TabsTrigger>
                <TabsTrigger value="test-cases">
                  <Beaker className="h-4 w-4 me-1" />
                  حالات الاختبار ({testCases.length})
                </TabsTrigger>
                <TabsTrigger value="evaluations">
                  <FileCheck2 className="h-4 w-4 me-1" />
                  التقييمات ({evaluations.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="reviews" className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    <PageStateWrapper {...reviewsQ}>
                      <DataTable
                        columns={reviewColumns}
                        data={reviews}
                        onSortedDataChange={setPrintRows}
                        emptyMessage="لا توجد مراجعات بعد"
                        noToolbar
                      />
                    </PageStateWrapper>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="test-cases" className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    <PageStateWrapper {...testCasesQ}>
                      <DataTable
                        columns={testCaseColumns}
                        data={testCases}
                        emptyMessage="لا توجد حالات اختبار لهذا الـ slug"
                        noToolbar
                      />
                    </PageStateWrapper>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="evaluations" className="mt-4">
                <Card>
                  <CardContent className="p-0">
                    <PageStateWrapper {...evaluationsQ}>
                      <DataTable
                        columns={evalColumns}
                        data={evaluations}
                        emptyMessage="لم يُجرَ أي تقييم على هذا الموجّه"
                        noToolbar
                      />
                    </PageStateWrapper>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </PageStateWrapper>

      {prompt && id && (
        <EntityEditDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="تعديل الموجّه"
          description="التعديل متاح فقط على المسودة. بعد إرسالها للمراجعة لا يمكن تعديل المحتوى."
          schema={promptEditSchema}
          defaultValues={{
            title: prompt.title,
            description: prompt.description ?? "",
            systemPrompt: prompt.systemPrompt,
            userTemplate: prompt.userTemplate ?? "",
          }}
          endpoint={`/admin/ai-governance/prompts/${id}`}
          invalidateKeys={[["ai-prompt", String(id)], ["ai-governance-prompts"]]}
          onSaved={() => promptQ.refetch()}
        >
          <FormGrid cols={1}>
            <FormTextField name="title" label="العنوان" required />
            <FormTextField name="description" label="الوصف" />
            <FormTextareaField name="systemPrompt" label="موجّه النظام (System Prompt)" rows={8} />
            <FormTextareaField name="userTemplate" label="قالب المستخدم" rows={6} />
          </FormGrid>
        </EntityEditDialog>
      )}
    </PageShell>
  );
}
