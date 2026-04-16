import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Clock, AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PageShell } from "@/components/page-shell";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiGrid } from "@/components/shared/kpi-card";

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
        const time = a.checkIn ? new Date(a.checkIn).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "";
        L.marker([lat, lng], { icon })
          .bindPopup(`<div style="text-align:right;font-family:inherit"><b>${a.employeeName || "موظف"}</b><br/>التاريخ: ${a.date || ""}<br/>الوقت: ${time}</div>`)
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

export default function FieldTrackingPage() {
  const { data } = useApiQuery<any>(["attendance"], "/hr/attendance");
  const items = asList(data);

  const kpis = [
    { label: "تسجيلات اليوم", value: items.length, icon: Navigation, color: "text-blue-600 bg-blue-50" },
    { label: "داخل النطاق", value: items.filter((a: any) => !a.isOutOfRange).length, icon: MapPin, color: "text-green-600 bg-green-50" },
    { label: "خارج النطاق", value: items.filter((a: any) => a.isOutOfRange).length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
    { label: "متوسط وقت الحضور", value: "-", icon: Clock, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <PageShell
      title="التتبع الميداني"
      subtitle="متابعة مواقع الموظفين الميدانيين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "التتبع الميداني" }]}
    >
      <KpiGrid items={kpis} />

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">خريطة التتبع الميداني</h4>
          <AttendanceMap items={items} />
          {items.length === 0 && (
            <p className="text-center text-gray-400 mt-3 text-sm">لا توجد سجلات حضور بالإحداثيات الجغرافية لعرضها على الخريطة</p>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={[
          { key: "employeeName", header: "الموظف", sortable: true, render: (v) => <span className="font-medium">{v.employeeName}</span> },
          { key: "date", header: "التاريخ", sortable: true, render: (v) => <span className="text-gray-500">{v.date}</span> },
          { key: "checkIn", header: "وقت التسجيل", sortable: true, render: (v) => <span className="font-mono">{v.checkIn ? new Date(v.checkIn).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}</span> },
          { key: "status", header: "الحالة", sortable: true, render: (v) => <Badge className={v.status === "present" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>{v.status === "present" ? "حاضر" : v.status}</Badge> },
        ] as DataTableColumn<any>[]}
        data={items}
        noToolbar
        emptyMessage="لا توجد سجلات"
        pageSize={20}
      />
    </PageShell>
  );
}
