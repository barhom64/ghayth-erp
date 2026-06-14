import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Field = "clientId" | "clientSegment" | "productId" | "productCategory" | "quantity" | "date";
type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between";
type ActionType = "fixed_price" | "percent_discount" | "amount_discount" | "formula";

interface Cond { field: Field; operator: Operator; value: string }

const FIELD_LABELS: Record<Field, string> = {
  clientId: "معرف العميل",
  clientSegment: "شريحة العميل",
  productId: "معرف المنتج",
  productCategory: "فئة المنتج",
  quantity: "الكمية",
  date: "التاريخ",
};

const OP_LABELS: Record<Operator, string> = {
  eq: "يساوي", neq: "لا يساوي",
  gt: "أكبر من", gte: "أكبر أو يساوي",
  lt: "أقل من", lte: "أقل أو يساوي",
  in: "ضمن قائمة", between: "بين (مدى)",
};

const ACTION_LABELS: Record<ActionType, string> = {
  fixed_price: "سعر ثابت",
  percent_discount: "خصم نسبة %",
  amount_discount: "خصم مبلغ",
  formula: "صيغة محسوبة",
};

interface RuleDetail {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  status: "active" | "inactive";
  logicOp: "AND" | "OR";
  conditions: Array<{ field: Field; operator: Operator; value: string }>;
  action: { actionType: ActionType; value: string; formula: string | null } | null;
}

