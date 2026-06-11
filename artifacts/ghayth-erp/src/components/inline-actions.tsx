import { useState } from "react";
import { z, type ZodTypeAny } from "zod";
import { Button } from "@/components/ui/button";
import {
  FormShell,
  FormGrid,
  FormTextField,
  FormNumberField,
  FormDateField,
  FormSelectField,
} from "@workspace/ui-core";
import { Pencil, Trash2, Loader2, X } from "lucide-react";
import { apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/components/shared/permission-gate";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteConfirmImpact } from "@/components/delete-confirm-impact";

export interface EditField {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  options?: { value: string; label: string }[];
}

export function useRowActions() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  return {
    editingId,
    deletingId,
    editForm,
    setEditForm,
    startEdit: (id: number, initialData: Record<string, any>) => {
      setEditingId(id);
      setDeletingId(null);
      setEditForm(initialData);
    },
    startDelete: (id: number) => {
      setDeletingId(id);
      setEditingId(null);
    },
    cancelEdit: () => { setEditingId(null); setEditForm({}); },
    cancelDelete: () => setDeletingId(null),
    reset: () => { setEditingId(null); setDeletingId(null); setEditForm({}); },
  };
}

export function RowActions({
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
  deletePerm,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  deletePerm?: string;
}) {
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === "owner" || user?.role === "admin";
  const hasDeletePerm = usePermission(deletePerm ?? "");
  const showDelete = deletePerm ? hasDeletePerm : isAdminOrOwner;

  return (
    <div className="flex items-center gap-1">
      {onEdit && canEdit && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="تعديل">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
      {onDelete && canDelete && showDelete && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="حذف">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

/**
 * Builds a permissive zod schema from the field list so InlineEditForm
 * can run inside FormShell without each consumer hand-writing a schema.
 * Number-typed fields accept either number or string (the FormNumberField
 * keeps them as string until submit).
 */
function buildSchema(fields: EditField[]): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) {
    shape[f.key] = f.type === "number"
      ? z.union([z.string(), z.number()]).optional()
      : z.string().optional();
  }
  return z.object(shape);
}

function normalizeDefaults(fields: EditField[], initial: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = {};
  for (const f of fields) {
    const v = initial[f.key];
    if (v == null) next[f.key] = "";
    else next[f.key] = String(v);
  }
  return next;
}

/**
 * Inline row-edit form rendered as a colored strip beneath the table row.
 *
 * Migrated from raw <Input>/<Select>/<UnifiedDateInput> + an externally-
 * owned `form`/`setForm` pair to FormShell + zod. The parent now passes
 * `initialValues` once and reads the submitted values via `onSave(values)`
 * — RHF owns the per-keystroke state inside FormShell.
 *
 * For consumers that need to keep the values in their own state (e.g.
 * to feed `handleSave(id, editForm)`), useInlineActions still exposes
 * `editForm` and `setEditForm` as a seed/snapshot — the FormShell
 * submission carries the canonical post-edit values.
 */
export function InlineEditForm({
  fields,
  initialValues,
  onSave,
  onCancel,
  isPending,
}: {
  fields: EditField[];
  initialValues: Record<string, any>;
  onSave: (values: Record<string, any>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const schema = buildSchema(fields);
  const defaults = normalizeDefaults(fields, initialValues);

  return (
    <div className="p-3 bg-status-info-surface/50 border border-status-info-surface rounded-lg">
      <FormShell
        schema={schema}
        defaultValues={defaults}
        submitLabel={isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
        disabled={isPending}
        secondaryActions={
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={isPending} className="gap-1">
            <X className="h-3 w-3" /> إلغاء
          </Button>
        }
        onSubmit={(values) => {
          // Coerce number fields back to numbers so the server payload
          // matches the previous contract (consumers expected
          // editForm[k]: number when EditField.type === "number").
          const coerced: Record<string, any> = { ...values };
          for (const f of fields) {
            if (f.type === "number" && coerced[f.key] !== "" && coerced[f.key] != null) {
              const n = Number(coerced[f.key]);
              if (Number.isFinite(n)) coerced[f.key] = n;
            }
          }
          onSave(coerced);
        }}
      >
        <FormGrid cols={4}>
          {fields.map((f) => {
            if (f.type === "select" && f.options) {
              return (
                <FormSelectField
                  key={f.key}
                  name={f.key}
                  label={f.label}
                  options={f.options}
                />
              );
            }
            if (f.type === "date") {
              return <FormDateField key={f.key} name={f.key} label={f.label} />;
            }
            if (f.type === "number") {
              return <FormNumberField key={f.key} name={f.key} label={f.label} />;
            }
            return <FormTextField key={f.key} name={f.key} label={f.label} />;
          })}
        </FormGrid>
      </FormShell>
    </div>
  );
}

export function InlineDeleteConfirm({
  onConfirm,
  onCancel,
  isPending,
  itemName,
  entityType,
  entityId,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  itemName?: string;
  entityType?: string;
  entityId?: number;
}) {
  if (entityType && entityId) {
    return (
      <DeleteConfirmImpact
        entityType={entityType}
        entityId={entityId}
        entityName={itemName || "هذا العنصر"}
        onConfirm={onConfirm}
        onCancel={onCancel}
        isPending={isPending}
      />
    );
  }

  return (
    <div className="p-3 bg-status-error-surface border border-status-error-surface rounded-lg flex items-center justify-between">
      <span className="text-sm text-status-error-foreground">
        هل أنت متأكد من حذف {itemName ? `"${itemName}"` : "هذا العنصر"}؟
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={onConfirm} disabled={isPending} className="gap-1">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          تأكيد الحذف
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending} className="gap-1">
          <X className="h-3 w-3" />
          إلغاء
        </Button>
      </div>
    </div>
  );
}

export function useInlineActions({
  endpoint,
  queryKeys,
  onSuccess,
}: {
  endpoint: string;
  queryKeys: string[][];
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const actions = useRowActions();
  const [isPending, setIsPending] = useState(false);

  const handleSave = async (id: number, body: Record<string, any>) => {
    setIsPending(true);
    try {
      await apiPatch(`${endpoint}/${id}`, body);
      queryKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      onSuccess?.();
      toast({ title: "تم التعديل بنجاح" });
      actions.reset();
    } catch (err: any) {
      toast({ title: "فشل التعديل", description: err.message, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async (id: number) => {
    setIsPending(true);
    try {
      await apiDelete(`${endpoint}/${id}`);
      queryKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      onSuccess?.();
      toast({ title: "تم الحذف بنجاح" });
      actions.reset();
    } catch (err: any) {
      toast({ title: "فشل الحذف", description: err.message, variant: "destructive" });
    } finally {
      setIsPending(false);
    }
  };

  return { ...actions, isPending, handleSave, handleDelete };
}
