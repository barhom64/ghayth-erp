import { SearchableSelect, type SelectOption } from "@/components/shared/searchable-select";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { useApiQuery } from "@/lib/api";

/**
 * SupplierItemPicker (FIN-P5-SUPPLIER-ITEMS-MEMORY #2235).
 *
 * Shows a supplier's usual items (after the supplier is chosen) filtered by the
 * expense scenario, and hands the selected item's relationship defaults back to
 * the caller. Single responsibility: it lists items and returns
 * itemId/name/unit/taxCode/accountPurpose/lastPrice — it does NOT decide the
 * journal entry and NEVER returns a final accountCode (the item carries an
 * `accountPurpose`; financialEngine/preflight resolves it to a real account).
 *
 * يبني على النواة الموحّدة `SearchableSelect` (قاموس المفاهيم §3، دستور 15):
 * نموذج بحث/اختيار واحد للنظام — أُضيف البحث دون تغيير العقد (onPick يعيد الكائن كاملًا).
 */
export interface SupplierItem {
  id: number;
  supplierId: number;
  name: string;
  itemType: string | null;
  defaultUnit: string | null;
  defaultTaxCodeId: number | null;
  accountPurpose: string | null;
  allowedScenarios: string[] | null;
  lastPrice: number | string | null;
  priceCurrency: string | null;
}

export function SupplierItemPicker({
  supplierId,
  scenario,
  value,
  onPick,
  label = "بند المورد",
}: {
  supplierId: string | number | null | undefined;
  scenario?: string;
  value?: string;
  onPick: (item: SupplierItem | null) => void;
  label?: string;
}) {
  const enabled = !!supplierId;
  const qs = scenario ? `?scenario=${encodeURIComponent(scenario)}` : "";
  const { data } = useApiQuery<{ data: SupplierItem[] }>(
    ["supplier-items", String(supplierId ?? ""), scenario ?? ""],
    `/warehouse/suppliers/${supplierId}/items${qs}`,
    { enabled },
  );
  const items = data?.data ?? [];
  if (!enabled) return null;

  const options: SelectOption[] = items.map((it) => ({
    value: String(it.id),
    label: it.name,
    sublabel: [
      it.defaultUnit ?? null,
      it.lastPrice != null ? `آخر سعر ${Number(it.lastPrice).toLocaleString("ar-SA")}` : null,
    ].filter(Boolean).join(" — ") || undefined,
  }));

  const emptyOrPlaceholder = items.length
    ? "اختر بندًا معروفًا لهذا المورد"
    : "لا توجد بنود محفوظة لهذا المورد";

  return (
    <FormFieldWrapper label={label}>
      <SearchableSelect
        options={options}
        value={value ?? ""}
        onValueChange={(v) => onPick(items.find((it) => String(it.id) === v) ?? null)}
        placeholder={emptyOrPlaceholder}
        searchPlaceholder="ابحث عن بند..."
        emptyText="لا توجد بنود محفوظة لهذا المورد"
      />
    </FormFieldWrapper>
  );
}
