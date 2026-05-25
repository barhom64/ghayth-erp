import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Workflow, AlertCircle, History } from "lucide-react";

const DOC_TYPES = [
  { value: "invoice",         label: "فاتورة مبيعات" },
  { value: "credit_memo",     label: "إشعار دائن" },
  { value: "debit_memo",      label: "إشعار مدين" },
  { value: "purchase_order",  label: "أمر شراء" },
  { value: "purchase_request",label: "طلب شراء" },
  { value: "grn",             label: "إيصال استلام (GRN)" },
  { value: "supplier_invoice",label: "فاتورة مورد" },
  { value: "expense",         label: "مصروف" },
  { value: "payment",         label: "سند صرف" },
  { value: "receipt",         label: "سند قبض" },
  { value: "journal_entry",   label: "قيد يدوي" },
];

const ACTIVITY_TYPES = [
  "transport", "equipment_rental", "property_rental", "umrah",
  "contracting", "services", "trading", "other",
];

const ENTITY_TYPES = [
  "vehicle", "property", "unit", "project", "contract",
  "employee", "driver", "umrah_agent", "umrah_season", "asset",
];

const CC_STRATEGIES = [
  { value: "from_vehicle",      label: "من المركبة" },
  { value: "from_property",     label: "من العقار" },
  { value: "from_unit",         label: "من الوحدة" },
  { value: "from_project",      label: "من المشروع" },
  { value: "from_employee",     label: "من الموظف" },
  { value: "from_contract",     label: "من العقد" },
  { value: "from_umrah_agent",  label: "من مرشد العمرة" },
  { value: "from_umrah_season", label: "من موسم العمرة" },
  { value: "explicit",          label: "صريح (محدد في القاعدة)" },
  { value: "none",              label: "بدون مركز تكلفة" },
];

interface AllocationRule {
  id: number;
  name: string;
  documentType: string;
  lineType: string | null;
  activityType: string | null;
  entityType: string | null;
  revenueAccountId: number | null;
  expenseAccountId: number | null;
  inventoryAccountId: number | null;
  assetAccountId: number | null;
  vatAccountId: number | null;
  debitAccountId: number | null;
  creditAccountId: number | null;
  costCenterStrategy: string | null;
  autoCreateMissing: boolean;
  requiresEntityLink: boolean;
  priority: number;
  isActive: boolean;
  conditionsJson: any;
  dimensionStrategyJson: any;
  createdAt: string | null;
  updatedAt: string | null;
}

