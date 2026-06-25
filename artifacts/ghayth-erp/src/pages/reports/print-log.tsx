/**
 * Print Log — full history of every printed document.
 * Filters: branch, user, entityType, date range. Each row exposes:
 *   - re-display (downloads the stored PDF/HTML if retained)
 *   - request reprint (creates a print_reprint_request)
 */

import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Repeat, Printer, AlertTriangle, FileDown } from "lucide-react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";

interface JobRow {
  id: number;
  jobId: string;
  entityType: string;
  entityId: string;
  format: string;
  paperSize: string | null;
  copyNumber: number;
  isReprint: boolean;
  watermark: string | null;
  status: string;
  createdAt: string;
  pdfStorageKey: string | null;
  branchId: number | null;
  branchName: string | null;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
}

export default function PrintLogPage() {
  const { toast } = useToast();
  const [branchId, setBranchId] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  // Status filter — "all" shows everything, "failed" focuses ops on
  // broken prints (the audit called this out as a debug-friendliness
  // gap), "success" hides noise, "pending" shows jobs that crashed
  // mid-flight before writing a final status row.
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 100;

  const { data: branchesData } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = (branchesData?.data ?? branchesData?.items ?? []) as Array<{ id: number; name: string }>;

  // Filters that should reset pagination when changed. We pass them through
  // the qs builder both for the page query and for the CSV download link.
  const filterQs = () => {
    const q = new URLSearchParams();
    if (branchId !== "all") q.set("branchId", branchId);
    if (entityType !== "all") q.set("entityType", entityType);
    if (status !== "all") q.set("status", status);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return q;
  };

  const qs = filterQs();
  qs.set("limit", String(pageSize));
  qs.set("offset", String(page * pageSize));

  const { data, isLoading } = useApiQuery<{ items: JobRow[]; total: number; limit: number; offset: number }>(
    ["print-jobs", qs.toString()],
    `/print/jobs?${qs.toString()}`
  );

  const total = data?.total ?? 0;

  // Reset to page 0 whenever a filter changes — otherwise users land on an
  // empty page when the new filter result has fewer rows than the offset.
  const onFilter = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(0);
  };

  function exportCsv() {
    const q = filterQs();
    // apiFetch isn't used here because the CSV endpoint streams a file —
    // we want the browser's native download flow, not a fetch+blob.
    window.open(`/api/print/jobs.csv?${q.toString()}`, "_blank");
  }

  async function reprint(j: JobRow) {
    const reason = prompt("سبب طلب إعادة الطباعة:");
    if (!reason) return;
    try {
      await apiFetch(`/print/reprint-requests`, {
        method: "POST",
        body: JSON.stringify({ entityType: j.entityType, entityId: j.entityId, reason }),
      });
      toast({ title: "تم إرسال طلب إعادة الطباعة", description: "بانتظار موافقة المدير." });
    } catch (err: any) {
      toast({ title: "فشل الطلب", description: err.message, variant: "destructive" });
    }
  }

  async function download(j: JobRow) {
    if (!j.pdfStorageKey) {
      toast({
        title: "النسخة غير محفوظة",
        description: "هذه الطباعة لم يتم حفظ نسخة منها (تم بثها مباشرة).",
        variant: "destructive",
      });
      return;
    }
    window.open(`/api/print/jobs/${j.jobId}/download`, "_blank");
  }

  // Columns mirror the original raw table exactly — same order, same headers,
  // same per-cell rendering (date locale, mono document cell, copy-number
  // warning, status color, action buttons). Sorting is client-side over the
  // current server page only; server-side pagination stays the source of truth.
  const jobColumns: DataTableColumn<JobRow>[] = [
    {
      key: "createdAt",
      header: "التاريخ",
      className: "whitespace-nowrap",
      render: (j) => new Date(j.createdAt).toLocaleString("ar-SA"),
    },
    {
      key: "user",
      header: "المستخدم",
      sortable: false,
      render: (j) => j.userName ?? j.userEmail ?? `#${j.userId ?? "—"}`,
    },
    {
      key: "branchName",
      header: "الفرع",
      render: (j) => j.branchName ?? "—",
    },
    {
      key: "entityType",
      header: "الوثيقة",
      className: "font-mono text-xs",
      render: (j) => (
        <>
          {j.entityType} <span className="text-muted-foreground">#{j.entityId}</span>
        </>
      ),
    },
    { key: "format", header: "الصيغة" },
    {
      key: "copyNumber",
      header: "النسخة",
      render: (j) =>
        j.copyNumber > 1 ? (
          <span className="inline-flex items-center gap-1 text-status-error-foreground">
            <AlertTriangle className="h-3 w-3" /> {j.copyNumber}
          </span>
        ) : (
          j.copyNumber
        ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (j) => (
        <span
          className={
            j.status === "done"
              ? "text-status-success-foreground"
              : j.status === "failed"
                ? "text-status-error-foreground"
                : "text-muted-foreground"
          }
        >
          {j.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      className: "whitespace-nowrap",
      render: (j) => (
        <>
          {j.pdfStorageKey ? (
            // Direct anchor — GET /api/print/jobs/:jobId/download
            // streams the stored PDF. Anchor (not window.open)
            // keeps the URL visible to the wiring audit.
            <a
              href={`/api/print/jobs/${j.jobId}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-accent"
              title="إعادة عرض"
            >
              <Download className="h-3 w-3" />
            </a>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => download(j)}
              title="إعادة عرض"
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => reprint(j)} title="طلب إعادة طباعة">
            <Repeat className="h-3 w-3" />
          </Button>
        </>
      ),
    },
  ];

  return (
    <PageShell
      title="سجل المطبوعات"
      subtitle="كل طباعة أو إعادة طباعة في النظام، مع الفرع والمستخدم ورقم النسخة."
      breadcrumbs={[{ label: "التقارير" }, { label: "سجل المطبوعات" }]}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المرشّحات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label>الحالة</Label>
              <Select value={status} onValueChange={onFilter(setStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="success">ناجحة فقط</SelectItem>
                  <SelectItem value="failed">فشلت فقط</SelectItem>
                  <SelectItem value="failed,pending">فشلت + معلقة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفرع</Label>
              <Select value={branchId} onValueChange={onFilter(setBranchId)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الكيان</Label>
              {/* Free-text input — the engine supports 100+ entityTypes now,
                  a dropdown of every one is unusable. Ops just type the slug
                  they care about (e.g. "invoice", "tenant", "umrah_pilgrim").
                  Empty / "all" disables the filter. */}
              <Input
                placeholder="مثال: invoice، tenant، umrah_pilgrim"
                value={entityType === "all" ? "" : entityType}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onFilter(setEntityType)(v === "" ? "all" : v);
                }}
              />
            </div>
            <div>
              <Label>من تاريخ</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> المطبوعات
              {data && (
                <span className="text-xs text-muted-foreground">({total.toLocaleString("en-US")})</span>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!total}>
              <FileDown className="h-3 w-3 ml-1" /> تصدير CSV
            </Button>
            <PrintButton
              entityType="report_print_log"
              entityId={`${from || "all"}..${to || "all"}`}
              variant="outline"
              size="sm"
              label="طباعة السجل"
              payload={{
                entity: {
                  title: "سجل الطباعة",
                  from: from || "—",
                  to: to || "—",
                  branchFilter: branchId === "all" ? "كل الفروع" : branchId,
                  statusFilter: status === "all" ? "الكل" : status,
                  entityTypeFilter: entityType === "all" ? "الكل" : entityType,
                  total,
                },
                items: (data?.items ?? []).map((j: JobRow) => ({
                  "رقم الوظيفة": j.jobId,
                  "نوع الكيان": j.entityType,
                  "المعرف": j.entityId,
                  "الصيغة": j.format,
                  "نسخة": j.copyNumber,
                  "نسخة مكررة؟": j.isReprint ? "نعم" : "",
                  "الفرع": j.branchName ?? "",
                  "المستخدم": j.userName ?? j.userEmail ?? "",
                  "الحالة": j.status,
                  "التاريخ": j.createdAt,
                })),
              }}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={jobColumns}
            data={data?.items ?? []}
            isLoading={isLoading}
            noToolbar
            pageSize={pageSize}
            total={total}
            page={page + 1}
            onPageChange={(p) => setPage(p - 1)}
            emptyMessage="لا توجد مطبوعات تطابق الفلاتر."
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
