/**
 * Print Diagnostics — admin page that surfaces the state of the Print
 * Platform for the current company. Built because users were reporting
 * "ما يطبع شي / صفحة بيضاء" and the actual root cause was usually one
 * of: a stale custom template assigned, an empty htmlContent, a
 * misconfigured branch with no letterhead. This page makes all of that
 * inspectable and resettable from one screen.
 *
 *   • Lists every template owned by the company + every assignment
 *   • Flags suspicious rows (empty htmlContent, missing branding…)
 *   • "إعادة ضبط" button per entityType — removes the company's
 *     custom assignment for that entity, falling back to the seeded
 *     preset / universal template (the safe default)
 *   • Recent /print/render audit-log queue with timing
 *   • A "اختبر الطباعة" probe — POST /print/render for an entity,
 *     show byte count + visible-text size so the user can see if the
 *     server-side fallback fired
 */

import { useState, useMemo } from "react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiQuery, apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useQueryClient } from "@tanstack/react-query";
import { renderDocument, listJobs, listTemplates, type PrintJobRow, type PrintTemplateRow } from "@/lib/print-client";
import { AlertTriangle, CheckCircle, RotateCw, PlayCircle, ScrollText } from "lucide-react";

interface TemplateRowFull extends PrintTemplateRow {
  htmlContent?: string | null;
  cssOverrides?: string | null;
}

interface AssignmentRow {
  id: number;
  entityType: string;
  branchId: number | null;
  templateId: number;
  templateName: string;
  isDefault: boolean;
}

interface DiagnosticEntry {
  entityType: string;
  entityId: string;
  status: "ok" | "blank" | "fail";
  visibleChars: number;
  bytes: number;
  jobId: string | null;
  errorMessage?: string;
}

