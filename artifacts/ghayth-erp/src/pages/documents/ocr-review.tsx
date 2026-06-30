import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Check, X, RefreshCw, Upload, FileUp, ScanText, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { PageShell } from "@workspace/ui-core";
import { cn } from "@/lib/utils";

interface Extraction {
  id: number;
  documentId: number;
  docType: string;
  fields: Record<string, string>;
  confidence: number | string | null;
  docTitle: string | null;
  fileName: string | null;
  createdAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  iqama: "إقامة",
  driving_license: "رخصة قيادة",
  vehicle_registration: "استمارة مركبة",
  commercial_registration: "سجل تجاري",
  invoice: "فاتورة",
  purchase_invoice: "فاتورة مشتريات (صرف)",
  sales_invoice: "فاتورة مبيعات (قبض)",
};

const FIELD_LABELS: Record<string, string> = {
  idNumber: "رقم الهوية",
  expiryDate: "تاريخ الانتهاء",
  fullName: "الاسم الكامل",
  licenseNumber: "رقم الرخصة",
  licenseClass: "الفئة",
  plateNumber: "رقم اللوحة",
  vinNumber: "رقم الهيكل",
  registrationExpiry: "انتهاء الاستمارة",
  crNumber: "رقم السجل",
  issuingAuthority: "جهة الإصدار",
  invoiceNumber: "رقم الفاتورة",
  invoiceNo: "رقم الفاتورة",
  invoiceDate: "تاريخ الفاتورة",
  date: "التاريخ",
  amount: "المبلغ",
  total: "الإجمالي",
  vat: "ضريبة القيمة المضافة",
  vatAmount: "ضريبة القيمة المضافة",
  taxNumber: "الرقم الضريبي",
};

// خيارات رفع مستند للقراءة الضوئية. الفاتورة تحمل **اتجاه المال صراحةً** (قبض/صرف):
// مبيعات = قبض (مال داخل)، مشتريات = صرف (مال خارج) — فيميّز النظام عند التأكيد
// ويفتح النموذج الصحيح. الأنواع الأخرى تُطبَّق على كيان قائم (موظف/مركبة/شركة).
// ملاحظة: `category` يجب أن تكون من تعداد `DOCUMENT_CATEGORIES` الخلفي
// (hr · finance · legal · contracts · compliance · operations · fleet · properties ·
// umrah · marketing · general) — وإلا يرفض /documents/upload الطلب (Invalid enum).
const UPLOAD_DOC_TYPES: { value: string; label: string; category: string; flow?: "receipt" | "payment" }[] = [
  { value: "purchase_invoice", label: "فاتورة مشتريات — صرف (مال خارج)", category: "finance", flow: "payment" },
  { value: "sales_invoice", label: "فاتورة مبيعات — قبض (مال داخل)", category: "finance", flow: "receipt" },
  { value: "iqama", label: "إقامة / هوية", category: "hr" },
  { value: "driving_license", label: "رخصة قيادة", category: "hr" },
  { value: "vehicle_registration", label: "استمارة مركبة", category: "fleet" },
  { value: "commercial_registration", label: "سجل تجاري", category: "compliance" },
];

// Which target entity each docType is allowed to apply to. The backend
// enforces tenant scoping; this map only drives the UI selector.
const TARGETS_BY_DOCTYPE: Record<string, { value: string; label: string }[]> = {
  iqama: [{ value: "employee", label: "موظف" }],
  driving_license: [{ value: "employee", label: "موظف" }],
  vehicle_registration: [{ value: "vehicle", label: "مركبة" }],
  commercial_registration: [{ value: "company", label: "الشركة الحالية" }],
  invoice: [{ value: "vendor_invoice", label: "فاتورة مورد" }],
};

