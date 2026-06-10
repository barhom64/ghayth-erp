import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@workspace/ui-core";
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

const STATUS_LABEL: Record<RentalRow["status"], string> = {
  draft:     "مسودّة",
  active:    "فعّال",
  completed: "مُغلق",
  cancelled: "ملغى",
};
const STATUS_TONE: Record<RentalRow["status"], string> = {
  draft:     "bg-surface-subtle text-muted-foreground",
  active:    "bg-status-warning-surface text-status-warning-foreground",
  completed: "bg-status-success-surface text-status-success-foreground",
  cancelled: "bg-rose-50 text-rose-700",
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all",       label: "الكل" },
  { value: "draft",     label: "مسودّة" },
  { value: "active",    label: "فعّال" },
  { value: "completed", label: "مُغلق" },
];

export default function RentalContractsPage() {
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const path = status === "all"
    ? "/fleet/rental-contracts?limit=500"
    : `/fleet/rental-contracts?status=${status}&limit=500`;
  const { data, isLoading, isError } = useApiQuery<{ data: RentalRow[] }>(
    ["fleet-rental-contracts", status],
    path,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data?.data) return <ErrorState />;

  const rows = data.data.filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (r.ref ?? "").toLowerCase().includes(q) ||
      (r.plateNumber ?? "").toLowerCase().includes(q) ||
      (r.clientName ?? "").toLowerCase().includes(q) ||
      (r.driverName ?? "").toLowerCase().includes(q)
    );
  });

  const counts = data.data.reduce(
    (a, r) => {
      a[r.status]++;
      return a;
    },
    { draft: 0, active: 0, completed: 0, cancelled: 0 } as Record<RentalRow["status"], number>,
  );

  return (
    <PageShell
      title="تأجير المركبات"
      subtitle="عقود إيجار المركبات للعملاء — التسليم، الإرجاع، احتساب الزائد"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { label: "تأجير المركبات" },
      ]}
      actions={
        <Link href="/fleet/rental-contracts/create">
          <Button size="sm">
            <Plus className="h-4 w-4 me-1" />عقد جديد
          </Button>
        </Link>
      }
    >
      <FleetTabsNav />

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="مسودّة"    value={counts.draft}     tone="muted" />
        <KpiCard label="فعّال"     value={counts.active}    tone="warning" />
        <KpiCard label="مُغلق"     value={counts.completed} tone="success" />
        <KpiCard label="ملغى"      value={counts.cancelled} tone="rose" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start">المرجع</th>
                  <th className="px-3 py-2 text-start">المركبة</th>
                  <th className="px-3 py-2 text-start">العميل</th>
                  <th className="px-3 py-2 text-start">السائق</th>
                  <th className="px-3 py-2 text-start">المدة</th>
                  <th className="px-3 py-2 text-start">القيمة</th>
                  <th className="px-3 py-2 text-start">الوديعة</th>
                  <th className="px-3 py-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      لا توجد عقود مطابقة
                    </td>
                  </tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-surface-subtle">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/fleet/rental-contracts/${r.id}`}>
                        <a className="text-status-info-foreground hover:underline">
                          {r.ref ?? `#${r.id}`}
                        </a>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono">{r.plateNumber ?? `#${r.vehicleId}`}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {[r.make, r.model].filter(Boolean).join(" ")}
                      </div>
                    </td>
                    <td className="px-3 py-2">{r.clientName ?? `#${r.clientId}`}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.withDriver
                        ? (r.driverName ?? `#${r.driverId}`)
                        : <span className="text-muted-foreground">بدون سائق</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-mono">{r.startDate}</div>
                      <div className="text-[10px] text-muted-foreground">
                        → {r.actualEndDate ?? r.endDate ?? "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.totalAmount ? Number(r.totalAmount).toLocaleString("ar-SA") : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.securityDeposit ? Number(r.securityDeposit).toLocaleString("ar-SA") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`${STATUS_TONE[r.status]} text-[10px]`}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "muted" | "warning" | "success" | "rose" }) {
  const toneClass: Record<typeof tone, string> = {
    muted:   "text-muted-foreground",
    warning: "text-status-warning-foreground",
    success: "text-status-success-foreground",
    rose:    "text-rose-600",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold mt-1 font-mono ${toneClass[tone]}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