export default function PrintDiagnosticsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [probeEntity, setProbeEntity] = useState("invoice");
  const [probeId, setProbeId] = useState("1");
  const [probing, setProbing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);

  // Templates the company has — DB-stored ones only; seeded presets and
  // universal-fallback are in-memory and not visible here.
  const templates = useApiQuery<{ items: TemplateRowFull[] }>(
    ["print-diag-templates"],
    `/print/templates`,
  );

  // Active assignments per (entityType, branch). These are what
  // resolveTemplate picks first — if any of them point at a corrupt
  // template, the user gets a bad print.
  const assignments = useApiQuery<{ items: AssignmentRow[] }>(
    ["print-diag-assignments"],
    `/print/assignments`,
  );

  // Recent print jobs — surfaces failed renders + timing patterns.
  const jobs = useApiQuery<{ items: PrintJobRow[] }>(
    ["print-diag-jobs"],
    `/print/jobs?limit=30`,
  );

  // Diagnostic queue probe — GET /print/queue/0 returns the print
  // queue's backend / depth / failure rate metadata even when no
  // specific job is targeted. Useful for the diagnostics page to
  // show the queue state at a glance.
  const queueProbe = useApiQuery<any>(
    ["print-queue-probe"],
    `/print/queue/0`,
  );

  const tplItems = templates.data?.items ?? [];
  const asnItems = assignments.data?.items ?? [];
  const jobItems = jobs.data?.items ?? [];
  const queueMeta = queueProbe.data ?? null;

  // Flag suspicious templates. Looks for tell-tale signs of "this will
  // render blank" — empty htmlContent, tokens with no matching data
  // shape, etc. Reported as warnings, not errors; the engine's
  // post-substitution guard handles them at runtime regardless.
  const flaggedTemplates = useMemo(() => {
    return tplItems.filter((t) => {
      const html = t.htmlContent ?? "";
      if (html.trim().length === 0) return true;
      // strip tags + spaces — if nothing's left, the template renders blank
      const visible = html.replace(/<[^>]+>/g, "").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
      return visible.length < 10;
    });
  }, [tplItems]);

  async function resetAssignment(entityType: string, branchId: number | null) {
    if (!confirm(`إعادة ضبط القالب الافتراضي لـ ${entityType}؟\nسيتم حذف الإسناد الحالي والرجوع إلى القالب الجاهز (universal).`)) return;
    try {
      const target = asnItems.find((a) => a.entityType === entityType && a.branchId === branchId);
      if (!target) {
        toast({ title: "لا يوجد إسناد لإعادة ضبطه", variant: "destructive" });
        return;
      }
      await apiFetch(`/print/assignments/${target.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["print-diag-assignments"] });
      toast({ title: "تم إعادة الضبط", description: "ستستخدم الطباعة القالب الجاهز الآن." });
    } catch (err) {
      toast({ title: "فشل إعادة الضبط", description: (err as ApiError)?.message ?? "—", variant: "destructive" });
    }
  }

  async function runProbe() {
    setProbing(true);
    try {
      const resp = await renderDocument({ entityType: probeEntity, entityId: probeId, format: "a4" });
      const html = Buffer.from(resp.base64, "base64").toString("utf8");
      const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? "";
      const visible = body
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<div\s+class="watermark"[\s\S]*?<\/div>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      setDiagnostics((d) => [
        {
          entityType: probeEntity,
          entityId: probeId,
          status: visible.length < 50 ? "blank" : "ok",
          visibleChars: visible.length,
          bytes: html.length,
          jobId: resp.jobId,
        },
        ...d.slice(0, 9),
      ]);
    } catch (err) {
      const e = err as ApiError;
      setDiagnostics((d) => [
        {
          entityType: probeEntity,
          entityId: probeId,
          status: "fail",
          visibleChars: 0,
          bytes: 0,
          jobId: null,
          errorMessage: e?.message ?? "خطأ غير معروف",
        },
        ...d.slice(0, 9),
      ]);
    } finally {
      setProbing(false);
    }
  }

  const templateCols: DataTableColumn<TemplateRowFull>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "الاسم" },
    { key: "entityType", header: "النوع", render: (r) => <code className="text-xs">{r.entityType}</code> },
    { key: "branchId", header: "الفرع", render: (r) => (r.branchId == null ? "(كل الفروع)" : `#${r.branchId}`) },
    {
      key: "htmlContent",
      header: "حالة المحتوى",
      render: (r) => {
        const len = (r.htmlContent ?? "").trim().length;
        if (len === 0) return <Badge variant="destructive">فاضي ⚠️</Badge>;
        if (len < 50) return <Badge variant="destructive">قصير جداً</Badge>;
        return <Badge variant="outline">{len} حرف</Badge>;
      },
    },
  ];

  const assignmentCols: DataTableColumn<AssignmentRow>[] = [
    { key: "entityType", header: "النوع", render: (r) => <code className="text-xs">{r.entityType}</code> },
    { key: "branchId", header: "الفرع", render: (r) => (r.branchId == null ? "(كل الفروع)" : `#${r.branchId}`) },
    { key: "templateName", header: "القالب" },
    { key: "isDefault", header: "افتراضي", render: (r) => (r.isDefault ? "نعم" : "لا") },
    {
      key: "id",
      header: "إجراء",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => resetAssignment(r.entityType, r.branchId)} className="gap-1">
          <RotateCw className="h-3 w-3" />
          إعادة ضبط
        </Button>
      ),
    },
  ];

  const jobsCols: DataTableColumn<PrintJobRow>[] = [
    { key: "entityType", header: "النوع" },
    { key: "entityId", header: "السجل" },
    { key: "format", header: "النسق" },
    { key: "copyNumber", header: "نسخة" },
    {
      key: "status",
      header: "الحالة",
      render: (r) =>
        r.status === "done" ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3" /> {r.status}
          </Badge>
        ) : (
          <Badge variant="destructive">{r.status}</Badge>
        ),
    },
    {
      key: "createdAt",
      header: "وقت",
      render: (r) => new Date(r.createdAt).toLocaleString("ar-SA"),
    },
  ];

  // POST /print/jobs/prune — admin maintenance: removes old print-job
  // rows (older than the configurable retention window) to keep the
  // audit table bounded. The retention window comes from an inline
  // Input + GuardedButton next to the action — no native prompt.
  const [pruneDays, setPruneDays] = useState("90");
  const handlePruneJobs = async () => {
    const n = Number(pruneDays);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ variant: "destructive", title: "أدخل عدد أيام صحيحاً" });
      return;
    }
    try {
      await apiFetch("/print/jobs/prune", {
        method: "POST",
        body: JSON.stringify({ olderThanDays: n }),
      });
      toast({ title: "تم تنظيف السجلات" });
      jobs.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التنظيف", description: err?.message });
    }
  };

  return (
    <PageShell
      title="تشخيص الطباعة"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "تشخيص الطباعة" },
      ]}
      subtitle="القوالب النشطة، الإسنادات، والمحاولات الأخيرة — مع زر إعادة ضبط لكل إسناد فاسد"
      loading={templates.isLoading || assignments.isLoading || jobs.isLoading}
      actions={
        <div className="flex items-center gap-1">
          <Label className="text-xs whitespace-nowrap">احذف الأقدم من (أيام):</Label>
          <Input
            type="number"
            value={pruneDays}
            onChange={(e) => setPruneDays(e.target.value)}
            className="h-7 w-16 text-xs"
            inputMode="numeric"
          />
          <GuardedButton perm="admin:update" size="sm" variant="outline" rateLimitAware onClick={handlePruneJobs}>
            تنظيف السجلات
          </GuardedButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <ScrollText className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">قوالب الشركة</p>
              <p className="text-2xl font-bold">{tplItems.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className={`h-8 w-8 ${flaggedTemplates.length > 0 ? "text-amber-500" : "text-slate-300"}`} />
            <div>
              <p className="text-xs text-muted-foreground">قوالب فاسدة</p>
              <p className="text-2xl font-bold">{flaggedTemplates.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">طباعات (آخر 30)</p>
              <p className="text-2xl font-bold">{jobItems.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {queueMeta && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">حالة طابور الطباعة</CardTitle>
          </CardHeader>
          <CardContent className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(queueMeta as Record<string, any>).slice(0, 8).map(([k, v]) => (
              <div key={k} className="flex justify-between p-1 border rounded">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono font-semibold">
                  {typeof v === "object" ? Object.keys(v ?? {}).length : String(v)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            اختبار طباعة فوري
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">نوع المستند</label>
              <Input value={probeEntity} onChange={(e) => setProbeEntity(e.target.value)} className="w-44" placeholder="invoice" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">معرّف السجل</label>
              <Input value={probeId} onChange={(e) => setProbeId(e.target.value)} className="w-32" placeholder="1" />
            </div>
            <Button onClick={runProbe} disabled={probing} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              {probing ? "جاري…" : "تشغيل"}
            </Button>
          </div>
          {diagnostics.length > 0 && (
            <div className="border rounded p-2 text-xs space-y-1 max-h-60 overflow-y-auto">
              {diagnostics.map((d, i) => (
                <div key={i} className="flex items-center gap-3 py-1 border-b last:border-0">
                  {d.status === "ok" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                  {d.status === "blank" && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  {d.status === "fail" && <AlertTriangle className="h-4 w-4 text-rose-500" />}
                  <code className="flex-shrink-0">{d.entityType}/{d.entityId}</code>
                  {d.status !== "fail" ? (
                    <span className="text-muted-foreground">
                      {d.bytes} بايت · {d.visibleChars} حرف ظاهر · jobId={d.jobId?.slice(0, 8) ?? "—"}…
                    </span>
                  ) : (
                    <span className="text-rose-600">{d.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {flaggedTemplates.length > 0 && (
        <Card className="mb-4 border-status-warning-surface bg-status-warning-surface/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-status-warning-foreground">
              <AlertTriangle className="h-4 w-4" />
              قوالب يُحتمل أن تطبع صفحة فاضية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-2">
              هذه القوالب لها htmlContent فارغ أو قصير جداً. الـ Print Engine سيتجاوزها تلقائياً للـ universal preset (Phase 1113)، لكن الأفضل تعديلها أو حذفها.
            </p>
            <DataTable<TemplateRowFull> columns={templateCols} data={flaggedTemplates} rowKey={(r) => String(r.id)} />
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الإسنادات النشطة (Branch → Template)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            هذه القوالب تُستخدم تلقائياً عند الطباعة. اضغط "إعادة ضبط" لحذف الإسناد والرجوع للقالب الجاهز.
          </p>
          <DataTable<AssignmentRow>
            columns={assignmentCols}
            data={asnItems}
            rowKey={(r) => String(r.id)}
            emptyMessage="لا توجد إسنادات — الطباعة تستخدم القوالب الجاهزة"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">آخر 30 محاولة طباعة</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable<PrintJobRow>
            columns={jobsCols}
            data={jobItems}
            rowKey={(r) => String(r.id)}
            emptyMessage="لم تُسجل أي طباعة بعد"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
