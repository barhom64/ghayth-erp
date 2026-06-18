/**
 * Print Templates — admin page for managing the document templates the
 * Print Engine uses. Replaces the "edit a JSON column in the DB" workflow
 * with a real editor:
 *
 *   • List every template the company owns + the seeded presets
 *   • Create / edit (name, entity, paper size, mode)
 *   • HTML body editor with token reference (collapsible)
 *   • Typography controls — font family / base size / colour — that
 *     write into `cssOverrides`
 *   • Header / footer override (logo URL, company name, footer text)
 *   • Live preview via /print/preview (no audit row, ephemeral)
 *   • Save → assign to a branch as default
 *
 * Permission: `templates:write` (server-side gate). The UI itself is
 * accessible to anyone who can navigate to /admin/print-templates;
 * the API rejects mutations from users without the permission, and the
 * Save button reads back the 403 to surface "no permission" toast.
 */

import { useState, useMemo, useEffect } from "react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApiQuery, apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { listTemplates, previewDocument, type PrintTemplateRow } from "@/lib/print-client";
import { Plus, Eye, Edit, Trash2, Type, Palette } from "lucide-react";

interface Template {
  id: number;
  name: string;
  entityType: string;
  branchId: number | null;
  paperSize: string;
  mode: "preset" | "html" | "visual";
  presetKey: string | null;
  htmlContent: string | null;
  cssOverrides: string | null;
  headerOverride: HeaderOverride | null;
  footerOverride: FooterOverride | null;
  isThermal: boolean;
  isDefault: boolean;
}

interface HeaderOverride {
  logoUrl?: string;
  companyName?: string;
  branchName?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  crNumber?: string;
}
interface FooterOverride {
  text?: string;
}

interface TypographyConfig {
  fontFamily: string;
  baseSizePt: number;
  headingColor: string;
  bodyColor: string;
  accentColor: string;
  lineHeight: number;
}

const ARABIC_FONTS = [
  { value: "'Noto Naskh Arabic', 'Tahoma', sans-serif", label: "Noto Naskh Arabic (الافتراضي)" },
  { value: "'Cairo', 'Tahoma', sans-serif", label: "Cairo" },
  { value: "'IBM Plex Sans Arabic', 'Tahoma', sans-serif", label: "IBM Plex Sans Arabic" },
  { value: "'Noto Kufi Arabic', 'Tahoma', sans-serif", label: "Noto Kufi Arabic" },
  { value: "'Tajawal', 'Tahoma', sans-serif", label: "Tajawal" },
  { value: "'Almarai', 'Tahoma', sans-serif", label: "Almarai" },
  { value: "'Amiri', 'Times New Roman', serif", label: "Amiri (تقليدي)" },
];

const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontFamily: "'Noto Naskh Arabic', 'Tahoma', sans-serif",
  baseSizePt: 11,
  headingColor: "#0f172a",
  bodyColor: "#0f172a",
  accentColor: "#334155",
  lineHeight: 1.55,
};

// Pack typography choices into a CSS string stored on the template's
// `cssOverrides` column. The Print Engine reads the column and appends
// it after the adapter's base CSS, so these rules override.
function typographyToCss(t: TypographyConfig): string {
  return `/* Print Template typography — auto-generated */
body { font-family: ${t.fontFamily}; font-size: ${t.baseSizePt}pt; color: ${t.bodyColor}; line-height: ${t.lineHeight}; }
h1, h2, h3, h4 { color: ${t.headingColor}; }
.print-doc { font-family: ${t.fontFamily}; }
table th { background: ${t.accentColor}1a; color: ${t.headingColor}; }
.totals .grand { color: ${t.headingColor}; }
`;
}

