// معدّلات أجر السائق بالساعة — شاشة الموارد البشرية (الدفعة 2، إعداد بلا دفتر).
//
// تحرّر: «افتراضي الشركة» (نوع الدفع + معدّل قيادة + معدّل توقف) و«تجاوزات لكل
// سائق». كل شيء قابل للتعديل من الواجهة. سياسة أجر تملكها HR — الأسطول يوفّر
// الساعات فقط، والقيد يأتي في الدفعة 3.

import { useState } from "react";
import { useApiQuery, asList, apiFetch, getErrorMessage } from "@/lib/api";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { toast } from "@/hooks/use-toast";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Trash2 } from "lucide-react";

const PAY_TYPE_LABEL: Record<string, string> = { monthly: "شهري", hourly: "بالساعة" };

interface RateRow {
  id: number;
  assignmentId: number | null;
  payType: string;
  drivingHourlyRate: string | number | null;
  stopHourlyRate: string | number | null;
  effectiveDate: string | null;
  isActive: boolean;
  employeeName: string | null;
  employeeId: number | null;
}

function fmtRate(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} ر.س` : "—";
}

async function saveRate(body: Record<string, unknown>, onSaved: () => void) {
  try {
    await apiFetch(`/hr/driver-pay-rates`, { method: "POST", body: JSON.stringify(body) });
    toast({ title: "تم حفظ المعدّل" });
    onSaved();
  } catch (e) {
    toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(e) });
  }
}

// بطاقة معدّل (افتراضي الشركة أو تجاوز جديد) — حالة محلية.
function RateEditor({
  title,
  subtitle,
  current,
  assignmentId,
  onSaved,
}: {
  title: string;
  subtitle?: string;
  current?: RateRow | null;
  assignmentId: number | null;
  onSaved: () => void;
}) {
  const [payType, setPayType] = useState<string>(current?.payType ?? "hourly");
  const [driving, setDriving] = useState<string>(
    current?.drivingHourlyRate != null ? String(current.drivingHourlyRate) : "",
  );
  const [stop, setStop] = useState<string>(
    current?.stopHourlyRate != null ? String(current.stopHourlyRate) : "",
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await saveRate(
      {
        assignmentId,
        payType,
        drivingHourlyRate: driving === "" ? null : Number(driving),
        stopHourlyRate: stop === "" ? null : Number(stop),
      },
      onSaved,
    );
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">نوع الدفع</label>
        <select value={payType} onChange={(e) => setPayType(e.target.value)}
          className="h-8 min-w-[8rem] border rounded-md px-2 text-sm bg-background">
          <option value="hourly">بالساعة</option>
          <option value="monthly">شهري</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">معدّل ساعة القيادة (ر.س)</label>
        <Input type="number" step="0.5" min="0" value={driving}
          onChange={(e) => setDriving(e.target.value)} className="h-8 w-36"
          disabled={payType === "monthly"} placeholder={payType === "monthly" ? "—" : "0.00"} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">معدّل ساعة التوقف (ر.س)</label>
        <Input type="number" step="0.5" min="0" value={stop}
          onChange={(e) => setStop(e.target.value)} className="h-8 w-36"
          disabled={payType === "monthly"} placeholder={payType === "monthly" ? "—" : "0.00"} />
      </div>
      <GuardedButton perm="hr.driver_pay:update" size="sm" disabled={busy} onClick={submit}>
        حفظ
      </GuardedButton>
      {subtitle && <span className="text-xs text-muted-foreground self-center">{subtitle}</span>}
    </div>
  );
}

export default function DriverPayRatesPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(["driver-pay-rates"], "/hr/driver-pay-rates");
  const rows: RateRow[] = asList(data?.data || data);
  const companyDefault = rows.find((r) => r.assignmentId == null) ?? null;
  const overrides = rows.filter((r) => r.assignmentId != null);

  const { data: emps } = useApiQuery<any>(["hr-employees-picker"], "/employees?limit=200");
  const empList = asList(emps?.data || emps);

  const [newAssignmentId, setNewAssignmentId] = useState<string>("");

  async function removeOverride(id: number) {
    try {
      await apiFetch(`/hr/driver-pay-rates/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف المعدّل" });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الحذف", description: getErrorMessage(e) });
    }
  }

  const columns: DataTableColumn<RateRow>[] = [
    { key: "employeeName", header: "السائق", sortable: true, searchable: true,
      render: (r) => <span className="font-medium">{r.employeeName ?? `تعيين #${r.assignmentId}`}</span> },
    { key: "payType", header: "نوع الدفع", align: "center",
      render: (r) => <Badge variant="outline">{PAY_TYPE_LABEL[r.payType] ?? r.payType}</Badge> },
    { key: "drivingHourlyRate", header: "معدّل القيادة", align: "center", render: (r) => fmtRate(r.drivingHourlyRate) },
    { key: "stopHourlyRate", header: "معدّل التوقف", align: "center", render: (r) => fmtRate(r.stopHourlyRate) },
    { key: "actions", header: "إجراء", align: "center",
      render: (r) => (
        <GuardedButton perm="hr.driver_pay:delete" size="sm" variant="outline" onClick={() => removeOverride(r.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </GuardedButton>
      ) },
  ];

  return (
    <PageShell
      title="معدّلات أجر السائق"
      subtitle="معدّل ساعة القيادة/التوقف ونوع الدفع — افتراضي الشركة وتجاوز لكل سائق. الأسطول يوفّر الساعات؛ المعدّل هنا (الموارد البشرية)."
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "معدّلات أجر السائق" }]}
    >
      <HrTabsNav />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">افتراضي الشركة</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">جاري التحميل…</div>
          ) : (
            <RateEditor
              key={companyDefault?.id ?? "new-default"}
              title="افتراضي الشركة"
              subtitle="يُطبَّق على كل سائق ما لم يكن له تجاوز خاص"
              current={companyDefault}
              assignmentId={null}
              onSaved={refetch}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">تجاوز لسائق محدّد</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">السائق (الموظف)</label>
              <select value={newAssignmentId} onChange={(e) => setNewAssignmentId(e.target.value)}
                className="h-8 min-w-[14rem] border rounded-md px-2 text-sm bg-background">
                <option value="">— اختر سائقًا —</option>
                {empList.map((emp: any) => (
                  <option key={emp.activeAssignmentId ?? emp.id} value={emp.activeAssignmentId ?? ""}>
                    {emp.name}{emp.jobTitle ? ` — ${emp.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {newAssignmentId && (
            <RateEditor
              key={`override-${newAssignmentId}`}
              title="تجاوز"
              current={null}
              assignmentId={Number(newAssignmentId)}
              onSaved={() => { setNewAssignmentId(""); refetch(); }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader className="pb-2"><CardTitle className="text-base">التجاوزات الحالية ({overrides.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={overrides}
            isLoading={isLoading}
            error={isError ? new Error("تعذّر تحميل المعدّلات") : null}
            onRetry={refetch}
            noToolbar
            emptyMessage="لا توجد تجاوزات — يُطبَّق افتراضي الشركة على الجميع."
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
