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
import { GovIntegrationsTab } from "./settings/gov-integrations-tab";
import { ZatcaSettingsTab } from "./settings/zatca-settings-tab";
import { CommunicationChannelsTab } from "./settings/communication-channels-tab";
import { WorkflowDefinitionsTab } from "./settings/workflow-definitions-tab";
import { BranchesTab } from "./settings/branches-tab";
import { CompaniesTab } from "./settings/companies-tab";
import { LetterheadSettings } from "./settings/letterhead-tab";
import { AccountingMappingsTab } from "./settings/accounting-mappings-tab";
import { SystemControlsTab } from "./settings/system-controls-tab";
import { RolePermissionsTab } from "./settings/role-permissions-tab";
import { ApprovalWorkflowsTab } from "./settings/approval-workflows-tab";

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
        <div><Label>العملة</Label><select className="w-full border rounded-md p-2" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option><option value="AED">درهم إماراتي</option></select></div>
        <div><Label>المنطقة الزمنية</Label><select className="w-full border rounded-md p-2" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}><option value="Asia/Riyadh">الرياض (توقيت غرينتش+3)</option><option value="Asia/Dubai">دبي (توقيت غرينتش+4)</option></select></div>
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
          <TabsTrigger value="zatca">هيئة الزكاة والضريبة</TabsTrigger>
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
