import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageShell } from "@workspace/ui-core";
import { ArrowLeft, Save, Car, User as UserIcon, Calendar, Banknote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVehicleDriverDefault } from "@/hooks/use-vehicle-driver-default";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

// #1812 Wave 1 Step C — equipment rental create form.
//
// Canonical rental flow (R0→R8) from the user's mandate. R7 (handover
// inspection) + R9 (return inspection) live on the detail page since
// they happen after the contract is active.
//
//   R0  — active context (the active-context-gate at the app shell)
//   R1  — client from CRM (no free text — same rule as bookings)
//   R2  — serviceType = rental (this whole page IS the rental branch)
//   R3  — vehicle from fleet (only available/in_use, NOT maintenance)
//   R4  — period: start / end
//   R5  — with-driver toggle; driver = fleet_driver (= HR employee)
//   R6  — pricing: daily/weekly/monthly rate + security deposit
//   R7  — handover inspection (post-activate, on detail page)
//   R8  — approval (state machine: draft → active via /activate)
//   R9  — return inspection (post-active, on detail page)
//   R10 — Accounting Candidate after R9 (downstream, no JE in this UI)

interface ClientOption  { id: number; name: string; }
interface VehicleOption { id: number; plateNumber: string; status: string; make?: string | null; model?: string | null; }
interface DriverOption  { id: number; name: string; status: string; }

type RateKind = "daily" | "weekly" | "monthly" | "quarterly" | "one_time";

