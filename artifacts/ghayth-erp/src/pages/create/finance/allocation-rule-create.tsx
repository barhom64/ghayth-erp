import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useApiMutation, useApiQuery, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { TextField, NumberField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { AccountSelect } from "@/components/shared/entity-selects";
import { Workflow, AlertCircle } from "lucide-react";

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

export default function AllocationRuleCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/finance/allocation-rules", "POST", [["allocation-rules"]]);
  // #1945 (FIN-17) — the backend stores numeric *AccountId; AccountSelect emits
  // the account CODE. Resolve code → id so the chosen accounts actually persist
  // (previously every *AccountId was hard-coded undefined → mappings dropped).
  const { data: accountsData } = useApiQuery<{ data: any[] }>(["accounts-list"], "/finance/accounts");
  const accountIdByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accountsData?.data ?? []) if (a?.code != null) m.set(String(a.code), Number(a.id));
    return m;
  }, [accountsData]);
  const idFor = (code: string) => (code ? accountIdByCode.get(code) : undefined);

  const [form, setForm] = useState({
    name: "",
    documentType: "invoice",
    lineType: "",
    activityType: "",
    entityType: "",
    revenueAccountCode: "",
    expenseAccountCode: "",
    inventoryAccountCode: "",
    assetAccountCode: "",
    vatAccountCode: "",
    debitAccountCode: "",
    creditAccountCode: "",
    costCenterStrategy: "none",
    autoCreateMissing: false,
    requiresEntityLink: false,
    priority: 100,
    isActive: true,
  });

  const { fieldErrors, validate, setApiError } = useFieldErrors();

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
      await createMut.mutateAsync({
        name: form.name,
        documentType: form.documentType,
        lineType: form.lineType || undefined,
        activityType: form.activityType || undefined,
        entityType: form.entityType || undefined,
        // Resolve the chosen account CODES → numeric ids the backend stores.
        revenueAccountId: idFor(form.revenueAccountCode),
        expenseAccountId: idFor(form.expenseAccountCode),
        inventoryAccountId: idFor(form.inventoryAccountCode),
        assetAccountId: idFor(form.assetAccountCode),
        vatAccountId: idFor(form.vatAccountCode),
        debitAccountId: idFor(form.debitAccountCode),
        creditAccountId: idFor(form.creditAccountCode),
        costCenterStrategy: form.costCenterStrategy === "none" ? null : form.costCenterStrategy,
        autoCreateMissing: form.autoCreateMissing,
        requiresEntityLink: form.requiresEntityLink,
        priority: form.priority,
        isActive: form.isActive,
        // Conditions / dimension strategy as opaque JSON — for now empty
        // until the admin needs them. The wizard for advanced conditions
        // is a follow-up.
        conditionsJson: undefined,
        dimensionStrategyJson: undefined,
      });
      toast({ title: "تم إنشاء قاعدة التوجيه" });
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

  return (
    <CreatePageLayout title="قاعدة توجيه محاسبي جديدة" backPath="/finance/allocation-rules">
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Workflow className="h-4 w-4" /> كيف يطبق الـ resolver القاعدة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عند حفظ مستند مالي، الـ resolver يفحص كل قاعدة بترتيب الـ priority.
            أول قاعدة تطابق <strong>documentType</strong> + (lineType إن وُجد) +
            (activityType إن وُجد) + (entityType إن وُجد) تُطبَّق، فيقرأ الحساب
            ومركز التكلفة من القاعدة ويُعبَّأ في البند. لو <strong>requiresEntityLink=true</strong>
            وما في كيان مرتبط، الـ resolver يضع status=unmapped ويمنع الاعتماد.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="اسم القاعدة" required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="مثال: نقل رمل → إيرادات النقل + cc المركبة"
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
          placeholder="اختياري — مثال: service / inventory / fixed_asset"
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
          <CardTitle className="text-sm">الحسابات المُستخدَمة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormFieldWrapper label="حساب الإيراد (Revenue)">
            <AccountSelect value={form.revenueAccountCode} onChange={(v) => setForm((f) => ({ ...f, revenueAccountCode: v }))} label="" allowCreate={false} />
          </FormFieldWrapper>
          <FormFieldWrapper label="حساب المصروف (Expense)">
            <AccountSelect value={form.expenseAccountCode} onChange={(v) => setForm((f) => ({ ...f, expenseAccountCode: v }))} label="" allowCreate={false} />
          </FormFieldWrapper>
          <FormFieldWrapper label="حساب المخزون (Inventory)">
            <AccountSelect value={form.inventoryAccountCode} onChange={(v) => setForm((f) => ({ ...f, inventoryAccountCode: v }))} label="" allowCreate={false} />
          </FormFieldWrapper>
          <FormFieldWrapper label="حساب الأصول (Asset)">
            <AccountSelect value={form.assetAccountCode} onChange={(v) => setForm((f) => ({ ...f, assetAccountCode: v }))} label="" allowCreate={false} />
          </FormFieldWrapper>
          <FormFieldWrapper label="حساب الضريبة (VAT)">
            <AccountSelect value={form.vatAccountCode} onChange={(v) => setForm((f) => ({ ...f, vatAccountCode: v }))} label="" allowCreate={false} />
          </FormFieldWrapper>
        </CardContent>
        <CardContent className="border-t pt-3 text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            الـ resolver يختار الحساب المناسب حسب اتجاه القيد (مدين/دائن) ونوع المستند.
            ضع الحسابات اللي يحتاجها هذا النوع من المستند فقط.
          </span>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">استراتيجية مركز التكلفة + إعدادات السلوك</CardTitle>
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
            <p className="text-[10px] text-muted-foreground mt-1">
              مثال: "من المركبة" → الـ resolver يلقى cost center النشط للمركبة المختارة.
            </p>
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
              قاعدة نشطة (الـ resolver يستشيرها)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 bg-status-warning-surface/30 border-status-warning-surface">
        <CardContent className="p-3 text-xs text-status-warning-foreground">
          ⓘ هذا الـ Form يدعم القواعد البسيطة (الحسابات المختارة أعلاه تُحفظ فعليًا الآن).
          للشروط المتقدمة مع
          <code className="bg-white border px-1 mx-1 rounded">conditionsJson</code> أو
          <code className="bg-white border px-1 mx-1 rounded">dimensionStrategyJson</code>،
          استخدم الـ API مباشرة <code className="bg-white border px-1 mx-1 rounded">POST /finance/allocation-rules</code>.
          الـ wizard المتقدم — follow-up PR.
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/allocation-rules")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ القاعدة"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
