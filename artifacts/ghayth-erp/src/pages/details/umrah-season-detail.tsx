import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import {
  DetailPageLayout,
  EntityComments,
  EntityDocuments,
  UMRAH_ATTACHMENT_CATEGORIES,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Calendar, Users, TrendingUp, Wallet, AlertTriangle, Shield, Layers } from "lucide-react";
import { Link } from "wouter";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "قادم",
  active: "نشط",
  completed: "مكتمل",
  cancelled: "ملغى",
  open: "مفتوح",
  closed: "مغلق",
};

// Pilgrim status → Arabic label. Kept in sync with the constant on
// the group-detail page; refactor target: lift to a shared module
// once a 4th caller needs it.
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
    `/umrah/seasons/${id}`,
    !!id
  );


  const editDelete = useDetailEditDelete({
    entityLabel: "الموسم",
    patchPath: `/umrah/seasons/${id}`,
    // Backend has no DELETE /umrah/seasons/:id — seasons stay in the
    // archive once created. The hook hides the Trash button when
    // deletePath is omitted.
    listPath: "/umrah/seasons",
    initialValues: season,
    fields: [
      { key: "name", label: "اسم الموسم" },
      { key: "year", label: "السنة", type: "number" },
      { key: "capacity", label: "السعة", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["umrah-season", id || ""], ["umrah-seasons"]],
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

      {/* Operational stats — answers "how is this season actually
          performing?". Pulled from the enriched GET /seasons/:id
          payload (PR-extending the route), so all numbers are a
          single roundtrip. */}
      <Card className="md:col-span-3" data-testid="season-status-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            توزيع حالة المعتمرين ({season?.pilgrimsCount ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {season?.statusBreakdown && Object.keys(season.statusBreakdown).length > 0 ? (
            <div className="flex flex-wrap gap-2" data-testid="season-status-breakdown">
              {Object.entries(season.statusBreakdown as Record<string, number>).map(([status, count]) => (
                <Badge key={status} variant="outline" className="text-xs">
                  {PILGRIM_STATUS_LABELS[status] || status}: {count}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد معتمرون بعد.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="season-groups-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            المجموعات والوكلاء
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">عدد المجموعات</span>
            <span className="font-semibold" data-testid="season-groups-count">{season?.groupsCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">عدد الوكلاء النشطين</span>
            <span className="font-semibold" data-testid="season-agents-count">{season?.agentsCount ?? 0}</span>
          </div>
          {id && (season?.groupsCount ?? 0) > 0 && (
            <Link
              href={`/umrah/groups?seasonId=${id}`}
              className="text-xs text-blue-600 hover:underline block pt-1"
              data-testid="season-groups-link"
            >
              فتح المجموعات ←
            </Link>
          )}
        </CardContent>
      </Card>

      <Card data-testid="season-alerts-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            تنبيهات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> تأشيرات تنتهي خلال 7 أيام
            </span>
            <span
              className={`font-semibold ${Number(season?.visaExpiringCount ?? 0) > 0 ? "text-status-warning-foreground" : ""}`}
              data-testid="season-visa-expiring"
            >
              {season?.visaExpiringCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> متأخرون حالياً
            </span>
            <span
              className={`font-semibold ${Number(season?.overstayCount ?? 0) > 0 ? "text-status-error-foreground" : ""}`}
              data-testid="season-overstay-count"
            >
              {season?.overstayCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" /> مستثنون من المسح
            </span>
            <span className="font-semibold" data-testid="season-exempt-count">
              {season?.exemptCount ?? 0}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3" data-testid="season-finance-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            الملخص المالي للموسم
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي المبيعات ({season?.finance?.invoiceCount ?? 0} فاتورة)</p>
              <span className="text-lg font-semibold" data-testid="season-invoice-total">
                {formatCurrency(Number(season?.finance?.invoiceTotal ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المُحصّل</p>
              <span className="text-lg font-semibold text-status-success-foreground" data-testid="season-invoice-paid">
                {formatCurrency(Number(season?.finance?.invoicePaid ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المتبقي</p>
              <span
                className={`text-lg font-semibold ${Number(season?.finance?.invoiceOutstanding ?? 0) > 0 ? "text-status-error-foreground" : ""}`}
                data-testid="season-invoice-outstanding"
              >
                {formatCurrency(Number(season?.finance?.invoiceOutstanding ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                تكلفة نسك ({season?.finance?.nuskCount ?? 0} فاتورة)
              </p>
              <span className="text-lg font-semibold" data-testid="season-nusk-cost">
                {formatCurrency(Number(season?.finance?.nuskNetCost ?? 0))}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">الهامش (مبيعات − تكلفة نسك)</span>
            <span
              className={`text-xl font-bold ${Number(season?.finance?.margin ?? 0) < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
              data-testid="season-margin"
            >
              {formatCurrency(Number(season?.finance?.margin ?? 0))}
            </span>
          </div>
        </CardContent>
      </Card>

      {id && <EntityComments entityType="umrah-season" entityId={id} />}
      {id && <EntityTags entityType="umrah-season" entityId={id} />}
      {id && (
        <EntityDocuments
          entityType="umrah_season"
          entityId={id}
          title="المرفقات"
          categories={UMRAH_ATTACHMENT_CATEGORIES}
          quickUpload
          canDelete
          viewMode="grid"
        />
      )}
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
            <>
              <PrintButton
                entityType="umrah_season"
                entityId={id ?? 0}
               />
              {id && <EntityPnlButton entityType="umrah_season" entityId={Number(id)} />}
            </>
          }
        />
      }
    />
  );
}
