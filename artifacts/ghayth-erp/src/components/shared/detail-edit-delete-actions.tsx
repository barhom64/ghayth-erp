import { useState, useCallback, type ReactNode } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { apiPatch, apiDelete, getErrorMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/components/shared/permission-gate";
import { FormShell } from "@workspace/ui-core";

export type EditFieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date";
};

export interface DetailEditDeleteOptions {
  entityLabel: string;
  patchPath: string;
  /** Omit when the backend doesn't expose a DELETE endpoint for the
   *  entity (e.g. /umrah/seasons — only GET + PATCH). The InlineEditCard
   *  reads this to hide the Trash button. */
  deletePath?: string;
  listPath: string;
  initialValues: Record<string, any> | null | undefined;
  fields: EditFieldDef[];
  invalidateKeys?: any[][];
  onSaved?: () => void;
}

export function useDetailEditDelete(opts: DetailEditDeleteOptions) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const startEdit = useCallback(() => {
    setEditing(true);
    setDeleting(false);
  }, []);

  const cancelEdit = () => {
    setEditing(false);
  };
  const startDelete = () => {
    setDeleting(true);
    setEditing(false);
  };
  const cancelDelete = () => setDeleting(false);

  const submitEdit = async (values: Record<string, any>) => {
    const payload: Record<string, any> = {};
    for (const fld of opts.fields) {
      let v = values[fld.key];
      // Skip empty/null fields — most PATCH schemas don't accept null,
      // and unchanged values should be omitted from a partial update.
      if (v === "" || v == null) continue;
      if (fld.type === "number") {
        const n = Number(v);
        if (Number.isNaN(n)) continue;
        v = n;
      }
      payload[fld.key] = v;
    }
    if (Object.keys(payload).length === 0) {
      toast({ title: "لا تغييرات للحفظ" });
      setEditing(false);
      return;
    }
    try {
      await apiPatch(opts.patchPath, payload);
      toast({ title: `تم تحديث ${opts.entityLabel}` });
      setEditing(false);
      for (const k of opts.invalidateKeys || []) {
        qc.invalidateQueries({ queryKey: k });
      }
      opts.onSaved?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تعذّر الحفظ",
        description: getErrorMessage(err),
      });
      throw err;
    }
  };

  const confirmDelete = async () => {
    if (!opts.deletePath) return;
    setRemoving(true);
    try {
      await apiDelete(opts.deletePath);
      toast({ title: `تم حذف ${opts.entityLabel}` });
      for (const k of opts.invalidateKeys || []) {
        qc.invalidateQueries({ queryKey: k });
      }
      navigate(opts.listPath);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "تعذّر الحذف",
        description: getErrorMessage(err),
      });
      setRemoving(false);
    }
  };

  return {
    editing,
    deleting,
    removing,
    startEdit,
    cancelEdit,
    startDelete,
    cancelDelete,
    submitEdit,
    confirmDelete,
    hasDelete: !!opts.deletePath,
    fields: opts.fields,
    entityLabel: opts.entityLabel,
    initialValues: opts.initialValues,
  };
}

export type DetailEditDeleteHook = ReturnType<typeof useDetailEditDelete>;

export function DetailActionButtons({
  hook,
  extra,
  editPerm,
  deletePerm,
}: {
  hook: DetailEditDeleteHook;
  extra?: ReactNode;
  editPerm?: string;
  deletePerm?: string;
}) {
  const canEdit = usePermission(editPerm ?? "");
  const canDelete = usePermission(deletePerm ?? "");
  const showEdit = editPerm ? canEdit : true;
  // Hide the Trash button when the entity has no DELETE endpoint
  // (umrah-season-detail and similar) — the hook signals this via
  // `hasDelete`.
  const showDelete = hook.hasDelete && (deletePerm ? canDelete : true);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {extra}
      {showEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={hook.startEdit}
          title="تعديل"
          disabled={hook.editing}
        >
          <Pencil className="h-4 w-4 me-1" />
          تعديل
        </Button>
      )}
      {showDelete && hook.hasDelete && (hook.deleting ? (
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={hook.confirmDelete}
            disabled={hook.removing}
          >
            {hook.removing ? (
              <Loader2 className="h-4 w-4 me-1 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 me-1" />
            )}
            تأكيد الحذف
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={hook.cancelDelete}
            disabled={hook.removing}
          >
            <X className="h-4 w-4 me-1" />
            إلغاء
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="text-status-error-foreground"
          onClick={hook.startDelete}
          title="حذف"
        >
          <Trash2 className="h-4 w-4 me-1" />
          حذف
        </Button>
      ))}
    </div>
  );
}

// Render-time helpers wired to FormShell's react-hook-form context.
function InlineEditField({ field }: { field: EditFieldDef }) {
  const { register, watch, setValue } = useFormContext<Record<string, any>>();
  if (field.type === "date") {
    const value = watch(field.key);
    return (
      <div>
        <Label className="text-xs">{field.label}</Label>
        <UnifiedDateInput
          value={value ?? ""}
          onChange={(v) => setValue(field.key, v, { shouldDirty: true })}
          className="mt-1"
        />
      </div>
    );
  }
  return (
    <div>
      <Label className="text-xs">{field.label}</Label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        {...register(field.key)}
        className="mt-1"
      />
    </div>
  );
}

function InlineEditSubmitButton() {
  const { formState } = useFormContext();
  return (
    <Button type="submit" rateLimitAware disabled={formState.isSubmitting}>
      {formState.isSubmitting ? (
        <Loader2 className="h-4 w-4 me-1 animate-spin" />
      ) : (
        <Check className="h-4 w-4 me-1" />
      )}
      حفظ التعديلات
    </Button>
  );
}

function InlineEditCancelButton({ onCancel }: { onCancel: () => void }) {
  const { formState } = useFormContext();
  return (
    <Button type="button" variant="outline" onClick={onCancel} disabled={formState.isSubmitting}>
      <X className="h-4 w-4 me-1" />
      إلغاء
    </Button>
  );
}

export function InlineEditCard({ hook }: { hook: DetailEditDeleteHook }) {
  if (!hook.editing) return null;
  // Build a permissive runtime zod schema — the hook's submitEdit
  // does its own number coercion + empty-skip filtering, so the schema
  // here is intentionally lax. Date fields keep coming in as ISO
  // strings, number fields as either strings or numbers (the <Input
  // type="number"> returns a string anyway).
  const schemaShape: Record<string, z.ZodTypeAny> = {};
  const defaults: Record<string, any> = {};
  for (const f of hook.fields) {
    schemaShape[f.key] = z.any();
    let v = hook.initialValues?.[f.key] ?? "";
    if (f.type === "date" && typeof v === "string" && v.includes("T")) {
      v = v.split("T")[0];
    }
    defaults[f.key] = v;
  }
  const editSchema = z.object(schemaShape);

  return (
    <Card className="border-status-info-surface bg-status-info-surface/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">تعديل {hook.entityLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <FormShell
          // Remount whenever the initialValues snapshot changes (e.g. after
          // a refetch) so the defaults stay in sync without a useEffect.
          key={JSON.stringify(defaults)}
          schema={editSchema as unknown as z.ZodType<Record<string, any>>}
          defaultValues={defaults}
          hideSubmit
          onSubmit={(values) => hook.submitEdit(values)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {hook.fields.map((f) => (
              <InlineEditField key={f.key} field={f} />
            ))}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <InlineEditSubmitButton />
            <InlineEditCancelButton onCancel={hook.cancelEdit} />
          </div>
        </FormShell>
      </CardContent>
    </Card>
  );
}
