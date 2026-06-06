// Admin → Outbox monitor (P2.3 of the workflow plan).
//
// Backed by GET /admin/observability/outbox + /outbox/stats + retry / cancel.
// Pairs with the worker.ts /outbox-stats endpoint for a fast count-by-status
// snapshot; this UI gives an admin the paginated list + per-row actions to
// triage stuck rows.
//
// Mounts under /admin (level 90 + module=admin) — same gate as the rest of
// the observability surface.

import { useState } from "react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PageStateWrapper } from "@/components/shared/page-state";
import { formatDateAr } from "@/lib/formatters";
import { Inbox, RotateCcw, XCircle, AlertOctagon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface OutboxRow {
  id: string;
  eventName: string;
  status: "pending" | "failed_retry" | "processed" | "dead";
  attempts: number;
  createdAt: string;
  processedAt: string | null;
  lastError: string | null;
  idempotencyKey: string | null;
  companyId: number | null;
}

interface OutboxStats {
  pending: number;
  failedRetry: number;
  processed: number;
  dead: number;
  oldestPendingSec: number | null;
}

const STATUS_LABEL: Record<OutboxRow["status"], string> = {
  pending: "في الانتظار",
  failed_retry: "فشل — إعادة محاولة",
  processed: "تمت المعالجة",
  dead: "ميت (لم يُعالَج)",
};

const STATUS_BADGE_VARIANT: Record<OutboxRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  failed_retry: "outline",
  processed: "default",
  dead: "destructive",
};

