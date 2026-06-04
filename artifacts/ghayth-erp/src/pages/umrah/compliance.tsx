import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { AlertTriangle, Shield, Clock, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// لوحة الامتثال — يجمع 4 أرقام كانت موزعة على صفحات مختلفة (المستثنون،
// التأشيرات المنتهية، المتأخرون، الغرامات غير المسددة). يجاوب على سؤال
// مسؤول الامتثال: «ما هو حجم المخاطر اليوم؟» في طلب واحد. الفلتر
// الاختياري بـ ?seasonId يحصر الأرقام بموسم واحد.

interface ComplianceResp {
  exempt: number;
  visaExpiringIn7d: number;
  currentlyOverstaying: number;
  unpaidPenaltiesCount: number;
  unpaidPenaltiesTotal: number;
}

interface SeasonOpt { id: number; title: string }

export default function UmrahComplianceDashboard() {
  const [seasonFilter, setSeasonFilter] = useState("all");

  const qs = seasonFilter && seasonFilter !== "all" ? `?seasonId=${seasonFilter}` : "";
  const { data, isLoading, isError, refetch } = useApiQuery<ComplianceResp>(
    ["umrah-compliance", seasonFilter],
    `/umrah/reports/compliance${qs}`,
  );

  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );

  const seasons = seasonsResp?.data ?? [];

  // KPI tile configuration — each tile is a clickable link to the
  // matching deep-link list page so the officer can drill straight
  // into the cases (not just the count).
  const tiles = useMemo(() => {
    const seasonParam = seasonFilter !== "all" ? `?seasonId=${seasonFilter}` : "";
    const seasonAmp   = seasonFilter !== "all" ? `&seasonId=${seasonFilter}` : "";
    return [
      {
        key: "exempt",
        label: "المستثنون من مسح التأخّر",
        value: data?.exempt ?? 0,
        icon: Shield,
        tone: "text-status-info-foreground bg-status-info-surface",
        href: `/umrah/exempt-pilgrims${seasonParam}`,
        testid: "compliance-tile-exempt",
      },
      {
        key: "visa",
        label: "تأشيرات تنتهي خلال 7 أيام",
        value: data?.visaExpiringIn7d ?? 0,
        icon: AlertTriangle,
        tone: (data?.visaExpiringIn7d ?? 0) > 0
          ? "text-status-warning-foreground bg-status-warning-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        // The list endpoint accepts `visaExpiringWithin` (numeric days),
        // not `visaExpiring=7d` — original deep-link from #1502 used the
        // wrong param name + value shape and silently fell through.
        href: `/umrah/pilgrims?visaExpiringWithin=7${seasonAmp}`,
        testid: "compliance-tile-visa",
      },
      {
        key: "overstay",
        label: "متأخرون حالياً",
        value: data?.currentlyOverstaying ?? 0,
        icon: Clock,
        tone: (data?.currentlyOverstaying ?? 0) > 0
          ? "text-status-error-foreground bg-status-error-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        href: `/umrah/pilgrims?status=overstayed${seasonAmp}`,
        testid: "compliance-tile-overstay",
      },
      {
        key: "penalties",
        label: "غرامات غير مسددة",
        value: data?.unpaidPenaltiesCount ?? 0,
        icon: Receipt,
        tone: (data?.unpaidPenaltiesCount ?? 0) > 0
          ? "text-status-error-foreground bg-status-error-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        href: `/umrah/penalties?status=pending${seasonAmp}`,
        testid: "compliance-tile-penalties",
        sub: data?.unpaidPenaltiesTotal != null
          ? formatCurrency(Number(data.unpaidPenaltiesTotal))
          : null,
      },
    ];
  }, [data, seasonFilter]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const totalRisk =
    (data?.exempt ?? 0) +
    (data?.visaExpiringIn7d ?? 0) +
    (data?.currentlyOverstaying ?? 0) +
    (data?.unpaidPenaltiesCount ?? 0);

  return (
    <PageShell
      title="لوحة الامتثال — عمرة"
      subtitle="نظرة موحدة على الاستثناءات والتأشيرات المنتهية والمتأخرين والغرامات"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "لوحة الامتثال" }]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[220px]" data-testid="compliance-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mr-auto flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
            <span className="text-muted-foreground">إجمالي حالات التعرّض:</span>
            <span className="font-bold text-lg" data-testid="compliance-total-risk">{totalRisk}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Link key={t.key} href={t.href} data-testid={t.testid}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${t.tone}`}>
                  <t.icon className="h-4 w-4" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t.label}</p>
                <p
                  className="text-3xl font-bold mt-1"
                  data-testid={`${t.testid}-value`}
                >
                  {t.value}
                </p>
                {"sub" in t && t.sub && (
                  <p className="text-xs text-muted-foreground mt-1" data-testid={`${t.testid}-sub`}>
                    {t.sub}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">روابط سريعة للإجراءات</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
          <Link href="/umrah/exempt-pilgrims" className="text-blue-600 hover:underline">
            → إدارة الاستثناءات (قائمة كاملة + إلغاء جماعي)
          </Link>
          <Link href="/umrah/daily-runsheet" className="text-blue-600 hover:underline">
            → كشف اليوم (وصول/مغادرة/متأخرون)
          </Link>
          <Link href="/umrah/penalties" className="text-blue-600 hover:underline">
            → الغرامات (إصدار / إعفاء / تحصيل)
          </Link>
          <Link href="/umrah/reconciliation" className="text-blue-600 hover:underline">
            → تقرير المطابقة (فجوات نسك مقابل النظام)
          </Link>
        </CardContent>
      </Card>
    </PageShell>
  );
}
