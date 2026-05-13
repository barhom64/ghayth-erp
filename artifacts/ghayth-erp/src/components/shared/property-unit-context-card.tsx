import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import {
  Home, AlertTriangle, FileText, Wrench, CheckCircle2, Info,
  DollarSign, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PropertyUnitSection = "contract" | "maintenance" | "payment";

export interface PropertyUnitContextCardProps {
  unitId: string | number | null | undefined;
  section?: PropertyUnitSection;
  className?: string;
}

interface UnitDetail {
  id: number;
  unitNumber?: string;
  type?: string;
  status?: string;
  area?: number | string;
  rooms?: number;
  monthlyRent?: number | string;
  buildingId?: number;
  buildingName?: string;
  contracts?: Array<{
    id: number;
    tenantName?: string;
    status: string;
    startDate?: string;
    endDate?: string;
    monthlyAmount?: number | string;
    paidCount?: number;
    totalAmount?: number | string;
    totalPaid?: number | string;
  }>;
  payments?: Array<{
    id: number;
    dueDate: string;
    amount: number | string;
    paidAmount: number | string;
    status: string;
    tenantName?: string;
  }>;
  maintenance?: Array<{
    id: number;
    title?: string;
    description?: string;
    priority?: string;
    status: string;
    createdAt: string;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  available: { label: "متاحة", className: "bg-status-success-surface text-status-success-foreground border-status-success-surface" },
  rented: { label: "مؤجَّرة", className: "bg-status-info-surface text-status-info-foreground border-status-info-surface" },
  reserved: { label: "محجوزة", className: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface" },
  maintenance: { label: "تحت الصيانة", className: "bg-orange-50 text-orange-700 border-orange-200" },
  under_maintenance: { label: "تحت الصيانة", className: "bg-orange-50 text-orange-700 border-orange-200" },
  out_of_service: { label: "خارج الخدمة", className: "bg-status-error-surface text-status-error-foreground border-status-error-surface" },
};

/**
 * Shows rich property-unit context when a unit is selected in a form.
 * Solves the review complaint: "اختيار وحدة لا يعرض: حالة الوحدة + آخر
 * عقد + الإيجار السابق + المالك + حجز/صيانة مفتوحة".
 */
export function PropertyUnitContextCard({
  unitId,
  section,
  className,
}: PropertyUnitContextCardProps) {
  const hasId = unitId !== null && unitId !== undefined && String(unitId).trim() !== "";
  const { data, isLoading } = useApiQuery<UnitDetail>(
    ["unit-context", String(unitId ?? "")],
    hasId ? `/properties/units/${unitId}` : null,
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

  const activeContract = (data.contracts || []).find((c) => c.status === "active");
  const openMaintenance = (data.maintenance || []).filter(
    (m) => m.status !== "completed" && m.status !== "closed" && m.status !== "cancelled",
  );
  const unpaidPayments = (data.payments || []).filter(
    (p) => p.status !== "paid" && Number(p.paidAmount || 0) < Number(p.amount || 0),
  );
  const totalDue = unpaidPayments.reduce(
    (sum, p) => sum + Math.max(0, Number(p.amount || 0) - Number(p.paidAmount || 0)),
    0,
  );

  const statusInfo = STATUS_LABELS[data.status || ""] || { label: data.status || "—", className: "" };
  const notAvailable = data.status === "rented" || data.status === "reserved" || data.status === "maintenance" || data.status === "under_maintenance" || data.status === "out_of_service";

  return (
    <Card className={cn("border-emerald-200 bg-emerald-50/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-sm">
              {data.buildingName ? `${data.buildingName} — ` : ""}الوحدة {data.unitNumber || `#${data.id}`}
            </span>
            {data.type && <Badge variant="outline" className="text-xs">{data.type}</Badge>}
          </div>
          <Badge variant="outline" className={cn("text-xs", statusInfo.className)}>
            {statusInfo.label}
          </Badge>
        </div>

        {/* Core grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <InfoTile label="الإيجار الشهري" value={data.monthlyRent ? formatCurrency(Number(data.monthlyRent)) : "—"} />
          <InfoTile label="المساحة" value={data.area ? `${data.area} م²` : "—"} />
          <InfoTile label="الغرف" value={data.rooms ? `${data.rooms}` : "—"} />
          <InfoTile label="العقود السابقة" value={`${(data.contracts || []).length}`} />
        </div>

        {/* Availability warning */}
        {notAvailable && (
          <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {data.status === "rented" && "هذه الوحدة مؤجَّرة حاليًا — لا يمكن إنشاء عقد إيجار جديد"}
              {data.status === "reserved" && "هذه الوحدة محجوزة — راجع الحجز قبل المتابعة"}
              {data.status === "maintenance" && "هذه الوحدة تحت الصيانة — لا تقبل عقود جديدة"}
            </span>
          </div>
        )}

        {/* Active contract */}
        {activeContract && (
          <div className="pt-2 border-t border-emerald-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <FileText className="h-3.5 w-3.5" />
              <span>العقد النشط</span>
            </div>
            <div className="bg-white rounded p-2 border border-border text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المستأجر</span>
                <span className="font-semibold">{activeContract.tenantName || "—"}</span>
              </div>
              {activeContract.monthlyAmount && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الإيجار</span>
                  <span className="font-semibold">{formatCurrency(Number(activeContract.monthlyAmount))}</span>
                </div>
              )}
              {activeContract.endDate && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ينتهي</span>
                  <span className="font-semibold">{new Date(activeContract.endDate).toLocaleDateString("ar-SA")}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section-specific */}
        {section === "payment" && unpaidPayments.length > 0 && (
          <div className="pt-2 border-t border-emerald-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <DollarSign className="h-3.5 w-3.5" />
              <span>مستحقات مفتوحة</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-2 border border-status-error-surface">
                <p className="text-xs text-muted-foreground">المتأخر الكلي</p>
                <p className="text-sm font-semibold text-status-error-foreground">{formatCurrency(totalDue)}</p>
              </div>
              <div className="bg-white rounded p-2 border border-border">
                <p className="text-xs text-muted-foreground">عدد المستحقات</p>
                <p className="text-sm font-semibold">{unpaidPayments.length}</p>
              </div>
            </div>
          </div>
        )}

        {section === "maintenance" && (
          <div className="pt-2 border-t border-emerald-100 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Wrench className="h-3.5 w-3.5" />
              <span>طلبات الصيانة</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-2 border border-status-warning-surface">
                <p className="text-xs text-muted-foreground">مفتوحة</p>
                <p className="text-sm font-semibold text-status-warning-foreground">{openMaintenance.length}</p>
              </div>
              <div className="bg-white rounded p-2 border border-border">
                <p className="text-xs text-muted-foreground">الإجمالي</p>
                <p className="text-sm font-semibold">{(data.maintenance || []).length}</p>
              </div>
            </div>
            {openMaintenance.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded p-1.5">
                <AlertTriangle className="h-3 w-3" />
                <span>يوجد {openMaintenance.length} طلب صيانة مفتوح — راجع قبل إضافة طلب جديد</span>
              </div>
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
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}
