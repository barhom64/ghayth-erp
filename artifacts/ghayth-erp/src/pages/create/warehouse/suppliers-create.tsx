// PR-3 (#2163) — wrapper split: /warehouse/suppliers/create
// المسار المالك: warehouse — يستهلك /warehouse/suppliers (POST)
// بصلاحية warehouse.inventory:create.
import { useState } from "react";
import { useLocation } from "wouter";
import { useApiMutation } from "@/lib/api";
import { CreatePageLayout } from "@workspace/ui-core";
import { TextField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { useFieldErrors } from "@/hooks/use-field-errors";

const DRAFT_KEY = "warehouse_suppliers_create";
const INITIAL = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  taxNumber: "",
  paymentTerms: "",
};

export default function WarehouseSupplierCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createMut = useApiMutation("/warehouse/suppliers", "POST", [["warehouse-suppliers"]]);
  const { form, setForm, clearDraft } = useAutoDraft(DRAFT_KEY, INITIAL);
  const { fieldErrors, validate, setApiError } = useFieldErrors();

  const handleSubmit = async () => {
    const errors = validate({ name: form.name });
    if (errors) return;
    try {
      await createMut.mutateAsync({
        name: form.name.trim(),
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        taxNumber: form.taxNumber || null,
        paymentTerms: form.paymentTerms ? Number(form.paymentTerms) : undefined,
      });
      clearDraft();
      toast({ title: "تم إضافة المورد" });
      setLocation("/warehouse/suppliers");
    } catch (err: any) {
      setApiError(err);
      toast({ title: err?.message || "فشل الحفظ", variant: "destructive" });
    }
  };

  return (
    <CreatePageLayout title="إضافة مورد مستودعي جديد" backPath="/warehouse/suppliers">
      <div className="space-y-4 max-w-lg">
        <div>
          <Label>اسم المورد *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="اسم المورد"
            className="mt-1"
          />
          {fieldErrors.name && <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p>}
        </div>
        <div>
          <Label>الشخص المسؤول</Label>
          <Input
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>الهاتف</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>البريد الإلكتروني</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
          </div>
        </div>
        <div>
          <Label>العنوان</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>الرقم الضريبي</Label>
            <Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>شروط الدفع (أيام)</Label>
            <Input
              type="number"
              min={0}
              placeholder="30"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => setLocation("/warehouse/suppliers")}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "جارٍ الحفظ..." : "إضافة مورد"}
          </Button>
        </div>
      </div>
    </CreatePageLayout>
  );
}
