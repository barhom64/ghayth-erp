import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout } from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Calendar, Users, TrendingUp } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@workspace/entity-kit";
import { EntityTags } from "@/components/shared/entity-tags";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "قادم",
  active: "نشط",
  completed: "مكتمل",
  cancelled: "ملغى",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "upcoming") return "info" as const;
  if (status === "completed") return "muted" as const;
  if (status === "cancelled") return "destructive" as const;
  return "default" as const;
}

export default function UmrahSeasonDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/umrah/seasons/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-season", id ?? 0);

  const { data: season, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-season", String(id)],
    id ? `/umrah/seasons/${id}` : null,
    !!id
  );

  const printSections: PrintSection[] = useMemo(() => {
    if (!season) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `SN-${id}` },
      { label: "اسم الموسم", value: season.title || "-" },
      { label: "السنة", value: String(season.hijriYear ?? "-") },
      { label: "تاريخ البداية", value: season.startDate ? formatDateAr(season.startDate) : "-" },
      { label: "تاريخ النهاية", value: season.endDate ? formatDateAr(season.endDate) : "-" },
      { label: "السعة", value: String(season.capacity ?? "-") },
      { label: "المعتمرون المسجلون", value: String(season.registeredPilgrims ?? season.pilgrimsCount ?? 0) },
      { label: "الإيرادات", value: formatCurrency(Number(season.revenue ?? 0)) },
      { label: "الحالة", value: STATUS_LABELS[season.status] || season.status || "-" },
    ];
    return [{ kind: "info-grid", items }];
  }, [season, id]);

  const editDelete = useDetailEditDelete({
    entityLabel: "الموسم",
    patchPath: `/umrah/seasons/${id}`,
    deletePath: `/umrah/seasons/${id}`,
    listPath: "/umrah/seasons",
    initialValues: season,
    fields: [
      { key: "name", label: "اسم الموسم" },
      { key: "year", label: "السنة", type: "number" },
      { key: "capacity", label: "السعة", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["umrah-season-detail", id || ""], ["umrah-seasons"]],
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
            <Calendar className="h-4 w-4 text-muted-foreground" />
            بيانات الموسم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero revenue */}
          {season?.revenue != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">
                {formatCurrency(Number(season.revenue))}
              </span>
              <span className="text-xs text-muted-foreground">إيرادات الموسم</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">اسم الموسم</p>
              <span className="text-status-neutral-foreground font-medium">{season?.title || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">السنة</p>
              <span className="text-status-neutral-foreground">{season?.hijriYear || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">تاريخ البداية</p>
              <span className="text-status-neutral-foreground">{season?.startDate ? formatDateAr(season.startDate) : "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">تاريخ النهاية</p>
              <span className="text-status-neutral-foreground">{season?.endDate ? formatDateAr(season.endDate) : "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">السعة</p>
              <span className="text-status-neutral-foreground">{season?.capacity ?? "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المعتمرون المسجلون</p>
              <span className="text-status-neutral-foreground font-semibold">
                {season?.registeredPilgrims ?? season?.pilgrimsCount ?? 0}
              </span>
            </div>
          </div>

          {season?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{season.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              الإشغال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المسجلون</span>
                <span className="font-semibold">{season?.registeredPilgrims ?? season?.pilgrimsCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">السعة</span>
                <span className="font-semibold">{season?.capacity ?? "-"}</span>
              </div>
              {season?.capacity && (
                <div className="w-full bg-surface-subtle rounded-full h-2 mt-2">
                  <div
                    className="bg-status-info-surface0 h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, ((season.registeredPilgrims ?? season.pilgrimsCount ?? 0) / season.capacity) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              الحالة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">
              {STATUS_LABELS[season?.status] || season?.status || "-"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="umrah-season" entityId={id} />}
      {id && <EntityTags entityType="umrah-season" entityId={id} />}
      {id && <UmrahAttachmentsPanel entityType="season" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={season?.title || "تفاصيل الموسم"}
      subtitle={season?.hijriYear ? `موسم ${season.hijriYear}` : undefined}
      backPath="/umrah/seasons"
      refNumber={id ? `SN-${id}` : undefined}
      status={
        season
          ? { label: STATUS_LABELS[season.status] || season.status || "-", tone: statusTone(season.status) }
          : undefined
      }
      createdAt={season?.createdAt}
      updatedAt={season?.updatedAt}
      entityType="umrah-season"
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
            <EntityPrintButton
              branchId={season?.branchId}
              title={`الموسم — ${season?.title || ""}`}
              ref={`SN-${id}`}
              date={formatDateAr(new Date().toISOString())}
              sections={printSections}
            />
          }
        />
      }
    />
  );
}
