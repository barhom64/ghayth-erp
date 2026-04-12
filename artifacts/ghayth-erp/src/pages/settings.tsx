import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation, asList, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cog, Building, Users, Building2, ScrollText, Plus, X, Save, Pencil, Trash2, Printer, Eye, Shield, SlidersHorizontal, GitBranch, CheckCircle, Settings2, Workflow, Clock, AlertTriangle, BookOpen, ArrowLeftRight, AlertCircle, Zap, MessageSquare, Link2, WifiOff, Wifi, RefreshCw, ToggleLeft, ToggleRight, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useSettings } from "@/contexts/settings-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { LetterheadHeader } from "@/components/print-layout";
import type { BranchLetterhead } from "@/components/print-layout";
import { useAppContext } from "@/contexts/app-context";

function GeneralSettings() {
  const { data: settingsData, isLoading } = useApiQuery<{ data: { key: string; value: string }[] }>(["settings-general"], "/settings/general");
  const { reload: reloadGlobalSettings } = useSettings();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    companyNameEn: "",
    taxNumber: "",
    crNumber: "",
    phone: "",
    email: "",
    address: "",
    currency: "SAR",
    language: "ar",
    timezone: "Asia/Riyadh",
    calendarMode: "hijri",
  });

  useEffect(() => {
    if (settingsData?.data) {
      const map: Record<string, string> = {};
      for (const r of settingsData.data) {
        map[r.key] = r.value;
      }
      setForm((prev) => ({
        companyName: map.companyName || prev.companyName,
        companyNameEn: map.companyNameEn || prev.companyNameEn,
        taxNumber: map.taxNumber || prev.taxNumber,
        crNumber: map.crNumber || prev.crNumber,
        phone: map.phone || prev.phone,
        email: map.email || prev.email,
        address: map.address || prev.address,
        currency: map.currency || prev.currency,
        language: map.language || prev.language,
        timezone: map.timezone || prev.timezone,
        calendarMode: map.calendarMode || prev.calendarMode,
      }));
    }
  }, [settingsData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/settings/general", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      await reloadGlobalSettings();
      toast({ title: "تم الحفظ", description: "تم حفظ الإعدادات العامة بنجاح" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">الإعدادات العامة</h1>
      <Card><CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>اسم الشركة (عربي)</Label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
        <div><Label>اسم الشركة (إنجليزي)</Label><Input value={form.companyNameEn} onChange={(e) => setForm({ ...form, companyNameEn: e.target.value })} /></div>
        <div><Label>الرقم الضريبي</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} /></div>
        <div><Label>رقم السجل التجاري</Label><Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} /></div>
        <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>البريد الإلكتروني</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>العنوان</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div><Label>العملة</Label><select className="w-full border rounded-md p-2" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="SAR">ريال سعودي (SAR)</option><option value="USD">دولار أمريكي (USD)</option><option value="AED">درهم إماراتي (AED)</option></select></div>
        <div><Label>المنطقة الزمنية</Label><select className="w-full border rounded-md p-2" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}><option value="Asia/Riyadh">الرياض (UTC+3)</option><option value="Asia/Dubai">دبي (UTC+4)</option></select></div>
        <div><Label>التقويم الافتراضي</Label><select className="w-full border rounded-md p-2" value={form.calendarMode} onChange={(e) => setForm({ ...form, calendarMode: e.target.value })}><option value="hijri">هجري</option><option value="gregorian">ميلادي</option><option value="both">كلاهما (هجري وميلادي)</option></select></div>
        <div className="md:col-span-2 pt-2"><Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}</Button></div>
      </CardContent></Card>
    </div>
  );
}

