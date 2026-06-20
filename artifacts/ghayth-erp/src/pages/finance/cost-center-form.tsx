import { useState } from "react";
import { useApiMutation, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const EMPTY = { code: "", name: "", type: "department", parentId: "", allocatedAmount: "" };

export interface CostCenterFormProps {
  /** Called with the freshly-created cost-center row after a successful save. */
  onCreated: (created: any) => void;
  /** Called when the operator cancels (إلغاء). */
  onCancel: () => void;
}

/**
 * The unified cost-center create form body — shared by the Finance cost-centers
 * management page (`cost-centers.tsx`) and the inline `AllowCreateDrawer` opened
 * from `CostCenterMasterSelect`. Owns its own state + mutation so an inline
 * create is the full form (code + type + name + budget), not a truncated quick-add.
 */
export function CostCenterForm({ onCreated, onCancel }: CostCenterFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const createMut = useApiMutation("/finance/cost-centers", "POST", [["cost-centers"]]);

  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "اسم مركز التكلفة مطلوب" });
      return;
    }
    try {
      const created = await createMut.mutateAsync({
        code: form.code || undefined,
        name: form.name,
        type: form.type,
        parentId: form.parentId ? Number(form.parentId) : null,
        allocatedAmount: form.allocatedAmount ? Number(form.allocatedAmount) : undefined,
      });
      toast({ title: "تم إنشاء مركز التكلفة" });
      onCreated(created);
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر الحفظ", description: getErrorMessage(err) });
    }
  };

  return (
    <div className="grid gap-3 py-2" data-testid="form-cost-center">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">الرمز</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CC-001" />
        </div>
        <div>
          <Label className="text-xs">النوع</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="department">إدارة</SelectItem>
              <SelectItem value="project">مشروع</SelectItem>
              <SelectItem value="vehicle">مركبة</SelectItem>
              <SelectItem value="branch">فرع</SelectItem>
              <SelectItem value="general">عام</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">الاسم *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: نقل قطاع البناء" />
      </div>
      <div>
        <Label className="text-xs">الميزانية المخصصة (اختياري)</Label>
        <Input type="number" value={form.allocatedAmount} onChange={(e) => setForm({ ...form, allocatedAmount: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button onClick={submitCreate} disabled={createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </div>
  );
}
