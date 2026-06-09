import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PageShell, PageStatusBadge, DataTable, type DataTableColumn,
} from "@workspace/ui-core";
import {
  Plus, Repeat, Play, Truck, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

// #1812 Comment 4663005810 — cargo recurring route patterns.
//
// List page for transport_route_patterns. Each row is a TEMPLATE that
// the daily cron materialises into transport_bookings (tripFamily=cargo,
// bookingSource=recurring_schedule). The operator can:
//   - filter by status (active / paused / archived / all)
//   - fire a single pattern manually for a specific target date
//   - jump to create / edit / detail
//
// This implements §F of the operating model (admin experience surface):
// the cargo recurring screen has its own URL, distinct from the booking
// flow, so the "one screen per concept" mandate is honored.

interface RoutePatternRow {
  id: number;
  patternCode: string;
  name: string;
  daysOfWeekMask: number;
  departureTime: string | null;
  activeFrom: string | null;
  activeUntil: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  fromLocationKind: string | null;
  toLocationKind: string | null;
  defaultVehicleClass: string | null;
  defaultCargoWeight: string | number | null;
  defaultCargoUnit: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

const DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function renderDays(mask: number): string {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(DAYS_AR[i]);
  }
  return days.length === 0 ? "—" : days.join(" • ");
}

export default function TransportRoutePatterns() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: RoutePatternRow[] }>(
    ["transport-route-patterns", statusFilter],
    `/transport/route-patterns?status=${statusFilter}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  const rows = data?.data ?? [];

  const handleMaterialise = async (row: RoutePatternRow) => {
    try {
      const res = await apiFetch<{ data: { bookingId: number; bookingNumber: string } }>(
        `/transport/route-patterns/${row.id}/materialise`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (res?.data?.bookingNumber) {
        toast({ title: `تم إنشاء حجز ${res.data.bookingNumber}` });
        navigate(`/fleet/transport/bookings/${res.data.bookingId}`);
        refetch();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر التشغيل", description: err?.message });
    }
  };

  const columns: DataTableColumn<RoutePatternRow>[] = [
    {
      key: "patternCode",
      header: "الرمز",
      render: (r) => (
        <Link href={`/fleet/transport/route-patterns/${r.id}`}>
          <a className="font-mono text-status-info-foreground hover:underline">{r.patternCode}</a>
        </Link>
      ),
    },
    { key: "name", header: "الاسم", render: (r) => r.name || "—" },
    {
      key: "days",
      header: "أيام التشغيل",
      render: (r) => <span className="text-xs">{renderDays(r.daysOfWeekMask)}</span>,
    },
    {
      key: "departureTime",
      header: "وقت الانطلاق",
      render: (r) => <span className="font-mono text-xs">{r.departureTime?.slice(0, 5) ?? "—"}</span>,
    },
    {
      key: "route",
      header: "المسار",
      render: (r) => (
        <div className="text-xs">
          <div>{r.fromLocationText || "—"}</div>
          <div className="text-muted-foreground">↓</div>
          <div>{r.toLocationText || "—"}</div>
        </div>
      ),
    },
    {
      key: "cargo",
      header: "حمولة افتراضية",
      render: (r) => (
        <span className="text-xs">
          {r.defaultCargoWeight ? `${r.defaultCargoWeight} ${r.defaultCargoUnit || ""}` : "—"}
        </span>
      ),
    },
    {
      key: "vehicleClass",
      header: "فئة المركبة",
      render: (r) => r.defaultVehicleClass ? <Badge variant="outline">{r.defaultVehicleClass}</Badge> : "—",
    },
    { key: "status", header: "الحالة", render: (r) => <PageStatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      render: (r) => (
        <Button
          size="sm" variant="outline"
          disabled={r.status !== "active"}
          onClick={() => handleMaterialise(r)}
          rateLimitAware
        >
          <Play className="h-3 w-3 ml-1" />
          تشغيل اليوم
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="جداول الرحلات المتكرّرة"
      subtitle="قوالب رحلات الحمولة المتكرّرة (الحمولة فقط — الركاب يتمّ ربطهم بمجموعات العمرة)"
      breadcrumbs={[
        { href: "/fleet", label: "الأسطول" },
        { href: "/fleet/transport/bookings", label: "حجوزات النقل" },
        { label: "جداول متكرّرة" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="paused">متوقّف</SelectItem>
              <SelectItem value="archived">مؤرشف</SelectItem>
              <SelectItem value="all">كل الحالات</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/fleet/transport/route-patterns/create">
            <Button rateLimitAware>
              <Plus className="h-4 w-4 ml-1" />
              قالب جديد
            </Button>
          </Link>
        </div>
      }
    >
      <FleetTabsNav />
      {rows.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Repeat className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-1">لا توجد جداول رحلات متكرّرة بعد.</p>
            <p className="text-xs mb-4">
              القوالب المتكرّرة تُحوّل تلقائياً إلى حجوزات حمولة عبر الـ cron اليومي.
            </p>
            <Link href="/fleet/transport/route-patterns/create">
              <Button size="sm">
                <Plus className="h-4 w-4 ml-1" />
                أنشئ أوّل قالب
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Truck className="h-4 w-4" />
              {rows.length} قالب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={rows} columns={columns} />
          </CardContent>
        </Card>
      )}

      <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <strong>كيف تعمل القوالب:</strong> كل يوم يفحص النظام القوالب النشطة.
          القالب الذي يتطابق يومه (مثلاً: الأحد + الثلاثاء + الخميس) يُحوَّل إلى
          حجز فعلي تلقائياً بنوع <span className="font-mono">cargo_load</span>
          مع ربط للقالب الأصلي عبر <span className="font-mono">routePatternId</span>.
        </div>
      </div>
    </PageShell>
  );
}
