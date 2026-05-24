import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
} from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";

const TYPE_OPTIONS = [
  { value: "asset", label: "أصول" },
  { value: "liability", label: "خصوم" },
  { value: "equity", label: "حقوق ملكية" },
  { value: "revenue", label: "إيرادات" },
  { value: "expense", label: "مصروفات" },
];

const schema = z.object({
  name: z.string().min(1, "اسم الحساب مطلوب"),
  code: z.string(),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
});

export default function AccountsEdit() {
  const [, params] = useRoute("/finance/accounts/:id/edit");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useApiQuery<any>(["accounts"], "/finance/accounts");
  const items = data?.data || [];
  const account = items.find((a: any) => String(a.id) === params?.id);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;
  if (!account) return <div className="text-center py-16 text-muted-foreground">الحساب غير موجود</div>;

  return (
    <CreatePageLayout
      title={`تعديل الحساب — ${account.code}`}
      subtitle="تعديل بيانات الحساب في شجرة الحسابات"
      backPath="/finance/accounts"
    >
      <FormShell
        key={account.id}
        schema={schema}
        defaultValues={{
          name: account.name || "",
          code: account.code || "",
          type: (account.type as any) || "asset",
        }}
        submitLabel="حفظ التعديلات"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/accounts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          try {
            await apiPatch(`/finance/accounts/${params?.id}`, {
              name: values.name,
              type: values.type,
            });
            toast({ title: "تم تحديث الحساب" });
            qc.invalidateQueries({ queryKey: ["accounts"] });
            setLocation("/finance/accounts");
          } catch (err: any) {
            toast({
              variant: "destructive",
              title: "حدث خطأ أثناء التحديث",
              description: err?.fix ?? err?.message,
            });
          }
        }}
      >
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم الحساب" required />
          <FormTextField
            name="code"
            label="رمز الحساب"
            description="رمز الحساب غير قابل للتعديل بعد الإنشاء"
            disabled
          />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
