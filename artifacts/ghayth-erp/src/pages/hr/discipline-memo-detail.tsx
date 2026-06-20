import { useState } from "react";
import { useRoute, Link } from "wouter";
import { z } from "zod";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useApiQuery, apiFetch, buildErrorToast } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton, usePermission } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { PromptDialog } from "@/components/shared/prompt-dialog";
import {
  FormShell,
  FormTextareaField,
  FormCheckboxField,
  FormSelectField,
} from "@workspace/ui-core";
import { Clock, CheckCircle, XCircle, FileText, Ban, Gavel, Scale, Lock, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DetailPageLayout } from "@workspace/entity-kit";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

import { INCIDENT_LABELS, MEMO_ACTION_LABELS } from "@/lib/hr-type-maps";
import { PrintButton } from "@/components/shared/print-button";

// HR-U3 — حُذفت STATUS_STYLES المحلية. حالات المذكرات التأديبية موحّدة في
// STATUS_MAP.memo + STATUS_MAP.shared (draft/expired).

interface MemoData {
  memo: any;
  events: any[];
}

const justifySchema = z.object({
  justification: z.string().optional(),
  declined: z.boolean().default(false),
}).refine((v) => v.declined || (v.justification?.trim().length ?? 0) > 0, {
  message: "أدخل تبريرًا أو علّم رفض التبرير",
  path: ["justification"],
});

const managerRecSchema = z.object({
  recommendation: z.enum(["approve_excuse", "reject_excuse"]),
  comment: z.string().optional(),
});

const gmDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "other"]),
  comment: z.string().optional(),
});

const appealSchema = z.object({
  reason: z.string().min(1, "اكتب مبررات الاستئناف"),
});

const MANAGER_REC_OPTIONS = [
  { value: "approve_excuse", label: "قبول التبرير" },
  { value: "reject_excuse", label: "رفض التبرير" },
];

const GM_DECISION_OPTIONS = [
  { value: "approved", label: "اعتماد الجزاء" },
  { value: "rejected", label: "رفض المحضر (قبول التبرير)" },
  { value: "other", label: "قرار آخر" },
];

