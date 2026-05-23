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

import { useState, useMemo, useRef } from "react";
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
import { PageHeader } from "@workspace/ui-core";

const PRINTABLE_ENTITIES = [
  { id: "invoice", label: "فاتورة" },
  { id: "quotation", label: "عرض سعر" },
  { id: "sales_order", label: "أمر بيع" },
  { id: "delivery_note", label: "سند تسليم" },
  { id: "credit_note", label: "إشعار دائن" },
  { id: "pos_receipt", label: "إيصال نقطة بيع" },
  { id: "receipt_voucher", label: "سند قبض" },
  { id: "payment_voucher", label: "سند صرف" },
  { id: "purchase_request", label: "طلب شراء" },
  { id: "purchase_order", label: "أمر شراء" },
  { id: "goods_receipt", label: "سند استلام" },
  { id: "journal_entry", label: "قيد محاسبي" },
  { id: "account_statement", label: "كشف حساب" },
  { id: "stock_transfer", label: "نقل مخزون" },
  { id: "stock_adjustment", label: "تسوية مخزون" },
  { id: "item_barcode_label", label: "ملصق صنف / باركود" },
  { id: "leave_request", label: "طلب إجازة" },
  { id: "loan_request", label: "طلب سلفة" },
  { id: "maintenance_request", label: "طلب صيانة" },
  { id: "payroll", label: "إيصال راتب" },
  { id: "official_letter", label: "خطاب رسمي" },
  { id: "employee_contract", label: "عقد موظف" },
  { id: "rental_contract", label: "عقد إيجار" },
  { id: "legal_contract", label: "عقد قانوني" },
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
  layoutJson: unknown;
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

export default function PrintTemplatesPage() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useApiQuery<{ items: TemplateRow[] }>(
    ["print-templates"],
    "/print/templates"
  );
  const { data: branchesData } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = (branchesData?.data ?? branchesData?.items ?? []) as Array<{ id: number; name: string }>;
  const items = data?.items ?? [];
  const [filterEntity, setFilterEntity] = useState<string>("all");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

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
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="قوالب الطباعة (الكليشة)"
        subtitle="بناء وتخصيص قوالب الطباعة لكل فرع بشكل مستقل"
        action={
          <Button onClick={() => setEditingId("new")} className="gap-1">
            <Plus className="h-4 w-4" /> قالب جديد
          </Button>
        }
      />

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
            <div className="text-sm text-muted-foreground p-4">جارٍ التحميل…</div>
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
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(t.id)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TemplateEditorProps {
  templateId: number | null;
  templates: TemplateRow[];
  branches: Array<{ id: number; name: string }>;
  onClose: () => void;
}

function TemplateEditor({ templateId, templates, branches, onClose }: TemplateEditorProps) {
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
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
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
  const [saving, setSaving] = useState(false);

  async function preview() {
    try {
      const blob = await apiFetch<Blob>(`/print/preview`, {
        method: "POST",
        body: JSON.stringify({
          entityType,
          templateId: templateId ?? undefined,
          payload: SAMPLE_PAYLOADS[entityType] ?? {},
        }),
        raw: true,
        // as-any-reason: justified-pragmatic - apiClient options bag accepts non-standard `raw` flag not in its TS surface; cast widens to silence excess-property check
      } as any);
      const text = await (blob as unknown as Response).text?.();
      setPreviewHtml(typeof text === "string" ? text : String(blob));
    } catch {
      toast({ title: "تعذرت المعاينة", variant: "destructive" });
    }
  }

  async function save() {
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
                    {PRINTABLE_ENTITIES.map((e) => (
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
                <Label>اختر النمط</Label>
                <Select value={presetKey} onValueChange={setPresetKey}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="classic">كلاسيكي</SelectItem>
                    <SelectItem value="modern">عصري</SelectItem>
                    <SelectItem value="compact">مدمج</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  ترويسة الفرع وتذييله يأتيان تلقائياً من إعدادات الفرع. تخصيص الرأس/التذييل المتقدم متاح بعد الحفظ.
                </p>
              </TabsContent>
              <TabsContent value="html" className="space-y-2">
                <Label>محتوى HTML (يدعم {`{{path.to.value}}`} و {`{{branch.letterhead}}`} و {`{{entity.itemsTable}}`})</Label>
                <Textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={14}
                  className="font-mono text-xs"
                  dir="ltr"
                  placeholder="<div>{{branch.letterhead}}<h2>{{entity.title}}</h2>{{entity.itemsTable}}{{branch.footer}}</div>"
                />
                <p className="text-xs text-muted-foreground">
                  متغيرات تلقائية: <code>{`{{branch.letterhead}}`}</code>, <code>{`{{branch.footer}}`}</code>, <code>{`{{entity.itemsTable}}`}</code>, <code>{`{{date.today}}`}</code>
                </p>
              </TabsContent>
              <TabsContent value="visual">
                <VisualBuilder layout={layout} onChange={setLayout} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> المعاينة</CardTitle>
          <Button size="sm" variant="outline" onClick={preview}>توليد المعاينة</Button>
        </CardHeader>
        <CardContent>
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="preview"
              className="w-full border rounded bg-white"
              style={{ minHeight: 600 }}
            />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed rounded">
              اضغط "توليد المعاينة" لرؤية شكل القالب ببيانات تجريبية.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Sample payloads used for the live preview when no real entity is in scope.
const SAMPLE_PAYLOADS: Record<string, Record<string, unknown>> = {
  invoice: {
    entity: { ref: "INV-2026-0001", date: "2026-05-13", subtotal: 1000, vat: 150, total: 1150 },
    client: { name: "عميل تجريبي", taxNumber: "300000000000003" },
    items: [
      { name: "صنف ١", qty: 2, price: 250, total: 500 },
      { name: "صنف ٢", qty: 1, price: 500, total: 500 },
    ],
  },
  quotation: {
    entity: { ref: "QT-2026-0001", date: "2026-05-13", validUntil: "2026-06-13", subtotal: 5000, vat: 750, total: 5750 },
    client: { name: "شركة الأمل المحدودة" },
    items: [{ name: "خدمة استشارات", qty: 1, price: 5000, total: 5000 }],
  },
  pos_receipt: {
    entity: { ref: "POS-0042", date: "2026-05-13 11:24", subtotal: 87, vat: 13, total: 100, zatcaQr: "—" },
    items: [{ name: "قهوة سادة", qty: 2, price: 25, total: 50 }, { name: "كيك", qty: 1, price: 50, total: 50 }],
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
                  className="text-red-600 hover:text-red-700 px-1"
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
              className="text-red-600 px-1"
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
                className="text-red-600 text-xs"
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
              className="text-red-600 px-1"
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
