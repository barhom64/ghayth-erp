import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  closed: "مغلق",
  archived: "مؤرشف",
  exceeded: "متجاوز",
};

const PERIOD_LABELS: Record<string, string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
  project: "مشروع",
};

function statusTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "exceeded") return "destructive" as const;
  if (status === "closed" || status === "archived") return "muted" as const;
  return "default" as const;
}

export default function BudgetDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/budget/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["budget-detail", String(id)],
    id ? `/finance/budget/${id}` : null,
    !!id,
  );

  const item = data;

  const allocated = Number(item?.allocatedAmount || item?.amount || 0);
  const spent = Number(item?.spentAmount || item?.spent || 0);
  const remaining = allocated - spent;
  const utilizationPct = allocated > 0 ? (spent / allocated) * 100 : 0;
  const isExceeded = spent > allocated;
  const isWarning = utilizationPct >= 80 && !isExceeded;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.projectId) {
      out.push({
        type: "project",
        id: item.projectId,
        label: item.projectName || `مشروع #${item.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${item.projectId}`,
      });
    }
    if (item.departmentId) {
      out.push({
        type: "department",
        id: item.departmentId,
        label: item.departmentName || `قسم #${item.departmentId}`,
        sublabel: "القسم",
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
          { label: "اسم الميزانية", value: item.name || item.title || "-" },
          { label: "التصنيف", value: item.category || "-" },
          { label: "الفترة", value: PERIOD_LABELS[item.period] || item.period || "-" },
          { label: "تاريخ البداية", value: formatDateAr(item.startDate) },
          { label: "تاريخ النهاية", value: formatDateAr(item.endDate) },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
        ],
      },
      {
        kind: "summary",
        items: [
          { label: "المبلغ المخصص", value: formatCurrency(allocated) },
          { label: "المبلغ المصروف", value: formatCurrency(spent) },
          { label: "المتبقي", value: formatCurrency(remaining), bold: true },
          { label: "نسبة الاستخدام", value: `${utilizationPct.toFixed(1)}%` },
        ],
      },
    ];
  }, [item, allocated, spent, remaining, utilizationPct]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-gray-500" />
            بيانات الميزانية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border-b pb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(allocated)}</span>
              <span className="text-xs text-gray-500">ر.س مخصص</span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="flex items-center gap-1 text-red-600">
                <TrendingDown className="h-3.5 w-3.5" />
                مصروف: {formatCurrency(spent)}
              </span>
              <span className={`flex items-center gap-1 ${remaining >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                متبقي: {formatCurrency(Math.abs(remaining))}
                {remaining < 0 && " (تجاوز)"}
              </span>
            </div>
          </div>

          {/* Utilization bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">نسبة الاستخدام</span>
              <span className={`font-medium ${isExceeded ? "text-red-600" : isWarning ? "text-amber-600" : "text-gray-700"}`}>
                {utilizationPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isExceeded ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(100, utilizationPct)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {item?.category && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">التصنيف</p>
                <Badge variant="outline">{item.category}</Badge>
              </div>
            )}
            {item?.period && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الفترة</p>
                <Badge variant="secondary">{PERIOD_LABELS[item.period] || item.period}</Badge>
              </div>
            )}
            {item?.startDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ البداية</p>
                <span className="text-gray-800">{formatDateAr(item.startDate)}</span>
              </div>
            )}
            {item?.endDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ النهاية</p>
                <span className="text-gray-800">{formatDateAr(item.endDate)}</span>
              </div>
            )}
          </div>

          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {isExceeded && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-xs text-red-700 font-medium">تحذير: تم تجاوز الميزانية المخصصة</p>
              <p className="text-xs text-red-600 mt-0.5">
                التجاوز: {formatCurrency(Math.abs(remaining))}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص مالي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">المخصص</span>
              <span className="font-medium">{formatCurrency(allocated)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">المصروف</span>
              <span className="font-medium text-red-600">{formatCurrency(spent)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-gray-500">المتبقي</span>
              <span className={`font-bold ${remaining >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Approval actions */}
        {id && item && ["draft", "active"].includes(item.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="budget"
                entityId={id}
                currentStatus={item.status}
                approveEndpoint={`/finance/budgets/${id}/approve`}
                rejectEndpoint={`/finance/budgets/${id}/reject`}
                returnEndpoint={`/finance/budgets/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "pending_approval", "draft", "returned"]}
                invalidateKeys={[["budget"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الميزانية" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="budget" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Documents */}
      {id && (
        <EntityDocuments entityType="budget" entityId={id} />
      )}

      {/* Approval Timeline */}
      {id && (
        <ApprovalTimeline entityType="budget" entityId={id} />
      )}

      {id && <EntityComments entityType="budget" entityId={id} />}
      {id && <EntityTags entityType="budget" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.name || item?.title || "تفاصيل الميزانية"}
      subtitle={item?.category}
      backPath="/finance/budget"
      refNumber={item?.ref || (id ? `BUD-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      typeLabel={item?.period ? PERIOD_LABELS[item.period] : undefined}
      createdAt={item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      relatedEntities={relatedEntities}
      entityType="budget"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={item?.branchId}
            title="ميزانية"
            ref={item?.ref || `BUD-${id}`}
            date={formatDateAr(item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton
            perm="finance:update"
            variant="outline"
            size="sm"
            onClick={() => setLocation("/finance/budget")}
            disabled={!item || item.status === "closed" || item.status === "archived"}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