export default function OcrReviewPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [items, setItems] = useState<Extraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>({});
  const [targets, setTargets] = useState<Record<number, { appliedTo: string; appliedToId: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  // ── رفع مستند للقراءة الضوئية (سدّ فجوة «مافيه خيار رفع ملف») ──────────────
  // يعيد استخدام نفس تدفّق الرفع المُثبَت في صفحة رفع المستندات: طلب رابط مُوقَّع →
  // PUT الملف → POST /documents/upload → POST /documents/:id/ocr/rerun (يشغّل
  // المحرّك الداخلي tesseract ويُنشئ استخراجًا معلّقًا يظهر أدناه للمراجعة البشرية).
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>(UPLOAD_DOC_TYPES[0].value);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedFlow = UPLOAD_DOC_TYPES.find((o) => o.value === uploadDocType)?.flow ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ extractions: Extraction[] }>("/documents/ocr/extractions?status=pending");
      setItems(res.extractions || []);
      const fresh: Record<number, Record<string, string>> = {};
      const freshTargets: Record<number, { appliedTo: string; appliedToId: string }> = {};
      for (const e of res.extractions || []) {
        fresh[e.id] = { ...(e.fields || {}) };
        // Pre-populate the default target so a reviewer who only enters
        // the entity id (and never opens the dropdown) still gets the
        // default `appliedTo` sent to the backend.
        const defaultTarget = TARGETS_BY_DOCTYPE[e.docType]?.[0]?.value ?? "";
        freshTargets[e.id] = { appliedTo: defaultTarget, appliedToId: "" };
      }
      setEdits(fresh);
      setTargets(freshTargets);
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر تحميل المستخلَصات", description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = useCallback(async () => {
    if (!file) { toast({ variant: "destructive", title: "اختر ملفًا أولًا (صورة أو PDF)" }); return; }
    if (file.type && !/^image\//i.test(file.type) && !/pdf/i.test(file.type)) {
      toast({ variant: "destructive", title: "القراءة الضوئية تدعم الصور وملفات PDF فقط" });
      return;
    }
    setUploading(true);
    try {
      // ١) رابط رفع مُوقَّع — عبر apiFetch (المسار الآمن لـnative: Bearer + CSRF + 401-refresh)
      const { uploadURL, objectPath } = await apiFetch<{ uploadURL: string; objectPath: string }>(
        "/storage/uploads/request-url",
        { method: "POST", body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) },
      );
      // ٢) رفع البايتات إلى الرابط المُوقَّع الخارجي (PUT خام — ليس مسار API، لا يحتاج توكن)
      const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!putRes.ok) throw new Error("فشل رفع الملف");
      // ٣) تسجيل المستند في مسار الوثائق
      const opt = UPLOAD_DOC_TYPES.find((o) => o.value === uploadDocType) ?? UPLOAD_DOC_TYPES[0];
      const doc = await apiFetch<{ id: number }>("/documents/upload", {
        method: "POST",
        body: JSON.stringify({
          title: file.name,
          description: "",
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          category: opt.category,
          storageKey: objectPath,
        }),
      });
      // ٤) تشغيل القراءة الضوئية الداخلية → استخراج معلّق للمراجعة
      await apiFetch(`/documents/${doc.id}/ocr/rerun`, {
        method: "POST",
        body: JSON.stringify({ docType: uploadDocType }),
      });
      toast({ title: "تم رفع المستند وقراءته — راجع الحقول المستخرجة أدناه وأكّدها" });
      setFile(null);
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر الرفع والقراءة", description: err?.message });
    } finally {
      setUploading(false);
    }
  }, [file, uploadDocType, toast, load]);

  const setField = (id: number, key: string, value: string) =>
    setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: value } }));

  const confirm = async (id: number, requireTarget: boolean) => {
    const t = targets[id];
    if (requireTarget && (!t?.appliedTo || !t?.appliedToId)) {
      toast({ variant: "destructive", title: "حدد الكيان المرتبط أولاً", description: "يجب اختيار نوع الكيان وإدخال رقمه قبل الحفظ." });
      return;
    }
    setBusyId(id);
    try {
      const payload: Record<string, unknown> = { fields: edits[id] || {} };
      if (t?.appliedTo && t?.appliedToId) {
        payload.appliedTo = t.appliedTo;
        payload.appliedToId = Number(t.appliedToId);
      }
      await apiFetch(`/documents/ocr/extractions/${id}/confirm`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      // البند ٣ — تطبيق المستخلَص المؤكَّد على كيان المسار القائد عبر عقده. الوثائق لا
      // تكتب على الكيان؛ نمرّر الحقول لعقد المالك (موظف→HR، مركبة→الأسطول…، يحتاج صلاحية
      // المسار المالك، سياسة «املأ الفارغ فقط»). نقص الصلاحية → التأكيد محفوظ والتطبيق
      // يُترك للمسار المالك. (إضافة مسار قائد جديد = سطر واحد في الإحالة أدناه.)
      const item = items.find((x) => x.id === id);
      const dt = item?.docType || "";
      const applyEndpoint =
        t?.appliedTo === "employee" && /iqama|residence|الإقامة|الاقامة|هوية|national|driving_license|driving|license|رخصة/i.test(dt)
          ? `/employees/${Number(t.appliedToId)}/ocr-apply`
          : t?.appliedTo === "vehicle" && /vehicle|registration|استمارة|مركبة|سيارة/i.test(dt)
            ? `/fleet/vehicles/${Number(t.appliedToId)}/ocr-apply`
            : t?.appliedTo === "company" && /commercial|سجل\s*تجاري|cr_?reg|registration/i.test(dt)
              ? `/settings/companies/${Number(t.appliedToId)}/ocr-apply`
              : null;
      if (applyEndpoint && t?.appliedToId) {
        try {
          const r = await apiFetch<{ applied?: string[] }>(applyEndpoint, {
            method: "POST",
            body: JSON.stringify({ docType: dt, fields: edits[id] || {} }),
          });
          const n = r?.applied?.length ?? 0;
          toast({ title: n ? `تم التأكيد وتطبيق ${n} حقل فارغ على الكيان` : "تم التأكيد — لا حقول فارغة للتعبئة على الكيان" });
        } catch {
          toast({ title: "تم التأكيد — التطبيق على الكيان يحتاج صلاحية المسار المالك" });
        }
      } else if (/invoice|فاتورة/i.test(dt)) {
        // فاتورة: ليست «ملء كيان قائم» بل إنشاء مستند مالي جديد. لا إنشاء آلي — نفتح
        // النموذج معبَّأً (مبلغ/تاريخ/رقم/ضريبة). **اتجاه المال (قبض/صرف)** يحدّد النموذج:
        // مبيعات → فاتورة مبيعات (قبض، مال داخل)؛ مشتريات/افتراضي → فاتورة مورد (صرف، خارج).
        const f = edits[id] || {};
        const qs = new URLSearchParams();
        if (f.amount) qs.set("ocrAmount", String(f.amount));
        if (f.vatAmount) qs.set("ocrVat", String(f.vatAmount));
        if (f.date) qs.set("ocrDate", String(f.date));
        if (f.invoiceNo) qs.set("ocrInvoiceNo", String(f.invoiceNo));
        if (f.taxNumber) qs.set("ocrTaxNumber", String(f.taxNumber));
        setItems((p) => p.filter((x) => x.id !== id));
        const isSales = /sales|مبيعات|بيع/i.test(dt);
        if (isSales) {
          toast({ title: "تم التأكيد — فتح فاتورة المبيعات (قبض) معبَّأة" });
          navigate(`/finance/documents/invoice?${qs.toString()}`);
        } else {
          toast({ title: "تم التأكيد — فتح فاتورة المشتريات (صرف) معبَّأة" });
          navigate(`/finance/documents/vendor-invoice?${qs.toString()}`);
        }
        return;
      } else {
        toast({ title: "تم تأكيد المستخلَص وتسجيل الكيان المرتبط" });
      }
      setItems((p) => p.filter((x) => x.id !== id));
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التأكيد", description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const setTarget = (id: number, key: "appliedTo" | "appliedToId", value: string) =>
    setTargets((p) => {
      const prev = p[id] || { appliedTo: "", appliedToId: "" };
      return { ...p, [id]: { ...prev, [key]: value } };
    });

  const reject = async (id: number) => {
    setBusyId(id);
    try {
      await apiFetch(`/documents/ocr/extractions/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "تم رفض المستخلَص" });
      setItems((p) => p.filter((x) => x.id !== id));
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الرفض", description: err?.message });
    } finally {
      setBusyId(null);
    }
  };

  const rerun = async (documentId: number) => {
    try {
      await apiFetch(`/documents/${documentId}/ocr/rerun`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "تم إعادة جدولة OCR للمستند" });
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشلت إعادة الجدولة", description: err?.message });
    }
  };

  return (
    <PageShell
      title="قراءة المستندات (OCR)"
      subtitle="ارفع مستندًا ليقرأه النظام تلقائيًّا، ثم راجع الحقول المستخرجة وأكّدها"
      actions={<RefreshAction onRefresh={load} disabled={loading} />}
      loading={loading}
    >
      {/* رفع مستند للقراءة — يسدّ فجوة «مافيه خيار رفع ملف» */}
      <Card className="p-4 space-y-3 border-dashed">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanText className="w-4 h-4 text-status-info" />
          ارفع مستندًا لقراءته ضوئيًّا
        </div>
        <p className="text-xs text-muted-foreground">
          صورة أو PDF — يقرأ النظام المبلغ والتاريخ والرقم تلقائيًّا، ثم تراجعها وتؤكّدها في الأسفل.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,320px)_1fr_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">نوع المستند</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value)}
            >
              {UPLOAD_DOC_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الملف</Label>
            <div
              onClick={() => inputRef.current?.click()}
              className={cn(
                "h-9 flex items-center gap-2 rounded-md border border-dashed px-3 text-sm cursor-pointer transition-colors",
                file ? "border-status-success-foreground bg-status-success-surface" : "hover:bg-surface-subtle",
              )}
            >
              {file ? (
                <>
                  <FileUp className="w-4 h-4 text-status-success-foreground shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <button type="button" className="ms-auto shrink-0" title="إزالة" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <X className="w-4 h-4 text-status-error" />
                  </button>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate">انقر لاختيار صورة أو PDF</span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setFile(e.target.files[0]); e.target.value = ""; }}
              />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file} className="h-9" rateLimitAware>
            {uploading ? "جاري القراءة…" : "ارفع واقرأ"}
          </Button>
        </div>
        {/* مؤشّر اتجاه المال — يجعل قبض/صرف واضحًا قبل الرفع (سدّ «ما تفرق بين القبض والصرف») */}
        {selectedFlow && (
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-medium",
              selectedFlow === "receipt"
                ? "bg-status-success-surface text-status-success-foreground"
                : "bg-status-warning-surface text-status-warning-foreground",
            )}
          >
            {selectedFlow === "receipt" ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
            {selectedFlow === "receipt"
              ? "قبض — المال يدخل خزنتك (فاتورة مبيعات)"
              : "صرف — المال يخرج من خزنتك (فاتورة مشتريات)"}
          </div>
        )}
      </Card>

      {loading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
      {!loading && items.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">لا توجد مستخلَصات بانتظار المراجعة — ارفع مستندًا من الأعلى لتبدأ.</Card>
      )}

      {items.map((ex) => {
        const cur = edits[ex.id] || {};
        const conf = Number(ex.confidence ?? 0);
        const targetOptions = TARGETS_BY_DOCTYPE[ex.docType] || [];
        const t = targets[ex.id] || { appliedTo: targetOptions[0]?.value ?? "", appliedToId: "" };
        // الفاتورة تُنشئ مستندًا جديدًا (لا كيان قائم برقم) → لا تتطلّب رقم كيان؛ التأكيد
        // يفتح النموذج المالي معبَّأً (قبض/صرف حسب نوع الفاتورة).
        const isInvoice = /invoice|فاتورة/i.test(ex.docType);
        const requireTarget = targetOptions.length > 0 && !isInvoice;
        return (
          <Card key={ex.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{ex.docTitle || ex.fileName || `#${ex.documentId}`}</div>
                <div className="text-xs text-muted-foreground">
                  {DOC_TYPE_LABELS[ex.docType] || ex.docType} · ثقة {conf}%
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => rerun(ex.documentId)}>
                  <RefreshCw className="w-4 h-4 ml-1" /> إعادة OCR
                </Button>
                <Button size="sm" variant="destructive" onClick={() => reject(ex.id)} disabled={busyId === ex.id}>
                  <X className="w-4 h-4 ml-1" /> رفض
                </Button>
                <Button size="sm" onClick={() => confirm(ex.id, requireTarget)} disabled={busyId === ex.id}>
                  <Check className="w-4 h-4 ml-1" /> تأكيد وحفظ
                </Button>
              </div>
            </div>

            {requireTarget && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded border border-dashed">
                <div className="space-y-1">
                  <Label className="text-xs">حفظ على كيان</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={t.appliedTo || targetOptions[0]?.value || ""}
                    onChange={(e) => setTarget(ex.id, "appliedTo", e.target.value)}
                  >
                    {targetOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">رقم الكيان (مثلاً رقم الموظف / المركبة)</Label>
                  <Input
                    inputMode="numeric"
                    value={t.appliedToId}
                    onChange={(e) => setTarget(ex.id, "appliedToId", e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="مثال: 1024"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.keys(cur).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{FIELD_LABELS[k] || k}</Label>
                  <Input value={cur[k] ?? ""} onChange={(e) => setField(ex.id, k, e.target.value)} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </PageShell>
  );
}
