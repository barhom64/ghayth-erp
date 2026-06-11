/**
 * Print Templates settings — manage per-branch print clichés.
 *
 *   /settings/print-templates           list + assignment grid
 *   /settings/print-templates/new       create
 *   /settings/print-templates/:id       edit one
 *
 * Modes: preset (logo + colours + header/footer), HTML (raw editor with live
 * preview), visual (drag-and-drop). v1 ships preset + HTML; visual surface
 * is scaffolded with a "coming soon" tab so the route is ready.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useApiQuery, apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Eye, Trash2, Pencil, FileText, Receipt, Tag, Layers } from "lucide-react";
import { PageHeader, PageShell } from "@workspace/ui-core";
import { PrintButton } from "@/components/shared/print-button";
import { cn } from "@/lib/utils";

// Fallback list used while /api/print/entity-types loads. The full catalogue
// (100+ types — every BESPOKE_PRESETS key + every ARABIC_TITLES key) is
// fetched at runtime so adding a preset never requires editing this file.
const PRINTABLE_ENTITIES_FALLBACK = [
  { id: "invoice", label: "فاتورة" },
  { id: "quotation", label: "عرض سعر" },
  { id: "sales_order", label: "أمر بيع" },
  { id: "delivery_note", label: "سند تسليم" },
  { id: "credit_note", label: "إشعار دائن" },
  { id: "pos_receipt", label: "إيصال نقطة بيع" },
  { id: "receipt_voucher", label: "سند قبض" },
  { id: "payment_voucher", label: "سند صرف" },
  { id: "purchase_order", label: "أمر شراء" },
  { id: "journal_entry", label: "قيد محاسبي" },
  { id: "payroll", label: "إيصال راتب" },
  { id: "official_letter", label: "خطاب رسمي" },
];

// Tokens the preview helper exposes. Drives a sidebar in the HTML mode so
// the user can copy a `{{...}}` instead of guessing — solves the "ما فيه
// دليل" complaint about the editor.
const PRINT_TOKENS: Array<{ token: string; category: string; description: string }> = [
  // Branch / company
  { token: "{{branch.letterhead}}", category: "ترويسة", description: "ترويسة A4 تلقائية (لوغو + اسم الشركة + الفرع + الرقم الضريبي)" },
  { token: "{{branch.letterheadThermal}}", category: "ترويسة", description: "ترويسة مضغوطة للطباعة الحرارية" },
  { token: "{{branch.footer}}", category: "ترويسة", description: "تذييل تلقائي" },
  { token: "{{branch.companyName}}", category: "ترويسة", description: "اسم الشركة" },
  { token: "{{branch.branchName}}", category: "ترويسة", description: "اسم الفرع" },
  { token: "{{branch.taxNumber}}", category: "ترويسة", description: "الرقم الضريبي" },
  { token: "{{branch.crNumber}}", category: "ترويسة", description: "السجل التجاري" },
  { token: "{{branch.address}}", category: "ترويسة", description: "العنوان" },
  { token: "{{branch.phone}}", category: "ترويسة", description: "الهاتف" },
  { token: "{{branch.email}}", category: "ترويسة", description: "البريد الإلكتروني" },
  // Entity (canonical fields)
  { token: "{{entity.id}}", category: "بيانات الكيان", description: "المعرّف" },
  { token: "{{entity.ref}}", category: "بيانات الكيان", description: "المرجع / الرقم المُسلسل" },
  { token: "{{entity.title}}", category: "بيانات الكيان", description: "عنوان الوثيقة (يُملأ تلقائياً)" },
  { token: "{{entity.date}}", category: "بيانات الكيان", description: "التاريخ" },
  { token: "{{entity.status}}", category: "بيانات الكيان", description: "الحالة" },
  { token: "{{entity.total}}", category: "بيانات الكيان", description: "الإجمالي" },
  { token: "{{entity.subtotal}}", category: "بيانات الكيان", description: "المجموع قبل الضريبة" },
  { token: "{{entity.vatAmount}}", category: "بيانات الكيان", description: "قيمة الضريبة" },
  { token: "{{entity.currency}}", category: "بيانات الكيان", description: "العملة" },
  { token: "{{entity.notes}}", category: "بيانات الكيان", description: "ملاحظات" },
  // Auto-built tables
  { token: "{{entity.itemsTable}}", category: "جداول", description: "جدول البنود تلقائي (يبني الأعمدة من المفاتيح)" },
  { token: "{{entity.linesTable}}", category: "جداول", description: "جدول السطور (للقيود المحاسبية)" },
  { token: "{{entity.movementsTable}}", category: "جداول", description: "جدول الحركات (لكشف الحساب)" },
  // System / verification
  { token: "{{system.verifyBlock}}", category: "تحقق", description: "صندوق التحقق + QR (يُسجَّل تلقائياً)" },
  { token: "{{system.verifyQr}}", category: "تحقق", description: "صورة QR فقط" },
  { token: "{{system.verifyUrl}}", category: "تحقق", description: "رابط التحقق العلني" },
  // Dates
  { token: "{{date.today}}", category: "تاريخ", description: "تاريخ اليوم بصيغة عربية" },
  { token: "{{date.now}}", category: "تاريخ", description: "التاريخ والوقت الآن" },
  // Helpers
  { token: "{{#each items}}…{{/each}}", category: "مساعدات", description: "تكرار قائمة عناصر" },
  { token: "{{#if entity.note}}…{{/if}}", category: "مساعدات", description: "إظهار شرطي" },
];

const PAPER_SIZES = [
  { id: "A4", label: "A4 (21×29.7 سم)" },
  { id: "A5", label: "A5 (14.8×21 سم)" },
  { id: "THERMAL_80", label: "حراري 80mm" },
  { id: "THERMAL_58", label: "حراري 58mm" },
  { id: "LABEL_50x30", label: "ملصق 50×30mm" },
  { id: "LABEL_100x50", label: "ملصق 100×50mm" },
];

interface TemplateRow {
  id: number;
  name: string;
  entityType: string | null;
  branchId: number | null;
  paperSize: string;
  mode: "preset" | "html" | "visual";
  presetKey: string | null;
  htmlContent: string | null;
  cssOverrides: string | null;
  layoutJson: unknown;
  headerOverride: Record<string, string> | null;
  footerOverride: Record<string, string> | null;
  isThermal: boolean;
  isDefault: boolean;
  isActive: boolean;
}

// ─── Visual builder schema ──────────────────────────────────────────────────
// Mirrors the block types renderLayoutToHtml() understands on the server.

export type VisualBlock =
  | { id: string; type: "header" }
  | { id: string; type: "footer" }
  | { id: string; type: "title"; text: string; level: 1 | 2 | 3 }
  | { id: string; type: "text"; body: string }
  | { id: string; type: "info_grid"; items: Array<{ label: string; value: string }> }
  | { id: string; type: "items_table" }
  | { id: string; type: "lines_table" }
  | { id: string; type: "summary"; items: Array<{ label: string; value: string; bold?: boolean }> }
  | { id: string; type: "signature"; parties: Array<{ label: string }> }
  | { id: string; type: "qr"; value?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number };

const BLOCK_PALETTE: Array<{ type: VisualBlock["type"]; label: string; icon: string }> = [
  { type: "header", label: "ترويسة الفرع", icon: "🏢" },
  { type: "title", label: "عنوان", icon: "T" },
  { type: "text", label: "فقرة نص", icon: "¶" },
  { type: "info_grid", label: "شبكة معلومات", icon: "▦" },
  { type: "items_table", label: "جدول البنود", icon: "▤" },
  { type: "lines_table", label: "جدول السطور", icon: "▥" },
  { type: "summary", label: "ملخص/إجماليات", icon: "Σ" },
  { type: "signature", label: "تواقيع", icon: "✍" },
  { type: "qr", label: "رمز QR", icon: "▢" },
  { type: "divider", label: "فاصل", icon: "—" },
  { type: "spacer", label: "مسافة", icon: "↕" },
  { type: "footer", label: "تذييل الفرع", icon: "▁" },
];

function newBlock(type: VisualBlock["type"]): VisualBlock {
  const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case "header": return { id, type };
    case "footer": return { id, type };
    case "title": return { id, type, text: "عنوان الوثيقة", level: 2 };
    case "text": return { id, type, body: "نص الفقرة هنا. يمكن استخدام {{path}} للحقول الديناميكية." };
    case "info_grid": return { id, type, items: [{ label: "الرقم", value: "{{entity.ref}}" }, { label: "التاريخ", value: "{{entity.date}}" }] };
    case "items_table": return { id, type };
    case "lines_table": return { id, type };
    case "summary": return { id, type, items: [{ label: "الإجمالي", value: "{{entity.total}}", bold: true }] };
    case "signature": return { id, type, parties: [{ label: "التوقيع الأول" }, { label: "التوقيع الثاني" }] };
    case "qr": return { id, type, value: "{{entity.zatcaQr}}" };
    case "divider": return { id, type };
    case "spacer": return { id, type, height: 16 };
  }
}

// Built-in branded preset themes — mirrors lib/print/brandedThemes.ts.
// Each carries a tiny visual swatch so the operator picks by sight, not
// by reading a dropdown. Brand palette: teal #3FBFD9 / navy #0F3D5C.
const PRESET_THEMES: Array<{
  key: string;
  label: string;
  description: string;
  swatch: React.ReactNode;
}> = [
  {
    key: "classic",
    label: "كلاسيكي",
    description: "ترويسة كحلية، جداول محدّدة، رسمي. الخيار الآمن.",
    swatch: (
      <div className="p-1.5 flex flex-col gap-1">
        <div style={{ height: 6, background: "#0F3D5C", borderRadius: 2 }} />
        <div style={{ height: 3, background: "#cbd5e1", width: "60%", borderRadius: 2 }} />
        <div style={{ flex: 1, border: "1px solid #cbd5e1", borderRadius: 2, marginTop: 2 }} />
      </div>
    ),
  },
  {
    key: "modern",
    label: "عصري",
    description: "شريط فيروزي متدرّج، صفوف بدون حدود، مساحات واسعة.",
    swatch: (
      <div className="p-1.5 flex flex-col gap-1">
        <div style={{ height: 8, background: "linear-gradient(90deg,#3FBFD9,#0F3D5C)", borderRadius: 3 }} />
        <div style={{ height: 3, background: "#eaf7fb", borderRadius: 2 }} />
        <div style={{ height: 3, background: "#f1f5f9", borderRadius: 2 }} />
        <div style={{ height: 3, background: "#eaf7fb", borderRadius: 2 }} />
      </div>
    ),
  },
  {
    key: "compact",
    label: "مدمج",
    description: "خط صغير، خطوط رفيعة — يسع بنوداً أكثر في الصفحة.",
    swatch: (
      <div className="p-1.5 flex flex-col gap-[3px]">
        <div style={{ height: 4, background: "#3FBFD9", width: "50%", borderRadius: 1 }} />
        <div style={{ height: 2, background: "#cbd5e1", borderRadius: 1 }} />
        <div style={{ height: 2, background: "#cbd5e1", borderRadius: 1 }} />
        <div style={{ height: 2, background: "#cbd5e1", borderRadius: 1 }} />
        <div style={{ height: 2, background: "#cbd5e1", borderRadius: 1 }} />
      </div>
    ),
  },
];

// Default margins follow the A4 adapter's seed (a4Adapter.ts:25):
// 18mm top / 14mm sides / 22mm bottom.
const DEFAULT_MARGINS = { top: 18, right: 14, bottom: 22, left: 14 };

function parseMarginsFromCss(css: string | null) {
  if (!css) return { ...DEFAULT_MARGINS };
  // Match `margin: Tmm Rmm Bmm Lmm` inside `@page { ... }` block.
  const pageRule = css.match(/@page\s*\{([^}]+)\}/);
  if (!pageRule) return { ...DEFAULT_MARGINS };
  const marginDecl = pageRule[1].match(/margin\s*:\s*([\d.]+)mm\s+([\d.]+)mm\s+([\d.]+)mm\s+([\d.]+)mm/);
  if (!marginDecl) return { ...DEFAULT_MARGINS };
  return {
    top: Number(marginDecl[1]) || DEFAULT_MARGINS.top,
    right: Number(marginDecl[2]) || DEFAULT_MARGINS.right,
    bottom: Number(marginDecl[3]) || DEFAULT_MARGINS.bottom,
    left: Number(marginDecl[4]) || DEFAULT_MARGINS.left,
  };
}

function buildMarginsCss(m: { top: number; right: number; bottom: number; left: number }): string {
  // Empty string when the user hasn't touched the defaults — keeps the
  // saved row clean and lets the adapter's own seed CSS rule kick in.
  if (
    m.top === DEFAULT_MARGINS.top &&
    m.right === DEFAULT_MARGINS.right &&
    m.bottom === DEFAULT_MARGINS.bottom &&
    m.left === DEFAULT_MARGINS.left
  ) {
    return "";
  }
  return `@page { margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
}

export default function PrintTemplatesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useApiQuery<{ items: TemplateRow[] }>(
    ["print-templates"],
    "/print/templates"
  );
  const { data: branchesData } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  // Pull the full printable-entity catalogue from the backend so adding a
  // new preset never requires a SPA release. Falls back to the small
  // hard-coded list if the endpoint is unreachable (rate-limit, network).
  const { data: entityTypesResp } = useApiQuery<{ items: Array<{ id: string; label: string; hasBespokePreset: boolean }> }>(
    ["print-entity-types"],
    "/print/entity-types"
  );
  const PRINTABLE_ENTITIES = useMemo(
    () => entityTypesResp?.items?.length
      ? entityTypesResp.items.map((e) => ({ id: e.id, label: e.label }))
      : PRINTABLE_ENTITIES_FALLBACK,
    [entityTypesResp],
  );
  const branches = (branchesData?.data ?? branchesData?.items ?? []) as Array<{ id: number; name: string }>;
  const items = data?.items ?? [];
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  async function handleUploadTemplate(file: File) {
    setUploadingTemplate(true);
    try {
      // Default entity type comes from the current filter — operator usually
      // browses to "invoice" templates and uploads a cliché for that entity.
      const defaultEntity = filterEntity === "all" ? "invoice" : filterEntity;
      const form = new FormData();
      form.append("template", file);
      form.append("name", file.name.replace(/\.html?$/i, ""));
      form.append("entityType", defaultEntity);
      form.append("paperSize", "A4");
      const res = await apiFetch<{ templateId?: number }>("/print/uploads/template", {
        method: "POST",
        body: form,
        // apiFetch sets Content-Type: application/json by default — strip it
        // so the browser supplies the multipart boundary.
        headers: {},
      } as RequestInit);
      toast({ title: "تم رفع الكليشة", description: `${file.name} (${defaultEntity})` });
      void qc.invalidateQueries({ queryKey: ["print-templates"] });
      if (res?.templateId) setEditingId(res.templateId);
    } catch (err) {
      const e = err as ApiError;
      toast({
        variant: "destructive",
        title: "فشل رفع الكليشة",
        description: e.message,
      });
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function handleResetTemplate(id: number, name: string) {
    if (!confirm(`إعادة قالب "${name}" إلى الإصدار الافتراضي؟ ستفقد التعديلات.`)) return;
    try {
      await apiFetch(`/print/templates/${id}/reset`, { method: "POST" });
      toast({ title: "تم استعادة القالب الافتراضي" });
      void qc.invalidateQueries({ queryKey: ["print-templates"] });
    } catch (err) {
      const e = err as ApiError;
      toast({
        variant: "destructive",
        title: "فشل الاستعادة",
        description: e.message,
      });
    }
  }

  const filtered = useMemo(
    () => items.filter((t) => (filterEntity === "all" ? true : t.entityType === filterEntity)),
    [items, filterEntity]
  );

  if (editingId !== null) {
    return (
      <TemplateEditor
        templateId={editingId === "new" ? null : editingId}
        templates={items}
        branches={branches}
        entities={PRINTABLE_ENTITIES}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <PageShell
      title="قوالب الطباعة (الكليشة)"
      subtitle="بناء وتخصيص قوالب الطباعة لكل فرع بشكل مستقل"
      breadcrumbs={[{ label: "الإعدادات" }, { label: "قوالب الطباعة" }]}
      actions={
        <>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".html,.htm,text/html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadTemplate(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => uploadInputRef.current?.click()}
            className="gap-1"
            title="رفع ملف HTML لقالب جاهز"
            disabled={uploadingTemplate}
          >
            <Plus className="h-4 w-4" />
            {uploadingTemplate ? "جاري الرفع..." : "رفع كليشة جاهزة"}
          </Button>
          <Button onClick={() => setEditingId("new")} className="gap-1">
            <Plus className="h-4 w-4" /> قالب جديد
          </Button>
          <PrintButton
            entityType="report_settings_print_templates"
            entityId="list"
            size="icon"
            payload={{
              entity: { title: "قوالب الطباعة", total: filtered.length },
              items: filtered.map((t: any) => ({
                "الاسم": t.name || "—",
                "نوع الكيان": t.entityType || "—",
                "الفرع": branches.find((b) => b.id === t.branchId)?.name || (t.branchId ? `#${t.branchId}` : "الشركة"),
                "الوضع": t.mode || "—",
                "افتراضي": t.isDefault ? "نعم" : "لا",
                "نشط": t.isActive ? "نعم" : "لا",
              })),
            }}
          />
        </>
      }
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" /> القوالب الموجودة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm">تصفية حسب الكيان:</Label>
            <Select value={filterEntity} onValueChange={setFilterEntity}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الكيانات</SelectItem>
                {PRINTABLE_ENTITIES.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground p-4">جاري التحميل…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 text-center">
              لا توجد قوالب بعد. أنشئ قالباً جديداً للبدء.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right p-2">الاسم</th>
                    <th className="text-right p-2">الكيان</th>
                    <th className="text-right p-2">الفرع</th>
                    <th className="text-right p-2">الورق</th>
                    <th className="text-right p-2">الوضع</th>
                    <th className="text-right p-2">افتراضي</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">{t.name}</td>
                      <td className="p-2">
                        {PRINTABLE_ENTITIES.find((e) => e.id === t.entityType)?.label ?? t.entityType ?? "—"}
                      </td>
                      <td className="p-2">
                        {t.branchId ? branches.find((b) => b.id === t.branchId)?.name ?? `#${t.branchId}` : "كل الفروع"}
                      </td>
                      <td className="p-2">{t.paperSize}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1 text-xs">
                          {t.mode === "preset" && <FileText className="h-3 w-3" />}
                          {t.mode === "html" && <Pencil className="h-3 w-3" />}
                          {t.mode === "visual" && <Layers className="h-3 w-3" />}
                          {t.mode}
                        </span>
                      </td>
                      <td className="p-2">{t.isDefault ? "✓" : ""}</td>
                      <td className="p-2 text-left">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(t.id)} title="تعديل">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="استنساخ هذا القالب"
                            onClick={async () => {
                              // Quick duplicate — POST a copy of the row with
                              // "(نسخة)" appended and unset isDefault. Then
                              // open the duplicated row in the editor so the
                              // user lands on the edit screen ready to tweak.
                              try {
                                const created = await apiFetch<{ id: number }>(
                                  "/print/templates",
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      name: `${t.name} (نسخة)`,
                                      entityType: t.entityType,
                                      branchId: t.branchId,
                                      paperSize: t.paperSize,
                                      mode: t.mode,
                                      presetKey: t.presetKey,
                                      htmlContent: t.htmlContent,
                                      layoutJson: t.layoutJson,
                                      headerOverride: t.headerOverride,
                                      footerOverride: t.footerOverride,
                                      isDefault: false,
                                      isThermal: t.paperSize.startsWith("THERMAL"),
                                    }),
                                  },
                                );
                                if (created?.id) setEditingId(created.id);
                              } catch {
                                /* fail silently — server logs the error */
                              }
                            }}
                          >
                            ⎘
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="إعادة إلى القالب الافتراضي"
                            onClick={() => void handleResetTemplate(t.id, t.name)}
                          >
                            ↺
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

