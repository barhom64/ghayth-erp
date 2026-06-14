import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, Pencil, CheckCircle2, Workflow, Target,
} from "lucide-react";

/**
 * LineAllocationStatusBanner — inline alert on document detail pages
 * (invoice-detail, purchase-order-detail, GRN detail) that surfaces the
 * line-level allocation state of THIS specific document, so a reviewer
 * doesn't have to navigate to /finance/allocation-coverage to know
 * whether the doc has unmapped or manually-overridden lines.
 *
 * Reads each line's `allocationStatus` column (populated by the resolver
 * + by approval handlers in finance-invoices.ts / finance-purchase.ts).
 * The four states map to:
 *
 *   • 'unmapped' / 'failed' → RED banner with deep-link to rules
 *   • 'manual_override'     → AMBER notice with link to override report
 *   • 'resolved'            → green compact badge (no banner)
 *   • absent column         → component hides entirely (legacy docs)
 *
 * Reusable across document types — pass `documentType` so the deep-links
 * filter the destination correctly when query-param filtering exists.
 */

interface LineLike {
  allocationStatus?: string | null;
  accountCode?: string | null;
}

interface Props {
  lines: LineLike[] | undefined;
  /** Used by deep-links so the destination page can pre-filter to this
   *  document type (e.g. /finance/allocation-results?status=unmapped). */
  documentType?: "invoice" | "purchase_order" | "grn" | "expense";
}

export function LineAllocationStatusBanner({ lines, documentType: _documentType }: Props) {
  const list = Array.isArray(lines) ? lines : [];
  // If the document predates the allocation campaign, none of the lines
  // will carry allocationStatus. In that case render nothing — we don't
  // want false alarms on legacy data.
  const tracked = list.filter((l) => l.allocationStatus != null);
  if (tracked.length === 0) return null;

  const unmapped = tracked.filter((l) => l.allocationStatus === "unmapped" || l.allocationStatus === "failed").length;
  const override = tracked.filter((l) => l.allocationStatus === "manual_override").length;
  const resolved = tracked.filter((l) => l.allocationStatus === "resolved").length;

  // Highest-severity state wins. Unmapped > Override > Resolved.
  if (unmapped > 0) {
    return (
      <Card className="border-status-danger-surface bg-status-danger-surface/30">
        <CardContent className="p-3 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-status-danger-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {unmapped} {unmapped === 1 ? "بند" : "بنود"} بدون تخصيص محاسبي
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              لم يطابق المحرك أي قاعدة لهذه البنود — اعتمادها مع تفعيل الإلزام سيُرفض.
              أنشئ قاعدة في «قواعد التوجيه» أو حدّد الحساب يدوياً على البند.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-rules">
                  <Workflow className="h-3.5 w-3.5 ml-1" />
                  افتح قواعد التوجيه
                </Link></Button>
              <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-coverage">
                  <Target className="h-3.5 w-3.5 ml-1" />
                  تشخيص التغطية الكلي
                </Link></Button>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] text-status-danger-foreground border-status-danger-surface">
            {unmapped}/{tracked.length}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  if (override > 0) {
    return (
      <Card className="border-status-warning-surface bg-status-warning-surface/30">
        <CardContent className="p-3 flex items-start gap-3">
          <Pencil className="h-5 w-5 text-status-warning-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {override} {override === 1 ? "بند مُعدَّل يدوياً" : "بنود مُعدَّلة يدوياً"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              في هذه البنود تم تعديل الحساب أو مركز التكلفة يدوياً عن مقترح المحرك — للحوكمة راجع سجل التعديلات.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/overrides-report">
                  <Pencil className="h-3.5 w-3.5 ml-1" />
                  سجل التعديلات اليدوية
                </Link></Button>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] text-status-warning-foreground border-status-warning-surface">
            {override}/{tracked.length}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  // All resolved — compact success chip.
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-status-success-surface bg-status-success-surface/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-success-foreground" />
        <span className="text-xs">
          كل بنود هذا المستند موجَّهة محاسبياً ({resolved}/{tracked.length})
        </span>
      </div>
      <Badge variant="outline" className="text-[10px] text-status-success-foreground border-status-success-surface">
        مُعتمد للمحرك
      </Badge>
    </div>
  );
}
