import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Trash2, Pencil, SlidersHorizontal } from "lucide-react";

/**
 * #2719 — مدير الحقول المخصّصة. لكل نوع كيان: عرّف حقولًا إضافية (نص/رقم/تاريخ/
 * نعم-لا/قائمة) تظهر لاحقًا في صفحات ذلك الكيان عبر لوحة العرض المشتركة.
 * يستهلك /custom-fields/definitions (settings RBAC).
 */
const ENTITY_TYPES = [
  { value: "client", label: "عميل" },
  { value: "vendor", label: "مورّد" },
  { value: "project", label: "مشروع" },
  { value: "vehicle", label: "مركبة" },
  { value: "employee", label: "موظف" },
  { value: "property_unit", label: "وحدة عقارية" },
  { value: "legal_case", label: "قضية قانونية" },
  { value: "opportunity", label: "فرصة بيع" },
];
const FIELD_TYPES = [
  { value: "text", label: "نص" },
  { value: "number", label: "رقم" },
  { value: "date", label: "تاريخ" },
  { value: "boolean", label: "نعم / لا" },
  { value: "select", label: "قائمة اختيار" },
];
const emptyForm = { fieldKey: "", label: "", fieldType: "text", options: "", required: false, sortOrder: 0 };

export function CustomFieldsTab() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState("client");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["custom-field-defs", entityType],
    `/custom-fields/definitions?entityType=${entityType}`,
  );
  const defs = data?.data || [];

  const reset = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };
  const createMut = useApiMutation<any, any>("/custom-fields/definitions", "POST", [["custom-field-defs", entityType]], {
    onSuccess: () => { reset(); refetch(); toast({ title: "تمت إضافة الحقل" }); },
  });
  const updateMut = useApiMutation<any, any>((b) => `/custom-fields/definitions/${b.__id}`, "PATCH", [["custom-field-defs", entityType]], {
    onSuccess: () => { reset(); refetch(); toast({ title: "تم تعديل الحقل" }); },
  });
  const deleteMut = useApiMutation<any, any>((b) => `/custom-fields/definitions/${b.id}`, "DELETE", [["custom-field-defs", entityType]], {
    onSuccess: () => { refetch(); toast({ title: "تم حذف الحقل" }); },
  });

  const submit = () => {
    if (!form.fieldKey || !form.label) { toast({ variant: "destructive", title: "المفتاح والتسمية مطلوبان" }); return; }
    if (form.fieldType === "select" && !String(form.options).trim()) { toast({ variant: "destructive", title: "قائمة الاختيار تتطلب خيارات" }); return; }
    const payload: any = {
      entityType, fieldKey: form.fieldKey, label: form.label, fieldType: form.fieldType,
      required: !!form.required, sortOrder: Number(form.sortOrder) || 0,
      options: form.fieldType === "select" ? String(form.options).split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };
    if (editingId) updateMut.mutate({ ...payload, __id: editingId });
    else createMut.mutate(payload);
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setForm({ fieldKey: d.fieldKey, label: d.label, fieldType: d.fieldType, options: (d.options || []).join(", "), required: !!d.required, sortOrder: d.sortOrder || 0 });
    setShowForm(true);
  };

  const columns: DataTableColumn<any>[] = [
    { key: "label", header: "التسمية", render: (d) => <span className="font-medium">{d.label}</span> },
    { key: "fieldKey", header: "المفتاح", render: (d) => <span className="font-mono text-xs text-muted-foreground">{d.fieldKey}</span> },
    { key: "fieldType", header: "النوع", render: (d) => FIELD_TYPES.find((t) => t.value === d.fieldType)?.label || d.fieldType },
    { key: "required", header: "إلزامي", render: (d) => d.required ? <Badge>نعم</Badge> : <span className="text-muted-foreground">لا</span> },
    {
      key: "__a", header: "إجراءات", render: (d) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => startEdit(d)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" className="text-status-error" onClick={() => deleteMut.mutate({ id: d.id })} title="حذف"><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <SlidersHorizontal className="w-5 h-5 text-status-info" /> الحقول المخصّصة
      </h3>
      <p className="text-sm text-muted-foreground">عرّف حقولًا إضافية لكل نوع كيان دون تعديل النظام — تظهر في صفحات ذلك الكيان.</p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm">الكيان:</Label>
          <Select value={entityType} onValueChange={(v) => { setEntityType(v); reset(); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <GuardedButton perm="settings:create" size="sm" onClick={() => { if (showForm) reset(); else { setEditingId(null); setForm(emptyForm); setShowForm(true); } }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />حقل جديد</>}
        </GuardedButton>
      </div>

      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">المفتاح التقني *</Label>
            <Input value={form.fieldKey} disabled={!!editingId} onChange={(e) => setForm({ ...form, fieldKey: e.target.value })} placeholder="preferred_contact" dir="ltr" />
          </div>
          <div>
            <Label className="text-xs">التسمية *</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="وسيلة التواصل المفضّلة" />
          </div>
          <div>
            <Label className="text-xs">النوع</Label>
            <Select value={form.fieldType} onValueChange={(v) => setForm({ ...form, fieldType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الترتيب</Label>
            <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </div>
          {form.fieldType === "select" && (
            <div className="md:col-span-2">
              <Label className="text-xs">الخيارات (مفصولة بفاصلة)</Label>
              <Input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="خيار 1, خيار 2, خيار 3" />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} className="h-4 w-4" /> حقل إلزامي
          </label>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>إلغاء</Button>
            <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{editingId ? "تحديث" : "حفظ"}</Button>
          </div>
        </CardContent></Card>
      )}

      {isLoading ? <LoadingSpinner /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
        <DataTable data={defs} rowKey={(r) => String(r.id)} columns={columns} emptyMessage="لا توجد حقول مخصّصة لهذا الكيان بعد" />
      )}
    </div>
  );
}
