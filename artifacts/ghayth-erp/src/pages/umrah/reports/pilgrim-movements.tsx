import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { PlaneTakeoff, PlaneLanding, AlertTriangle, Clock, MapPin, Calendar } from "lucide-react";
import { todayLocal, formatUmrahDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";

// تقرير حركة المعتمرين — لقطة يومية: من اللي وصل، من اللي طلع، المتجاوز،
// المتأخر عن المغادرة. مع drill-down اختياري لرؤية الأسماء.

interface KPIs {
  arrivedToday: number;
  departedToday: number;
  currentlyOverstaying: number;
  insideKingdom: number;
  lateDepartures: number;
  withOverstayDays: number;
}

interface DetailRow {
  id: number;
  fullName: string;
  nationality: string | null;
  status: string;
  entryPort?: string | null;
  entryFlight?: string | null;
  exitPort?: string | null;
  exitFlight?: string | null;
  overstayDays?: number | null;
  departureDate?: string | null;
  daysOverdue?: number | null;
}

interface MovementsResp {
  kpis: KPIs;
  details: {
    arrived: DetailRow[];
    departed: DetailRow[];
    overstaying: DetailRow[];
    lateDepartures: DetailRow[];
  } | null;
}

interface SeasonOpt { id: number; title: string }

const PILGRIM_STATUS_LABELS: Record<string, string> = {
  pending: "لم يصل",
  arrived: "وصل",
  active: "نشط",
  overstayed: "متأخر",
  overstay_penalized: "متأخر مع غرامة",
  departed: "غادر",
  cancelled: "ملغي",
};

export default function UmrahPilgrimMovementsReport() {
  const [date, setDate] = useState(todayLocal());
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [showDetails, setShowDetails] = useState(false);

  const qs = useMemo(() => {
    const parts: string[] = [`date=${date}`];
    if (seasonFilter !== "all") parts.push(`seasonId=${seasonFilter}`);
    if (showDetails) parts.push("view=details");
    return `?${parts.join("&")}`;
  }, [date, seasonFilter, showDetails]);

  const { data, isLoading, isError, refetch } = useApiQuery<MovementsResp>(
    ["umrah-pilgrim-movements", date, seasonFilter, String(showDetails)],
    `/umrah/reports/pilgrim-movements${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const seasons = seasonsResp?.data ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const k = data?.kpis ?? {
    arrivedToday: 0, departedToday: 0, currentlyOverstaying: 0,
    insideKingdom: 0, lateDepartures: 0, withOverstayDays: 0,
  };

  // 6 KPI tiles — اللوحة الرئيسية للحركة. كل عدد > 0 يلوّن للتنبيه.
  const kpis = [
    { key: "arrived", label: "وصلوا اليوم", value: k.arrivedToday, icon: PlaneLanding, tone: "text-status-info-foreground bg-status-info-surface" },
    { key: "departed", label: "غادروا اليوم", value: k.departedToday, icon: PlaneTakeoff, tone: "text-status-success-foreground bg-status-success-surface" },
    { key: "inside", label: "داخل المملكة الآن", value: k.insideKingdom, icon: MapPin, tone: "text-status-info-foreground bg-status-info-surface" },
    {
      key: "overstaying", label: "متجاوزون حالياً", value: k.currentlyOverstaying, icon: Clock,
      tone: k.currentlyOverstaying > 0 ? "text-status-error-foreground bg-status-error-surface" : "text-status-neutral-foreground bg-status-neutral-surface",
    },
    {
      key: "late", label: "متأخرون عن المغادرة", value: k.lateDepartures, icon: AlertTriangle,
      tone: k.lateDepartures > 0 ? "text-status-warning-foreground bg-status-warning-surface" : "text-status-neutral-foreground bg-status-neutral-surface",
    },
    {
      key: "withOverstay", label: "بأيام تجاوز مسجَّلة", value: k.withOverstayDays, icon: Calendar,
      tone: "text-status-neutral-foreground bg-status-neutral-surface",
    },
  ];

  return (
    <PageShell
      title="حركة المعتمرين — تقرير يومي"
      subtitle="وصول / مغادرة / تجاوز / متأخر عن المغادرة"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "حركة المعتمرين" }]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">التاريخ</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px]"
              data-testid="pilgrim-movements-filter-date"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[200px]" data-testid="pilgrim-movements-filter-season">
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
          <Button
            variant={showDetails ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            data-testid="pilgrim-movements-toggle-details"
            className="mr-auto"
          >
            {showDetails ? "إخفاء التفاصيل" : "عرض الأسماء"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((tile) => (
          <Card key={tile.key}>
            <CardContent className="p-4">
              <div className={`inline-flex h-8 w-8 items-center justify-center rounded ${tile.tone}`}>
                <tile.icon className="h-4 w-4" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{tile.label}</p>
              <p
                className="text-2xl font-bold mt-1"
                data-testid={`pilgrim-movements-kpi-${tile.key}`}
              >
                {tile.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* drill-down — يظهر فقط لو طلب العامل التفاصيل */}
      {showDetails && data?.details && (
        <div className="grid lg:grid-cols-2 gap-4">
          <DetailCard
            title={`وصلوا اليوم (${data.details.arrived.length})`}
            testid="pilgrim-movements-arrived-card"
            icon={PlaneLanding}
            rows={data.details.arrived}
            columns={["fullName", "nationality", "entryPort", "entryFlight"]}
          />
          <DetailCard
            title={`غادروا اليوم (${data.details.departed.length})`}
            testid="pilgrim-movements-departed-card"
            icon={PlaneTakeoff}
            rows={data.details.departed}
            columns={["fullName", "nationality", "exitPort", "exitFlight"]}
          />
          <DetailCard
            title={`متجاوزون حالياً (${data.details.overstaying.length})`}
            testid="pilgrim-movements-overstaying-card"
            icon={Clock}
            rows={data.details.overstaying}
            columns={["fullName", "nationality", "overstayDays", "status"]}
            tone="error"
          />
          <DetailCard
            title={`متأخرون عن المغادرة (${data.details.lateDepartures.length})`}
            testid="pilgrim-movements-late-card"
            icon={AlertTriangle}
            rows={data.details.lateDepartures}
            columns={["fullName", "nationality", "departureDate", "daysOverdue"]}
            tone="warning"
          />
        </div>
      )}
    </PageShell>
  );
}

interface DetailCardProps {
  title: string;
  testid: string;
  icon: any;
  rows: DetailRow[];
  columns: Array<keyof DetailRow>;
  tone?: "default" | "warning" | "error";
}

const COL_LABELS: Record<string, string> = {
  fullName: "الاسم",
  nationality: "الجنسية",
  entryPort: "ميناء الدخول",
  entryFlight: "رحلة الدخول",
  exitPort: "ميناء الخروج",
  exitFlight: "رحلة الخروج",
  overstayDays: "أيام التجاوز",
  status: "الحالة",
  departureDate: "موعد المغادرة",
  daysOverdue: "متأخر بأيام",
};

function DetailCard({ title, testid, icon: Icon, rows, columns, tone }: DetailCardProps) {
  const borderClass =
    tone === "error" ? "border-status-error-surface" :
    tone === "warning" ? "border-status-warning-surface" :
    "";

  return (
    <Card className={borderClass} data-testid={testid}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">لا يوجد سجلات</p>
        ) : (
          <div className="overflow-x-auto max-h-96">
            <DataTable<DetailRow>
              className="text-xs"
              data={rows}
              pageSize={0}
              noToolbar
              columns={columns.map<DataTableColumn<DetailRow>>((c) => {
                const header = COL_LABELS[String(c)] || String(c);
                if (c === "fullName") {
                  return {
                    key: String(c),
                    header,
                    render: (r) => (
                      <Link href={`/umrah/pilgrims/${r.id}`} className="text-blue-600 hover:underline">
                        {String(r[c] ?? "—")}
                      </Link>
                    ),
                    exportValue: (r) => String(r[c] ?? "—"),
                  };
                }
                if (c === "status") {
                  return {
                    key: String(c),
                    header,
                    render: (r) => (
                      <Badge variant="outline" className="text-[10px]">
                        {PILGRIM_STATUS_LABELS[String(r[c] ?? "")] || String(r[c] ?? "—")}
                      </Badge>
                    ),
                    exportValue: (r) => PILGRIM_STATUS_LABELS[String(r[c] ?? "")] || String(r[c] ?? "—"),
                  };
                }
                if (c === "departureDate") {
                  return {
                    key: String(c),
                    header,
                    render: (r) => (r[c] ? formatUmrahDate(String(r[c])) : "—"),
                  };
                }
                if (c === "overstayDays" || c === "daysOverdue") {
                  return {
                    key: String(c),
                    header,
                    className: "font-bold text-status-error-foreground",
                    render: (r) => {
                      const n = Number(r[c] ?? 0);
                      return n > 0 ? n : "—";
                    },
                    exportValue: (r) => Number(r[c] ?? 0),
                  };
                }
                return {
                  key: String(c),
                  header,
                  render: (r) => String(r[c] ?? "—"),
                };
              })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
