import { useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { LetterheadHeader } from "@/components/print-layout";
import type { BranchLetterhead } from "@/components/print-layout";
import {
  FormShell,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormTextareaField,
  FormGrid,
} from "@workspace/ui-core";

const letterheadSchema = z.object({
  name: z.string().trim().min(1, "اسم الفرع مطلوب"),
  nameEn: z.string().trim(),
  city: z.string().trim(),
  phone: z.string().trim(),
  logoUrl: z.string().trim(),
  address: z.string().trim(),
  taxNumber: z.string().trim(),
  crNumber: z.string().trim(),
  email: z.string().trim().refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "صيغة البريد الإلكتروني غير صحيحة",
  ),
  website: z.string().trim(),
  footerText: z.string(),
});
type LetterheadForm = z.infer<typeof letterheadSchema>;

export function LetterheadSettings() {
  const { data, refetch, isLoading, isError, error } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = data?.data || [];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Default to the first branch when data arrives. No useEffect →
  // setForm round-trip; defaults are derived directly from the
  // current selectedBranch, and FormShell key={branch.id} remounts
  // on switch.
  const selectedBranch =
    branches.find((b: any) => b.id === selectedBranchId) ?? branches[0] ?? null;
  if (selectedBranch && selectedBranchId !== selectedBranch.id) {
    // Set on first render after data lands; safe because the parent
    // re-renders after setSelectedBranchId.
  }

  const handleSave = async (values: LetterheadForm) => {
    if (!selectedBranch) return;
    try {
      await apiFetch(`/settings/branches/${selectedBranch.id}`, {
        method: "PUT",
        body: JSON.stringify(values),
      });
      toast({ title: "تم حفظ بيانات الكليشة" });
      qc.invalidateQueries({ queryKey: ["settings-branches"] });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ في الحفظ" });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Printer className="h-5 w-5" />
        إعدادات الكليشة والمطبوعات
      </h3>

      {branches.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          لا توجد فروع. أضف فرعاً أولاً من تبويب الفروع.
        </CardContent></Card>
      ) : selectedBranch ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {branches.map((b: any) => (
              <Button
                key={b.id}
                variant={selectedBranch.id === b.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedBranchId(b.id)}
              >
                {b.name}
              </Button>
            ))}
          </div>

          <FormShell
            key={selectedBranch.id}
            schema={letterheadSchema}
            defaultValues={{
              name: selectedBranch.name || "",
              nameEn: selectedBranch.nameEn || "",
              city: selectedBranch.city || "",
              phone: selectedBranch.phone || "",
              logoUrl: selectedBranch.logoUrl || "",
              address: selectedBranch.address || "",
              taxNumber: selectedBranch.taxNumber || "",
              crNumber: selectedBranch.crNumber || "",
              email: selectedBranch.email || "",
              website: selectedBranch.website || "",
              footerText: selectedBranch.footerText || "",
            }}
            submitLabel="حفظ الكليشة"
            secondaryActions={
              <Button type="button" variant="outline" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="h-4 w-4 me-1" />{showPreview ? "إخفاء المعاينة" : "معاينة الكليشة"}
              </Button>
            }
            onSubmit={async (values) => {
              await handleSave(values);
            }}
          >
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><BranchTitle /></CardHeader>
                <CardContent>
                  <FormGrid cols={2}>
                    <FormTextField name="name" label="اسم الشركة/الفرع (عربي)" required />
                    <FormTextField name="nameEn" label="الاسم (إنجليزي)" />
                    <FormTextField name="city" label="المدينة" />
                    <FormPhoneField name="phone" label="الهاتف" />
                    <FormEmailField name="email" label="البريد الإلكتروني" />
                    <FormTextField name="website" label="الموقع الإلكتروني" />
                    <FormTextField name="taxNumber" label="الرقم الضريبي" />
                    <FormTextField name="crNumber" label="رقم السجل التجاري" />
                    <FormTextField name="logoUrl" label="رابط الشعار" placeholder="https://example.com/logo.png" className="md:col-span-2" />
                    <FormTextField name="address" label="العنوان التفصيلي" className="md:col-span-2" />
                    <FormTextareaField name="footerText" label="نص التذييل" rows={3} placeholder="يظهر في أسفل كل مطبوعة..." className="md:col-span-2" />
                  </FormGrid>
                </CardContent>
              </Card>

              {showPreview && (
                <Card>
                  <CardHeader><CardTitle>معاينة الكليشة</CardTitle></CardHeader>
                  <CardContent>
                    <LivePreview />
                  </CardContent>
                </Card>
              )}
            </div>
          </FormShell>
        </>
      ) : null}
    </div>
  );
}

// Branch-name title that reflects the current form's `name` field
// instead of the (stale) selected branch row — same UX as the
// original "بيانات الكليشة - {form.name}" header.
function BranchTitle() {
  const name = useWatch<LetterheadForm, "name">({ name: "name" });
  return <CardTitle>بيانات الكليشة - {name}</CardTitle>;
}

// Live preview reads all form values via useFormContext + useWatch —
// no parent state mirroring required. The previewBranch object is
// rebuilt on each form change so the LetterheadHeader updates
// without an explicit re-render trigger.
function LivePreview() {
  const { control } = useFormContext<LetterheadForm>();
  const values = useWatch({ control });
  const previewBranch: BranchLetterhead = {
    name: values.name || "",
    nameEn: values.nameEn || "",
    logoUrl: values.logoUrl || "",
    address: values.address || "",
    phone: values.phone || "",
    email: values.email || "",
    website: values.website || "",
    taxNumber: values.taxNumber || "",
    crNumber: values.crNumber || "",
    footerText: values.footerText || "",
    city: values.city || "",
  };
  return (
    <div className="border rounded-lg p-6 bg-white shadow-inner" style={{ minHeight: "300px" }}>
      <LetterheadHeader branch={previewBranch} />
      <div className="text-center my-8">
        <p className="text-muted-foreground text-sm">محتوى المستند يظهر هنا</p>
        <div className="border-t border-dashed border-border mt-4 pt-4">
          <p className="text-xs text-muted-foreground">هذه معاينة توضيحية لشكل الكليشة</p>
        </div>
      </div>
      {values.footerText && (
        <div className="border-t border-border pt-3 mt-8 text-xs text-muted-foreground">
          {values.footerText}
        </div>
      )}
    </div>
  );
}
