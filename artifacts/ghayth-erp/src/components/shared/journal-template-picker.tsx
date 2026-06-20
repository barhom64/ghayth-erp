import { SearchableSelect, type SelectOption } from "@/components/shared/searchable-select";
import { FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { useApiQuery } from "@/lib/api";

/**
 * JournalTemplatePicker (FIN-FINANCIAL-MEMORY-FOUNDATION).
 *
 * Lists a company's recurring MANUAL journal templates and hands the picked
 * template back to the caller. Single responsibility: it lists templates and
 * returns the template id/name — each template line carries an `accountPurpose`
 * (resolved to a real account by the financial engine). It does NOT decide the
 * journal and NEVER carries a final accountCode.
 *
 * يبني على النواة الموحّدة `SearchableSelect` (قاموس المفاهيم §3، دستور 15):
 * نموذج بحث/اختيار واحد للنظام — أُضيف البحث دون تغيير العقد (onPick يعيد الكائن كاملًا).
 */
export interface JournalTemplate {
  id: number;
  name: string;
  description: string | null;
  defaultSupplierId: number | null;
  defaultCostCenterId: number | null;
  currency: string;
}

export function JournalTemplatePicker({
  value,
  onPick,
  label = "قالب قيد محفوظ",
}: {
  value?: string;
  onPick: (template: JournalTemplate | null) => void;
  label?: string;
}) {
  const { data } = useApiQuery<{ data: JournalTemplate[] }>(
    ["journal-templates"],
    `/finance/journal-templates`,
  );
  const templates = data?.data ?? [];

  const options: SelectOption[] = templates.map((t) => ({
    value: String(t.id),
    label: t.name,
    sublabel: t.description ?? undefined,
  }));

  return (
    <FormFieldWrapper label={label}>
      <SearchableSelect
        options={options}
        value={value ?? ""}
        onValueChange={(v) => onPick(templates.find((t) => String(t.id) === v) ?? null)}
        placeholder={templates.length ? "اختر قالبًا محفوظًا" : "لا توجد قوالب محفوظة"}
        searchPlaceholder="ابحث عن قالب..."
        emptyText="لا توجد قوالب محفوظة"
      />
    </FormFieldWrapper>
  );
}
