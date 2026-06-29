import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell, DataTable, type DataTableColumn, AdvancedFilters, useFilters, applyFilters } from "@workspace/ui-core";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Truck } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * Finance Intake Center (#1715). The single screen where the accountant
 * receives operational hand-offs that must become finance records. v1
 * surfaces the transport billing candidates (#1733 / #1750) — facts the
 * transport module produced on cargo delivery — and lets the accountant
 * MATERIALISE them into a journal entry or REJECT them. Transport never
 * touches the GL; this center is the «المحاسب يتصرّف ماليًا» step.
 */

type Status = "pending" | "materialized" | "rejected";

interface Candidate {
  id: number;
  sourceType: string;
  costBearer?: string | null; // البند ٤ ج-٥ — اختيار المُكمِل (افتراض حوار المادْيَلة).
  sourceRef: string | null;
  customerName: string | null;
  serviceType: string | null;
  serviceDate: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  vehiclePlate: string | null;
  driverName: string | null;
  quantity: number | null;
  unitOfMeasure: string | null;
  operationalStatus: string | null;
  suggestedRevenue: number | null;
  suggestedCost: number | null;
  status: Status;
  materializedJournalEntryId: number | null;
  rejectionReason: string | null;
  createdAt: string | null;
}
interface ListResp { data: Candidate[]; total: number; }

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: "pending", label: "بانتظار المعالجة" },
  { value: "materialized", label: "مُرحَّلة" },
  { value: "rejected", label: "مرفوضة" },
];

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  pending: { label: "بانتظار", cls: "bg-status-warning-surface text-status-warning-foreground" },
  materialized: { label: "مُرحَّلة", cls: "bg-status-success-surface text-status-success-foreground" },
  rejected: { label: "مرفوضة", cls: "bg-status-error-surface text-status-error-foreground" },
};

