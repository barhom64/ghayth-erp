import { useState, useEffect } from "react";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  FormShell,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Cog, Building, Users, Building2, ScrollText, Plus, X, Save, Pencil, Trash2, Printer, Eye, Shield, SlidersHorizontal, GitBranch, CheckCircle, Settings2, Workflow, Clock, AlertTriangle, BookOpen, ArrowLeftRight, AlertCircle, Zap, MessageSquare, Link2, WifiOff, Wifi, RefreshCw, ToggleLeft, ToggleRight, Key } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useSettings } from "@/contexts/settings-context";
import { useToast } from "@/hooks/use-toast";
import { LetterheadHeader } from "@/components/print-layout";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
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

// GeneralSettings — 11-field edit form. The server stores values as
// {key, value} rows; mapping happens in the hydration block below.
// The FormShell key={hash} trick remounts the form when the server
// returns new data, so we drop the useEffect → setForm hydration
// round-trip that previously fired after every refetch.
const generalSettingsSchema = z.object({
  companyName: z.string().trim(),
  companyNameEn: z.string().trim(),
  taxNumber: z.string().trim(),
  crNumber: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim().refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "صيغة البريد الإلكتروني غير صحيحة",
  ),
  address: z.string().trim(),
  currency: z.enum(["SAR", "USD", "AED"]),
  language: z.string(),
  timezone: z.enum(["Asia/Riyadh", "Asia/Dubai"]),
  calendarMode: z.enum(["hijri", "gregorian", "both"]),
});
type GeneralSettingsForm = z.infer<typeof generalSettingsSchema>;

function GeneralSettings() {
  const { data: settingsData, isLoading, isError, error, refetch } = useApiQuery<{ data: { key: string; value: string }[] }>(["settings-general"], "/settings/general");
  const { reload: reloadGlobalSettings } = useSettings();
  const { toast } = useToast();

  const saveMut = useApiMutation<any, GeneralSettingsForm>(
    "/settings/general",
    "PUT",
    [["settings-general"]],
    {
      successMessage: false,
      onSuccess: async () => {
        await reloadGlobalSettings();
        toast({ title: "تم الحفظ", description: "تم حفظ الإعدادات العامة بنجاح" });
      },
    }
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  // Reduce the {key,value}[] response to a flat record keyed by field
  // name. Defaults guard against the row being missing entirely.
  const map: Record<string, string> = {};
  for (const r of settingsData?.data || []) map[r.key] = r.value;
  const defaults: GeneralSettingsForm = {
    companyName: map.companyName || "",
    companyNameEn: map.companyNameEn || "",
    taxNumber: map.taxNumber || "",
    crNumber: map.crNumber || "",
    phone: map.phone || "",
    email: map.email || "",
    address: map.address || "",
    currency: (map.currency as GeneralSettingsForm["currency"]) || "SAR",
    language: map.language || "ar",
    timezone: (map.timezone as GeneralSettingsForm["timezone"]) || "Asia/Riyadh",
    calendarMode: (map.calendarMode as GeneralSettingsForm["calendarMode"]) || "hijri",
  };
  // Use a key tied to the data hash so the form remounts (and re-
  // seeds its defaults) whenever the server returns fresh values.
  const remountKey = JSON.stringify(defaults);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">الإعدادات العامة</h1>
      <Card>
        <CardContent className="p-6">
          <FormShell
            key={remountKey}
            schema={generalSettingsSchema}
            defaultValues={defaults}
            submitLabel={saveMut.isPending ? "جاري الحفظ..." : "حفظ الإعدادات"}
            onSubmit={async (values) => {
              await saveMut.mutateAsync(values);
            }}
          >
            <FormGrid cols={2}>
              <FormTextField name="companyName" label="اسم الشركة (عربي)" />
              <FormTextField name="companyNameEn" label="اسم الشركة (إنجليزي)" />
              <FormTextField name="taxNumber" label="الرقم الضريبي" />
              <FormTextField name="crNumber" label="رقم السجل التجاري" />
              <FormPhoneField name="phone" label="الهاتف" />
              <FormEmailField name="email" label="البريد الإلكتروني" />
              <FormTextField name="address" label="العنوان" className="md:col-span-2" />
              <FormSelectField
                name="currency"
                label="العملة"
                options={[
                  { value: "SAR", label: "ريال سعودي" },
                  { value: "USD", label: "دولار أمريكي" },
                  { value: "AED", label: "درهم إماراتي" },
                ]}
              />
              <FormSelectField
                name="timezone"
                label="المنطقة الزمنية"
                options={[
                  { value: "Asia/Riyadh", label: "الرياض (توقيت غرينتش+3)" },
                  { value: "Asia/Dubai", label: "دبي (توقيت غرينتش+4)" },
                ]}
              />
              <FormSelectField
                name="calendarMode"
                label="التقويم الافتراضي"
                options={[
                  { value: "hijri", label: "هجري" },
                  { value: "gregorian", label: "ميلادي" },
                  { value: "both", label: "كلاهما (هجري وميلادي)" },
                ]}
              />
            </FormGrid>
          </FormShell>
        </CardContent>
      </Card>
    </div>
  );
}

