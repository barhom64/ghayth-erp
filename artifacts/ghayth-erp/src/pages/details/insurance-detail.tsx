import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
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
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Edit, Shield, Car } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "ساري",
  expired: "منتهي",
  pending: "معلق",
  cancelled: "ملغى",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "expired") return "destructive" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "pending") return "muted" as const;
  return "default" as const;
}

const INSURANCE_TYPE_LABELS: Record<string, string> = {
  comprehensive: "شامل",
  third_party: "ضد الغير",
  mandatory: "إلزامي",
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

export default function InsuranceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/fleet/insurance/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("insurance_policy", id ?? 0);

  const { data: insurance, isLoading, error, refetch } = useApiQuery<any>(
    ["insurance-detail", String(id)],
    id ? `/fleet/insurance/${id}` : null,
    !!id
  );

  const expiryDaysLeft = daysUntil(insurance?.endDate || insurance?.expiryDate);
  const isExpired = expiryDaysLeft !== null && expiryDaysLeft < 0;
  const isExpiringSoon = expiryDaysLeft !== null && expiryDaysLeft >= 0 && expiryDaysLeft <= 30;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!insurance) return out;
    if (insurance.vehicleId) {
      out.push({
        type: "vehicle",
        id: insurance.vehicleId,
        label: insurance.vehiclePlateNumber || insurance.plateNumber || `مركبة #${insurance.vehicleId}`,
        sublabel: "المركبة",
        href: `/fleet/${insurance.vehicleId}`,
        icon: Car,
      });
    }
    return out;
  }, [insurance]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!insurance) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `INS-${id}` },
      { label: "المركبة", value: insurance.vehiclePlateNumber || insurance.plateNumber || "-" },
      { label: "شركة التأمين", value: insurance.insuranceCompany || insurance.company || "-" },
      { label: "رقم الوثيقة", value: insurance.policyNumber || "-" },
      { label: "نوع التأمين", value: INSURANCE_TYPE_LABELS[insurance.insuranceType || insurance.type] || insurance.insuranceType || insurance.type || "-" },
      { label: "قسط التأمين", value: formatCurrency(insurance.premium || insurance.amount || 0) },
      { label: "تاريخ البداية", value: formatDateAr(insurance.startDate) },
      { label: "تاريخ الانتهاء", value: formatDateAr(insurance.endDate || insurance.expiryDate) },
      { label: "الحالة", value: STATUS_LABELS[insurance.status] || insurance.status || "-" },
    ];
    if (insurance.coverageDetails || insurance.coverage) {
      items.push({ label: "تفاصيل التغطية", value: insurance.coverageDetails || insurance.coverage });
    }
    const sections: PrintSection[] = [{ kind: "info-grid", items }];
    return sections;
  }, [insurance, id]);

  const editDelete = useDetailEditDelete({
    entityLabel: "التأمين",
    patchPath: `/fleet/insurance/${id}`,
    deletePath: `/fleet/insurance/${id}`,
    listPath: "/fleet/insurance",
    initialValues: insurance,
    fields: [
      { key: "policyNumber", label: "رقم البوليصة" },
      { key: "provider", label: "شركة التأمين" },
      { key: "premium", label: "القسط", type: "number" },
      { key: "coverageAmount", label: "مبلغ التغطية", type: "number" },
    ],
    invalidateKeys: [["insurance", String(id)], ["insurance"]],
    onSaved: () => refetch(),
  });

  const premium = insurance?.premium || insurance?.amount || 0;

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            بيانات التأمين
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero premium amount */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(premium)}
            </span>
            <span className="text-xs text-muted-foreground">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(insurance?.vehiclePlateNumber || insurance?.plateNumber) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم اللوحة</p>
                <span className="text-status-neutral-foreground font-mono">{insurance.vehiclePlateNumber || insurance.plateNumber}</span>
              </div>
            )}
            {(insurance?.insuranceCompany || insurance?.company) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">شركة التأمين</p>
                <span className="text-status-neutral-foreground">{insurance.insuranceCompany || insurance.company}</span>
              </div>
            )}
            {insurance?.policyNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم الوثيقة</p>
                <span className="text-status-neutral-foreground font-mono">{insurance.policyNumber}</span>
              </div>
            )}
            {(insurance?.insuranceType || insurance?.type) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع التأمين</p>
                <Badge variant="outline">
                  {INSURANCE_TYPE_LABELS[insurance.insuranceType || insurance.type] || insurance.insuranceType || insurance.type}
                </Badge>
              </div>
            )}
            {insurance?.startDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ البداية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(insurance.startDate)}</span>
              </div>
            )}
            {(insurance?.endDate || insurance?.expiryDate) && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الانتهاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(insurance.endDate || insurance.expiryDate)}</span>
              </div>
            )}
          </div>

          {(insurance?.coverageDetails || insurance?.coverage) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">تفاصيل التغطية</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{insurance.coverageDetails || insurance.coverage}</p>
            </div>
          )}

          {/* Expiry warning */}
          {(insurance?.endDate || insurance?.expiryDate) && (
            <div className="mt-2">
              {isExpired && (
                <div className="flex items-start gap-2 rounded-md border border-status-error-surface bg-status-error-surface p-3 text-status-error-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">التأمين منتهي</p>
                    <p>منتهي منذ {Math.abs(expiryDaysLeft!)} يوم — يجب تجديد الوثيقة فوراً.</p>
                  </div>
                </div>
              )}
              {!isExpired && isExpiringSoon && (
                <div className="flex items-start gap-2 rounded-md border border-status-warning-surface bg-status-warning-surface p-3 text-status-warning-foreground">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">التأمين على وشك الانتهاء</p>
                    <p>ينتهي خلال {expiryDaysLeft} يوم — نوصي بالتجديد المبكر.</p>
                  </div>
                </div>
              )}
              {!isExpired && !isExpiringSoon && expiryDaysLeft !== null && (
                <div className="flex items-start gap-2 rounded-md border border-status-success-surface bg-status-success-surface p-3 text-status-success-foreground">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">التأمين ساري</p>
                    <p>تبقى {expiryDaysLeft} يوم حتى تاريخ الانتهاء.</p>
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
              المركبة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {insurance?.vehicleId ? (
              <div className="space-y-1">
                <p className="font-semibold font-mono">{insurance.vehiclePlateNumber || insurance.plateNumber || `#${insurance.vehicleId}`}</p>
                {(insurance.vehicleMake || insurance.vehicleModel) && (
                  <p className="text-xs text-muted-foreground">
                    {[insurance.vehicleMake, insurance.vehicleModel].filter(Boolean).join(" ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">لا توجد مركبة مرتبطة</p>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="insurance" entityId={id} />}
      {id && <EntityTags entityType="insurance" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={insurance?.policyNumber ? `تأمين ${insurance.policyNumber}` : "تفاصيل التأمين"}
      subtitle={
        insurance?.insuranceCompany || insurance?.company
          ? insurance.insuranceCompany || insurance.company
          : undefined
      }
      backPath="/fleet/insurance"
      refNumber={`INS-${id}`}
      status={
        insurance
          ? { label: STATUS_LABELS[insurance.status] || insurance.status || "-", tone: statusTone(insurance.status) }
          : undefined
      }
      typeLabel={
        insurance?.insuranceType || insurance?.type
          ? INSURANCE_TYPE_LABELS[insurance.insuranceType || insurance.type] || insurance.insuranceType || insurance.type
          : undefined
      }
      createdAt={insurance?.createdAt}
      updatedAt={insurance?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="insurance"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {insurance && (
            <EntityPrintButton
              branchId={insurance.branchId}
              title={`تأمين INS-${id}`}
              ref={`INS-${id}`}
              date={formatDateAr(insurance.startDate || insurance.createdAt)}
              sections={printSections}
            />
          )}
          <DetailActionButtons hook={editDelete} editPerm="fleet:update" deletePerm="fleet:delete" />
        </>
      }
    />
  );
}