export default function AllocationRuleEdit() {
  const [, params] = useRoute<{ id: string }>("/finance/allocation-rules/:id/edit");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: existing, isLoading, isError } = useApiQuery<AllocationRule>(
    ["allocation-rule-detail", id ?? ""],
    id ? `/finance/allocation-rules/${id}` : null,
    !!id,
  );

  const patchMut = useApiMutation(
    `/finance/allocation-rules/${id}`, "PATCH",
    [["allocation-rules"], ["allocation-rule-detail", id ?? ""]],
  );

  const [form, setForm] = useState({
    name: "",
    documentType: "invoice",
    lineType: "",
    activityType: "",
    entityType: "",
    costCenterStrategy: "none",
    autoCreateMissing: false,
    requiresEntityLink: false,
    priority: 100,
    isActive: true,
  });

  const { fieldErrors, validate, setApiError } = useFieldErrors();

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name ?? "",
      documentType: existing.documentType ?? "invoice",
      lineType: existing.lineType ?? "",
      activityType: existing.activityType ?? "",
      entityType: existing.entityType ?? "",
      costCenterStrategy: existing.costCenterStrategy ?? "none",
      autoCreateMissing: !!existing.autoCreateMissing,
      requiresEntityLink: !!existing.requiresEntityLink,
      priority: Number(existing.priority ?? 100),
      isActive: existing.isActive ?? true,
    });
  }, [existing]);

  if (isLoading) return <LoadingSpinner />;
  if (isError || !existing) return <ErrorState />;

  const handleSubmit = async () => {
    const firstError = validate({
      name: form.name.trim() ? null : "اسم القاعدة مطلوب",
      documentType: form.documentType ? null : "نوع المستند مطلوب",
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }

    try {
      await patchMut.mutateAsync({
        name: form.name,
        documentType: form.documentType,
        lineType: form.lineType || null,
        activityType: form.activityType || null,
        entityType: form.entityType || null,
        costCenterStrategy: form.costCenterStrategy === "none" ? null : form.costCenterStrategy,
        autoCreateMissing: form.autoCreateMissing,
        requiresEntityLink: form.requiresEntityLink,
        priority: form.priority,
        isActive: form.isActive,
      });
      toast({ title: "تم حفظ التعديلات" });
      setLocation("/finance/allocation-rules");
    } catch (err: any) {
      setApiError(err);
      toast({
        variant: "destructive",
        title: "تعذّر الحفظ",
        description: err?.fix ?? getErrorMessage(err),
      });
    }
  };

  const accountSummary: string[] = [];
  if (existing.revenueAccountId) accountSummary.push(`R:${existing.revenueAccountId}`);
  if (existing.expenseAccountId) accountSummary.push(`E:${existing.expenseAccountId}`);
  if (existing.assetAccountId) accountSummary.push(`A:${existing.assetAccountId}`);
  if (existing.inventoryAccountId) accountSummary.push(`I:${existing.inventoryAccountId}`);
  if (existing.vatAccountId) accountSummary.push(`V:${existing.vatAccountId}`);
  if (existing.debitAccountId) accountSummary.push(`DR:${existing.debitAccountId}`);
  if (existing.creditAccountId) accountSummary.push(`CR:${existing.creditAccountId}`);

  return (
    <CreatePageLayout title={`تعديل قاعدة التوجيه #${id}`} backPath="/finance/allocation-rules">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Workflow className="h-4 w-4" /> تعديل القاعدة
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            تعديل القاعدة يطبق على المستندات الجديدة فقط — لا يُعيد توجيه القرارات
            القديمة (تجدها في <code className="bg-muted px-1 rounded">/finance/allocation-results</code>).
            القاعدة المعطّلة لا تُحذف من السجل بل تتجاوزها الـ resolver.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="اسم القاعدة" required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          error={fieldErrors.name}
        />

        <FormFieldWrapper label="نوع المستند" required error={fieldErrors.documentType}>
          <Select value={form.documentType} onValueChange={(v) => setForm((f) => ({ ...f, documentType: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <TextField
          label="نوع البند (lineType)"
          value={form.lineType}
          onChange={(v) => setForm((f) => ({ ...f, lineType: v }))}
          placeholder="اختياري"
        />

        <FormFieldWrapper label="نوع النشاط">
          <Select value={form.activityType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, activityType: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— أي نشاط —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— أي نشاط —</SelectItem>
              {ACTIVITY_TYPES.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="نوع الكيان المطلوب">
          <Select value={form.entityType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, entityType: v === "_none" ? "" : v }))}>
            <SelectTrigger><SelectValue placeholder="— أي كيان —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— أي كيان —</SelectItem>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <NumberField
          label="الأولوية (الأقل = أسبق)"
          value={form.priority}
          onChange={(v) => setForm((f) => ({ ...f, priority: Number(v) || 100 }))}
          min={1}
          max={9999}
        />
      </div>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الحسابات المرتبطة (read-only)</CardTitle>
        </CardHeader>
        <CardContent>
          {accountSummary.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">لا توجد حسابات مرتبطة بهذه القاعدة.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {accountSummary.map((a) => (
                <Badge key={a} variant="outline" className="font-mono text-[10px]">{a}</Badge>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              تغيير الحسابات يتم عبر <code className="bg-muted px-1 rounded">PATCH /finance/allocation-rules/{id}</code> مباشرة
              — الـ wizard المتقدم follow-up.
            </span>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">السلوك + مركز التكلفة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormFieldWrapper label="استراتيجية مركز التكلفة">
            <Select value={form.costCenterStrategy} onValueChange={(v) => setForm((f) => ({ ...f, costCenterStrategy: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CC_STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormFieldWrapper>

          <div className="flex items-center gap-3 mt-6">
            <Switch
              id="requiresEntityLink"
              checked={form.requiresEntityLink}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requiresEntityLink: v }))}
            />
            <Label htmlFor="requiresEntityLink" className="text-sm">
              يتطلب كياناً مرتبطاً (يمنع الاعتماد لو مفقود)
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="autoCreateMissing"
              checked={form.autoCreateMissing}
              onCheckedChange={(v) => setForm((f) => ({ ...f, autoCreateMissing: v }))}
            />
            <Label htmlFor="autoCreateMissing" className="text-sm">
              إنشاء الحساب/المركز تلقائياً عند عدم الوجود
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
            <Label htmlFor="isActive" className="text-sm">
              قاعدة نشطة
            </Label>
          </div>
        </CardContent>
      </Card>

      {(existing.createdAt || existing.updatedAt) && (
        <Card className="mt-4 bg-muted/30">
          <CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2">
            <History className="h-3.5 w-3.5" />
            {existing.createdAt && <span>أُنشئت: {new Date(existing.createdAt).toLocaleString("ar-SA")}</span>}
            {existing.updatedAt && existing.updatedAt !== existing.createdAt && (
              <span>· آخر تعديل: {new Date(existing.updatedAt).toLocaleString("ar-SA")}</span>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/allocation-rules")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={patchMut.isPending} rateLimitAware>
          {patchMut.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
