import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Audit item #4 — Product/Service catalog write UI. The catalog page
// (finance/product-catalog.tsx) previously only displayed routing info;
// editing required either walking to /warehouse/products/:id or hitting
// `PATCH /warehouse/products/:id` directly. This dialog wraps the same
// PATCH endpoint in a finance-shaped form so the accountant can tune
// accounting defaults (revenue/expense/inventory/asset accounts, tax
// code, activity type, required-dimension flags, cost-center strategy)
// without leaving the catalog.

type AccountRouting = {
  defaultRevenueAccountId: number | null;
  defaultExpenseAccountId: number | null;
  defaultInventoryAccountId: number | null;
  defaultAssetAccountId: number | null;
};

type CatalogRow = AccountRouting & {
  id: number;
  name: string;
  defaultTaxCode: string | null;
  defaultActivityType: string | null;
  requiresVehicle: boolean;
  requiresProperty: boolean;
  requiresProject: boolean;
  requiresContract: boolean;
  requiresUmrahAgent: boolean;
  requiresUmrahSeason: boolean;
  defaultCostCenterStrategy: string | null;
};

const ACTIVITY_TYPES = [
  { value: "transport", label: "نقل" },
  { value: "equipment_rental", label: "تأجير معدات" },
  { value: "property_rental", label: "إيجار عقاري" },
  { value: "umrah", label: "عمرة" },
  { value: "contracting", label: "مقاولات" },
  { value: "services", label: "خدمات عامة" },
  { value: "trading", label: "تجارة" },
  { value: "other", label: "أخرى" },
];

const COST_CENTER_STRATEGIES = [
  { value: "from_vehicle", label: "من المركبة" },
  { value: "from_property", label: "من العقار" },
  { value: "from_unit", label: "من الوحدة" },
  { value: "from_project", label: "من المشروع" },
  { value: "from_employee", label: "من الموظف" },
  { value: "from_contract", label: "من العقد" },
  { value: "from_umrah_agent", label: "من مرشد العمرة" },
  { value: "from_umrah_season", label: "من موسم العمرة" },
  { value: "explicit", label: "صريح (يدخله المستخدم)" },
  { value: "none", label: "بدون" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogRow | null;
  onSaved?: () => void;
}

export function ProductAccountingEditDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { toast } = useToast();
  const mut = useApiMutation<unknown, Partial<CatalogRow>>(
    product ? `/warehouse/products/${product.id}` : "",
    "PATCH",
    [["product-catalog"]],
  );

  const [draft, setDraft] = useState<Partial<CatalogRow>>({});
  useEffect(() => {
    if (product) {
      setDraft({
        defaultRevenueAccountId: product.defaultRevenueAccountId,
        defaultExpenseAccountId: product.defaultExpenseAccountId,
        defaultInventoryAccountId: product.defaultInventoryAccountId,
        defaultAssetAccountId: product.defaultAssetAccountId,
        defaultTaxCode: product.defaultTaxCode,
        defaultActivityType: product.defaultActivityType,
        requiresVehicle: product.requiresVehicle,
        requiresProperty: product.requiresProperty,
        requiresProject: product.requiresProject,
        requiresContract: product.requiresContract,
        requiresUmrahAgent: product.requiresUmrahAgent,
        requiresUmrahSeason: product.requiresUmrahSeason,
        defaultCostCenterStrategy: product.defaultCostCenterStrategy,
      });
    }
  }, [product]);

  if (!product) return null;

  const handleSave = async () => {
    try {
      await mut.mutateAsync(draft);
      toast({ title: "تم تحديث الإعدادات المحاسبية" });
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e?.message || "فشل الحفظ" });
    }
  };

  const setNum = (key: keyof AccountRouting, val: string) => {
    setDraft({ ...draft, [key]: val ? Number(val) : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تحرير التوجيه المحاسبي — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border rounded p-3 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">الحسابات الافتراضية (ID رقمي من شجرة الحسابات)</h3>
            <p className="text-xs text-muted-foreground">
              أدخل المعرّف الرقمي للحساب كما يظهر في شجرة الحسابات (Chart of Accounts).
              اترك الحقل فارغاً لعدم تعيين توجيه افتراضي.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ["defaultRevenueAccountId", "حساب الإيراد"],
                ["defaultExpenseAccountId", "حساب المصروف"],
                ["defaultInventoryAccountId", "حساب المخزون"],
                ["defaultAssetAccountId", "حساب الأصل"],
              ].map(([key, label]) => (
                <FormFieldWrapper key={key} label={label}>
                  <Input
                    type="number"
                    value={draft[key as keyof AccountRouting] != null ? String(draft[key as keyof AccountRouting]) : ""}
                    onChange={(e) => setNum(key as keyof AccountRouting, e.target.value)}
                    placeholder="مثل: 4100"
                    min={1}
                  />
                </FormFieldWrapper>
              ))}
            </div>
          </div>

          <div className="border rounded p-3 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">التصنيف الضريبي / النشاطي</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormFieldWrapper label="رمز الضريبة الافتراضي">
                <Input
                  value={draft.defaultTaxCode ?? ""}
                  onChange={(e) => setDraft({ ...draft, defaultTaxCode: e.target.value || null })}
                  placeholder="مثل: VAT15"
                />
              </FormFieldWrapper>
              <FormFieldWrapper label="نوع النشاط الافتراضي">
                <Select
                  value={draft.defaultActivityType ?? "_none"}
                  onValueChange={(v) => setDraft({ ...draft, defaultActivityType: v === "_none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— بدون —</SelectItem>
                    {ACTIVITY_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>
            </div>
          </div>

          <div className="border rounded p-3 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">الربط الإلزامي (Dimensions)</h3>
            <p className="text-xs text-muted-foreground">
              عندما يختار العميل هذا المنتج في فاتورة، النظام سيرفض الحفظ إن لم تكن الأبعاد المعلَّمة هنا متوفرة.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[
                ["requiresVehicle", "يتطلب مركبة"],
                ["requiresProperty", "يتطلب عقاراً"],
                ["requiresProject", "يتطلب مشروعاً"],
                ["requiresContract", "يتطلب عقداً"],
                ["requiresUmrahAgent", "يتطلب مرشد عمرة"],
                ["requiresUmrahSeason", "يتطلب موسم عمرة"],
              ].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!draft[k as keyof CatalogRow]}
                    onCheckedChange={(v) => setDraft({ ...draft, [k]: v === true })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="border rounded p-3 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">استراتيجية مركز التكلفة</h3>
            <FormFieldWrapper label="من أين يُشتق مركز التكلفة؟">
              <Select
                value={draft.defaultCostCenterStrategy ?? "_none"}
                onValueChange={(v) => setDraft({ ...draft, defaultCostCenterStrategy: v === "_none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— بدون —</SelectItem>
                  {COST_CENTER_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSave} disabled={mut.isPending} rateLimitAware>
            {mut.isPending ? "جاري الحفظ..." : "حفظ التوجيه المحاسبي"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
