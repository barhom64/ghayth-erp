import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Package, Star, Bus, Utensils, Calendar } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "متاح",
  inactive: "غير متاح",
  sold_out: "نفذ",
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
        label: pkg.seasonName || `موسم #${pkg.seasonId}`,
        sublabel: "الموسم",
        href: `/umrah/seasons/${pkg.seasonId}`,
        icon: Calendar,
      });
    }
    return out;
  }, [pkg]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!pkg) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `PKG-${id}` },
      { label: "اسم الباقة", value: pkg.name || "-" },
      { label: "السعر", value: formatCurrency(Number(pkg.price ?? 0)) },
      { label: "المدة", value: pkg.duration ? `${pkg.duration} يوم` : "-" },
      { label: "الفندق", value: pkg.hotelName || "-" },
      { label: "تصنيف الفندق", value: pkg.hotelStars ? `${pkg.hotelStars} نجوم` : "-" },
      { label: "النقل", value: pkg.transportType || "-" },
      { label: "الوجبات", value: pkg.mealsIncluded || "-" },
      { label: "السعة", value: String(pkg.capacity ?? "-") },
      { label: "المحجوز", value: String(pkg.bookedCount ?? 0) },
      { label: "الحالة", value: STATUS_LABELS[pkg.status] || pkg.status || "-" },
    ];
    return [{ kind: "info-grid", items }];
  }, [pkg, id]);

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
            <Package className="h-4 w-4 text-gray-500" />
            بيانات الباقة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero price */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatCurrency(Number(pkg?.price ?? 0))}
            </span>
            <span className="text-xs text-gray-500">سعر الباقة</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">اسم الباقة</p>
              <span className="text-gray-800 font-medium">{pkg?.name || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">المدة</p>
              <span className="text-gray-800">{pkg?.duration ? `${pkg.duration} يوم` : "-"}</span>
            </div>
            {pkg?.hotelName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الفندق</p>
                <span className="text-gray-800">{pkg.hotelName}</span>
              </div>
            )}
            {pkg?.hotelStars && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تصنيف الفندق</p>
                <span className="text-gray-800 flex items-center gap-1">
                  <Star className="h-3 w-3 text-yellow-500" />
                  {pkg.hotelStars} نجوم
                </span>
              </div>
            )}
            {pkg?.transportType && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">النقل</p>
                <span className="text-gray-800 flex items-center gap-1">
                  <Bus className="h-3 w-3 text-gray-400" />
                  {pkg.transportType}
                </span>
              </div>
            )}
            {pkg?.mealsIncluded && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الوجبات</p>
                <span className="text-gray-800 flex items-center gap-1">
                  <Utensils className="h-3 w-3 text-gray-400" />
                  {pkg.mealsIncluded}
                </span>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-0.5">السعة</p>
              <span className="text-gray-800">{pkg?.capacity ?? "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">المحجوز</p>
              <span className="text-gray-800 font-semibold">{pkg?.bookedCount ?? 0}</span>
            </div>
          </div>

          {pkg?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{pkg.description}</p>
            </div>
          )}

          {pkg?.inclusions && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">يشمل</p>
              <p className="text-gray-800 whitespace-pre-wrap">{pkg.inclusions}</p>
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
                <span className="text-gray-500">المحجوز</span>
                <span className="font-semibold">{pkg?.bookedCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">السعة</span>
                <span className="font-semibold">{pkg?.capacity ?? "-"}</span>
              </div>
              {pkg?.capacity && (
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, ((pkg.bookedCount ?? 0) / pkg.capacity) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {pkg?.seasonName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                الموسم
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{pkg.seasonName}</p>
              {pkg.seasonId && (
                <Badge variant="outline" className="mt-1 text-[10px]">SN-{pkg.seasonId}</Badge>
              )}
            </CardContent>
          </Card>
        )}
      </div>

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
          extra={
            <EntityPrintButton
              branchId={pkg?.branchId}
              title={`الباقة — ${pkg?.name || ""}`}
              ref={`PKG-${id}`}
              date={formatDateAr(new Date().toISOString())}
              sections={printSections}
            />
          }
        />
      }
    />
  );
}
