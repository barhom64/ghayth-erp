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
import { Edit, Wallet } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  approved: "معتمد",
  disbursed: "مصروف",
  repaying: "قيد السداد",
  repaid: "مسدد",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

function statusTone(status: string) {
  if (["approved", "disbursed", "repaid"].includes(status)) return "success" as const;
  if (["rejected", "cancelled"].includes(status)) return "destructive" as const;
  if (status === "repaying") return "info" as const;
  return "default" as const;
}

export default function SalaryAdvanceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/finance/salary-advances/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["salary-advance", String(id)],
    id ? `/finance/salary-advances/${id}` : null,
    !!id,
  );

  const item = data;
  const amount = Number(item?.amount || 0);
  const repaid = Number(item?.repaidAmount || 0);
  const remaining = amount - repaid;
  const repaymentPct = amount > 0 ? (repaid / amount) * 100 : 0;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!item) return out;
    if (item.employeeId) {
      out.push({
        type: "employee",
        id: item.employeeId,
        label: item.employeeName || `موظف #${item.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${item.employeeId}`,
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
          { label: "الموظف", value: item.employeeName || "-" },
          { label: "المبلغ", value: formatCurrency(amount) },
          { label: "عدد الأقساط", value: item.installments ? String(item.installments) : "-" },
          { label: "قسط الشهر", value: item.monthlyDeduction ? formatCurrency(item.monthlyDeduction) : "-" },
          { label: "تاريخ الطلب", value: formatDateAr(item.createdAt) },
          { label: "الحالة", value: STATUS_LABELS[item.status] || item.status || "-" },
        ],
      },
      {
        kind: "summary",
        items: [
          { label: "إجمالي السلفة", value: formatCurrency(amount) },
          { label: "المبلغ المسدد", value: formatCurrency(repaid) },
          { label: "المتبقي", value: formatCurrency(remaining), bold: true },
        ],
      },
      {
        kind: "signature",
        parties: [
          { label: "الموظف", name: item.employeeName || "" },
          { label: "المعتمد", name: item.approvedByName || "" },
        ],
      },
    ];
  }, [item, amount, repaid, remaining]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-gray-500" />
            بيانات السلفة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border-b pb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{formatCurrency(amount)}</span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              مُسدد: {formatCurrency(repaid)} — متبقي: {formatCurrency(remaining)}
            </p>
          </div>

          {amount > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">نسبة السداد</span>
                <span className="font-medium">{repaymentPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, repaymentPct)}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {item?.employeeName && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الموظف</p>
                <span className="text-gray-800 font-medium">{item.employeeName}</span>
                {item.employeeNumber && <span className="text-xs text-gray-500 ms-2 font-mono">#{item.employeeNumber}</span>}
              </div>
            )}
            {item?.installments && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">عدد الأقساط</p>
                <span className="text-gray-800">{item.installments} قسط</span>
              </div>
            )}
            {item?.monthlyDeduction && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">قسط شهري</p>
                <span className="text-gray-800 font-medium">{formatCurrency(item.monthlyDeduction)}</span>
              </div>
            )}
            {item?.reason && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">السبب</p>
                <p className="text-gray-800 whitespace-pre-wrap">{item.reason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص السداد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">إجمالي السلفة</span>
              <span className="font-medium">{formatCurrency(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">مسدد</span>
              <span className="font-medium text-emerald-600">{formatCurrency(repaid)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-gray-500">متبقي</span>
              <span className="font-bold text-red-600">{formatCurrency(remaining)}</span>
            </div>
          </CardContent>
        </Card>

        {id && item && ["pending"].includes(item.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="salary-advance"
                entityId={id}
                currentStatus={item.status}
                approveEndpoint={`/hr/salary-advances/${id}/approve`}
                rejectEndpoint={`/hr/salary-advances/${id}/approve`}
                returnEndpoint={`/hr/salary-advances/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "returned"]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث السلفة" });
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
              <ActionHistory entityType="salary-advance" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="salary_advance" entityId={id} />}

      {id && <EntityComments entityType="salary_advance" entityId={id} />}
      {id && <EntityTags entityType="salary_advance" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={item?.employeeName ? `سلفة — ${item.employeeName}` : "تفاصيل السلفة"}
      backPath="/finance/salary-advances"
      refNumber={item?.ref || (id ? `SA-${id}` : undefined)}
      status={item ? { label: STATUS_LABELS[item.status] || item.status || "-", tone: statusTone(item.status) } : undefined}
      createdAt={item?.createdAt}
      updatedAt={item?.updatedAt}
      createdByName={item?.createdByName}
      assignedToName={item?.employeeName}
      relatedEntities={relatedEntities}
      entityType="salary-advance"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          <EntityPrintButton
            branchId={item?.branchId}
            title="سلفة راتب"
            ref={item?.ref || `SA-${id}`}
            date={formatDateAr(item?.createdAt)}
            sections={printSections}
          />
          <GuardedButton
            perm="finance:update"
            variant="outline"
            size="sm"
            onClick={() => setLocation("/finance/salary-advances")}
            disabled={!item || ["repaid", "rejected", "cancelled"].includes(item.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
