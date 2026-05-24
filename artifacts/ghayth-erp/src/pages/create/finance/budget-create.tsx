import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const now = new Date();
const DEFAULT_PERIOD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

const schema = z.object({
  accountCode: z.string().min(1, "يرجى اختيار الحساب"),
  period: z
    .string()
    .min(1, "الفترة مطلوبة")
    .refine((v) => {
      const year = parseInt(v.split("-")[0], 10);
      return !isNaN(year) && year >= 2020 && year <= 2040;
    }, "السنة يجب أن تكون بين 2020 و 2040"),
  amount: z
    .string()
    .min(1, "المبلغ مطلوب")
    .refine((v) => Number(v) >= 0, "المبلغ يجب أن يكون صفر أو أكثر"),
});

export default function BudgetCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/budget", "POST", [["budget"]]);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );
  const accounts = accountsData?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const accountOptions = accounts.map((a: any) => ({
    value: String(a.code || a.id),
    label: `${a.code} - ${a.name}`,
  }));

  return (
    <CreatePageLayout title="إضافة بند ميزانية" backPath="/finance/budget">
      <CreationDateField />
      <FormShell
        schema={schema}
        defaultValues={{ accountCode: "", period: DEFAULT_PERIOD, amount: "" }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/budget")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            accountCode: values.accountCode,
            period: values.period,
            amount: Number(values.amount),
          });
          toast({ title: "تم إضافة بند الميزانية بنجاح" });
          setLocation("/finance/budget");
        }}
      >
        <FormGrid cols={2}>
          <FormSelectField
            name="accountCode"
            label="الحساب"
            required
            options={accountOptions}
            placeholder="اختر الحساب"
          />
          <FormTextField name="period" label="الفترة" required type="month" />
          <FormNumberField name="amount" label="المبلغ المخصص" required step="0.01" min="0" />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
