import { Button } from "@/components/ui/button";
import { PageStateWrapper } from "./page-state";

/**
 * LoadingSpinner — kept for backwards compatibility with ~50 pages that
 * import it directly. New code should use <PageStateWrapper> which handles
 * loading/error/empty in one component.
 */
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

/**
 * ErrorState — legacy component kept for backwards compatibility. It now
 * delegates to <PageStateWrapper> which is aware of the typed-error shape
 * (ApiError.code, .fix, .meta) — so pages that pass the real error object
 * get specific messages per error code, while pages that just call
 * <ErrorState onRetry={refetch} /> with no error fall back to the generic
 * "حدث خطأ في تحميل البيانات" (same as before).
 *
 * New code should use <PageStateWrapper> directly with the `error` prop so
 * the user sees WHY the page failed (forbidden? not found? network?) rather
 * than the same generic line for every failure mode.
 */
export function ErrorState({ onRetry, error }: { onRetry?: () => void; error?: unknown }) {
  if (error) {
    return (
      <PageStateWrapper error={error} onRetry={onRetry}>
        <div />
      </PageStateWrapper>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-red-600 text-lg mb-2">حدث خطأ في تحميل البيانات</p>
      <Button variant="outline" onClick={onRetry ?? (() => window.location.reload())}>
        إعادة المحاولة
      </Button>
    </div>
  );
}

export { PageStateWrapper } from "./page-state";
