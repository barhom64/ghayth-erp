import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApprovalActions, ActionHistory } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { useToast } from "@/hooks/use-toast";
import { Edit, Star, Target, TrendingUp } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

/**
 * PerformanceDetail — unified detail page for a single performance
 * review.
 *
 * Fetches from `/hr/performance/:id`. Shows the headline rating as a
 * large colour-coded badge, plus the scores breakdown, strengths,
 * areas for improvement, goals and development plan. Links back to
 * the employee being reviewed and, where present, to the reviewer.
 */

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  in_progress: "قيد التقييم",
  completed: "مكتمل",
  archived: "مؤرشف",
};

const RATING_LABELS: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد جداً",
  satisfactory: "مُرضي",
  needs_improvement: "يحتاج تحسين",
  unsatisfactory: "غير مُرضي",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "completed") return "success" as const;
  if (status === "archived") return "muted" as const;
  if (status === "in_progress") return "info" as const;
  if (status === "draft") return "default" as const;
  return "default" as const;
}

// Colour class for the hero rating badge — green for strong ratings,
// red for weak ones, yellow in between. Applied both to the overview
// badge and the inline badge in the meta block.
function ratingColorClass(rating?: string | null): string {
  switch (rating) {
    case "excellent":
      return "bg-green-100 text-green-800 border-green-300";
    case "good":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "satisfactory":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "needs_improvement":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "unsatisfactory":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
}

export default function PerformanceDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/hr/performance/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("evaluation_cycle", id ?? 0);

  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["performance", String(id)],
    id ? `/hr/performance/${id}` : null,
    !!id
  );

  const review = data;

  // Scores breakdown. The server may project this either as an object
  // map ({ leadership: 4, teamwork: 5 }) or an array of
  // { label, score } entries — normalise to a single shape here so the
  // render code below can stay flat.
  const scoreEntries: Array<{ label: string; score: number }> = useMemo(() => {
    if (!review?.scores) return [];
    if (Array.isArray(review.scores)) {
      return review.scores
        .map((s: any) => ({
          label: String(s?.label || s?.name || s?.criterion || ""),
          score: Number(s?.score || s?.value || 0),
        }))
        .filter((s: { label: string; score: number }) => s.label);
    }
    if (typeof review.scores === "object") {
      return Object.entries(review.scores).map(([label, score]) => ({
        label,
        score: Number(score as any) || 0,
      }));
    }
    return [];
  }, [review?.scores]);

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!review) return out;
    if (review.employeeId) {
      out.push({
        type: "employee",
        id: review.employeeId,
        label: review.employeeName || `موظف #${review.employeeId}`,
        sublabel: "الموظف",
        href: `/employees/${review.employeeId}`,
      });
    }
    if (review.reviewerId) {
      out.push({
        type: "employee",
        id: review.reviewerId,
        label: review.reviewerName || `المُقيِّم #${review.reviewerId}`,
        sublabel: "المُقيِّم",
        href: `/employees/${review.reviewerId}`,
      });
    }
    return out;
  }, [review]);

  const printSections: PrintSection[] = useMemo(() => {
    if (!review) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم المرجع", value: review.ref || `PERF-${id}` },
          { label: "الموظف", value: review.employeeName || "-" },
          ...(review.reviewerName
            ? [{ label: "المُقيِّم", value: review.reviewerName }]
            : []),
          ...(review.reviewPeriod
            ? [{ label: "فترة التقييم", value: review.reviewPeriod }]
            : []),
          ...(review.overallRating
            ? [
                {
                  label: "التقييم العام",
                  value: RATING_LABELS[review.overallRating] || review.overallRating,
                },
              ]
            : []),
          { label: "الحالة", value: STATUS_LABELS[review.status] || review.status || "-" },
          { label: "تاريخ الإنشاء", value: formatDateAr(review.createdAt) },
        ],
      },
    ];
    if (review.strengths) {
      sections.push({ kind: "text", title: "نقاط القوة", body: review.strengths });
    }
    if (review.areasForImprovement) {
      sections.push({
        kind: "text",
        title: "مجالات التحسين",
        body: review.areasForImprovement,
      });
    }
    if (review.goals) {
      sections.push({ kind: "text", title: "الأهداف", body: review.goals });
    }
    if (review.developmentPlan) {
      sections.push({
        kind: "text",
        title: "خطة التطوير",
        body: review.developmentPlan,
      });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "الموظف", name: review.employeeName || "" },
        { label: "المُقيِّم", name: review.reviewerName || "" },
      ],
    });
    return sections;
  }, [review, id]);

  const editDelete = useDetailEditDelete({
    entityLabel: "تقييم الأداء",
    patchPath: `/hr/performance/${id}`,
    deletePath: `/hr/performance/${id}`,
    listPath: "/hr/performance",
    initialValues: review,
    fields: [
      { key: "overallRating", label: "التقييم العام", type: "number" },
      { key: "strengths", label: "نقاط القوة" },
      { key: "areasForImprovement", label: "مجالات التحسين" },
      { key: "comments", label: "ملاحظات" },
    ],
    invalidateKeys: [["performance-review", String(id)], ["performance-reviews"]],
    onSaved: () => refetch(),
  });

  const ratingLabel = review?.overallRating
    ? RATING_LABELS[review.overallRating] || review.overallRating
    : null;

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      {/* Primary info — hero rating + scores + narrative sections */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-gray-500" />
            بيانات التقييم
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero rating badge */}
          <div className="border-b pb-4">
            <p className="text-xs text-gray-500 mb-2">التقييم العام</p>
            {ratingLabel ? (
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-lg font-bold",
                  ratingColorClass(review?.overallRating)
                )}
              >
                <Star className="h-5 w-5" />
                {ratingLabel}
              </span>
            ) : (
              <span className="text-gray-400 text-sm">لم يتم التقييم بعد</span>
            )}
            {review?.employeeName && (
              <p className="mt-3 text-sm text-gray-700">
                للموظف: <span className="font-medium">{review.employeeName}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {review?.reviewPeriod && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">فترة التقييم</p>
                <Badge variant="outline">{review.reviewPeriod}</Badge>
              </div>
            )}
            {review?.reviewerName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">المُقيِّم</p>
                <span className="text-gray-800">{review.reviewerName}</span>
              </div>
            )}
            {review?.createdAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(review.createdAt)}</span>
              </div>
            )}
            {review?.completedAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإكمال</p>
                <span className="text-gray-800">{formatDateAr(review.completedAt)}</span>
              </div>
            )}
          </div>

          {/* Scores breakdown */}
          {scoreEntries.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                تفاصيل الدرجات
              </p>
              <div className="grid grid-cols-2 gap-2">
                {scoreEntries.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between border rounded p-2 text-xs"
                  >
                    <span className="text-gray-700">{s.label}</span>
                    <span
                      className={cn(
                        "font-bold",
                        s.score >= 4
                          ? "text-green-600"
                          : s.score >= 3
                          ? "text-yellow-600"
                          : "text-red-600"
                      )}
                    >
                      {s.score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {review?.strengths && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">نقاط القوة</p>
              <p className="text-gray-800 whitespace-pre-wrap">{review.strengths}</p>
            </div>
          )}
          {review?.areasForImprovement && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">مجالات التحسين</p>
              <p className="text-gray-800 whitespace-pre-wrap">
                {review.areasForImprovement}
              </p>
            </div>
          )}
          {review?.goals && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Target className="h-3.5 w-3.5" />
                الأهداف
              </p>
              <p className="text-gray-800 whitespace-pre-wrap">{review.goals}</p>
            </div>
          )}
          {review?.developmentPlan && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">خطة التطوير</p>
              <p className="text-gray-800 whitespace-pre-wrap">
                {review.developmentPlan}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Approval actions */}
        {id && review && ["pending", "draft", "returned"].includes(review.status) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="performance"
                entityId={id}
                currentStatus={review.status}
                approveEndpoint={`/hr/performance/${id}/approve`}
                rejectEndpoint={`/hr/performance/${id}/approve`}
                returnEndpoint={`/hr/performance/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "draft", "returned"]}
                invalidateKeys={[["performance"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث التقييم" });
                }}
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
              <ActionHistory entityType="performance" entityId={id} defaultOpen />
            </CardContent>
          </Card>
        )}
      </div>

      {id && <ApprovalTimeline entityType="performance" entityId={id} />}

      {id && <EntityComments entityType="performance" entityId={id} />}
      {id && <EntityTags entityType="performance" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={review?.ref ? `تقييم ${review.ref}` : "تفاصيل التقييم"}
      subtitle={
        review
          ? `${review.employeeName || ""}${
              review.employeeName && review.reviewPeriod ? " — " : ""
            }${review.reviewPeriod || ""}`
          : undefined
      }
      backPath="/hr/performance"
      refNumber={review?.ref || (id ? `PERF-${id}` : undefined)}
      status={
        review
          ? {
              label: STATUS_LABELS[review.status] || review.status || "-",
              tone: statusTone(review.status),
            }
          : undefined
      }
      typeLabel={ratingLabel || review?.reviewPeriod || undefined}
      createdAt={review?.createdAt}
      updatedAt={review?.updatedAt}
      createdByName={review?.createdByName || review?.reviewerName}
      assignedToName={review?.employeeName}
      relatedEntities={relatedEntities}
      entityType="performance"
      entityId={id ?? 0}
      overview={overview}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {review && (
            <EntityPrintButton
              branchId={review.branchId}
              title={review.ref ? `تقييم ${review.ref}` : "تقييم أداء"}
              ref={review.ref || `PERF-${id}`}
              date={formatDateAr(review.createdAt)}
              sections={printSections}
            />
          )}
          <DetailActionButtons hook={editDelete} editPerm="hr:update" deletePerm="hr:delete" />
        </>
      }
    />
  );
}
