import { useState } from "react";
import { z } from "zod";
import { useApiMutation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TrendingDown, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  CreatePageLayout,
  FormShell,
  FormTextField,
} from "@workspace/ui-core";
import { todayLocal } from "@/lib/formatters";

const schema = z.object({
  depPeriod: z.string().min(1, "يرجى تحديد الفترة"),
});

export default function BatchDepreciatePage() {
  const { toast: _toast } = useToast();
  const [batchResult, setBatchResult] = useState<any>(null);
  const batchDepMutation = useApiMutation("/finance/fixed-assets/depreciate-all", "POST");

  const defaultPeriod = todayLocal().slice(0, 7);

  return (
    <CreatePageLayout
      title="إهلاك دفعي للأصول"
      subtitle="إهلاك جميع الأصول الثابتة لفترة محددة"
      backPath="/finance/fixed-assets"
    >
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <TrendingDown className="h-5 w-5 text-orange-500" /> بيانات الإهلاك
        </h3>
        <FormShell
          schema={schema}
          defaultValues={{ depPeriod: defaultPeriod }}
          submitLabel={batchDepMutation.isPending ? "جارٍ الإهلاك..." : "إهلاك جميع الأصول"}
          onSubmit={async (values) => {
            const res = await batchDepMutation.mutateAsync({ period: values.depPeriod });
            setBatchResult(res);
          }}
        >
          <div className="max-w-md">
            <FormTextField name="depPeriod" label="الفترة (سنة-شهر)" type="month" />
          </div>
        </FormShell>

        {batchResult && (
          <div className="bg-status-success-surface p-4 rounded-lg border border-status-success-surface space-y-1">
            <p className="font-semibold text-status-success-foreground">{batchResult.message}</p>
            <p className="text-sm text-muted-foreground">معالج: {batchResult.processed} | تخطي: {batchResult.skipped}</p>
          </div>
        )}
      </div>
    </CreatePageLayout>
  );
}
