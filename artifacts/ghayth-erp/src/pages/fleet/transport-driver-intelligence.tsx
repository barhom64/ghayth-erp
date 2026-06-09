import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@workspace/ui-core";
import {
  Trophy, Truck, Package, Users, Sparkles, Clock, AlertTriangle, ArrowLeft,
} from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// #1812 follow-up — Driver Intelligence leaderboard.
//
// User's evaluation: "السائق ما زال منفذ. أنا أريد:
//   سائق ممتاز للعمرة / للحمولات / يتأخر كثيرًا / ينجز أكثر،
//   ثم يدخل ذلك في الاقتراح."
//
// This page renders the fleet-wide leaderboard surfaced by
// GET /fleet/drivers/intelligence. It answers four questions at a glance:
//   1. Who is the best driver for each specialty (umrah / cargo / passenger)?
//   2. Who delivers the most trips with the highest completion?
//   3. Who runs chronically late?
//   4. Who has not picked up a trip lately?

interface DriverStat {
  driverId: number;
  dispatchCount: number;
  startRate: number;
  completionRate: number;
  onTimeRate: number;
  avgLateMinutes: number;
  serviceMix: {
    cargo: number;
    umrah: number;
    passenger: number;
    rental: number;
    other: number;
  };
  reputationScore: number;
  specialty: "umrah" | "cargo" | "passenger" | "mixed" | "new";
}

const SPECIALTY_LABEL: Record<DriverStat["specialty"], string> = {
  umrah: "متخصّص في العمرة",
  cargo: "متخصّص في الحمولات",
  passenger: "متخصّص في نقل الركاب",
  mixed: "متعدد التخصصات",
  new: "حديث",
};

const SPECIALTY_TONE: Record<DriverStat["specialty"], string> = {
  umrah:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  cargo:     "bg-amber-50 text-amber-700 border-amber-200",
  passenger: "bg-status-info-surface text-status-info-foreground",
  mixed:     "bg-purple-50 text-purple-700",
  new:       "bg-surface-subtle text-muted-foreground",
};

const SPECIALTY_ICON: Record<DriverStat["specialty"], React.ComponentType<{ className?: string }>> = {
  umrah:     Sparkles,
  cargo:     Package,
  passenger: Users,
  mixed:     Truck,
  new:       Users,
};

function reputationTone(score: number): string {
  if (score >= 80) return "text-status-success-foreground";
  if (score >= 60) return "text-status-warning-foreground";
  if (score >= 40) return "text-amber-600";
  return "text-rose-600";
}

function reputationBg(score: number): string {
  if (score >= 80) return "bg-status-success-surface";
  if (score >= 60) return "bg-status-warning-surface";
  if (score >= 40) return "bg-amber-50";
  return "bg-rose-50";
}

interface DriverDirectoryEntry {
  id: number;
  firstName: string | null;
  lastName: string | null;
  fullName?: string | null;
}

const WINDOWS: Array<{ value: number; label: string }> = [
  { value: 30,  label: "آخر 30 يومًا" },
  { value: 90,  label: "آخر 90 يومًا" },
  { value: 180, label: "آخر 180 يومًا" },
  { value: 365, label: "آخر سنة" },
];

