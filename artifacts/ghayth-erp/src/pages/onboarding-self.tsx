import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, UserCircle2, Paperclip, FileText, X } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface Attachment {
  path: string; name: string; mimeType: string; size: number; uploadedAt?: string;
}
const ACCEPT_DOC = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_DOC_BYTES = 5 * 1024 * 1024;

// صفحة الاستكمال الذاتي للموظف — عامة (بلا تسجيل دخول). يفتحها الموظف عبر
// رابط التسجيل السريع (?token=...) فيرى ما حدّده صاحب الشركة (قراءة فقط)
// ويملأ بياناته الشخصية فقط. تُرسَل لمرحلة مؤقتة بانتظار اعتماد جهة العمل.
// لا يمنح الرابط أي دخول للنظام.

interface OwnerSet {
  name?: string; empNumber?: string; jobTitle?: string;
  branchName?: string; departmentName?: string; hireDate?: string;
}

type FieldKey =
  | "nationalId" | "nationality" | "gender" | "dateOfBirth" | "phone" | "personalEmail"
  | "iqamaNumber" | "iqamaExpiry" | "passportNumber" | "passportExpiry"
  | "borderNumber" | "visaNumber" | "visaType" | "visaExpiry"
  | "bankName" | "bankAccount" | "iban" | "emergencyContact" | "emergencyPhone";

const FIELDS: { key: FieldKey; label: string; type?: string }[] = [
  { key: "nationalId", label: "رقم الهوية" },
  { key: "nationality", label: "الجنسية" },
  { key: "dateOfBirth", label: "تاريخ الميلاد", type: "date" },
  { key: "phone", label: "رقم الجوال" },
  { key: "personalEmail", label: "البريد الشخصي", type: "email" },
  { key: "iqamaNumber", label: "رقم الإقامة" },
  { key: "iqamaExpiry", label: "انتهاء الإقامة", type: "date" },
  { key: "passportNumber", label: "رقم الجواز" },
  { key: "passportExpiry", label: "انتهاء الجواز", type: "date" },
  { key: "borderNumber", label: "رقم الحدود" },
  { key: "visaNumber", label: "رقم التأشيرة" },
  { key: "visaType", label: "نوع التأشيرة" },
  { key: "visaExpiry", label: "انتهاء التأشيرة", type: "date" },
  { key: "bankName", label: "اسم البنك" },
  { key: "bankAccount", label: "رقم الحساب البنكي" },
  { key: "iban", label: "الآيبان (IBAN)" },
  { key: "emergencyContact", label: "جهة اتصال الطوارئ" },
  { key: "emergencyPhone", label: "رقم الطوارئ" },
];

