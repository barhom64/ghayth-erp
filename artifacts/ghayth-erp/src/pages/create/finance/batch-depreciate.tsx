import { useState } from "react";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { TrendingDown } from "lucide-react";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
} from "@workspace/ui-core";
import { todayLocal } from "@/lib/formatters";

const schema = z.object({
  depPeriod: z.string().min(1, "يرجى تحديد الفترة"),
});

export default function BatchDepreciatePage() {
  const [batchResult, setBatchResult] = useState<any>(null);
  const batchDepMutation = useApiMutation<any, { period: string }>(
    "/finance/fixed-assets/depreciate-all",
    "POST",
  );

  return (
    <CreatePageLayout
      title="إهلاك دفعي للأصول"
      subtitle="إهلاك جميع الأصول الثابتة لفترة محددة"
      backPath="/finance/fixed-assets"
    >
      <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <TrendingDown className="h-5 w-5 text-status-warning-foreground" /> بيانات الإهلاك
      </div>
      <FormShell
        schema={schema}
        defaultValues={{ depPeriod: todayLocal().slice(0, 7) }}
        submitLabel={batchDepMutation.isPending ? "جارٍ الإهلاك..." : "إهلاك جميع الأصول"}
        onSubmit={async (values) => {
          const res = await batchDepMutation.mutateAsync({ period: values.depPeriod });
          setBatchResult(res);
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="depPeriod" label="الفترة (سنة-شهر)" required type="month" />
        </FormGrid>
      </FormShell>
      {batchResult && (
        <div className="bg-status-success-surface p-4 rounded-lg border border-status-success-surface space-y-1 mt-4">
          <p className="font-semibold text-status-success-foreground">{batchResult.message}</p>
          <p className="text-sm text-muted-foreground">معالج: {batchResult.processed} | تخطي: {batchResult.skipped}</p>
        </div>
      )}
    </CreatePageLayout>
  );
}
