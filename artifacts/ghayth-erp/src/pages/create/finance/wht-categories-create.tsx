import { useLocation } from "wouter";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { AccountIdSelect } from "@/components/shared/entity-selects";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CreatePageLayout } from "@workspace/ui-core";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";
import { Switch } from "@/components/ui/switch";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Textarea } from "@/components/ui/textarea";

/**
 * WHT Category creator.
 *
 * Selecting "appliesTo" snaps the rate to the ZATCA default
 * (royalties / technical 15%, management 20%, everything else 5%).
 * Operator can still override for treaty-rate suppliers.
 */

const APPLIES_TO = [
  { value: "royalties",          label: "إتاوات",          defaultRate: 15 },
  { value: "technical_services", label: "خدمات فنية",      defaultRate: 15 },
  { value: "management_fees",    label: "أتعاب إدارة",     defaultRate: 20 },
  { value: "dividends",          label: "أرباح موزعة",     defaultRate:  5 },
  { value: "interest",           label: "فوائد",            defaultRate:  5 },
  { value: "rent_movable",       label: "تأجير منقولات",   defaultRate:  5 },
  { value: "telecommunications", label: "اتصالات",          defaultRate:  5 },
  { value: "air_tickets",        label: "تذاكر طيران",     defaultRate:  5 },
  { value: "freight",            label: "شحن",              defaultRate:  5 },
  { value: "insurance_premium",  label: "أقساط تأمين",     defaultRate:  5 },
  { value: "other",              label: "أخرى",             defaultRate:  5 },
] as const;

type AppliesTo = (typeof APPLIES_TO)[number]["value"];

const DRAFT_KEY = "finance_wht_categories_create";
const INITIAL = {
  code: "",
  name: "",
  nameEn: "",
  rate: 15,
  appliesTo: "technical_services" as AppliesTo,
  payableAccountId: "",
  description: "",
  isActive: true,
};

export default function WhtCategoriesCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation(
    "/finance/wht-categories", "POST",
    [["wht-categories"]],
  );
  const { form, setForm, clearDraft, hasDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleAppliesToChange = (v: string) => {
    const cfg = APPLIES_TO.find((x) => x.value === v);
    setForm((f) => ({
      ...f,
      appliesTo: v as AppliesTo,
      rate: cfg?.defaultRate ?? f.rate,
    }));
  };

  const handleSubmit = async () => {
    const firstError = validate({
      code: form.code.trim() ? null : "الرمز مطلوب",
      name: form.name.trim() ? null : "الاسم بالعربية مطلوب",
      rate: form.rate < 0 || form.rate > 100 ? "النسبة يجب أن تكون بين 0 و 100" : null,
    });
    if (firstError) {
      toast({ variant: "destructive", title: firstError });
      return;
    }
    try {
      await createMut.mutateAsync({
        ...form,
        payableAccountId: form.payableAccountId ? Number(form.payableAccountId) : null,
        nameEn: form.nameEn.trim() || null,
        description: form.description.trim() || null,
      });
      clearDraft();
      toast({ title: "تم إضافة فئة الاستقطاع" });
      setLocation("/finance/wht-categories");
    } catch (err: any) {
      setApiError(err);
      toast({ variant: "destructive", title: "حدث خطأ", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  return (
    <CreatePageLayout title="إضافة فئة استقطاع" backPath="/finance/wht-categories">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-status-warning-foreground h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextField
          label="الرمز" required dir="ltr"
          value={form.code}
          onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
          placeholder="WHT-TEC15"
          error={fieldErrors.code}
        />
        <TextField
          label="الاسم بالعربية" required
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="استقطاع خدمات فنية 15%"
          error={fieldErrors.name}
        />
        <TextField
          label="الاسم بالإنجليزية" dir="ltr"
          value={form.nameEn}
          onChange={(v) => setForm((f) => ({ ...f, nameEn: v }))}
          placeholder="WHT — Technical Services 15%"
        />

        <FormFieldWrapper label="ينطبق على">
          <Select value={form.appliesTo} onValueChange={handleAppliesToChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPLIES_TO.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label} ({a.defaultRate}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper label="النسبة %" error={fieldErrors.rate}>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={100} step={0.01}
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))}
              dir="ltr"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <span className="text-muted-foreground text-sm">%</span>
          </div>
        </FormFieldWrapper>

        <FormFieldWrapper label="حساب الاستقطاع المستحق لزاتكا (دائن)">
          <AccountIdSelect
            value={form.payableAccountId}
            onChange={(v) => setForm((f) => ({ ...f, payableAccountId: v }))}
            label="" allowCreate={false}
            filter={(a: any) => a.type === "liability" || String(a.code).startsWith("23")}
          />
        </FormFieldWrapper>

        <div className="md:col-span-2">
          <FormFieldWrapper label="الوصف (اختياري)">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="مثال: خدمات استشارية / فنية / مهنية لغير المقيمين"
              rows={2}
            />
          </FormFieldWrapper>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <Switch
            checked={form.isActive}
            onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            id="isActive"
          />
          <Label htmlFor="isActive">نشط (متاح للاختيار في الدفعات)</Label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/finance/wht-categories")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={createMut.isPending} rateLimitAware>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
