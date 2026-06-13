/**
 * Finance / Vendor — create page (the AP / ذمم / فواتير / مدفوعات lens).
 *
 * PR-3 (#2163) — Canonical Ownership: this page used to be bound by
 * BOTH /finance/vendors/create AND /warehouse/suppliers/create. The
 * product-owner mandate (#2163 §3) ruled that these are two different
 * business paths sharing one party master, not two URLs for the same
 * page. The form body now lives in `vendor-party-form.tsx`; this page
 * is the finance wrapper. WarehouseSupplierCreate is its peer wrapper
 * at `pages/create/warehouse/suppliers-create.tsx`.
 *
 * Finance intent:
 *   • POST → /finance/vendors (the AP-aware endpoint)
 *   • WHT (Income Tax Law Art. 68) fields shown
 *   • Page heading + back link land on /finance/vendors
 *   • Draft key separate from warehouse so a finance vendor draft
 *     never accidentally inherits warehouse data
 */
import VendorPartyForm from "@/components/shared/vendor-party-form";

export default function FinanceVendorCreate() {
  return (
    <VendorPartyForm
      intent={{
        title: "إضافة مورد جديد",
        backPath: "/finance/vendors",
        postUrl: "/finance/vendors",
        draftKey: "finance_vendors_create",
        showWht: true,
        saveSuccessMsg: "تم إضافة المورد بنجاح",
        saveErrorMsg: "حدث خطأ أثناء إضافة المورد",
        invalidateKeys: [["vendors"]],
      }}
    />
  );
}
