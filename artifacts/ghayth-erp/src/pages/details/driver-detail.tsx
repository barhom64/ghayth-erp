import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Edit,
  IdCard,
  Phone,
  User,
  Car,
  Wallet,
  Mail,
  Route,
  Fuel,
  ShieldAlert,
  Building2,
} from "lucide-react";
import { formatDateAr, formatCurrency, formatNumber } from "@/lib/formatters";
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
    `/fleet/drivers/${id}`,
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

  // GET /fleet/telematics/drivers/:driverId/scorecard — rolled-up driving
  // score (harsh-braking, speeding events, idle %, fuel efficiency). Shown
  // as a compact KPI strip on the driver profile.
  const { data: scorecard } = useApiQuery<any>(
    ["driver-scorecard", String(id)],
    id ? `/fleet/telematics/drivers/${id}/scorecard` : null,
    !!id,
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
    invalidateKeys: [["driver-detail", String(id)], ["fleet-drivers"], ["drivers"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      {id && (
        <div className="md:col-span-3">
          <DriverIntegratedCard driverId={id} />
        </div>
      )}
      {scorecard && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">تقييم القيادة (Telematics)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            {Object.entries(scorecard).filter(([, v]) => typeof v !== "object").slice(0, 10).map(([k, v]) => (
              <div key={k} className="border rounded p-2">
                <p className="text-muted-foreground text-[10px]">{k}</p>
                <p className="font-mono font-medium">{v == null ? "—" : String(v)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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
            entityType="driver"
            entityId={id ?? 0}
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

// Driver "single-pane-of-glass" — surfaces /fleet/drivers/:id/integrated-summary
// which folds employee + vehicle + custody + 30-day ops metrics into one
// round-trip. Mirrors FinanceLinkageCard on employee-detail.tsx so HR + Fleet
// share the same mental model for the cross-module rollup.
function DriverIntegratedCard({ driverId }: { driverId: number }) {
  const { data, isLoading } = useApiQuery<any>(
    ["driver-integrated-summary", String(driverId)],
    `/fleet/drivers/${driverId}/integrated-summary`,
    !!driverId,
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الربط المتكامل (HR + المالية + الأسطول)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">جارٍ التحميل…</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const emp = data.employee;
  const veh = data.vehicle;
  const custody = data.custody ?? {};
  const trips = data.trips30d ?? {};
  const fuel = data.fuel30d ?? {};
  const violations = data.violations ?? {};
  const userAcct = data.userAccount;

  const hasCustody = (custody.outstandingAmount ?? 0) > 0 || (custody.openCount ?? 0) > 0;
  const hasOpenViolations = (violations.openCount ?? 0) > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          الربط المتكامل — موظف + مركبة + عهدة + رحلات (آخر 30 يوم)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4 text-xs">
        {/* Employee linkage */}
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <User className="h-3 w-3" /> الموظف المرتبط
          </div>
          {emp ? (
            <>
              <Link href={`/hr/employees/${emp.id}`}>
                <a className="font-semibold underline-offset-2 hover:underline">{emp.name}</a>
              </Link>
              {emp.empNumber && <p className="font-mono text-muted-foreground">#{emp.empNumber}</p>}
              {emp.jobTitle && <p className="text-muted-foreground">{emp.jobTitle}</p>}
              {emp.departmentName && (
                <p className="text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {emp.departmentName}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">لا يوجد موظف مرتبط</p>
          )}
        </div>

        {/* Vehicle linkage */}
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Car className="h-3 w-3" /> المركبة المسندة
          </div>
          {veh ? (
            <>
              <Link href={`/fleet/${veh.id}`}>
                <a className="font-semibold font-mono underline-offset-2 hover:underline">{veh.plateNumber}</a>
              </Link>
              <p className="text-muted-foreground">
                {[veh.make, veh.model, veh.year].filter(Boolean).join(" ") || "-"}
              </p>
              {veh.currentMileage != null && (
                <p className="text-muted-foreground font-mono">{formatNumber(veh.currentMileage)} كم</p>
              )}
              <Badge variant="outline" className="text-[10px]">{veh.status || "-"}</Badge>
            </>
          ) : (
            <p className="text-muted-foreground">لا توجد مركبة مسندة</p>
          )}
        </div>

        {/* Custody balance */}
        <div className={`border rounded p-2 space-y-1 ${hasCustody ? "border-status-warning-surface bg-status-warning-surface/30" : ""}`}>
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Wallet className="h-3 w-3" /> رصيد العهدة الحالي
          </div>
          <p className="font-semibold font-mono">{formatCurrency(custody.outstandingAmount ?? 0)}</p>
          <p className="text-muted-foreground">{Number(custody.openCount ?? 0)} عهدة مفتوحة</p>
          {emp && (
            <Link href={`/finance/custodies?employeeId=${emp.id}`}>
              <a className="text-[11px] text-primary underline-offset-2 hover:underline">
                فتح سجل العهد ←
              </a>
            </Link>
          )}
        </div>

        {/* Account & login */}
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Mail className="h-3 w-3" /> حساب الدخول
          </div>
          {emp?.emails?.loginEmail ? (
            <p className="font-mono break-all" dir="ltr">{emp.emails.loginEmail}</p>
          ) : (
            <p className="text-muted-foreground">لا يوجد بريد دخول</p>
          )}
          {emp?.emails?.personal && emp.emails.personal !== emp.emails.loginEmail && (
            <p className="text-muted-foreground text-[10px] font-mono break-all" dir="ltr">
              شخصي: {emp.emails.personal}
            </p>
          )}
          {userAcct ? (
            <div className="flex items-center gap-2">
              <Badge variant={userAcct.isActive ? "outline" : "secondary"} className="text-[10px]">
                {userAcct.isActive ? "نشط" : "موقوف"}
              </Badge>
              {userAcct.lastLoginAt && (
                <span className="text-[10px] text-muted-foreground">
                  آخر دخول: {formatDateAr(userAcct.lastLoginAt)}
                </span>
              )}
            </div>
          ) : emp ? (
            <p className="text-[10px] text-muted-foreground">لا يوجد حساب مستخدم</p>
          ) : null}
        </div>

        {/* Trips 30d */}
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Route className="h-3 w-3" /> رحلات 30 يوم
          </div>
          <p className="font-semibold font-mono">{Number(trips.totalCount ?? 0)}</p>
          <p className="text-muted-foreground">
            مكتملة {Number(trips.completedCount ?? 0)} · جارية {Number(trips.inProgressCount ?? 0)}
          </p>
          <p className="text-muted-foreground font-mono">{Number(trips.totalDistance ?? 0).toFixed(0)} كم</p>
        </div>

        {/* Fuel 30d */}
        <div className="border rounded p-2 space-y-1">
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <Fuel className="h-3 w-3" /> وقود 30 يوم
          </div>
          <p className="font-semibold font-mono">{formatCurrency(fuel.totalCost ?? 0)}</p>
          <p className="text-muted-foreground">
            {Number(fuel.logCount ?? 0)} تعبئة · {Number(fuel.totalLiters ?? 0).toFixed(0)} لتر
          </p>
        </div>

        {/* Violations */}
        <div className={`border rounded p-2 space-y-1 ${hasOpenViolations ? "border-status-error-surface bg-status-error-surface/30" : ""}`}>
          <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
            <ShieldAlert className="h-3 w-3" /> مخالفات مرورية
          </div>
          <p className="font-semibold font-mono">
            {Number(violations.openCount ?? 0)} <span className="text-muted-foreground font-normal text-[10px]">مفتوحة</span>
          </p>
          <p className="text-muted-foreground">
            مستحق: {formatCurrency(violations.totalUnpaid ?? 0)}
          </p>
          <p className="text-muted-foreground text-[10px]">إجمالي {Number(violations.lifetimeCount ?? 0)} مخالفة</p>
        </div>

        {/* Quick actions */}
        <div className="border rounded p-2 space-y-1 bg-muted/30">
          <div className="text-muted-foreground text-[11px]">إجراءات سريعة</div>
          {emp && (
            <Link href={`/finance/custodies/new?employeeId=${emp.id}`}>
              <a className="block text-[11px] text-primary underline-offset-2 hover:underline">
                + صرف عهدة جديدة
              </a>
            </Link>
          )}
          <Link href={`/fleet/trips/new?driverId=${driverId}`}>
            <a className="block text-[11px] text-primary underline-offset-2 hover:underline">
              + رحلة جديدة
            </a>
          </Link>
          <Link href={`/fleet/fuel/new?driverId=${driverId}`}>
            <a className="block text-[11px] text-primary underline-offset-2 hover:underline">
              + تعبئة وقود
            </a>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
