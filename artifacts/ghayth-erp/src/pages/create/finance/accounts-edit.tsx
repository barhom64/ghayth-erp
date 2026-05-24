import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, apiPatch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreatePageLayout,
  FormShell,
  FormGrid,
  FormTextField,
  FormSelectField,
} from "@workspace/ui-core";

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
  type: z.string(),
});

function HydrateFromAccount({ account }: { account: any }) {
  const { reset } = useFormContext();
  useEffect(() => {
    if (account) {
      reset({
        name: account.name || "",
        code: account.code || "",
        type: account.type || "asset",
      });
    }
  }, [account, reset]);
  return null;
}

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
        schema={schema}
        defaultValues={{
          name: account.name || "",
          code: account.code || "",
          type: account.type || "asset",
        }}
        submitLabel="حفظ التعديلات"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/finance/accounts")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await apiPatch(`/finance/accounts/${params?.id}`, { name: values.name, type: values.type });
          toast({ title: "تم تحديث الحساب" });
          qc.invalidateQueries({ queryKey: ["accounts"] });
          setLocation("/finance/accounts");
        }}
      >
        <HydrateFromAccount account={account} />
        <FormGrid cols={2}>
          <FormTextField name="name" label="اسم الحساب" required />
          <FormTextField name="code" label="رمز الحساب" disabled description="رمز الحساب غير قابل للتعديل بعد الإنشاء" />
          <FormSelectField name="type" label="النوع" options={TYPE_OPTIONS} />
        </FormGrid>
      </FormShell>
    </CreatePageLayout>
  );
}
