import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, Save, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PageShell } from "@/components/page-shell";
import { HOLIDAY_TYPES, HOLIDAY_COLORS, MONTHS_AR } from "@/lib/hr-type-maps";
import { DatePicker } from "@/components/ui/date-picker";

export default function PublicHolidaysPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", type: "national", description: "", isRecurring: false });

  const { data, isLoading } = useApiQuery<any>(["public-holidays", String(year)], `/hr/public-holidays?year=${year}`);
  const holidays = asList(data?.data || data);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: "", startDate: "", endDate: "", type: "national", description: "", isRecurring: false });
  };

  const updateMut = useApiMutation<any, typeof form & { id: number }>(
    (body) => `/hr/public-holidays/${body.id}`,
    "PATCH",
    [["public-holidays"]],
    { successMessage: "تم تحديث العطلة", onSuccess: resetForm }
  );
  const createMut = useApiMutation<any, typeof form>(
    "/hr/public-holidays",
    "POST",
    [["public-holidays"]],
    { successMessage: "تم إضافة العطلة", onSuccess: resetForm }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/hr/public-holidays/${body.id}`,
    "DELETE",
    [["public-holidays"]],
    { successMessage: "تم الحذف" }
  );

  const handleSave = () => {
    if (!form.name || !form.startDate) { toast({ title: "الاسم والتاريخ مطلوبان", variant: "destructive" }); return; }
    if (editingId) {
      updateMut.mutate({ ...form, id: editingId });
    } else {
      createMut.mutate(form);
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("حذف هذه العطلة؟")) return;
    deleteMut.mutate({ id });
  };

  const handleEdit = (h: any) => {
    setEditingId(h.id);
    setForm({ name: h.name, startDate: h.startDate?.split("T")[0] || "", endDate: h.endDate?.split("T")[0] || "", type: h.type || "national", description: h.description || "", isRecurring: h.isRecurring || false });
    setShowForm(true);
  };

  const groupedByMonth = MONTHS_AR.reduce((acc, m, idx) => {
    const monthNum = idx + 1;
    const items = holidays.filter((h: any) => {
      const d = new Date(h.startDate);
      return d.getMonth() + 1 === monthNum;
    });
    if (items.length > 0) acc[m] = items;
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <PageShell
      title="تقويم الإجازات الرسمية"
      subtitle="إدارة العطل الرسمية والأيام المميزة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "تقويم الإجازات الرسمية" }]}
      loading={isLoading}
      actions={
        <>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: "", startDate: "", endDate: "", type: "national", description: "", isRecurring: false }); }} size="sm">
            <Plus className="w-4 h-4 me-1" /> إضافة عطلة
          </Button>
        </>
      }
    >
      {showForm && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{editingId ? "تعديل عطلة" : "إضافة عطلة جديدة"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>اسم العطلة *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: اليوم الوطني" />
              </div>
              <div>
                <Label>النوع</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(HOLIDAY_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تاريخ البداية *</Label>
                <DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
              </div>
              <div>
                <Label>تاريخ النهاية</Label>
                <DatePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
              </div>
              <div className="col-span-2">
                <Label>الوصف</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف اختياري" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave}><Save className="w-4 h-4 me-1" /> حفظ</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}><X className="w-4 h-4 me-1" /> إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-gray-400">جاري التحميل...</div>
      ) : holidays.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-gray-400">لا توجد عطل لهذا العام</CardContent></Card>
      ) : (
        Object.entries(groupedByMonth).map(([month, items]) => (
          <Card key={month}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-500">{month}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((h: any) => {
                const start = new Date(h.startDate);
                const end = new Date(h.endDate || h.startDate);
                const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1);
                return (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {start.getDate()}
                      </div>
                      <div>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-gray-500">
                          {h.startDate?.split("T")[0]} {h.endDate && h.endDate !== h.startDate ? `← ${h.endDate?.split("T")[0]}` : ""} ({days} {days === 1 ? "يوم" : "أيام"})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={HOLIDAY_COLORS[h.type] || "bg-gray-100 text-gray-700"}>{HOLIDAY_TYPES[h.type] || h.type}</Badge>
                      {h.isRecurring && <Badge className="bg-orange-100 text-orange-700">سنوي</Badge>}
                      <button onClick={() => handleEdit(h)} className="p-1 text-gray-400 hover:text-primary"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(h.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </PageShell>
  );
}