export default function FinanceIntakeCenter() {
  const { toast } = useToast();
  const [filters, setFilters] = useFilters({ status: "pending" });
  const [dialog, setDialog] = useState<{ mode: "materialize" | "reject"; row: Candidate } | null>(null);
  const [revenue, setRevenue] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  // البند ٤ شريحة ٢ — مَن يتحمّل صيانة المركبة (المحاسب يقرّره عند المادْيَلة).
  const [costBearer, setCostBearer] = useState("company");

  const { data, isLoading, isError, refetch } = useApiQuery<ListResp>(
    ["transport-billing-candidates", filters.status],
    `/finance/transport-billing-candidates${filters.status ? `?status=${filters.status}` : ""}`,
  );

  const materializeMut = useApiMutation<any, { id: number; freightRevenue?: number; freightCost?: number; costBearer?: string }>(
    (b) => `/finance/transport-billing-candidates/${b.id}/materialize`,
    "POST",
    [["transport-billing-candidates", status]],
  );
  const rejectMut = useApiMutation<any, { id: number; reason: string }>(
    (b) => `/finance/transport-billing-candidates/${b.id}/reject`,
    "POST",
    [["transport-billing-candidates", status]],
  );

  const openMaterialize = (row: Candidate) => {
    setRevenue(row.suggestedRevenue != null ? String(row.suggestedRevenue) : "");
    setCost(row.suggestedCost != null ? String(row.suggestedCost) : "");
    setCostBearer(row.costBearer ?? "company"); // افتراض من اختيار المُكمِل (ج-٥)، يبقى تجاوز المحاسب.
    setDialog({ mode: "materialize", row });
  };
  const openReject = (row: Candidate) => { setReason(""); setDialog({ mode: "reject", row }); };
  const closeDialog = () => setDialog(null);

  const submitMaterialize = async () => {
    if (!dialog) return;
    try {
      await materializeMut.mutateAsync({
        id: dialog.row.id,
        freightRevenue: revenue !== "" ? Number(revenue) : undefined,
        freightCost: cost !== "" ? Number(cost) : undefined,
        // costBearer يخصّ ترشيح الصيانة فقط (الخلفية تتجاهله لغيره) — مبدأ إبراهيم ١.
        ...(dialog.row.sourceType === "maintenance" ? { costBearer } : {}),
      });
      toast({ title: "تم ترحيل العملية وإنشاء القيد" });
      closeDialog();
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الترحيل", description: err?.fix ?? getErrorMessage(err) });
    }
  };
  const submitReject = async () => {
    if (!dialog || !reason.trim()) { toast({ variant: "destructive", title: "سبب الرفض مطلوب" }); return; }
    try {
      await rejectMut.mutateAsync({ id: dialog.row.id, reason: reason.trim() });
      toast({ title: "تم رفض العملية" });
      closeDialog();
      refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الرفض", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];
  const filtered = applyFilters(rows, filters, {
    searchFields: ["customerName", "serviceType", "sourceRef"],
  });

  const columns: DataTableColumn<Candidate>[] = [
    { key: "customer", header: "العميل", render: (r) => <span className="font-medium">{r.customerName ?? "—"}</span> },
    { key: "service", header: "الخدمة", render: (r) => <span className="text-xs">{r.serviceType ?? r.sourceType}</span> },
    { key: "route", header: "المسار", render: (r) => <span className="text-xs text-muted-foreground">{[r.routeFrom, r.routeTo].filter(Boolean).join(" → ") || "—"}</span> },
    { key: "vehicle", header: "المركبة/السائق", render: (r) => <span className="text-xs">{[r.vehiclePlate, r.driverName].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "date", header: "التاريخ", render: (r) => <span className="text-xs text-muted-foreground">{r.serviceDate ? formatDateAr(r.serviceDate) : "—"}</span> },
    { key: "revenue", header: "إيراد مقترح", render: (r) => <span className="tabular-nums text-status-success-foreground">{r.suggestedRevenue != null ? formatCurrency(Number(r.suggestedRevenue)) : "—"}</span> },
    { key: "cost", header: "تكلفة مقترحة", render: (r) => <span className="tabular-nums text-status-error-foreground">{r.suggestedCost != null ? formatCurrency(Number(r.suggestedCost)) : "—"}</span> },
    { key: "status", header: "الحالة", render: (r) => <Badge className={`${STATUS_BADGE[r.status]?.cls ?? ""} text-xs`}>{STATUS_BADGE[r.status]?.label ?? r.status}</Badge> },
    {
      key: "actions", header: "",
      render: (r) => r.status === "pending" ? (
        <div className="flex items-center gap-1 justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openMaterialize(r)} rateLimitAware>
            <CheckCircle2 className="h-3.5 w-3.5 me-1" />ترحيل
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-status-error-foreground" onClick={() => openReject(r)} rateLimitAware>
            <XCircle className="h-3.5 w-3.5 me-1" />رفض
          </Button>
        </div>
      ) : r.status === "materialized" && r.materializedJournalEntryId ? (
        <span className="text-xs text-muted-foreground">قيد #{r.materializedJournalEntryId}</span>
      ) : r.status === "rejected" ? (
        <span className="text-xs text-muted-foreground" title={r.rejectionReason ?? ""}>{r.rejectionReason ? `سبب: ${r.rejectionReason.slice(0, 30)}` : "مرفوضة"}</span>
      ) : null,
    },
  ];

  return (
    <PageShell
      title="مركز التلقّي المالي"
      subtitle="الوارد التشغيلي الذي ينتظر تحويله إلى قيود — النقل يقود التشغيل، والمحاسب يتصرّف ماليًا (#1715 / #1733)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "مركز التلقّي" }]}
    >
      <FinanceTabsNav />
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالعميل أو الخدمة أو المرجع...",
          statuses: STATUS_TABS.map((t) => ({ value: t.value, label: t.label })),
          showDateRange: false,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
            <Truck className="h-8 w-8" />
            <div>لا يوجد وارد في هذه الحالة.</div>
          </CardContent>
        </Card>
      ) : (
        <DataTable columns={columns} data={filtered} emptyMessage="—" pageSize={50} noToolbar />
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          {dialog?.mode === "materialize" && (
            <>
              <DialogHeader><DialogTitle>ترحيل العملية إلى قيد</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  {dialog.row.customerName ?? "—"} — {[dialog.row.routeFrom, dialog.row.routeTo].filter(Boolean).join(" → ")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">الإيراد</Label>
                    <Input dir="ltr" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <Label className="text-xs">التكلفة</Label>
                    <Input dir="ltr" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                {dialog.row.sourceType === "maintenance" && (
                  <div>
                    <Label className="text-xs">مَن يتحمّل التكلفة</Label>
                    <Select value={costBearer} onValueChange={setCostBearer}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">الشركة (مصروف صيانة المركبة)</SelectItem>
                        <SelectItem value="driver">السائق (يُسترَدّ بخصم الراتب)</SelectItem>
                        <SelectItem value="insurance">التأمين (ذمة مدينة مستردّة)</SelectItem>
                        <SelectItem value="warranty">الضمان (ذمة مدينة مستردّة)</SelectItem>
                        <SelectItem value="third_party">طرف ثالث (ذمة مدينة مستردّة)</SelectItem>
                        <SelectItem value="customer">العميل (ذمة مدينة مستردّة)</SelectItem>
                        <SelectItem value="tenant">المستأجر (ذمة مدينة مستردّة)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      يُوجّه القيد (مبدأ إبراهيم): الشركة/السائق → حساب صيانة المركبة · تأمين/طرف ثالث/عميل/مستأجر → ذمة مدينة مستردّة.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">القيم مقترحة من التشغيل — يمكنك تعديلها قبل الترحيل.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
                <Button onClick={submitMaterialize} disabled={materializeMut.isPending} rateLimitAware>
                  {materializeMut.isPending ? "جاري الترحيل..." : "ترحيل وإنشاء القيد"}
                </Button>
              </DialogFooter>
            </>
          )}
          {dialog?.mode === "reject" && (
            <>
              <DialogHeader><DialogTitle>رفض العملية</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <Label className="text-xs">سبب الرفض</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اذكر سبب رفض هذا الوارد" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>إلغاء</Button>
                <Button variant="destructive" onClick={submitReject} disabled={rejectMut.isPending} rateLimitAware>
                  {rejectMut.isPending ? "جاري الرفض..." : "تأكيد الرفض"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
