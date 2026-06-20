import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { useDetailEditDelete, DetailActionButtons, InlineEditCard } from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout, type RelatedEntity, EntityComments } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Package, Star, Bus, Utensils, Calendar, Users, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "متاح",
  inactive: "غير متاح",
  sold_out: "نفذ",
};

// Pilgrim status → Arabic — same dictionary as group / season detail.
// Lift to a shared module if a 4th caller needs it.
const PILGRIM_STATUS_LABELS: Record<string, string> = {
  pending: "لم يصل",
  arrived: "وصل",
  active: "نشط",
  overstayed: "متأخر",
  overstay_penalized: "متأخر مع غرامة",
  departed: "غادر",
  violated: "مخالف",
  absconded: "هارب",
  deceased: "متوفى",
  visa_rejected: "تأشيرة مرفوضة",
  visa_printed: "تأشيرة مطبوعة",
  cancelled: "ملغي",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "inactive") return "muted" as const;
  if (status === "sold_out") return "destructive" as const;
  return "default" as const;
}

export default function UmrahPackageDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/umrah/packages/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-package", id ?? 0);

  const { data: pkg, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-package", String(id)],
    id ? `/umrah/packages/${id}` : null,
    !!id
  );

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!pkg) return out;
    if (pkg.seasonId) {
      out.push({
        type: "season",
        id: pkg.seasonId,
        label: pkg.seasonTitle || `موسم #${pkg.seasonId}`,
        sublabel: "الموسم",
        href: `/umrah/seasons/${pkg.seasonId}`,
        icon: Calendar,
      });
    }
    return out;
  }, [pkg]);


  const editDelete = useDetailEditDelete({
    entityLabel: "الباقة",
    patchPath: `/umrah/packages/${id}`,
    deletePath: `/umrah/packages/${id}`,
    listPath: "/umrah/packages",
    initialValues: pkg,
    fields: [
      { key: "name", label: "اسم الباقة" },
      { key: "price", label: "السعر", type: "number" },
      { key: "capacity", label: "السعة", type: "number" },
      { key: "description", label: "الوصف" },
    ],
    invalidateKeys: [["umrah-package", String(id)], ["umrah-packages"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            بيانات الباقة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero price */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(Number(pkg?.sellPrice ?? 0))}
            </span>
            <span className="text-xs text-muted-foreground">سعر الباقة</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">اسم الباقة</p>
              <span className="text-status-neutral-foreground font-medium">{pkg?.name || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المدة</p>
              <span className="text-status-neutral-foreground">{pkg?.duration ? `${pkg.duration} يوم` : "-"}</span>
            </div>
            {pkg?.hotelName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الفندق</p>
                <span className="text-status-neutral-foreground">{pkg.hotelName}</span>
              </div>
            )}
            {pkg?.hotelStars && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تصنيف الفندق</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 text-status-warning" />
                  {pkg.hotelStars} نجوم
                </span>
              </div>
            )}
            {pkg?.transportType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">النقل</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Bus className="h-3 w-3 text-muted-foreground" />
                  {pkg.transportType}
                </span>
              </div>
            )}
            {pkg?.mealsIncluded && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الوجبات</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Utensils className="h-3 w-3 text-muted-foreground" />
                  {pkg.mealsIncluded}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">السعة</p>
              <span className="text-status-neutral-foreground">{pkg?.capacity ?? "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المحجوز</p>
              <span className="text-status-neutral-foreground font-semibold">{pkg?.pilgrimCount ?? 0}</span>
            </div>
          </div>

          {pkg?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{pkg.description}</p>
            </div>
          )}

          {pkg?.inclusions && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">يشمل</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{pkg.inclusions}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">الإشغال</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المحجوز</span>
                <span className="font-semibold">{pkg?.pilgrimCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">السعة</span>
                <span className="font-semibold">{pkg?.capacity ?? "-"}</span>
              </div>
              {pkg?.capacity && (
                <div className="w-full bg-surface-subtle rounded-full h-2 mt-2">
                  <div
                    className="bg-status-info-surface0 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, ((pkg.pilgrimCount ?? 0) / pkg.capacity) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {pkg?.seasonTitle && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                الموسم
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{pkg.seasonTitle}</p>
              {pkg.seasonId && (
                <Badge variant="outline" className="mt-1 text-[10px]">SN-{pkg.seasonId}</Badge>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status mix card — visible only when the package has actual
          pilgrims, otherwise the empty chips would imply data we
          don't have. */}
      {pkg?.statusBreakdown && Object.keys(pkg.statusBreakdown).length > 0 && (
        <Card className="md:col-span-3" data-testid="package-status-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              توزيع حالة المعتمرين ({pkg?.pilgrimCount ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="package-status-breakdown">
              {Object.entries(pkg.statusBreakdown as Record<string, number>).map(([status, count]) => (
                <Badge key={status} variant="outline" className="text-xs">
                  {PILGRIM_STATUS_LABELS[status] || status}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Projection card — sellPrice / costPrice × actual count = the
          best estimate of this package's contribution to the season's
          P&L. Margin red when negative (the same priced-below-cost
          signal we surface elsewhere). */}
      {pkg?.projection && (
        <Card className="md:col-span-3" data-testid="package-projection-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              توقع الإيرادات والتكاليف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">سعر البيع / معتمر</p>
                <span className="text-lg font-semibold" data-testid="package-sell-per-pilgrim">
                  {formatCurrency(Number(pkg.projection.sellPerPilgrim ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التكلفة / معتمر</p>
                <span className="text-lg font-semibold" data-testid="package-cost-per-pilgrim">
                  {formatCurrency(Number(pkg.projection.costPerPilgrim ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الهامش / معتمر</p>
                <span
                  className={`text-lg font-bold ${Number(pkg.projection.marginPerPilgrim ?? 0) < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                  data-testid="package-margin-per-pilgrim"
                >
                  {formatCurrency(Number(pkg.projection.marginPerPilgrim ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">إيراد متوقع</p>
                <span className="font-semibold" data-testid="package-projected-revenue">
                  {formatCurrency(Number(pkg.projection.projectedRevenue ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تكلفة متوقعة</p>
                <span className="font-semibold">
                  {formatCurrency(Number(pkg.projection.projectedCost ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">هامش متوقع</p>
                <span
                  className={`font-bold ${Number(pkg.projection.projectedMargin ?? 0) < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                  data-testid="package-projected-margin"
                >
                  {formatCurrency(Number(pkg.projection.projectedMargin ?? 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {id && <EntityComments entityType="umrah-package" entityId={id} />}
      {id && <EntityTags entityType="umrah-package" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={pkg?.name || "تفاصيل الباقة"}
      subtitle={pkg?.duration ? `${pkg.duration} يوم` : undefined}
      backPath="/umrah/packages"
      refNumber={id ? `PKG-${id}` : undefined}
      status={
        pkg
          ? { label: STATUS_LABELS[pkg.status] || pkg.status || "-", tone: statusTone(pkg.status) }
          : undefined
      }
      createdAt={pkg?.createdAt}
      updatedAt={pkg?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="umrah-package"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <DetailActionButtons
          hook={editDelete}
          editPerm="umrah:update"
          deletePerm="umrah:delete"
          extra={
            <PrintButton
              entityType="umrah_package"
              entityId={id ?? 0}
             />
          }
        />
      }
    />
  );
}
