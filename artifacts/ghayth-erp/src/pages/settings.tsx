import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormEmailField,
  FormPhoneField,
  FormSelectField,
  FormGrid,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Cog, Building, Users, Building2, ScrollText, Plus, X, Pencil, Trash2, Printer, Eye, Shield, SlidersHorizontal, GitBranch, CheckCircle, Settings2, Workflow, Clock, AlertTriangle, BookOpen, ArrowLeftRight, AlertCircle, Zap, MessageSquare, Link2, WifiOff, Wifi, RefreshCw, ToggleLeft, ToggleRight, Key } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { useSettings } from "@/contexts/settings-context";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { useAppContext } from "@/contexts/app-context";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { GovIntegrationsTab } from "./settings/gov-integrations-tab";
import { ZatcaSettingsTab } from "./settings/zatca-settings-tab";
import { CommunicationChannelsTab } from "./settings/communication-channels-tab";
import { BranchesTab } from "./settings/branches-tab";
import { DepartmentsTab } from "./settings/departments-tab";
import { CompaniesTab } from "./settings/companies-tab";
import { LetterheadSettings } from "./settings/letterhead-tab";
import { AccountingMappingsTab } from "./settings/accounting-mappings-tab";
import { SystemControlsTab } from "./settings/system-controls-tab";
import { TaskSlaReminderTab } from "./settings/task-sla-reminder-tab";
import { ApprovalWorkflowsTab } from "./settings/approval-workflows-tab";
import { WorkflowDefinitionsTab } from "./settings/workflow-definitions-tab";
import { NumberingTab } from "./settings/numbering-tab";
import { CustomFieldsTab } from "./settings/custom-fields-tab";

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
  // Replaces window.confirm() for the generic settings-table delete.
  // The row has no fixed name field — use the first listed field as a
  // best-effort label, falling back to "—".
  const [deletingItem, setDeletingItem] = useState<{ id: number; label: string } | null>(null);
  const items = asList(data);

  // Build a dynamic zod schema and default-values record from the
  // declarative `fields` array. Each field is a free-text string;
  // `required` becomes a zod min(1) refinement.
  const schemaShape: Record<string, z.ZodString> = {};
  for (const f of fields) {
    const s = z.string().trim();
    schemaShape[f.name] = f.required ? s.min(1, "مطلوب") : s;
  }
  const crudSchema = z.object(schemaShape);
  type CrudForm = Record<string, string>;

  const emptyDefaults: CrudForm = Object.fromEntries(fields.map((f) => [f.name, ""]));

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const createMut = useApiMutation<any, CrudForm>(
    endpoint,
    "POST",
    [[queryKey]],
    {
      successMessage: `تمت إضافة ${title} بنجاح`,
      onSuccess: closeForm,
    }
  );
  const updateMut = useApiMutation<any, Record<string, any>>(
    (body) => `${endpoint}/${body.__id}`,
    "PUT",
    [[queryKey]],
    {
      successMessage: `تم تعديل ${title} بنجاح`,
      onSuccess: closeForm,
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `${endpoint}/${body.id}`,
    "DELETE",
    [[queryKey]],
    { successMessage: "تم الحذف بنجاح" }
  );
  const deleting = deleteMut.isPending ? deleteMut.variables?.id ?? null : null;

  // Seed values for the form. New row → empty strings; edit → values
  // copied from the row. FormShell remounts on `key={editingId ?? "new"}`
  // so we can pass freshly-derived defaults each time without an effect.
  const editingItem = editingId
    ? (items as any[]).find((it: any) => it.id === editingId)
    : null;
  const formDefaults: CrudForm = editingItem
    ? Object.fromEntries(fields.map((f) => [f.name, String(editingItem[f.name] ?? "")]))
    : emptyDefaults;

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setShowForm(true);
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <GuardedButton perm="admin:create" size="sm" onClick={() => { if (showForm) closeForm(); else { setEditingId(null); setShowForm(true); } }}>{showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة</>}</GuardedButton>
      </div>
      {showForm && (
        <Card><CardContent className="p-4">
          <FormShell
            key={editingId ?? "new"}
            schema={crudSchema as unknown as z.ZodType<CrudForm>}
            defaultValues={formDefaults}
            submitLabel={editingId ? "تحديث" : "حفظ"}
            onSubmit={async (values) => {
              if (editingId) {
                await updateMut.mutateAsync({ ...values, __id: editingId });
              } else {
                await createMut.mutateAsync(values);
              }
            }}
          >
            <FormGrid cols={2}>
              {fields.map((f) => (
                <FormTextField key={f.name} name={f.name} label={f.label} required={f.required} />
              ))}
            </FormGrid>
          </FormShell>
        </CardContent></Card>
      )}
      <DataTable
        data={Array.isArray(items) ? items : []}
        rowKey={(row) => String(row.id)}
        columns={[
          ...fields.map<DataTableColumn<any>>((f) => ({ key: f.name as any, header: f.label, render: (row) => row[f.name] || "-" })),
          {
            key: "__actions" as any,
            header: "إجراءات",
            render: (item) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingItem({ id: item.id, label: (fields[0] && item[fields[0].name]) || "—" })} disabled={deleting === item.id} title="حذف" className="text-status-error hover:text-status-error-foreground"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ),
          },
        ]}
        emptyMessage="لا توجد بيانات"
      />

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












