import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, FileText } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "ساري",
  archived: "مؤرشف",
  under_review: "قيد المراجعة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "archived") return "destructive" as const;
  if (status === "under_review") return "info" as const;
  if (status === "draft") return "warning" as const;
  return "default" as const;
}

export default function PolicyDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/governance/policies/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["policy", String(id)],
    id ? `/governance/policies/${id}` : null,
    !!id
  );

  const policy = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!policy) return out;
    if (policy.departmentId) {
      out.push({
        type: "department",
        id: policy.departmentId,
        label: policy.departmentName || `قسم #${policy.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (policy.ownerId) {
      out.push({
        type: "employee",
        id: policy.ownerId,
        label: policy.ownerName || `موظف #${policy.ownerId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${policy.ownerId}`,
      });
    }
    return out;
  }, [policy]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!policy) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `POL-${id}` },
          { label: "العنوان", value: policy.title || "-" },
          { label: "التصنيف", value: policy.category || "-" },
          { label: "الإصدار", value: policy.version || "-" },
          { label: "تاريخ السريان", value: formatDateAr(policy.effectiveDate) },
          { label: "تاريخ المراجعة", value: formatDateAr(policy.reviewDate) },
          { label: "المسؤول", value: policy.owner || policy.ownerName || "-" },
          { label: "الحالة", value: STATUS_LABELS[policy.status] || policy.status || "-" },
        ],
      },
    ];
    if (policy.summary) {
      sections.push({ kind: "text", title: "الملخص", body: policy.summary });
    }
    if (policy.content || policy.fullContent) {
      sections.push({ kind: "text", title: "المحتوى الكامل", body: policy.content || policy.fullContent });
    }
    if (policy.complianceRequirements) {
      sections.push({ kind: "text", title: "متطلبات الامتثال", body: policy.complianceRequirements });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المسؤول", name: policy.owner || policy.ownerName || "" },
        { label: "المعتمد", name: policy.approvedByName || "" },
      ],
    });
    return sections;
  }, [policy, id]);

  const handleEdit = () => {
    setLocation(`/governance/policies/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            بيانات السياسة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {policy?.category && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">التصنيف</p>
                <Badge variant="outline">{policy.category}</Badge>
              </div>
            )}
            {policy?.version && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الإصدار</p>
                <Badge variant="secondary">{policy.version}</Badge>
              </div>
            )}
            {policy?.effectiveDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ السريان</p>
                <span className="text-gray-800">{formatDateAr(policy.effectiveDate)}</span>
              </div>
            )}
            {policy?.reviewDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ المراجعة</p>
                <span className="text-gray-800">{formatDateAr(policy.reviewDate)}</span>
              </div>
            )}
            {(policy?.owner || policy?.ownerName) && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">المسؤول</p>
                <span className="text-gray-800">{policy.owner || policy.ownerName}</span>
              </div>
            )}
          </div>

          {policy?.summary && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الملخص</p>
              <p className="text-gray-800 whitespace-pre-wrap">{policy.summary}</p>
            </div>
          )}

          {(policy?.content || policy?.fullContent) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">المحتوى الكامل</p>
              <p className="text-gray-800 whitespace-pre-wrap">
                {policy.content || policy.fullContent}
              </p>
            </div>
          )}

          {policy?.complianceRequirements && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">متطلبات الامتثال</p>
              <p className="text-gray-800 whitespace-pre-wrap">{policy.complianceRequirements}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {policy?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(policy.createdAt)}</span>
              </div>
            )}
            {policy?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{policy.createdByName}</span>
              </div>
            )}
            {policy?.updatedAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">آخر تحديث</p>
                <span className="text-gray-800">{formatDateAr(policy.updatedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="policy" entityId={id} />}
      {id && <EntityTags entityType="policy" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={policy?.title || "تفاصيل السياسة"}
      subtitle={policy?.category}
      backPath="/governance/policies"
      refNumber={`POL-${id}`}
      status={
        policy
          ? { label: STATUS_LABELS[policy.status] || policy.status || "-", tone: statusTone(policy.status) }
          : undefined
      }
      typeLabel={policy?.category}
      createdAt={policy?.createdAt}
      updatedAt={policy?.updatedAt}
      createdByName={policy?.createdByName}
      assignedToName={policy?.owner || policy?.ownerName}
      relatedEntities={relatedEntities}
      entityType="policy"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {policy && (
            <EntityPrintButton
              branchId={policy.branchId}
              title={policy.title || "سياسة"}
              ref={`POL-${id}`}
              date={formatDateAr(policy.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!policy || ["archived"].includes(policy?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
