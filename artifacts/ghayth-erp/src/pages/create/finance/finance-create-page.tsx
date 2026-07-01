import { useState } from "react";
import { CreatePageLayout } from "@workspace/ui-core";
import { FinanceCreateTabs, type FinanceCreateTab } from "@/components/shared/finance-create-tabs";
import FinancialEventCreate from "./financial-event-create";
import FinancialInvoiceCreate from "./financial-invoice-create";
import FinancialVendorInvoiceCreate from "./financial-vendor-invoice-create";

type InPageType = Exclude<FinanceCreateTab, "journal">;

// نوع البدء من المسار: المساران القديمان للفاتورتين (/invoice · /vendor-invoice)
// يعرضان الصفحة الموحّدة بالنوع المناسب مُسبَقًا (بلا إعادة توجيه). يدعم أيضًا ?type=.
function initialType(): InPageType {
  const p = window.location.pathname;
  if (p.endsWith("/vendor-invoice")) return "purchase";
  if (p.endsWith("/invoice")) return "sales";
  const t = new URLSearchParams(window.location.search).get("type");
  return t === "sales" || t === "purchase" ? t : "event";
}

/**
 * الصفحة الموحّدة لتسجيل الواقعة المالية (نظام بروحين — واجهة واحدة، doc 25 §١١.٢).
 * صفحة واحدة بتبويبات تبدّل النوع **في المكان** (قبض/صرف · فاتورة مبيعات · فاتورة
 * مشتريات)؛ كل نوع يعرض نموذجه المضمّن ويمرّ على **منفذه القائم** (`/finance/documents`
 * · `/finance/invoices` · `/finance/vendor-invoices`) — لا نقل منطق، لا هجرة، لا مساس
 * بالدفتر. تبويب «القيد» يَنتقل لصفحته (تدفّق محاسبي مستقل).
 */
export default function FinanceCreatePage() {
  const [type, setType] = useState<InPageType>(initialType);
  return (
    <CreatePageLayout
      title="تسجيل واقعة مالية"
      subtitle="اختر النوع، أدخل ما حدث والبنود — والنظام يشتقّ القيد تلقائيًّا"
      backPath="/finance"
    >
      <div dir="rtl" className="space-y-4">
        <FinanceCreateTabs active={type} onSelect={(k) => setType(k as InPageType)} />
        {type === "sales" ? (
          <FinancialInvoiceCreate embedded />
        ) : type === "purchase" ? (
          <FinancialVendorInvoiceCreate embedded />
        ) : (
          <FinancialEventCreate embedded />
        )}
      </div>
    </CreatePageLayout>
  );
}
