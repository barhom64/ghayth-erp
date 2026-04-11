import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateAr, formatCurrency } from "@/lib/formatters";

export interface PreviewField {
  label: string;
  key: string;
  type?: "text" | "date" | "currency" | "status" | "badge";
}

interface QuickPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: Record<string, any> | null;
  fields: PreviewField[];
}

function renderValue(field: PreviewField, value: any) {
  if (value == null || value === "") return <span className="text-gray-400">-</span>;
  switch (field.type) {
    case "date":
      return <span>{formatDateAr(value)}</span>;
    case "currency":
      return <span className="font-semibold">{formatCurrency(Number(value))}</span>;
    case "status":
      return <StatusBadge status={value} />;
    case "badge":
      return <Badge variant="outline">{value}</Badge>;
    default:
      return <span>{String(value)}</span>;
  }
}

export function QuickPreviewDialog({ open, onOpenChange, title, data, fields }: QuickPreviewDialogProps) {
  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-start">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {fields.map((field) => (
            <div key={field.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <span className="text-sm text-gray-500 font-medium">{field.label}</span>
              <div className="text-sm">{renderValue(field, data[field.key])}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
