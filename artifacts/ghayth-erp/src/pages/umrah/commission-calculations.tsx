import { useMemo, useState } from "react";
import { Link } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
  FormShell,
  FormGrid,
  FormSelectField,
  FormNumberField,
} from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Calculator, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { formatCurrency, formatNumber, currentYearRiyadh, currentMonthPaddedRiyadh } from "@/lib/formatters";

const currentMonthRiyadh = () => Number(currentMonthPaddedRiyadh());

interface CommissionCalc {
  id: number;
  planId: number;
  planName: string | null;
  employeeId: number;
  month: number;
  year: number;
  totalMutamers: number | null;
  conditionMet: boolean;
  conditionDetails: string | null;
  completedTiers: number | null;
  commissionAmount: number | string;
  hasViolations: boolean;
  finalAmount: number | string;
  isExcludedMonth: boolean;
  status: string;
  createdAt: string;
}

interface Plan {
  id: number;
  planName: string;
  employeeId: number;
  employeeName?: string;
  isApproved?: boolean;
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const runSchema = z.object({
  planId: z.coerce.number().min(1, "اختر خطة"),
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2020).max(2099),
});
type RunForm = z.infer<typeof runSchema>;

export default function CommissionCalculationsPage() {
  const [year, setYear] = useState<number>(currentYearRiyadh());
  const [runOpen, setRunOpen] = useState(false);

  const calcsQ = useApiQuery<{ data: CommissionCalc[] }>(
    ["umrah-commission-calculations", String(year)],
    `/umrah/commission-calculations?year=${year}`,
  );
  const plansQ = useApiQuery<{ data: Plan[] }>(
    ["umrah-commission-plans"],
    "/umrah/commission-plans",
  );

  // Run a fresh calculation. The /:id/calculate POST takes {month, year}
  // and persists into employee_commission_calculations so it shows up in
  // the list above on refetch.
  const runMut = useApiMutation<any, { id: number; month: number; year: number }>(
    (body) => `/umrah/commission-plans/${body.id}/calculate`,
    "POST",
    [["umrah-commission-calculations"]],
    {
      successMessage: "تم احتساب العمولة وحفظها",
      onSuccess: () => setRunOpen(false),
    },
  );

  const calcs = asList(calcsQ.data);
  const plans = (plansQ.data?.data ?? []).filter((p) => p.isApproved !== false);

  const stats = useMemo(() => {
    const totalAmount = calcs.reduce((s, c) => s + Number(c.finalAmount || 0), 0);
    const eligible = calcs.filter((c) => c.conditionMet && !c.isExcludedMonth).length;
    const excluded = calcs.filter((c) => c.isExcludedMonth).length;
    return { totalAmount, eligible, excluded, total: calcs.length };
  }, [calcs]);

  const columns: DataTableColumn<CommissionCalc>[] = [
    {
      key: "planName",
      header: "خطة العمولة",
      render: (c) => (
        <Link href={`/umrah/commission-plans/${c.planId}/edit`} className="font-medium hover:underline">
          {c.planName ?? `خطة #${c.planId}`}
        </Link>
      ),
    },
    {
      key: "period",
      header: "الفترة",
      render: (c) => `${MONTHS_AR[c.month - 1]} ${c.year}`,
    },
    { key: "totalMutamers", header: "عدد المعتمرين", render: (c) => formatNumber(c.totalMutamers ?? 0) },
    {
      key: "completedTiers",
      header: "الشرائح المكتملة",
      render: (c) => formatNumber(c.completedTiers ?? 0),
    },
    {
      key: "commissionAmount",
      header: "قبل الخصومات",
      render: (c) => (
        <span className="font-mono text-sm">{formatCurrency(Number(c.commissionAmount))}</span>
      ),
    },
    {
      key: "finalAmount",
      header: "المبلغ النهائي",
      render: (c) => (
        <span className="font-mono font-semibold text-emerald-700">
          {formatCurrency(Number(c.finalAmount))}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (c) => {
        if (c.isExcludedMonth) {
          return <Badge variant="outline" className="bg-surface-subtle">شهر مستثنى</Badge>;
        }
        if (!c.conditionMet) {
          return (
            <Badge variant="outline" className="bg-status-warning-surface text-status-warning-foreground">
              <AlertTriangle className="h-3 w-3 me-1" />
              الشرط غير محقّق
            </Badge>
          );
        }
        if (c.hasViolations) {
          return (
            <Badge variant="outline" className="bg-orange-50 text-orange-700">
              <AlertTriangle className="h-3 w-3 me-1" />
              مع مخالفات
            </Badge>
          );
        }
        if (c.status === "paid") {
          return (
            <Badge className="bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="h-3 w-3 me-1" />
              مدفوعة
            </Badge>
          );
        }
        return <Badge className="bg-status-info-surface text-status-info-foreground">محتسبة</Badge>;
      },
    },
  ];

  return (
    <PageShell
      title="حسابات العمولات"
      subtitle="سجل احتساب عمولات خطط الموظفين شهراً بشهر"
      breadcrumbs={[{ label: "العمرة" }, { label: "حسابات العمولات" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_commission_calcs"
            entityId="list"
            size="icon"
            label="طباعة سجل احتسابات العمولات"
            payload={() => ({
              entity: {
                title: `سجل احتسابات العمولات — ${year}`,
                year,
                total: stats.total,
                eligible: stats.eligible,
                excluded: stats.excluded,
                totalAmount: stats.totalAmount,
              },
              items: calcs.map((c: any) => ({
                "خطة العمولة": c.planName ?? `خطة #${c.planId}`,
                "الفترة": `${MONTHS_AR[c.month - 1]} ${c.year}`,
                "عدد المعتمرين": c.totalMutamers ?? 0,
                "الشرائح المكتملة": c.completedTiers ?? 0,
                "قبل الخصومات": Number(c.commissionAmount || 0),
                "المبلغ النهائي": Number(c.finalAmount || 0),
                "الحالة": c.isExcludedMonth
                  ? "شهر مستثنى"
                  : !c.conditionMet
                    ? "الشرط غير محقّق"
                    : c.hasViolations
                      ? "مع مخالفات"
                      : c.status === "paid"
                        ? "مدفوعة"
                        : "محتسبة",
              })),
            })}
          />
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            dir="ltr"
          >
            {[currentYearRiyadh() - 1, currentYearRiyadh(), currentYearRiyadh() + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <GuardedButton perm="umrah:write" className="gap-2" onClick={() => setRunOpen(true)}>
            <Play className="h-4 w-4" />
            تشغيل احتساب
          </GuardedButton>
        </div>
      }
    >
      <UmrahTabsNav />

      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الحسابات</p>
            <p className="text-2xl font-bold">{formatNumber(stats.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مؤهَّلة</p>
            <p className="text-2xl font-bold text-emerald-700">{formatNumber(stats.eligible)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">مستثناة</p>
            <p className="text-2xl font-bold text-muted-foreground">{formatNumber(stats.excluded)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي العمولات</p>
            <p className="text-2xl font-bold font-mono text-emerald-700">{formatCurrency(stats.totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            سجل الاحتسابات لعام {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PageStateWrapper {...calcsQ}>
            <DataTable
              columns={columns}
              data={calcs}
              pageSize={50}
              emptyMessage="لا توجد عمليات احتساب لهذا العام"
            />
          </PageStateWrapper>
        </CardContent>
      </Card>

      <Dialog open={runOpen} onOpenChange={(o) => { if (!o) setRunOpen(false); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تشغيل احتساب العمولة</DialogTitle>
            <DialogDescription>
              يُحتسب العمولة من بيانات المبيعات الفعلية للموظف في الفترة المختارة ويُحفظ النتيجة.
            </DialogDescription>
          </DialogHeader>
          <FormShell
            schema={runSchema}
            defaultValues={{
              planId: plans[0]?.id ?? 0,
              month: currentMonthRiyadh(),
              year: currentYearRiyadh(),
            }}
            submitLabel={runMut.isPending ? "جاري الاحتساب…" : "تشغيل"}
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setRunOpen(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values) => {
              await runMut.mutateAsync({ id: values.planId, month: values.month, year: values.year });
            }}
          >
            <FormGrid cols={1}>
              <FormSelectField
                name="planId"
                label="خطة العمولة"
                options={plans.map((p) => ({
                  value: String(p.id),
                  label: `${p.planName} — ${p.employeeName ?? "موظف #" + p.employeeId}`,
                }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormNumberField name="month" label="الشهر" min={1} max={12} />
                <FormNumberField name="year" label="السنة" min={2020} max={2099} />
              </div>
            </FormGrid>
          </FormShell>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
