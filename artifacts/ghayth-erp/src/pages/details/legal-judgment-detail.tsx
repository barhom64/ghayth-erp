import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import {
  FormGrid,
  FormNumberField,
  FormTextareaField,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Scale } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

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

const judgmentEditSchema = z.object({
  verdict: z.string().optional().default(""),
  paidAmount: z.coerce.number().min(0, "لا يقل عن صفر").optional().default(0),
  dueDate: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
type JudgmentEditForm = z.infer<typeof judgmentEditSchema>;

export default function LegalJudgmentDetail() {
  const [, params] = useRoute("/legal/judgments/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("legal-judgment", id ?? 0);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-judgment", String(id)],
    `/legal/judgments/${id}`,
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


  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
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
              <span className="text-xs text-muted-foreground">ر.س</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {judgment?.judgmentNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم الحكم</p>
                <span className="text-status-neutral-foreground font-mono text-xs">
                  {judgment.judgmentNumber}
                </span>
              </div>
            )}
            {judgment?.caseReference && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">مرجع القضية</p>
                <span className="text-status-neutral-foreground font-mono text-xs">
                  {judgment.caseReference}
                </span>
              </div>
            )}
            {judgment?.judgmentDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الحكم</p>
                <span className="text-status-neutral-foreground">{formatDateAr(judgment.judgmentDate)}</span>
              </div>
            )}
            {judgment?.court && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المحكمة</p>
                <span className="text-status-neutral-foreground">{judgment.court}</span>
              </div>
            )}
            {judgment?.outcome && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نتيجة الحكم</p>
                <Badge variant={outcomeTone(judgment.outcome) as any}>
                  {OUTCOME_LABELS[judgment.outcome] || judgment.outcome}
                </Badge>
              </div>
            )}
            {judgment?.executionStatus && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">حالة التنفيذ</p>
                <Badge variant="secondary">{judgment.executionStatus}</Badge>
              </div>
            )}
            {judgment?.appealDeadline && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">الموعد النهائي للاستئناف</p>
                <Badge variant="outline">{formatDateAr(judgment.appealDeadline)}</Badge>
              </div>
            )}
          </div>

          {judgment?.summary && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملخص الحكم</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{judgment.summary}</p>
            </div>
          )}

          {judgment?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{judgment.notes}</p>
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
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(judgment.createdAt)}</span>
              </div>
            )}
            {judgment?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{judgment.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="legal-judgment" entityId={id} />}
      {id && <EntityTags entityType="legal-judgment" entityId={id} />}
    </div>
  );

  return (
    <>
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
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          {judgment && (
            <PrintButton
              entityType="legal_judgment"
              entityId={id ?? 0}
             />
          )}
          {judgment && judgment.caseId && (
            <GuardedButton
              perm="legal:update"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              disabled={!judgment || judgment.status === "executed" || judgment.status === "reversed"}
            >
              <Edit className="h-4 w-4 ms-1" />
              تعديل
            </GuardedButton>
          )}
        </>
      }
    />
    {judgment && judgment.caseId && id && (
      <EntityEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل الحكم"
        schema={judgmentEditSchema}
        defaultValues={{
          verdict: judgment.verdict ?? "",
          paidAmount: Number(judgment.paidAmount ?? 0),
          dueDate: judgment.dueDate ?? "",
          notes: judgment.notes ?? "",
        }}
        endpoint={`/legal/cases/${judgment.caseId}/judgments/${id}`}
        invalidateKeys={[["legal-judgment", String(id)], ["legal-judgments"], ["legal-case", String(judgment.caseId)]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextareaField name="verdict" label="نص الحكم" className="md:col-span-2" />
          <FormNumberField name="paidAmount" label="المبلغ المسدد" />
          <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