function CrudSection({ title, endpoint, queryKey, fields }: {
  title: string; endpoint: string; queryKey: string; fields: { name: string; label: string; required?: boolean }[];
}) {
  const { data, refetch } = useApiQuery<any>([queryKey], endpoint);
  const createMut = useApiMutation<unknown, Record<string, string>>(endpoint, "POST", [[queryKey]]);
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, ""])));
  const [deleting, setDeleting] = useState<number | null>(null);
  const items = asList(data);

  const resetForm = () => {
    setForm(Object.fromEntries(fields.map((f) => [f.name, ""])));
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (item: any) => {
    const newForm: Record<string, string> = {};
    for (const f of fields) {
      newForm[f.name] = item[f.name] || "";
    }
    setForm(newForm);
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({ title: "تم التعديل", description: `تم تعديل ${title} بنجاح` });
      } else {
        await createMut.mutateAsync(form);
        toast({ title: "تمت الإضافة", description: `تمت إضافة ${title} بنجاح` });
      }
      resetForm();
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف", description: `تم الحذف بنجاح` });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحذف", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة</>}</Button>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.name}><Label>{f.label}</Label><Input value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} /></div>
          ))}
          <div className="md:col-span-2"><Button onClick={handleSave} disabled={createMut.isPending}>{editingId ? "تحديث" : "حفظ"}</Button></div>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">{fields.map((f) => <th key={f.name} className="p-3 text-right">{f.label}</th>)}<th className="p-3 text-start w-24">إجراءات</th></tr></thead>
          <tbody>
            {(Array.isArray(items) ? items : []).map((item: any, idx: number) => (
              <tr key={item.id || idx} className="border-b hover:bg-gray-50">
                {fields.map((f) => <td key={f.name} className="p-3">{item[f.name] || "-"}</td>)}
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("هل أنت متأكد من الحذف؟")) handleDelete(item.id); }} disabled={deleting === item.id} title="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(!Array.isArray(items) || items.length === 0) && <tr><td colSpan={fields.length + 1} className="p-8 text-center text-gray-400">لا توجد بيانات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function BranchesTab() {
  const { refreshFilters } = useAppContext();
  const { data: companiesResp } = useApiQuery<any>(["settings-companies"], "/settings/companies");
  const companies = asList(companiesResp);
  const { data, refetch } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | "">( "");
  const [form, setForm] = useState({ name: "", nameEn: "", city: "", phone: "", companyId: "" });
  const items = asList(data);
  const filteredItems = filterCompanyId
    ? items.filter((b: any) => b.companyId === filterCompanyId)
    : items;

  const resetForm = () => {
    setForm({ name: "", nameEn: "", city: "", phone: "", companyId: companies[0]?.id?.toString() || "" });
    setEditingId(null);
    setShowForm(false);
  };

  useEffect(() => {
    if (companies.length > 0 && !form.companyId) {
      setForm((f) => ({ ...f, companyId: companies[0]?.id?.toString() || "" }));
    }
  }, [companies]);

  const handleEdit = (item: any) => {
    setForm({
      name: item.name || "",
      nameEn: item.nameEn || "",
      city: item.city || "",
      phone: item.phone || "",
      companyId: item.companyId?.toString() || "",
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "خطأ", description: "اسم الفرع مطلوب", variant: "destructive" });
      return;
    }
    try {
      if (editingId) {
        await apiFetch(`/settings/branches/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        toast({ title: "تم التعديل", description: "تم تعديل الفرع بنجاح" });
      } else {
        await apiFetch("/settings/branches", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast({ title: "تمت الإضافة", description: "تمت إضافة الفرع بنجاح" });
      }
      resetForm();
      refetch();
      refreshFilters();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشلت العملية", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/settings/branches/${id}`, { method: "DELETE" });
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
          <Building className="h-5 w-5" />
          إدارة الفروع
        </h3>
        <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />فرع جديد</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{editingId ? "تعديل الفرع" : "إضافة فرع جديد"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>الشركة <span className="text-red-500">*</span></Label>
              <select
                className="w-full border rounded-md p-2"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              >
                <option value="">اختر شركة</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>اسم الفرع (عربي) <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: الفرع الرئيسي - الرياض" />
            </div>
            <div>
              <Label>اسم الفرع (إنجليزي)</Label>
              <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="الفرع الرئيسي — الرياض" />
            </div>
            <div>
              <Label>المدينة</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="الرياض" />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+966 11 xxx xxxx" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={handleSave}>{editingId ? "تحديث الفرع" : "إضافة الفرع"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {companies.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="shrink-0">تصفية بالشركة:</Label>
          <select
            className="border rounded-md p-1.5 text-sm"
            value={filterCompanyId}
            onChange={(e) => setFilterCompanyId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">جميع الشركات</option>
            {companies.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="p-3 text-right">اسم الفرع</th>
              {companies.length > 1 && <th className="p-3 text-right">الشركة</th>}
              <th className="p-3 text-right">المدينة</th>
              <th className="p-3 text-right">الهاتف</th>
              <th className="p-3 text-start w-24">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item: any) => (
              <tr key={item.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">
                  {item.name}
                  {item.nameEn && <span className="text-gray-400 text-xs me-2 block">{item.nameEn}</span>}
                </td>
                {companies.length > 1 && (
                  <td className="p-3 text-gray-500">
                    {companies.find((c: any) => c.id === item.companyId)?.name || "-"}
                  </td>
                )}
                <td className="p-3 text-gray-500">{item.city || "-"}</td>
                <td className="p-3 text-gray-500">{item.phone || "-"}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { if (confirm("هل أنت متأكد من حذف هذا الفرع؟ سيؤثر ذلك على جميع البيانات المرتبطة به.")) handleDelete(item.id); }}
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
            {filteredItems.length === 0 && (
              <tr><td colSpan={companies.length > 1 ? 5 : 4} className="p-8 text-center text-gray-400">لا توجد فروع</td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function CompaniesTab() {
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
              {editingId ? "تعديل بيانات الشركة" : "إنشاء شركة جديدة (مع Bootstrap تلقائي)"}
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

function LetterheadSettings() {
  const { data, refetch } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = data?.data || [];
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", nameEn: "", city: "", phone: "",
    logoUrl: "", address: "", taxNumber: "", crNumber: "",
    email: "", website: "", footerText: "",
  });
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (branches.length > 0 && !selectedBranchId) {
      selectBranch(branches[0]);
    }
  }, [branches]);

  const selectBranch = (branch: any) => {
    setSelectedBranchId(branch.id);
    setForm({
      name: branch.name || "",
      nameEn: branch.nameEn || "",
      city: branch.city || "",
      phone: branch.phone || "",
      logoUrl: branch.logoUrl || "",
      address: branch.address || "",
      taxNumber: branch.taxNumber || "",
      crNumber: branch.crNumber || "",
      email: branch.email || "",
      website: branch.website || "",
      footerText: branch.footerText || "",
    });
  };

  const handleSave = async () => {
    if (!selectedBranchId) return;
    setSaving(true);
    try {
      await apiFetch(`/settings/branches/${selectedBranchId}`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toast({ title: "تم حفظ بيانات الكليشة" });
      qc.invalidateQueries({ queryKey: ["settings-branches"] });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ في الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  const previewBranch: BranchLetterhead = {
    name: form.name,
    nameEn: form.nameEn,
    logoUrl: form.logoUrl,
    address: form.address,
    phone: form.phone,
    email: form.email,
    website: form.website,
    taxNumber: form.taxNumber,
    crNumber: form.crNumber,
    footerText: form.footerText,
    city: form.city,
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Printer className="h-5 w-5" />
        إعدادات الكليشة والمطبوعات
      </h3>

      {branches.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">
          لا توجد فروع. أضف فرعاً أولاً من تبويب الفروع.
        </CardContent></Card>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {branches.map((b: any) => (
              <Button
                key={b.id}
                variant={selectedBranchId === b.id ? "default" : "outline"}
                size="sm"
                onClick={() => selectBranch(b)}
              >
                {b.name}
              </Button>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>بيانات الكليشة - {form.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><Label>اسم الشركة/الفرع (عربي)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>الاسم (إنجليزي)</Label><Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></div>
                  <div><Label>المدينة</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>البريد الإلكتروني</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>الموقع الإلكتروني</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
                  <div><Label>الرقم الضريبي</Label><Input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} /></div>
                  <div><Label>رقم السجل التجاري</Label><Input value={form.crNumber} onChange={(e) => setForm({ ...form, crNumber: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>رابط الشعار (URL)</Label><Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" /></div>
                  <div className="md:col-span-2"><Label>العنوان التفصيلي</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                  <div className="md:col-span-2"><Label>نص التذييل</Label><textarea className="w-full border rounded-md p-2 h-16" value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} placeholder="يظهر في أسفل كل مطبوعة..." /></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الكليشة"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowPreview(!showPreview)}>
                    <Eye className="h-4 w-4 me-1" />{showPreview ? "إخفاء المعاينة" : "معاينة الكليشة"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {showPreview && (
              <Card>
                <CardHeader><CardTitle>معاينة الكليشة</CardTitle></CardHeader>
                <CardContent>
                  <div className="border rounded-lg p-6 bg-white shadow-inner" style={{ minHeight: "300px" }}>
                    <LetterheadHeader branch={previewBranch} />
                    <div className="text-center my-8">
                      <p className="text-gray-400 text-sm">محتوى المستند يظهر هنا</p>
                      <div className="border-t border-dashed border-gray-300 mt-4 pt-4">
                        <p className="text-xs text-gray-400">هذه معاينة توضيحية لشكل الكليشة</p>
                      </div>
                    </div>
                    {form.footerText && (
                      <div className="border-t border-gray-300 pt-3 mt-8 text-xs text-gray-500">
                        {form.footerText}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SystemControlsTab() {
  const { data, refetch } = useApiQuery<any>(["system-controls"], "/settings/system-controls");
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const controls = data?.data || {};

  const [form, setForm] = useState({
    "approval.require_notes_on_reject": true,
    "approval.require_notes_on_return": true,
    "approval.max_return_count": 3,
    "approval.auto_escalate_hours": 48,
    "system.allow_self_approval": false,
    "system.notifications_enabled": true,
    "system.attachment_max_size_mb": 5,
    "system.attachment_max_count": 10,
  });

  useEffect(() => {
    if (data?.data) {
      setForm((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (controls[key] !== undefined) {
            (next as any)[key] = controls[key];
          }
        }
        return next;
      });
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/settings/system-controls", { method: "PUT", body: JSON.stringify(form) });
      toast({ title: "تم حفظ الإعدادات" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    } finally {
      setSaving(false);
    }
  };

  const settingsGroups = [
    {
      title: "إعدادات الموافقات",
      icon: CheckCircle,
      items: [
        { key: "approval.require_notes_on_reject", label: "إلزام كتابة سبب عند الرفض", type: "toggle" },
        { key: "approval.require_notes_on_return", label: "إلزام كتابة سبب عند الإرجاع", type: "toggle" },
        { key: "approval.max_return_count", label: "الحد الأقصى لعدد مرات الإرجاع", type: "number" },
        { key: "approval.auto_escalate_hours", label: "التصعيد التلقائي بعد (ساعة)", type: "number" },
        { key: "system.allow_self_approval", label: "السماح بالموافقة الذاتية", type: "toggle" },
      ]
    },
    {
      title: "إعدادات النظام",
      icon: Settings2,
      items: [
        { key: "system.notifications_enabled", label: "تفعيل الإشعارات", type: "toggle" },
        { key: "system.attachment_max_size_mb", label: "حجم الملف الأقصى (ميجابايت)", type: "number" },
        { key: "system.attachment_max_count", label: "عدد الملفات الأقصى لكل طلب", type: "number" },
      ]
    }
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5" />
        التحكم بالنظام
      </h3>
      {settingsGroups.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <group.icon className="h-4 w-4" />
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm">{item.label}</span>
                {item.type === "toggle" ? (
                  <button
                    onClick={() => setForm({ ...form, [item.key]: !(form as any)[item.key] })}
                    className={cn(
                      "relative w-11 h-6 rounded-full transition-colors",
                      (form as any)[item.key] ? "bg-green-500" : "bg-gray-300"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                      (form as any)[item.key] ? "start-0.5" : "start-[22px]"
                    )} />
                  </button>
                ) : (
                  <Input
                    type="number"
                    className="w-24 text-center"
                    value={(form as any)[item.key]}
                    onChange={(e) => setForm({ ...form, [item.key]: Number(e.target.value) })}
                    min={0}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <Button onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </Button>
    </div>
  );
}

function RolePermissionsTab() {
  const { data, refetch } = useApiQuery<any>(["role-modules"], "/settings/role-modules");
  const { toast } = useToast();
  const roles = data?.data || [];
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);

  const allModules = [
    { key: "home", label: "الرئيسية" }, { key: "hr", label: "الموارد البشرية" },
    { key: "finance", label: "المالية" }, { key: "fleet", label: "الأسطول" },
    { key: "property", label: "الأملاك" }, { key: "operations", label: "العمليات" },
    { key: "warehouse", label: "المستودعات" }, { key: "governance", label: "الحوكمة" },
    { key: "bi", label: "ذكاء الأعمال" }, { key: "requests", label: "الطلبات" },
    { key: "documents", label: "المستندات" }, { key: "reports", label: "التقارير" },
    { key: "admin", label: "الإدارة" }, { key: "comms", label: "الاتصالات" },
    { key: "legal", label: "القانونية" }, { key: "crm", label: "المبيعات" },
    { key: "marketing", label: "التسويق" }, { key: "store", label: "المتجر" },
    { key: "support", label: "الدعم" }, { key: "settings", label: "الإعدادات" },
    { key: "umrah", label: "العمرة" },
  ];

  const startEdit = (roleKey: string, modules: any) => {
    setEditingRole(roleKey);
    let mods = typeof modules === "string" ? JSON.parse(modules) : modules;
    if (mods && typeof mods === "object" && !Array.isArray(mods) && mods.all === true) {
      mods = allModules.map(m => m.key);
    }
    setEditModules(Array.isArray(mods) ? mods : []);
  };

  const toggleModule = (mod: string) => {
    setEditModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const handleSave = async () => {
    if (!editingRole) return;
    try {
      await apiFetch(`/settings/role-modules/${editingRole}`, {
        method: "PUT",
        body: JSON.stringify({ modules: editModules }),
      });
      toast({ title: "تم تحديث صلاحيات الدور" });
      setEditingRole(null);
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5" />
        صلاحيات الأدوار
      </h3>
      <div className="space-y-3">
        {roles.map((role: any) => {
          let mods = typeof role.modules === "string" ? JSON.parse(role.modules) : role.modules || [];
          if (mods && typeof mods === "object" && !Array.isArray(mods) && mods.all === true) {
            mods = allModules.map(m => m.key);
          }
          const isEditing = editingRole === role.roleKey;

          return (
            <Card key={role.roleKey}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">{role.label}</span>
                    <Badge variant="outline" className="text-xs">{role.roleKey}</Badge>
                    <Badge variant="outline" className="text-xs">مستوى {role.level}</Badge>
                  </div>
                  {!isEditing ? (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(role.roleKey, role.modules)}>
                      <Pencil className="h-4 w-4 me-1" />تعديل
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSave}><Save className="h-4 w-4 me-1" />حفظ</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRole(null)}>إلغاء</Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isEditing ? (
                    allModules.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => toggleModule(m.key)}
                        className={cn(
                          "px-2 py-1 rounded-md text-xs border transition-colors",
                          editModules.includes(m.key)
                            ? "bg-blue-100 text-blue-700 border-blue-300"
                            : "bg-gray-50 text-gray-400 border-gray-200"
                        )}
                      >
                        {m.label}
                      </button>
                    ))
                  ) : (
                    (Array.isArray(mods) ? mods : []).map((m: string) => (
                      <Badge key={m} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                        {allModules.find(am => am.key === m)?.label || m}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {roles.length === 0 && (
          <Card><CardContent className="p-8 text-center text-gray-400">لا توجد أدوار مسندة بعد. قم بإسناد أدوار للمستخدمين من صفحة المدير.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function WorkflowDefinitionsTab() {
  const { data, refetch } = useApiQuery<any>(["workflow-definitions"], "/workflows/definitions");
  const { data: slaData, refetch: refetchSla } = useApiQuery<any>(["sla-definitions"], "/workflows/sla-definitions");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showSlaForm, setShowSlaForm] = useState(false);

  const REQUEST_TYPES = [
    { value: "leave", label: "إجازة" },
    { value: "purchase_request", label: "طلب شراء" },
    { value: "salary_advance", label: "سلفة" },
    { value: "custody", label: "عهدة" },
    { value: "official_letter", label: "خطاب رسمي" },
    { value: "maintenance", label: "صيانة" },
    { value: "financial_claim", label: "مطالبة مالية" },
    { value: "expense", label: "مصروف" },
    { value: "general", label: "طلب عام" },
  ];

  const ROLES = [
    { value: "manager", label: "المدير المباشر" },
    { value: "hr", label: "الموارد البشرية" },
    { value: "finance", label: "المالية" },
    { value: "director", label: "المدير العام" },
    { value: "owner", label: "المالك" },
    { value: "procurement", label: "المشتريات" },
  ];

  const [form, setForm] = useState({
    requestType: "leave",
    requestTypeLabel: "إجازة",
    description: "",
    isReturnable: true,
    enableEscalation: true,
    defaultSlaHours: 48,
    steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }] as { stepName: string; requiredRole: string; slaHours: number; autoApproveOnTimeout: boolean }[],
  });

  const [slaForm, setSlaForm] = useState({
    requestType: "leave",
    warningHours: 24,
    deadlineHours: 48,
    escalationHours: 72,
    autoApproveOnTimeout: false,
    escalateTo: "hr",
  });

  const defs = asList(data?.data ?? data);
  const slas = asList(slaData?.data ?? slaData);

  const resetForm = () => {
    setForm({
      requestType: "leave", requestTypeLabel: "إجازة", description: "",
      isReturnable: true, enableEscalation: true, defaultSlaHours: 48,
      steps: [{ stepName: "موافقة المدير", requiredRole: "manager", slaHours: 48, autoApproveOnTimeout: false }],
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = async (def: any) => {
    try {
      const detail = await apiFetch(`/workflows/definitions/${def.id}`);
      const d = detail as any;
      setForm({
        requestType: d.requestType,
        requestTypeLabel: d.requestTypeLabel,
        description: d.description || "",
        isReturnable: d.isReturnable,
        enableEscalation: d.enableEscalation,
        defaultSlaHours: d.defaultSlaHours,
        steps: (d.steps || []).map((s: any) => ({
          stepName: s.stepName, requiredRole: s.requiredRole,
          slaHours: s.slaHours, autoApproveOnTimeout: s.autoApproveOnTimeout,
        })),
      });
      setEditingId(d.id);
      setShowForm(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await apiFetch(`/workflows/definitions/${editingId}`, {
          method: "PUT", body: JSON.stringify(form),
        });
        toast({ title: "تم التحديث" });
      } else {
        await apiFetch("/workflows/definitions", {
          method: "POST", body: JSON.stringify(form),
        });
        toast({ title: "تمت الإضافة" });
      }
      resetForm();
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا التعريف؟")) return;
    try {
      await apiFetch(`/workflows/definitions/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleSaveSla = async () => {
    try {
      await apiFetch("/workflows/sla-definitions", {
        method: "POST", body: JSON.stringify(slaForm),
      });
      toast({ title: "تم حفظ إعدادات المهلة" });
      setShowSlaForm(false);
      refetchSla();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const addStep = () => {
    setForm({ ...form, steps: [...form.steps, { stepName: "", requiredRole: "hr", slaHours: 48, autoApproveOnTimeout: false }] });
  };

  const removeStep = (idx: number) => {
    setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) });
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const steps = [...form.steps];
    (steps[idx] as any)[field] = value;
    setForm({ ...form, steps });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Workflow className="h-5 w-5" />
          محرك الإجراءات الموحد
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSlaForm(!showSlaForm)}>
            <Clock className="h-4 w-4 me-1" />{showSlaForm ? "إخفاء" : "إعدادات SLA"}
          </Button>
          <Button size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>
            {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />تعريف جديد</>}
          </Button>
        </div>
      </div>

      {showSlaForm && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />إعدادات المهل (SLA)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>نوع الطلب</Label>
                <select className="w-full border rounded-md p-2" value={slaForm.requestType} onChange={(e) => setSlaForm({ ...slaForm, requestType: e.target.value })}>
                  {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div><Label>تنبيه بعد (ساعة)</Label><Input type="number" value={slaForm.warningHours} onChange={(e) => setSlaForm({ ...slaForm, warningHours: Number(e.target.value) })} /></div>
              <div><Label>المهلة القصوى (ساعة)</Label><Input type="number" value={slaForm.deadlineHours} onChange={(e) => setSlaForm({ ...slaForm, deadlineHours: Number(e.target.value) })} /></div>
              <div><Label>تصعيد بعد (ساعة)</Label><Input type="number" value={slaForm.escalationHours} onChange={(e) => setSlaForm({ ...slaForm, escalationHours: Number(e.target.value) })} /></div>
              <div>
                <Label>تصعيد إلى</Label>
                <select className="w-full border rounded-md p-2" value={slaForm.escalateTo} onChange={(e) => setSlaForm({ ...slaForm, escalateTo: e.target.value })}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={slaForm.autoApproveOnTimeout} onChange={(e) => setSlaForm({ ...slaForm, autoApproveOnTimeout: e.target.checked })} className="rounded" />
                  <span className="text-sm">موافقة تلقائية عند التجاوز</span>
                </label>
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSla}><Save className="h-4 w-4 me-1" />حفظ SLA</Button>

            {slas.length > 0 && (
              <div className="border rounded-lg overflow-hidden mt-4">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b"><th className="p-2 text-start">النوع</th><th className="p-2 text-start">تنبيه</th><th className="p-2 text-start">مهلة</th><th className="p-2 text-start">تصعيد</th><th className="p-2 text-start">تصعيد إلى</th><th className="p-2 text-start">تلقائي</th></tr></thead>
                  <tbody>
                    {slas.map((s: any) => (
                      <tr key={s.id} className="border-b">
                        <td className="p-2">{REQUEST_TYPES.find(t => t.value === s.requestType)?.label || s.requestType}</td>
                        <td className="p-2">{s.warningHours}س</td>
                        <td className="p-2">{s.deadlineHours}س</td>
                        <td className="p-2">{s.escalationHours}س</td>
                        <td className="p-2">{ROLES.find(r => r.value === s.escalateTo)?.label || s.escalateTo}</td>
                        <td className="p-2">{s.autoApproveOnTimeout ? "نعم" : "لا"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>نوع الطلب</Label>
                <select className="w-full border rounded-md p-2" value={form.requestType}
                  onChange={(e) => {
                    const t = REQUEST_TYPES.find(r => r.value === e.target.value);
                    setForm({ ...form, requestType: e.target.value, requestTypeLabel: t?.label || e.target.value });
                  }}
                  disabled={!!editingId}
                >
                  {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div><Label>العنوان</Label><Input value={form.requestTypeLabel} onChange={(e) => setForm({ ...form, requestTypeLabel: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>الوصف</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>المهلة الافتراضية (ساعة)</Label><Input type="number" value={form.defaultSlaHours} onChange={(e) => setForm({ ...form, defaultSlaHours: Number(e.target.value) })} /></div>
              <div className="flex items-center gap-6 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isReturnable} onChange={(e) => setForm({ ...form, isReturnable: e.target.checked })} className="rounded" />
                  <span className="text-sm">قابل للإرجاع</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.enableEscalation} onChange={(e) => setForm({ ...form, enableEscalation: e.target.checked })} className="rounded" />
                  <span className="text-sm">تصعيد تلقائي</span>
                </label>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm">خطوات الموافقة</h4>
                <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 me-1" />خطوة</Button>
              </div>
              <div className="space-y-3">
                {form.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">{idx + 1}</div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input placeholder="اسم الخطوة" value={step.stepName} onChange={(e) => updateStep(idx, "stepName", e.target.value)} />
                      <select className="border rounded-md p-2" value={step.requiredRole} onChange={(e) => updateStep(idx, "requiredRole", e.target.value)}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <Input type="number" placeholder="مهلة (ساعة)" value={step.slaHours} onChange={(e) => updateStep(idx, "slaHours", Number(e.target.value))} />
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={step.autoApproveOnTimeout} onChange={(e) => updateStep(idx, "autoApproveOnTimeout", e.target.checked)} className="rounded" />
                        موافقة تلقائية
                      </label>
                    </div>
                    {form.steps.length > 1 && (
                      <Button size="sm" variant="ghost" className="text-red-500 shrink-0" onClick={() => removeStep(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSave}><Save className="h-4 w-4 me-1" />{editingId ? "تحديث" : "حفظ"}</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {defs.map((def: any) => (
          <Card key={def.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold">{def.requestTypeLabel}</span>
                  <Badge variant="outline" className="text-xs">{def.requestType}</Badge>
                  <Badge variant={def.isActive ? "default" : "secondary"} className="text-xs">
                    {def.isActive ? "مفعّل" : "معطّل"}
                  </Badge>
                  {def.enableEscalation && <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">تصعيد</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(def)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(def.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {def.description && <p className="text-sm text-gray-500 mb-2">{def.description}</p>}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                <span>المهلة: {def.defaultSlaHours} ساعة</span>
                <span className="mx-1">|</span>
                <span>{def.stepCount || 0} خطوة</span>
                {def.isReturnable && <><span className="mx-1">|</span><span>قابل للإرجاع</span></>}
              </div>
            </CardContent>
          </Card>
        ))}
        {defs.length === 0 && !showForm && (
          <Card><CardContent className="p-8 text-center text-gray-400">
            لا توجد تعريفات إجراءات. أضف تعريفاً جديداً لتبدأ.
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function ApprovalWorkflowsTab() {
  const { data, refetch } = useApiQuery<any>(["approval-config"], "/settings/approval-config");
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entityType: "leave", chainOrder: 1, approverRole: "manager", label: "" });
  const chains = data?.data || [];

  const entityTypes = [
    { value: "leave", label: "الإجازات" },
    { value: "purchase_request", label: "طلبات الشراء" },
    { value: "expense", label: "المصروفات" },
    { value: "general_request", label: "الطلبات العامة" },
  ];

  const approverRoles = [
    { value: "manager", label: "المدير المباشر" },
    { value: "hr", label: "الموارد البشرية" },
    { value: "finance", label: "المالية" },
    { value: "owner", label: "المالك" },
    { value: "director", label: "المدير العام" },
  ];

  const handleSubmit = async () => {
    try {
      await apiFetch("/settings/approval-config", {
        method: "POST",
        body: JSON.stringify({ ...form, label: form.label || entityTypes.find(e => e.value === form.entityType)?.label }),
      });
      toast({ title: "تمت إضافة مرحلة الموافقة" });
      setShowForm(false);
      setForm({ entityType: "leave", chainOrder: 1, approverRole: "manager", label: "" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/settings/approval-config/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message || "خطأ" });
    }
  };

  const grouped = entityTypes.map(et => ({
    ...et,
    chains: chains.filter((c: any) => c.entityType === et.value).sort((a: any, b: any) => a.chainOrder - b.chainOrder),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          سلاسل الموافقة
        </h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة مرحلة</>}
        </Button>
      </div>

      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>نوع الطلب</Label>
            <select className="w-full border rounded-md p-2" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
              {entityTypes.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
            </select>
          </div>
          <div>
            <Label>المرحلة (الترتيب)</Label>
            <Input type="number" min={1} max={10} value={form.chainOrder} onChange={(e) => setForm({ ...form, chainOrder: Number(e.target.value) })} />
          </div>
          <div>
            <Label>الدور المطلوب للموافقة</Label>
            <select className="w-full border rounded-md p-2" value={form.approverRole} onChange={(e) => setForm({ ...form, approverRole: e.target.value })}>
              {approverRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <Label>التسمية (اختياري)</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="مثال: موافقة المدير" />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit}>حفظ</Button>
          </div>
        </CardContent></Card>
      )}

      {grouped.map((group) => (
        <Card key={group.value}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{group.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {group.chains.length > 0 ? (
              <div className="space-y-2">
                {group.chains.map((chain: any, idx: number) => (
                  <div key={chain.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">
                      {chain.chainOrder}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-sm">{chain.label || `المرحلة ${chain.chainOrder}`}</span>
                      <span className="text-xs text-gray-500 ms-2">
                        ({approverRoles.find(r => r.value === chain.approverRole)?.label || chain.approverRole})
                      </span>
                    </div>
                    {idx < group.chains.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(chain.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-3">لا توجد مراحل موافقة محددة — سيتم الموافقة مباشرة</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AccountingMappingsTab() {
  const { data, refetch, isLoading } = useApiQuery<any>(["accounting-mappings"], "/finance/accounting-mappings");
  const { data: accountsData } = useApiQuery<any>(["accounts-list"], "/finance/accounts");
  const { toast } = useToast();
  const mappings: any[] = data?.data || [];
  const accounts: any[] = accountsData?.data || [];
  const [editingMap, setEditingMap] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const postingAccounts = accounts.filter((a: any) => a.allowPosting !== false);

  const handleChange = (operationType: string, field: string, value: any) => {
    setEditingMap(prev => ({
      ...prev,
      [operationType]: { ...(prev[operationType] || {}), [field]: value }
    }));
  };

  const handleSave = async (operationType: string, original: any) => {
    setSaving(operationType);
    const edits = editingMap[operationType] || {};
    const payload = { ...original, ...edits };
    try {
      await apiFetch(`/finance/accounting-mappings/${operationType}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: `تم حفظ توجيه "${original.operationLabel}"` });
      setEditingMap(prev => { const n = { ...prev }; delete n[operationType]; return n; });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل الحفظ", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const getValue = (mapping: any, field: string) => {
    const edits = editingMap[mapping.operationType];
    return edits && edits[field] !== undefined ? edits[field] : (mapping[field] ?? "");
  };

  const isModified = (operationType: string) => !!editingMap[operationType] && Object.keys(editingMap[operationType]).length > 0;

  const isMappingComplete = (mapping: any) => {
    const debit = editingMap[mapping.operationType]?.debitAccountId ?? mapping.debitAccountId;
    const credit = editingMap[mapping.operationType]?.creditAccountId ?? mapping.creditAccountId;
    return !!debit && !!credit;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-5 w-5 text-blue-600" />
        <h3 className="text-lg font-semibold">التوجيه المحاسبي</h3>
      </div>
      <p className="text-sm text-gray-500">
        حدد الحساب المدين والدائن الافتراضيين لكل نوع عملية. يُمنع اعتماد أي عملية مالية إذا لم يكتمل توجيهها المحاسبي.
      </p>

      {isLoading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {mappings.map((mapping: any) => {
            const complete = isMappingComplete(mapping);
            const modified = isModified(mapping.operationType);
            return (
              <Card key={mapping.operationType} className={`border-s-4 ${complete ? "border-s-green-400" : "border-s-orange-400"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {complete ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                      )}
                      <span className="font-medium text-sm">{mapping.operationLabel}</span>
                      <Badge className="text-xs bg-gray-100 text-gray-600 font-mono">{mapping.operationType}</Badge>
                    </div>
                    {modified && (
                      <Button
                        size="sm"
                        onClick={() => handleSave(mapping.operationType, mapping)}
                        disabled={saving === mapping.operationType}
                      >
                        <Save className="h-3 w-3 me-1" />
                        {saving === mapping.operationType ? "جاري الحفظ..." : "حفظ"}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">الحساب المدين (Debit)</Label>
                      <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={getValue(mapping, "debitAccountId")}
                        onChange={(e) => handleChange(mapping.operationType, "debitAccountId", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-- اختر الحساب المدين --</option>
                        {postingAccounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                      {mapping.debitName && !editingMap[mapping.operationType]?.debitAccountId && (
                        <p className="text-xs text-green-600 mt-1">✓ {mapping.debitCode} — {mapping.debitName}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">الحساب الدائن (Credit)</Label>
                      <select
                        className="w-full border rounded-md p-2 text-sm"
                        value={getValue(mapping, "creditAccountId")}
                        onChange={(e) => handleChange(mapping.operationType, "creditAccountId", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-- اختر الحساب الدائن --</option>
                        {postingAccounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} — {acc.name}
                          </option>
                        ))}
                      </select>
                      {mapping.creditName && !editingMap[mapping.operationType]?.creditAccountId && (
                        <p className="text-xs text-green-600 mt-1">✓ {mapping.creditCode} — {mapping.creditName}</p>
                      )}
                    </div>
                  </div>

                  {!complete && (
                    <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      لا يمكن اعتماد العمليات من هذا النوع لعدم اكتمال التوجيه المحاسبي
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {mappings.length === 0 && (
            <Card><CardContent className="p-12 text-center text-gray-400">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد بيانات توجيه محاسبي</p>
            </CardContent></Card>
          )}
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-700 border border-blue-100">
        <p className="font-medium mb-1">ملاحظة</p>
        <ul className="text-xs space-y-1 text-blue-600 list-disc list-inside">
          <li>يتم التحقق من اكتمال التوجيه المحاسبي قبل اعتماد أي عملية مالية</li>
          <li>يمكن إنشاء قوالب قيود مخصصة لكل نوع عملية من قسم "قوالب القيود" في المالية</li>
          <li>الحسابات التحليلية الفرعية تُنشأ تلقائياً عند إضافة موظف أو عميل جديد</li>
        </ul>
      </div>
    </div>
  );
}

function ZatcaSettingsTab() {
  const { toast } = useToast();
  const { data, refetch } = useApiQuery<{ data: Record<string, string> }>(["settings-zatca"], "/finance/zatca/settings");
  const settings = data?.data ?? {};
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [form, setForm] = useState({
    enabled: false,
    environment: "sandbox",
    vatRegistrationNumber: "",
    crNumber: "",
    organizationName: "",
    organizationNameEn: "",
    streetName: "",
    buildingNumber: "",
    cityName: "",
    postalCode: "",
    countryCode: "SA",
    oauthClientId: "",
    oauthClientSecret: "",
    pihKey: "",
    csid: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        enabled: settings.enabled === "true",
        environment: settings.environment || "sandbox",
        vatRegistrationNumber: settings.vatRegistrationNumber || "",
        crNumber: settings.crNumber || "",
        organizationName: settings.organizationName || "",
        organizationNameEn: settings.organizationNameEn || "",
        streetName: settings.streetName || "",
        buildingNumber: settings.buildingNumber || "",
        cityName: settings.cityName || "",
        postalCode: settings.postalCode || "",
        countryCode: settings.countryCode || "SA",
        oauthClientId: settings.oauthClientId || "",
        oauthClientSecret: settings.oauthClientSecret || "",
        pihKey: settings.pihKey || "",
        csid: settings.csid || "",
      });
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/finance/zatca/settings", {
        method: "PUT",
        body: JSON.stringify({ ...form, enabled: form.enabled ? "true" : "false" }),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات ZATCA بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await apiFetch<any>("/finance/zatca/test-connection", { method: "POST", body: JSON.stringify({}) });
      toast({
        title: result.status === "connected" ? "الاتصال ناجح" : "تحقق من الإعدادات",
        description: result.message,
        variant: result.status === "connected" ? "default" : "destructive",
      });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل اختبار الاتصال", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const connectionStatus = settings?.connectionTestStatus;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-green-600" />
          ربط هيئة الزكاة والضريبة والجمارك (ZATCA)
        </h3>
        {connectionStatus && (
          <Badge className={connectionStatus === "connected" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
            {connectionStatus === "connected" ? "متصل" : "غير متصل"}
          </Badge>
        )}
      </div>

      {settings?.lastConnectionTest && (
        <div className={cn("flex items-start gap-3 p-3 rounded-md border", connectionStatus === "connected" ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200")}>
          <AlertCircle className={cn("h-4 w-4 mt-0.5 shrink-0", connectionStatus === "connected" ? "text-green-600" : "text-yellow-600")} />
          <div>
            <p className="text-sm font-medium">{settings.connectionTestMessage}</p>
            <p className="text-xs text-gray-500 mt-0.5">آخر اختبار: {formatDateAr(settings.lastConnectionTest)}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>حالة الربط</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.enabled ? "bg-green-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm">{form.enabled ? "مفعّل" : "معطّل"}</span>
            </label>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>بيئة التشغيل</Label>
            <select className="w-full border rounded-md p-2 mt-1" value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
              <option value="sandbox">بيئة الاختبار (Sandbox)</option>
              <option value="production">بيئة الإنتاج (Production)</option>
            </select>
          </div>
          {form.environment === "production" && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-md">
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
              <p className="text-sm text-orange-700">بيئة الإنتاج تستخدم للإرسال الفعلي للهيئة. تأكد من صحة جميع البيانات قبل التفعيل.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">بيانات التسجيل</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>الرقم الضريبي (VAT Registration Number)</Label><Input className="mt-1" value={form.vatRegistrationNumber} onChange={e => setForm(f => ({ ...f, vatRegistrationNumber: e.target.value }))} placeholder="300XXXXXXXXX0003" /></div>
          <div><Label>رقم السجل التجاري</Label><Input className="mt-1" value={form.crNumber} onChange={e => setForm(f => ({ ...f, crNumber: e.target.value }))} placeholder="رقم السجل التجاري" /></div>
          <div><Label>اسم المنشأة (عربي)</Label><Input className="mt-1" value={form.organizationName} onChange={e => setForm(f => ({ ...f, organizationName: e.target.value }))} placeholder="اسم الشركة كما هو في السجل" /></div>
          <div><Label>اسم المنشأة (إنجليزي)</Label><Input className="mt-1" value={form.organizationNameEn} onChange={e => setForm(f => ({ ...f, organizationNameEn: e.target.value }))} placeholder="اسم المنشأة بالإنجليزية" /></div>
          <div><Label>اسم الشارع</Label><Input className="mt-1" value={form.streetName} onChange={e => setForm(f => ({ ...f, streetName: e.target.value }))} placeholder="اسم الشارع" /></div>
          <div><Label>رقم المبنى</Label><Input className="mt-1" value={form.buildingNumber} onChange={e => setForm(f => ({ ...f, buildingNumber: e.target.value }))} placeholder="0000" /></div>
          <div><Label>المدينة</Label><Input className="mt-1" value={form.cityName} onChange={e => setForm(f => ({ ...f, cityName: e.target.value }))} placeholder="الرياض" /></div>
          <div><Label>الرمز البريدي</Label><Input className="mt-1" value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} placeholder="00000" /></div>
          <div><Label>رمز الدولة</Label><Input className="mt-1" value={form.countryCode} onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))} maxLength={2} placeholder="SA" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">مفاتيح الربط التقني (API Keys)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>معرّف العميل (OAuth)</Label><Input className="mt-1" value={form.oauthClientId} onChange={e => setForm(f => ({ ...f, oauthClientId: e.target.value }))} placeholder="معرّف العميل من بوابة فاتورة" dir="ltr" /></div>
          <div><Label>المفتاح السري (OAuth)</Label><Input className="mt-1" type="password" value={form.oauthClientSecret} onChange={e => setForm(f => ({ ...f, oauthClientSecret: e.target.value }))} placeholder="المفتاح السري من بوابة فاتورة" dir="ltr" /></div>
          <div><Label>معرّف الختم التشفيري (CSID)</Label><Input className="mt-1" value={form.csid} onChange={e => setForm(f => ({ ...f, csid: e.target.value }))} placeholder="معرّف الختم التشفيري" dir="ltr" /></div>
          <div><Label>هاش الفاتورة السابقة (PIH)</Label><Input className="mt-1" value={form.pihKey} onChange={e => setForm(f => ({ ...f, pihKey: e.target.value }))} placeholder="هاش الفاتورة السابقة" dir="ltr" /></div>
          <div className="md:col-span-2">
            <p className="text-xs text-gray-500">المفاتيح التقنية تُوفّر من بوابة ZATCA بعد التسجيل وإكمال عملية الاعتماد. هذه الإعدادات تُستخدم للتوقيع الرقمي وإرسال الفواتير.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 me-1" />{saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </Button>
        <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
          <Zap className="h-4 w-4 me-1" />{testing ? "جاري الاختبار..." : "اختبار الاتصال"}
        </Button>
      </div>
    </div>
  );
}

function CommunicationChannelsTab() {
  const { toast } = useToast();
  const { data, refetch } = useApiQuery<{ data: Record<string, string> }>(["settings-channels"], "/settings/channels");
  const settings = data?.data ?? {};
  const [saving, setSaving] = useState(false);

  const [smsForm, setSmsForm] = useState({ sms_account_sid: "", sms_auth_token: "", sms_from_number: "", sms_enabled: "true" });
  const [waForm, setWaForm] = useState({ whatsapp_access_token: "", whatsapp_phone_id: "", whatsapp_verify_token: "", whatsapp_enabled: "true" });
  const [pushEnabled, setPushEnabled] = useState("true");
  const [smsTokenConfigured, setSmsTokenConfigured] = useState(false);
  const [waTokenConfigured, setWaTokenConfigured] = useState(false);

  useEffect(() => {
    if (settings) {
      const smsAuthRaw = settings.sms_auth_token ?? "";
      const waTokenRaw = settings.whatsapp_access_token ?? "";
      const smsConfigured = smsAuthRaw === "__configured__";
      const waConfigured = waTokenRaw === "__configured__";
      setSmsTokenConfigured(smsConfigured);
      setWaTokenConfigured(waConfigured);
      setSmsForm({
        sms_account_sid: settings.sms_account_sid ?? "",
        sms_auth_token: "",
        sms_from_number: settings.sms_from_number ?? "",
        sms_enabled: settings.sms_enabled ?? "true",
      });
      setWaForm({
        whatsapp_access_token: "",
        whatsapp_phone_id: settings.whatsapp_phone_id ?? "",
        whatsapp_verify_token: settings.whatsapp_verify_token ?? "",
        whatsapp_enabled: settings.whatsapp_enabled ?? "true",
      });
      setPushEnabled(settings.push_enabled ?? "true");
    }
  }, [data]);

  const handleSave = async (entries: Record<string, string>, secretFields?: { key: string; configured: boolean }[]) => {
    setSaving(true);
    try {
      const payload = { ...entries };
      if (secretFields) {
        for (const { key, configured } of secretFields) {
          if (!payload[key] && configured) {
            payload[key] = "__configured__";
          }
        }
      }
      await apiFetch("/settings/channels", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات قنوات الاتصال بنجاح" });
      refetch();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-blue-500" />
        إعدادات قنوات الاتصال
      </h3>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">📱</span>
              SMS — رسائل نصية (Twilio)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={smsForm.sms_enabled === "true"}
                onChange={(e) => setSmsForm({ ...smsForm, sms_enabled: e.target.checked ? "true" : "false" })}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">أدخل بيانات حساب Twilio لإرسال الرسائل النصية. يمكنك إنشاء حساب مجاني على twilio.com</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">معرّف الحساب</Label>
              <Input
                value={smsForm.sms_account_sid}
                onChange={(e) => setSmsForm({ ...smsForm, sms_account_sid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">رمز المصادقة</Label>
              {smsTokenConfigured && !smsForm.sms_auth_token && (
                <p className="text-xs text-green-600 mb-1">✓ تم الضبط — اتركه فارغاً للإبقاء على القيمة الحالية</p>
              )}
              <Input
                type="password"
                value={smsForm.sms_auth_token}
                onChange={(e) => setSmsForm({ ...smsForm, sms_auth_token: e.target.value })}
                placeholder={smsTokenConfigured ? "••• (محفوظ — أدخل قيمة جديدة للتغيير)" : "••••••••••••••••••••••••••••••••"}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">رقم الإرسال (From)</Label>
              <Input
                value={smsForm.sms_from_number}
                onChange={(e) => setSmsForm({ ...smsForm, sms_from_number: e.target.value })}
                placeholder="+15551234567"
                dir="ltr"
              />
            </div>
          </div>
          <Button size="sm" onClick={() => handleSave(smsForm, [{ key: "sms_auth_token", configured: smsTokenConfigured }])} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات SMS
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">💬</span>
              واتساب — واجهة السحابة
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={waForm.whatsapp_enabled === "true"}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_enabled: e.target.checked ? "true" : "false" })}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">أدخل بيانات WhatsApp Business API من Meta for Developers. تحتاج إلى حساب تجاري معتمد على developers.facebook.com</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">رمز الوصول</Label>
              {waTokenConfigured && !waForm.whatsapp_access_token && (
                <p className="text-xs text-green-600 mb-1">✓ تم الضبط — اتركه فارغاً للإبقاء على القيمة الحالية</p>
              )}
              <Input
                type="password"
                value={waForm.whatsapp_access_token}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_access_token: e.target.value })}
                placeholder={waTokenConfigured ? "••• (محفوظ — أدخل قيمة جديدة للتغيير)" : "EAAxxxxxxxxxxxxxxx..."}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">معرّف رقم الهاتف</Label>
              <Input
                value={waForm.whatsapp_phone_id}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_phone_id: e.target.value })}
                placeholder="123456789012345"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">Verify Token (للـ Webhook)</Label>
              <Input
                value={waForm.whatsapp_verify_token}
                onChange={(e) => setWaForm({ ...waForm, whatsapp_verify_token: e.target.value })}
                placeholder="ghayth_erp_verify"
                dir="ltr"
              />
            </div>
          </div>
          <div className="bg-blue-50 rounded-md p-3 text-xs text-blue-700 space-y-1">
            <p className="font-medium">رابط الـ Webhook:</p>
            <code className="bg-blue-100 px-2 py-1 rounded block" dir="ltr">{window.location.origin}/api/communications/whatsapp/webhook</code>
          </div>
          <Button size="sm" onClick={() => handleSave(waForm, [{ key: "whatsapp_access_token", configured: waTokenConfigured }])} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات واتساب
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">🔔</span>
              إشعارات المتصفح (Push Notifications)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">تفعيل</Label>
              <input
                type="checkbox"
                checked={pushEnabled === "true"}
                onChange={(e) => setPushEnabled(e.target.checked ? "true" : "false")}
                className="h-4 w-4"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">إشعارات المتصفح تعمل عبر VAPID keys. يجب ضبط متغيرات البيئة VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY على الخادم لتفعيل هذه الميزة.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">لتوليد مفاتيح VAPID:</p>
            <code className="bg-amber-100 px-2 py-1 rounded block" dir="ltr">npx web-push generate-vapid-keys</code>
            <p className="mt-1">أضف المفاتيح الناتجة كمتغيرات بيئة: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY و VAPID_SUBJECT</p>
          </div>
          <Button size="sm" onClick={() => handleSave({ push_enabled: pushEnabled })} disabled={saving}>
            <Save className="h-3.5 w-3.5 me-1" />
            حفظ إعدادات الإشعارات
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GovIntegrationsTab() {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [testingId, setTestingId] = useState<number | null>(null);
  const { data, isLoading, refetch } = useApiQuery<any>(["gov-integrations"], "/gov-integrations");

  const integrations: any[] = data?.data || [];

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    const cfg = item.config || {};
    setEditForm({
      enabled: item.enabled,
      apiKey: cfg.apiKey || "",
      baseUrl: cfg.baseUrl || "",
      username: cfg.username || "",
      subscriptionId: cfg.subscriptionId || "",
    });
  };

  const handleSave = async (id: number) => {
    try {
      await apiFetch(`/gov-integrations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: editForm.enabled,
          config: {
            apiKey: editForm.apiKey,
            baseUrl: editForm.baseUrl,
            username: editForm.username,
            subscriptionId: editForm.subscriptionId,
          },
        }),
      });
      toast({ title: "تم الحفظ بنجاح" });
      setEditingId(null);
      refetch();
    } catch {
      toast({ variant: "destructive", title: "فشل الحفظ" });
    }
  };

  const handleTestConnection = async (id: number) => {
    setTestingId(id);
    try {
      const json = await apiFetch<any>(`/gov-integrations/${id}/test`, { method: "POST" });
      toast({ title: json.success ? "الاتصال ناجح (محاكاة)" : "فشل الاتصال", description: json.message, variant: json.success ? "default" : "destructive" });
      refetch();
    } catch {
      toast({ variant: "destructive", title: "فشل الاتصال" });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (item: any) => {
    try {
      await apiFetch(`/gov-integrations/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      refetch();
      toast({ title: item.enabled ? "تم تعطيل النظام" : "تم تفعيل النظام" });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  const GOV_SYSTEM_INFO: Record<string, { color: string; desc: string; icon: string }> = {
    muqeem: { color: "bg-green-50 border-green-200", desc: "إدارة الإقامات وتصاريح العمل ومعلومات الموظفين الأجانب", icon: "🏛️" },
    tam: { color: "bg-blue-50 border-blue-200", desc: "تسجيل المركبات وبيانات اللوحات والفحص الدوري", icon: "🚗" },
    absher_business: { color: "bg-purple-50 border-purple-200", desc: "خدمات الأعمال الحكومية عبر منصة أبشر", icon: "📱" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link2 className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold">التكاملات الحكومية</h2>
          <p className="text-sm text-muted-foreground">ربط النظام بالمنصات الحكومية السعودية (مقيم، تام، أبشر الأعمال)</p>
        </div>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>هذه التكاملات تعمل حالياً في وضع المحاكاة — بيانات الربط الفعلي ستُفعَّل عند الاشتراك في الخدمات الحكومية المقابلة.</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : (
        <div className="space-y-4">
          {integrations.map((item: any) => {
            const info = GOV_SYSTEM_INFO[item.type] || { color: "bg-gray-50 border-gray-200", desc: "", icon: "🔗" };
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className={`border rounded-lg p-4 ${info.color}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{info.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{item.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {item.enabled ? "مفعّل" : "معطّل"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{info.desc}</p>
                      {item.lastCheckStatus && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            item.lastCheckStatus === "connected" ? "bg-green-100 text-green-700" :
                            item.lastCheckStatus === "auth_error" ? "bg-yellow-100 text-yellow-700" :
                            "bg-red-100 text-red-700"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.lastCheckStatus === "connected" ? "bg-green-500" :
                              item.lastCheckStatus === "auth_error" ? "bg-yellow-500" :
                              "bg-red-500"
                            }`} />
                            {item.lastCheckStatus === "connected" ? "متصل" :
                             item.lastCheckStatus === "auth_error" ? "خطأ مصادقة" : "غير متصل"}
                          </span>
                          {item.lastCheckedAt && (
                            <span className="text-xs text-muted-foreground">
                              آخر فحص: {new Date(item.lastCheckedAt).toLocaleDateString("ar-SA")} {new Date(item.lastCheckedAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      )}
                      {item.lastCheckMessage && item.lastCheckStatus !== "connected" && (
                        <p className="text-xs text-red-600 mt-1">{item.lastCheckMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`p-1.5 rounded-md ${item.enabled ? "text-green-600 hover:bg-green-100" : "text-gray-400 hover:bg-gray-100"}`}
                      title={item.enabled ? "تعطيل" : "تفعيل"}
                    >
                      {item.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => isEditing ? setEditingId(null) : handleEdit(item)}
                      className="p-1.5 rounded-md text-blue-600 hover:bg-blue-100"
                      title="تعديل الإعدادات"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleTestConnection(item.id)}
                      disabled={testingId === item.id}
                      className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                      title="اختبار الاتصال"
                    >
                      {testingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" />مفتاح API</Label>
                        <Input
                          className="mt-1 text-sm font-mono"
                          type="password"
                          placeholder="أدخل مفتاح الـ API"
                          value={editForm.apiKey}
                          onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">رابط الخدمة (Base URL)</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="https://api.gov.sa/..."
                          value={editForm.baseUrl}
                          onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">اسم المستخدم</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="اسم المستخدم"
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">رقم الاشتراك</Label>
                        <Input
                          className="mt-1 text-sm"
                          placeholder="رقم الاشتراك / المرجع"
                          value={editForm.subscriptionId}
                          onChange={(e) => setEditForm({ ...editForm, subscriptionId: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>إلغاء</Button>
                      <Button size="sm" onClick={() => handleSave(item.id)}><Save className="h-3.5 w-3.5 mr-1" />حفظ</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="general" dir="rtl">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="general">عام</TabsTrigger>
          <TabsTrigger value="branches">الفروع</TabsTrigger>
          <TabsTrigger value="letterhead">الكليشة</TabsTrigger>
          <TabsTrigger value="departments">الأقسام</TabsTrigger>
          <TabsTrigger value="companies">الشركات</TabsTrigger>
          <TabsTrigger value="channels">قنوات الاتصال</TabsTrigger>
          <TabsTrigger value="controls">التحكم</TabsTrigger>
          <TabsTrigger value="roles">الصلاحيات</TabsTrigger>
          <TabsTrigger value="workflows">الإجراءات</TabsTrigger>
          <TabsTrigger value="approvals">الموافقات</TabsTrigger>
          <TabsTrigger value="accounting">التوجيه المحاسبي</TabsTrigger>
          <TabsTrigger value="audit">التدقيق</TabsTrigger>
          <TabsTrigger value="resolved">الوراثة</TabsTrigger>
          <TabsTrigger value="zatca">ZATCA</TabsTrigger>
          <TabsTrigger value="gov">التكاملات الحكومية</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings /></TabsContent>
        <TabsContent value="branches"><BranchesTab /></TabsContent>
        <TabsContent value="letterhead"><LetterheadSettings /></TabsContent>
        <TabsContent value="departments"><CrudSection title="الأقسام" endpoint="/settings/departments" queryKey="settings-departments" fields={[{ name: "name", label: "الاسم" }, { name: "nameEn", label: "الاسم (إنجليزي)" }, { name: "manager", label: "المدير" }]} /></TabsContent>
        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="channels"><CommunicationChannelsTab /></TabsContent>
        <TabsContent value="controls"><SystemControlsTab /></TabsContent>
        <TabsContent value="roles"><RolePermissionsTab /></TabsContent>
        <TabsContent value="workflows"><WorkflowDefinitionsTab /></TabsContent>
        <TabsContent value="approvals"><ApprovalWorkflowsTab /></TabsContent>
        <TabsContent value="accounting"><AccountingMappingsTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
        <TabsContent value="resolved"><ResolvedSettingsTab /></TabsContent>
        <TabsContent value="zatca"><ZatcaSettingsTab /></TabsContent>
        <TabsContent value="gov"><GovIntegrationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  system: { label: "نظام", color: "text-gray-700", bg: "bg-gray-100" },
  company: { label: "شركة", color: "text-blue-700", bg: "bg-blue-100" },
  branch: { label: "فرع", color: "text-green-700", bg: "bg-green-100" },
};

function ResolvedSettingsTab() {
  const { data } = useApiQuery<any>(["settings-resolved"], "/settings/resolved");
  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-blue-500" />
        وراثة الإعدادات (نظام ← شركة ← فرع)
      </h3>
      <p className="text-sm text-gray-500">يعرض القيمة الفعلية لكل إعداد ومصدرها — القيم الأقرب (فرع) تتغلب على القيم الأعلى (شركة/نظام)</p>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">المفتاح</th><th className="p-3 text-start">القيمة</th><th className="p-3 text-start">المصدر</th></tr></thead>
          <tbody>
            {items.map((s: any) => {
              const src = SOURCE_LABELS[s.source] || SOURCE_LABELS.system;
              return (
                <tr key={s.key} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium font-mono text-xs">{s.key}</td>
                  <td className="p-3 text-gray-600 max-w-xs truncate">{typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value ?? "-")}</td>
                  <td className="p-3"><Badge className={cn(src.bg, src.color, "text-xs")}>{src.label}</Badge></td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400">لا توجد إعدادات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function AuditLogTab() {
  const { data } = useApiQuery<any>(["audit-log"], "/settings/audit-log");
  const items = data?.data || [];
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجل التدقيق</h3>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50"><th className="p-3 text-start">المستخدم</th><th className="p-3 text-start">الإجراء</th><th className="p-3 text-start">الوحدة</th><th className="p-3 text-start">التاريخ</th></tr></thead>
          <tbody>
            {items.map((log: any) => (
              <tr key={log.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{log.userName || "-"}</td>
                <td className="p-3">{log.action || "-"}</td>
                <td className="p-3 text-gray-500">{log.module || "-"}</td>
                <td className="p-3 text-xs text-gray-400">{log.createdAt ? formatDateAr(log.createdAt) : "-"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد سجلات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
