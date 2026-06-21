/**
 * طلبات استرداد العمرة — الموجة الثانية #2139 / مهمة #2140 (الشريحة 1).
 *
 * الواجهة الأولى فوق دورة الاسترداد الخلفية الكاملة التي كانت بلا أي
 * صفحة (مصنّفة «خدمة ناقصة» في docs/UNUSED_API_CLASSIFICATION):
 *
 *   GET  /umrah/refund-requests?status=     — القائمة (مع اسم المعتمر/الوكيل)
 *   POST /umrah/refund-requests             — تقديم طلب (معتمر أو وكيل + مبلغ + سبب)
 *   POST /umrah/refund-requests/:id/approve — الموافقة (requested → approved)
 *   POST /umrah/refund-requests/:id/reject  — الرفض مع سبب إلزامي
 *   POST /umrah/refund-requests/:id/pay     — الصرف (مبلغ تسوية + خزينة + مرجع دفع)
 *   POST /umrah/refund-requests/:id/close   — الإغلاق بعد تسجيل إشعار الدائن
 *
 * يحاكي بنية الصفحة الشقيقة penalties.tsx حرفياً (بطاقات مؤشرات +
 * AdvancedFilters + DataTable + نموذج سريع داخلي + حوارات الإجراءات).
 * أزرار الانتقال تُرسم من مرآة آلة الحالات (UMRAH_REFUND_NEXT) والخادم
 * يعيد التحقق على كل POST عبر canTransition.
 */
import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatCurrency, formatUmrahDate } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  PageShell,
  exportToCSV,
} from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  Undo2, Clock, CheckCircle2, Banknote, Plus, XCircle, Lock,
} from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import {
  UMRAH_REFUND_STATUS_OPTIONS,
  UMRAH_REFUND_NEXT,
  umrahRefundStatusLabel,
  UMRAH_REFUND_STATUS_TONE,
} from "@/lib/umrah-refund-status";

interface RefundRow {
  id: number;
  pilgrimId: number | null;
  agentId: number | null;
  pilgrimName: string | null;
  passportNumber: string | null;
  agentName: string | null;
  grossAmount: string | number;
  mofaRetention: string | number;
  settledAmount: string | number | null;
  currency: string;
  reason: string;
  notes: string | null;
  status: string;
  paymentReference: string | null;
  requestedAt: string;
  paidAt: string | null;
}

