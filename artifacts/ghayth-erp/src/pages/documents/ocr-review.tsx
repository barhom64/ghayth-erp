import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Check, X, RefreshCw } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { PageShell } from "@workspace/ui-core";

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
  invoiceDate: "تاريخ الفاتورة",
  total: "الإجمالي",
  vat: "ضريبة القيمة المضافة",
};

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
        // فاتورة مشتريات: ليست «ملء كيان قائم» بل إنشاء مستند مالي جديد. لا إنشاء آلي —
        // نفتح نموذج فاتورة المورد معبَّأً (مبلغ/تاريخ/رقم/ضريبة) + مطابقة المورّد بالرقم
        // الضريبي على الفاتورة. البشر يختار/يؤكّد المورّد ويحفظ عبر المسار المُدقَّق.
        const f = edits[id] || {};
        const qs = new URLSearchParams();
        if (f.amount) qs.set("ocrAmount", String(f.amount));
        if (f.vatAmount) qs.set("ocrVat", String(f.vatAmount));
        if (f.date) qs.set("ocrDate", String(f.date));
        if (f.invoiceNo) qs.set("ocrInvoiceNo", String(f.invoiceNo));
        if (f.taxNumber) qs.set("ocrTaxNumber", String(f.taxNumber));
        setItems((p) => p.filter((x) => x.id !== id));
        toast({ title: "تم التأكيد — فتح نموذج فاتورة المشتريات معبَّأً" });
        navigate(`/finance/documents/vendor-invoice?${qs.toString()}`);
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
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشلت إعادة الجدولة", description: err?.message });
    }
  };

  return (
    <PageShell
      title="مستخلَصات OCR بانتظار المراجعة"
      actions={<RefreshAction onRefresh={load} disabled={loading} />}
      loading={loading}
    >
      {loading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}
      {!loading && items.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">لا توجد مستخلَصات بانتظار المراجعة.</Card>
      )}

      {items.map((ex) => {
        const cur = edits[ex.id] || {};
        const conf = Number(ex.confidence ?? 0);
        const targetOptions = TARGETS_BY_DOCTYPE[ex.docType] || [];
        const t = targets[ex.id] || { appliedTo: targetOptions[0]?.value ?? "", appliedToId: "" };
        // الفاتورة تُنشئ مستندًا جديدًا (لا كيان قائم برقم) → لا تتطلّب رقم كيان؛ التأكيد
        // يفتح نموذج فاتورة المشتريات معبَّأً (البند ٣، فاتورة المورد).
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
