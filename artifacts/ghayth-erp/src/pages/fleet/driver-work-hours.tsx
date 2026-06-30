// أجر السائق بالساعة — شاشة المشرف (الدفعة 1، تشغيلية بلا دفتر).
//
// تعرض ساعات القيادة/التوقف اليومية: «التتبع» (مشتقّ) و«اليدوي» (قابل للتعديل)
// جنبًا لجنب، والمعتمِد يقرّر القيمة المعتمدة ثم يعتمد. لا ترحيل بلا اعتماد
// بشري (القرار 3ج). المعدّلات والأجر في الموارد البشرية — لا تظهر هنا.

import { useState } from "react";
import { useApiQuery, asList, apiFetch, getErrorMessage } from "@/lib/api";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { toast } from "@/hooks/use-toast";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { CheckCircle, Clock } from "lucide-react";
import { todayLocal, currentPeriodRiyadh } from "@/lib/formatters";

interface HoursRow {
  id: number;
  driverId: number;
  driverName: string;
  assignmentId: number | null;
  workDate: string;
  derivedDrivingHours: string | number | null;
  derivedStopHours: string | number | null;
  derivedSource: string | null;
  manualDrivingHours: string | number | null;
  manualStopHours: string | number | null;
  approvedDrivingHours: string | number | null;
  approvedStopHours: string | number | null;
  status: string;
  approvedAt: string | null;
  payrollLineId: number | null;
  notes: string | null;
}

function monthStart(): string {
  // أول الشهر الحالي بتوقيت الرياض (لا UTC) — حارس finance-period-drift.
  return `${currentPeriodRiyadh()}-01`;
}
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: unknown): string {
  const n = num(v);
  return n == null ? "—" : n.toFixed(2);
}

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  void: "ملغى",
};

// خلية اليدوي — حالة محلية لكل صفّ (تعديل قبل الاعتماد فقط).
function ManualCell({ row, onChanged }: { row: HoursRow; onChanged: () => void }) {
  const [mDrive, setMDrive] = useState<string>(row.manualDrivingHours != null ? String(row.manualDrivingHours) : "");
  const [mStop, setMStop] = useState<string>(row.manualStopHours != null ? String(row.manualStopHours) : "");
  const [busy, setBusy] = useState(false);

  if (row.status === "approved") {
    return <span className="text-muted-foreground">{fmt(row.manualDrivingHours)} / {fmt(row.manualStopHours)}</span>;
  }
  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/fleet/driver-work-hours/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          manualDrivingHours: mDrive === "" ? undefined : Number(mDrive),
          manualStopHours: mStop === "" ? undefined : Number(mStop),
        }),
      });
      toast({ title: "تم حفظ الساعات اليدوية" });
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-1 justify-center">
      <Input type="number" step="0.25" min="0" max="24" value={mDrive}
        onChange={(e) => setMDrive(e.target.value)} className="h-8 w-16 text-center" placeholder="قيادة" />
      <span className="text-muted-foreground">/</span>
      <Input type="number" step="0.25" min="0" max="24" value={mStop}
        onChange={(e) => setMStop(e.target.value)} className="h-8 w-16 text-center" placeholder="توقف" />
      <GuardedButton perm="fleet.driver_hours:update" size="sm" variant="outline"
        disabled={busy} onClick={save}>حفظ</GuardedButton>
    </div>
  );
}

