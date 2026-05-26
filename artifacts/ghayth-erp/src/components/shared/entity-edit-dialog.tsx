import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/lib/api";
import { FormShell } from "@workspace/ui-core";
import type { z } from "zod";
import type { DefaultValues, FieldValues } from "react-hook-form";

/**
 * EntityEditDialog — a thin dialog wrapper around FormShell that
 * PATCHes an entity by id and invalidates the right query cache keys
 * so the underlying list/detail view refreshes after a save.
 *
 * Detail pages were previously trying to navigate to /:id/edit pages
 * that never existed, so the "تعديل" button was bricked. This restores
 * the affordance inline: the form sits inside a modal, the schema +
 * fields are passed by the host page, and FormShell handles validation,
 * error surfacing, and submit-disable while pending.
 *
 *   <EntityEditDialog
 *     open={editOpen}
 *     onClose={() => setEditOpen(false)}
 *     title="تعديل السياسة"
 *     schema={policySchema}
 *     defaultValues={{ title: policy.title, category: policy.category }}
 *     endpoint={`/governance/policies/${id}`}
 *     invalidateKeys={[["gov-policies"]]}
 *     onSaved={() => refetch()}
 *   >
 *     <FormGrid cols={2}>
 *       <FormTextField name="title" label="العنوان" required />
 *       <FormSelectField name="category" label="الفئة" options={...} />
 *     </FormGrid>
 *   </EntityEditDialog>
 */
interface Props<T extends FieldValues> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  // Allow schemas with .default() — input/output may differ.
  schema: z.ZodType<T, any, any>;
  defaultValues: DefaultValues<T>;
  endpoint: string;
  method?: "PATCH" | "PUT";
  invalidateKeys: string[][];
  onSaved?: () => void;
  successMessage?: string | false;
  /** FormShell field components — FormTextField, FormSelectField, etc. */
  children: ReactNode;
}

export function EntityEditDialog<T extends FieldValues>({
  open,
  onClose,
  title,
  description,
  schema,
  defaultValues,
  endpoint,
  method = "PATCH",
  invalidateKeys,
  onSaved,
  successMessage = "تم الحفظ",
  children,
}: Props<T>) {
  const saveMut = useApiMutation<unknown, T>(
    endpoint,
    method,
    invalidateKeys,
    {
      successMessage,
      onSuccess: () => {
        onClose();
        onSaved?.();
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FormShell
          // Remount when defaultValues change so the form reseeds with
          // the latest server state (e.g. after a refetch).
          key={JSON.stringify(defaultValues)}
          schema={schema}
          defaultValues={defaultValues}
          submitLabel={saveMut.isPending ? "جاري الحفظ…" : "حفظ"}
          secondaryActions={
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          }
          onSubmit={async (values) => {
            await saveMut.mutateAsync(values);
          }}
        >
          {children}
        </FormShell>
      </DialogContent>
    </Dialog>
  );
}