export default function PricingRuleEditor() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute<{ id: string }>("/finance/pricing-rules/:id/edit");
  const isEdit = Boolean(match);
  const ruleId = match ? Number(params!.id) : null;
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("10");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [logicOp, setLogicOp] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<Cond[]>([]);
  const [actionType, setActionType] = useState<ActionType>("percent_discount");
  const [actionValue, setActionValue] = useState("0");
  const [formula, setFormula] = useState("");

  const { data: existing } = useApiQuery<{ data: RuleDetail }>(
    ["pricing-rule", String(ruleId)],
    isEdit ? `/finance/pricing/rules/${ruleId}` : "",
    { enabled: isEdit },
  );

  useEffect(() => {
    const r = existing?.data;
    if (!r) return;
    setName(r.name);
    setDescription(r.description ?? "");
    setPriority(String(r.priority));
    setValidFrom(r.validFrom ? r.validFrom.slice(0, 10) : "");
    setValidTo(r.validTo ? r.validTo.slice(0, 10) : "");
    setStatus(r.status);
    setLogicOp(r.logicOp);
    setConditions(r.conditions.map((c) => ({
      field: c.field, operator: c.operator,
      value: typeof c.value === "string" ? c.value : JSON.stringify(c.value),
    })));
    if (r.action) {
      setActionType(r.action.actionType);
      setActionValue(String(r.action.value));
      setFormula(r.action.formula ?? "");
    }
  }, [existing]);

  const createMut = useApiMutation("/finance/pricing/rules", "POST", [["pricing-rules"]]);
  const updateMut = useApiMutation<any, any>(
    () => `/finance/pricing/rules/${ruleId}`, "PUT", [["pricing-rules"]],
  );

  const submit = async () => {
    if (!name.trim()) { toast({ variant: "destructive", title: "اسم القاعدة مطلوب" }); return; }
    let body: any;
    try {
      body = {
        name: name.trim(),
        description: description.trim() || null,
        priority: Number(priority) || 0,
        validFrom: validFrom || null,
        validTo: validTo || null,
        status, logicOp,
        conditions: conditions.map((c) => ({
          field: c.field, operator: c.operator,
          value: parseConditionValue(c.operator, c.value),
        })),
        action: {
          actionType,
          value: actionType === "formula" ? 0 : Number(actionValue),
          formula: actionType === "formula" ? formula : null,
        },
      };
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "قيمة شرط غير صالحة" });
      return;
    }
    try {
      if (isEdit) await updateMut.mutateAsync(body);
      else await createMut.mutateAsync(body);
      toast({ title: isEdit ? "تم تحديث القاعدة" : "تم إنشاء القاعدة" });
      navigate("/finance/pricing-rules");
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الحفظ" });
    }
  };

  const addCond = () => setConditions([...conditions, { field: "clientSegment", operator: "eq", value: "" }]);
  const updCond = (i: number, patch: Partial<Cond>) =>
    setConditions(conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const delCond = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <PageShell
      title={isEdit ? "تعديل قاعدة تسعير" : "إنشاء قاعدة تسعير"}
      subtitle="حدد الشروط والنتيجة. عند التعارض، تُطبَّق القاعدة ذات الأولوية الأعلى."
      breadcrumbs={[
        { href: "/finance/pricing-rules", label: "قواعد التسعير" },
        { label: isEdit ? "تعديل" : "إنشاء" },
      ]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir="rtl">
        <div>
          <label className="text-sm mb-1 block">اسم القاعدة *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm mb-1 block">الأولوية (الأعلى يفوز عند التعارض)</label>
          <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm mb-1 block">الوصف</label>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="text-sm mb-1 block">تبدأ من</label>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-sm mb-1 block">تنتهي في</label>
          <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
        <div>
          <label className="text-sm mb-1 block">الحالة</label>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">مفعّلة</SelectItem>
              <SelectItem value="inactive">موقوفة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm mb-1 block">منطق دمج الشروط</label>
          <Select value={logicOp} onValueChange={(v: any) => setLogicOp(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">جميع الشروط (AND)</SelectItem>
              <SelectItem value="OR">أي شرط (OR)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="p-4 mt-6" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">الشروط</h3>
          <Button variant="outline" size="sm" onClick={addCond}>
            <Plus className="w-4 h-4 ml-1" /> إضافة شرط
          </Button>
        </div>
        {conditions.length === 0 && (
          <div className="text-sm text-muted-foreground">
            بدون شروط = القاعدة تنطبق على جميع البنود ضمن فترة صلاحيتها.
          </div>
        )}
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Select value={c.field} onValueChange={(v: any) => updCond(i, { field: v })}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_LABELS).map(([k, v]) =>
                    <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={c.operator} onValueChange={(v: any) => updCond(i, { operator: v })}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OP_LABELS).map(([k, v]) =>
                    <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="col-span-5"
                placeholder={
                  c.operator === "between" ? 'مدى مثل [5,10]'
                  : c.operator === "in" ? 'قائمة مثل ["vip","gold"]'
                  : "القيمة"
                }
                value={c.value}
                onChange={(e) => updCond(i, { value: e.target.value })}
              />
              <Button variant="ghost" size="sm" className="col-span-1" onClick={() => delCond(i)}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 mt-4" dir="rtl">
        <h3 className="font-semibold mb-3">النتيجة</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm mb-1 block">نوع التسعير</label>
            <Select value={actionType} onValueChange={(v: any) => setActionType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_LABELS).map(([k, v]) =>
                  <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {actionType !== "formula" ? (
            <div>
              <label className="text-sm mb-1 block">القيمة</label>
              <Input type="number" value={actionValue} onChange={(e) => setActionValue(e.target.value)} />
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="text-sm mb-1 block">الصيغة (basePrice / quantity / Math)</label>
              <Input
                placeholder="مثال: basePrice * (quantity >= 10 ? 0.85 : 1)"
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
          <Badge variant="outline">معاينة</Badge>
          استخدم بطاقة المعاينة في صفحة القائمة لاختبار سيناريو "ماذا لو" بعد الحفظ.
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2 mt-6" dir="rtl">
        <Button variant="outline" onClick={() => navigate("/finance/pricing-rules")} disabled={isPending}>
          إلغاء
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "جارٍ الحفظ..." : (isEdit ? "حفظ التعديلات" : "إنشاء القاعدة")}
        </Button>
      </div>
    </PageShell>
  );
}

function parseConditionValue(op: Operator, raw: string): unknown {
  const trimmed = raw.trim();
  if (op === "in" || op === "between") {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error("القيمة يجب أن تكون قائمة JSON مثل [1,2]");
      if (op === "between" && parsed.length !== 2) throw new Error("between تحتاج عنصرين فقط");
      return parsed;
    } catch (e: any) {
      throw new Error(e?.message || "صيغة JSON غير صحيحة");
    }
  }
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(trimmed) ? n : trimmed;
}
