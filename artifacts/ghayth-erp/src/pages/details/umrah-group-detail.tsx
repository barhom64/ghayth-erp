import { useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
} from "@workspace/entity-kit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Users, Plane, Wallet, AlertTriangle, Shield, Calendar } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";
import { UmrahGroupCostBreakdownCard } from "@/components/shared/umrah-group-cost-breakdown-card";
import { JourneyStepIndicator } from "@/components/shared/journey-step-indicator";

// Pilgrim status → Arabic label. Mirrors the constant on the agent
// detail page (kept in sync via the smoke test pin on both pages).
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

// Group lifecycle status → Arabic.
const GROUP_STATUS_LABELS: Record<string, string> = {
  imported: "مستوردة",
  pending: "قيد التجهيز",
  active: "نشطة",
  closed: "مغلقة",
  cancelled: "ملغاة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "closed") return "muted" as const;
  if (status === "cancelled") return "destructive" as const;
  return "default" as const;
}

interface PilgrimRow {
  id: number;
  fullName: string;
  nationality: string | null;
  status: string;
  overstayExempt: boolean;
  visaExpiry: string | null;
  entryFlight: string | null;
  exitFlight: string | null;
}

interface GroupDetail {
  id: number;
  nuskGroupNumber: string;
  internalRef: string | null;
  name: string | null;
  status: string;
  mutamerCount: number | null;
  programDuration: number | null;
  agentName: string | null;
  subAgentName: string | null;
  seasonTitle: string | null;
  agentId: number | null;
  subAgentId: number | null;
  seasonId: number | null;
  salesInvoiceId: number | null;
  createdAt: string;
  updatedAt: string;
  pilgrims: PilgrimRow[];
  statusBreakdown: Record<string, number>;
  overstayExemptCount: number;
  visaExpiringCount: number;
  finance: {
    invoiceCount: number;
    invoiceTotal: number;
    invoicePaid: number;
    invoiceOutstanding: number;
    nuskCount: number;
    nuskNetCost: number;
    nuskRefund: number;
    margin: number;
  };
  schedule: {
    minArrival: string | null;
    maxDeparture: string | null;
    entryFlights: string[];
    exitFlights: string[];
  };
}

