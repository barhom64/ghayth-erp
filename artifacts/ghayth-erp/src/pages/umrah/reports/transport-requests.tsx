/**
 * Umrah Transport Report — §11 stub conversion (#1870)
 *
 * Lists every transport_bookings row tied to an umrah group. Each
 * row shows the booking + linked group/agent context + status +
 * flight number. The fleet engine doesn't yet write vehicleId /
 * driverId / actualCost back onto bookings (§7 Phase 2 work), so
 * those fields show "—" for now — the operator at least sees what
 * the umrah module submitted via the Service Contract from PR #1902.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Bus } from "lucide-react";

interface TransportRow {
  bookingId: number;
  bookingNumber: string;
  status: string;
  routeType: string | null;
  fromLocation: string | null;
  toLocation: string | null;
  requestedPickupDate: string | null;
  passengerCount: number | null;
  flightNumber: string | null;
  groupId: number | null;
  groupName: string | null;
  nuskGroupNumber: string | null;
  agentId: number | null;
  agentName: string | null;
  seasonId: number | null;
}

interface TransportResp {
  data: TransportRow[];
  counts: Record<string, number>;
  total: number;
}

interface SeasonOpt { id: number; title: string }

const STATUS_LABEL_AR: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  scheduled: "مجدول",
  dispatched: "مُكلَّف",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغي",
  rejected: "مرفوض",
};

const STATUS_TONE: Record<string, string> = {
  draft:            "bg-slate-100 text-slate-700 border-slate-300",
  submitted:        "bg-sky-100 text-sky-700 border-sky-300",
  pending_approval: "bg-amber-100 text-amber-700 border-amber-300",
  approved:         "bg-emerald-100 text-emerald-700 border-emerald-300",
  scheduled:        "bg-sky-100 text-sky-700 border-sky-300",
  dispatched:       "bg-indigo-100 text-indigo-700 border-indigo-300",
  in_progress:      "bg-blue-100 text-blue-700 border-blue-300",
  completed:        "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled:        "bg-rose-100 text-rose-700 border-rose-300",
  rejected:         "bg-rose-100 text-rose-700 border-rose-300",
};

export default function UmrahTransportReport() {
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const qsParts: string[] = [];
  if (seasonFilter !== "all") qsParts.push(`seasonId=${seasonFilter}`);
  if (statusFilter !== "all") qsParts.push(`status=${statusFilter}`);
  const qs = qsParts.length ? `?${qsParts.join("&")}` : "";

  const { data, isLoading, isError, refetch } = useApiQuery<TransportResp>(
    ["umrah-transport-report", seasonFilter, statusFilter],
    `/umrah/reports/umrah-transport${qs}`,
  );
  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const seasons = seasonsResp?.data ?? [];
  const rows = data?.data ?? [];
  const counts = data?.counts ?? {};

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <PageShell
      title="تقرير النقل المرتبط بالعمرة"
      subtitle="كل طلب نقل عبر العقد الخدمي + الحالة + المجموعة والوكيل المرتبطان"
      breadcrumbs={[
        { href: "/umrah", label: "إدارة العمرة" },
        { href: "/umrah/reports", label: "التقارير" },
        { label: "تقرير النقل" },
      ]}
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[200px]" data-testid="transport-filter-season">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الحالة</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="transport-filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABEL_AR).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mr-auto flex items-center gap-2 text-sm">
            <Bus className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">إجمالي:</span>
            <span className="font-bold text-lg" data-testid="transport-total">{data?.total ?? 0}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" data-testid="transport-status-counts">
        {Object.entries(counts).map(([status, count]) => {
          const tone = STATUS_TONE[status] ?? STATUS_TONE.draft;
          return (
            <span
              key={status}
              className={`text-xs px-2 py-1 rounded border ${tone}`}
              data-testid={`transport-count-${status}`}
            >
              {STATUS_LABEL_AR[status] ?? status}: <b>{count}</b>
            </span>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <DataTable<TransportRow>
            data={rows}
            rowKey={(r) => String(r.bookingId)}
            noToolbar
            pageSize={0}
            emptyMessage="لا طلبات نقل تطابق الفلاتر."
            columns={[
              { key: "bookingNumber", header: "رقم الطلب", className: "font-mono text-xs" },
              { key: "groupId", header: "المجموعة", render: (r) => r.groupId ? <Link href={`/umrah/groups/${r.groupId}`} className="text-blue-600 hover:underline">{r.groupName ?? r.nuskGroupNumber ?? `#${r.groupId}`}</Link> : "—" },
              { key: "agentId", header: "الوكيل", render: (r) => r.agentId ? <Link href={`/umrah/agents/${r.agentId}`} className="text-blue-600 hover:underline">{r.agentName ?? `#${r.agentId}`}</Link> : "—" },
              { key: "fromLocation", header: "المسار", render: (r) => <span className="text-xs">{r.fromLocation} ← {r.toLocation}</span> },
              { key: "requestedPickupDate", header: "التاريخ", render: (r) => <span className="text-xs">{r.requestedPickupDate ?? "—"}</span> },
              { key: "passengerCount", header: "عدد الركاب", align: "end" as const, className: "font-mono", render: (r) => r.passengerCount ?? "—" },
              { key: "flightNumber", header: "الرحلة", render: (r) => <span className="text-xs">{r.flightNumber ?? "—"}</span> },
              { key: "status", header: "الحالة", render: (r) => { const tone = STATUS_TONE[r.status] ?? STATUS_TONE.draft; return <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${tone}`}>{STATUS_LABEL_AR[r.status] ?? r.status}</span>; } },
            ] satisfies DataTableColumn<TransportRow>[]}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}