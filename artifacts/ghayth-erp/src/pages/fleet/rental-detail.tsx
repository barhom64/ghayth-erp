import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/shared/print-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageShell } from "@workspace/ui-core";
import {
  Car, User as UserIcon, Calendar, Banknote, ArrowLeft,
  PackageOpen, PackageCheck, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { RentalInspectionPhotos } from "@/components/shared/inspection-photos";

// #1812 Wave 1 Step C — rental contract detail.
//
// Renders the full contract row + drives the R7 (handover) and R9
// (return) inspections. The status machine is:
//
//   draft → active → completed
//
// `Activate` flips draft → active. `Handover` is allowed only on
// active contracts and records (odometer, fuelLevel, notes) at the
// pickup moment. `Return` is allowed only when handover is already
// done, records the closing inspection + overage, and flips the
// contract to completed.

interface RentalDetail {
  id: number;
  ref: string | null;
  vehicleId: number;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  clientId: number;
  clientName: string | null;
  driverId: number | null;
  driverName: string | null;
  withDriver: boolean;
  startDate: string;
  endDate: string | null;
  actualEndDate: string | null;
  dailyRate: string | null;
  weeklyRate: string | null;
  monthlyRate: string | null;
  totalAmount: string | null;
  securityDeposit: string | null;
  overageAmount: string | null;
  paymentTerms: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  notes: string | null;
  handoverAt: string | null;
  handoverOdometer: number | null;
  handoverFuelLevel: string | null;
  handoverNotes: string | null;
  returnedAt: string | null;
  returnOdometer: number | null;
  returnFuelLevel: string | null;
  returnNotes: string | null;
}

const STATUS_LABEL: Record<RentalDetail["status"], string> = {
  draft: "مسودّة", active: "فعّال", completed: "مُغلق", cancelled: "ملغى",
};
const STATUS_TONE: Record<RentalDetail["status"], string> = {
  draft:     "bg-surface-subtle text-muted-foreground",
  active:    "bg-status-warning-surface text-status-warning-foreground",
  completed: "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-rose-50 text-rose-700",
};

export default function RentalDetailPage() {
  const [, params] = useRoute("/fleet/rental-contracts/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Payments
  const { data: paymentsResp, refetch: refetchPayments } = useApiQuery<{ data: any[] }>(
    ["rental-payments", id ?? ""],
    id ? `/fleet/rental-contracts/${id}/payments` : null,
  );
  const payments: any[] = paymentsResp?.data ?? [];
  const [showPayForm, setShowPayForm] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const { data, isLoading, isError } = useApiQuery<{ data: RentalDetail }>(
    ["fleet-rental-contract", id ?? ""],
    id ? `/fleet/rental-contracts/${id}` : null,
  );
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fleet-rental-contract", id ?? ""] });

  // R7 handover form state.
  const [hoOdo, setHoOdo] = useState("");
  const [hoFuel, setHoFuel] = useState("");
  const [hoNotes, setHoNotes] = useState("");
  // R9 return form state.
  const [rtOdo, setRtOdo] = useState("");
  const [rtFuel, setRtFuel] = useState("");
  const [rtNotes, setRtNotes] = useState("");
  const [rtEndDate, setRtEndDate] = useState("");
  const [rtOverage, setRtOverage] = useState("");

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;

  const c = data.data;

  const activate = async () => {
    if (!confirm("تفعيل العقد؟ بعد التفعيل لا يمكن تعديل البنود الأساسية.")) return;
    setBusy("activate");
    try {
      await apiFetch(`/fleet/rental-contracts/${c.id}/activate`, { method: "POST" });
      toast({ title: "تم تفعيل العقد" });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التفعيل", description: getErrorMessage(e) });
    } finally { setBusy(null); }
  };

  const submitHandover = async () => {
    if (!hoOdo || !hoFuel) {
      toast({ variant: "destructive", title: "أكمل بيانات التسليم", description: "العداد ومستوى الوقود إلزاميان." });
      return;
    }
    setBusy("handover");
    try {
      await apiFetch(`/fleet/rental-contracts/${c.id}/handover`, {
        method: "POST",
        body: JSON.stringify({
          handoverOdometer: Number(hoOdo),
          handoverFuelLevel: Number(hoFuel),
          handoverNotes: hoNotes.trim() || undefined,
        }),
      });
      toast({ title: "تم تسجيل التسليم" });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر التسليم", description: getErrorMessage(e) });
    } finally { setBusy(null); }
  };

  const submitReturn = async () => {
    if (!rtOdo || !rtFuel) {
      toast({ variant: "destructive", title: "أكمل بيانات الإرجاع", description: "العداد ومستوى الوقود إلزاميان." });
      return;
    }
    if (c.handoverOdometer != null && Number(rtOdo) < c.handoverOdometer) {
      toast({ variant: "destructive", title: "قراءة العداد غير منطقية", description: "قراءة الإرجاع أقل من قراءة التسليم." });
      return;
    }
    setBusy("return");
    try {
      await apiFetch(`/fleet/rental-contracts/${c.id}/return`, {
        method: "POST",
        body: JSON.stringify({
          returnOdometer: Number(rtOdo),
          returnFuelLevel: Number(rtFuel),
          returnNotes: rtNotes.trim() || undefined,
          actualEndDate: rtEndDate || undefined,
          overageAmount: rtOverage ? Number(rtOverage) : undefined,
        }),
      });
      toast({ title: "تم إغلاق العقد" });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الإرجاع", description: getErrorMessage(e) });
    } finally { setBusy(null); }
  };

  const addPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) {
      toast({ variant: "destructive", title: "المبلغ مطلوب" });
      return;
    }
    setBusy("pay");
    try {
      await apiFetch(`/fleet/rental-contracts/${c.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: Number(payAmount),
          paymentMethod: payMethod,
          referenceNumber: payRef || undefined,
          paymentDate: payDate || undefined,
          notes: payNotes || undefined,
        }),
      });
      toast({ title: "تم تسجيل الدفعة" });
      setShowPayForm(false);
      setPayAmount(""); setPayRef(""); setPayDate(""); setPayNotes("");
      refetchPayments();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل تسجيل الدفعة", description: getErrorMessage(e) });
    } finally { setBusy(null); }
  };

  const settlePayment = async (paymentId: number) => {
    if (!confirm("تأكيد تسوية هذه الدفعة؟")) return;
    setBusy(`settle-${paymentId}`);
    try {
      await apiFetch(`/fleet/rental-payments/${paymentId}/pay`, { method: "POST" });
      toast({ title: "تمت التسوية" });
      refetchPayments();
    } catch (e) {
      toast({ variant: "destructive", title: "فشل التسوية", description: getErrorMessage(e) });
    } finally { setBusy(null); }
  };

  const kmTravelled = c.handoverOdometer != null && c.returnOdometer != null
    ? c.returnOdometer - c.handoverOdometer
    : null;

  return (
    <PageShell
      title={`عقد إيجار ${c.ref ?? `#${c.id}`}`}
      subtitle={`${c.plateNumber ?? `#${c.vehicleId}`} · ${c.clientName ?? `#${c.clientId}`}`}
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/rental-contracts", label: "تأجير المركبات" },
        { label: c.ref ?? `#${c.id}` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          {/* #2079 TA-T18-11 (TPL-02) — print the rental delivery/return
              docket. The single preset (rental_handover_return_classic)
              renders the handover block when handed-over and the return
              block when returned, so this button surfaces the live
              state of the contract regardless of where it is in the
              lifecycle. */}
          <PrintButton entityType="fleet_rental_contract" entityId={c.id} />
          <Button asChild variant="outline" size="sm"><Link href="/fleet/rental-contracts">
              <ArrowLeft className="h-4 w-4 me-1" />العودة للقائمة
            </Link></Button>
        </div>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 flex items-center gap-2">
        <Badge variant="outline" className={`${STATUS_TONE[c.status]} text-xs`}>
          {STATUS_LABEL[c.status]}
        </Badge>
        {c.status === "draft" && (
          <Button size="sm" onClick={activate} disabled={busy === "activate"} rateLimitAware>
            <CheckCircle2 className="h-4 w-4 me-1" />
            {busy === "activate" ? "جاري التفعيل…" : "R8 — تفعيل العقد"}
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="h-4 w-4 text-status-info-foreground" />المركبة + العميل
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>
              <span className="text-xs text-muted-foreground">المركبة:</span>{" "}
              <span className="font-mono">{c.plateNumber ?? `#${c.vehicleId}`}</span>
              {(c.make || c.model) && (
                <span className="text-xs text-muted-foreground"> · {c.make ?? ""} {c.model ?? ""}</span>
              )}
            </div>
            <div>
              <span className="text-xs text-muted-foreground">العميل:</span>{" "}
              <span>{c.clientName ?? `#${c.clientId}`}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">السائق:</span>{" "}
              {c.withDriver
                ? <span>{c.driverName ?? `#${c.driverId}`}</span>
                : <span className="text-muted-foreground">بدون سائق</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-status-info-foreground" />الفترة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-xs text-muted-foreground">من:</span> <span className="font-mono">{c.startDate}</span></div>
            <div><span className="text-xs text-muted-foreground">إلى:</span> <span className="font-mono">{c.endDate ?? "—"}</span></div>
            {c.actualEndDate && (
              <div><span className="text-xs text-muted-foreground">إغلاق فعلي:</span> <span className="font-mono">{c.actualEndDate}</span></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-status-info-foreground" />التسعير
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-xs text-muted-foreground">نوع التسعير:</span> <span>{c.paymentTerms}</span></div>
            {c.dailyRate && <div><span className="text-xs text-muted-foreground">يومي:</span> <span className="font-mono">{Number(c.dailyRate).toLocaleString("ar-SA")}</span></div>}
            {c.weeklyRate && <div><span className="text-xs text-muted-foreground">أسبوعي:</span> <span className="font-mono">{Number(c.weeklyRate).toLocaleString("ar-SA")}</span></div>}
            {c.monthlyRate && <div><span className="text-xs text-muted-foreground">شهري:</span> <span className="font-mono">{Number(c.monthlyRate).toLocaleString("ar-SA")}</span></div>}
            {c.totalAmount && <div className="border-t pt-1 mt-1"><span className="text-xs text-muted-foreground">الإجمالي:</span> <span className="font-mono font-bold">{Number(c.totalAmount).toLocaleString("ar-SA")}</span></div>}
            {c.securityDeposit && <div><span className="text-xs text-muted-foreground">الوديعة:</span> <span className="font-mono">{Number(c.securityDeposit).toLocaleString("ar-SA")}</span></div>}
            {c.overageAmount && Number(c.overageAmount) > 0 && (
              <div className="text-rose-600">
                <span className="text-xs">الزائد:</span>{" "}
                <span className="font-mono font-bold">{Number(c.overageAmount).toLocaleString("ar-SA")}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* R7 — handover */}
      {c.status === "active" && c.handoverAt == null && (
        <Card className="mt-4 border-status-warning-foreground/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-status-warning-foreground" />
              R7 — تسجيل التسليم للعميل
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>قراءة العداد (كم) *</Label>
              <Input value={hoOdo} onChange={(e) => setHoOdo(e.target.value)} inputMode="numeric" placeholder="مثال: 45000" />
            </div>
            <div>
              <Label>مستوى الوقود (0..1) *</Label>
              <Input value={hoFuel} onChange={(e) => setHoFuel(e.target.value)} inputMode="decimal" placeholder="0.50 = نصف خزان" />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات (خدوش/أعطال موجودة قبل التسليم)</Label>
              <Textarea value={hoNotes} onChange={(e) => setHoNotes(e.target.value)} rows={2} />
            </div>
            <div className="md:col-span-3 text-end">
              <Button onClick={submitHandover} disabled={busy === "handover"} rateLimitAware>
                <PackageOpen className="h-4 w-4 me-1" />
                {busy === "handover" ? "جاري التسجيل…" : "سجّل التسليم"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Handover summary (read-only once recorded) */}
      {c.handoverAt && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageOpen className="h-4 w-4 text-status-info-foreground" />
              R7 — حالة التسليم
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">العداد:</span> <span className="font-mono">{c.handoverOdometer}</span></div>
            <div><span className="text-xs text-muted-foreground">الوقود:</span> <span className="font-mono">{c.handoverFuelLevel ? Math.round(Number(c.handoverFuelLevel) * 100) : 0}%</span></div>
            <div><span className="text-xs text-muted-foreground">وقت التسليم:</span> <span className="font-mono text-xs">{new Date(c.handoverAt).toLocaleString("ar-SA")}</span></div>
            {c.handoverNotes && <div className="md:col-span-3 text-xs text-muted-foreground">{c.handoverNotes}</div>}
          </CardContent>
        </Card>
      )}

      {/* R9 — return */}
      {c.status === "active" && c.handoverAt != null && c.returnedAt == null && (
        <Card className="mt-4 border-status-success-foreground/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-status-success-foreground" />
              R9 — تسجيل الإرجاع وإغلاق العقد
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>قراءة العداد (كم) *</Label>
              <Input
                value={rtOdo}
                onChange={(e) => setRtOdo(e.target.value)}
                inputMode="numeric"
                placeholder={c.handoverOdometer != null ? `≥ ${c.handoverOdometer}` : "قراءة عداد الإرجاع"}
              />
            </div>
            <div>
              <Label>مستوى الوقود (0..1) *</Label>
              <Input value={rtFuel} onChange={(e) => setRtFuel(e.target.value)} inputMode="decimal" placeholder="0.50" />
            </div>
            <div>
              <Label>تاريخ الإرجاع الفعلي</Label>
              <UnifiedDateInput value={rtEndDate} onChange={setRtEndDate} />
            </div>
            <div className="md:col-span-3">
              <Label>ملاحظات الإرجاع (خدوش جديدة / أعطال / حالة الإطارات)</Label>
              <Textarea value={rtNotes} onChange={(e) => setRtNotes(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>الزائد (دقائق، كيلو، أضرار)</Label>
              <Input value={rtOverage} onChange={(e) => setRtOverage(e.target.value)} inputMode="decimal" placeholder="0.00" />
              <p className="text-[10px] text-muted-foreground mt-1">يُضاف إلى مرشّح المحاسبة كسطر منفصل.</p>
            </div>
            <div className="md:col-span-2 text-end self-end">
              <Button onClick={submitReturn} disabled={busy === "return"} rateLimitAware>
                <PackageCheck className="h-4 w-4 me-1" />
                {busy === "return" ? "جاري الإغلاق…" : "سجّل الإرجاع وأغلق"}
              </Button>
            </div>
            {c.handoverOdometer != null && rtOdo && Number(rtOdo) > c.handoverOdometer && (
              <div className="md:col-span-3 text-xs bg-status-info-surface text-status-info-foreground rounded p-2">
                المسافة المقدّرة: {Number(rtOdo) - c.handoverOdometer} كم
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* صور الفحص (استلام/تسليم) — تربط الصور بعقد الإيجار عبر سجل الفحص */}
      {c.status !== "draft" && (
        <RentalInspectionPhotos vehicleId={c.vehicleId} rentalContractId={c.id} />
      )}

      {/* Return summary (terminal) */}
      {c.returnedAt && (
        <Card className="mt-4 border-status-success-foreground/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-status-success-foreground" />
              R9 — حالة الإرجاع
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">العداد:</span> <span className="font-mono">{c.returnOdometer}</span></div>
            <div><span className="text-xs text-muted-foreground">الوقود:</span> <span className="font-mono">{c.returnFuelLevel ? Math.round(Number(c.returnFuelLevel) * 100) : 0}%</span></div>
            <div><span className="text-xs text-muted-foreground">وقت الإرجاع:</span> <span className="font-mono text-xs">{new Date(c.returnedAt).toLocaleString("ar-SA")}</span></div>
            {kmTravelled != null && (
              <div className="md:col-span-3">
                <span className="text-xs text-muted-foreground">المسافة المقطوعة:</span>{" "}
                <span className="font-mono font-bold">{kmTravelled} كم</span>
              </div>
            )}
            {c.returnNotes && <div className="md:col-span-3 text-xs text-muted-foreground">{c.returnNotes}</div>}
            {c.overageAmount && Number(c.overageAmount) > 0 && (
              <div className="md:col-span-3 text-xs bg-rose-50 text-rose-700 rounded p-2 flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" />
                زائد بقيمة <span className="font-mono font-bold">{Number(c.overageAmount).toLocaleString("ar-SA")}</span> — أُرسل إلى مرشّح المحاسبة.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payments */}
      <Card className="mt-4">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Banknote className="h-4 w-4 text-status-info-foreground" />
            دفعات العقد
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPayForm(v => !v)}>
            {showPayForm ? "إلغاء" : "+ دفعة جديدة"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {showPayForm && (
            <div className="rounded-md border p-3 space-y-2 bg-surface-subtle">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">المبلغ *</Label>
                  <Input type="number" className="h-8 text-sm" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs">طريقة الدفع</Label>
                  <select className="w-full h-8 border rounded-md px-2 text-sm" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="cash">نقدي</option>
                    <option value="cheque">شيك</option>
                    <option value="card">بطاقة</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">رقم مرجعي</Label>
                  <Input className="h-8 text-sm" value={payRef} onChange={e => setPayRef(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">تاريخ الدفع</Label>
                  <Input type="date" className="h-8 text-sm" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">ملاحظات</Label>
                  <Input className="h-8 text-sm" value={payNotes} onChange={e => setPayNotes(e.target.value)} />
                </div>
              </div>
              <Button size="sm" onClick={addPayment} disabled={busy === "pay"}>
                {busy === "pay" ? "جاري الحفظ..." : "تسجيل الدفعة"}
              </Button>
            </div>
          )}
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">لا توجد دفعات مسجلة.</p>
          ) : (
            <div className="divide-y text-sm">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-mono font-bold">{Number(p.amount).toLocaleString("ar-SA")}</span>
                    <span className="text-xs text-muted-foreground ms-2">{p.paymentMethod} {p.referenceNumber ? `· ${p.referenceNumber}` : ""}</span>
                    {p.paymentDate && <span className="text-xs text-muted-foreground ms-2">{p.paymentDate}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={p.status === "paid" ? "text-status-success-foreground" : "text-muted-foreground"}>
                      {p.status === "paid" ? "مُسوّى" : "معلق"}
                    </Badge>
                    {p.status !== "paid" && (
                      <Button size="sm" variant="outline" className="h-6 text-xs"
                        disabled={busy === `settle-${p.id}`}
                        onClick={() => settlePayment(p.id)}
                      >
                        {busy === `settle-${p.id}` ? "..." : "تسوية"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {c.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملاحظات العقد</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{c.notes}</CardContent>
        </Card>
      )}
    </PageShell>
  );
}
