/**
 * Warehouse / Supplier — create page (the تشغيلي / مشتريات / توريد /
 * مخزون lens).
 *
 * PR-3 (#2163) — Canonical Ownership wrapper-split peer of
 * FinanceVendorCreate. Before PR-3, /warehouse/suppliers/create was
 * bound to the finance vendor page — same WHT fields, same POST to
 * /finance/vendors. A warehouse operator entering a supplier had no
 * reason to be answering Withholding-Tax residency questions, and the
 * audit lane recorded the change under finance ownership even though
 * the operator and the business event were warehouse. The product-
 * owner mandate (#2163 §3): «vendor و supplier ليسا نفس المسار
 * بالضرورة; قد يشتركان في Party Master لكن المسار يختلف».
 *
 * Warehouse intent:
 *   • POST → /warehouse/suppliers (the procurement-aware endpoint;
 *     authorize gate `warehouse.inventory:create`, separate audit
 *     lane, no WHT field on the zod schema)
 *   • WHT fields HIDDEN — irrelevant to a procurement supplier at
 *     creation time. If the same party later becomes a finance vendor
 *     (paid through AP), the finance page is where the WHT decision
 *     gets recorded.
 *   • Page heading + back link land on /warehouse/suppliers
 *   • Draft key separate from finance so a half-typed warehouse
 *     supplier never bleeds into the finance vendor draft slot
 *   • Party master link is created by the backend endpoint itself
 *     (registerEntityParty inside warehouse.ts) — same party-master
 *     guarantee finance vendors get, recorded under entity_type
 *     "suppliers" + entity_role "supplier".
 */
import VendorPartyForm from "@/components/shared/vendor-party-form";

export default function WarehouseSupplierCreate() {
  return (
    <VendorPartyForm
      intent={{
        title: "إضافة مورد للمستودع",
        backPath: "/warehouse/suppliers",
        postUrl: "/warehouse/suppliers",
        draftKey: "warehouse_suppliers_create",
        showWht: false,
        saveSuccessMsg: "تم إضافة المورد بنجاح",
        saveErrorMsg: "حدث خطأ أثناء إضافة المورد",
        invalidateKeys: [["suppliers"]],
      }}
    />
  );
}