export default function DisciplineMemoDetailPage() {
  const [, params] = useRoute("/hr/discipline/memos/:id");
  const id = params?.id;
  const { extraTabs, hideTabs } = useRegistryTabs("discipline_memo", id ?? "");
  const { data, isLoading, isError } = useApiQuery<MemoData>(
    ["discipline-memo", String(id ?? "")],
    `/hr/discipline/memos/${id}`
  );
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showAppeal, setShowAppeal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const canCreateHr = usePermission("hr:create");
  const canApproveHr = usePermission("hr:approve");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["discipline-memo", id] });
    qc.invalidateQueries({ queryKey: ["discipline-memos"] });
    qc.invalidateQueries({ queryKey: ["discipline-memos-stats"] });
  };

  // HR-U4 — استخدام buildErrorToast لعرض عنوان+وصف typed بدل "فشلت العملية" العام.
  const act = async (path: string, body: Record<string, any>, successMsg: string) => {
    setBusy(true);
    try {
      await apiFetch(`/hr/discipline/memos/${id}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({ title: successMsg });
      invalidate();
    } catch (err) {
      toast(buildErrorToast(err));
    } finally {
      setBusy(false);
    }
  };

  const memo = data?.memo;
  const events = data?.events ?? [];

  const totalDeduction = memo
    ? Number(memo.appliedDeductionAmount ?? 0) + Number(memo.appliedExtraDeduction ?? 0)
    : 0;

  const overview = memo ? (
    <>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> تفاصيل الواقعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-muted-foreground text-xs">الموظف</div>
                <div className="font-medium">{memo.employeeName}</div>
                <div className="text-xs text-muted-foreground">{memo.empNumber}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">تاريخ الواقعة</div>
                <div className="font-medium">{memo.incidentDate}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">نوع الواقعة</div>
                <div className="font-medium">{INCIDENT_LABELS[memo.incidentType] ?? memo.incidentType}</div>
              </div>
              {memo.incidentDurationMinutes != null && (
                <div>
                  <div className="text-muted-foreground text-xs">المدة</div>
                  <div className="font-medium">{memo.incidentDurationMinutes} دقيقة</div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground text-xs">المصدر</div>
                <div className="font-medium">{memo.source === "auto" ? "تلقائي" : "يدوي"}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">رقم التكرار</div>
                <div className="font-medium">{memo.occurrenceCount} / 4</div>
              </div>
            </div>
            {memo.incidentDescription && (
              <div className="pt-2 border-t">
                <div className="text-muted-foreground text-xs mb-1">الوصف</div>
                <p className="text-sm">{memo.incidentDescription}</p>
              </div>
            )}
            {memo.regArticle && (
              <div className="pt-2 border-t">
                <div className="text-muted-foreground text-xs mb-1">المادة المطبقة</div>
                <Badge variant="outline">
                  {memo.regSection} #{memo.regArticle}
                </Badge>
                <p className="text-sm mt-1">{memo.regTitle}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="w-4 h-4" /> الجزاء
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {memo.appliedPenaltyLabel ? (
              <>
                <div>
                  <div className="text-muted-foreground text-xs">العقوبة</div>
                  <div className="font-medium">{memo.appliedPenaltyLabel}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">الخصم الأساسي</div>
                  <div className="font-medium">
                    {formatCurrency(Number(memo.appliedDeductionAmount ?? 0))}
                  </div>
                </div>
                {Number(memo.appliedExtraDeduction ?? 0) > 0 && (
                  <div>
                    <div className="text-muted-foreground text-xs">حسم إضافي</div>
                    <div className="font-medium">
                      {formatCurrency(Number(memo.appliedExtraDeduction))}
                    </div>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <div className="text-muted-foreground text-xs">الإجمالي</div>
                  <div className="text-lg font-bold text-status-error-foreground">
                    {formatCurrency(totalDeduction)}
                  </div>
                </div>
                {memo.terminationDecided && (
                  <Badge className="bg-red-600 text-white w-full justify-center">
                    تقرّر الفصل
                  </Badge>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">لم يُطبَّق جزاء بعد</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workflow actions based on status */}
      {memo.status === "pending_employee" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الخطوة 1: تبرير الموظف</CardTitle>
          </CardHeader>
          <CardContent>
            <FormShell
              schema={justifySchema}
              defaultValues={{ justification: "", declined: false }}
              submitLabel="إرسال التبرير"
              disabled={busy || !canCreateHr}
              onSubmit={async (values) => {
                await act("/justify", { justification: values.justification ?? "", declined: values.declined }, "تم إرسال التبرير");
              }}
            >
              <FormTextareaField
                name="justification"
                label=""
                rows={4}
                placeholder="اكتب تبريرك للواقعة..."
              />
              <FormCheckboxField name="declined" label="أرفض تقديم تبرير" />
            </FormShell>
          </CardContent>
        </Card>
      )}

      {memo.status === "pending_manager" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الخطوة 2: توصية المدير المباشر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memo.justification && (
              <div className="bg-surface-subtle rounded p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">تبرير الموظف</div>
                {memo.justification}
              </div>
            )}
            <FormShell
              schema={managerRecSchema}
              defaultValues={{ recommendation: "reject_excuse", comment: "" }}
              submitLabel="إرسال التوصية"
              disabled={busy || !canApproveHr}
              onSubmit={async (values) => {
                await act("/manager-recommendation", { recommendation: values.recommendation, comment: values.comment ?? "" }, "تم تسجيل التوصية");
              }}
            >
              <FormSelectField name="recommendation" label="التوصية" options={MANAGER_REC_OPTIONS} />
              <FormTextareaField name="comment" label="تعليق المدير" rows={3} />
            </FormShell>
          </CardContent>
        </Card>
      )}

      {memo.status === "pending_gm" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الخطوة 3: قرار المدير العام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-status-warning-surface border border-status-warning-surface rounded p-3 text-sm">
              <p className="font-medium">توصية المدير المباشر:</p>
              <p className="mt-1">
                {memo.managerRecommendation === "approve_excuse"
                  ? "قبول التبرير"
                  : memo.managerRecommendation === "reject_excuse"
                  ? "رفض التبرير"
                  : "—"}
              </p>
              {memo.managerComment && <p className="text-xs mt-1">{memo.managerComment}</p>}
            </div>
            <FormShell
              schema={gmDecisionSchema}
              defaultValues={{ decision: "approved", comment: "" }}
              submitLabel="اعتماد القرار"
              disabled={busy || !canApproveHr}
              onSubmit={async (values) => {
                await act("/gm-decision", { decision: values.decision, comment: values.comment ?? "" }, "تم تسجيل القرار");
              }}
            >
              <FormSelectField name="decision" label="القرار النهائي" options={GM_DECISION_OPTIONS} />
              <FormTextareaField name="comment" label="تعليق المدير العام" rows={3} />
            </FormShell>
          </CardContent>
        </Card>
      )}

      {!["approved", "rejected", "cancelled", "closed", "appeal_pending", "appeal_accepted"].includes(memo.status) && (
        <Card>
          <CardContent className="pt-6">
            <GuardedButton
              perm="hr:delete"
              variant="outline"
              className="text-status-error-foreground"
              onClick={() => setShowCancelDialog(true)}
              disabled={busy}
            >
              <Ban className="w-4 h-4 me-2" />
              إلغاء المحضر
            </GuardedButton>
          </CardContent>
        </Card>
      )}

      {/* Appeal — الاستئناف */}
      {memo.status === "approved" && (
        <Card className="border-status-info-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-status-info-foreground" /> استئناف القرار
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showAppeal ? (
              <Button variant="outline" onClick={() => setShowAppeal(true)}>
                <Scale className="w-4 h-4 me-2" />تقديم استئناف
              </Button>
            ) : (
              <FormShell
                schema={appealSchema}
                defaultValues={{ reason: "" }}
                submitLabel="إرسال الاستئناف"
                disabled={busy || !canCreateHr}
                secondaryActions={
                  <Button type="button" variant="outline" onClick={() => setShowAppeal(false)}>إلغاء</Button>
                }
                onSubmit={async (values) => {
                  await act("/appeal", { reason: values.reason }, "تم تقديم الاستئناف");
                  setShowAppeal(false);
                }}
              >
                <FormTextareaField
                  name="reason"
                  label=""
                  rows={4}
                  placeholder="اكتب مبررات الاستئناف..."
                  required
                />
              </FormShell>
            )}
          </CardContent>
        </Card>
      )}

      {/* Appeal Decision */}
      {memo.status === "appeal_pending" && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-orange-600" /> البت في الاستئناف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memo.appealReason && (
              <div className="bg-status-info-surface rounded p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">سبب الاستئناف</div>
                {memo.appealReason}
              </div>
            )}
            <div className="flex gap-2">
              <GuardedButton perm="hr:approve" className="bg-green-600 hover:bg-green-700" disabled={busy} onClick={() => act("/appeal-decision", { decision: "accepted", comment: "" }, "تم قبول الاستئناف")}>
                قبول الاستئناف
              </GuardedButton>
              <GuardedButton perm="hr:delete" variant="destructive" disabled={busy} onClick={() => act("/appeal-decision", { decision: "rejected", comment: "" }, "تم رفض الاستئناف")}>
                رفض الاستئناف
              </GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close + Generate Letter — إقفال + خطاب */}
      {["approved", "rejected", "appeal_accepted", "cancelled"].includes(memo.status) && memo.status !== "closed" && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3 flex-wrap">
            <GuardedButton perm="hr:approve" variant="outline" onClick={() => act("/close", { note: "إقفال عادي" }, "تم إقفال المحضر")} disabled={busy}>
              <Lock className="w-4 h-4 me-2" /> إقفال المحضر
            </GuardedButton>
            <Button asChild variant="outline"><Link href={`/correspondence/create?relatedType=discipline_memo&relatedId=${memo.id}&subject=${encodeURIComponent(`إخطار تأديبي — ${memo.memoNumber}`)}`}>
                <Mail className="w-4 h-4 me-2" /> إصدار خطاب تأديبي
              </Link></Button>
          </CardContent>
        </Card>
      )}

      {/* السجل الزمني للأحداث */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> السجل الزمني
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد أحداث</p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="flex gap-3 border-r-2 border-primary/30 pe-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{MEMO_ACTION_LABELS[ev.action] ?? ev.action}</Badge>
                      <span className="text-xs text-muted-foreground">{ev.actorRole}</span>
                    </div>
                    {ev.note && <p className="text-sm mt-1">{ev.note}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateAr(ev.createdAt)}
                    </p>
                  </div>
                  {ev.action === "gm_decided" && memo.status === "approved" && (
                    <CheckCircle className="w-5 h-5 text-status-success-foreground" />
                  )}
                  {ev.action === "gm_decided" && memo.status === "rejected" && (
                    <XCircle className="w-5 h-5 text-status-error-foreground" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  ) : null;

  const headerActions = (
    <Button asChild variant="outline" size="sm"><Link href={`/correspondence/create?relatedType=discipline_memo&relatedId=${id}&subject=${encodeURIComponent("إخطار تأديبي")}`}>
        <Mail className="w-4 h-4 me-1" />
        خطاب تأديبي
      </Link></Button>
  );

  return (
    <>
      <DetailPageLayout
        title={memo?.memoNumber || "المحضر"}
        subtitle={memo ? `محضر استفسار بشأن ${INCIDENT_LABELS[memo.incidentType] ?? memo.incidentType}` : undefined}
        backPath="/hr/discipline/memos"
        backLabel="العودة"
        status={memo ? { label: memo.status } : undefined}
        refNumber={memo?.memoNumber}
        createdAt={memo?.createdAt}
        updatedAt={memo?.updatedAt}
        entityType="hr-inquiry-memo"
        entityId={id ?? ""}
        extraTabs={extraTabs}
        hideTabs={hideTabs}
        isLoading={isLoading}
        error={isError ? true : undefined}
        actions={
        <div className="flex items-center gap-2">
          {headerActions}
          <PrintButton entityType="discipline_memo" entityId={(id as any) ?? 0} label="طباعة" />
        </div>
      }
        overview={overview}
      />
      <PromptDialog
        open={showCancelDialog}
        title="سبب إلغاء المحضر"
        description="يرجى إدخال سبب الإلغاء — يُسجَّل في سجل التدقيق للمحضر."
        placeholder="اكتب السبب هنا..."
        confirmLabel="تأكيد الإلغاء"
        onSubmit={(reason) => {
          setShowCancelDialog(false);
          act("/cancel", { reason }, "تم إلغاء المحضر");
        }}
        onClose={() => setShowCancelDialog(false)}
      />
    </>
  );
}
