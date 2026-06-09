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
import { AlertTriangle, Shield, Clock, Receipt, FileWarning, BookX, UserX } from "lucide-react";
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
  // §8 of #1870 — operational audit signals so the dashboard answers
  // "what's silently broken right now?" not just "who's overstaying?".
  failedImportRows30d?: number;
  missingNuskApJournals?: number;
  // §3 extension — pilgrims with ANY NULL FK (agent/group/sub-agent).
  // Catches legacy orphans from the pre-#1867 doImport era. Optional
  // for rolling-deploy safety with older API instances.
  orphanPilgrims?: number;
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
      // §8 of #1870 — operational audit signals.
      {
        key: "failed-imports",
        label: "صفوف استيراد مرفوضة (30 يوم)",
        value: data?.failedImportRows30d ?? 0,
        icon: FileWarning,
        tone: (data?.failedImportRows30d ?? 0) > 0
          ? "text-status-warning-foreground bg-status-warning-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        // Drill into the wizard's batch history; the operator can
        // open the failing batch from there to see the per-row
        // rejection reasons + download the rejected-rows CSV.
        href: `/umrah/import`,
        testid: "compliance-tile-failed-imports",
      },
      {
        key: "missing-nusk-ap",
        label: "فواتير نُسك بدون قيد ذمم",
        value: data?.missingNuskApJournals ?? 0,
        icon: BookX,
        tone: (data?.missingNuskApJournals ?? 0) > 0
          ? "text-status-error-foreground bg-status-error-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        // Drill into the nusk-invoices list; any PATCH to a row
        // there will idempotently post the missing AP JE via
        // postNuskJournalEntries (PR #1867).
        href: `/umrah/nusk-invoices`,
        testid: "compliance-tile-missing-nusk-ap",
      },
      // §3 extension — legacy orphans (#1870 review point 3.ب).
      // Drills into the global recovery screen; survives even when
      // the row has no umrah_import_changes audit lineage.
      {
        key: "orphan",
        label: "معتمرون يتامى (بلا ربط)",
        value: (data?.orphanPilgrims ?? 0),
        icon: UserX,
        tone: (data?.orphanPilgrims ?? 0) > 0
          ? "text-status-warning-foreground bg-status-warning-surface"
          : "text-status-neutral-foreground bg-status-neutral-surface",
        href: `/umrah/orphan-pilgrims`,
        testid: "compliance-tile-orphan",
      },
    ];
  }, [data, seasonFilter]);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const totalRisk =
    (data?.exempt ?? 0) +
    (data?.visaExpiringIn7d ?? 0) +
    (data?.currentlyOverstaying ?? 0) +
    (data?.unpaidPenaltiesCount ?? 0) +
    (data?.failedImportRows30d ?? 0) +
    (data?.missingNuskApJournals ?? 0) +
    (data?.orphanPilgrims ?? 0);

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