interface TemplateEditorProps {
  templateId: number | null;
  templates: TemplateRow[];
  branches: Array<{ id: number; name: string }>;
  entities: Array<{ id: string; label: string }>;
  onClose: () => void;
}

function TemplateEditor({ templateId, templates, branches, entities, onClose }: TemplateEditorProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const existing = templateId ? templates.find((t) => t.id === templateId) : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [entityType, setEntityType] = useState(existing?.entityType ?? "invoice");
  const [branchId, setBranchId] = useState<number | null>(existing?.branchId ?? null);
  const [paperSize, setPaperSize] = useState(existing?.paperSize ?? "A4");
  const [mode, setMode] = useState<"preset" | "html" | "visual">(existing?.mode ?? "preset");
  const [presetKey, setPresetKey] = useState(existing?.presetKey ?? "classic");
  const [htmlContent, setHtmlContent] = useState(existing?.htmlContent ?? "");
  // Ref to the HTML <textarea> so the token side-panel can insert a
  // `{{...}}` at the current caret position instead of just copying to the
  // clipboard. Solves the "ما أعرف وين أحط المتغير" UX complaint.
  const htmlEditorRef = useRef<HTMLTextAreaElement | null>(null);

  function insertToken(token: string) {
    const el = htmlEditorRef.current;
    if (!el) {
      // Outside the HTML tab — fall back to clipboard so the click still
      // does something useful.
      navigator.clipboard?.writeText(token).catch(() => undefined);
      toast({ title: "تم النسخ", description: token });
      return;
    }
    const start = el.selectionStart ?? htmlContent.length;
    const end = el.selectionEnd ?? htmlContent.length;
    const next = htmlContent.slice(0, start) + token + htmlContent.slice(end);
    setHtmlContent(next);
    // Restore caret AFTER the inserted token on next tick (textarea state
    // updates async via React).
    requestAnimationFrame(() => {
      const pos = start + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);

  // Cliché overrides — when set, these win over the branch's letterhead so a
  // single branch can host multiple template "looks" (ZATCA invoice with
  // company logo vs internal voucher with a personalised header).
  const initialHeaderOv = (existing?.headerOverride as Record<string, string> | undefined) ?? {};
  const initialFooterOv = (existing?.footerOverride as Record<string, string> | undefined) ?? {};
  const [overrideLogoUrl, setOverrideLogoUrl] = useState(initialHeaderOv.logoUrl ?? "");
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Page margins (mm) — seeded from the template's cssOverrides if present.
  // Parses lines like `@page { margin: 18mm 14mm 22mm 14mm; }`.
  const parsedMargins = parseMarginsFromCss(existing?.cssOverrides ?? null);
  const [marginTop, setMarginTop] = useState<number>(parsedMargins.top);
  const [marginRight, setMarginRight] = useState<number>(parsedMargins.right);
  const [marginBottom, setMarginBottom] = useState<number>(parsedMargins.bottom);
  const [marginLeft, setMarginLeft] = useState<number>(parsedMargins.left);
  const [overrideCompanyName, setOverrideCompanyName] = useState(initialHeaderOv.companyName ?? "");
  const [overrideTaxNumber, setOverrideTaxNumber] = useState(initialHeaderOv.taxNumber ?? "");
  const [overrideFooterText, setOverrideFooterText] = useState(initialFooterOv.text ?? "");
  const [layout, setLayout] = useState<VisualBlock[]>(() => {
    const initial = existing?.layoutJson;
    return Array.isArray(initial) ? (initial as VisualBlock[]) : [
      newBlock("header"),
      newBlock("title"),
      newBlock("info_grid"),
      newBlock("items_table"),
      newBlock("summary"),
      newBlock("signature"),
      newBlock("footer"),
    ];
  });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [autoPreview, setAutoPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  // Live preview — every relevant edit fires after a 600ms debounce so the
  // user sees their layout as they type. Solves "أكليك معاينة وأنتظر" UX
  // complaint about the old manual-button-only flow.
  const preview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const blob = await apiFetch<Blob>(`/print/preview`, {
        method: "POST",
        body: JSON.stringify({
          entityType,
          // Don't reference the saved template — preview the in-flight edits.
          templateId: templateId && mode === "preset" ? templateId : undefined,
          // Forward the unsaved HTML / layout / presetKey / paperSize so
          // the user sees exactly what they're about to save.
          ...(mode === "html" && htmlContent ? { htmlContent } : {}),
          ...(mode === "visual" && layout.length > 0 ? { layoutJson: layout } : {}),
          ...(mode === "preset" ? { presetKey } : {}),
          paperSize,
          // Pass the cliché overrides so the preview reflects the unsaved
          // letterhead changes (custom logo, override company name, footer).
          ...((overrideLogoUrl || overrideCompanyName || overrideTaxNumber)
            ? {
                headerOverride: {
                  ...(overrideLogoUrl && { logoUrl: overrideLogoUrl }),
                  ...(overrideCompanyName && { companyName: overrideCompanyName }),
                  ...(overrideTaxNumber && { taxNumber: overrideTaxNumber }),
                },
              }
            : {}),
          ...(overrideFooterText
            ? { footerOverride: { text: overrideFooterText } }
            : {}),
          // Use the per-entity sample if we have one, else the generic
          // default payload so the preview is never empty for the 100+
          // entity types that don't ship a hand-tuned sample.
          payload: SAMPLE_PAYLOADS[entityType] ?? DEFAULT_SAMPLE_PAYLOAD,
        }),
        raw: true,
        // as-any-reason: justified-pragmatic - apiClient options bag accepts non-standard `raw` flag not in its TS surface; cast widens to silence excess-property check
      } as any);
      const text = await (blob as unknown as Response).text?.();
      setPreviewHtml(typeof text === "string" ? text : String(blob));
    } catch {
      toast({ title: "تعذرت المعاينة", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }, [
    entityType, mode, htmlContent, presetKey, paperSize, templateId, toast,
    layout, overrideLogoUrl, overrideCompanyName, overrideTaxNumber, overrideFooterText,
  ]);

  // Debounced auto-preview. Skip while typing fast — only fire 600ms after
  // the user pauses. Disabled when `autoPreview` is off so the user can
  // edit a long HTML doc without spamming /api/print/preview.
  useEffect(() => {
    if (!autoPreview) return;
    const t = setTimeout(() => { void preview(); }, 600);
    return () => clearTimeout(t);
  }, [autoPreview, preview]);

  async function save() {
    // Pre-flight validation — catch the obvious template syntax mistakes
    // BEFORE hitting the server so the user gets an inline error instead of
    // a generic 500. Detects unclosed `{{...}}` tokens and unclosed
    // `{{#each}}` / `{{#if}}` blocks.
    if (mode === "html" && htmlContent) {
      const issues = validateTemplate(htmlContent);
      if (issues.length > 0) {
        toast({
          title: "أخطاء في القالب",
          description: issues.slice(0, 3).join(" · ") + (issues.length > 3 ? "…" : ""),
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        name,
        entityType,
        branchId,
        paperSize,
        mode,
        presetKey,
        htmlContent,
        layoutJson: mode === "visual" ? layout : null,
        headerOverride: (overrideLogoUrl || overrideCompanyName || overrideTaxNumber)
          ? {
              ...(overrideLogoUrl && { logoUrl: overrideLogoUrl }),
              ...(overrideCompanyName && { companyName: overrideCompanyName }),
              ...(overrideTaxNumber && { taxNumber: overrideTaxNumber }),
            }
          : null,
        footerOverride: overrideFooterText ? { text: overrideFooterText } : null,
        // Page margins → @page block in cssOverrides. The A4 adapter
        // already wraps the document body in CSS that respects these
        // when the browser-print path uses Paged Media.
        cssOverrides: buildMarginsCss({
          top: marginTop,
          right: marginRight,
          bottom: marginBottom,
          left: marginLeft,
        }),
        isDefault,
        isThermal: paperSize.startsWith("THERMAL"),
      };
      if (templateId) {
        await apiFetch(`/print/templates/${templateId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/print/templates`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      toast({ title: "تم الحفظ" });
      qc.invalidateQueries({ queryKey: ["print-templates"] });
      onClose();
    } catch (err) {
      toast({ title: "فشل الحفظ", description: (err as ApiError).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!templateId) return;
    if (!confirm("هل أنت متأكد من حذف هذا القالب؟")) return;
    try {
      await apiFetch(`/print/templates/${templateId}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      qc.invalidateQueries({ queryKey: ["print-templates"] });
      onClose();
    } catch {
      toast({ title: "فشل الحذف", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title={templateId ? "تعديل قالب طباعة" : "قالب طباعة جديد"}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            {templateId && (
              <Button variant="destructive" onClick={remove} className="gap-1">
                <Trash2 className="h-4 w-4" /> حذف
              </Button>
            )}
            <Button onClick={save} disabled={saving || !name} className="gap-1">
              <Save className="h-4 w-4" /> حفظ
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الإعدادات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>اسم القالب</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: فاتورة فرع جدة الكلاسيكية" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>الكيان</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {entities.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>الفرع</Label>
                <Select
                  value={branchId === null ? "all" : String(branchId)}
                  onValueChange={(v) => setBranchId(v === "all" ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع (افتراضي الشركة)</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>حجم الورق</Label>
                <Select value={paperSize} onValueChange={setPaperSize}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAPER_SIZES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>افتراضي</Label>
                <Select value={isDefault ? "1" : "0"} onValueChange={(v) => setIsDefault(v === "1")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">نعم (يستخدم تلقائياً)</SelectItem>
                    <SelectItem value="0">لا</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Page margins — CSS Paged Media @page rule. Each side in mm. */}
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">هامش علوي (مم)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={marginTop}
                  onChange={(e) => setMarginTop(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">هامش سفلي (مم)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={marginBottom}
                  onChange={(e) => setMarginBottom(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">هامش يمين (مم)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={marginRight}
                  onChange={(e) => setMarginRight(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">هامش يسار (مم)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={marginLeft}
                  onChange={(e) => setMarginLeft(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">طريقة البناء</CardTitle>
          </CardHeader>
          <CardContent>
            {/* as-any-reason: justified-jsx-generic - Tabs onValueChange yields string; mode state is a literal-union; runtime values are guaranteed to be one of the three TabsTrigger values below */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid grid-cols-3 mb-3">
                <TabsTrigger value="preset" className="gap-1"><FileText className="h-3 w-3" /> قالب جاهز</TabsTrigger>
                <TabsTrigger value="html" className="gap-1"><Pencil className="h-3 w-3" /> HTML</TabsTrigger>
                <TabsTrigger value="visual" className="gap-1"><Layers className="h-3 w-3" /> مرئي</TabsTrigger>
              </TabsList>
              <TabsContent value="preset" className="space-y-3">
                <Label>اختر النمط الجاهز</Label>
                <div className="grid grid-cols-3 gap-3">
                  {PRESET_THEMES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setPresetKey(t.key)}
                      className={cn(
                        "text-right rounded-lg border-2 p-3 transition-all hover:shadow-md",
                        presetKey === t.key
                          ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                          : "border-border bg-white",
                      )}
                    >
                      {/* Mini visual preview of each theme */}
                      <div
                        className="h-20 rounded mb-2 overflow-hidden flex flex-col"
                        style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                      >
                        {t.swatch}
                      </div>
                      <div className="font-semibold text-sm">{t.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                        {t.description}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  ترويسة الفرع وتذييله (مع شعار غيث الافتراضي حتى ترفع شعارك) يأتيان تلقائياً. بعد الحفظ يمكنك تخصيص الرأس/التذييل والهوامش.
                </p>
              </TabsContent>
              <TabsContent value="html" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>محتوى HTML</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      // Quick starter — drop in a sane scaffold the user can
                      // edit instead of staring at an empty textarea.
                      setHtmlContent(
                        `<div class="print-doc">\n{{branch.letterhead}}\n<h2 style="text-align:center;margin:16px 0">{{entity.title}}</h2>\n<div class="meta-grid">\n  <div><strong>المرجع:</strong> {{entity.ref}}</div>\n  <div><strong>التاريخ:</strong> {{entity.date}}</div>\n  <div><strong>الحالة:</strong> {{entity.status}}</div>\n</div>\n{{entity.itemsTable}}\n{{system.verifyBlock}}\n{{branch.footer}}\n</div>`,
                      );
                    }}
                  >
                    استخدم قالب أولي
                  </Button>
                </div>
                <Textarea
                  ref={htmlEditorRef}
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={14}
                  className="font-mono text-xs"
                  dir="ltr"
                  placeholder="<div>{{branch.letterhead}}<h2>{{entity.title}}</h2>{{entity.itemsTable}}{{branch.footer}}</div>"
                />
                <p className="text-xs text-muted-foreground">
                  انقر متغيراً من اللوحة اليمنى لإدراجه في موضع المؤشر. تتوفر مساعدات: <code>{`{{#each items}}…{{/each}}`}</code> و <code>{`{{#if entity.note}}…{{/if}}`}</code>.
                </p>
              </TabsContent>
              <TabsContent value="visual">
                <VisualBuilder layout={layout} onChange={setLayout} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* كليشة مخصصة — تتجاوز إعدادات الفرع لهذا القالب فقط */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            كليشتك المخصصة (اختيارية)
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            عند تعبئة أي حقل هنا، يتجاوز إعدادات الفرع الافتراضية لهذا القالب فقط.
            اتركها فارغة لاستخدام كليشة فرعك الحالية.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">رابط الشعار (Logo URL)</Label>
              <div className="flex gap-2">
                <Input
                  value={overrideLogoUrl}
                  onChange={(e) => setOverrideLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png أو data:image/..."
                  dir="ltr"
                  className="text-xs flex-1"
                />
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingLogo(true);
                    try {
                      const form = new FormData();
                      form.append("logo", file);
                      const res = await apiFetch<{ dataUrl: string }>(
                        "/print/uploads/logo",
                        { method: "POST", body: form, headers: {} } as RequestInit,
                      );
                      setOverrideLogoUrl(res.dataUrl);
                      toast({ title: "تم رفع الشعار" });
                    } catch (err) {
                      const ex = err as ApiError;
                      toast({
                        variant: "destructive",
                        title: "فشل رفع الشعار",
                        description: ex.message,
                      });
                    } finally {
                      setUploadingLogo(false);
                      e.target.value = "";
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoFileRef.current?.click()}
                  disabled={uploadingLogo}
                  className="shrink-0"
                  title="رفع ملف صورة (PNG/JPEG/WebP/SVG، حد أقصى 2MB)"
                >
                  {uploadingLogo ? "..." : "📷 رفع"}
                </Button>
              </div>
              {overrideLogoUrl && (
                <div className="mt-2 inline-block border rounded p-1 bg-white">
                  <img
                    src={overrideLogoUrl}
                    alt="معاينة الشعار"
                    style={{ maxHeight: 48, maxWidth: 160 }}
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                ارفع ملف الشعار مباشرة، أو الصق رابط، أو data URL.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">اسم الجهة في الترويسة</Label>
              <Input
                value={overrideCompanyName}
                onChange={(e) => setOverrideCompanyName(e.target.value)}
                placeholder={"مثلاً: مؤسسة الدور التجارية (يتجاوز اسم الفرع)"}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الرقم الضريبي (يظهر في الترويسة)</Label>
              <Input
                value={overrideTaxNumber}
                onChange={(e) => setOverrideTaxNumber(e.target.value)}
                placeholder="300000000000003"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نص التذييل</Label>
              <Input
                value={overrideFooterText}
                onChange={(e) => setOverrideFooterText(e.target.value)}
                placeholder={"مثلاً: شكراً لتعاملكم معنا — للاستفسار: 920000000"}
              />
            </div>
          </div>
          {overrideLogoUrl && (
            <div className="border rounded p-3 bg-muted/30">
              <Label className="text-xs">معاينة الشعار:</Label>
              <div className="mt-2 flex items-center justify-center bg-white border rounded p-2">
                <img
                  src={overrideLogoUrl}
                  alt="معاينة الشعار"
                  style={{ maxHeight: 80, maxWidth: 240 }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" /> المعاينة
              {previewLoading && <span className="text-xs text-muted-foreground">(جاري التحديث…)</span>}
            </CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-xs flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPreview}
                  onChange={(e) => setAutoPreview(e.target.checked)}
                  className="h-3 w-3"
                />
                معاينة مباشرة
              </label>
              <Button size="sm" variant="outline" onClick={preview} disabled={previewLoading}>
                تحديث
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                title="معاينة"
                className="w-full border rounded bg-white"
                style={{ minHeight: 600 }}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded">
                {previewLoading
                  ? "جاري توليد المعاينة الأولى…"
                  : "ستظهر المعاينة هنا بمجرد ما تبدأ التعديل (المعاينة المباشرة مُفعّلة)."}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tokens reference — clickable insertion into the HTML editor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> المتغيرات
            </CardTitle>
            <p className="text-[10px] text-muted-foreground pt-1">
              انقر متغيراً لنسخه، أو اكتب <code className="font-mono">{`{{`}</code> داخل المحرر.
            </p>
          </CardHeader>
          <CardContent className="space-y-3" style={{ maxHeight: 640, overflowY: "auto" }}>
            {Array.from(new Set(PRINT_TOKENS.map((t) => t.category))).map((cat) => (
              <div key={cat}>
                <div className="text-xs font-semibold text-muted-foreground mb-1">{cat}</div>
                <div className="space-y-1">
                  {PRINT_TOKENS.filter((t) => t.category === cat).map((t) => (
                    <button
                      key={t.token}
                      type="button"
                      onClick={() => insertToken(t.token)}
                      className="w-full text-right border rounded px-2 py-1.5 hover:bg-muted/60 hover:border-primary group block"
                      title={mode === "html" ? `إدراج ${t.token} في المحرر` : `نسخ ${t.token} للحافظة`}
                    >
                      <div className="font-mono text-[10px] text-status-info-foreground" dir="ltr">{t.token}</div>
                      <div className="text-[10px] text-muted-foreground">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Sample payloads used for the live preview when no real entity is in scope.
/** Pre-flight check on an HTML template body — catches the common typos
 *  the substitution layer would silently render as literal text. Returns
 *  Arabic error messages; empty array = valid. */
function validateTemplate(html: string): string[] {
  const issues: string[] = [];
  // Unmatched {{ and }}. A naked "{{" left in the body would render as
  // literal text because no closing pair exists.
  const opens = (html.match(/\{\{/g) ?? []).length;
  const closes = (html.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    issues.push(`عدد {{ (${opens}) لا يطابق عدد }} (${closes})`);
  }
  // Unbalanced #each / /each
  const eachOpens = (html.match(/\{\{#each\s+[\w.]+\}\}/g) ?? []).length;
  const eachCloses = (html.match(/\{\{\/each\}\}/g) ?? []).length;
  if (eachOpens !== eachCloses) {
    issues.push(`{{#each}}=${eachOpens} لا تطابق {{/each}}=${eachCloses}`);
  }
  // Unbalanced #if / /if
  const ifOpens = (html.match(/\{\{#if\s+[\w.]+\}\}/g) ?? []).length;
  const ifCloses = (html.match(/\{\{\/if\}\}/g) ?? []).length;
  if (ifOpens !== ifCloses) {
    issues.push(`{{#if}}=${ifOpens} لا تطابق {{/if}}=${ifCloses}`);
  }
  // Invalid helper names — only `each` and `if` are implemented today.
  const badHelpers = Array.from(html.matchAll(/\{\{#(\w+)\s/g))
    .map((m) => m[1])
    .filter((h) => h !== "each" && h !== "if");
  for (const h of new Set(badHelpers)) {
    issues.push(`المساعد {{#${h}}} غير مدعوم — المتاح: #each / #if`);
  }
  // Detect unbalanced <script>/<style> early — the wrapper already
  // sanitises cssOverrides but the body is rendered verbatim.
  const scriptOpens = (html.match(/<script\b/gi) ?? []).length;
  const scriptCloses = (html.match(/<\/script>/gi) ?? []).length;
  if (scriptOpens !== scriptCloses) {
    issues.push(`<script>=${scriptOpens} لا تطابق </script>=${scriptCloses}`);
  }
  return issues;
}

// Default payload used when an entity has no bespoke sample below — the
// preview helper still has something to render so the user sees the
// canonical fields (ref/date/status) instead of an empty doc.
const DEFAULT_SAMPLE_PAYLOAD: Record<string, unknown> = {
  entity: {
    id: 1,
    ref: "REF-2026-0001",
    date: "2026-05-13",
    status: "active",
    title: "وثيقة تجريبية",
    notes: "هذه معاينة فقط — البيانات تجريبية.",
    currency: "ر.س",
    amount: 1000,
    total: 1000,
  },
  items: [
    { name: "بند ١", qty: 1, price: 500, total: 500 },
    { name: "بند ٢", qty: 2, price: 250, total: 500 },
  ],
};

const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  invoice: {
    entity: { ref: "INV-2026-0001", date: "2026-05-13", subtotal: 1000, vatAmount: 150, total: 1150, status: "posted", currency: "ر.س" },
    client: { name: "عميل تجريبي", taxNumber: "300000000000003" },
    items: [
      { name: "صنف ١", qty: 2, price: 250, total: 500 },
      { name: "صنف ٢", qty: 1, price: 500, total: 500 },
    ],
  },
  quotation: {
    entity: { ref: "QT-2026-0001", date: "2026-05-13", validUntil: "2026-06-13", subtotal: 5000, vatAmount: 750, total: 5750, status: "active", currency: "ر.س" },
    client: { name: "شركة الأمل المحدودة" },
    items: [{ name: "خدمة استشارات", qty: 1, price: 5000, total: 5000 }],
  },
  pos_receipt: {
    entity: { ref: "POS-0042", date: "2026-05-13 11:24", subtotal: 87, vatAmount: 13, total: 100, status: "paid", currency: "ر.س" },
    items: [{ name: "قهوة سادة", qty: 2, price: 25, total: 50 }, { name: "كيك", qty: 1, price: 50, total: 50 }],
  },
  receipt_voucher: {
    entity: { ref: "RV-2026-0001", date: "2026-05-13", amount: 1500, status: "posted", paymentMethod: "cash", currency: "ر.س" },
    client: { name: "عميل تجريبي" },
  },
  payment_voucher: {
    entity: { ref: "PV-2026-0001", date: "2026-05-13", amount: 800, status: "posted", paymentMethod: "bank_transfer", currency: "ر.س" },
    supplier: { name: "مورّد تجريبي" },
  },
  purchase_order: {
    entity: { ref: "PO-2026-0001", date: "2026-05-13", total: 2500, status: "approved", currency: "ر.س" },
    supplier: { name: "مورّد تجريبي" },
    items: [{ name: "صنف", qty: 5, price: 500, total: 2500 }],
  },
  journal_entry: {
    entity: { ref: "JE-2026-0001", date: "2026-05-13", status: "posted" },
    lines: [
      { accountCode: "1100", description: "بنك الراجحي", debit: 1000, credit: 0 },
      { accountCode: "4100", description: "إيرادات بيع", debit: 0, credit: 1000 },
    ],
  },
  payroll: {
    entity: { ref: "PAY-2026-05", period: "2026-05", status: "completed", total: 50000, currency: "ر.س" },
    items: [
      { employeeName: "أحمد محمد", basic: 5000, allowances: 1000, deductions: 200, netSalary: 5800 },
      { employeeName: "خالد عبدالله", basic: 7000, allowances: 1500, deductions: 350, netSalary: 8150 },
    ],
  },
  account_statement: {
    entity: { ref: "AS-2026-0001", date: "2026-05-13", code: "1100", name: "البنك", currency: "ر.س", currentBalance: 25000 },
    movements: [
      { التاريخ: "2026-05-01", المرجع: "INV-101", البيان: "إيراد بيع", مدين: 1000, دائن: 0 },
      { التاريخ: "2026-05-08", المرجع: "PV-12", البيان: "صرف مصاريف", مدين: 0, دائن: 500 },
    ],
  },
  leave_request: {
    entity: { ref: "LV-2026-0001", date: "2026-05-13", status: "approved", days: 5, type: "annual", reason: "إجازة سنوية" },
    employee: { name: "أحمد محمد", empNumber: "EMP-001" },
  },
  loan_request: {
    entity: { ref: "LN-2026-0001", date: "2026-05-13", status: "pending", amount: 10000, installmentCount: 12, type: "personal" },
    employee: { name: "أحمد محمد", empNumber: "EMP-001" },
  },
  official_letter: {
    entity: { id: "001", subject: "خطاب تجريبي", type: "employment_certificate", date: "2026-05-13", status: "approved", content: "هذا نص خطاب تجريبي لمعاينة القالب." },
  },
  rental_contract: {
    entity: { ref: "RC-2026-0001", date: "2026-05-13", startDate: "2026-05-13", endDate: "2027-05-12", monthlyRent: 3000, status: "active", currency: "ر.س" },
    client: { name: "مستأجر تجريبي" },
  },
  delivery_note: {
    entity: { ref: "DN-2026-0001", date: "2026-05-13", status: "delivered" },
    client: { name: "عميل تجريبي" },
    items: [{ name: "صنف", qty: 10, unit: "قطعة" }],
  },
  credit_note: {
    entity: { ref: "CN-2026-0001", date: "2026-05-13", total: 250, status: "posted", currency: "ر.س" },
    client: { name: "عميل تجريبي" },
    items: [{ name: "ارتجاع صنف", qty: 1, price: 250, total: 250 }],
  },
};

// ─── Visual builder ─────────────────────────────────────────────────────────
// A small drag-and-drop layout builder. Uses native HTML5 drag events to keep
// the dependency footprint zero. Reorder by dragging the handle; click a
// block to expand its inspector; the right palette adds new blocks.

interface VisualBuilderProps {
  layout: VisualBlock[];
  onChange: (next: VisualBlock[]) => void;
}

function VisualBuilder({ layout, onChange }: VisualBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(layout[0]?.id ?? null);
  const dragFromRef = useRef<number | null>(null);

  const selected = selectedId ? layout.find((b) => b.id === selectedId) ?? null : null;

  function addBlock(type: VisualBlock["type"]) {
    const block = newBlock(type);
    onChange([...layout, block]);
    setSelectedId(block.id);
  }

  function removeBlock(id: string) {
    onChange(layout.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = layout.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= layout.length) return;
    const next = layout.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  function reorderByDrag(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = layout.slice();
    const [picked] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, picked);
    onChange(next);
  }

  function patchBlock(id: string, patch: Partial<VisualBlock>) {
    onChange(layout.map((b) => (b.id === id ? ({ ...b, ...patch } as VisualBlock) : b)));
  }

  return (
    <div className="grid grid-cols-12 gap-3" style={{ minHeight: 420 }}>
      {/* Block palette */}
      <div className="col-span-3 border rounded p-2 bg-muted/30 overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground mb-2">العناصر المتاحة</div>
        <div className="grid grid-cols-2 gap-1">
          {BLOCK_PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => addBlock(p.type)}
              className="flex flex-col items-center gap-1 p-2 rounded border bg-background hover:bg-accent hover:border-primary text-xs"
              title={`إضافة ${p.label}`}
            >
              <span className="text-lg leading-none">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="col-span-5 border rounded p-2 bg-background overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground mb-2">التخطيط</div>
        {layout.length === 0 ? (
          <div className="text-xs text-center p-6 text-muted-foreground border border-dashed rounded">
            القالب فارغ. أضف عنصراً من اليمين للبدء.
          </div>
        ) : (
          <div className="space-y-1">
            {layout.map((block, idx) => (
              <div
                key={block.id}
                draggable
                onDragStart={() => {
                  dragFromRef.current = idx;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragFromRef.current;
                  dragFromRef.current = null;
                  if (from !== null) reorderByDrag(from, idx);
                }}
                onClick={() => setSelectedId(block.id)}
                className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer ${
                  selectedId === block.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <span className="text-muted-foreground select-none cursor-grab">⋮⋮</span>
                <span className="flex-1 truncate">
                  <span className="font-semibold">{labelFor(block.type)}</span>
                  <span className="text-muted-foreground ms-2">{summaryFor(block)}</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); moveBlock(block.id, -1); }}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                >▲</button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 1); }}
                  disabled={idx === layout.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 px-1"
                >▼</button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                  className="text-status-error-foreground hover:text-status-error-foreground px-1"
                  title="حذف"
                ><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspector */}
      <div className="col-span-4 border rounded p-2 bg-muted/30 overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground mb-2">خصائص العنصر</div>
        {!selected ? (
          <div className="text-xs text-center p-6 text-muted-foreground border border-dashed rounded">
            اختر عنصراً من التخطيط لتعديل خصائصه.
          </div>
        ) : (
          <Inspector block={selected} onChange={(patch) => patchBlock(selected.id, patch)} />
        )}
      </div>
    </div>
  );
}

function labelFor(type: VisualBlock["type"]): string {
  return BLOCK_PALETTE.find((p) => p.type === type)?.label ?? type;
}

function summaryFor(block: VisualBlock): string {
  switch (block.type) {
    case "title": return block.text;
    case "text": return block.body.slice(0, 40) + (block.body.length > 40 ? "…" : "");
    case "info_grid": return `${block.items.length} حقول`;
    case "summary": return `${block.items.length} سطور`;
    case "signature": return `${block.parties.length} أطراف`;
    case "spacer": return `${block.height}px`;
    default: return "";
  }
}

function Inspector({ block, onChange }: { block: VisualBlock; onChange: (patch: Partial<VisualBlock>) => void }) {
  if (block.type === "title") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">النص</Label>
        <Input value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<VisualBlock>)} />
        <Label className="text-xs">حجم العنوان</Label>
        <Select value={String(block.level)} onValueChange={(v) => onChange({ level: Number(v) as 1 | 2 | 3 } as Partial<VisualBlock>)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">كبير (H1)</SelectItem>
            <SelectItem value="2">متوسط (H2)</SelectItem>
            <SelectItem value="3">صغير (H3)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (block.type === "text") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">نص الفقرة</Label>
        <Textarea rows={5} value={block.body} onChange={(e) => onChange({ body: e.target.value } as Partial<VisualBlock>)} />
        <div className="text-[10px] text-muted-foreground">يدعم متغيرات {`{{path.to.value}}`}</div>
      </div>
    );
  }
  if (block.type === "info_grid") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">حقول الشبكة</Label>
        {block.items.map((item, i) => (
          <div key={i} className="flex gap-1 items-center">
            <Input
              className="text-xs"
              value={item.label}
              placeholder="الاسم"
              onChange={(e) => {
                const items = block.items.slice();
                items[i] = { ...items[i], label: e.target.value };
                onChange({ items } as Partial<VisualBlock>);
              }}
            />
            <Input
              className="text-xs"
              value={item.value}
              placeholder="القيمة (مثال {{entity.ref}})"
              dir="ltr"
              onChange={(e) => {
                const items = block.items.slice();
                items[i] = { ...items[i], value: e.target.value };
                onChange({ items } as Partial<VisualBlock>);
              }}
            />
            <button
              type="button"
              onClick={() => onChange({ items: block.items.filter((_, j) => j !== i) } as Partial<VisualBlock>)}
              className="text-status-error-foreground px-1"
            ><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ items: [...block.items, { label: "", value: "" }] } as Partial<VisualBlock>)}
          className="w-full gap-1"
        >
          <Plus className="h-3 w-3" /> حقل جديد
        </Button>
      </div>
    );
  }
  if (block.type === "summary") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">سطور الملخص</Label>
        {block.items.map((item, i) => (
          <div key={i} className="space-y-1 border rounded p-2 bg-background">
            <div className="flex gap-1">
              <Input
                className="text-xs"
                value={item.label}
                placeholder="الوصف"
                onChange={(e) => {
                  const items = block.items.slice();
                  items[i] = { ...items[i], label: e.target.value };
                  onChange({ items } as Partial<VisualBlock>);
                }}
              />
              <Input
                className="text-xs"
                value={item.value}
                placeholder="القيمة"
                dir="ltr"
                onChange={(e) => {
                  const items = block.items.slice();
                  items[i] = { ...items[i], value: e.target.value };
                  onChange({ items } as Partial<VisualBlock>);
                }}
              />
            </div>
            <div className="flex justify-between items-center">
              <label className="text-[10px] flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={Boolean(item.bold)}
                  onChange={(e) => {
                    const items = block.items.slice();
                    items[i] = { ...items[i], bold: e.target.checked };
                    onChange({ items } as Partial<VisualBlock>);
                  }}
                />
                إجمالي بارز
              </label>
              <button
                type="button"
                onClick={() => onChange({ items: block.items.filter((_, j) => j !== i) } as Partial<VisualBlock>)}
                className="text-status-error-foreground text-xs"
              >حذف</button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ items: [...block.items, { label: "", value: "" }] } as Partial<VisualBlock>)}
          className="w-full gap-1"
        >
          <Plus className="h-3 w-3" /> سطر جديد
        </Button>
      </div>
    );
  }
  if (block.type === "signature") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">أطراف التوقيع</Label>
        {block.parties.map((p, i) => (
          <div key={i} className="flex gap-1">
            <Input
              className="text-xs"
              value={p.label}
              placeholder="مثلاً: توقيع المدير"
              onChange={(e) => {
                const parties = block.parties.slice();
                parties[i] = { label: e.target.value };
                onChange({ parties } as Partial<VisualBlock>);
              }}
            />
            <button
              type="button"
              onClick={() => onChange({ parties: block.parties.filter((_, j) => j !== i) } as Partial<VisualBlock>)}
              className="text-status-error-foreground px-1"
            ><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ parties: [...block.parties, { label: "توقيع" }] } as Partial<VisualBlock>)}
          className="w-full gap-1"
        >
          <Plus className="h-3 w-3" /> طرف جديد
        </Button>
      </div>
    );
  }
  if (block.type === "qr") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">قيمة الرمز</Label>
        <Input
          dir="ltr"
          value={block.value ?? ""}
          placeholder="{{entity.zatcaQr}}"
          onChange={(e) => onChange({ value: e.target.value } as Partial<VisualBlock>)}
        />
      </div>
    );
  }
  if (block.type === "spacer") {
    return (
      <div className="space-y-2">
        <Label className="text-xs">الارتفاع (بكسل)</Label>
        <Input
          type="number"
          min={4}
          max={200}
          value={block.height}
          onChange={(e) => onChange({ height: Math.max(4, Math.min(200, Number(e.target.value))) } as Partial<VisualBlock>)}
        />
      </div>
    );
  }
  return (
    <div className="text-xs text-muted-foreground p-2">
      هذا العنصر يولّد محتواه تلقائياً من إعدادات الفرع/البيانات. لا توجد خصائص للتعديل.
    </div>
  );
}