// Reverse: parse the cssOverrides string back into typography sliders.
// Best-effort regex extraction; falls back to defaults for anything missing.
function cssToTypography(css: string | null | undefined): TypographyConfig {
  if (!css) return DEFAULT_TYPOGRAPHY;
  const family = css.match(/font-family:\s*([^;]+);/)?.[1]?.trim() ?? DEFAULT_TYPOGRAPHY.fontFamily;
  const size = Number(css.match(/font-size:\s*(\d+(?:\.\d+)?)pt/)?.[1] ?? DEFAULT_TYPOGRAPHY.baseSizePt);
  const headingColor = css.match(/h1[^{]*\{[^}]*color:\s*(#[0-9a-fA-F]+)/)?.[1] ?? DEFAULT_TYPOGRAPHY.headingColor;
  const bodyColor = css.match(/body\s*\{[^}]*color:\s*(#[0-9a-fA-F]+)/)?.[1] ?? DEFAULT_TYPOGRAPHY.bodyColor;
  const accentColor = css.match(/background:\s*(#[0-9a-fA-F]+)/)?.[1] ?? DEFAULT_TYPOGRAPHY.accentColor;
  const lineHeight = Number(css.match(/line-height:\s*([\d.]+)/)?.[1] ?? DEFAULT_TYPOGRAPHY.lineHeight);
  return { fontFamily: family, baseSizePt: size, headingColor, bodyColor, accentColor, lineHeight };
}

// Standard entityTypes — only the ones the Print Engine has dataLoaders
// for. Trying to design a template for "unknown_entity" prints the
// universal fallback anyway, so the list is restricted to keep the UI
// honest.
// Fallback used while /api/print/entity-types loads. The full 100+ catalogue
// is fetched at runtime so the dropdown isn't a hand-maintained snapshot
// that's always missing the latest BESPOKE_PRESETS additions.
const ENTITY_TYPES_FALLBACK = [
  { value: "invoice", label: "فاتورة مبيعات" },
  { value: "credit_note", label: "إشعار دائن" },
  { value: "receipt_voucher", label: "سند قبض" },
  { value: "payment_voucher", label: "سند صرف" },
  { value: "purchase_order", label: "أمر شراء" },
  { value: "purchase_request", label: "طلب شراء" },
  { value: "goods_receipt", label: "إيصال استلام" },
  { value: "journal_entry", label: "قيد محاسبي" },
  { value: "payroll", label: "كشف رواتب" },
  { value: "payslip", label: "قسيمة راتب" },
  { value: "employee_contract", label: "عقد موظف" },
  { value: "official_letter", label: "خطاب رسمي" },
  { value: "umrah_invoice", label: "فاتورة عمرة" },
  { value: "umrah_statement", label: "كشف وكيل عمرة" },
];

const PAPER_SIZES = [
  { value: "A4", label: "A4" },
  { value: "A5", label: "A5" },
  { value: "THERMAL_80", label: "حراري 80mm" },
  { value: "THERMAL_58", label: "حراري 58mm" },
];

export default function PrintTemplatesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const { data, isLoading } = useApiQuery<{ items: PrintTemplateRow[] }>(
    ["print-templates-admin"],
    `/print/templates`,
  );
  const rows = useMemo<PrintTemplateRow[]>(() => data?.items ?? [], [data]);

  // GET /print/assignments + POST /print/assignments — branch-level
  // template overrides. POST creates a new (branch,entityType) →
  // templateId binding; the table shows existing bindings.
  const assignmentsQ = useApiQuery<{ items: any[] }>(["print-assignments"], "/print/assignments");
  const assignments: any[] = assignmentsQ.data?.items ?? [];
  const [newAssignBranch, setNewAssignBranch] = useState("");
  const [newAssignEntity, setNewAssignEntity] = useState("invoice");
  const [newAssignTemplate, setNewAssignTemplate] = useState("");
  const [newAssignIsDefault, setNewAssignIsDefault] = useState(true);
  const handleCreateAssignment = async () => {
    if (!newAssignTemplate.trim()) {
      toast({ variant: "destructive", title: "اختر القالب" });
      return;
    }
    try {
      await apiFetch("/print/assignments", {
        method: "POST",
        body: JSON.stringify({
          branchId: newAssignBranch ? Number(newAssignBranch) : null,
          entityType: newAssignEntity,
          templateId: Number(newAssignTemplate),
          // Mirror the server-side default (true) — the operator can flip
          // it later via the templates table if needed.
          isDefault: newAssignIsDefault,
        }),
      });
      toast({ title: "أُنشئ التعيين" });
      setNewAssignBranch(""); setNewAssignTemplate(""); setNewAssignIsDefault(true);
      assignmentsQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإنشاء", description: err?.message });
    }
  };

  // POST /print/deliver — renders + delivers a document via the chosen
  // channel (email/whatsapp/print-queue) in one round-trip.
  const [deliverEntity, setDeliverEntity] = useState("invoice");
  const [deliverEntityId, setDeliverEntityId] = useState("");
  const [deliverChannel, setDeliverChannel] = useState("email");
  const [deliverRecipient, setDeliverRecipient] = useState("");
  const handleDeliver = async () => {
    if (!deliverEntityId.trim() || !deliverRecipient.trim()) {
      toast({ variant: "destructive", title: "حدد الكيان والمستلم" });
      return;
    }
    try {
      const res = await apiFetch<any>("/print/deliver", {
        method: "POST",
        body: JSON.stringify({
          entityType: deliverEntity,
          entityId: Number(deliverEntityId),
          channel: deliverChannel,
          // Server expects `to: [{address, name?}]` — wrap the operator
          // input. Single-recipient is the only common case from this
          // admin probe.
          to: [{ address: deliverRecipient.trim() }],
        }),
      });
      toast({ title: "أُرسل المستند", description: res?.jobId ? `Job #${res.jobId}` : "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التسليم", description: err?.message });
    }
  };

  // POST /print/ai/suggest-template + /print/ai/draft-letter — AI helpers
  // that propose a template structure or draft body text from a sample
  // payload. Surfaced as a single small "AI" probe button per entity.
  const [aiEntity, setAiEntity] = useState("invoice");
  const [aiSamplePayload, setAiSamplePayload] = useState("{}");
  const [aiResult, setAiResult] = useState<any>(null);
  const callAiSuggest = async () => {
    try {
      const sample = JSON.parse(aiSamplePayload || "{}");
      const res = await apiFetch<any>("/print/ai/suggest-template", {
        method: "POST",
        body: JSON.stringify({ entityType: aiEntity, sampleData: sample, locale: "ar" }),
      });
      setAiResult(res);
      toast({ title: "اقتراح القالب جاهز" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الاقتراح", description: err?.message });
    }
  };
  const callAiDraftLetter = async () => {
    try {
      const sample = JSON.parse(aiSamplePayload || "{}");
      const res = await apiFetch<any>("/print/ai/draft-letter", {
        method: "POST",
        body: JSON.stringify({ entityType: aiEntity, sampleData: sample, locale: "ar" }),
      });
      setAiResult(res);
      toast({ title: "مسودة الخطاب جاهزة" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التوليد", description: err?.message });
    }
  };

  const cols: DataTableColumn<PrintTemplateRow>[] = [
    { key: "name", header: "الاسم", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "entityType", header: "النوع", render: (r) => <code className="text-xs">{r.entityType}</code> },
    { key: "branchId", header: "الفرع", render: (r) => (r.branchId === null ? "(جميع الفروع)" : `#${r.branchId}`) },
    { key: "paperSize", header: "حجم الورق", render: (r) => r.paperSize },
    { key: "mode", header: "النمط", render: (r) => r.mode },
    { key: "isDefault", header: "افتراضي", render: (r) => (r.isDefault ? "نعم" : "لا") },
    {
      key: "id" as keyof PrintTemplateRow,
      header: "إجراءات",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(r.id)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => preview(r.id, r.entityType)}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  async function openEdit(id: number) {
    try {
      // The list endpoint only returns the summary shape. Fetch the full
      // row by re-listing with `entityType` filter and finding it. The
      // /templates/:id GET isn't exposed yet, so we hydrate from the
      // small list. Good enough until the editor needs more fields.
      const item = rows.find((r) => r.id === id);
      if (!item) throw new Error("template not found in list");
      // Hydrate the full template row from the API directly.
      const fullList = await apiFetch<{ items: Template[] }>(
        `/print/templates?entityType=${encodeURIComponent(item.entityType)}`,
      );
      const full = fullList.items.find((t) => t.id === id);
      if (!full) throw new Error("hydrate failed");
      setEditing(full);
    } catch (err) {
      toast({ title: "تعذّر فتح القالب", description: (err as ApiError)?.message ?? "—", variant: "destructive" });
    }
  }

  function openNew() {
    setEditing({
      name: "قالب جديد",
      entityType: "invoice",
      branchId: null,
      paperSize: "A4",
      mode: "preset",
      htmlContent: DEFAULT_HTML,
      cssOverrides: typographyToCss(DEFAULT_TYPOGRAPHY),
      headerOverride: {},
      footerOverride: { text: "" },
      isThermal: false,
      isDefault: false,
    });
  }

  async function preview(id: number, entityType: string) {
    try {
      const blob = await previewDocument({ entityType, templateId: id });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({ title: "تعذّرت المعاينة", description: (err as ApiError)?.message ?? "—", variant: "destructive" });
    }
  }

  return (
    <PageShell
      title="قوالب الطباعة"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "قوالب الطباعة" },
      ]}
      subtitle="إدارة قوالب المستندات: الخطوط، الألوان، الـ HTML، التذييل والترويسة"
      loading={isLoading}
      actions={
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          قالب جديد
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>القوالب المتاحة ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={cols}
            data={rows}
            rowKey={(r) => String(r.id)}
            emptyMessage="لا توجد قوالب — أنشئ واحداً لتبدأ"
          />
        </CardContent>
      </Card>

      {editing && (
        <TemplateEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["print-templates-admin"] });
            setEditing(null);
            toast({ title: "حُفظ القالب", description: "أصبح متاحاً للطباعة الآن." });
          }}
        />
      )}

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تعيينات القوالب على الفروع ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="max-h-32 overflow-y-auto divide-y border rounded">
            {assignments.slice(0, 20).map((a: any) => (
              <div key={a.id} className="px-2 py-1 flex items-center justify-between">
                <span className="font-mono text-[10px]">
                  {a.branchName ?? "(جميع الفروع)"} · {a.entityType} → #{a.templateId} ({a.templateName})
                </span>
                {a.isDefault && <Badge variant="outline" className="text-[10px]">افتراضي</Badge>}
              </div>
            ))}
            {assignments.length === 0 && (
              <p className="text-muted-foreground p-2 text-center">لا توجد تعيينات</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
            <div>
              <label className="text-[10px] text-muted-foreground">رقم الفرع (اختياري)</label>
              <input value={newAssignBranch} onChange={(e) => setNewAssignBranch(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">نوع الكيان</label>
              <input value={newAssignEntity} onChange={(e) => setNewAssignEntity(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">رقم القالب</label>
              <input value={newAssignTemplate} onChange={(e) => setNewAssignTemplate(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded text-xs" />
            </div>
            <GuardedButton perm="templates:write" size="sm" onClick={handleCreateAssignment} rateLimitAware>إنشاء تعيين</GuardedButton>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newAssignIsDefault} onChange={(e) => setNewAssignIsDefault(e.target.checked)} />
              تعيين افتراضي
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تسليم مستند فوري</CardTitle>
          <p className="text-xs text-muted-foreground">يولّد المستند ثم يرسله مباشرةً عبر القناة المختارة.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end text-xs">
          <div>
            <label className="text-[10px] text-muted-foreground">نوع الكيان</label>
            <input value={deliverEntity} onChange={(e) => setDeliverEntity(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">رقم الكيان</label>
            <input value={deliverEntityId} onChange={(e) => setDeliverEntityId(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">القناة</label>
            <select value={deliverChannel} onChange={(e) => setDeliverChannel(e.target.value)} className="w-full h-7 px-2 border rounded bg-white">
              <option value="email">بريد إلكتروني</option>
              <option value="whatsapp">واتساب</option>
              <option value="sms">رسالة نصية</option>
              <option value="internal_inbox">صندوق داخلي</option>
              <option value="download">تنزيل (Download)</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-[10px] text-muted-foreground">المستلم</label>
            <input value={deliverRecipient} onChange={(e) => setDeliverRecipient(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded" />
          </div>
          <GuardedButton perm="print:create" size="sm" onClick={handleDeliver} rateLimitAware>تسليم</GuardedButton>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">مساعدات AI</CardTitle>
          <p className="text-xs text-muted-foreground">اقترح قالباً جديداً أو سوّد خطاباً انطلاقاً من عيّنة بيانات.</p>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">نوع الكيان</label>
              <input value={aiEntity} onChange={(e) => setAiEntity(e.target.value)} dir="ltr" className="w-full h-7 px-2 border rounded" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] text-muted-foreground">عيّنة JSON</label>
              <textarea value={aiSamplePayload} onChange={(e) => setAiSamplePayload(e.target.value)} dir="ltr" className="w-full h-16 px-2 py-1 border rounded font-mono" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GuardedButton perm="templates:write" size="sm" variant="outline" onClick={callAiSuggest} rateLimitAware>اقتراح قالب</GuardedButton>
            <GuardedButton perm="templates:write" size="sm" variant="outline" onClick={callAiDraftLetter} rateLimitAware>توليد خطاب</GuardedButton>
          </div>
          {aiResult && (
            <pre className="bg-surface-subtle p-2 rounded max-h-40 overflow-y-auto text-[10px]">
              {JSON.stringify(aiResult, null, 2).slice(0, 1500)}
            </pre>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

// ───────────── Editor dialog ─────────────

const DEFAULT_HTML = `<div class="print-doc">
{{branch.letterhead}}
<h2 style="text-align:center;margin:16px 0">عنوان المستند</h2>
<div class="meta-grid">
  <div><strong>المرجع:</strong> {{entity.ref}}</div>
  <div><strong>التاريخ:</strong> {{entity.createdAt}}</div>
  <div><strong>الحالة:</strong> {{entity.status}}</div>
</div>
{{entity.itemsTable}}
{{system.verifyBlock}}
{{branch.footer}}
</div>`;

function TemplateEditor(props: {
  initial: Partial<Template>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { initial, onClose, onSaved } = props;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Template>>(initial);
  // Pull the full catalogue at runtime so the dropdown always reflects the
  // engine's BESPOKE_PRESETS ∪ ARABIC_TITLES set. Falls back to the small
  // hand-list when the endpoint is unreachable.
  const { data: entityTypesResp } = useApiQuery<{ items: Array<{ id: string; label: string }> }>(
    ["print-entity-types"],
    "/print/entity-types",
  );
  const ENTITY_TYPES = entityTypesResp?.items?.length
    ? entityTypesResp.items.map((e) => ({ value: e.id, label: e.label }))
    : ENTITY_TYPES_FALLBACK;
  const [typo, setTypo] = useState<TypographyConfig>(cssToTypography(initial.cssOverrides));

  // When typography sliders change, regenerate cssOverrides.
  useEffect(() => {
    setForm((f) => ({ ...f, cssOverrides: typographyToCss(typo) }));
  }, [typo]);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        entityType: form.entityType,
        branchId: form.branchId,
        paperSize: form.paperSize,
        mode: form.mode ?? "preset",
        htmlContent: form.htmlContent,
        cssOverrides: form.cssOverrides,
        headerOverride: form.headerOverride,
        footerOverride: form.footerOverride,
        isThermal: form.isThermal,
        isDefault: form.isDefault,
      };
      if (form.id) {
        await apiFetch(`/print/templates/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/print/templates`, { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      toast({
        title: "تعذّر حفظ القالب",
        description: (err as ApiError)?.message ?? "—",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function previewLive() {
    try {
      // /preview now accepts an in-flight `htmlContent` so the user sees
      // their unsaved edits before committing. When provided, the engine
      // builds an in-memory template wrapping that markup — no DB hit.
      // If the form has no htmlContent yet (e.g. user opened a preset and
      // hasn't customised) we fall back to entity defaults + payload only.
      const w = window.open("", "_blank");
      if (w) {
        w.document.write("<!doctype html><html><body>جاري التحضير…</body></html>");
      }
      const resp = await fetch(`/api/print/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": readCsrf() ?? "",
        },
        credentials: "include",
        body: JSON.stringify({
          entityType: form.entityType,
          ...(form.htmlContent ? {
            htmlContent: form.htmlContent,
            presetKey: form.presetKey ?? undefined,
            paperSize: form.paperSize ?? "A4",
          } : {}),
          payload: {
            entity: {
              id: "preview",
              ref: "PREVIEW-001",
              createdAt: new Date().toISOString().slice(0, 10), // utc-ok: synthetic preview payload, no business effect
              status: "draft",
              subtotal: 1000,
              vatRate: 15,
              vatAmount: 150,
              total: 1150,
              currency: "SAR",
            },
            items: [
              { description: "بند تجريبي 1", quantity: 2, unitPrice: 250, totalPrice: 500 },
              { description: "بند تجريبي 2", quantity: 1, unitPrice: 500, totalPrice: 500 },
            ],
            client: { name: "عميل تجريبي", taxNumber: "300123456700003" },
          },
        }),
      });
      if (!resp.ok) {
        // Surface the actual server-side error instead of a bare status code
        // so the user knows what went wrong (permission, schema, syntax).
        const text = await resp.text().catch(() => "");
        let detail = `preview ${resp.status}`;
        try {
          const j = JSON.parse(text);
          if (j?.message) detail = j.message;
          else if (j?.error) detail = typeof j.error === "string" ? j.error : detail;
        } catch { /* not JSON */ }
        throw new Error(detail);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (w) {
        w.location.href = url;
      } else {
        window.location.href = url;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast({ title: "تعذّرت المعاينة", description: (err as Error)?.message ?? "—", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "تعديل قالب" : "قالب جديد"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <Field label="الاسم">
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="نوع المستند">
            <Select value={form.entityType ?? ""} onValueChange={(v) => setForm({ ...form, entityType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="حجم الورق">
            <Select value={form.paperSize ?? "A4"} onValueChange={(v) => setForm({ ...form, paperSize: v as Template["paperSize"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="معرّف الفرع (اتركه فارغاً للجميع)">
            <Input
              type="number"
              value={form.branchId ?? ""}
              onChange={(e) => setForm({ ...form, branchId: e.target.value ? Number(e.target.value) : null })}
              placeholder="جميع الفروع"
            />
          </Field>
        </div>

        {/* Typography section — the user's "تحكم في الخطوط" ask */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Type className="h-4 w-4" />
              الخطوط والألوان
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="عائلة الخط">
                <Select value={typo.fontFamily} onValueChange={(v) => setTypo({ ...typo, fontFamily: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARABIC_FONTS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`حجم الخط الأساسي (${typo.baseSizePt}pt)`}>
                <input
                  type="range"
                  min={8}
                  max={16}
                  step={0.5}
                  value={typo.baseSizePt}
                  onChange={(e) => setTypo({ ...typo, baseSizePt: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
              <Field label="لون النص">
                <div className="flex items-center gap-2">
                  <input type="color" value={typo.bodyColor} onChange={(e) => setTypo({ ...typo, bodyColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border" />
                  <Input value={typo.bodyColor} onChange={(e) => setTypo({ ...typo, bodyColor: e.target.value })} className="font-mono text-xs" />
                </div>
              </Field>
              <Field label="لون العناوين">
                <div className="flex items-center gap-2">
                  <input type="color" value={typo.headingColor} onChange={(e) => setTypo({ ...typo, headingColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border" />
                  <Input value={typo.headingColor} onChange={(e) => setTypo({ ...typo, headingColor: e.target.value })} className="font-mono text-xs" />
                </div>
              </Field>
              <Field label="لون التمييز (جداول)">
                <div className="flex items-center gap-2">
                  <input type="color" value={typo.accentColor} onChange={(e) => setTypo({ ...typo, accentColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border" />
                  <Input value={typo.accentColor} onChange={(e) => setTypo({ ...typo, accentColor: e.target.value })} className="font-mono text-xs" />
                </div>
              </Field>
              <Field label={`المسافة بين السطور (${typo.lineHeight})`}>
                <input
                  type="range"
                  min={1.0}
                  max={2.4}
                  step={0.05}
                  value={typo.lineHeight}
                  onChange={(e) => setTypo({ ...typo, lineHeight: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Branding overrides */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="h-4 w-4" />
              الهوية (تظهر في الترويسة)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="رابط الشعار (Logo URL)">
              <Input
                value={form.headerOverride?.logoUrl ?? ""}
                onChange={(e) => setForm({ ...form, headerOverride: { ...form.headerOverride, logoUrl: e.target.value } })}
                placeholder="https://..."
              />
            </Field>
            <Field label="اسم الشركة (تجاوز)">
              <Input
                value={form.headerOverride?.companyName ?? ""}
                onChange={(e) => setForm({ ...form, headerOverride: { ...form.headerOverride, companyName: e.target.value } })}
                placeholder="ترك فارغاً = اسم الفرع من DB"
              />
            </Field>
            <Field label="نص التذييل (Footer)">
              <Input
                value={form.footerOverride?.text ?? ""}
                onChange={(e) => setForm({ ...form, footerOverride: { ...form.footerOverride, text: e.target.value } })}
                placeholder="مثال: شكراً لتعاملكم معنا"
              />
            </Field>
          </CardContent>
        </Card>

        {/* HTML body */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">محتوى المستند (HTML)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={14}
              value={form.htmlContent ?? ""}
              onChange={(e) => setForm({ ...form, htmlContent: e.target.value })}
              className="font-mono text-xs"
              dir="ltr"
            />
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer">المتغيرات المتاحة (انقر للعرض)</summary>
              <pre className="mt-2 text-xs bg-slate-50 p-2 rounded" dir="ltr">{`{{branch.letterhead}}       شريط الفرع الكامل (شعار + عنوان + هاتف)
{{branch.footer}}            تذييل الفرع (الرقم الضريبي + السجل التجاري)
{{entity.ref}}               مرجع المستند
{{entity.createdAt}}         التاريخ
{{entity.status}}            الحالة
{{entity.total}}             الإجمالي
{{entity.itemsTable}}        جدول البنود التلقائي
{{client.name}}              اسم العميل
{{client.taxNumber}}         الرقم الضريبي للعميل
{{system.verifyBlock}}       صندوق QR للتحقق (Phase 6)
{{#each items}}…{{/each}}    حلقة بنود مخصصة، استخدم {{this.X}} داخلها
{{@index}}                   رقم الصف (يبدأ من 1)`}</pre>
            </details>
          </CardContent>
        </Card>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="outline" onClick={previewLive}>
            <Eye className="h-4 w-4 ml-2" />
            معاينة
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function readCsrf(): string | null {
  const m = document.cookie.match(/(?:^|; )erp_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
