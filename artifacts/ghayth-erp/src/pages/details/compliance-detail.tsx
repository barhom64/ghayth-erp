import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { Edit, ShieldCheck } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  compliant: "ملتزم",
  non_compliant: "غير ملتزم",
  partial: "جزئي",
  pending_review: "قيد المراجعة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "compliant") return "success" as const;
  if (status === "non_compliant") return "destructive" as const;
  if (status === "partial") return "warning" as const;
  if (status === "pending_review") return "info" as const;
  return "default" as const;
}

export default function ComplianceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/governance/compliance/:id");
  const id = params?.id ? Number(params.id) : null;

  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["compliance", String(id)],
    id ? `/governance/compliance/${id}` : null,
    !!id
  );

  const compliance = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!compliance) return out;
    if (compliance.departmentId) {
      out.push({
        type: "department",
        id: compliance.departmentId,
        label: compliance.departmentName || `قسم #${compliance.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (compliance.responsiblePartyId) {
      out.push({
        type: "employee",
        id: compliance.responsiblePartyId,
        label: compliance.responsiblePartyName || `موظف #${compliance.responsiblePartyId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${compliance.responsiblePartyId}`,
      });
    }
    return out;
  }, [compliance]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!compliance) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `CMP-${id}` },
          { label: "المتطلب", value: compliance.requirement || compliance.title || "-" },
          { label: "الإطار", value: compliance.framework || "-" },
          { label: "تاريخ التقييم", value: formatDateAr(compliance.assessmentDate) },
          { label: "تاريخ المراجعة التالية", value: formatDateAr(compliance.nextReview || compliance.nextReviewDate) },
          {
            label: "المسؤول",
            value: compliance.responsibleParty || compliance.responsiblePartyName || "-",
          },
          { label: "الحالة", value: STATUS_LABELS[compliance.status] || compliance.status || "-" },
        ],
      },
    ];
    if (compliance.description) {
      sections.push({ kind: "text", title: "الوصف", body: compliance.description });
    }
    if (compliance.evidence) {
      sections.push({ kind: "text", title: "الأدلة", body: compliance.evidence });
    }
    if (compliance.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: compliance.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        {
          label: "المسؤول",
          name: compliance.responsibleParty || compliance.responsiblePartyName || "",
        },
        { label: "المعتمد", name: compliance.approvedByName || "" },
      ],
    });
    return sections;
  }, [compliance, id]);

  const handleEdit = () => {
    setLocation(`/governance/compliance/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gray-500" />
            بيانات الامتثال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {compliance?.framework && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الإطار</p>
                <Badge variant="outline">{compliance.framework}</Badge>
              </div>
            )}
            {compliance?.assessmentDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ التقييم</p>
                <span className="text-gray-800">{formatDateAr(compliance.assessmentDate)}</span>
              </div>
            )}
            {(compliance?.nextReview || compliance?.nextReviewDate) && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ المراجعة التالية</p>
                <span className="text-gray-800">
                  {formatDateAr(compliance.nextReview || compliance.nextReviewDate)}
                </span>
              </div>
            )}
            {(compliance?.responsibleParty || compliance?.responsiblePartyName) && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المسؤول</p>
                <span className="text-gray-800">
                  {compliance.responsibleParty || compliance.responsiblePartyName}
                </span>
              </div>
            )}
            {(compliance?.requirement || compliance?.title) && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">المتطلب</p>
                <span className="text-gray-800">
                  {compliance.requirement || compliance.title}
                </span>
              </div>
            )}
          </div>

          {compliance?.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الوصف</p>
              <p className="text-gray-800 whitespace-pre-wrap">{compliance.description}</p>
            </div>
          )}

          {compliance?.evidence && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الأدلة</p>
              <p className="text-gray-800 whitespace-pre-wrap">{compliance.evidence}</p>
            </div>
          )}

          {compliance?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{compliance.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions */}
        {id && compliance && ["pending", "pending_review", "returned"].includes(compliance.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="compliance"
                entityId={id}
                currentStatus={compliance.status}
                approveEndpoint={`/governance/compliance/${id}/approve`}
                rejectEndpoint={`/governance/compliance/${id}/approve`}
                returnEndpoint={`/governance/compliance/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "pending_review", "returned"]}
                invalidateKeys={[["compliance"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث الامتثال" });
                }}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {compliance?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(compliance.createdAt)}</span>
              </div>
            )}
            {compliance?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{compliance.createdByName}</span>
              </div>
            )}
            {compliance?.updatedAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">آخر تحديث</p>
                <span className="text-gray-800">{formatDateAr(compliance.updatedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <ApprovalTimeline entityType="compliance" entityId={id} />}

      {id && <EntityComments entityType="compliance" entityId={id} />}
      {id && <EntityTags entityType="compliance" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={compliance?.requirement || compliance?.title || "تفاصيل الامتثال"}
      subtitle={compliance?.framework}
      backPath="/governance/compliance"
      refNumber={`CMP-${id}`}
      status={
        compliance
          ? {
              label: STATUS_LABELS[compliance.status] || compliance.status || "-",
              tone: statusTone(compliance.status),
            }
          : undefined
      }
      typeLabel={compliance?.framework}
      createdAt={compliance?.createdAt}
      updatedAt={compliance?.updatedAt}
      createdByName={compliance?.createdByName}
      assignedToName={compliance?.responsibleParty || compliance?.responsiblePartyName}
      relatedEntities={relatedEntities}
      entityType="compliance"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {compliance && (
            <EntityPrintButton
              branchId={compliance.branchId}
              title={compliance.requirement || compliance.title || "امتثال"}
              ref={`CMP-${id}`}
              date={formatDateAr(compliance.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!compliance}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
