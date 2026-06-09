import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
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
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, CheckCircle2, Edit, IdCard, Phone, User, Car,
  Trophy, Sparkles, Package, Users, Clock,
} from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
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
  const { extraTabs: registryTabs, hideTabs } = useRegistryTabs("driver", id ?? 0);
  const extraTabs = useMemo(() => {
    if (!id) return registryTabs;
    return [
      ...registryTabs,
      {
        key: "intelligence",
        label: "ذكاء السائق",
        icon: Trophy,
        content: () => <DriverIntelligenceTab driverId={id} />,
      },
    ];
  }, [registryTabs, id]);

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
          {id && <EntityPnlButton entityType="driver" entityId={Number(id)} />}
          <DetailActionButtons hook={editDelete} editPerm="fleet:update" deletePerm="fleet:delete" />
        </>
      }
    />
  );
}

interface DriverIntelligenceTabStats {
  driverId: number;
  dispatchCount: number;
  startRate: number;
  completionRate: number;
  onTimeRate: number;
  avgLateMinutes: number;
  serviceMix: {
    cargo: number; umrah: number; passenger: number; rental: number; other: number;
  };
  reputationScore: number;
  specialty: "umrah" | "cargo" | "passenger" | "mixed" | "new";
}

const TAB_SPEC_LABEL: Record<DriverIntelligenceTabStats["specialty"], string> = {
  umrah: "متخصّص في العمرة",
  cargo: "متخصّص في الحمولات",
  passenger: "متخصّص في نقل الركاب",
  mixed: "متعدد التخصصات",
  new: "حديث (لا توجد رحلات بعد)",
};

function DriverIntelligenceTab({ driverId }: { driverId: number }) {
  const { data, isLoading, isError } = useApiQuery<{ data: DriverIntelligenceTabStats; windowDays: number }>(
    ["driver-intelligence", String(driverId)],
    `/fleet/drivers/${driverId}/intelligence?windowDays=90`,
  );
  if (isLoading) return <div className="text-xs text-muted-foreground p-4">جارٍ التحميل…</div>;
  if (isError || !data?.data) return <div className="text-xs text-muted-foreground p-4">تعذّر تحميل بيانات الذكاء</div>;
  const s = data.data;
  const repTone = s.reputationScore >= 80 ? "text-status-success-foreground"
    : s.reputationScore >= 60 ? "text-status-warning-foreground"
    : s.reputationScore >= 40 ? "text-amber-600"
    : "text-rose-600";
  const totalMix = s.serviceMix.cargo + s.serviceMix.umrah + s.serviceMix.passenger + s.serviceMix.rental + s.serviceMix.other;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            السمعة التشغيلية ({data.windowDays} يومًا)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <div className="border rounded p-2">
            <p className="text-[10px] text-muted-foreground">سمعة مركّبة</p>
            <p className={`text-2xl font-bold font-mono ${repTone}`}>{s.reputationScore}</p>
          </div>
          <div className="border rounded p-2">
            <p className="text-[10px] text-muted-foreground">عدد الرحلات</p>
            <p className="text-2xl font-bold font-mono">{s.dispatchCount}</p>
          </div>
          <div className="border rounded p-2">
            <p className="text-[10px] text-muted-foreground">معدل الانطلاق</p>
            <p className="text-2xl font-bold font-mono">{s.startRate}%</p>
          </div>
          <div className="border rounded p-2">
            <p className="text-[10px] text-muted-foreground">معدل الإنجاز</p>
            <p className="text-2xl font-bold font-mono">{s.completionRate}%</p>
          </div>
          <div className="border rounded p-2">
            <p className="text-[10px] text-muted-foreground">الالتزام بالموعد</p>
            <p className={`text-2xl font-bold font-mono ${s.onTimeRate < 50 ? "text-rose-600" : ""}`}>{s.onTimeRate}%</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {s.specialty === "umrah" ? <Sparkles className="h-4 w-4 text-emerald-600" />
              : s.specialty === "cargo" ? <Package className="h-4 w-4 text-amber-600" />
              : <Users className="h-4 w-4 text-status-info-foreground" />}
            التخصص: {TAB_SPEC_LABEL[s.specialty]}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <p className="text-muted-foreground">مزيج نوع الرحلات في الـ {data.windowDays} يومًا الماضية:</p>
          {totalMix === 0 ? (
            <p className="text-muted-foreground">لا توجد رحلات منجزة في هذه النافذة.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <MixBar label="عمرة" count={s.serviceMix.umrah} total={totalMix} color="bg-emerald-500" />
              <MixBar label="حمولات" count={s.serviceMix.cargo} total={totalMix} color="bg-amber-500" />
              <MixBar label="ركاب" count={s.serviceMix.passenger} total={totalMix} color="bg-status-info-foreground" />
              <MixBar label="تأجير" count={s.serviceMix.rental} total={totalMix} color="bg-purple-500" />
              <MixBar label="أخرى" count={s.serviceMix.other} total={totalMix} color="bg-muted-foreground" />
            </div>
          )}
          {s.avgLateMinutes > 0 && (
            <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-rose-50 text-rose-700">
              <Clock className="h-4 w-4" />
              <span>متوسط التأخّر على الرحلات المتأخرة: {s.avgLateMinutes} دقيقة</span>
            </div>
          )}
          <p className="text-muted-foreground text-[10px] leading-relaxed mt-3">
            السمعة = 0.4 × الالتزام + 0.4 × الإنجاز + 0.2 × معدل الانطلاق.
            السائق الجديد يحصل على 50 محايد في محرك الاقتراح حتى لا يُعاقَب على عدم وجود سجل سابق.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MixBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="border rounded p-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="font-mono text-xs">{count}</span>
      </div>
      <div className="h-1.5 bg-surface-subtle rounded-full mt-1 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
    </div>
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
