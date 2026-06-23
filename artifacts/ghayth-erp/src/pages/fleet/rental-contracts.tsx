import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { statusLabel } from "@/lib/transport-status-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Plus, Car, User, Search, Calendar } from "lucide-react";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// #1812 Wave 1 Step C — rental contracts list.
//
// Renders the GET /fleet/rental-contracts response with the joined
// vehicle / client / driver labels added by migration 282 + the
// matching backend update. The four highlight states correspond to
// the canonical rental lifecycle:
//
//   draft     — created, not yet handed over (R0..R6)
//   active    — handed over, vehicle is with the customer (R7..R8)
//   completed — returned (R9..R10), Accounting Candidate eligible
//   cancelled — operator aborted before handover
//
// Within `active`, two derived sub-stages are surfaced visually so
// the operator can instantly see which rentals still need an action:
//
//   awaiting_handover — active AND handoverAt IS NULL  (R7 pending)
//   awaiting_return   — active AND handoverAt set AND returnedAt IS NULL  (R9 pending)
//
// Pure FE classification — the backend status enum stays at four
// values; sub-stage is computed from the inspection timestamps that
// migration 282 added (handoverAt / returnedAt).
//
// Finance numbers (totalAmount / overageAmount) are surfaced only to
// users with `fleet.vehicles:view`. The driver UI is finance-blackout
// (per the user's mandate), so it never reaches this page.

interface RentalRow {
  id: number;
  ref: string | null;
  vehicleId: number;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  clientId: number;
  clientName: string | null;
  driverId: number | null;
  driverName: string | null;
  withDriver: boolean;
  startDate: string;
  endDate: string | null;
  actualEndDate: string | null;
  dailyRate: string | null;
  totalAmount: string | null;
  securityDeposit: string | null;
  overageAmount: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  handoverAt: string | null;
  returnedAt: string | null;
}

type SubStage =
  | "draft"
  | "awaiting_handover"
  | "awaiting_return"
  | "completed"
  | "cancelled";

function classify(r: RentalRow): SubStage {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "completed") return "completed";
  if (r.status === "draft") return "draft";
  // status === "active" → split by inspection timestamps
  if (r.handoverAt == null) return "awaiting_handover";
  if (r.returnedAt == null) return "awaiting_return";
  // Active with both timestamps set is unexpected (return flips to
  // completed) — fall back to "awaiting_return" so it's still visible
  // somewhere actionable instead of disappearing.
  return "awaiting_return";
}

const SUB_STAGE_LABEL: Record<SubStage, string> = {
  draft:             "مسودّة",
  awaiting_handover: "في انتظار التسليم",
  awaiting_return:   "في انتظار الإرجاع",
  completed:         "مُغلق",
  cancelled:         "ملغى",
};

const SUB_STAGE_TONE: Record<SubStage, string> = {
  draft:             "bg-surface-subtle text-muted-foreground",
  awaiting_handover: "bg-amber-50 text-amber-700 border-amber-200",
  awaiting_return:   "bg-status-info-surface text-status-info-foreground",
  completed:         "bg-status-success-surface text-status-success-foreground",
  cancelled:         "bg-rose-50 text-rose-700",
};

// #2079 TA-T18-06 — filter labels sourced from the shared dictionary
// so any new rental contract status surfaces here in Arabic by default.
// The two derived sub-stages (awaiting_handover/awaiting_return) are
// classified client-side (#2001 / #2002) and live in the dictionary
// alongside the canonical server enum.
const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "الكل" },
  ...(["draft", "awaiting_handover", "awaiting_return", "active", "completed", "cancelled"] as const).map(
    (v) => ({ value: v, label: statusLabel("rental", v).label + (v === "active" ? " (كلاهما)" : "") }),
  ),
];

const DERIVED_SUB_STAGES = new Set<string>(["awaiting_handover", "awaiting_return"]);