export default function OnboardingSelf() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [owner, setOwner] = useState<OwnerSet>({});
  const [form, setForm] = useState<Record<string, string>>({ gender: "male" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/public/onboarding/${encodeURIComponent(token)}`);
        if (!res.ok) { setStatus("invalid"); return; }
        const data = await res.json();
        setOwner(data.ownerSet || {});
        if (data.submitted && typeof data.submitted === "object") {
          const { attachments: prevAtt, ...rest } = data.submitted as Record<string, unknown>;
          setForm((f) => ({ ...f, ...(rest as Record<string, string>) }));
          if (Array.isArray(prevAtt)) setAttachments(prevAtt as Attachment[]);
        }
        setStatus("ready");
      } catch {
        setStatus("invalid");
      }
    })();
  }, [token]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setUploadError(null);
    if (!ACCEPT_DOC.split(",").includes(file.type)) {
      setUploadError("نوع الملف غير مدعوم. المسموح: صور JPG/PNG/WebP أو PDF.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setUploadError("حجم الملف يتجاوز الحد المسموح (5 ميغابايت).");
      return;
    }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${API_BASE}/api/public/onboarding/${encodeURIComponent(token)}/document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataBase64 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.attachment) {
        setUploadError(j.error || "تعذّر رفع الملف. حاول مرة أخرى.");
        return;
      }
      setAttachments((a) => [...a, j.attachment as Attachment]);
    } catch {
      setUploadError("تعذّر رفع الملف. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/public/onboarding/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachments }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "تعذّر إرسال البيانات. حاول مرة أخرى.");
        setSubmitting(false);
        return;
      }
      setStatus("done");
    } catch {
      setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }
  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-status-error-foreground mx-auto" />
          <h1 className="text-lg font-semibold">الرابط غير صالح أو منتهٍ</h1>
          <p className="text-sm text-muted-foreground">يرجى طلب رابط جديد من جهة العمل لاستكمال بياناتك.</p>
        </div>
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-status-success-foreground mx-auto" />
          <h1 className="text-lg font-semibold">تم استلام بياناتك</h1>
          <p className="text-sm text-muted-foreground">ستتم مراجعتها واعتمادها من جهة العمل لتفعيل حسابك. شكرًا لك.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-subtle py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto bg-surface rounded-2xl border border-border p-6 space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <UserCircle2 className="w-8 h-8 text-status-info-foreground" />
          <div>
            <h1 className="text-lg font-semibold">استكمال بيانات التوظيف</h1>
            <p className="text-xs text-muted-foreground">أكمل بياناتك الشخصية. الحقول التي تحدّدها جهة العمل تظهر للاطّلاع فقط.</p>
          </div>
        </div>

        {/* ما حدّدته جهة العمل — قراءة فقط */}
        <div className="rounded-xl bg-surface-subtle p-4 grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">الاسم: </span>{owner.name || "—"}</div>
          <div><span className="text-muted-foreground">الرقم الوظيفي: </span>{owner.empNumber || "—"}</div>
          <div><span className="text-muted-foreground">المسمى: </span>{owner.jobTitle || "—"}</div>
          <div><span className="text-muted-foreground">الفرع: </span>{owner.branchName || "—"}</div>
          <div><span className="text-muted-foreground">القسم: </span>{owner.departmentName || "—"}</div>
          <div><span className="text-muted-foreground">تاريخ المباشرة: </span>{owner.hireDate || "—"}</div>
        </div>

        {/* بيانات الموظف */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">الجنس</label>
            <select
              className="border border-border rounded-lg px-3 py-2 bg-surface text-sm"
              value={form.gender || "male"}
              onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
            >
              <option value="male">ذكر</option>
              <option value="female">أنثى</option>
            </select>
          </div>
          {FIELDS.map((fld) => (
            <div key={fld.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium">{fld.label}</label>
              <input
                type={fld.type || "text"}
                className="border border-border rounded-lg px-3 py-2 bg-surface text-sm"
                value={form[fld.key] || ""}
                onChange={(e) => setForm((f) => ({ ...f, [fld.key]: e.target.value }))}
                dir={fld.type === "email" || fld.key === "iban" ? "ltr" : undefined}
              />
            </div>
          ))}
        </div>

        {/* المرفقات — صور الهوية/الجواز/الإقامة أو ملفات PDF */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">المرفقات</h2>
              <p className="text-xs text-muted-foreground">ارفع صور الهوية أو الجواز أو الإقامة (JPG/PNG/WebP أو PDF، حتى 5 ميغابايت).</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 border border-border rounded-lg px-4 py-2 text-sm disabled:opacity-60"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {uploading ? "جاري الرفع..." : "إضافة مرفق"}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPT_DOC} className="hidden" onChange={onPickFile} />
          </div>
          {uploadError && <p className="text-sm text-status-error-foreground">{uploadError}</p>}
          {attachments.length > 0 && (
            <ul className="space-y-2">
              {attachments.map((att, i) => (
                <li key={att.path} className="flex items-center justify-between rounded-lg bg-surface-subtle px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-status-info-foreground" />
                    <span className="truncate">{att.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{(att.size / 1024).toFixed(0)} ك.ب</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-status-error-foreground shrink-0"
                    aria-label="إزالة المرفق"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-status-error-foreground">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="bg-status-info-surface text-status-info-foreground font-medium rounded-lg px-6 py-2.5 text-sm disabled:opacity-60"
          >
            {submitting ? "جاري الإرسال..." : "إرسال البيانات"}
          </button>
        </div>
      </div>
    </div>
  );
}
