import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { statusLabel } from "@/lib/transport-status-labels";
import {
  Truck, Fuel, Wrench, Shield, MapPin, AlertTriangle, Info, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ContextCardSkeleton, ContextStat, ContextWarning } from "./context-card-kit";

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
  // #1812 Wave 0.3 — surfaced for assignment pre-flight checks. The
  // dispatcher needs to see capacity/specialty before committing to
  // a candidate; surfacing it here means the suggestion dialog and
  // every other booking-side context can show why this vehicle is
  // (or isn't) eligible without a separate fetch.
  vehicleType?: string;
  payloadKg?: number | string | null;
  operationalPayloadKg?: number | string | null;
  seatCount?: number | string | null;
  validForPassengers?: boolean | null;
  validForCargo?: boolean | null;
  requiredLicenseClass?: string | null;
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

// #2079 TA-T18-06 — labels sourced from the shared transport status
// dictionary so the SPA never drifts from the server enum (any new
// fleet_vehicles status surfaces in Arabic automatically).

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

  if (isLoading) return <ContextCardSkeleton className={className} />;

  if (!data) return null;

  const statusInfo = statusLabel("vehicle", data.status);
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
          <Badge variant="outline" className={cn("text-xs", statusInfo.tone)}>
            {statusInfo.label}
          </Badge>
        </div>

        {/* Core grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <InfoTile label="السائق الحالي" value={data.driverName || "—"} />
          <InfoTile label="عداد الكيلومترات" value={data.mileage ? `${formatNumber(Number(data.mileage))} كم` : "—"} />
          <InfoTile label="عدد الرحلات" value={`${(data.trips || []).length}`} />
          <InfoTile label="تزويدات سابقة" value={`${(data.fuelLogs || []).length}`} />
        </div>

        {/* #1812 Wave 0.3 — Capacity + specialty row.
            Only renders when at least one assignment-decision field is
            populated; legacy vehicles with NULL profile stay quiet so
            the card doesn't grow a row of empty placeholders. */}
        {(data.vehicleType || data.payloadKg != null || data.operationalPayloadKg != null
          || data.seatCount != null || data.validForPassengers != null || data.validForCargo != null
          || data.requiredLicenseClass) && (
          <div className="border-t border-sky-100 pt-2">
            <div className="text-[10px] text-muted-foreground mb-1">سعة المركبة وتخصصها</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {data.vehicleType && (
                <InfoTile label="النوع" value={data.vehicleType} />
              )}
              {data.seatCount != null && (
                <InfoTile label="عدد المقاعد" value={`${data.seatCount}`} />
              )}
              {(data.operationalPayloadKg != null || data.payloadKg != null) && (
                <InfoTile
                  label="الحمولة (كغ)"
                  value={`${data.operationalPayloadKg ?? data.payloadKg}${data.operationalPayloadKg != null && data.payloadKg != null && Number(data.operationalPayloadKg) < Number(data.payloadKg) ? ` / ${data.payloadKg} حد` : ""}`}
                />
              )}
              {data.requiredLicenseClass && (
                <InfoTile label="رخصة مطلوبة" value={data.requiredLicenseClass} />
              )}
              {(data.validForPassengers != null || data.validForCargo != null) && (
                <div className="col-span-2 flex items-center gap-1 flex-wrap">
                  {data.validForPassengers && (
                    <Badge variant="outline" className="bg-status-info-surface text-status-info-foreground text-[10px]">
                      صالحة للركاب
                    </Badge>
                  )}
                  {data.validForCargo && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 text-[10px]">
                      صالحة للحمولات
                    </Badge>
                  )}
                  {data.validForPassengers === false && data.validForCargo === false && (
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 text-[10px]">
                      غير محدّدة للإسناد
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Not available warning */}
        {notAvailable && (
          <ContextWarning icon={AlertTriangle}>
            {data.status === "maintenance" && "المركبة تحت الصيانة — لا تقبل رحلات"}
            {data.status === "retired" && "المركبة متوقفة — لا يمكن تعيين رحلات أو صيانة"}
            {data.status === "sold" && "المركبة مباعة — غير متاحة"}
          </ContextWarning>
        )}

        {/* Insurance warning */}
        {insuranceExpired && (
          <ContextWarning icon={Shield}>
            التأمين منتهي — لا يجوز تعيين رحلات قبل تجديده
          </ContextWarning>
        )}
        {insuranceExpiringSoon && activeInsurance && (
          <ContextWarning icon={Shield} tone="warning">
            التأمين ينتهي خلال شهر ({new Date(activeInsurance.endDate!).toLocaleDateString("ar-SA")}) — جدّد قبل الانتهاء
          </ContextWarning>
        )}

        {/* Maintenance warning */}
        {serviceOverdue && (
          <ContextWarning icon={Wrench}>
            موعد الصيانة الدوري متأخر — راجع قبل الرحلة التالية
          </ContextWarning>
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

// Thin alias kept so the ~10 call sites read unchanged; the markup now lives
// once in the shared ContextStat (context-card-kit).
function InfoTile({ label, value }: { label: string; value: string }) {
  return <ContextStat label={label} value={value} truncate />;
}