// Every tab gets a deep-path so it's directly reachable (URL + nav + search),
// not only by a manual click inside /settings. The component reads `location`
// and opens the matching tab.
const SETTINGS_PATH_TAB: Record<string, string> = {
  "/settings/branches": "branches",
  "/settings/letterhead": "letterhead",
  "/settings/departments": "departments",
  "/settings/companies": "companies",
  "/settings/channels": "channels",
  "/settings/controls": "controls",
  "/settings/task-sla": "task-sla",
  "/settings/approvals": "approvals",
  "/settings/numbering": "numbering",
  "/settings/accounting": "accounting",
  "/settings/audit-log": "audit",
  "/settings/resolved": "resolved",
  "/settings/zatca": "zatca",
  "/settings/gov": "gov",
  "/settings/custom-fields": "custom-fields",
};

export default function SettingsPage() {
  const [location] = useLocation();
  const initialTab = SETTINGS_PATH_TAB[location] ?? "general";
  return (
    <PageShell
      title="الإعدادات"
      subtitle="ضبط الإعدادات العامة، الفروع، الأقسام، الموافقات، والتكاملات"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { label: "الإعدادات" }]}
    >
      <Tabs defaultValue={initialTab} dir="rtl">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="general">عام</TabsTrigger>
          {/* الهوية والتنظيم */}
          <TabsTrigger value="companies">الشركات</TabsTrigger>
          <TabsTrigger value="branches">الفروع</TabsTrigger>
          <TabsTrigger value="departments">الأقسام</TabsTrigger>
          <TabsTrigger value="letterhead">الكليشة</TabsTrigger>
          {/* الحوكمة والإجراءات */}
          <TabsTrigger value="controls">التحكم</TabsTrigger>
          <TabsTrigger value="approvals">الموافقات</TabsTrigger>
          <TabsTrigger value="workflows">الإجراءات</TabsTrigger>
          <TabsTrigger value="numbering">الترقيم</TabsTrigger>
          {/* المالية والامتثال */}
          <TabsTrigger value="accounting">التوجيه المحاسبي</TabsTrigger>
          <TabsTrigger value="zatca">هيئة الزكاة والضريبة</TabsTrigger>
          <TabsTrigger value="gov">التكاملات الحكومية</TabsTrigger>
          {/* النظام والمراقبة */}
          <TabsTrigger value="channels">قنوات الاتصال</TabsTrigger>
          <TabsTrigger value="task-sla">تذكير SLA للمهام</TabsTrigger>
          <TabsTrigger value="audit">التدقيق</TabsTrigger>
          <TabsTrigger value="resolved">الوراثة</TabsTrigger>
          <TabsTrigger value="custom-fields">الحقول المخصّصة</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings /></TabsContent>
        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="branches"><BranchesTab /></TabsContent>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="letterhead"><LetterheadSettings /></TabsContent>
        <TabsContent value="controls"><SystemControlsTab /></TabsContent>
        <TabsContent value="approvals"><ApprovalWorkflowsTab /></TabsContent>
        <TabsContent value="workflows"><WorkflowDefinitionsTab /></TabsContent>
        <TabsContent value="numbering"><NumberingTab /></TabsContent>
        <TabsContent value="accounting"><AccountingMappingsTab /></TabsContent>
        <TabsContent value="zatca"><ZatcaSettingsTab /></TabsContent>
        <TabsContent value="gov"><GovIntegrationsTab /></TabsContent>
        <TabsContent value="channels"><CommunicationChannelsTab /></TabsContent>
        <TabsContent value="task-sla"><TaskSlaReminderTab /></TabsContent>
        <TabsContent value="audit"><AuditLogTab /></TabsContent>
        <TabsContent value="resolved"><ResolvedSettingsTab /></TabsContent>
        <TabsContent value="custom-fields"><CustomFieldsTab /></TabsContent>
      </Tabs>
    </PageShell>
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
  // Print the effective-settings inheritance list (key / value / source). Hook
  // runs before the early returns below.
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);

  // GET /settings — raw key/value rows scoped to the current company.
  // GET /settings/resolve?key=... — probe a single key with full
  //   inheritance resolution.
  // PUT /settings + DELETE /settings — admin-only KV CRUD shown in the
  //   small "محرر متقدم" panel below the inheritance table.
  // GET /settings/timezone — server's resolved timezone string (used
  //   to verify what the rest of the platform sees).
  const rawSettingsQ = useApiQuery<any>(["settings-raw"], "/settings");
  const tzQ = useApiQuery<any>(["settings-timezone"], "/settings/timezone");
  const [probeKey, setProbeKey] = useState("");
  const probeQ = useApiQuery<any>(
    ["settings-resolve", probeKey],
    probeKey ? `/settings/resolve?key=${encodeURIComponent(probeKey)}` : null,
    { enabled: !!probeKey },
  );
  const [putKey, setPutKey] = useState("");
  const [putValue, setPutValue] = useState("");
  const putMut = useApiMutation<unknown, { key: string; value: string }>(
    "/settings", "PUT",
    [["settings-raw"], ["settings-resolved"]],
    { successMessage: "تم حفظ الإعداد" },
  );
  const delMut = useApiMutation<unknown, { key: string }>(
    "/settings", "DELETE",
    [["settings-raw"], ["settings-resolved"]],
    { successMessage: "تم حذف الإعداد" },
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => refetch()} error={error} />;
  const rawSettings: any[] = rawSettingsQ.data?.data ?? rawSettingsQ.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-status-info" />
          وراثة الإعدادات (نظام ← شركة ← فرع)
        </h3>
        {items.length > 0 && (
          <PrintButton
            entityType="report_settings_resolved"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "وراثة الإعدادات الفعلية", total: printRows.length },
              items: printRows.map((s: any) => ({
                "المفتاح": s.key,
                "القيمة": typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value ?? "—"),
                "المصدر": (SOURCE_LABELS[s.source] || SOURCE_LABELS.system).label,
              })),
            })}
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">يعرض القيمة الفعلية لكل إعداد ومصدرها — القيم الأقرب (فرع) تتغلب على القيم الأعلى (شركة/نظام)</p>
      <DataTable
        data={items as any[]}
        rowKey={(row) => String(row.key)}
        onSortedDataChange={setPrintRows}
        columns={[
          { key: "key", header: "المفتاح", render: (s) => <span className="font-mono text-xs">{s.key}</span> },
          { key: "value", header: "القيمة", render: (s) => <span className="text-muted-foreground truncate max-w-xs block">{typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value ?? "-")}</span> },
          { key: "source", header: "المصدر", render: (s) => { const src = SOURCE_LABELS[s.source] || SOURCE_LABELS.system; return <Badge className={cn(src.bg, src.color, "text-xs")}>{src.label}</Badge>; } },
        ]}
        emptyMessage="لا توجد إعدادات"
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">محرر متقدم (KV)</CardTitle>
          <p className="text-xs text-muted-foreground">للمستخدمين الإداريين — تحرير قيم الإعدادات مباشرةً مع كامل قواعد الوراثة</p>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {tzQ.data?.timezone && (
            <p className="text-muted-foreground">
              المنطقة الزمنية المتفعّلة على الخادم: <span className="font-mono">{tzQ.data.timezone}</span>
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="font-semibold mb-1">فحص مفتاح</p>
              <div className="flex gap-2">
                <input
                  value={probeKey}
                  onChange={(e) => setProbeKey(e.target.value)}
                  className="flex-1 h-7 px-2 border rounded text-xs"
                  dir="ltr"
                  placeholder="my.setting.key"
                />
              </div>
              {probeKey && probeQ.data && (
                <pre className="mt-2 bg-surface-subtle p-2 rounded max-h-32 overflow-y-auto">
                  {JSON.stringify(probeQ.data, null, 2)}
                </pre>
              )}
            </div>
            <div>
              <p className="font-semibold mb-1">حفظ / حذف</p>
              <div className="space-y-1">
                <input
                  value={putKey}
                  onChange={(e) => setPutKey(e.target.value)}
                  className="w-full h-7 px-2 border rounded text-xs"
                  dir="ltr"
                  placeholder="key"
                />
                <input
                  value={putValue}
                  onChange={(e) => setPutValue(e.target.value)}
                  className="w-full h-7 px-2 border rounded text-xs"
                  dir="ltr"
                  placeholder="value (JSON أو نص)"
                />
                <div className="flex items-center gap-2">
                  <GuardedButton
                    perm="settings:update"
                    size="sm"
                    rateLimitAware
                    disabled={!putKey.trim() || putMut.isPending}
                    onClick={() => putMut.mutate({ key: putKey.trim(), value: putValue })}
                  >
                    حفظ
                  </GuardedButton>
                  <GuardedButton
                    perm="settings:update"
                    size="sm"
                    variant="destructive"
                    rateLimitAware
                    disabled={!putKey.trim() || delMut.isPending}
                    onClick={() => delMut.mutate({ key: putKey.trim() }, { onSuccess: () => { setPutKey(""); setPutValue(""); } })}
                    title="حذف الإعداد (لا يمكن التراجع)"
                  >
                    حذف
                  </GuardedButton>
                </div>
              </div>
            </div>
          </div>
          {rawSettings.length > 0 && (
            <div>
              <p className="font-semibold mb-1">الإعدادات الخام ({rawSettings.length})</p>
              <div className="max-h-32 overflow-y-auto divide-y">
                {rawSettings.slice(0, 20).map((s: any, i: number) => (
                  <div key={s.key ?? i} className="py-1 flex items-center justify-between">
                    <span className="font-mono text-[10px]">{s.key}</span>
                    <span className="text-muted-foreground truncate max-w-[50%]">
                      {typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value ?? "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
      <DataTable
        data={items as any[]}
        rowKey={(row) => String(row.id)}
        columns={[
          { key: "userName", header: "المستخدم", render: (log) => log.userName || "-" },
          { key: "action", header: "الإجراء", render: (log) => log.action || "-" },
          { key: "module", header: "الوحدة", render: (log) => <span className="text-muted-foreground">{log.module || "-"}</span> },
          { key: "createdAt", header: "التاريخ", render: (log) => <span className="text-xs text-muted-foreground">{log.createdAt ? formatDateAr(log.createdAt) : "-"}</span> },
        ]}
        emptyMessage="لا توجد سجلات"
      />
    </div>
  );
}
