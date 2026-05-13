import { useState } from "react";
import { z } from "zod";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch, Plus, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  FormShell,
  FormTextField,
  FormNumberField,
  FormSelectField,
  FormGrid,
} from "@/components/form-shell";

const entityTypes = [
  { value: "leave", label: "الإجازات" },
  { value: "purchase_request", label: "طلبات الشراء" },
  { value: "expense", label: "المصروفات" },
  { value: "general_request", label: "الطلبات العامة" },
];

// Old: minAmount tracked as plain number, maxAmount as `number | null`
// with manual `e.target.value ? Number(...) : null` coercion in onChange.
// New: zod coerces both. Convention: maxAmount = 0 means "no upper
// bound" — the submit handler maps 0 → null when sending to the API.
const approvalChainSchema = z
  .object({
    chainType: z.enum(["leave", "purchase_request", "expense", "general_request"]),
    name: z.string().trim(),
    minAmount: z.coerce.number({ invalid_type_error: "أدخل رقمًا" }).min(0, "الحد الأدنى لا يقل عن 0"),
    maxAmount: z.coerce.number({ invalid_type_error: "أدخل رقمًا" }).min(0, "الحد الأقصى لا يقل عن 0"),
  })
  .refine(
    (v) => v.maxAmount === 0 || v.maxAmount > v.minAmount,
    { path: ["maxAmount"], message: "الحد الأقصى يجب أن يكون 0 (بدون حد) أو أكبر من الحد الأدنى" },
  );
type ApprovalChainForm = z.infer<typeof approvalChainSchema>;
const defaultApprovalChain: ApprovalChainForm = {
  chainType: "leave",
  name: "",
  minAmount: 0,
  maxAmount: 0,
};

export function ApprovalWorkflowsTab() {
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["approval-config"], "/settings/approval-config");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const chains = data?.data || [];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleSubmit = async (values: ApprovalChainForm) => {
    try {
      await apiFetch("/settings/approval-config", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          // 0 means "no upper bound" — the API expects null, not 0.
          maxAmount: values.maxAmount === 0 ? null : values.maxAmount,
          name: values.name || entityTypes.find((e) => e.value === values.chainType)?.label,
        }),
      });
      toast({ title: "تمت إضافة سلسلة الموافقة" });
      setShowForm(false);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/settings/approval-config/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const grouped = entityTypes.map(et => ({
    ...et,
    chains: chains.filter((c: any) => c.chainType === et.value).sort((a: any, b: any) => (a.minAmount ?? 0) - (b.minAmount ?? 0)),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          سلاسل الموافقة
        </h3>
        <GuardedButton perm="settings:create" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مرحلة</>}
        </GuardedButton>
      </div>

      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            schema={approvalChainSchema}
            defaultValues={defaultApprovalChain}
            submitLabel="حفظ"
            secondaryActions={
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            }
            onSubmit={async (values, ctx) => {
              await handleSubmit(values);
              ctx.reset();
            }}
          >
            <FormGrid cols={2}>
              <FormSelectField name="chainType" label="نوع الطلب" options={entityTypes} />
              <FormTextField name="name" label="التسمية (اختياري)" placeholder="مثال: موافقة المدير" />
              <FormNumberField name="minAmount" label="الحد الأدنى للمبلغ" required />
              <FormNumberField name="maxAmount" label="الحد الأقصى للمبلغ (0 = بلا حد)" />
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}

      {grouped.map((group) => (
        <Card key={group.value}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {group.chains.length > 0 ? (
              <div className="space-y-2">
                {group.chains.map((chain: any, idx: number) => (
                  <div key={chain.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="w-8 h-8 rounded-full bg-status-info-surface flex items-center justify-center text-status-info-foreground text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{chain.name || `سلسلة ${idx + 1}`}</span>
                      {(chain.minAmount > 0 || chain.maxAmount) && (
                        <span className="text-xs text-muted-foreground ms-2">
                          ({chain.minAmount ?? 0} - {chain.maxAmount ?? "∞"})
                        </span>
                      )}
                    </div>
                    {idx < group.chains.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                    <GuardedButton perm="settings:create" variant="ghost" size="sm" className="text-status-error hover:text-status-error-foreground" onClick={() => handleDelete(chain.id)}>
                      <Trash2 className="h-4 w-4" />
                    </GuardedButton>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-3">لا توجد مراحل موافقة محددة — سيتم الموافقة مباشرة</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