export default function RentalContractsPage() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  // The two derived sub-stages don't exist as a backend status; we
  // fetch the full active set and narrow client-side via classify().
  const backendStatus = DERIVED_SUB_STAGES.has(status) ? "active" : status;
  const path = backendStatus === "all"
    ? "/fleet/rental-contracts?limit=500"
    : `/fleet/rental-contracts?status=${backendStatus}&limit=500`;
  const { data, isLoading, isError } = useApiQuery<{ data: RentalRow[] }>(
    ["fleet-rental-contracts", backendStatus],
    path,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;

  const rows = data.data.filter((r) => {
    // Derived sub-stage narrowing.
    if (DERIVED_SUB_STAGES.has(status) && classify(r) !== status) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.ref ?? "").toLowerCase().includes(q) ||
      (r.plateNumber ?? "").toLowerCase().includes(q) ||
      (r.clientName ?? "").toLowerCase().includes(q) ||
      (r.driverName ?? "").toLowerCase().includes(q)
    );
  });

  // KPI counts: backend gives raw status counts; we add the two
  // derived sub-stage counts on top. When the filter is `all`,
  // data.data is the whole list and all six counts are accurate.
  // When the filter narrows backend (e.g. `cancelled`), the two
  // active sub-stage counts will be 0 — that's intentional, the KPIs
  // reflect the loaded slice.
  const counts = data.data.reduce(
    (a, r) => {
      const sub = classify(r);
      a[sub]++;
      return a;
    },
    {
      draft: 0, awaiting_handover: 0, awaiting_return: 0,
      completed: 0, cancelled: 0,
    } as Record<SubStage, number>,
  );

  const columns: DataTableColumn<RentalRow>[] = [
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      render: (r) => (
        <Link href={`/fleet/rental-contracts/${r.id}`} asChild>
          <a className="text-status-info-foreground hover:underline">
            {r.ref ?? `#${r.id}`}
          </a>
        </Link>
      ),
    },
    {
      key: "plateNumber",
      header: "المركبة",
      render: (r) => (
        <>
          <div className="font-mono">{r.plateNumber ?? `#${r.vehicleId}`}</div>
          <div className="text-[10px] text-muted-foreground">
            {[r.make, r.model].filter(Boolean).join(" ")}
          </div>
        </>
      ),
    },
    {
      key: "clientName",
      header: "العميل",
      render: (r) => r.clientName ?? `#${r.clientId}`,
    },
    {
      key: "driverName",
      header: "السائق",
      className: "text-xs",
      render: (r) =>
        r.withDriver
          ? (r.driverName ?? `#${r.driverId}`)
          : <span className="text-muted-foreground">بدون سائق</span>,
    },
    {
      key: "startDate",
      header: "المدة",
      className: "text-xs",
      render: (r) => (
        <>
          <div className="font-mono">{r.startDate}</div>
          <div className="text-[10px] text-muted-foreground">
            → {r.actualEndDate ?? r.endDate ?? "—"}
          </div>
        </>
      ),
    },
    {
      key: "totalAmount",
      header: "القيمة",
      className: "font-mono text-xs",
      render: (r) =>
        r.totalAmount ? Number(r.totalAmount).toLocaleString("ar-SA") : "—",
    },
    {
      key: "securityDeposit",
      header: "الوديعة",
      className: "font-mono text-xs",
      render: (r) =>
        r.securityDeposit ? Number(r.securityDeposit).toLocaleString("ar-SA") : "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => (
        <Badge variant="outline" className={`${SUB_STAGE_TONE[classify(r)]} text-[10px]`}>
          {SUB_STAGE_LABEL[classify(r)]}
        </Badge>
      ),
    },
  ];

  return (
    <PageShell
      title="تأجير المركبات"
      subtitle="عقود إيجار المركبات للعملاء — التسليم، الإرجاع، احتساب الزائد"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { label: "تأجير المركبات" },
      ]}
      actions={
        <Button asChild size="sm"><Link href="/fleet/rental-contracts/create">
            <Plus className="h-4 w-4 me-1" />عقد جديد
          </Link></Button>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="مسودّة"              value={counts.draft}              tone="muted"   onClick={() => setStatus("draft")}             active={status === "draft"} />
        <KpiCard label="في انتظار التسليم"   value={counts.awaiting_handover}  tone="amber"   onClick={() => setStatus("awaiting_handover")} active={status === "awaiting_handover"} />
        <KpiCard label="في انتظار الإرجاع"   value={counts.awaiting_return}    tone="info"    onClick={() => setStatus("awaiting_return")}   active={status === "awaiting_return"} />
        <KpiCard label="مُغلق"               value={counts.completed}          tone="success" onClick={() => setStatus("completed")}         active={status === "completed"} />
        <KpiCard label="ملغى"                value={counts.cancelled}          tone="rose"    onClick={() => setStatus("cancelled")}         active={status === "cancelled"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute right-2 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم اللوحة / العميل / السائق / المرجع…"
            className="ps-8"
          />
        </div>
      </div>

      <Card className="mt-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{rows.length} عقد</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={rows}
            noToolbar
            emptyMessage="لا توجد عقود مطابقة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  tone: "muted" | "amber" | "info" | "success" | "rose";
  onClick?: () => void;
  active?: boolean;
}

function KpiCard({ label, value, tone, onClick, active }: KpiCardProps) {
  const toneClass: Record<KpiCardProps["tone"], string> = {
    muted:   "text-muted-foreground",
    amber:   "text-amber-600",
    info:    "text-status-info-foreground",
    success: "text-status-success-foreground",
    rose:    "text-rose-600",
  };
  const ringClass: Record<KpiCardProps["tone"], string> = {
    muted:   "ring-muted-foreground/40",
    amber:   "ring-amber-300",
    info:    "ring-status-info-foreground/40",
    success: "ring-status-success-foreground/40",
    rose:    "ring-rose-300",
  };
  return (
    <Card
      onClick={onClick}
      className={`${onClick ? "cursor-pointer hover:bg-surface-subtle transition-colors" : ""} ${active ? `ring-2 ${ringClass[tone]}` : ""}`}
    >
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 font-mono ${toneClass[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
