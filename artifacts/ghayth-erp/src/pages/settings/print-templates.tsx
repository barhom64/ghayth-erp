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

import { useState, useMemo } from "react";
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
import { PageHeader } from "@/components/page-header";

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
  isThermal: boolean;
  isDefault: boolean;
  isActive: boolean;
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
      if (templateId) {
        await apiFetch(`/print/templates/${templateId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            entityType,
            branchId,
            paperSize,
            mode,
            presetKey,
            htmlContent,
            isDefault,
            isThermal: paperSize.startsWith("THERMAL"),
          }),
        });
      } else {
        await apiFetch(`/print/templates`, {
          method: "POST",
          body: JSON.stringify({
            name,
            entityType,
            branchId,
            paperSize,
            mode,
            presetKey,
            htmlContent,
            isDefault,
            isThermal: paperSize.startsWith("THERMAL"),
          }),
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
                <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div>البناء المرئي (drag-and-drop) متاح في الإصدار التالي.</div>
                  <div className="text-xs mt-1">حالياً استخدم وضع HTML أو القوالب الجاهزة.</div>
                </div>
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
