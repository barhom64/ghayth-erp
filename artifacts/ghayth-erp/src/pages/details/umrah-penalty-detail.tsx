import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, AlertTriangle, Users, Calendar } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلقة",
  applied: "مطبقة",
  waived: "مُعفاة",
  paid: "مدفوعة",
  disputed: "معترض عليها",
};

const PENALTY_TYPE_LABELS: Record<string, string> = {
  late_payment: "تأخر سداد",
  cancellation: "إلغاء",
  documentation: "مستندات",
  no_show: "عدم حضور",
  violation: "مخالفة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "paid") return "success" as const;
  if (status === "waived") return "muted" as const;
  if (status === "applied") return "warning" as const;
  if (status === "disputed") return "destructive" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

export default function UmrahPenaltyDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/umrah/penalties/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-penalty", id ?? 0);

  const { data: penalty, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-penalty", String(id)],
    id ? `/umrah/penalties/${id}` : null,
    !!id
  );

  const amount = Number(penalty?.amount ?? 0);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!penalty) return out;
    if (penalty.pilgrimId) {
      out.push({
        type: "pilgrim",
        id: penalty.pilgrimId,
        label: penalty.pilgrimName || `معتمر #${penalty.pilgrimId}`,
        sublabel: "المعتمر",
        href: `/umrah/pilgrims/${penalty.pilgrimId}`,
        icon: Users,
      });
    }
    if (penalty.agentId) {
      out.push({
        type: "agent",
        id: penalty.agentId,
        label: penalty.agentName || `وكيل #${penalty.agentId}`,
        sublabel: "الوكيل",
        href: `/umrah/agents/${penalty.agentId}`,
        icon: Users,
      });
    }
    return out;
  }, [penalty]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!penalty) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `PEN-${id}` },
      ...(penalty.pilgrimName
        ? [{ label: "المعتمر", value: penalty.pilgrimName }]
        : []),
      ...(penalty.agentName
        ? [{ label: "الوكيل", value: penalty.agentName }]
        : []),
      {
        label: "نوع الغرامة",
        value:
          PENALTY_TYPE_LABELS[penalty.penaltyType] || penalty.penaltyType || "-",
      },
      { label: "المبلغ", value: formatCurrency(amount) },
      ...(penalty.reason ? [{ label: "السبب", value: penalty.reason }] : []),
      ...(penalty.appliedDate
        ? [{ label: "تاريخ التطبيق", value: formatDateAr(penalty.appliedDate) }]
        : []),
      ...(penalty.dueDate
        ? [{ label: "تاريخ الاستحقاق", value: formatDateAr(penalty.dueDate) }]
        : []),
      {
        label: "الحالة",
        value: STATUS_LABELS[penalty.status] || penalty.status || "-",
      },
      { label: "تاريخ الإنشاء", value: formatDateAr(penalty.createdAt) },
    ];
    const sections: PrintSection[] = [{ kind: "info-grid", items }];

    if (penalty.reason) {
      sections.push({ kind: "text", title: "تفاصيل السبب", body: penalty.reason });
    }
    if (penalty.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: penalty.notes });
    }

    sections.push({
      kind: "signature",
      parties: [
        { label: "مُصدر الغرامة", name: penalty.createdByName || "" },
        { label: "المعتمد", name: penalty.approvedByName || "" },
      ],
    });
    return sections;
  }, [penalty, amount, id]);

  const handleEdit = () => {
    setLocation(`/umrah/penalties/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-error" />
            بيانات الغرامة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount (red) */}
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-status-error-foreground">
              {formatCurrency(amount)}
            </span>
            <span className="text-xs text-muted-foreground">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {penalty?.penaltyType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع الغرامة</p>
                <Badge variant="destructive">
                  {PENALTY_TYPE_LABELS[penalty.penaltyType] || penalty.penaltyType}
                </Badge>
              </div>
            )}
            {penalty?.pilgrimName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المعتمر</p>
                <span className="text-status-neutral-foreground font-medium">{penalty.pilgrimName}</span>
              </div>
            )}
            {penalty?.agentName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الوكيل</p>
                <span className="text-status-neutral-foreground font-medium">{penalty.agentName}</span>
              </div>
            )}
            {penalty?.appliedDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ التطبيق</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {formatDateAr(penalty.appliedDate)}
                </span>
              </div>
            )}
            {penalty?.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الاستحقاق</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {formatDateAr(penalty.dueDate)}
                </span>
              </div>
            )}
          </div>

          {penalty?.reason && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">السبب</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{penalty.reason}</p>
            </div>
          )}

          {penalty?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{penalty.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Status card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">الحالة الحالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الحالة</span>
              <Badge
                variant={
                  statusTone(penalty?.status) === "destructive"
                    ? "destructive"
                    : "outline"
                }
              >
                {STATUS_LABELS[penalty?.status] || penalty?.status || "-"}
              </Badge>
            </div>
            {penalty?.appliedDate && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-xs text-muted-foreground">طُبقت في</span>
                <span className="text-status-neutral-foreground text-xs">
                  {formatDateAr(penalty.appliedDate)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="umrah-penalty" entityId={id} />}
      {id && <EntityTags entityType="umrah-penalty" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={
        penalty?.penaltyType
          ? `غرامة — ${PENALTY_TYPE_LABELS[penalty.penaltyType] || penalty.penaltyType}`
          : "تفاصيل الغرامة"
      }
      subtitle={
        penalty?.pilgrimName
          ? `المعتمر: ${penalty.pilgrimName}`
          : penalty?.agentName
          ? `الوكيل: ${penalty.agentName}`
          : undefined
      }
      backPath="/umrah/penalties"
      refNumber={id ? `PEN-${id}` : undefined}
      status={
        penalty
          ? {
              label: STATUS_LABELS[penalty.status] || penalty.status || "-",
              tone: statusTone(penalty.status),
            }
          : undefined
      }
      typeLabel={
        penalty?.penaltyType
          ? PENALTY_TYPE_LABELS[penalty.penaltyType] || penalty.penaltyType
          : undefined
      }
      createdAt={penalty?.createdAt}
      updatedAt={penalty?.updatedAt}
      createdByName={penalty?.createdByName}
      relatedEntities={relatedEntities}
      entityType="umrah-penalty"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {penalty && (
            <EntityPrintButton
              branchId={penalty.branchId}
              title="غرامة عمرة"
              ref={`PEN-${id}`}
              date={formatDateAr(penalty.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="operations:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!penalty || ["paid", "waived"].includes(penalty.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