// خلية المعتمد — حالة محلية؛ المقترح = اليدوي إن وُجد وإلا المشتقّ.
function ApproveCell({ row, onChanged }: { row: HoursRow; onChanged: () => void }) {
  const derivedD = num(row.derivedDrivingHours) ?? 0;
  const derivedS = num(row.derivedStopHours) ?? 0;
  const [aDrive, setADrive] = useState<string>(String(num(row.manualDrivingHours) ?? derivedD));
  const [aStop, setAStop] = useState<string>(String(num(row.manualStopHours) ?? derivedS));
  const [busy, setBusy] = useState(false);

  if (row.status === "approved") {
    return (
      <span className="font-bold text-status-success-foreground">
        {fmt(row.approvedDrivingHours)} / {fmt(row.approvedStopHours)}
      </span>
    );
  }
  async function approve() {
    setBusy(true);
    try {
      await apiFetch(`/fleet/driver-work-hours/${row.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approvedDrivingHours: Number(aDrive || 0), approvedStopHours: Number(aStop || 0) }),
      });
      toast({ title: "تم اعتماد الساعات" });
      onChanged();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الاعتماد", description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-1 justify-center">
      <Input type="number" step="0.25" min="0" max="24" value={aDrive}
        onChange={(e) => setADrive(e.target.value)} className="h-8 w-16 text-center" />
      <span className="text-muted-foreground">/</span>
      <Input type="number" step="0.25" min="0" max="24" value={aStop}
        onChange={(e) => setAStop(e.target.value)} className="h-8 w-16 text-center" />
      <GuardedButton perm="fleet.driver_hours:approve" size="sm"
        disabled={busy} onClick={approve}>اعتماد</GuardedButton>
    </div>
  );
}

export default function DriverWorkHoursPage() {
  const [from, setFrom] = useState<string>(monthStart());
  const [to, setTo] = useState<string>(todayLocal());
  const [driverId, setDriverId] = useState<string>("");
  const [deriveDate, setDeriveDate] = useState<string>(todayLocal());
  const [deriving, setDeriving] = useState(false);

  const qs = new URLSearchParams({ from, to });
  if (driverId) qs.set("driverId", driverId);
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["driver-work-hours", from, to, driverId],
    `/fleet/driver-work-hours?${qs.toString()}`,
  );
  const rows: HoursRow[] = asList(data?.data || data);

  const { data: drivers } = useApiQuery<any>(["fleet-drivers"], "/fleet/drivers?limit=200");
  const driverList = asList(drivers?.data || drivers);

  // اشتقاق/إضافة يوم لسائق محدّد — يُنشئ صفًّا (من التتبع إن وُجد، وإلا صفرًا)
  // كي يُدخل المشرف الساعات يدويًا حين لا تتوفّر جلسة تتبع (الإدخال اليومي).
  async function deriveDay() {
    if (!driverId) {
      toast({ variant: "destructive", title: "اختر سائقًا أولًا" });
      return;
    }
    setDeriving(true);
    try {
      await apiFetch(`/fleet/driver-work-hours/derive`, {
        method: "POST",
        body: JSON.stringify({ driverId: Number(driverId), workDate: deriveDate }),
      });
      toast({ title: "تم اشتقاق/إضافة اليوم" });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الاشتقاق", description: getErrorMessage(e) });
    } finally {
      setDeriving(false);
    }
  }

  const pending = rows.filter((r) => r.status === "pending").length;
  const approved = rows.filter((r) => r.status === "approved").length;

  const columns: DataTableColumn<HoursRow>[] = [
    { key: "driverName", header: "السائق", sortable: true, searchable: true, render: (r) => <span className="font-medium">{r.driverName}</span> },
    { key: "workDate", header: "اليوم", sortable: true, render: (r) => r.workDate?.split("T")[0] || "-" },
    { key: "tracking", header: "التتبع (قيادة/توقف)", align: "center", render: (r) => (
      <span className="text-muted-foreground">{fmt(r.derivedDrivingHours)} / {fmt(r.derivedStopHours)}</span>
    ) },
    { key: "manual", header: "اليدوي (قيادة/توقف)", align: "center", render: (r) => <ManualCell row={r} onChanged={refetch} /> },
    { key: "approved", header: "المعتمد (قيادة/توقف)", align: "center", render: (r) => <ApproveCell row={r} onChanged={refetch} /> },
    { key: "status", header: "الحالة", align: "center", sortable: true, render: (r) => (
      r.status === "approved" ? (
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="w-3 h-3 text-status-success" /> {STATUS_LABEL[r.status]}
          {r.payrollLineId != null && <span className="text-[10px] text-muted-foreground">· مُرحّل</span>}
        </Badge>
      ) : (
        <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
      )
    ) },
  ];

  return (
    <PageShell
      title="ساعات عمل السائق"
      subtitle="ساعات القيادة والتوقف — التتبع واليدوي جنبًا لجنب، باعتماد بشري قبل الترحيل للراتب"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "ساعات عمل السائق" }]}
    >
      <FleetTabsNav />

      <Card>
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">من</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">إلى</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">السائق</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)}
              className="h-8 min-w-[12rem] border rounded-md px-2 text-sm bg-background">
              <option value="">كل السائقين</option>
              {driverList.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {/* اشتقاق/إضافة يوم للسائق المحدّد — يدعم الإدخال اليومي حين لا تتوفّر جلسة تتبع */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">اشتقاق/إضافة يوم</label>
            <div className="flex items-center gap-1">
              <Input type="date" value={deriveDate} onChange={(e) => setDeriveDate(e.target.value)} className="h-8 w-36" />
              <GuardedButton perm="fleet.driver_hours:update" size="sm" variant="outline"
                disabled={deriving} onClick={deriveDay}>إضافة</GuardedButton>
            </div>
          </div>
          <div className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> قيد المراجعة: {pending}</span>
            <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-status-success" /> معتمد: {approved}</span>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={isError ? new Error("تعذّر تحميل البيانات") : null}
        onRetry={refetch}
        emptyMessage="لا توجد ساعات مسجّلة في هذه الفترة."
        emptyIcon={<Clock className="w-10 h-10 text-gray-300" />}
      />
    </PageShell>
  );
}