function CrudSection({ title, endpoint, queryKey, fields }: {
  title: string; endpoint: string; queryKey: string; fields: { name: string; label: string; required?: boolean }[];
}) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>([queryKey], endpoint);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, ""])));
  // Replaces window.confirm() for the generic settings-table delete.
  // The row has no fixed name field — use the first listed field as a
  // best-effort label, falling back to "—".
  const [deletingItem, setDeletingItem] = useState<{ id: number; label: string } | null>(null);
  const items = asList(data);

  const resetForm = () => {
    setForm(Object.fromEntries(fields.map((f) => [f.name, ""])));
    setEditingId(null);
    setShowForm(false);
  };

  const createMut = useApiMutation<any, Record<string, string>>(
    endpoint,
    "POST",
    [[queryKey]],
    {
      successMessage: `تمت إضافة ${title} بنجاح`,
      onSuccess: resetForm,
    }
  );
  const updateMut = useApiMutation<any, Record<string, any>>(
    (body) => `${endpoint}/${body.__id}`,
    "PUT",
    [[queryKey]],
    {
      successMessage: `تم تعديل ${title} بنجاح`,
      onSuccess: resetForm,
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `${endpoint}/${body.id}`,
    "DELETE",
    [[queryKey]],
    { successMessage: "تم الحذف بنجاح" }
  );
  const deleting = deleteMut.isPending ? deleteMut.variables?.id ?? null : null;

  const handleEdit = (item: any) => {
    const newForm: Record<string, string> = {};
    for (const f of fields) {
      newForm[f.name] = item[f.name] || "";
    }
    setForm(newForm);
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateMut.mutate({ ...form, __id: editingId });
    } else {
      createMut.mutate(form);
    }
  };

  const handleDelete = (id: number) => {
    deleteMut.mutate({ id });
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <GuardedButton perm="admin:create" size="sm" onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة</>}</GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.name}><Label>{f.label}</Label><Input value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} /></div>
          ))}
          <div className="md:col-span-2"><Button onClick={handleSave} disabled={createMut.isPending} rateLimitAware>{editingId ? "تحديث" : "حفظ"}</Button></div>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-surface-subtle">{fields.map((f) => <th key={f.name} className="p-3 text-right">{f.label}</th>)}<th className="p-3 text-start w-24">إجراءات</th></tr></thead>
          <tbody>
            {(Array.isArray(items) ? items : []).map((item: any, idx: number) => (
              <tr key={item.id || idx} className="border-b hover:bg-surface-subtle">
                {fields.map((f) => <td key={f.name} className="p-3">{item[f.name] || "-"}</td>)}
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingItem({ id: item.id, label: (fields[0] && item[fields[0].name]) || "—" })} disabled={deleting === item.id} title="حذف" className="text-status-error hover:text-status-error-foreground"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {(!Array.isArray(items) || items.length === 0) && <tr><td colSpan={fields.length + 1} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <ConfirmDeleteDialog
        open={deletingItem !== null}
        onOpenChange={(v) => { if (!v) setDeletingItem(null); }}
        entity={{
          type: queryKey,
          id: deletingItem?.id ?? 0,
          name: deletingItem?.label ?? "",
        }}
        deletePath={`${endpoint}/${deletingItem?.id}`}
        invalidateKeys={[[queryKey]]}
        successMessage="تم الحذف"
        onDeleted={() => { setDeletingItem(null); refetch(); }}
      />
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
  system: { label: "نظام", color: "text-status-neutral-foreground", bg: "bg-surface-subtle" },
  company: { label: "شركة", color: "text-status-info-foreground", bg: "bg-status-info-surface" },
  branch: { label: "فرع", color: "text-status-success-foreground", bg: "bg-status-success-surface" },
};

function ResolvedSettingsTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["settings-resolved"], "/settings/resolved");
  const items = data?.data || [];
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-status-info" />
        وراثة الإعدادات (نظام ← شركة ← فرع)
      </h3>
      <p className="text-sm text-muted-foreground">يعرض القيمة الفعلية لكل إعداد ومصدرها — القيم الأقرب (فرع) تتغلب على القيم الأعلى (شركة/نظام)</p>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-surface-subtle"><th className="p-3 text-start">المفتاح</th><th className="p-3 text-start">القيمة</th><th className="p-3 text-start">المصدر</th></tr></thead>
          <tbody>
            {items.map((s: any) => {
              const src = SOURCE_LABELS[s.source] || SOURCE_LABELS.system;
              return (
                <tr key={s.key} className="border-b hover:bg-surface-subtle">
                  <td className="p-3 font-medium font-mono text-xs">{s.key}</td>
                  <td className="p-3 text-muted-foreground max-w-xs truncate">{typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value ?? "-")}</td>
                  <td className="p-3"><Badge className={cn(src.bg, src.color, "text-xs")}>{src.label}</Badge></td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">لا توجد إعدادات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function AuditLogTab() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["audit-log"], "/settings/audit-log");
  const items = data?.data || [];
  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">سجل التدقيق</h3>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-surface-subtle"><th className="p-3 text-start">المستخدم</th><th className="p-3 text-start">الإجراء</th><th className="p-3 text-start">الوحدة</th><th className="p-3 text-start">التاريخ</th></tr></thead>
          <tbody>
            {items.map((log: any) => (
              <tr key={log.id} className="border-b hover:bg-surface-subtle">
                <td className="p-3 font-medium">{log.userName || "-"}</td>
                <td className="p-3">{log.action || "-"}</td>
                <td className="p-3 text-muted-foreground">{log.module || "-"}</td>
                <td className="p-3 text-xs text-muted-foreground">{log.createdAt ? formatDateAr(log.createdAt) : "-"}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد سجلات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
