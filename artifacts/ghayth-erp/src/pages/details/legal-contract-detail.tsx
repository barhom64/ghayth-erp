import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions } from "@/components/approval-actions";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, FileText } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "ساري",
  expired: "منتهي",
  terminated: "منهي",
  suspended: "معلق",
  under_review: "قيد المراجعة",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  service: "خدمات",
  supply: "توريد",
  lease: "إيجار",
  employment: "توظيف",
  partnership: "شراكة",
  nda: "سرية",
  consulting: "استشارات",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (["terminated", "expired"].includes(status)) return "destructive" as const;
  if (status === "suspended") return "warning" as const;
  if (status === "under_review") return "info" as const;
  return "default" as const;
}

export default function LegalContractDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/legal/contracts/:id");
  const id = params?.id ? Number(params.id) : null;

  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-contract", String(id)],
    id ? `/legal/contracts/${id}` : null,
    !!id
  );

  const contract = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!contract) return out;
    if (contract.projectId) {
      out.push({
        type: "project",
        id: contract.projectId,
        label: contract.projectName || `مشروع #${contract.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${contract.projectId}`,
      });
    }
    if (contract.clientId) {
      out.push({
        type: "client",
        id: contract.clientId,
        label: contract.clientName || `عميل #${contract.clientId}`,
        sublabel: "العميل",
        href: `/clients/${contract.clientId}`,
      });
    }
    if (contract.vendorId) {
      out.push({
        type: "vendor",
        id: contract.vendorId,
        label: contract.vendorName || `مورد #${contract.vendorId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${contract.vendorId}`,
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
          { label: "رقم العقد", value: contract.contractNumber || `LC-${id}` },
          { label: "نوع العقد", value: CONTRACT_TYPE_LABELS[contract.type] || contract.type || "-" },
          { label: "الطرف الأول", value: contract.partyA || "-" },
          { label: "الطرف الثاني", value: contract.partyB || "-" },
          { label: "تاريخ البداية", value: formatDateAr(contract.startDate) },
          { label: "تاريخ النهاية", value: formatDateAr(contract.endDate) },
          { label: "القيمة", value: formatCurrency(contract.value || 0) },
          { label: "شروط الدفع", value: contract.paymentTerms || "-" },
          { label: "الحالة", value: STATUS_LABELS[contract.status] || contract.status || "-" },
        ],
      },
    ];
    if (contract.scope || contract.description) {
      sections.push({ kind: "text", title: "نطاق العقد", body: contract.scope || contract.description });
    }
    if (contract.specialClauses) {
      sections.push({ kind: "text", title: "بنود خاصة", body: contract.specialClauses });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "الطرف الأول", name: contract.partyA || "" },
        { label: "الطرف الثاني", name: contract.partyB || "" },
      ],
    });
    return sections;
  }, [contract, id]);

  const handleEdit = () => {
    setLocation(`/legal/contracts/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            بيانات العقد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero value */}
          {contract?.value != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">
                {formatCurrency(contract.value)}
              </span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {contract?.contractNumber && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">رقم العقد</p>
                <span className="text-gray-800 font-mono text-xs">{contract.contractNumber}</span>
              </div>
            )}
            {contract?.type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نوع العقد</p>
                <Badge variant="outline">
                  {CONTRACT_TYPE_LABELS[contract.type] || contract.type}
                </Badge>
              </div>
            )}
            {contract?.partyA && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الطرف الأول</p>
                <span className="text-gray-800">{contract.partyA}</span>
              </div>
            )}
            {contract?.partyB && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الطرف الثاني</p>
                <span className="text-gray-800">{contract.partyB}</span>
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
            {contract?.paymentTerms && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">شروط الدفع</p>
                <span className="text-gray-800">{contract.paymentTerms}</span>
              </div>
            )}
          </div>

          {(contract?.scope || contract?.description) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">نطاق العقد / الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{contract.scope || contract.description}</p>
            </div>
          )}

          {contract?.specialClauses && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">بنود خاصة</p>
              <p className="text-gray-800 whitespace-pre-wrap">{contract.specialClauses}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions */}
        {id && contract && ["pending", "under_review", "returned"].includes(contract.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="legal-contract"
                entityId={id}
                currentStatus={contract.status}
                approveEndpoint={`/legal/contracts/${id}/approve`}
                rejectEndpoint={`/legal/contracts/${id}/approve`}
                returnEndpoint={`/legal/contracts/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "under_review", "returned"]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث العقد" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Additional info card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contract?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(contract.createdAt)}</span>
              </div>
            )}
            {contract?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{contract.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      {id && (
        <EntityDocuments entityType="legal_contract" entityId={id} />
      )}

      {/* Approval Timeline */}
      {id && (
        <ApprovalTimeline entityType="legal_contract" entityId={id} />
      )}

      {id && <EntityComments entityType="legal_contract" entityId={id} />}
      {id && <EntityTags entityType="legal_contract" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={contract?.title || "تفاصيل العقد"}
      subtitle={contract?.type ? CONTRACT_TYPE_LABELS[contract.type] || contract.type : undefined}
      backPath="/legal/contracts"
      refNumber={contract?.contractNumber || (id ? `LC-${id}` : undefined)}
      status={
        contract
          ? { label: STATUS_LABELS[contract.status] || contract.status || "-", tone: statusTone(contract.status) }
          : undefined
      }
      typeLabel={contract?.type ? CONTRACT_TYPE_LABELS[contract.type] || contract.type : undefined}
      createdAt={contract?.createdAt}
      updatedAt={contract?.updatedAt}
      createdByName={contract?.createdByName}
      relatedEntities={relatedEntities}
      entityType="legal-contract"
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
              title={contract.title || "عقد"}
              ref={contract.contractNumber || `LC-${id}`}
              date={formatDateAr(contract.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="legal:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!contract || ["terminated", "expired"].includes(contract?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
