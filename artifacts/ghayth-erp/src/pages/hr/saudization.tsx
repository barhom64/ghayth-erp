import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Users, TrendingUp, AlertTriangle, RefreshCw, Award, FileText, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
const SECTOR_OPTIONS = [
  { value: "default", label: "افتراضي" },
  { value: "construction", label: "إنشاءات" },
  { value: "retail", label: "تجزئة" },
  { value: "manufacturing", label: "صناعة" },
  { value: "services", label: "خدمات" },
];

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  platinum: { label: "بلاتيني", color: "text-purple-700", bg: "bg-purple-100 border-purple-300" },
  green:    { label: "أخضر",   color: "text-green-700",  bg: "bg-green-100 border-green-300" },
  yellow:   { label: "أصفر",   color: "text-amber-700",  bg: "bg-amber-100 border-amber-300" },
  red:      { label: "أحمر",   color: "text-red-700",    bg: "bg-red-100 border-red-300" },
};

interface SaudizationData {
  totalEmployees: number;
  saudiEmployees: number;
  nonSaudiEmployees: number;
  saudizationPercent: number | string;
  category: string;
  exempt?: boolean;
}

interface HistoryRow {
  period: string;
  totalEmployees: number;
  saudiEmployees: number;
  nonSaudiEmployees: number;
  saudizationPercent: number | string;
  category: string;
  sector: string | null;
  computedAt: string;
}

interface ExpiringDoc {
  employeeId: number;
  employeeName: string;
  expiryDate: string;
  docType: string;
  docLabel: string;
  daysLeft: number | string;
}

