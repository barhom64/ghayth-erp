import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Box } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  disposed: "مستبعد",
  fully_depreciated: "مستهلك بالكامل",
  under_maintenance: "قيد الصيانة",
  transferred: "منقول",
  sold: "مباع",
};

const DEPRECIATION_METHODS: Record<string, string> = {
  straight_line: "القسط الثابت",
  declining_balance: "الرصيد المتناقص",
  units_of_production: "وحدات الإنتاج",
  sum_of_years: "مجموع أرقام السنوات",
};

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "disposed" || status === "sold") return "destructive" as const;
  if (status === "fully_depreciated") return "muted" as const;
  if (status === "under_maintenance") return "warning" as const;
  return "default" as const;
}

export default function FixedAssetDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/fixed-assets/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("fixed-asset", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["fixed-asset", String(id)],
    id ? `/finance/fixed-assets/${id}` : null,
    !!id,
  );

  const item = data;

  const cost = Number(item?.purchaseCost || item?.cost || 0);
  const accumulated = Number(item?.accumulatedDepreciation || 0);
  const netBook = cost - accumulated;
  const depreciationPct = cost > 0 ? (accumulated / cost) * 100 : 0;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.departmentId) {
      out.push({
        type: "department",
        id: item.departmentId,
        label: item.departmentName || `قسم #${item.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (item.custodianId) {
      out.push({
        type: "employee",
        id: item.custodianId,
        label: item.custodianName || `موظف #${item.custodianId}`,
        sublabel: "المسؤول عن الأصل",
        href: `/employees/${item.custodianId}`,
      });
    }
    if (item.supplierId) {
      out.push({
        type: "vendor",
        id: item.supplierId,
        label: item.supplierName || `مورد #${item.supplierId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${item.supplierId}`,
      });
    }
    return out;
  }, [item]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!item) return [];
    return [
      {
        kind: "info-grid",
        items: [
          { label: "اسم الأصل", value: item.name || "-" },
          { label: "الفئة", value: item.category || "-" },
          { label: "رقم الأصل", value: item.assetNumber || item.serialNumber || "-" },
          { label: "تاريخ الشراء", value: formatDateAr(item.purchaseDate) },
          { label: "العمر الافتراضي", value: item.usefulLife ? `${item.usefulLife} سنة` : "-" },
          { label: "طريقة الاستهلاك", value: DEPRECIATION_METHODS[item.depreciationMethod] || item.depreciationMethod || "-" },
          { label: "الموقع", value: item.location || "-" },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
        ],
      },
      {
        kind: "summary",
        items: [
          { label: "تكلفة الشراء", value: formatCurrency(cost) },
          { label: "الاستهلاك المتراكم", value: formatCurrency(accumulated) },
          { label: "القيمة الدفترية", value: formatCurrency(netBook), bold: true },
        ],
      },
    ];
  }, [item, cost, accumulated, netBook]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            بيانات الأصل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border-b pb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(netBook)}</span>
              <span className="text-xs text-muted-foreground">ر.س قيمة دفترية</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              من أصل {formatCurrency(cost)} — مُستهلك: {depreciationPct.toFixed(1)}%
            </p>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">نسبة الاستهلاك</span>
              <span className="font-medium">{depreciationPct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-surface-subtle rounded-full overflow-hidden">
              <div className="h-full bg-status-warning-surface0 rounded-full" style={{ width: `${Math.min(100, depreciationPct)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {item?.category && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الفئة</p>
                <Badge variant="outline">{item.category}</Badge>
              </div>
            )}
            {item?.assetNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم الأصل</p>
                <span className="font-mono text-xs">{item.assetNumber}</span>
              </div>
            )}
            {item?.serialNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الرقم التسلسلي</p>
                <span className="font-mono text-xs">{item.serialNumber}</span>
              </div>
            )}
            {item?.purchaseDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الشراء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(item.purchaseDate)}</span>
              </div>
            )}
            {item?.usefulLife && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">العمر الافتراضي</p>
                <span className="text-status-neutral-foreground">{item.usefulLife} سنة</span>
              </div>
            )}
            {item?.depreciationMethod && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">طريقة الاستهلاك</p>
                <Badge variant="secondary">{DEPRECIATION_METHODS[item.depreciationMethod] || item.depreciationMethod}</Badge>
              </div>
            )}
            {item?.location && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الموقع</p>
                <span className="text-status-neutral-foreground">{item.location}</span>
              </div>
            )}
          </div>

          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{item.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">القيم المالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">تكلفة الشراء</span>
              <span className="font-medium">{formatCurrency(cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الاستهلاك المتراكم</span>
              <span className="font-medium text-status-error-foreground">{formatCurrency(accumulated)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">القيمة الدفترية</span>
              <span className="font-bold text-emerald-600">{formatCurrency(netBook)}</span>
            </div>
            {item?.salvageValue && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">قيمة الخردة</span>
                <span className="font-medium">{formatCurrency(item.salvageValue)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {item?.custodianName && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">المسؤول عن الأصل</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{item.custodianName}</p>
              {item.departmentName && <p className="text-xs text-muted-foreground">{item.departmentName}</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="fixed-asset" entityId={id} />}
      {id && <EntityTags entityType="fixed-asset" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.name || "تفاصيل الأصل الثابت"}
      subtitle={item?.category}
      backPath="/finance/fixed-assets"
      refNumber={item?.ref || item?.assetNumber || (id ? `FA-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.purchaseDate || item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      assignedToName={item?.custodianName}
      relatedEntities={relatedEntities}
      entityType="fixed-asset"
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
            branchId={item?.branchId}
            title="أصل ثابت"
            ref={item?.ref || `FA-${id}`}
            date={formatDateAr(item?.purchaseDate || item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton
            perm="finance:update"
            variant="outline"
            size="sm"
            onClick={() => setLocation("/finance/fixed-assets")}
            disabled={!item || ["disposed", "sold"].includes(item.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
