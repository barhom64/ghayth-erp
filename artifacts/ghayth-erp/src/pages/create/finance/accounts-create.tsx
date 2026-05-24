import { useLocation } from "wouter";
import { z } from "zod";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { useFormContext, Controller } from "react-hook-form";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Autocomplete } from "@/components/ui/autocomplete";
import {
  CreatePageLayout,
  CreationDateField,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
  FormSwitchField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const TYPE_OPTIONS = [
  { value: "asset", label: "أصول" },
  { value: "liability", label: "خصوم" },
  { value: "equity", label: "حقوق ملكية" },
  { value: "revenue", label: "إيرادات" },
  { value: "expense", label: "مصروفات" },
];

const NATURE_OPTIONS = [
  { value: "debit", label: "مدين" },
  { value: "credit", label: "دائن" },
];

const schema = z.object({
  code: z.string().min(1, "الرمز مطلوب"),
  name: z.string().min(1, "الاسم مطلوب"),
  nameEn: z.string().optional(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentCode: z.string().optional(),
  nature: z.enum(["debit", "credit"]),
  allowPosting: z.boolean(),
  isAnalytical: z.boolean(),
});

// Local wrapper for the parent-account autocomplete (it has a custom
// `options` API not shared with the generic entity-selects).
function ParentAccountField({ accounts }: { accounts: any[] }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name="parentCode"
      render={({ field }) => (
        <div className="space-y-1.5">
          <Label htmlFor="parentCode">الحساب الأب</Label>
          <Autocomplete
            value={(field.value as string) ?? ""}
            onChange={(v) => field.onChange(String(v))}
            options={accounts.map((a: any) => ({
              value: String(a.code),
              label: `${a.code} - ${a.name}`,
            }))}
            placeholder="ابحث عن حساب أب..."
            emptyMessage="لا توجد حسابات"
          />
        </div>
      )}
    />
  );
}

export default function AccountsCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/accounts", "POST", [
    ["accounts"],
    ["accounts-list"],
    ["accounts-posting"],
  ]);
  const { data: accountsData, isLoading, isError } = useApiQuery<{ data: any[] }>(
    ["accounts-list"],
    "/finance/accounts",
  );
  const accounts = accountsData?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  return (
    <CreatePageLayout title="إضافة حساب جديد" backPath="/finance/accounts">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <CreationDateField />
      </div>
      <FormShell
        schema={schema}
        defaultValues={{
          code: "",
          name: "",
          nameEn: "",
          type: "asset",
          parentCode: "",
          nature: "debit",
          allowPosting: true,
          isAnalytical: false,
        }}
        submitLabel={createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/accounts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values, { setFieldError }) => {
          try {
            await createMut.mutateAsync(values);
            toast({ title: "تم إضافة الحساب" });
            setLocation("/finance/accounts");
          } catch (err: any) {
            // Server validation errors are auto-routed via FormShell;
            // top-level error needs a manual toast.
            const msg = err?.fix ?? getErrorMessage(err);
            toast({ variant: "destructive", title: "حدث خطأ", description: msg });
            if (err?.field) {
              setFieldError(err.field as any, msg);
            }
          }
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="code" label="الرمز" required placeholder="1100" />
          <FormTextField name="name" label="الاسم" required />
          <FormTextField name="nameEn" label="الاسم بالإنجليزية" placeholder="Account Name" />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
          <ParentAccountField accounts={accounts} />
          <FormSelectField name="nature" label="الطبيعة" options={NATURE_OPTIONS} />
          <FormSwitchField name="allowPosting" label="يقبل الحركة (ترحيل)" />
          <FormSwitchField name="isAnalytical" label="حساب تحليلي" />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
