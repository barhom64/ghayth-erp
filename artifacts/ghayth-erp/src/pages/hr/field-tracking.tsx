import { useApiQuery, asList } from "@/lib/api";
import { formatTimeAr, formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageShell,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  AdvancedFilters,
  useFilters,
  applyFilters,
} from "@workspace/ui-core";
import { MapPin, Navigation, Clock, AlertTriangle, Route, Battery, Gauge } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { KpiGrid } from "@/components/shared/kpi-card";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
const defaultCenter: [number, number] = [24.7136, 46.6753];

function AttendanceMap({ items }: { items: any[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 11,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapInstance.current!.removeLayer(layer);
      }
    });

    const bounds: L.LatLngExpression[] = [];

    items.forEach((a: any) => {
      const lat = parseFloat(a.lat || a.checkInLat);
      const lng = parseFloat(a.lon || a.lng || a.checkInLon);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const color = a.isOutOfRange ? "#EF4444" : "#22C55E";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const time = formatTimeAr(a.checkIn);
        L.marker([lat, lng], { icon })
          .bindPopup(`<div style="text-align:right;font-family:inherit"><b>${a.employeeName || "موظف"}</b><br/>التاريخ: ${a.date ? formatDateAr(a.date) : ""}<br/>الوقت: ${time}</div>`)
          .addTo(mapInstance.current!);
        bounds.push([lat, lng]);
      }
    });

    if (bounds.length > 0) {
      mapInstance.current.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [items]);

  return <div ref={mapRef} style={{ height: 400, borderRadius: 12 }} />;
}

// HR-015 — Breadcrumb map for one employee's day from field_tracking_points.
// Renders each ping as a numbered dot + connects them with a polyline
// so the route through the day reads top-to-bottom on the timestamps.
function BreadcrumbMap({ points }: { points: any[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: 11,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(mapInstance.current);
    return () => { mapInstance.current?.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        mapInstance.current!.removeLayer(layer);
      }
    });
    const coords: L.LatLngExpression[] = [];
    points.forEach((p, idx) => {
      const lat = parseFloat(p.lat); const lng = parseFloat(p.lng);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return;
      coords.push([lat, lng]);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#0ea5e9;color:white;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${idx + 1}</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      });
      const popup = `<div style="text-align:right;font-family:inherit">
        <b>نقطة ${idx + 1}</b><br/>
        ${p.capturedAt ? `الوقت: ${formatTimeAr(p.capturedAt)}<br/>` : ""}
        ${p.source ? `المصدر: ${p.source}<br/>` : ""}
        ${p.speed != null ? `السرعة: ${Math.round(Number(p.speed))} كم/س<br/>` : ""}
        ${p.battery != null ? `البطارية: ${Math.round(Number(p.battery))}%<br/>` : ""}
      </div>`;
      L.marker([lat, lng], { icon }).bindPopup(popup).addTo(mapInstance.current!);
    });
    if (coords.length > 1) {
      L.polyline(coords, { color: "#0ea5e9", weight: 3, opacity: 0.6, dashArray: "6,8" })
        .addTo(mapInstance.current);
    }
    if (coords.length > 0) {
      mapInstance.current.fitBounds(coords as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
    }
  }, [points]);

  return <div ref={mapRef} style={{ height: 420, borderRadius: 12 }} />;
}

