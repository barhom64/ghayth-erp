import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, FolderTree } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";

/**
 * WarehouseCategoryDetail — detail page for a single warehouse category.
 * Fetches from `/warehouse/categories/:id` and shows parent/child info,
 * product count and the rolled-up stock value.
 */

export default function WarehouseCategoryDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/warehouse/categories/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("warehouse-category", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["warehouse-category", String(id)],
    id ? `/warehouse/categories/${id}` : null,
    !!id
  );

  const category = data;

  const productsCount = Number(category?.productsCount ?? 0);
  const totalStockValue = Number(category?.totalStockValue ?? 0);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!category) return out;
    if (category.parentId) {
      out.push({
        type: "category",
        id: category.parentId,
        label: category.parentName || `تصنيف #${category.parentId}`,
        sublabel: "التصنيف الأب",
        href: `/warehouse/categories/${category.parentId}`,
      });
    }
    return out;
  }, [category]);

  const handleEdit = () => {
    setLocation(`/warehouse/categories/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            بيانات التصنيف
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-center gap-3 border-b pb-3">
            {(category?.icon || category?.color) && (
              <div
                className="h-10 w-10 rounded flex items-center justify-center text-lg"
                style={{
                  backgroundColor: category?.color ? `${category.color}22` : undefined,
                  color: category?.color || undefined,
                }}
              >
                {category?.icon || "📁"}
              </div>
            )}
            <div>
              <p className="text-lg font-semibold text-gray-900">{category?.name || "-"}</p>
              {category?.parentName && (
                <p className="text-xs text-muted-foreground">ضمن: {category.parentName}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {category?.parentName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التصنيف الأب</p>
                <Badge variant="outline">{category.parentName}</Badge>
              </div>
            )}
            {category?.color && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">اللون</p>
                <div className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded border"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="font-mono text-xs">{category.color}</span>
                </div>
              </div>
            )}
          </div>

          {category?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{category.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">إحصائيات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">عدد الأصناف</span>
              <span className="font-semibold">{productsCount}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">قيمة المخزون</span>
              <span className="font-semibold text-gray-900">{formatCurrency(totalStockValue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="warehouse-category" entityId={id} />}
      {id && <EntityTags entityType="warehouse-category" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={category?.name ? category.name : "تفاصيل التصنيف"}
      subtitle={category?.parentName ? `ضمن: ${category.parentName}` : undefined}
      backPath="/warehouse/categories"
      refNumber={id ? `CAT-${id}` : undefined}
      createdAt={category?.createdAt}
      updatedAt={category?.updatedAt}
      createdByName={category?.createdByName}
      relatedEntities={relatedEntities}
      entityType="warehouse-category"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <GuardedButton perm="warehouse:update" variant="outline" size="sm" onClick={handleEdit} disabled={!category}>
          <Edit className="h-4 w-4 ms-1" />
          تعديل
        </GuardedButton>
      }
    />
  );
}