export default function RentalCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // R1 — client (CRM).
  const [clientId, setClientId] = useState("");
  // R3 — vehicle.
  const [vehicleId, setVehicleId] = useState("");
  // R4 — period.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // R5 — driver.
  const [withDriver, setWithDriver] = useState(false);
  const [driverId, setDriverId] = useState("");
  // الكيان يقود التجربة: اختيار المركبة يُعبّئ سائقها الحالي تلقائيًا (يظهر عند تفعيل «مع سائق»، قابل للتغيير).
  useVehicleDriverDefault(vehicleId, driverId, setDriverId);
  // R6 — pricing.
  const [paymentTerms, setPaymentTerms] = useState<RateKind>("daily");
  const [dailyRate, setDailyRate] = useState("");
  const [weeklyRate, setWeeklyRate] = useState("");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  // Notes.
  const [notes, setNotes] = useState("");

  const { data: clientsResp } = useApiQuery<{ data: ClientOption[] }>(
    ["clients-options-rental"],
    "/clients?limit=500",
  );
  const { data: vehiclesResp } = useApiQuery<{ data: VehicleOption[] }>(
    ["fleet-vehicles-options-rental"],
    "/fleet/vehicles?limit=500",
  );
  const { data: driversResp } = useApiQuery<{ data: DriverOption[] }>(
    ["fleet-drivers-options-rental"],
    "/fleet/drivers?limit=500",
    withDriver,
  );

  const clients  = clientsResp?.data || [];
  const vehicles = (vehiclesResp?.data || []).filter(
    (v) => v.status !== "out_of_service" && v.status !== "maintenance",
  );
  const drivers  = (driversResp?.data || []).filter(
    (d) => d.status === "available" || d.status === "on_trip" || !d.status,
  );

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => String(v.id) === vehicleId),
    [vehicles, vehicleId],
  );

  // Auto-compute totalAmount when rate + period set so the operator
  // sees an estimate before quoting. Operator can still override.
  const suggestedTotal = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    if (paymentTerms === "daily" && dailyRate) {
      return Math.round(Number(dailyRate) * days);
    }
    if (paymentTerms === "weekly" && weeklyRate) {
      const weeks = Math.max(1, Math.ceil(days / 7));
      return Math.round(Number(weeklyRate) * weeks);
    }
    if (paymentTerms === "monthly" && monthlyRate) {
      const months = Math.max(1, Math.ceil(days / 30));
      return Math.round(Number(monthlyRate) * months);
    }
    return null;
  }, [paymentTerms, dailyRate, weeklyRate, monthlyRate, startDate, endDate]);

  const hasMinimum =
    clientId && vehicleId && startDate.trim().length > 0;

  const submit = async () => {
    if (!hasMinimum) {
      toast({
        variant: "destructive",
        title: "أكمل البيانات الأساسية",
        description: "العميل، المركبة، وتاريخ البدء مطلوبة.",
      });
      return;
    }
    if (withDriver && !driverId) {
      toast({ variant: "destructive", title: "اختر السائق", description: "السائق إلزامي عند تفعيل خيار «بسائق»." });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        clientId: Number(clientId),
        vehicleId: Number(vehicleId),
        startDate,
        endDate: endDate || undefined,
        paymentTerms,
        dailyRate: dailyRate ? Number(dailyRate) : undefined,
        weeklyRate: weeklyRate ? Number(weeklyRate) : undefined,
        monthlyRate: monthlyRate ? Number(monthlyRate) : undefined,
        totalAmount: totalAmount ? Number(totalAmount) : suggestedTotal ?? undefined,
        securityDeposit: securityDeposit ? Number(securityDeposit) : 0,
        withDriver,
        driverId: withDriver ? Number(driverId) : undefined,
        notes: notes.trim() || undefined,
      };
      const res = await apiFetch<{ id: number }>("/fleet/rental-contracts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: "تم إنشاء عقد الإيجار" });
      const id = res?.id;
      navigate(id ? `/fleet/rental-contracts/${id}` : "/fleet/rental-contracts");
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الإنشاء", description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="عقد إيجار جديد"
      subtitle="تأجير مركبة لعميل (بسائق أو بدون) — الدفع المالي يتم في حساب المالية بعد إغلاق الإيجار"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/rental-contracts", label: "تأجير المركبات" },
        { label: "عقد جديد" },
      ]}
      actions={
        <Button asChild variant="outline" size="sm"><Link href="/fleet/rental-contracts">
            <ArrowLeft className="h-4 w-4 me-1" />إلغاء
          </Link></Button>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl">
        {/* R1 — العميل (CRM) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-status-info-foreground" />
              R1 — العميل (CRM) *
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر العميل من السجل…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— اختر —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!clientId && (
              <p className="text-xs text-rose-700">
                لا عقد إيجار بدون عميل من CRM (لا اسم نصّي).
              </p>
            )}
          </CardContent>
        </Card>

        {/* R3 — المركبة */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="h-4 w-4 text-status-info-foreground" />
              R3 — المركبة المؤجَّرة *
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={vehicleId || "none"} onValueChange={(v) => setVehicleId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر مركبة متاحة…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— اختر —</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.plateNumber} {v.make ? `· ${v.make} ${v.model ?? ""}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVehicle && (
              <div className="text-xs bg-surface-subtle rounded-md p-2">
                <span className="text-muted-foreground">الحالة الحالية: </span>
                <span className="font-medium">{selectedVehicle.status}</span>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              المركبات في حالة صيانة أو خارج الخدمة لا تظهر هنا.
            </p>
          </CardContent>
        </Card>

        {/* R4 — الفترة */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-status-info-foreground" />
              R4 — فترة الإيجار *
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div>
              <Label>من *</Label>
              <UnifiedDateInput value={startDate} onChange={setStartDate} />
            </div>
            <div>
              <Label>إلى</Label>
              <UnifiedDateInput value={endDate} onChange={setEndDate} />
            </div>
          </CardContent>
        </Card>

        {/* R5 — بسائق أم بدون */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-status-info-foreground" />
              R5 — السائق
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={withDriver} onCheckedChange={setWithDriver} id="withDriver" />
              <Label htmlFor="withDriver">إيجار مع سائق من الشركة</Label>
            </div>
            {withDriver ? (
              <Select value={driverId || "none"} onValueChange={(v) => setDriverId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="اختر السائق…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— اختر —</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                المركبة تُسلَّم للعميل بدون سائق — التحقق من رخصة العميل خارج النظام.
              </p>
            )}
          </CardContent>
        </Card>

        {/* R6 — التسعير + الوديعة */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-status-info-foreground" />
              R6 — التسعير + الوديعة
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>نوع التسعير</Label>
              <Select value={paymentTerms} onValueChange={(v) => setPaymentTerms(v as RateKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">يومي</SelectItem>
                  <SelectItem value="weekly">أسبوعي</SelectItem>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="quarterly">ربع سنوي</SelectItem>
                  <SelectItem value="one_time">مبلغ مقطوع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentTerms === "daily" && (
              <div>
                <Label>السعر اليومي</Label>
                <Input value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>
            )}
            {paymentTerms === "weekly" && (
              <div>
                <Label>السعر الأسبوعي</Label>
                <Input value={weeklyRate} onChange={(e) => setWeeklyRate(e.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>
            )}
            {paymentTerms === "monthly" && (
              <div>
                <Label>السعر الشهري</Label>
                <Input value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>
            )}
            <div>
              <Label>الوديعة (تأمين)</Label>
              <Input value={securityDeposit} onChange={(e) => setSecurityDeposit(e.target.value)} placeholder="0.00" inputMode="decimal" />
            </div>
            <div className="md:col-span-2">
              <Label>إجمالي العقد</Label>
              <Input
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder={suggestedTotal != null ? `الاقتراح: ${suggestedTotal.toLocaleString("ar-SA")}` : "0.00"}
                inputMode="decimal"
              />
              {suggestedTotal != null && !totalAmount && (
                <button
                  type="button"
                  onClick={() => setTotalAmount(String(suggestedTotal))}
                  className="mt-1 text-xs text-status-info-foreground hover:underline"
                >
                  استخدم الاقتراح ({suggestedTotal.toLocaleString("ar-SA")})
                </button>
              )}
            </div>
            <div className="md:col-span-3 text-[10px] text-muted-foreground bg-surface-subtle p-2 rounded">
              ⚠ لا يُسجَّل قيد مالي في هذه الشاشة. الإيراد يُحوَّل إلى «مرشّح المحاسبة» تلقائياً بعد تسجيل الإرجاع في صفحة العقد.
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شروط خاصة، التزامات إضافية، استثناءات…"
              rows={3}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex justify-end gap-2 max-w-5xl">
        <Button asChild variant="outline"><Link href="/fleet/rental-contracts">إلغاء</Link></Button>
        <Button
          rateLimitAware
          onClick={submit}
          disabled={submitting || !hasMinimum || (withDriver && !driverId)}
        >
          <Save className="h-4 w-4 me-1" />
          {submitting ? "جاري الحفظ…" : "حفظ كمسودّة"}
        </Button>
      </div>
    </PageShell>
  );
}
