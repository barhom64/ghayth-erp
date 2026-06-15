import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  return (
    <FormFieldWrapper label={label}>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onPick(templates.find((t) => String(t.id) === v) ?? null)}
      >
        <SelectTrigger>
          <SelectValue placeholder={templates.length ? "اختر قالبًا محفوظًا" : "لا توجد قوالب محفوظة"} />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.name}
              {t.description ? ` — ${t.description}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormFieldWrapper>
  );
}
