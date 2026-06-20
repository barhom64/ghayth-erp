import VendorPartyForm from "@/components/shared/vendor-party-form";

export interface VendorCreateFormProps {
  /** Called with the freshly-created vendor row after a successful save. */
  onCreated: (created: any) => void;
  /** Called when the operator cancels. */
  onCancel: () => void;
}

/**
 * Embedded finance-vendor create form for the AllowCreateDrawer — wraps the
 * shared `VendorPartyForm` with the finance intent in embedded mode (no page
 * chrome, returns the new row instead of navigating). The full AP-aware form
 * (incl. WHT fields) is preserved, so an inline create is not a truncated
 * quick-add.
 */
export function VendorCreateForm({ onCreated, onCancel }: VendorCreateFormProps) {
  return (
    <VendorPartyForm
      embedded
      onCreated={onCreated}
      onCancel={onCancel}
      intent={{
        title: "إضافة مورد جديد",
        backPath: "/finance/vendors",
        postUrl: "/finance/vendors",
        draftKey: "finance_vendors_create_inline",
        showWht: true,
        saveSuccessMsg: "تم إضافة المورد بنجاح",
        saveErrorMsg: "حدث خطأ أثناء إضافة المورد",
        invalidateKeys: [["vendors"]],
      }}
    />
  );
}
