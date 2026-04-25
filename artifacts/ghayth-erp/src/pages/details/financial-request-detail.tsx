import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending: "معلق",
  pending_approval: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  disbursed: "مصروف",
  cancelled: "ملغى",
};

const TYPE_LABELS: Record<string, string> = {
  advance: "سلفة",
  reimbursement: "استرداد",
  purchase: "شراء",
  travel: "سفر",
  custody: "عهدة",
  petty_cash: "مصروف نثري",
  other: "أخرى",
};

function statusTone(status: string) {
  if (["approved", "disbursed"].includes(status)) return "success" as const;
  if (["rejected", "cancelled"].includes(status)) return "destructive" as const;
  if (["pending", "pending_approval"].includes(status)) return "info" as const;
  return "default" as const;
}

export default function FinancialRequestDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/financial-requests/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["financial-request", String(id)],
    id ? `/finance/financial-requests/${id}` : null,
    !!id,
  );

  const item = data;
  const amount = Number(item?.amount || 0);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.employeeId) {
      out.push({
        type: "employee",
        id: item.employeeId,
        label: item.employeeName || `موظف #${item.employeeId}`,
        sublabel: "مقدم الطلب",
        href: `/employees/${item.employeeId}`,
      });
    }
    if (item.projectId) {
      out.push({
        type: "project",
        id: item.projectId,
        label: item.projectName || `مشروع #${item.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${item.projectId}`,
      });
    }
    if (item.vendorId) {
      out.push({
        type: "vendor",
        id: item.vendorId,
        label: item.vendorName || `مورد #${item.vendorId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${item.vendorId}`,
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
          { label: "نوع الطلب", value: TYPE_LABELS[item.type] || item.type || "-" },
          { label: "المبلغ", value: formatCurrency(amount) },
          { label: "طالب الصرف", value: item.employeeName || item.requesterName || "-" },
          { label: "الغرض", value: item.purpose || "-" },
          { label: "تاريخ الطلب", value: formatDateAr(item.createdAt) },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
          ...(item.approvedAt ? [{ label: "تاريخ الاعتماد", value: formatDateAr(item.approvedAt) }] : []),
          ...(item.disbursedAt ? [{ label: "تاريخ الصرف", value: formatDateAr(item.disbursedAt) }] : []),
        ],
      },
      ...(item.description ? [{ kind: "text" as const, title: "تفاصيل الطلب", body: item.description }] : []),
      {
        kind: "signature",
        parties: [
          { label: "طالب الصرف", name: item.employeeName || item.createdByName || "" },
          { label: "المعتمد", name: item.approvedByName || "" },
        ],
      },
    ];
  }, [item, amount]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            بيانات الطلب المالي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex items-baseline gap-2 border-b pb-3">
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(amount)}</span>
            <span className="text-xs text-gray-500">ر.س</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {item?.type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع الطلب</p>
                <Badge variant="outline">{TYPE_LABELS[item.type] || item.type}</Badge>
              </div>
            )}
            {item?.paymentMethod && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">طريقة الصرف</p>
                <Badge variant="secondary">{item.paymentMethod}</Badge>
              </div>
            )}
            {(item?.employeeName || item?.requesterName) && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">طالب الصرف</p>
                <span className="text-gray-800 font-medium">{item.employeeName || item.requesterName}</span>
              </div>
            )}
            {item?.purpose && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الغرض</p>
                <span className="text-gray-800">{item.purpose}</span>
              </div>
            )}
          </div>

          {item?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">التفاصيل</p>
              <p className="text-gray-800 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {item?.returnReason && (
            <div className="rounded-md bg-amber-50 border border-amber-100 p-3">
              <p className="text-xs text-amber-700 font-medium mb-1">سبب الإرجاع</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{item.returnReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {id && item && ["pending", "pending_approval", "draft", "returned"].includes(item.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="financial-request"
                entityId={id}
                currentStatus={item.status}
                approveEndpoint={`/finance/financial-requests/${id}/approve`}
                rejectEndpoint={`/finance/financial-requests/${id}/approve`}
                returnEndpoint={`/finance/financial-requests/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "pending_approval", "draft", "returned"]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الطلب" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="financial-request" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="financial_request" entityId={id} />}

      {id && <EntityComments entityType="financial_request" entityId={id} />}
      {id && <EntityTags entityType="financial_request" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.title || item?.purpose || "طلب مالي"}
      subtitle={item?.type ? TYPE_LABELS[item.type] || item.type : undefined}
      backPath="/finance/financial-requests"
      refNumber={item?.ref || (id ? `FR-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName || item?.employeeName}
      assignedToName={item?.approvedByName}
      relatedEntities={relatedEntities}
      entityType="financial-request"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={item?.branchId}
            title="طلب مالي"
            ref={item?.ref || `FR-${id}`}
            date={formatDateAr(item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton
            perm="finance:update"
            variant="outline"
            size="sm"
            onClick={() => setLocation("/finance/financial-requests")}
            disabled={!item || ["approved", "disbursed", "rejected", "cancelled"].includes(item.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
