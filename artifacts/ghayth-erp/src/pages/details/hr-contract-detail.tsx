import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { Edit, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

/**
 * HrContractDetail — detail page for a single HR contract.
 *
 * Route: /hr/contracts/:id
 * Fetches from: /hr/contracts/${id}
 */

const STATUS_LABELS: Record<string, string> = {
  active: "ساري",
  expired: "منتهي",
  terminated: "منهي",
  pending: "معلق",
  renewed: "مجدد",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  full_time: "دوام كامل",
  part_time: "دوام جزئي",
  temporary: "مؤقت",
  probation: "تجربة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["active", "renewed"].includes(status)) return "success" as const;
  if (["terminated", "expired"].includes(status)) return "destructive" as const;
  if (status === "pending") return "info" as const;
  return "default" as const;
}

export default function HrContractDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/contracts/:id");
  const id = params?.id ? Number(params.id) : null;
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["hr-contract", String(id)],
    id ? `/hr/contracts/${id}` : null,
    !!id
  );

  const contract = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!contract) return out;
    if (contract.employeeId) {
      out.push({
        type: "employee",
        id: contract.employeeId,
        label: contract.employeeName || `موظف #${contract.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${contract.employeeId}`,
      });
    }
    return out;
  }, [contract]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!contract) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `CNT-${id}` },
          { label: "اسم الموظف", value: contract.employeeName || "-" },
          { label: "نوع العقد", value: CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType || "-" },
          { label: "تاريخ البداية", value: formatDateAr(contract.startDate) },
          { label: "تاريخ النهاية", value: formatDateAr(contract.endDate) },
          { label: "الراتب", value: formatCurrency(contract.salary) },
          ...(contract.allowances ? [{ label: "البدلات", value: formatCurrency(contract.allowances) }] : []),
          ...(contract.jobTitle ? [{ label: "المسمى الوظيفي", value: contract.jobTitle }] : []),
          ...(contract.department ? [{ label: "القسم", value: contract.department }] : []),
          { label: "الحالة", value: STATUS_LABELS[contract.status] || contract.status || "-" },
        ],
      },
    ];
    sections.push({
      kind: "signature",
      parties: [
        { label: "الموظف", name: contract.employeeName || "" },
        { label: "المسؤول", name: contract.createdByName || "" },
      ],
    });
    return sections;
  }, [contract, id]);

  const handleEdit = () => {
    setLocation(`/hr/contracts/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Primary info */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            بيانات العقد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {contract?.employeeName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">اسم الموظف</p>
                <span className="text-gray-800">{contract.employeeName}</span>
              </div>
            )}
            {contract?.contractType && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع العقد</p>
                <Badge variant="outline">
                  {CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType}
                </Badge>
              </div>
            )}
            {contract?.startDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ البداية</p>
                <span className="text-gray-800">{formatDateAr(contract.startDate)}</span>
              </div>
            )}
            {contract?.endDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ النهاية</p>
                <span className="text-gray-800">{formatDateAr(contract.endDate)}</span>
              </div>
            )}
            {contract?.salary != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الراتب</p>
                <span className="text-gray-800 font-bold">{formatCurrency(contract.salary)}</span>
              </div>
            )}
            {contract?.allowances != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">البدلات</p>
                <span className="text-gray-800">{formatCurrency(contract.allowances)}</span>
              </div>
            )}
            {contract?.jobTitle && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المسمى الوظيفي</p>
                <span className="text-gray-800">{contract.jobTitle}</span>
              </div>
            )}
            {contract?.department && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">القسم</p>
                <span className="text-gray-800">{contract.department}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions */}
        {id && contract && ["pending", "draft", "returned"].includes(contract.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="hr-contract"
                entityId={id}
                currentStatus={contract.status}
                approveEndpoint={`/hr/contracts/${id}/approve`}
                rejectEndpoint={`/hr/contracts/${id}/approve`}
                returnEndpoint={`/hr/contracts/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "draft", "returned"]}
                invalidateKeys={[["contracts"]]}
                onDone={() => { refetch(); }}
              />
            </CardContent>
          </Card>
        )}

        {/* Action history */}
        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">سجل الإجراءات</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionHistory entityType="hr-contract" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="hr-contract" entityId={id} />}
      {id && <EntityDocuments entityType="hr-contract" entityId={id} />}

      {id && <EntityComments entityType="hr-contract" entityId={id} />}
      {id && <EntityTags entityType="hr-contract" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={contract?.employeeName ? `عقد ${contract.employeeName}` : "تفاصيل العقد"}
      subtitle={
        contract?.contractType
          ? CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType
          : undefined
      }
      backPath="/hr/contracts"
      refNumber={`CNT-${id}`}
      status={
        contract
          ? { label: STATUS_LABELS[contract.status] || contract.status || "-", tone: statusTone(contract.status) }
          : undefined
      }
      typeLabel={
        contract?.contractType
          ? CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType
          : undefined
      }
      createdAt={contract?.createdAt}
      updatedAt={contract?.updatedAt}
      createdByName={contract?.createdByName}
      relatedEntities={relatedEntities}
      entityType="hr-contract"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {contract && (
            <EntityPrintButton
              branchId={contract.branchId}
              title={`عقد CNT-${id}`}
              ref={`CNT-${id}`}
              date={formatDateAr(contract.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="hr:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={
              !contract || ["terminated", "expired"].includes(contract.status)
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
