import { Button } from "@/components/ui/button";

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-red-600 text-lg mb-2">حدث خطأ في تحميل البيانات</p>
      <Button variant="outline" onClick={onRetry ?? (() => window.location.reload())}>
        إعادة المحاولة
      </Button>
    </div>
  );
}
