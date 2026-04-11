import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { apiPatch, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const { user } = useAuth();
  const isAdminOrOwner = user?.role === "owner" || user?.role === "admin";

  return (
    <div className="flex items-center gap-1">
      {onEdit && canEdit && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="تعديل">
          <Pencil className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}
      {onDelete && canDelete && isAdminOrOwner && (
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="حذف">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </div>
  );
}

export function InlineEditForm({
  fields,
  form,
  setForm,
  onSave,
  onCancel,
  isPending,
}: {
  fields: EditField[];
  form: Record<string, any>;
  setForm: (f: Record<string, any>) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {fields.map((f) => (
          <div key={f.key}>
            <Label className="text-xs mb-1">{f.label}</Label>
            {f.type === "select" && f.options ? (
              <select
                className="w-full border rounded-md p-2 text-sm bg-white"
                value={form[f.key] || ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <Input
                type={f.type || "text"}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                className="h-8 text-sm"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" onClick={onSave} disabled={isPending} className="gap-1">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          حفظ التعديلات
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending} className="gap-1">
          <X className="h-3 w-3" />
          إلغاء
        </Button>
      </div>
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
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
      <span className="text-sm text-red-700">
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
