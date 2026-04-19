import { useState } from "react";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingDown, Save } from "lucide-react";
import { CreatePageLayout } from "@/components/create-page-layout";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";

export default function BatchDepreciatePage() {
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [batchResult, setBatchResult] = useState<any>(null);

  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  async function handleBatchDepreciate() {
    try {
      const res = await batchDepMutation.mutateAsync({ period: depPeriod });
      setBatchResult(res);
    } catch (err: any) {
      console.error(err);
    }
  }

  return (
    <CreatePageLayout
      title="إهلاك دفعي للأصول"
      subtitle="إهلاك جميع الأصول الثابتة لفترة محددة"
      backPath="/finance/fixed-assets"
    >
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold mb-3">
            <TrendingDown className="h-5 w-5 text-orange-500" /> بيانات الإهلاك
          </h3>
          <div className="max-w-md">
            <FormFieldWrapper label="الفترة (سنة-شهر)">
              <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
            </FormFieldWrapper>
          </div>
        </div>
        <Button onClick={handleBatchDepreciate} disabled={batchDepMutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {batchDepMutation.isPending ? "جارٍ الإهلاك..." : `إهلاك جميع الأصول — ${depPeriod}`}
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
