import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Scale } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  issued: "صادر",
  appealed: "مستأنف",
  final: "نهائي",
  executed: "منفذ",
  reversed: "مُلغى",
};

const OUTCOME_LABELS: Record<string, string> = {
  favorable: "لصالحنا",
  unfavorable: "ضدنا",
  partial: "جزئي",
  settlement: "تسوية",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (["final", "executed"].includes(status)) return "success" as const;
  if (status === "reversed") return "destructive" as const;
  if (status === "appealed") return "warning" as const;
  if (status === "issued") return "info" as const;
  return "default" as const;
}

function outcomeTone(outcome?: string | null) {
  if (!outcome) return "default" as const;
  if (outcome === "favorable") return "success" as const;
  if (outcome === "unfavorable") return "destructive" as const;
  if (outcome === "partial") return "warning" as const;
  if (outcome === "settlement") return "info" as const;
  return "default" as const;
}

export default function LegalJudgmentDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/legal/judgments/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-judgment", String(id)],
    id ? `/legal/judgments/${id}` : null,
    !!id
  );

  const judgment = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!judgment) return out;
    if (judgment.caseId) {
      out.push({
        type: "legal-case",
        id: judgment.caseId,
        label: judgment.caseTitle || judgment.caseReference || `قضية #${judgment.caseId}`,
        sublabel: "القضية المرتبطة",
        href: `/legal/cases/${judgment.caseId}`,
      });
    }
    return out;
  }, [judgment]);

  const hasMonetaryAmount =
    judgment?.amount != null && Number(judgment.amount) > 0;

  const printSections: PrintSection[] = useMemo(() => {
    if (!judgment) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم الحكم", value: judgment.judgmentNumber || `JDG-${id}` },
          ...(judgment.caseReference
            ? [{ label: "مرجع القضية", value: judgment.caseReference }]
            : []),
          ...(judgment.judgmentDate
            ? [{ label: "تاريخ الحكم", value: formatDateAr(judgment.judgmentDate) }]
            : []),
          ...(judgment.court
            ? [{ label: "المحكمة", value: judgment.court }]
            : []),
          ...(judgment.outcome
            ? [{ label: "نتيجة الحكم", value: OUTCOME_LABELS[judgment.outcome] || judgment.outcome }]
            : []),
          ...(hasMonetaryAmount
            ? [{ label: "المبلغ", value: formatCurrency(Number(judgment.amount)) }]
            : []),
          ...(judgment.executionStatus
            ? [{ label: "حالة التنفيذ", value: judgment.executionStatus }]
            : []),
          ...(judgment.appealDeadline
            ? [{ label: "الموعد النهائي للاستئناف", value: formatDateAr(judgment.appealDeadline) }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[judgment.status] || judgment.status || "-" },
        ],
      },
    ];
    if (judgment.summary) {
      sections.push({ kind: "text", title: "ملخص الحكم", body: judgment.summary });
    }
    if (judgment.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: judgment.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "المستشار القانوني", name: judgment.createdByName || "" },
        { label: "المدير", name: judgment.approvedByName || "" },
      ],
    });
    return sections;
  }, [judgment, id, hasMonetaryAmount]);

  const handleEdit = () => {
    setLocation(`/legal/judgments/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-gray-500" />
            بيانات الحكم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero amount for monetary judgments */}
          {hasMonetaryAmount && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">
                {formatCurrency(Number(judgment.amount))}
              </span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {judgment?.judgmentNumber && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">رقم الحكم</p>
                <span className="text-gray-800 font-mono text-xs">
                  {judgment.judgmentNumber}
                </span>
              </div>
            )}
            {judgment?.caseReference && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">مرجع القضية</p>
                <span className="text-gray-800 font-mono text-xs">
                  {judgment.caseReference}
                </span>
              </div>
            )}
            {judgment?.judgmentDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الحكم</p>
                <span className="text-gray-800">{formatDateAr(judgment.judgmentDate)}</span>
              </div>
            )}
            {judgment?.court && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المحكمة</p>
                <span className="text-gray-800">{judgment.court}</span>
              </div>
            )}
            {judgment?.outcome && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نتيجة الحكم</p>
                <Badge variant={outcomeTone(judgment.outcome) as any}>
                  {OUTCOME_LABELS[judgment.outcome] || judgment.outcome}
                </Badge>
              </div>
            )}
            {judgment?.executionStatus && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">حالة التنفيذ</p>
                <Badge variant="secondary">{judgment.executionStatus}</Badge>
              </div>
            )}
            {judgment?.appealDeadline && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">الموعد النهائي للاستئناف</p>
                <Badge variant="outline">{formatDateAr(judgment.appealDeadline)}</Badge>
              </div>
            )}
          </div>

          {judgment?.summary && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملخص الحكم</p>
              <p className="text-gray-800 whitespace-pre-wrap">{judgment.summary}</p>
            </div>
          )}

          {judgment?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{judgment.notes}</p>
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
            {judgment?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(judgment.createdAt)}</span>
              </div>
            )}
            {judgment?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{judgment.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="legal_judgment" entityId={id} />}
      {id && <EntityTags entityType="legal_judgment" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={
        judgment?.judgmentNumber
          ? `حكم ${judgment.judgmentNumber}`
          : "تفاصيل الحكم"
      }
      subtitle={
        judgment?.outcome
          ? OUTCOME_LABELS[judgment.outcome] || judgment.outcome
          : undefined
      }
      backPath="/legal/judgments"
      refNumber={judgment?.judgmentNumber || (id ? `JDG-${id}` : undefined)}
      status={
        judgment
          ? { label: STATUS_LABELS[judgment.status] || judgment.status || "-", tone: statusTone(judgment.status) }
          : undefined
      }
      typeLabel={
        judgment?.outcome
          ? OUTCOME_LABELS[judgment.outcome] || judgment.outcome
          : undefined
      }
      createdAt={judgment?.createdAt}
      updatedAt={judgment?.updatedAt}
      createdByName={judgment?.createdByName}
      relatedEntities={relatedEntities}
      entityType="legal-judgment"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {judgment && (
            <EntityPrintButton
              branchId={judgment.branchId}
              title={
                judgment.judgmentNumber
                  ? `حكم ${judgment.judgmentNumber}`
                  : `حكم JDG-${id}`
              }
              ref={judgment.judgmentNumber || `JDG-${id}`}
              date={formatDateAr(judgment.judgmentDate || judgment.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="legal:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!judgment || ["final", "executed", "reversed"].includes(judgment?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