export default function TransportDriverIntelligencePage() {
  const [windowDays, setWindowDays] = useState<number>(90);
  const stats = useApiQuery<{ data: DriverStat[]; windowDays: number }>(
    ["fleet-driver-intelligence", String(windowDays)],
    `/fleet/drivers/intelligence?windowDays=${windowDays}`,
  );
  const directory = useApiQuery<{ data: DriverDirectoryEntry[] }>(
    ["fleet-drivers-directory"],
    `/fleet/drivers?limit=500`,
  );

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of directory.data?.data ?? []) {
      const name = d.fullName?.trim()
        || [d.firstName, d.lastName].filter(Boolean).join(" ").trim()
        || `سائق #${d.id}`;
      map.set(d.id, name);
    }
    return map;
  }, [directory.data]);

  if (stats.isLoading) return <LoadingSpinner />;
  if (stats.isError || !stats.data?.data) return <ErrorState />;

  const rows = stats.data.data;
  const driverName = (id: number) => nameById.get(id) ?? `سائق #${id}`;

  const bestUmrah     = rows.find((r) => r.specialty === "umrah");
  const bestCargo     = rows.find((r) => r.specialty === "cargo");
  const bestPassenger = rows.find((r) => r.specialty === "passenger");
  const mostProductive = [...rows].sort((a, b) => b.dispatchCount - a.dispatchCount)[0];
  const chronicLate    = [...rows]
    .filter((r) => r.dispatchCount >= 5 && r.onTimeRate < 50)
    .sort((a, b) => a.onTimeRate - b.onTimeRate)[0];

  return (
    <PageShell
      title="ذكاء السائقين"
      subtitle="ترتيب السائقين حسب الالتزام، الإنجاز، والتخصص — يُغذّي محرك اقتراح الإسناد"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/drivers", label: "السائقون" },
        { label: "ذكاء السائقين" },
      ]}
      actions={
        <Link href="/fleet/transport/ops-dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 me-1" />لوحة تشغيل اليوم
          </Button>
        </Link>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">النافذة الزمنية:</span>
        {WINDOWS.map((w) => (
          <Button
            key={w.value}
            variant={windowDays === w.value ? "default" : "outline"}
            size="sm"
            onClick={() => setWindowDays(w.value)}
            className="h-8"
          >
            {w.label}
          </Button>
        ))}
      </div>

      {/* Highlight cards — the four answers the user explicitly asked for */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <HighlightCard
          icon={Sparkles}
          tone="emerald"
          label="الأفضل للعمرة"
          driver={bestUmrah}
          nameOf={driverName}
          metric={bestUmrah ? `${bestUmrah.onTimeRate}% التزام` : "—"}
        />
        <HighlightCard
          icon={Package}
          tone="amber"
          label="الأفضل للحمولات"
          driver={bestCargo}
          nameOf={driverName}
          metric={bestCargo ? `${bestCargo.completionRate}% إنجاز` : "—"}
        />
        <HighlightCard
          icon={Trophy}
          tone="success"
          label="الأكثر إنجازًا"
          driver={mostProductive}
          nameOf={driverName}
          metric={mostProductive ? `${mostProductive.dispatchCount} رحلة` : "—"}
        />
        <HighlightCard
          icon={AlertTriangle}
          tone="rose"
          label="يتأخّر كثيرًا"
          driver={chronicLate}
          nameOf={driverName}
          metric={chronicLate ? `${chronicLate.onTimeRate}% فقط ملتزم` : "لا يوجد"}
        />
      </div>

      {/* Leaderboard */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            الترتيب العام حسب السمعة
            <span className="ms-auto text-xs font-normal text-muted-foreground">
              {rows.length} سائقًا · النافذة {windowDays} يومًا
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">#</th>
                  <th className="px-3 py-2 text-start">السائق</th>
                  <th className="px-3 py-2 text-start">التخصص</th>
                  <th className="px-3 py-2 text-start">سمعة</th>
                  <th className="px-3 py-2 text-start">رحلات</th>
                  <th className="px-3 py-2 text-start">انطلاق</th>
                  <th className="px-3 py-2 text-start">إنجاز</th>
                  <th className="px-3 py-2 text-start">التزام</th>
                  <th className="px-3 py-2 text-start">متوسط التأخّر</th>
                  <th className="px-3 py-2 text-start">المزيج</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-6 text-muted-foreground text-sm">
                      لا توجد بيانات سائقين في هذه النافذة
                    </td>
                  </tr>
                ) : rows.map((r, idx) => {
                  const SpecIcon = SPECIALTY_ICON[r.specialty];
                  return (
                    <tr key={r.driverId} className="border-t hover:bg-surface-subtle">
                      <td className="px-3 py-2 font-mono text-xs">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/fleet/drivers/${r.driverId}`}>
                          <a className="text-status-info-foreground hover:underline font-medium">
                            {driverName(r.driverId)}
                          </a>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`${SPECIALTY_TONE[r.specialty]} text-[10px]`}>
                          <SpecIcon className="h-3 w-3 me-1" />
                          {SPECIALTY_LABEL[r.specialty]}
                        </Badge>
                      </td>
                      <td className={`px-3 py-2 font-mono font-bold ${reputationTone(r.reputationScore)}`}>
                        {r.reputationScore}
                      </td>
                      <td className="px-3 py-2 font-mono">{r.dispatchCount}</td>
                      <td className="px-3 py-2 font-mono">{r.startRate}%</td>
                      <td className="px-3 py-2 font-mono">{r.completionRate}%</td>
                      <td className={`px-3 py-2 font-mono ${r.onTimeRate < 50 ? "text-rose-600" : ""}`}>
                        {r.onTimeRate}%
                      </td>
                      <td className="px-3 py-2 font-mono inline-flex items-center gap-1">
                        {r.avgLateMinutes > 0 && <Clock className="h-3 w-3 text-rose-500" />}
                        {r.avgLateMinutes > 0 ? `${r.avgLateMinutes}د` : "—"}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">
                        <MixDots mix={r.serviceMix} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
        السمعة = 0.4 × الالتزام + 0.4 × الإنجاز + 0.2 × معدل الانطلاق.
        التخصص يُحدّد تلقائيًا إذا تجاوز نوع خدمة واحد 60% من إجمالي رحلات السائق في النافذة الزمنية.
        السائقون الجدد (بدون أي رحلة منطلقة) يحصلون على 0 — محرك الاقتراح يحايد هذا.
      </div>
    </PageShell>
  );
}

interface HighlightCardProps {
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber" | "success" | "rose";
  label: string;
  driver: DriverStat | undefined;
  nameOf: (id: number) => string;
  metric: string;
}

function HighlightCard({ icon: Icon, tone, label, driver, nameOf, metric }: HighlightCardProps) {
  const borderTone: Record<HighlightCardProps["tone"], string> = {
    emerald: "border-emerald-200",
    amber:   "border-amber-200",
    success: "border-status-success-foreground/30",
    rose:    "border-rose-200",
  };
  const iconTone: Record<HighlightCardProps["tone"], string> = {
    emerald: "text-emerald-600",
    amber:   "text-amber-600",
    success: "text-status-success-foreground",
    rose:    "text-rose-600",
  };
  return (
    <Card className={borderTone[tone]}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Icon className={`h-3 w-3 ${iconTone[tone]}`} />
          {label}
        </div>
        {driver ? (
          <>
            <Link href={`/fleet/drivers/${driver.driverId}`}>
              <a className="text-base font-bold mt-1 block text-status-info-foreground hover:underline">
                {nameOf(driver.driverId)}
              </a>
            </Link>
            <div className={`text-xs mt-1 font-mono ${reputationBg(driver.reputationScore)} inline-block px-2 py-0.5 rounded-md ${reputationTone(driver.reputationScore)}`}>
              سمعة {driver.reputationScore}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{metric}</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground mt-2">— لا يوجد</div>
        )}
      </CardContent>
    </Card>
  );
}

function MixDots({ mix }: { mix: DriverStat["serviceMix"] }) {
  const total = mix.cargo + mix.umrah + mix.passenger + mix.rental + mix.other;
  if (total === 0) return <span>—</span>;
  const items: Array<[string, number, string]> = [
    ["عمرة",  mix.umrah,     "bg-emerald-500"],
    ["حمولة", mix.cargo,     "bg-amber-500"],
    ["ركاب",  mix.passenger, "bg-status-info-foreground"],
    ["تأجير", mix.rental,    "bg-purple-500"],
    ["أخرى",  mix.other,     "bg-muted-foreground"],
  ];
  return (
    <div className="inline-flex items-center gap-1">
      {items.filter(([, n]) => n > 0).map(([label, n, color]) => (
        <span key={label} className="inline-flex items-center gap-0.5" title={`${label}: ${n}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
          <span className="font-mono">{n}</span>
        </span>
      ))}
    </div>
  );
}
