import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, ClipboardCheck } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";

const STATUS_LABELS: Record<string, string> = {
  planned: "مخطط",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const TYPE_LABELS: Record<string, string> = {
  internal: "داخلي",
  external: "خارجي",
  compliance: "امتثال",
  financial: "مالي",
  operational: "تشغيلي",
};

const RISK_LABELS: Record<string, string> = {
  high: "مرتفع",
  medium: "متوسط",
  low: "منخفض",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "completed") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "in_progress") return "info" as const;
  return "default" as const;
}

function riskTone(risk?: string | null) {
  if (!risk) return "default" as const;
  if (risk === "high") return "destructive" as const;
  if (risk === "medium") return "warning" as const;
  if (risk === "low") return "success" as const;
  return "default" as const;
}

export default function AuditDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/governance/audits/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["audit", String(id)],
    id ? `/governance/audits/${id}` : null,
    !!id
  );

  const audit = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!audit) return out;
    if (audit.departmentId) {
      out.push({
        type: "department",
        id: audit.departmentId,
        label: audit.departmentName || `قسم #${audit.departmentId}`,
        sublabel: "القسم",
      });
    }
    return out;
  }, [audit]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!audit) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: `AUD-${id}` },
          { label: "النوع", value: TYPE_LABELS[audit.type] || audit.type || "-" },
          { label: "المدقق", value: audit.auditor || "-" },
          { label: "تاريخ البداية", value: formatDateAr(audit.startDate) },
          { label: "تاريخ النهاية", value: formatDateAr(audit.endDate) },
          { label: "مستوى المخاطر", value: RISK_LABELS[audit.riskLevel] || audit.riskLevel || "-" },
          { label: "القسم", value: audit.department || audit.departmentName || "-" },
          { label: "الحالة", value: STATUS_LABELS[audit.status] || audit.status || "-" },
        ],
      },
    ];
    if (audit.scope) {
      sections.push({ kind: "text", title: "نطاق التدقيق", body: audit.scope });
    }
    if (audit.findings || audit.findingsSummary) {
      sections.push({ kind: "text", title: "ملخص النتائج", body: audit.findings || audit.findingsSummary });
    }
    if (audit.recommendations) {
      sections.push({ kind: "text", title: "التوصيات", body: audit.recommendations });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المدقق", name: audit.auditor || "" },
        { label: "المعتمد", name: audit.approvedByName || "" },
      ],
    });
    return sections;
  }, [audit, id]);

  const handleEdit = () => {
    setLocation(`/governance/audits/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-gray-500" />
            بيانات التدقيق
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {audit?.type && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">النوع</p>
                <Badge variant="outline">
                  {TYPE_LABELS[audit.type] || audit.type}
                </Badge>
              </div>
            )}
            {audit?.riskLevel && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">مستوى المخاطر</p>
                <Badge variant={riskTone(audit.riskLevel) === "destructive" ? "destructive" : "outline"}>
                  {RISK_LABELS[audit.riskLevel] || audit.riskLevel}
                </Badge>
              </div>
            )}
            {audit?.auditor && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المدقق</p>
                <span className="text-gray-800">{audit.auditor}</span>
              </div>
            )}
            {(audit?.department || audit?.departmentName) && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">القسم</p>
                <span className="text-gray-800">{audit.department || audit.departmentName}</span>
              </div>
            )}
            {audit?.startDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ البداية</p>
                <span className="text-gray-800">{formatDateAr(audit.startDate)}</span>
              </div>
            )}
            {audit?.endDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ النهاية</p>
                <span className="text-gray-800">{formatDateAr(audit.endDate)}</span>
              </div>
            )}
          </div>

          {audit?.scope && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">نطاق التدقيق</p>
              <p className="text-gray-800 whitespace-pre-wrap">{audit.scope}</p>
            </div>
          )}

          {(audit?.findings || audit?.findingsSummary) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملخص النتائج</p>
              <p className="text-gray-800 whitespace-pre-wrap">{audit.findings || audit.findingsSummary}</p>
            </div>
          )}

          {audit?.recommendations && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">التوصيات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{audit.recommendations}</p>
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
            {audit?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(audit.createdAt)}</span>
              </div>
            )}
            {audit?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{audit.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  return (
    <DetailPageLayout
      title={audit?.title || "تفاصيل التدقيق"}
      subtitle={audit?.type ? TYPE_LABELS[audit.type] || audit.type : undefined}
      backPath="/governance/audits"
      refNumber={`AUD-${id}`}
      status={
        audit
          ? { label: STATUS_LABELS[audit.status] || audit.status || "-", tone: statusTone(audit.status) }
          : undefined
      }
      typeLabel={audit?.type ? TYPE_LABELS[audit.type] || audit.type : undefined}
      createdAt={audit?.createdAt}
      updatedAt={audit?.updatedAt}
      createdByName={audit?.createdByName}
      relatedEntities={relatedEntities}
      entityType="audit"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {audit && (
            <EntityPrintButton
              branchId={audit.branchId}
              title={audit.title || "تدقيق"}
              ref={`AUD-${id}`}
              date={formatDateAr(audit.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!audit || ["completed", "cancelled"].includes(audit?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
