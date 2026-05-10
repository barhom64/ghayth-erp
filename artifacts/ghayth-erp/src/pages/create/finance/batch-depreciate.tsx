import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingDown, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { CreatePageLayout } from "@/components/create-page-layout";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function BatchDepreciatePage() {
  const { toast } = useToast();
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("finance_batch_depreciate", {
    depPeriod: new Date().toISOString().slice(0, 7),
  });
  const { fieldErrors, validate } = useFieldErrors();
  const [batchResult, setBatchResult] = useState<any>(null);

  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  async function handleBatchDepreciate() {
    const firstError = validate({
      depPeriod: !form.depPeriod ? "يرجى تحديد الفترة" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      const res = await batchDepMutation.mutateAsync({ period: form.depPeriod });
      setBatchResult(res);
      clearDraft();
    } catch {
      // error handled by mutation hook toast
    }
  }

  return (
    <CreatePageLayout
      title="إهلاك دفعي للأصول"
      subtitle="إهلاك جميع الأصول الثابتة لفترة محددة"
      backPath="/finance/fixed-assets"
    >
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <TrendingDown className="h-5 w-5 text-orange-500" /> بيانات الإهلاك
          </h3>
          <div className="max-w-md">
            <FormFieldWrapper label="الفترة (سنة-شهر)">
              <Input type="month" value={form.depPeriod} onChange={e => setForm(f => ({ ...f, depPeriod: e.target.value }))} />
            </FormFieldWrapper>
          </div>
        </div>
        <Button onClick={handleBatchDepreciate} disabled={batchDepMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {batchDepMutation.isPending ? "جارٍ الإهلاك..." : `إهلاك جميع الأصول — ${form.depPeriod}`}
        </Button>
        {batchResult && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-1">
            <p className="font-semibold text-green-700">{batchResult.message}</p>
            <p className="text-sm text-gray-600">معالج: {batchResult.processed} | تخطي: {batchResult.skipped}</p>
          </div>
        )}
      </div>
    </CreatePageLayout>
  );
}