export default function SaudizationPage() {
  const [sector, setSector] = useState<string>("default");

  const { data: current, isLoading, isError, refetch } = useApiQuery<{
    period: string;
    sector: string;
    live: SaudizationData;
    stored: HistoryRow | null;
  }>(
    ["saudization-current", sector],
    `/hr/saudization/current?sector=${sector}`,
  );

  const { data: historyResp } = useApiQuery<{ data: HistoryRow[] }>(
    ["saudization-history"],
    "/hr/saudization/history?limit=12",
  );

  const { data: expiringResp } = useApiQuery<{ data: ExpiringDoc[] } | ExpiringDoc[]>(
    ["expiring-30"],
    "/hr/expiring-documents?days=30",
  );

  const refreshMut = useApiMutation<SaudizationData, { sector: string }>(
    () => "/hr/saudization/refresh",
    "POST",
    [["saudization-current", sector], ["saudization-history"]],
    {
      successMessage: "تم تحديث لقطة السعودة",
    },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !current) return <ErrorState onRetry={refetch} />;

  const live = current.live;
  const stored = current.stored;
  const livePct = Number(live.saudizationPercent);
  const meta = CATEGORY_META[live.category] || CATEGORY_META.green;

  const expiringDocs = Array.isArray(expiringResp)
    ? expiringResp
    : (expiringResp?.data ?? []);
  const iqamaExpiring = expiringDocs.filter((d) => d.docType === "iqama");
  const iqamaCriticalCount = iqamaExpiring.filter((d) => Number(d.daysLeft) <= 14).length;

  const historyData = historyResp?.data ?? [];

  const historyColumns: DataTableColumn<HistoryRow>[] = [
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      render: (h) => <span className="font-mono">{h.period}</span>,
    },
    {
      key: "totalEmployees",
      header: "إجمالي الموظفين",
      sortable: true,
      render: (h) => <span>{h.totalEmployees}</span>,
    },
    {
      key: "saudiEmployees",
      header: "سعوديون",
      sortable: true,
      render: (h) => <span className="font-medium">{h.saudiEmployees}</span>,
    },
    {
      key: "nonSaudiEmployees",
      header: "غير سعوديين",
      sortable: true,
      render: (h) => <span>{h.nonSaudiEmployees}</span>,
    },
    {
      key: "saudizationPercent",
      header: "نسبة السعودة",
      sortable: true,
      render: (h) => <span className="font-bold">{Number(h.saudizationPercent).toFixed(2)}%</span>,
    },
    {
      key: "category",
      header: "النطاق",
      sortable: true,
      render: (h) => {
        const m = CATEGORY_META[h.category] || CATEGORY_META.green;
        return <Badge className={cn("border", m.bg, m.color)}>{m.label}</Badge>;
      },
    },
    {
      key: "computedAt",
      header: "تاريخ اللقطة",
      render: (h) => <span className="text-xs text-muted-foreground">{formatDateAr(h.computedAt)}</span>,
    },
  ];

  const driftSaudi = stored ? live.saudiEmployees - stored.saudiEmployees : 0;
  const driftTotal = stored ? live.totalEmployees - stored.totalEmployees : 0;
  const driftPct = stored ? livePct - Number(stored.saudizationPercent) : 0;

  return (
    <PageShell
      title="السعودة ونطاقات"
      subtitle={`الفترة ${current.period}`}
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "الموارد البشرية", href: "/hr/payroll" },
        { label: "السعودة" },
      ]}
      actions={
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">القطاع</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTOR_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <GuardedButton
            perm="hr.saudization:update"
            onClick={() => refreshMut.mutate({ sector })}
            disabled={refreshMut.isPending}
          >
            <RefreshCw className={cn("h-4 w-4 ml-1", refreshMut.isPending && "animate-spin")} />
            تحديث اللقطة الآن
          </GuardedButton>
          <PrintButton
            entityType="report_hr_saudization"
            entityId={sector}
            size="icon"
            payload={{
              entity: {
                title: `تقرير السعودة — ${sector}`,
                sector,
                saudizationPercent: current?.live?.saudizationPercent ?? "—",
                bandColor: (current?.live as any)?.bandColor ?? "—",
                period: current?.period ?? "—",
              },
              items: ((current?.live as any)?.byDepartment ?? []).map((d: any) => ({
                "القسم": d.department || "—",
                "إجمالي الموظفين": d.totalEmployees ?? 0,
                "سعوديون": d.saudiCount ?? 0,
                "نسبة السعودة (%)": d.saudizationPercent ?? "—",
              })),
            }}
          />
        </div>
      }
    >
      <HrTabsNav />
      {/* Hero status card */}
      <Card className={cn("mb-6 border-2", meta.bg)}>
        <CardContent className="py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">تصنيف الشركة في نطاقات</div>
              <div className={cn("text-5xl font-bold flex items-center gap-3", meta.color)}>
                <Award className="h-12 w-12" />
                {meta.label}
              </div>
              {live.exempt && (
                <div className="text-sm text-muted-foreground mt-2">
                  معفاة من نطاقات (أقل من 5 موظفين)
                </div>
              )}
            </div>
            <div className="text-left">
              <div className="text-sm text-muted-foreground mb-1">نسبة السعودة الحالية</div>
              <div className={cn("text-6xl font-bold", meta.color)}>
                {livePct.toFixed(2)}%
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {live.saudiEmployees} من {live.totalEmployees} موظف
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> إجمالي الموظفين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{live.totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-green-600" /> سعوديون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{live.saudiEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> غير سعوديين
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{live.nonSaudiEmployees}</div>
          </CardContent>
        </Card>
        <Link href="/hr/expiring-documents">
          <Card className={cn("cursor-pointer hover:shadow-md transition-shadow", iqamaCriticalCount > 0 && "border-red-300")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className={cn("h-4 w-4", iqamaCriticalCount > 0 ? "text-red-600" : "text-amber-600")} />
                إقامات تنتهي خلال 30 يوم
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", iqamaCriticalCount > 0 ? "text-red-700" : "text-amber-700")}>
                {iqamaExpiring.length}
              </div>
              {iqamaCriticalCount > 0 && (
                <div className="text-xs text-red-600 mt-1">
                  {iqamaCriticalCount} منها حرجة (≤14 يوم)
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Drift card — when live vs stored differ, surface it */}
      {stored && (driftSaudi !== 0 || driftTotal !== 0) && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
              <TrendingUp className="h-4 w-4" />
              فرق بين اللقطة المسجلة وعدد الموظفين الحالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">الإجمالي</div>
                <div className="font-bold">
                  {stored.totalEmployees} → {live.totalEmployees}{" "}
                  <span className={driftTotal >= 0 ? "text-green-700" : "text-red-700"}>
                    ({driftTotal >= 0 ? "+" : ""}{driftTotal})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">السعوديون</div>
                <div className="font-bold">
                  {stored.saudiEmployees} → {live.saudiEmployees}{" "}
                  <span className={driftSaudi >= 0 ? "text-green-700" : "text-red-700"}>
                    ({driftSaudi >= 0 ? "+" : ""}{driftSaudi})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">النسبة</div>
                <div className="font-bold">
                  {Number(stored.saudizationPercent).toFixed(2)}% → {livePct.toFixed(2)}%{" "}
                  <span className={driftPct >= 0 ? "text-green-700" : "text-red-700"}>
                    ({driftPct >= 0 ? "+" : ""}{driftPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
            <div className="text-xs text-amber-700 mt-3">
              اللقطة المسجلة بتاريخ {formatDateAr(stored.computedAt)}. الفرق ينعكس على
              التقرير الشهري المُسلَّم لوزارة الموارد البشرية. اضغط "تحديث اللقطة الآن"
              لمزامنة السجل مع الواقع الحالي.
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            تاريخ اللقطات الشهرية (آخر 12 شهر)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={historyData}
            columns={historyColumns}
            emptyMessage="لا توجد لقطات شهرية مسجلة بعد — المهمة المجدولة الشهرية تعمل أول كل شهر، أو اضغط 'تحديث اللقطة الآن'"
          />
        </CardContent>
      </Card>

      <div className="mt-6 text-xs text-muted-foreground bg-muted/30 p-4 rounded-md">
        <div className="font-semibold mb-1 flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          ملاحظات
        </div>
        <ul className="list-disc pr-4 space-y-0.5">
          <li>الجنسية تُحدد من حقل الجنسية في ملف الموظف (يقبل: "Saudi" / "SA" / "سعودي").</li>
          <li>الشركات التي عدد موظفيها أقل من 5 معفاة تلقائيًا من نطاقات.</li>
          <li>عتبات النطاقات تختلف حسب القطاع — تأكد من اختيار القطاع الصحيح أعلى الصفحة.</li>
          <li>اللقطات الرسمية تُحفظ تلقائيًا أول كل شهر عبر المهمة المجدولة.</li>
        </ul>
      </div>
    </PageShell>
  );
}
