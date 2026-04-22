import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { Edit, ArrowLeftRight } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

/**
 * TransferDetail — detail page for a single employee transfer.
 *
 * Route: /hr/transfers/:id
 * Fetches from: /hr/transfers/${id}
 */

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق",
  approved: "معتمد",
  rejected: "مرفوض",
  completed: "مكتمل",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["approved", "completed"].includes(status)) return "success" as const;
  if (status === "rejected") return "destructive" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

export default function TransferDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/transfers/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["hr-transfer", String(id)],
    id ? `/hr/transfers/${id}` : null,
    !!id
  );

  const transfer = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!transfer) return out;
    if (transfer.employeeId) {
      out.push({
        type: "employee",
        id: transfer.employeeId,
        label: transfer.employeeName || `موظف #${transfer.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${transfer.employeeId}`,
      });
    }
    return out;
  }, [transfer]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!transfer) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `TRF-${id}` },
          { label: "اسم الموظف", value: transfer.employeeName || "-" },
          { label: "من القسم", value: transfer.fromDepartment || "-" },
          { label: "إلى القسم", value: transfer.toDepartment || "-" },
          ...(transfer.fromBranch ? [{ label: "من الفرع", value: transfer.fromBranch }] : []),
          ...(transfer.toBranch ? [{ label: "إلى الفرع", value: transfer.toBranch }] : []),
          { label: "تاريخ النقل", value: formatDateAr(transfer.transferDate) },
          ...(transfer.reason ? [{ label: "السبب", value: transfer.reason }] : []),
          { label: "الحالة", value: STATUS_LABELS[transfer.status] || transfer.status || "-" },
        ],
      },
    ];
    if (transfer.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: transfer.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "الموظف", name: transfer.employeeName || "" },
        { label: "المعتمد", name: transfer.approvedByName || "" },
      ],
    });
    return sections;
  }, [transfer, id]);

  const handleEdit = () => {
    setLocation(`/hr/transfers/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-gray-500" />
            بيانات النقل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {transfer?.employeeName && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">اسم الموظف</p>
                <span className="text-gray-800 font-bold">{transfer.employeeName}</span>
              </div>
            )}
            {transfer?.fromDepartment && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">من القسم</p>
                <Badge variant="outline">{transfer.fromDepartment}</Badge>
              </div>
            )}
            {transfer?.toDepartment && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">إلى القسم</p>
                <Badge variant="secondary">{transfer.toDepartment}</Badge>
              </div>
            )}
            {transfer?.fromBranch && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">من الفرع</p>
                <span className="text-gray-800">{transfer.fromBranch}</span>
              </div>
            )}
            {transfer?.toBranch && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">إلى الفرع</p>
                <span className="text-gray-800">{transfer.toBranch}</span>
              </div>
            )}
            {transfer?.transferDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ النقل</p>
                <span className="text-gray-800">{formatDateAr(transfer.transferDate)}</span>
              </div>
            )}
            {transfer?.reason && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">السبب</p>
                <span className="text-gray-800">{transfer.reason}</span>
              </div>
            )}
          </div>

          {transfer?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{transfer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions — visible while pending */}
        {id && transfer && transfer.status === "pending" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="transfer"
                entityId={id}
                currentStatus={transfer.status}
                approveEndpoint={`/hr/transfers/${id}/approve`}
                rejectEndpoint={`/hr/transfers/${id}/approve`}
                returnEndpoint={`/hr/transfers/${id}/approve`}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث طلب النقل" });
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
              <ActionHistory entityType="transfer" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <DetailPageLayout
      title={transfer?.employeeName ? `نقل ${transfer.employeeName}` : "تفاصيل النقل"}
      subtitle={
        transfer
          ? `${transfer.fromDepartment || ""} → ${transfer.toDepartment || ""}`
          : undefined
      }
      backPath="/hr/transfers"
      refNumber={`TRF-${id}`}
      status={
        transfer
          ? { label: STATUS_LABELS[transfer.status] || transfer.status || "-", tone: statusTone(transfer.status) }
          : undefined
      }
      createdAt={transfer?.createdAt}
      updatedAt={transfer?.updatedAt}
      createdByName={transfer?.createdByName}
      assignedToName={transfer?.approvedByName}
      relatedEntities={relatedEntities}
      entityType="transfer"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {transfer && (
            <EntityPrintButton
              branchId={transfer.branchId}
              title={`نقل TRF-${id}`}
              ref={`TRF-${id}`}
              date={formatDateAr(transfer.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !transfer || ["approved", "rejected", "completed"].includes(transfer.status)
            }
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
