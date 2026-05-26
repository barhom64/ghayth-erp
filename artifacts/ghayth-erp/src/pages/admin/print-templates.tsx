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
const ENTITY_TYPES = [
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
          <DataTable<PrintTemplateRow>
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
        w.document.write("<!doctype html><html><body>جارٍ التحضير…</body></html>");
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
            {saving ? "جارٍ الحفظ…" : "حفظ"}
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