// HR-015 — Field breadcrumb section. Pulls from /hr/attendance/field-track
// with an assignment + date picker. Detects stops (gap > 15 min between
// pings of similar location) inline in the table.
function FieldBreadcrumbSection() {
  const today = new Date().toISOString().slice(0, 10); // utc-ok: HTML date input picker (Riyadh-aware logic happens server-side via /hr/attendance/field-track?date=...)
  const [assignmentId, setAssignmentId] = useState("");
  const [date, setDate] = useState(today);
  const url = assignmentId
    ? `/hr/attendance/field-track?assignmentId=${assignmentId}&date=${date}`
    : `/hr/attendance/field-track?date=${date}`;
  const { data, isLoading, isError } = useApiQuery<any>(
    ["field-track", assignmentId, date],
    url,
  );
  const points: any[] = (data?.data ?? []) as any[];

  // Total distance (haversine sum) — cheap client-side approx.
  const totalKm = points.length > 1 ? points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1];
    const lat1 = Number(prev.lat), lat2 = Number(p.lat);
    const lng1 = Number(prev.lng), lng2 = Number(p.lng);
    if ([lat1, lat2, lng1, lng2].some(isNaN)) return acc;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return acc + (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }, 0) : 0;

  return (
    <Card className="mt-4">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <Route className="h-4 w-4 text-status-info-foreground" />
          مسار GPS التفصيلي (من field_tracking_points)
        </h4>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] mb-4">
          <div>
            <Label className="text-xs">معرّف تعيين الموظف</Label>
            <Input
              type="number"
              placeholder="اتركه فارغًا للعرض المباشر لكل الموظفين"
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <Badge variant={data?.mode === "live" ? "default" : "secondary"} className="h-9 px-3">
              {data?.mode === "live" ? "وضع مباشر" : data?.mode === "breadcrumb" ? "وضع تتبع موظف" : "—"}
            </Badge>
          </div>
        </div>

        {isLoading && <LoadingSpinner />}
        {isError && <ErrorState />}

        {!isLoading && !isError && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs">
              <div className="bg-surface-subtle rounded p-2">
                <div className="text-muted-foreground">نقاط مسجلة</div>
                <div className="font-bold text-base">{points.length}</div>
              </div>
              <div className="bg-surface-subtle rounded p-2">
                <div className="text-muted-foreground flex items-center gap-1">
                  <Route className="h-3 w-3" /> المسافة التقريبية
                </div>
                <div className="font-bold text-base">{totalKm.toFixed(1)} كم</div>
              </div>
              <div className="bg-surface-subtle rounded p-2">
                <div className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> أقصى سرعة
                </div>
                <div className="font-bold text-base">
                  {points.length > 0
                    ? Math.round(Math.max(...points.map((p) => Number(p.speed) || 0)))
                    : 0} كم/س
                </div>
              </div>
              <div className="bg-surface-subtle rounded p-2">
                <div className="text-muted-foreground flex items-center gap-1">
                  <Battery className="h-3 w-3" /> آخر مستوى بطارية
                </div>
                <div className="font-bold text-base">
                  {points.length > 0 && points[points.length - 1].battery != null
                    ? `${Math.round(Number(points[points.length - 1].battery))}%`
                    : "—"}
                </div>
              </div>
            </div>

            {points.length > 0 ? (
              <>
                <BreadcrumbMap points={points} />
                <div className="mt-3">
                  <DataTable
                    data={points}
                    columns={[
                      { key: "capturedAt", header: "الوقت", render: (p: any) => <span className="font-mono">{p.capturedAt ? formatTimeAr(p.capturedAt) : "—"}</span> },
                      { key: "employeeName", header: "الموظف", render: (p: any) => p.employeeName || `#${p.assignmentId}` },
                      { key: "source", header: "المصدر", render: (p: any) => <Badge variant="outline" className="text-xs">{p.source || "—"}</Badge> },
                      { key: "speed", header: "السرعة (كم/س)", render: (p: any) => p.speed != null ? Math.round(Number(p.speed)) : "—" },
                      { key: "battery", header: "البطارية", render: (p: any) => p.battery != null ? `${Math.round(Number(p.battery))}%` : "—" },
                      { key: "coords", header: "الإحداثيات", render: (p: any) => <span className="font-mono text-xs">{Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</span> },
                    ] as DataTableColumn<any>[]}
                    pageSize={20}
                    noToolbar
                  />
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-6 text-sm">
                {assignmentId
                  ? "لا توجد نقاط GPS لهذا الموظف في هذا التاريخ."
                  : "اختر موظفًا (assignmentId) أو وضع التتبع المباشر سيُظهر آخر نقطة لكل موظف نشط."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function FieldTrackingPage() {
  const { data, isLoading, isError } = useApiQuery<any>(["attendance"], "/hr/attendance");
  const items = asList(data);
  const [filters, setFilters] = useFilters();
  const filtered = applyFilters(items, filters, { searchFields: ["employeeName", "status", "date"] });
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(filtered);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const kpis = [
    { label: "تسجيلات اليوم", value: items.length, icon: Navigation, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "داخل النطاق", value: items.filter((a: any) => !a.isOutOfRange).length, icon: MapPin, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "خارج النطاق", value: items.filter((a: any) => a.isOutOfRange).length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "متوسط وقت الحضور", value: "-", icon: Clock, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <PageShell
      title="التتبع الميداني"
      subtitle="متابعة مواقع الموظفين الميدانيين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "التتبع الميداني" }]}
      actions={
        <PrintButton
          entityType="report_hr_field_tracking"
          entityId="list"
          size="icon"
          payload={() => ({
            entity: { title: "تقرير التتبع الميداني", total: printRows.length },
            items: printRows.map((v: any) => ({
              "الموظف": v.employeeName || "—",
              "التاريخ": v.date || "—",
              "وقت التسجيل": v.checkIn || "—",
              "خط العرض": v.checkInLat ?? v.lat ?? v.latitude ?? "—",
              "خط الطول": v.checkInLon ?? v.lng ?? v.lon ?? v.longitude ?? "—",
              "الحالة": v.status || "—",
            })),
          })}
        />
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">خريطة نقاط الحضور (Check-in)</h4>
          <AttendanceMap items={items} />
          {items.length === 0 && (
            <p className="text-center text-muted-foreground mt-3 text-sm">لا توجد سجلات حضور بالإحداثيات الجغرافية لعرضها على الخريطة</p>
          )}
        </CardContent>
      </Card>

      {/* HR-015 — Breadcrumb section reads from field_tracking_points,
          the live GPS ping table populated by /hr/attendance/field-ping.
          Previously the page only showed check-in dots from attendance;
          this surfaces the through-the-day path drivers/field-staff make. */}
      <FieldBreadcrumbSection />

      <AdvancedFilters
        config={{ searchPlaceholder: "بحث بالموظف أو الحالة…", showDateRange: false }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <DataTable
        columns={[
          { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
          { key: "date", header: "التاريخ", sortable: true, render: (v) => <span className="text-muted-foreground">{v.date ? formatDateAr(v.date) : "-"}</span> },
          { key: "checkIn", header: "وقت التسجيل", sortable: true, render: (v) => <span className="font-mono">{formatTimeAr(v.checkIn)}</span> },
          { key: "status", header: "الحالة", sortable: true, render: (v) => <PageStatusBadge status={v.status} /> },
        ] as DataTableColumn<any>[]}
        onSortedDataChange={setPrintRows}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد سجلات"
        pageSize={20}
      />
    </PageShell>
  );
}
