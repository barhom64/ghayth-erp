import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckSquare, Square, CheckCircle, XCircle, Download, Trash2, Loader2, MinusSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { exportToCSV } from "@/components/shared/advanced-filters";

interface BulkActionsProps {
  entityType: string;
  items: any[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onClear: () => void;
  invalidateKeys?: string[][];
  csvColumns?: Array<{ key: string; label: string }>;
  csvFileName?: string;
  actions?: Array<"approve" | "reject" | "delete" | "close" | "export">;
}

export function useBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: number[]) => {
    setSelectedIds((prev) => {
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  };

  const clear = () => setSelectedIds(new Set());

  return { selectedIds, toggle, toggleAll, clear };
}

export function BulkCheckbox({ checked, indeterminate, onChange, className }: { checked: boolean; indeterminate?: boolean; onChange: () => void; className?: string }) {
  const Icon = indeterminate ? MinusSquare : checked ? CheckSquare : Square;
  return (
    <button onClick={onChange} className={cn("text-gray-400 hover:text-blue-600 transition-colors p-0.5", checked && "text-blue-600", className)}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function BulkActionsBar({
  entityType,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  onClear,
  invalidateKeys = [],
  csvColumns,
  csvFileName,
  actions = ["approve", "reject", "delete", "export"],
}: BulkActionsProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  const executeBulk = async (action: string) => {
    if (selectedIds.size === 0) return;
    setLoading(action);
    try {
      const result = await apiFetch<any>("/entity-meta/bulk-action", {
        method: "POST",
        body: JSON.stringify({ entityType, entityIds: Array.from(selectedIds), action }),
      });
      toast({ title: result.message || "تم التنفيذ بنجاح" });
      onClear();
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setLoading(null);
    }
  };

  const handleExport = () => {
    if (!csvColumns || !csvFileName) return;
    const selected = items.filter((item) => selectedIds.has(item.id));
    exportToCSV(selected, csvColumns, csvFileName);
    toast({ title: `تم تصدير ${selected.length} سجل` });
  };

  if (selectedIds.size === 0) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg animate-in fade-in slide-in-from-top-1">
      <span className="text-sm font-medium text-blue-700">
        تم تحديد {selectedIds.size} سجل
      </span>

      <div className="flex items-center gap-1.5 ms-auto">
        {actions.includes("approve") && (
          <Button size="sm" variant="outline" className="gap-1 text-green-700 border-green-300 hover:bg-green-50" onClick={() => executeBulk("approve")} disabled={!!loading}>
            {loading === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            اعتماد جماعي
          </Button>
        )}
        {actions.includes("reject") && (
          <Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-300 hover:bg-red-50" onClick={() => executeBulk("reject")} disabled={!!loading}>
            {loading === "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            رفض جماعي
          </Button>
        )}
        {actions.includes("close") && (
          <Button size="sm" variant="outline" className="gap-1 text-gray-700 border-gray-300 hover:bg-gray-50" onClick={() => executeBulk("close")} disabled={!!loading}>
            {loading === "close" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            إغلاق جماعي
          </Button>
        )}
        {actions.includes("export") && csvColumns && (
          <Button size="sm" variant="outline" className="gap-1 text-blue-700 border-blue-300 hover:bg-blue-50" onClick={handleExport} rateLimitAware>
            <Download className="h-3.5 w-3.5" />
            تصدير جدولي
          </Button>
        )}
        {actions.includes("delete") && (
          <Button size="sm" variant="outline" className="gap-1 text-red-700 border-red-300 hover:bg-red-50" onClick={() => executeBulk("delete")} disabled={!!loading}>
            {loading === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            حذف جماعي
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-gray-500" onClick={onClear}>
          إلغاء التحديد
        </Button>
      </div>
    </div>
  );
}
