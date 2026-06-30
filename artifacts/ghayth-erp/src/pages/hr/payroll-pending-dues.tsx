// معاينة مستحقّات السائق قيد الترحيل — شاشة الموارد البشرية (قراءة فقط، بلا دفتر).
//
// تعرض — قبل تشغيل المسيّر — ما سيستهلكه من بنود تشغيلية معتمدة لكل سائق:
// ساعات القيادة/التوقف المعتمدة للفترة × معدّل HR + مكافآت الحركات المعتمدة
// المعلّقة. القيمة تقديرية تطابق حساب المسيّر؛ القيمة النهائية عند الترحيل.
// لا إجراء هنا — أداة رؤية لاكتشاف الأخطاء مبكرًا (سائق بلا معدّل، مكافأة شاذة).

import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { currentPeriodRiyadh } from "@/lib/formatters";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Coins, AlertTriangle } from "lucide-react";

interface DuesRow {
  assignmentId: number;
  employeeId: number | null;
  employeeName: string | null;
  payType: string | null;
  drivingHours: number;
  stopHours: number;
  drivingHoursAmount: number;
  stopHoursAmount: number;
  hoursTotal: number;
  bonusTotal: number;
  bonusCount: number;
  grandTotal: number;
}

interface DuesData {
  period: string;
  rows: DuesRow[];
  totals: {
    drivers: number;
    drivingHours: number;
    stopHours: number;
    hoursTotal: number;
    bonusTotal: number;
    grandTotal: number;
  };
}

function money(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} ر.س` : "—";
}
function hrs(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)} س` : "—";
}

export default function PayrollPendingDuesPage() {
  const [period, setPeriod] = useState<string>(currentPeriodRiyadh());
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: DuesData }>(
    ["payroll-pending-dues", period],
    `/hr/payroll/pending-dues?period=${period}`,
  );
  const dues = data?.data;
  const rows: DuesRow[] = dues?.rows ?? [];
  const totals = dues?.totals;

  // سائق له ساعات لكن بلا معدّل ساعي (payType ليس hourly) ⇒ لن يُحتسب أجر ساعاته.
  const missingRate = rows.filter((r) => (r.drivingHours > 0 || r.stopHours > 0) && r.payType !== "hourly").length;

  const columns: DataTableColumn<DuesRow>[] = [
    { key: "employeeName", header: "السائق", sortable: true, searchable: true,
      render: (r) => <span className="font-medium">{r.employeeName ?? `تعيين #${r.assignmentId}`}</span> },
    { key: "hours", header: "ساعات (قيادة/توقف)", align: "center",
      render: (r) => <span className="text-xs">{hrs(r.drivingHours)} / {hrs(r.stopHours)}</span> },
    { key: "hoursTotal", header: "أجر الساعات", align: "center",
      render: (r) => (
        r.payType !== "hourly" && (r.drivingHours > 0 || r.stopHours > 0)
          ? <Badge variant="outline" className="gap-1 text-status-warning-foreground">
              <AlertTriangle className="w-3 h-3" /> بلا معدّل ساعي
            </Badge>
          : <span>{money(r.hoursTotal)}</span>
      ) },
    { key: "bonusTotal", header: "المكافآت", align: "center",
      render: (r) => (
        r.bonusTotal > 0
          ? <span>{money(r.bonusTotal)} <span className="text-[10px] text-muted-foreground">({r.bonusCount})</span></span>
          : <span className="text-muted-foreground">—</span>
      ) },
    { key: "grandTotal", header: "الإجمالي المتوقّع", align: "center", sortable: true,
      render: (r) => <span className="font-bold">{money(r.grandTotal)}</span> },
  ];

  return (
    <PageShell
      title="مستحقّات السائق قيد الترحيل"
      subtitle="معاينة قراءة فقط لما سيدخله المسيّر القادم لكل سائق: أجر الساعات المعتمدة + المكافآت المعتمدة. القيمة تقديرية تطابق حساب المسيّر — النهائية عند الترحيل."
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "مستحقّات السائق قيد الترحيل" }]}
    >
      <HrTabsNav />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الفترة</label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 w-44" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">سائقون لهم مستحقّات</span>
            <span className="text-lg font-bold">{totals?.drivers ?? 0}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">أجر الساعات</span>
            <span className="text-lg font-bold">{money(totals?.hoursTotal ?? 0)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">المكافآت</span>
            <span className="text-lg font-bold">{money(totals?.bonusTotal ?? 0)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">الإجمالي المتوقّع</span>
            <span className="text-lg font-bold text-status-info-foreground">{money(totals?.grandTotal ?? 0)}</span>
          </div>
          {missingRate > 0 && (
            <Badge variant="outline" className="gap-1 self-center text-status-warning-foreground">
              <AlertTriangle className="w-3.5 h-3.5" /> {missingRate} سائق بساعات بلا معدّل ساعي
            </Badge>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={isError ? new Error("تعذّر تحميل المستحقّات") : null}
        onRetry={refetch}
        emptyMessage="لا مستحقّات معتمدة معلّقة لهذه الفترة."
        emptyIcon={<Coins className="w-10 h-10 text-gray-300" />}
      />
    </PageShell>
  );
}
