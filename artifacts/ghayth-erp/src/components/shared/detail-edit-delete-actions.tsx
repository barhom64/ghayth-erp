import { useState, useCallback, type ReactNode } from "react";
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

export type EditFieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date";
};

export interface DetailEditDeleteOptions {
  entityLabel: string;
  patchPath: string;
  deletePath: string;
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
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const startEdit = useCallback(() => {
    const init = opts.initialValues || {};
    const f: Record<string, any> = {};
    for (const fld of opts.fields) {
      let v = init[fld.key];
      if (fld.type === "date" && typeof v === "string" && v.includes("T")) v = v.split("T")[0];
      f[fld.key] = v ?? "";
    }
    setForm(f);
    setEditing(true);
    setDeleting(false);
  }, [opts.fields, opts.initialValues]);

  const cancelEdit = () => {
    setEditing(false);
    setForm({});
  };
  const startDelete = () => {
    setDeleting(true);
    setEditing(false);
  };
  const cancelDelete = () => setDeleting(false);

  const saveEdit = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const fld of opts.fields) {
        let v = form[fld.key];
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
        setSaving(false);
        return;
      }
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
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
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
    saving,
    removing,
    form,
    setForm,
    startEdit,
    cancelEdit,
    startDelete,
    cancelDelete,
    saveEdit,
    confirmDelete,
    fields: opts.fields,
    entityLabel: opts.entityLabel,
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
  const showDelete = deletePerm ? canDelete : true;

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
      {showDelete && (hook.deleting ? (
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

export function InlineEditCard({ hook }: { hook: DetailEditDeleteHook }) {
  if (!hook.editing) return null;
  return (
    <Card className="border-status-info-surface bg-status-info-surface/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">تعديل {hook.entityLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hook.fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              {f.type === "date" ? (
                <UnifiedDateInput
                  value={hook.form[f.key] ?? ""}
                  onChange={(v) =>
                    hook.setForm({ ...hook.form, [f.key]: v })
                  }
                  className="mt-1"
                />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={hook.form[f.key] ?? ""}
                  onChange={(e) =>
                    hook.setForm({
                      ...hook.form,
                      [f.key]: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <Button onClick={hook.saveEdit} disabled={hook.saving}>
            {hook.saving ? (
              <Loader2 className="h-4 w-4 me-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 me-1" />
            )}
            حفظ التعديلات
          </Button>
          <Button
            variant="outline"
            onClick={hook.cancelEdit}
            disabled={hook.saving}
          >
            <X className="h-4 w-4 me-1" />
            إلغاء
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
