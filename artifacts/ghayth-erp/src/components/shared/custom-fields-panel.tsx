import { useState, useEffect } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SlidersHorizontal } from "lucide-react";

/**
 * #2719 — لوحة عرض/تحرير الحقول المخصّصة لصفّ كيان. مكوّن مشترك:
 * يُسقَط في أي صفحة تفاصيل كيان بـ entityType + entityId. يخفي نفسه إن لم
 * تُعرَّف حقول لهذا الكيان (لا ضجيج). يستهلك /custom-fields/values.
 */
interface CFRow {
  fieldId: number;
  fieldKey: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  value: string | null;
}

export function CustomFieldsPanel({ entityType, entityId }: { entityType: string; entityId: number | string }) {
  const { toast } = useToast();
  const { data, isLoading, refetch } = useApiQuery<{ data: CFRow[] }>(
    ["custom-field-values", entityType, String(entityId)],
    entityId ? `/custom-fields/values?entityType=${entityType}&entityId=${entityId}` : null,
  );
  const fields = data?.data ?? [];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[String(f.fieldId)] = f.value ?? "";
    setVals(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // لا حقول مخصّصة معرّفة لهذا الكيان → لا تعرض شيئًا.
  if (isLoading || fields.length === 0) return null;

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/custom-fields/values", {
        method: "PUT",
        body: JSON.stringify({ entityType, entityId: Number(entityId), values: vals }),
      });
      toast({ title: "تم حفظ الحقول المخصّصة" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e?.message || "تعذّر الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-status-info" /> حقول مخصّصة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => {
            const key = String(f.fieldId);
            return (
              <div key={f.fieldId}>
                <Label className="text-xs">{f.label}{f.required ? " *" : ""}</Label>
                {f.fieldType === "select" ? (
                  <Select value={vals[key] || ""} onValueChange={(v) => setVals({ ...vals, [key]: v })}>
                    <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                    <SelectContent>{(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                ) : f.fieldType === "boolean" ? (
                  <Select value={vals[key] || ""} onValueChange={(v) => setVals({ ...vals, [key]: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">نعم</SelectItem>
                      <SelectItem value="false">لا</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.fieldType === "number" ? "number" : f.fieldType === "date" ? "date" : "text"}
                    value={vals[key] || ""}
                    onChange={(e) => setVals({ ...vals, [key]: e.target.value })}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ الحقول المخصّصة"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