export default function UmrahRefundRequests() {
  const { data: resp, isLoading, isError, error, refetch } =
    useApiQuery<{ data: RefundRow[] }>(["umrah-refund-requests"], "/umrah/refund-requests");
  const [filters, setFilters] = useFilters();
  const { toast } = useToast();
  const items = resp?.data ?? [];

  // ── الإجراءات (آلة الحالات) ────────────────────────────────────────
  const invalidate: string[][] = [["umrah-refund-requests"]];

  const approveMut = useApiMutation<unknown, { id: number }>(
    (b) => `/umrah/refund-requests/${b.id}/approve`, "POST", invalidate,
    { successMessage: "تمت الموافقة على طلب الاسترداد" },
  );
  const closeMut = useApiMutation<unknown, { id: number }>(
    (b) => `/umrah/refund-requests/${b.id}/close`, "POST", invalidate,
    { successMessage: "أُغلق طلب الاسترداد" },
  );
  const rejectMut = useApiMutation<unknown, { id: number; rejectionReason: string }>(
    (b) => `/umrah/refund-requests/${b.id}/reject`, "POST", invalidate,
    { successMessage: "رُفض طلب الاسترداد" },
  );
  const payMut = useApiMutation<unknown, {
    id: number; settledAmount: number; treasuryId: number; paymentReference: string;
  }>(
    (b) => `/umrah/refund-requests/${b.id}/pay`, "POST", invalidate,
    { successMessage: "صُرف مبلغ الاسترداد" },
  );

  // حوار الرفض — السبب إلزامي في عقد الخادم.
  const [rejectTarget, setRejectTarget] = useState<RefundRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const submitReject = () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast({ variant: "destructive", title: "سبب الرفض مطلوب" });
      return;
    }
    rejectMut.mutate(
      { id: rejectTarget.id, rejectionReason: rejectReason.trim() },
      { onSuccess: () => { setRejectTarget(null); setRejectReason(""); } },
    );
  };

  // حوار الصرف — مبلغ التسوية + حساب الخزينة + مرجع الدفع، الثلاثة إلزامية.
  // الخزائن تُنمذج كحسابات أصول قابلة للترحيل (نفس مصدر معالج الاستيراد).
  const [payTarget, setPayTarget] = useState<RefundRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payTreasury, setPayTreasury] = useState("");
  const [payReference, setPayReference] = useState("");
  const treasuriesQ = useApiQuery<{ data: { id: number; code: string; name: string }[] }>(
    ["finance-accounts-assets-posting"],
    "/finance/accounts?type=asset&postingOnly=true",
  );
  const treasuries = treasuriesQ.data?.data ?? [];
  const openPay = (r: RefundRow) => {
    setPayTarget(r);
    // التسوية الافتراضية = الإجمالي ناقص استقطاع وزارة الخارجية.
    const def = Number(r.grossAmount || 0) - Number(r.mofaRetention || 0);
    setPayAmount(def > 0 ? String(def) : "");
    setPayReference("");
  };
  const submitPay = () => {
    if (!payTarget) return;
    const amt = Number(payAmount);
    const tre = Number(payTreasury);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "أدخل مبلغ تسوية صحيحاً" });
      return;
    }
    if (!Number.isFinite(tre) || tre <= 0) {
      toast({ variant: "destructive", title: "اختر حساب الخزينة" });
      return;
    }
    if (!payReference.trim()) {
      toast({ variant: "destructive", title: "مرجع الدفع مطلوب" });
      return;
    }
    payMut.mutate(
      { id: payTarget.id, settledAmount: amt, treasuryId: tre, paymentReference: payReference.trim() },
      { onSuccess: () => setPayTarget(null) },
    );
  };

  // نموذج التقديم السريع — نفس نمط «غرامة يدوية» في الصفحة الشقيقة:
  // بطاقة متقطعة الإطار تنكشف من شريط الأدوات (المعتمر أو الوكيل + مبلغ + سبب).
  const [createOpen, setCreateOpen] = useState(false);
  const [cPilgrimId, setCPilgrimId] = useState("");
  const [cAgentId, setCAgentId] = useState("");
  const [cAmount, setCAmount] = useState("");
  const [cRetention, setCRetention] = useState("");
  const [cReason, setCReason] = useState("");
  const [cNotes, setCNotes] = useState("");
  const createMut = useApiMutation<unknown, {
    pilgrimId?: number; agentId?: number; grossAmount: number;
    mofaRetention?: number; reason: string; notes?: string;
  }>(
    "/umrah/refund-requests", "POST", invalidate,
    { successMessage: "قُدِّم طلب الاسترداد" },
  );
  const submitCreate = () => {
    const pid = Number(cPilgrimId);
    const aid = Number(cAgentId);
    const amt = Number(cAmount);
    const hasPilgrim = Number.isFinite(pid) && pid > 0;
    const hasAgent = Number.isFinite(aid) && aid > 0;
    if (!hasPilgrim && !hasAgent) {
      toast({ variant: "destructive", title: "أدخل رقم المعتمر أو رقم الوكيل" });
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "أدخل مبلغاً إجمالياً صحيحاً" });
      return;
    }
    if (!cReason.trim()) {
      toast({ variant: "destructive", title: "سبب الاسترداد مطلوب" });
      return;
    }
    const ret = Number(cRetention);
    createMut.mutate(
      {
        pilgrimId: hasPilgrim ? pid : undefined,
        agentId: hasAgent ? aid : undefined,
        grossAmount: amt,
        mofaRetention: Number.isFinite(ret) && ret > 0 ? ret : undefined,
        reason: cReason.trim(),
        notes: cNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCPilgrimId(""); setCAgentId(""); setCAmount("");
          setCRetention(""); setCReason(""); setCNotes("");
          setCreateOpen(false);
        },
      },
    );
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const filteredItems = items.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        r.pilgrimName?.toLowerCase().includes(q) ||
        r.passportNumber?.toLowerCase().includes(q) ||
        r.agentName?.toLowerCase().includes(q) ||
        r.reason?.toLowerCase().includes(q)
      );
    }
    return true;
  });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filteredItems);

  const sum = (rows: RefundRow[], f: (r: RefundRow) => number) =>
    rows.reduce((s, r) => s + f(r), 0);
  const awaiting = items.filter((r) => r.status === "requested");
  const approved = items.filter((r) => r.status === "approved");
  const paidTotal = sum(items.filter((r) => r.status === "paid" || r.status === "closed"),
    (r) => Number(r.settledAmount || 0));

  const kpiCards = [
    { label: "إجمالي الطلبات", value: items.length, icon: Undo2, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "بانتظار الموافقة", value: awaiting.length, icon: Clock, color: "text-status-warning-foreground bg-status-warning-surface" },
    { label: "موافَق عليها بانتظار الصرف", value: approved.length, icon: CheckCircle2, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "إجمالي المصروف (ريال)", value: formatCurrency(paidTotal), icon: Banknote, color: "text-emerald-700 bg-emerald-100" },
  ];

  const can = (r: RefundRow, next: string) =>
    (UMRAH_REFUND_NEXT[r.status] ?? []).includes(next);

  const columns: DataTableColumn<RefundRow>[] = [
    {
      key: "pilgrimName", header: "المستفيد",
      render: (r) => (
        <div>
          <span className="font-medium">{r.pilgrimName ?? r.agentName ?? "—"}</span>
          <span className="block text-[10px] text-muted-foreground">
            {r.pilgrimName ? `معتمر${r.passportNumber ? ` · ${r.passportNumber}` : ""}` : r.agentName ? "وكيل" : ""}
          </span>
        </div>
      ),
    },
    { key: "reason", header: "السبب", render: (r) => <span className="text-xs">{r.reason}</span> },
    {
      key: "grossAmount", header: "الإجمالي (ريال)",
      render: (r) => <span className="font-bold">{formatCurrency(Number(r.grossAmount || 0))}</span>,
    },
    {
      key: "mofaRetention", header: "استقطاع الوزارة",
      render: (r) => Number(r.mofaRetention || 0) > 0
        ? <span className="text-status-error-foreground">{formatCurrency(Number(r.mofaRetention))}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "settledAmount", header: "المصروف",
      render: (r) => r.settledAmount != null
        ? <span className="font-semibold text-emerald-700">{formatCurrency(Number(r.settledAmount))}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "requestedAt", header: "تاريخ التقديم",
      render: (r) => <span className="text-xs">{r.requestedAt ? formatUmrahDate(r.requestedAt) : "—"}</span>,
    },
    {
      key: "status", header: "الحالة",
      render: (r) => (
        <span className={cn(
          "inline-block px-2 py-0.5 rounded border text-xs whitespace-nowrap",
          UMRAH_REFUND_STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-600 border-slate-300",
        )}>
          {umrahRefundStatusLabel(r.status)}
        </span>
      ),
    },
    {
      key: "actions" as keyof RefundRow,
      header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-1">
          {can(r, "approved") && (
            <GuardedButton perm="umrah:update" variant="ghost" size="sm" rateLimitAware
              className="text-emerald-700 gap-1"
              disabled={approveMut.isPending}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); approveMut.mutate({ id: r.id }); }}>
              <CheckCircle2 className="h-3.5 w-3.5" />موافقة
            </GuardedButton>
          )}
          {can(r, "rejected") && (
            <GuardedButton perm="umrah:update" variant="ghost" size="sm"
              className="text-status-error-foreground gap-1"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setRejectTarget(r); }}>
              <XCircle className="h-3.5 w-3.5" />رفض
            </GuardedButton>
          )}
          {can(r, "paid") && (
            <GuardedButton perm="umrah:create" variant="ghost" size="sm"
              className="text-status-info-foreground gap-1"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); openPay(r); }}>
              <Banknote className="h-3.5 w-3.5" />صرف
            </GuardedButton>
          )}
          {can(r, "closed") && (
            <GuardedButton perm="umrah:update" variant="ghost" size="sm" rateLimitAware
              className="text-slate-600 gap-1"
              disabled={closeMut.isPending}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); closeMut.mutate({ id: r.id }); }}>
              <Lock className="h-3.5 w-3.5" />إغلاق
            </GuardedButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="طلبات الاسترداد"
      subtitle="دورة استرداد كاملة: تقديم ← موافقة/رفض ← صرف من الخزينة ← إغلاق — الخادم يتحقق من كل انتقال"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "طلبات الاسترداد" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_refund_requests"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "طلبات الاسترداد", total: printRows.length },
              items: printRows.map((r: any) => ({
                "المستفيد": r.pilgrimName ?? r.agentName ?? "—",
                "السبب": r.reason ?? "—",
                "الإجمالي (ريال)": formatCurrency(Number(r.grossAmount || 0)),
                "استقطاع الوزارة": Number(r.mofaRetention || 0) > 0 ? formatCurrency(Number(r.mofaRetention)) : "—",
                "المصروف": r.settledAmount != null ? formatCurrency(Number(r.settledAmount)) : "—",
                "الحالة": umrahRefundStatusLabel(r.status),
              })),
            })}
          />
          <GuardedButton perm="umrah:create" variant="outline" className="gap-2"
            onClick={() => setCreateOpen((v) => !v)}>
            <Plus className="h-4 w-4" />طلب استرداد
          </GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />

      {createOpen && (
        <Card className="border-dashed">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-semibold">تقديم طلب استرداد</p>
            <p className="text-[11px] text-muted-foreground">
              أدخل رقم المعتمر أو رقم الوكيل (أحدهما إلزامي). استقطاع الوزارة يُخصم من مبلغ التسوية الافتراضي عند الصرف.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-muted-foreground">رقم المعتمر</label>
                <input value={cPilgrimId} onChange={(e) => setCPilgrimId(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">أو رقم الوكيل</label>
                <input value={cAgentId} onChange={(e) => setCAgentId(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">المبلغ الإجمالي (ر.س)</label>
                <input value={cAmount} onChange={(e) => setCAmount(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">استقطاع الوزارة (اختياري)</label>
                <input value={cRetention} onChange={(e) => setCRetention(e.target.value)} dir="ltr" className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">السبب</label>
                <input value={cReason} onChange={(e) => setCReason(e.target.value)} className="w-full h-8 px-2 border rounded" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">ملاحظات (اختياري)</label>
                <input value={cNotes} onChange={(e) => setCNotes(e.target.value)} className="w-full h-8 px-2 border rounded" />
              </div>
            </div>
            <GuardedButton perm="umrah:create" size="sm" rateLimitAware
              onClick={submitCreate} disabled={createMut.isPending}>
              {createMut.isPending ? "جاري التقديم..." : "تقديم الطلب"}
            </GuardedButton>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالمستفيد أو الجواز أو السبب...",
          statuses: [...UMRAH_REFUND_STATUS_OPTIONS],
        }}
        values={filters}
        onChange={setFilters}
        onExportCSV={() =>
          exportToCSV(
            filteredItems.map((r) => ({ ...r, status: umrahRefundStatusLabel(r.status) })),
            [
              { key: "pilgrimName", label: "المعتمر" },
              { key: "agentName", label: "الوكيل" },
              { key: "reason", label: "السبب" },
              { key: "grossAmount", label: "الإجمالي" },
              { key: "mofaRetention", label: "استقطاع الوزارة" },
              { key: "settledAmount", label: "المصروف" },
              { key: "status", label: "الحالة" },
              { key: "requestedAt", label: "تاريخ التقديم" },
            ],
            "طلبات-استرداد-العمرة",
          )
        }
        resultCount={filteredItems.length}
      />

      <DataTable
        columns={columns}
        data={filteredItems}
        onSortedDataChange={setPrintRows}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد طلبات استرداد"
        emptyIcon={<Undo2 className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={20}
      />

      {/* حوار الرفض — سبب إلزامي */}
      <ConfirmActionDialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) setRejectTarget(null); }}
        variant="destructive"
        title="رفض طلب الاسترداد"
        description={`سيُرفض طلب ${rejectTarget?.pilgrimName ?? rejectTarget?.agentName ?? ""} بمبلغ ${formatCurrency(Number(rejectTarget?.grossAmount || 0))}. الرفض حالة نهائية لا رجوع عنها.`}
        confirmLabel={rejectMut.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
        pending={rejectMut.isPending}
        onConfirm={submitReject}
        confirmPerm="umrah:update"
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="refund-reject-reason">سبب الرفض <span className="text-status-error-foreground">*</span></Label>
          <Input id="refund-reject-reason" value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="مثال: لا يستوفي شروط الاسترداد" autoFocus />
        </div>
      </ConfirmActionDialog>

      {/* حوار الصرف — مبلغ + خزينة + مرجع */}
      <ConfirmActionDialog
        open={!!payTarget}
        onOpenChange={(o) => { if (!o) setPayTarget(null); }}
        variant="caution"
        title="صرف مبلغ الاسترداد"
        description={`صرف لـ${payTarget?.pilgrimName ?? payTarget?.agentName ?? ""} — الإجمالي ${formatCurrency(Number(payTarget?.grossAmount || 0))}${Number(payTarget?.mofaRetention || 0) > 0 ? ` (استقطاع الوزارة ${formatCurrency(Number(payTarget?.mofaRetention))})` : ""}.`}
        confirmLabel={payMut.isPending ? "جاري الصرف..." : "تأكيد الصرف"}
        pending={payMut.isPending}
        onConfirm={submitPay}
        confirmPerm="umrah:create"
      >
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="refund-pay-amount">مبلغ التسوية (ر.س) <span className="text-status-error-foreground">*</span></Label>
            <Input id="refund-pay-amount" value={payAmount} dir="ltr"
              onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-pay-treasury">حساب الخزينة <span className="text-status-error-foreground">*</span></Label>
            <select id="refund-pay-treasury" value={payTreasury}
              onChange={(e) => setPayTreasury(e.target.value)}
              className="w-full h-9 px-2 border rounded bg-background text-sm">
              <option value="">— اختر الخزينة —</option>
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="refund-pay-ref">مرجع الدفع <span className="text-status-error-foreground">*</span></Label>
            <Input id="refund-pay-ref" value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="رقم الحوالة / سند الصرف" />
          </div>
        </div>
      </ConfirmActionDialog>
    </PageShell>
  );
}
