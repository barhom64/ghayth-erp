import { useState } from "react";
import { useApiQuery, asList, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Plus, X, Pencil, Trash2, CheckCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export function CompaniesTab() {
  const { refreshFilters } = useAppContext();
  const { data, refetch } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", nameEn: "", taxNumber: "", crNumber: "" });
  const [lastBootstrapOps, setLastBootstrapOps] = useState<string[] | null>(null);
  const items = asList(data);

  const resetForm = () => {
    setForm({ name: "", nameEn: "", taxNumber: "", crNumber: "" });
    setEditingId(null);
    setShowForm(false);
    setLastBootstrapOps(null);
  };

  const handleEdit = (item: any) => {
    setForm({
      name: item.name || "",
      nameEn: item.nameEn || "",
      taxNumber: item.taxNumber || "",
      crNumber: item.crNumber || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "خطأ", description: "اسم الشركة مطلوب", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      if (editingId) {
        await apiFetch(`/settings/companies/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({ title: "تم التعديل", description: "تم تعديل بيانات الشركة بنجاح" });
        resetForm();
      } else {
        const result = await apiFetch<any>("/settings/companies", {
          method: "POST",
          body: JSON.stringify(form),
        });
        setLastBootstrapOps(result.operations || null);
        toast({
          title: "تمت إضافة الشركة بنجاح",
          description: `تم إعداد ${result.operations?.length || 0} إعداد تلقائي`,
        });
        setShowForm(false);
        setForm({ name: "", nameEn: "", taxNumber: "", crNumber: "" });
      }
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/settings/companies/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحذف", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          إدارة الشركات
        </h3>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />شركة جديدة</>}
        </Button>
      </div>

      {lastBootstrapOps && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-800 mb-2">تم إنشاء الشركة مع كامل الإعدادات الافتراضية</p>
                <div className="flex flex-wrap gap-1.5">
                  {lastBootstrapOps.map((op, i) => (
                    <Badge key={i} className="bg-green-100 text-green-700 border-green-200 text-xs">{op}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {editingId ? <Pencil className="h-4 w-4" /> : <Zap className="h-4 w-4 text-blue-600" />}
              {editingId ? "تعديل بيانات الشركة" : "إنشاء شركة جديدة (تهيئة تلقائية)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>اسم الشركة (عربي) <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: شركة الفيصل التجارية" />
            </div>
            <div>
              <Label>اسم الشركة (إنجليزي)</Label>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="Al-Faisal Trading Co." />
            </div>
            <div>
              <Label>الرقم الضريبي</Label>
              <Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} placeholder="300000000000003" />
            </div>
            <div>
              <Label>رقم السجل التجاري</Label>
              <Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} placeholder="1010000000" />
            </div>
            {!editingId && (
              <div className="md:col-span-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-sm text-blue-700 font-medium mb-1 flex items-center gap-1.5">
                  <Zap className="h-4 w-4" />
                  سيتم إنشاء ما يلي تلقائياً:
                </p>
                <p className="text-xs text-blue-600">
                  فرع افتراضي، 10 أنواع إجازات، 3 ورديات، 5 سلاسل موافقات، 6 مكونات رواتب، 26 حساباً محاسبياً، 6 أدوار، 8 بادئات ترقيم، سلم عقوبات، 120+ إعداد
                </p>
              </div>
            )}
            <div className="md:col-span-2">
              <Button onClick={handleSave} disabled={creating}>
                {creating ? "جاري الإنشاء..." : (editingId ? "تحديث الشركة" : "إنشاء الشركة")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-right">اسم الشركة</th>
              <th className="p-3 text-right">الرقم الضريبي</th>
              <th className="p-3 text-right">السجل التجاري</th>
              <th className="p-3 text-start w-24">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">
                  {item.name}
                  {item.nameEn && <span className="text-gray-400 text-xs me-2 block">{item.nameEn}</span>}
                </td>
                <td className="p-3 text-gray-500">{item.taxNumber || "-"}</td>
                <td className="p-3 text-gray-500">{item.crNumber || "-"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { if (confirm("تحذير: حذف الشركة سيؤثر على جميع البيانات المرتبطة بها. هل أنت متأكد؟")) handleDelete(item.id); }}
                      disabled={deleting === item.id}
                      title="حذف"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد شركات مضافة</td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
