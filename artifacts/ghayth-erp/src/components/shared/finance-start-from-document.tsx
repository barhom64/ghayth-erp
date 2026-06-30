import { useLocation } from "wouter";

/**
 * شريط «ابدأ من مستند» المشترك — يُبرز محرّك القراءة الضوئية (OCR) وبوابة الاستيراد
 * في صفحات الإنشاء المالية: امسح فاتورة/ورقة ضوئيًّا أو استورد Excel/CSV بدل الإدخال
 * اليدوي. مصدر واحد بدل تكرار نفس الكتلة في كل صفحة (DRY — الدستور: لا تكرار).
 */
export function FinanceStartFromDocument() {
  const [, navigate] = useLocation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed bg-surface-subtle px-3 py-2 text-sm">
      <span className="text-muted-foreground">عندك المستند جاهز؟ ابدأ منه:</span>
      <button type="button" className="text-primary hover:underline font-medium" onClick={() => navigate("/documents/ocr/review")}>
        قراءة ضوئية (OCR) ←
      </button>
      <span className="text-muted-foreground" aria-hidden>·</span>
      <button type="button" className="text-primary hover:underline font-medium" onClick={() => navigate("/finance/documents/import")}>
        استيراد Excel/CSV ←
      </button>
    </div>
  );
}