export default function AdminOutboxMonitor() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventNameFilter, setEventNameFilter] = useState("");
  const [pendingAction, setPendingAction] = useState<{ row: OutboxRow; kind: "retry" | "cancel" } | null>(null);

  const qc = useQueryClient();
  const { toast } = useToast();

  const statsQuery = useApiQuery<OutboxStats>(
    ["admin-outbox-stats"],
    "/admin/observability/outbox/stats",
  );

  // Build the list URL with current filters.
  const listUrl = (() => {
    const qs: string[] = [];
    if (statusFilter !== "all") qs.push(`status=${encodeURIComponent(statusFilter)}`);
    if (eventNameFilter) qs.push(`eventName=${encodeURIComponent(eventNameFilter)}`);
    return `/admin/observability/outbox${qs.length ? `?${qs.join("&")}` : ""}`;
  })();

  const listQuery = useApiQuery<{ data: OutboxRow[]; total: number }>(
    ["admin-outbox-list", statusFilter, eventNameFilter],
    listUrl,
  );

  async function runAction(row: OutboxRow, kind: "retry" | "cancel") {
    try {
      await apiFetch(`/admin/observability/outbox/${row.id}/${kind}`, { method: "POST" });
      toast({
        title: kind === "retry" ? "تمت إعادة الإرسال" : "تم الإلغاء",
        description: `الحدث ${row.eventName} (#${row.id})`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-outbox-list"] }),
        qc.invalidateQueries({ queryKey: ["admin-outbox-stats"] }),
      ]);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: kind === "retry" ? "فشل إعادة الإرسال" : "فشل الإلغاء",
        description: err?.message ?? "حاول مرة أخرى",
      });
    } finally {
      setPendingAction(null);
    }
  }

  const columns: DataTableColumn<OutboxRow>[] = [
    {
      key: "status",
      header: "الحالة",
      render: (row: OutboxRow) => (
        <Badge variant={STATUS_BADGE_VARIANT[row.status]} className="font-mono text-[10px]">
          {STATUS_LABEL[row.status]}
        </Badge>
      ),
    },
    { key: "id", header: "#", render: (row: OutboxRow) => <span className="font-mono text-xs">{row.id}</span> },
    {
      key: "eventName",
      header: "الحدث",
      render: (row: OutboxRow) => <span className="font-mono text-xs">{row.eventName}</span>,
    },
    {
      key: "attempts",
      header: "المحاولات",
      render: (row: OutboxRow) => (
        <span className={row.attempts >= 3 ? "text-status-warning-foreground font-semibold" : ""}>
          {row.attempts}
        </span>
      ),
    },
    {
      key: "idempotencyKey",
      header: "Idempotency",
      render: (row: OutboxRow) =>
        row.idempotencyKey ? (
          <span className="font-mono text-[10px] text-muted-foreground">{row.idempotencyKey}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "createdAt",
      header: "أُنشئ",
      render: (row: OutboxRow) => <span className="text-xs">{formatDateAr(row.createdAt)}</span>,
    },
    {
      key: "lastError",
      header: "آخر خطأ",
      render: (row: OutboxRow) =>
        row.lastError ? (
          <span title={row.lastError} className="text-[10px] text-status-error-foreground line-clamp-2 max-w-xs block">
            {row.lastError.split("\n")[0]}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (row: OutboxRow) => (
        <div className="flex items-center gap-1">
          {(row.status === "dead" || row.status === "failed_retry") && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => setPendingAction({ row, kind: "retry" })}
            >
              <RotateCcw className="h-3 w-3" />
              إعادة
            </Button>
          )}
          {(row.status === "pending" || row.status === "failed_retry") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs text-status-error-foreground"
              onClick={() => setPendingAction({ row, kind: "cancel" })}
            >
              <XCircle className="h-3 w-3" />
              إلغاء
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="مراقب صندوق الأحداث"
      subtitle="event_outbox — الأحداث المعلّقة، الفاشلة، والميتة + إعادة محاولة / إلغاء"
    >
      <PageStateWrapper isLoading={statsQuery.isLoading} error={statsQuery.error}>
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatCard label="في الانتظار" value={statsQuery.data?.pending ?? 0} icon={Clock} tone="info" />
          <StatCard label="فشل (إعادة)" value={statsQuery.data?.failedRetry ?? 0} icon={AlertTriangle} tone="warning" />
          <StatCard label="ميت" value={statsQuery.data?.dead ?? 0} icon={AlertOctagon} tone="error" />
          <StatCard label="تمت المعالجة" value={statsQuery.data?.processed ?? 0} icon={CheckCircle2} tone="success" />
          <StatCard
            label="أقدم في الانتظار"
            value={
              statsQuery.data?.oldestPendingSec != null
                ? `${Math.floor(statsQuery.data.oldestPendingSec / 60)} د`
                : "—"
            }
            icon={Inbox}
            tone="muted"
          />
        </div>

        {/* Filters */}
        <Card className="mb-3">
          <CardContent className="p-3 grid gap-2 sm:grid-cols-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="pending">في الانتظار</SelectItem>
                <SelectItem value="failed_retry">فشل — إعادة محاولة</SelectItem>
                <SelectItem value="dead">ميت</SelectItem>
                <SelectItem value="processed">تمت المعالجة</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="text"
              value={eventNameFilter}
              onChange={(e) => setEventNameFilter(e.target.value)}
              placeholder="فلتر بنوع الحدث (مثلاً invoice.created)"
              className="px-3 py-2 text-sm border rounded-md sm:col-span-2"
              dir="ltr"
            />
          </CardContent>
        </Card>

        <PageStateWrapper isLoading={listQuery.isLoading} error={listQuery.error}>
          <DataTable
            data={listQuery.data?.data ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            noToolbar
          />
        </PageStateWrapper>
      </PageStateWrapper>

      {/* Confirm dialog for retry/cancel */}
      <AlertDialog open={!!pendingAction} onOpenChange={(o) => !o && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === "retry" ? "إعادة إرسال الحدث" : "إلغاء الحدث"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {pendingAction?.kind === "retry" ? (
                <>
                  سيُعاد الحدث <span className="font-mono">{pendingAction?.row.eventName}</span> (#{pendingAction?.row.id})
                  إلى الحالة <Badge variant="secondary" className="text-[10px] mx-1">pending</Badge>
                  مع تصفير عدّاد المحاولات. الـrelay سيلتقطه في الجولة التالية.
                </>
              ) : (
                <>
                  سيُعلَّم الحدث <span className="font-mono">{pendingAction?.row.eventName}</span> (#{pendingAction?.row.id})
                  بالحالة <Badge variant="destructive" className="text-[10px] mx-1">dead</Badge>
                  ولن يُعاد إرساله. سيُحذف لاحقاً عند تنظيف الـoutbox.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction && runAction(pendingAction.row, pendingAction.kind)}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "info" | "warning" | "error" | "success" | "muted";
}) {
  const toneClass: Record<typeof tone, string> = {
    info: "bg-status-info-surface text-status-info-foreground",
    warning: "bg-status-warning-surface text-status-warning-foreground",
    error: "bg-status-error-surface text-status-error-foreground",
    success: "bg-status-success-surface text-status-success-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className={toneClass[tone]}>
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] opacity-70">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
        </div>
        <Icon className="h-6 w-6 opacity-60" />
      </CardContent>
    </Card>
  );
}
