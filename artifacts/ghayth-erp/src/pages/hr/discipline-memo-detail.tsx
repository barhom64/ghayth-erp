import { useState } from "react";
import { useRoute, Link } from "wouter";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useApiQuery, apiFetch, buildErrorToast } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Clock, CheckCircle, XCircle, FileText, Ban, Gavel, Scale, Lock, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";

import { INCIDENT_LABELS, MEMO_ACTION_LABELS } from "@/lib/hr-type-maps";

// HR-U3 — حُذفت STATUS_STYLES المحلية. حالات المذكرات التأديبية موحّدة في
// STATUS_MAP.memo + STATUS_MAP.shared (draft/expired).

interface MemoData {
  memo: any;
  events: any[];
}

export default function DisciplineMemoDetailPage() {
  const [, params] = useRoute("/hr/discipline/memos/:id");
  const id = params?.id;
  const { data, isLoading, isError } = useApiQuery<MemoData>(
    ["discipline-memo", String(id ?? "")],
    id ? `/hr/discipline/memos/${id}` : null
  );
  const { toast } = useToast();
  const qc = useQueryClient();

  const [justification, setJustification] = useState("");
  const [declined, setDeclined] = useState(false);
  const [managerRec, setManagerRec] = useState<"approve_excuse" | "reject_excuse">("reject_excuse");
  const [managerComment, setManagerComment] = useState("");
  const [gmDecision, setGmDecision] = useState<"approved" | "rejected" | "other">("approved");
  const [gmComment, setGmComment] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [showAppeal, setShowAppeal] = useState(false);
  const [busy, setBusy] = useState(false);

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

  if (isLoading) {
    return (
      <PageShell
        title="جارٍ تحميل المحضر..."
        loading
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <Card><CardContent className="py-12"><LoadingSpinner /></CardContent></Card>
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell
        title="تعذّر تحميل المحضر"
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <ErrorState onRetry={() => window.location.reload()} />
      </PageShell>
    );
  }
  if (!data?.memo) {
    return (
      <PageShell
        title="المحضر غير موجود"
        breadcrumbs={[
          { href: "/hr", label: "الموارد البشرية" },
          { href: "/hr/violations", label: "المخالفات والجزاءات" },
        ]}
      >
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Ban size={36} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium mb-1">لا يوجد محضر بهذا الرقم</p>
            <p className="text-sm mb-4">قد يكون المحضر محذوفًا أو غير متاح لصلاحياتك.</p>
            <Link href="/hr/violations">
              <Button variant="outline">
                <ArrowRight className="h-4 w-4 me-1" />
                العودة إلى قائمة المخالفات
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const memo = data.memo;
  const events = data.events ?? [];

  const totalDeduction =
    Number(memo.appliedDeductionAmount ?? 0) + Number(memo.appliedExtraDeduction ?? 0);

  return (
    <PageShell
      title={memo.memoNumber || "المحضر"}
      subtitle={`محضر استفسار بشأن ${INCIDENT_LABELS[memo.incidentType] ?? memo.incidentType}`}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات والجزاءات" },
        { label: memo.memoNumber || `محضر #${memo.id}` },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <PageStatusBadge status={memo.status} domain="memo" className="text-sm px-3 py-1" />
          <Link href="/hr/violations">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
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
                  <div className="text-lg font-bold text-red-600">
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
          <CardContent className="space-y-3">
            <Textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="اكتب تبريرك للواقعة..."
              rows={4}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={declined}
                onCheckedChange={(c) => setDeclined(!!c)}
              />
              أرفض تقديم تبرير
            </label>
            <Button
              onClick={() => act("/justify", { justification, declined }, "تم إرسال التبرير")}
              disabled={busy || (!justification && !declined)}
            >
              إرسال التبرير
            </Button>
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
              <div className="bg-gray-50 rounded p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">تبرير الموظف</div>
                {memo.justification}
              </div>
            )}
            <div>
              <Label>التوصية</Label>
              <Select value={managerRec} onValueChange={(v: any) => setManagerRec(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve_excuse">قبول التبرير</SelectItem>
                  <SelectItem value="reject_excuse">رفض التبرير</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تعليق المدير</Label>
              <Textarea
                value={managerComment}
                onChange={(e) => setManagerComment(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              onClick={() =>
                act(
                  "/manager-recommendation",
                  { recommendation: managerRec, comment: managerComment },
                  "تم تسجيل التوصية"
                )
              }
              disabled={busy}
            >
              إرسال التوصية
            </Button>
          </CardContent>
        </Card>
      )}

      {memo.status === "pending_gm" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الخطوة 3: قرار المدير العام</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
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
            <div>
              <Label>القرار النهائي</Label>
              <Select value={gmDecision} onValueChange={(v: any) => setGmDecision(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">اعتماد الجزاء</SelectItem>
                  <SelectItem value="rejected">رفض المحضر (قبول التبرير)</SelectItem>
                  <SelectItem value="other">قرار آخر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>تعليق المدير العام</Label>
              <Textarea
                value={gmComment}
                onChange={(e) => setGmComment(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              onClick={() =>
                act(
                  "/gm-decision",
                  { decision: gmDecision, comment: gmComment },
                  "تم تسجيل القرار"
                )
              }
              disabled={busy}
            >
              اعتماد القرار
            </Button>
          </CardContent>
        </Card>
      )}

      {!["approved", "rejected", "cancelled", "closed", "appeal_pending", "appeal_accepted"].includes(memo.status) && (
        <Card>
          <CardContent className="pt-6">
            <Button
              variant="outline"
              className="text-red-600"
              onClick={() => {
                const reason = prompt("سبب الإلغاء:");
                if (reason != null) act("/cancel", { reason }, "تم إلغاء المحضر");
              }}
              disabled={busy}
            >
              <Ban className="w-4 h-4 me-2" />
              إلغاء المحضر
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Appeal — الاستئناف */}
      {memo.status === "approved" && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-600" /> استئناف القرار
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showAppeal ? (
              <Button variant="outline" onClick={() => setShowAppeal(true)}>
                <Scale className="w-4 h-4 me-2" />تقديم استئناف
              </Button>
            ) : (
              <>
                <Textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder="اكتب مبررات الاستئناف..."
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button onClick={() => act("/appeal", { reason: appealReason }, "تم تقديم الاستئناف")} disabled={busy || !appealReason.trim()}>
                    إرسال الاستئناف
                  </Button>
                  <Button variant="outline" onClick={() => setShowAppeal(false)}>إلغاء</Button>
                </div>
              </>
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
              <div className="bg-blue-50 rounded p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">سبب الاستئناف</div>
                {memo.appealReason}
              </div>
            )}
            <div className="flex gap-2">
              <Button className="bg-green-600 hover:bg-green-700" disabled={busy} onClick={() => act("/appeal-decision", { decision: "accepted", comment: "" }, "تم قبول الاستئناف")}>
                قبول الاستئناف
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => act("/appeal-decision", { decision: "rejected", comment: "" }, "تم رفض الاستئناف")}>
                رفض الاستئناف
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Close + Generate Letter — إقفال + خطاب */}
      {["approved", "rejected", "appeal_accepted", "cancelled"].includes(memo.status) && memo.status !== "closed" && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3 flex-wrap">
            <Button variant="outline" onClick={() => act("/close", { note: "إقفال عادي" }, "تم إقفال المحضر")} disabled={busy}>
              <Lock className="w-4 h-4 me-2" /> إقفال المحضر
            </Button>
            <Link href={`/communications/letters/create?relatedType=discipline_memo&relatedId=${memo.id}&subject=${encodeURIComponent(`إخطار تأديبي — ${memo.memoNumber}`)}`}>
              <Button variant="outline">
                <Mail className="w-4 h-4 me-2" /> إصدار خطاب تأديبي
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

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
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  {ev.action === "gm_decided" && memo.status === "rejected" && (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
