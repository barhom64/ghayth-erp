import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Edit, IdCard, Phone, User, Car } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  available: "متاح",
  on_trip: "في رحلة",
  off_duty: "خارج الدوام",
  suspended: "موقوف",
};

function statusTone(status: string) {
  if (status === "available") return "success" as const;
  if (status === "on_trip") return "info" as const;
  if (status === "suspended") return "destructive" as const;
  if (status === "off_duty") return "muted" as const;
  return "default" as const;
}

const LICENSE_TYPE_LABELS: Record<string, string> = {
  private: "خاصة",
  public: "عمومية",
  heavy: "نقل ثقيل",
  motorcycle: "دراجة نارية",
  light: "خفيفة",
};

/** Returns number of days until expiry (negative = already expired). */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const ms = d.getTime() - today.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export default function DriverDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/fleet/drivers/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("driver", id ?? 0);

  const { data: driver, isLoading, error, refetch } = useApiQuery<any>(
    ["driver-detail", String(id)],
    id ? `/fleet/drivers/${id}` : null,
    !!id
  );

  // Fetch drivers list to get employee context (join isn't on GET /:id)
  const { data: driversListResp } = useApiQuery<any>(
    ["drivers-list-for-detail"],
    "/fleet/drivers",
    !!id
  );
  const driverWithJoin = useMemo(() => {
    const all = asList(driversListResp);
    return all.find((d: any) => d.id === Number(id)) || null;
  }, [driversListResp, id]);

  // Look up the currently assigned vehicle by checking /fleet/vehicles
  const { data: vehiclesResp } = useApiQuery<any>(
    ["vehicles-for-driver", String(id)],
    "/fleet/vehicles",
    !!id
  );
  const assignedVehicle = useMemo(() => {
    const all = asList(vehiclesResp);
    return all.find((v: any) => v.assignedDriverId === Number(id)) || null;
  }, [vehiclesResp, id]);

  const licenseDaysLeft = daysUntil(driver?.licenseExpiry);
  const licenseExpired = licenseDaysLeft !== null && licenseDaysLeft < 0;
  const licenseExpiringSoon = licenseDaysLeft !== null && licenseDaysLeft >= 0 && licenseDaysLeft <= 30;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!driver) return out;
    const empId = driver.employeeId ?? driverWithJoin?.employeeId;
    const empName = driverWithJoin?.employeeName;
    if (empId) {
      out.push({
        type: "employee",
        id: empId,
        label: empName || `موظف #${empId}`,
        sublabel: driverWithJoin?.employeeJobTitle || "الموظف المرتبط",
        href: `/hr/employees/${empId}`,
        icon: User,
      });
    }
    if (assignedVehicle) {
      out.push({
        type: "vehicle",
        id: assignedVehicle.id,
        label: assignedVehicle.plateNumber || `مركبة #${assignedVehicle.id}`,
        sublabel: [assignedVehicle.make, assignedVehicle.model].filter(Boolean).join(" ") || "المركبة المسندة حالياً",
        href: `/fleet/${assignedVehicle.id}`,
        icon: Car,
      });
    }
    return out;
  }, [driver, driverWithJoin, assignedVehicle]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!driver) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "الاسم", value: driver.name || "-" },
      { label: "الهاتف", value: driver.phone || "-" },
      { label: "رقم الرخصة", value: driver.licenseNumber || "-" },
    ];
    if (driver.licenseType) {
      items.push({ label: "نوع الرخصة", value: LICENSE_TYPE_LABELS[driver.licenseType] || driver.licenseType });
    }
    if (driver.licenseExpiry) {
      items.push({ label: "انتهاء الرخصة", value: formatDateAr(driver.licenseExpiry) });
    }
    if (driver.nationalId) {
      items.push({ label: "الهوية الوطنية", value: driver.nationalId });
    }
    items.push({ label: "الحالة", value: STATUS_LABELS[driver.status] || driver.status || "-" });
    if (assignedVehicle) {
      items.push({ label: "المركبة المسندة", value: assignedVehicle.plateNumber || `#${assignedVehicle.id}` });
    }
    return [{ kind: "info-grid", items }];
  }, [driver, assignedVehicle]);

  const editDelete = useDetailEditDelete({
    entityLabel: "السائق",
    patchPath: `/fleet/drivers/${id}`,
    deletePath: `/fleet/drivers/${id}`,
    listPath: "/fleet/drivers",
    initialValues: driver,
    fields: [
      { key: "name", label: "الاسم الكامل" },
      { key: "phone", label: "الهاتف" },
      { key: "nationalId", label: "رقم الهوية" },
      { key: "licenseNumber", label: "رقم الرخصة" },
      { key: "address", label: "العنوان" },
    ],
    invalidateKeys: [["driver", String(id)], ["drivers"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات السائق</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoRow icon={User} label="الاسم" value={driver?.name} />
            <InfoRow icon={Phone} label="الهاتف" value={driver?.phone} ltr />
            <InfoRow icon={IdCard} label="رقم الرخصة" value={driver?.licenseNumber} mono />
            {driver?.licenseType && (
              <InfoRow
                icon={IdCard}
                label="نوع الرخصة"
                value={LICENSE_TYPE_LABELS[driver.licenseType] || driver.licenseType}
              />
            )}
            {driver?.licenseExpiry && (
              <InfoRow
                icon={IdCard}
                label="انتهاء الرخصة"
                value={formatDateAr(driver.licenseExpiry)}
              />
            )}
            {driver?.nationalId && (
              <InfoRow icon={IdCard} label="الهوية الوطنية" value={driver.nationalId} mono />
            )}
          </div>

          {driver?.licenseExpiry && (
            <div className="mt-4">
              {licenseExpired && (
                <div className="flex items-start gap-2 rounded-md border border-status-error-surface bg-status-error-surface p-3 text-status-error-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">الرخصة منتهية</p>
                    <p>منتهية منذ {Math.abs(licenseDaysLeft!)} يوم — لا يُسمح للسائق بالقيادة حتى يتم التجديد.</p>
                  </div>
                </div>
              )}
              {!licenseExpired && licenseExpiringSoon && (
                <div className="flex items-start gap-2 rounded-md border border-status-warning-surface bg-status-warning-surface p-3 text-status-warning-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">الرخصة على وشك الانتهاء</p>
                    <p>تنتهي خلال {licenseDaysLeft} يوم — نوصي بالتجديد المبكر.</p>
                  </div>
                </div>
              )}
              {!licenseExpired && !licenseExpiringSoon && licenseDaysLeft !== null && (
                <div className="flex items-start gap-2 rounded-md border border-status-success-surface bg-status-success-surface p-3 text-status-success-foreground">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">الرخصة سارية</p>
                    <p>تبقى {licenseDaysLeft} يوم حتى تاريخ الانتهاء.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Car className="h-4 w-4 text-muted-foreground" />
              المركبة المسندة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {assignedVehicle ? (
              <div className="space-y-1">
                <p className="font-semibold font-mono">{assignedVehicle.plateNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {[assignedVehicle.make, assignedVehicle.model, assignedVehicle.year].filter(Boolean).join(" ")}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {assignedVehicle.status || "-"}
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد مركبة مسندة حالياً</p>
            )}
          </CardContent>
        </Card>

        {(driver?.employeeId || driverWithJoin?.employeeId) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                الموظف المرتبط
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{driverWithJoin?.employeeName || "-"}</p>
              {driverWithJoin?.employeeNumber && (
                <p className="text-xs text-muted-foreground font-mono">#{driverWithJoin.employeeNumber}</p>
              )}
              {driverWithJoin?.employeeJobTitle && (
                <p className="text-xs text-muted-foreground">{driverWithJoin.employeeJobTitle}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="driver" entityId={id} />}
      {id && <EntityTags entityType="driver" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={driver?.name || "تفاصيل السائق"}
      subtitle={driver?.licenseNumber ? `رخصة #${driver.licenseNumber}` : undefined}
      backPath="/fleet/drivers"
      refNumber={id ? `DRV-${id}` : undefined}
      status={
        driver
          ? { label: STATUS_LABELS[driver.status] || driver.status || "-", tone: statusTone(driver.status) }
          : undefined
      }
      typeLabel={driver?.licenseType ? LICENSE_TYPE_LABELS[driver.licenseType] || driver.licenseType : undefined}
      createdAt={driver?.createdAt}
      updatedAt={driver?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="driver"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          <EntityPrintButton
            branchId={driver?.branchId}
            title={`ملف السائق — ${driver?.name || ""}`}
            ref={`DRV-${id}`}
            date={formatDateAr(new Date().toISOString())}
            sections={printSections}
          />
          <DetailActionButtons hook={editDelete} editPerm="fleet:update" deletePerm="fleet:delete" />
        </>
      }
    />
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  ltr,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  mono?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`font-medium text-status-neutral-foreground truncate ${mono ? "font-mono" : ""}`}
          dir={ltr ? "ltr" : undefined}
        >
          {value || "-"}
        </p>
      </div>
    </div>
  );
}
