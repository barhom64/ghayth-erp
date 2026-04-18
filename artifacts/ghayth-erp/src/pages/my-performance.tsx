import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/page-shell";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Target, Star, TrendingUp, CheckCircle2, Clock, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function RatingStars({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          size={16}
          className={i < Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"}
        />
      ))}
    </div>
  );
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "text-gray-500 bg-gray-50" },
  submitted: { label: "مقدّم", color: "text-blue-600 bg-blue-50" },
  reviewed: { label: "مراجع", color: "text-purple-600 bg-purple-50" },
  finalized: { label: "مُعتمد", color: "text-green-600 bg-green-50" },
};

export default function MyPerformance() {
  const { data, isLoading, isError } = useApiQuery<any>(["my-performance"], "/my-space/performance");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const reviews: any[] = data?.data ?? [];
  const latestReview = reviews[0];

  return (
    <PageShell title="تقييمي" subtitle="نتائج تقييمات الأداء الخاصة بك" loading={isLoading}>
      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <Target size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">لا توجد تقييمات بعد</p>
            <p className="text-sm mt-1">ستظهر نتائج تقييماتك هنا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {latestReview && (
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">آخر تقييم</p>
                    <p className="text-lg font-bold text-gray-900">{latestReview.periodLabel ?? latestReview.period}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <RatingStars rating={Number(latestReview.overallRating ?? 0)} />
                      <span className="text-sm font-semibold text-primary">{Number(latestReview.overallRating ?? 0).toFixed(1)} / 5</span>
                    </div>
                  </div>
                  <div className={cn("px-3 py-1 rounded-full text-xs font-medium", statusLabels[latestReview.status]?.color ?? "text-gray-600 bg-gray-50")}>
                    {statusLabels[latestReview.status]?.label ?? latestReview.status}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {reviews.map((review: any) => {
              const cfg = statusLabels[review.status] ?? { label: review.status, color: "text-gray-600 bg-gray-50" };
              return (
                <Card key={review.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <BarChart3 size={18} className="text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{review.periodLabel ?? review.period}</p>
                          <p className="text-xs text-gray-400">{formatDateAr(review.createdAt)}</p>
                        </div>
                      </div>
                      <div className="text-left flex flex-col items-end gap-1">
                        <RatingStars rating={Number(review.overallRating ?? 0)} />
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.color)}>{cfg.label}</span>
                      </div>
                    </div>
                    {review.notes && (
                      <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{review.notes}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </PageShell>
  );
}
