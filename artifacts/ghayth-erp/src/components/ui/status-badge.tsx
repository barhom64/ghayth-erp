import { Badge } from "@/components/ui/badge";
import { STATUSES, getStatusColor } from "@/lib/constants";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge className={`font-normal ${getStatusColor(status)} ${className || ""}`} variant="outline">
      {STATUSES[status] || status}
    </Badge>
  );
}