export default function UmrahGroupDetail() {
  const [, params] = useRoute("/umrah/groups/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<GroupDetail>(
    ["umrah-group-detail", String(id)],
    `/umrah/groups/${id}`,
    !!id,
  );

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!data) return out;
    if (data.agentId) {
      out.push({
        type: "umrah-agent",
        id: data.agentId,
        label: data.agentName || "الوكيل",
        sublabel: "وكيل المجموعة",
        href: `/umrah/agents/${data.agentId}`,
        icon: Users,
      });
    }
    if (data.seasonId) {
      out.push({
        type: "umrah-season",
        id: data.seasonId,
        label: data.seasonTitle || "الموسم",
        sublabel: "موسم المجموعة",
        href: `/umrah/seasons/${data.seasonId}`,
        icon: Calendar,
      });
    }
    return out;
  }, [data]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* U-19-P4 — journey step indicator pinned across the top. */}
      {data?.id && (
        <div className="md:col-span-3">
          <JourneyStepIndicator
            subjectKind="group"
            subjectId={data.id}
            currentStage="invoiced"
          />
        </div>
      )}
      {/* Header card — identity + agent/season/sub-agent at a glance.
          The two-column layout keeps it readable on tablets without
          forcing a horizontal scroll. */}
      <Card className="md:col-span-2" data-testid="group-header-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            بيانات المجموعة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">رقم مجموعة نسك</p>
              <span className="font-mono text-sm" data-testid="group-nusk-number">{data?.nuskGroupNumber || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المرجع الداخلي</p>
              <span className="font-mono text-xs">{data?.internalRef || "-"}</span>
            </div>
            {data?.name && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الاسم</p>
                <span className="font-medium">{data.name}</span>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الوكيل</p>
              {data?.agentId ? (
                <Link href={`/umrah/agents/${data.agentId}`} className="text-blue-600 hover:underline">
                  {data.agentName || `#${data.agentId}`}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الوكيل الفرعي</p>
              <span>{data?.subAgentName || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الموسم</p>
              {data?.seasonId ? (
                <Link href={`/umrah/seasons/${data.seasonId}`} className="text-blue-600 hover:underline">
                  {data.seasonTitle || `#${data.seasonId}`}
                </Link>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">مدة البرنامج</p>
              <span>{data?.programDuration ? `${data.programDuration} يوم` : "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">العدد المعلَن (نسك)</p>
              <span className="font-semibold">{data?.mutamerCount ?? 0}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">العدد الفعلي</p>
              <span className="font-semibold" data-testid="group-actual-count">{data?.pilgrims?.length ?? 0}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule card — flight dates + flight codes. Empty arrays
          render "-" so the card stays the same height when no pilgrim
          has flight info yet (avoids layout shift on first load). */}
      <Card data-testid="group-schedule-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plane className="h-4 w-4 text-muted-foreground" />
            الجدول الزمني
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">أول وصول</p>
            <span data-testid="group-min-arrival">
              {data?.schedule?.minArrival ? formatDateAr(data.schedule.minArrival) : "-"}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">آخر مغادرة</p>
            <span data-testid="group-max-departure">
              {data?.schedule?.maxDeparture ? formatDateAr(data.schedule.maxDeparture) : "-"}
            </span>
          </div>
          {data?.schedule?.entryFlights?.length ? (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">رحلات الدخول</p>
              <div className="flex flex-wrap gap-1" data-testid="group-entry-flights">
                {data.schedule.entryFlights.map((f) => (
                  <Badge key={f} variant="outline" className="text-xs font-mono">{f}</Badge>
                ))}
              </div>
            </div>
          ) : null}
          {data?.schedule?.exitFlights?.length ? (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">رحلات الخروج</p>
              <div className="flex flex-wrap gap-1" data-testid="group-exit-flights">
                {data.schedule.exitFlights.map((f) => (
                  <Badge key={f} variant="outline" className="text-xs font-mono">{f}</Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Operational stats — at-a-glance numbers the operator needs:
          status mix, visa-expiring count (mirrors the list-page
          banner), exemption count (mirrors the cron's WHERE NOT
          overstayExempt). */}
      <Card className="md:col-span-2" data-testid="group-status-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            توزيع حالة المعتمرين
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.statusBreakdown && Object.keys(data.statusBreakdown).length > 0 ? (
            <div className="flex flex-wrap gap-2" data-testid="group-status-breakdown">
              {Object.entries(data.statusBreakdown).map(([status, count]) => (
                <Badge key={status} variant="outline" className="text-xs">
                  {PILGRIM_STATUS_LABELS[status] || status}: {count}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد معتمرون مرتبطون بعد.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="group-alerts-card">
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
              className={`font-semibold ${Number(data?.visaExpiringCount ?? 0) > 0 ? "text-status-warning-foreground" : ""}`}
              data-testid="group-visa-expiring"
            >
              {data?.visaExpiringCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3 w-3" /> مستثنون من مسح التأخّر
            </span>
            <span className="font-semibold" data-testid="group-exempt-count">
              {data?.overstayExemptCount ?? 0}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Financial summary — answers "did this group make money?".
          Margin highlights red when negative (selling below NUSK cost
          + selling expenses is the symptom the user explicitly asked
          us to surface). Numbers come from the same endpoint, so no
          extra round-trip. */}
      {/* Invoice action — closes the loop between the group detail page
          and the sales-wizard. Before this card the operator had to
          navigate away to /umrah/sales-wizard and re-find the group;
          now: either jump straight to the existing invoice OR open
          the wizard (sub-agent context fills in there since umrah_groups
          carries subAgentId already). */}
      <Card className="md:col-span-3" data-testid="group-invoice-action-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            الفوترة
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.salesInvoiceId ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                هذه المجموعة مفوترة على الفاتورة <span className="font-mono">#{data.salesInvoiceId}</span>
              </p>
              <Link
                href={`/umrah/invoices/${data.salesInvoiceId}`}
                data-testid="group-invoice-view-link"
              >
                <span className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  عرض الفاتورة ←
                </span>
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                هذه المجموعة لم تُفوتر بعد.
                {data?.subAgentId == null && (
                  <span className="block text-xs text-status-warning-foreground mt-1">
                    ⚠ المجموعة بدون وكيل فرعي — حدد وكيلًا أولاً عبر «تعديل».
                  </span>
                )}
              </p>
              <Link
                href={`/umrah/sales-wizard`}
                data-testid="group-invoice-create-link"
              >
                <span className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90">
                  إنشاء فاتورة عبر المعالج
                </span>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-3" data-testid="group-finance-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            ملخص مالي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي المبيعات ({data?.finance?.invoiceCount ?? 0} فاتورة)</p>
              <span className="text-lg font-semibold" data-testid="group-invoice-total">
                {formatCurrency(Number(data?.finance?.invoiceTotal ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المُحصّل</p>
              <span className="text-lg font-semibold text-status-success-foreground" data-testid="group-invoice-paid">
                {formatCurrency(Number(data?.finance?.invoicePaid ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المتبقي</p>
              <span
                className={`text-lg font-semibold ${Number(data?.finance?.invoiceOutstanding ?? 0) > 0 ? "text-status-error-foreground" : ""}`}
                data-testid="group-invoice-outstanding"
              >
                {formatCurrency(Number(data?.finance?.invoiceOutstanding ?? 0))}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                تكلفة نسك ({data?.finance?.nuskCount ?? 0} فاتورة)
              </p>
              <span className="text-lg font-semibold" data-testid="group-nusk-cost">
                {formatCurrency(Number(data?.finance?.nuskNetCost ?? 0))}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">الهامش (مبيعات − تكلفة نسك)</span>
            <span
              className={`text-xl font-bold ${Number(data?.finance?.margin ?? 0) < 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
              data-testid="group-margin"
            >
              {formatCurrency(Number(data?.finance?.margin ?? 0))}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pilgrims table — clickable rows so the operator can drill
          down to any pilgrim's lifecycle in one click. Truncated to
          50 because larger groups exist and we don't want to render
          800 rows in the DOM. The footer hints at the overflow + a
          jump to the filtered list page. */}
      <Card className="md:col-span-3" data-testid="group-pilgrims-card">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            المعتمرون ({data?.pilgrims?.length ?? 0})
          </CardTitle>
          {id && (
            <Link
              href={`/umrah/pilgrims?groupId=${id}`}
              className="text-xs text-blue-600 hover:underline"
              data-testid="group-pilgrims-list-link"
            >
              فتح في قائمة المعتمرين ←
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {data?.pilgrims?.length ? (
            <div className="overflow-x-auto">
              <DataTable<PilgrimRow>
                className="text-xs"
                data={data.pilgrims.slice(0, 50)}
                pageSize={0}
                noToolbar
                columns={[
                  {
                    key: "fullName",
                    header: "الاسم",
                    render: (p) => (
                      <Link href={`/umrah/pilgrims/${p.id}`} className="text-blue-600 hover:underline">
                        {p.fullName}
                      </Link>
                    ),
                  },
                  {
                    key: "nationality",
                    header: "الجنسية",
                    render: (p) => p.nationality || "-",
                  },
                  {
                    key: "status",
                    header: "الحالة",
                    render: (p) => (
                      <>
                        <Badge variant="outline" className="text-xs">
                          {PILGRIM_STATUS_LABELS[p.status] || p.status}
                        </Badge>
                        {p.overstayExempt && (
                          <Badge variant="outline" className="text-xs mr-1 border-status-warning-surface">
                            مستثنى
                          </Badge>
                        )}
                      </>
                    ),
                    exportValue: (p) => PILGRIM_STATUS_LABELS[p.status] || p.status,
                  },
                  {
                    key: "visaExpiry",
                    header: "انتهاء التأشيرة",
                    className: "text-muted-foreground",
                    render: (p) => (p.visaExpiry ? formatDateAr(p.visaExpiry) : "-"),
                  },
                  {
                    key: "entryFlight",
                    header: "رحلة دخول/خروج",
                    sortable: false,
                    className: "font-mono text-xs",
                    render: (p) => `${p.entryFlight || "-"} / ${p.exitFlight || "-"}`,
                  },
                ]}
              />
              {data.pilgrims.length > 50 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  و {data.pilgrims.length - 50} معتمر آخر — استخدم رابط القائمة أعلاه
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد معتمرون بعد.</p>
          )}
        </CardContent>
      </Card>

      {/* §6 cost-breakdown — per-category NUSK cost split + invoice list +
          margin alert. Fetched lazily so the group detail page itself
          stays snappy if there are no NUSK invoices yet. */}
      {id && <UmrahGroupCostBreakdownCard groupId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={data?.name || data?.nuskGroupNumber || "تفاصيل المجموعة"}
      subtitle={data?.nuskGroupNumber ? `نسك #${data.nuskGroupNumber}` : undefined}
      backPath="/umrah/groups"
      refNumber={id ? `GRP-${id}` : undefined}
      status={
        data
          ? { label: GROUP_STATUS_LABELS[data.status] || data.status || "-", tone: statusTone(data.status) }
          : undefined
      }
      createdAt={data?.createdAt}
      updatedAt={data?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="umrah-group"
      entityId={id ?? 0}
      actions={
        id ? (
          <PrintButton
            entityType="umrah_group"
            entityId={id}
            label="طباعة المجموعة"
          />
        ) : null
      }
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
    />
  );
}
