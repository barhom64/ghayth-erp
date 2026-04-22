import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Calendar, Users, TrendingUp } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

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

  const { data: season, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-season", String(id)],
    id ? `/umrah/seasons/${id}` : null,
    !!id
  );

  const printSections: PrintSection[] = useMemo(() => {
    if (!season) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `SN-${id}` },
      { label: "اسم الموسم", value: season.name || season.title || "-" },
      { label: "السنة", value: String(season.year ?? "-") },
      { label: "تاريخ البداية", value: season.startDate ? formatDateAr(season.startDate) : "-" },
      { label: "تاريخ النهاية", value: season.endDate ? formatDateAr(season.endDate) : "-" },
      { label: "السعة", value: String(season.capacity ?? "-") },
      { label: "المعتمرون المسجلون", value: String(season.registeredPilgrims ?? season.pilgrimsCount ?? 0) },
      { label: "الإيرادات", value: formatCurrency(Number(season.revenue ?? 0)) },
      { label: "الحالة", value: STATUS_LABELS[season.status] || season.status || "-" },
    ];
    return [{ kind: "info-grid", items }];
  }, [season, id]);

  const handleEdit = () => {
    setLocation(`/umrah/seasons/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
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
              <span className="text-xs text-gray-500">إيرادات الموسم</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">اسم الموسم</p>
              <span className="text-gray-800 font-medium">{season?.name || season?.title || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">السنة</p>
              <span className="text-gray-800">{season?.year || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">تاريخ البداية</p>
              <span className="text-gray-800">{season?.startDate ? formatDateAr(season.startDate) : "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">تاريخ النهاية</p>
              <span className="text-gray-800">{season?.endDate ? formatDateAr(season.endDate) : "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">السعة</p>
              <span className="text-gray-800">{season?.capacity ?? "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">المعتمرون المسجلون</p>
              <span className="text-gray-800 font-semibold">
                {season?.registeredPilgrims ?? season?.pilgrimsCount ?? 0}
              </span>
            </div>
          </div>

          {season?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{season.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              الإشغال
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">المسجلون</span>
                <span className="font-semibold">{season?.registeredPilgrims ?? season?.pilgrimsCount ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">السعة</span>
                <span className="font-semibold">{season?.capacity ?? "-"}</span>
              </div>
              {season?.capacity && (
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
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
              <TrendingUp className="h-4 w-4 text-gray-500" />
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
    </div>
  );

  return (
    <DetailPageLayout
      title={season?.name || season?.title || "تفاصيل الموسم"}
      subtitle={season?.year ? `موسم ${season.year}` : undefined}
      backPath="/umrah/seasons"
      refNumber={id ? `SN-${id}` : undefined}
      status={
        season
          ? { label: STATUS_LABELS[season.status] || season.status || "-", tone: statusTone(season.status) }
          : undefined
      }
      createdAt={season?.createdAt}
      updatedAt={season?.updatedAt}
      entityType="season"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={season?.branchId}
            title={`الموسم — ${season?.name || season?.title || ""}`}
            ref={`SN-${id}`}
            date={formatDateAr(new Date().toISOString())}
            sections={printSections}
          />
          <GuardedButton perm="operations:update" variant="outline" size="sm" onClick={handleEdit} disabled={!season}>
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
