import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import {
  Truck, Fuel, Wrench, Shield, MapPin, AlertTriangle, Info, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type VehicleContextSection = "trip" | "maintenance" | "fuel" | "insurance";

export interface VehicleContextCardProps {
  vehicleId: string | number | null | undefined;
  section?: VehicleContextSection;
  className?: string;
}

interface VehicleDetail {
  id: number;
  plateNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  status?: string;
  mileage?: number | string;
  assignedDriverId?: number;
  driverName?: string;
  driverPhone?: string;
  trips?: Array<{
    id: number;
    fromLocation?: string;
    toLocation?: string;
    distance?: number | string;
    cost?: number | string;
    status: string;
    startTime?: string;
  }>;
  maintenance?: Array<{
    id: number;
    type?: string;
    description?: string;
    cost?: number | string;
    serviceDate?: string;
    status: string;
    mileageAtService?: number | string;
    nextServiceDate?: string;
  }>;
  fuelLogs?: Array<{
    id: number;
    fuelDate: string;
    liters?: number | string;
    totalCost?: number | string;
    mileageAtFuel?: number | string;
  }>;
  insurance?: Array<{
    id: number;
    type?: string;
    provider?: string;
    endDate?: string;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: "نشطة", className: "bg-status-success-surface text-status-success-foreground border-status-success-surface" },
  maintenance: { label: "تحت الصيانة", className: "bg-orange-50 text-orange-700 border-orange-200" },
  retired: { label: "متوقفة", className: "bg-surface-subtle text-gray-700 border-border" },
  sold: { label: "مباعة", className: "bg-status-error-surface text-status-error-foreground border-status-error-surface" },
};

/**
 * Rich vehicle context for fleet forms.
 * /fleet/vehicles/:id returns trips + maintenance + fuelLogs + insurance.
 */
export function VehicleContextCard({
  vehicleId,
  section,
  className,
}: VehicleContextCardProps) {
  const hasId = vehicleId !== null && vehicleId !== undefined && String(vehicleId).trim() !== "";
  const { data, isLoading } = useApiQuery<VehicleDetail>(
    ["vehicle-context", String(vehicleId ?? "")],
    hasId ? `/fleet/vehicles/${vehicleId}` : null,
    { enabled: hasId },
  );

  if (!hasId) return null;

  if (isLoading) {
    return (
      <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-100 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const statusInfo = STATUS_LABELS[data.status || ""] || { label: data.status || "—", className: "" };
  const notAvailable = data.status === "maintenance" || data.status === "retired" || data.status === "sold";

  const openMaintenance = (data.maintenance || []).filter(
    (m) => m.status !== "completed" && m.status !== "closed" && m.status !== "cancelled",
  );
  const activeInsurance = (data.insurance || []).find((i) => {
    if (!i.endDate) return false;
    return new Date(i.endDate) >= new Date();
  });
  const insuranceExpiringSoon = activeInsurance?.endDate &&
    (new Date(activeInsurance.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 30;
  const insuranceExpired = !activeInsurance && (data.insurance || []).length > 0;

  const nextService = (data.maintenance || [])
    .filter((m) => m.nextServiceDate)
    .map((m) => new Date(m.nextServiceDate!))
    .filter((d) => d >= new Date())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const serviceOverdue = (data.maintenance || []).some(
    (m) => m.nextServiceDate && new Date(m.nextServiceDate) < new Date() && m.status !== "completed",
  );

  return (
    <Card className={cn("border-sky-200 bg-sky-50/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-sky-100">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-600" />
            <span className="font-semibold text-sm">
              {data.plateNumber || `#${data.id}`}
            </span>
            <Badge variant="outline" className="text-xs">
              {[data.make, data.model, data.year].filter(Boolean).join(" ")}
            </Badge>
          </div>
          <Badge variant="outline" className={cn("text-xs", statusInfo.className)}>
            {statusInfo.label}
          </Badge>
        </div>

        {/* Core grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <InfoTile label="السائق المعيّن" value={data.driverName || "—"} />
          <InfoTile label="عداد الكيلومترات" value={data.mileage ? `${formatNumber(Number(data.mileage))} كم` : "—"} />
          <InfoTile label="عدد الرحلات" value={`${(data.trips || []).length}`} />
          <InfoTile label="تزويدات سابقة" value={`${(data.fuelLogs || []).length}`} />
        </div>

        {/* Not available warning */}
        {notAvailable && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {data.status === "maintenance" && "المركبة تحت الصيانة — لا تقبل رحلات"}
              {data.status === "retired" && "المركبة متوقفة — لا يمكن تعيين رحلات أو صيانة"}
              {data.status === "sold" && "المركبة مباعة — غير متاحة"}
            </span>
          </div>
        )}

        {/* Insurance warning */}
        {insuranceExpired && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <Shield className="h-3 w-3" />
            <span>التأمين منتهي — لا يجوز تعيين رحلات قبل تجديده</span>
          </div>
        )}
        {insuranceExpiringSoon && activeInsurance && (
          <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded p-1.5">
            <Shield className="h-3 w-3" />
            <span>
              التأمين ينتهي خلال شهر ({new Date(activeInsurance.endDate!).toLocaleDateString("ar-SA")}) — جدّد قبل الانتهاء
            </span>
          </div>
        )}

        {/* Maintenance warning */}
        {serviceOverdue && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <Wrench className="h-3 w-3" />
            <span>موعد الصيانة الدوري متأخر — راجع قبل الرحلة التالية</span>
          </div>
        )}

        {/* Section-specific */}
        {section === "trip" && (
          <div className="pt-2 border-t border-sky-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <MapPin className="h-3.5 w-3.5" />
              <span>آخر الرحلات</span>
            </div>
            {(data.trips || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد رحلات سابقة</p>
            ) : (
              <div className="space-y-1">
                {(data.trips || []).slice(0, 3).map((trip) => (
                  <div key={trip.id} className="flex items-center justify-between bg-white rounded p-1.5 text-xs border border-border">
                    <span className="text-gray-700">
                      {trip.fromLocation || "—"} ← {trip.toLocation || "—"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {trip.distance ? `${trip.distance} كم` : "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === "maintenance" && (
          <div className="pt-2 border-t border-sky-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <Wrench className="h-3.5 w-3.5" />
              <span>الصيانة</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded p-2 border border-status-warning-surface">
                <p className="text-xs text-muted-foreground">مفتوحة</p>
                <p className="text-sm font-semibold text-status-warning-foreground">{openMaintenance.length}</p>
              </div>
              <div className="bg-white rounded p-2 border border-border">
                <p className="text-xs text-muted-foreground">الإجمالي</p>
                <p className="text-sm font-semibold">{(data.maintenance || []).length}</p>
              </div>
              {nextService && (
                <div className="bg-white rounded p-2 border border-border">
                  <p className="text-xs text-muted-foreground">الصيانة التالية</p>
                  <p className="text-sm font-semibold">{nextService.toLocaleDateString("ar-SA")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {section === "fuel" && (
          <div className="pt-2 border-t border-sky-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <Fuel className="h-3.5 w-3.5" />
              <span>آخر تزويدات الوقود</span>
            </div>
            {(data.fuelLogs || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد تزويدات سابقة</p>
            ) : (
              <div className="space-y-1">
                {(data.fuelLogs || []).slice(0, 3).map((log) => (
                  <div key={log.id} className="flex items-center justify-between bg-white rounded p-1.5 text-xs border border-border">
                    <span className="text-gray-700">
                      {new Date(log.fuelDate).toLocaleDateString("ar-SA")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{log.liters ? `${log.liters} لتر` : ""}</span>
                      <span className="font-semibold">{log.totalCost ? formatCurrency(Number(log.totalCost)) : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === "insurance" && (
          <div className="pt-2 border-t border-sky-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
              <Shield className="h-3.5 w-3.5" />
              <span>التأمين</span>
            </div>
            {activeInsurance ? (
              <div className="bg-white rounded p-2 border border-border text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الشركة</span>
                  <span className="font-semibold">{activeInsurance.provider || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ينتهي</span>
                  <span className="font-semibold">{activeInsurance.endDate ? new Date(activeInsurance.endDate).toLocaleDateString("ar-SA") : "—"}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-status-error-foreground">لا يوجد تأمين نشط — يجب إضافة تأمين قبل أي رحلة</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded p-2 border border-border">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
    </div>
  );
}
