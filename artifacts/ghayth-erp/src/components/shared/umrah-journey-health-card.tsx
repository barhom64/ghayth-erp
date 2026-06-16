import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApiQuery } from "@/lib/api";
import { formatNumber } from "@/lib/formatters";
import { Activity, FileWarning, UserMinus, ReceiptText, Wallet } from "lucide-react";

/**
 * U-19-P7 — Dashboard journey-health panel.
 *
 * Reads /umrah/reports/recovery-hub and surfaces the 4 stuck-item
 * buckets (imports / sub-agents / groups / invoices) so the operator
 * sees them on the umrah dashboard the moment they log in instead of
 * having to hunt through the recovery hub page.
 *
 * Each bucket links to the page where the operator actually fixes the
 * problem: stuck imports → unlinked importer, unlinked sub-agents →
 * sub-agents list, uninvoiced groups → groups list, unpaid invoices →
 * invoices list. The card renders nothing while the request is
 * in-flight, hides itself entirely when all 4 buckets are zero (clean
 * tenant), and falls back gracefully on error (omits the card; the
 * rest of the dashboard still renders).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No FE write path. Pure read of an existing engine endpoint.
 *   - No new backend endpoint — uses the U-19-P6 recovery-hub route.
 */

type RecoveryHubResponse = {
  stuckImports?: number;
  unlinkedSubAgents?: number;
  uninvoicedGroups?: number;
  unpaidInvoices?: number;
};

type Bucket = {
  key: keyof RecoveryHubResponse;
  label: string;
  href: string;
  icon: typeof Activity;
  tone: "error" | "warning" | "info";
};

const BUCKETS: Bucket[] = [
  { key: "stuckImports",       label: "استيرادات عالقة",       href: "/umrah/import",      icon: FileWarning, tone: "warning" },
  { key: "unlinkedSubAgents",  label: "وكلاء فرعيون بدون ربط", href: "/umrah/sub-agents",  icon: UserMinus,   tone: "info" },
  { key: "uninvoicedGroups",   label: "مجموعات بلا فواتير",    href: "/umrah/groups",      icon: ReceiptText, tone: "warning" },
  { key: "unpaidInvoices",     label: "فواتير غير مدفوعة",     href: "/umrah/invoices",    icon: Wallet,      tone: "error" },
];

const TONE_BG: Record<Bucket["tone"], string> = {
  error:   "bg-status-error-surface",
  warning: "bg-status-warning-surface",
  info:    "bg-status-info-surface",
};
const TONE_FG: Record<Bucket["tone"], string> = {
  error:   "text-status-error-foreground",
  warning: "text-status-warning-foreground",
  info:    "text-status-info-foreground",
};

export function UmrahJourneyHealthCard() {
  const { data, isLoading, isError } = useApiQuery<RecoveryHubResponse>(
    ["umrah-recovery-hub"],
    "/umrah/reports/recovery-hub",
  );

  if (isLoading || isError || !data) return null;

  const total =
    Number(data.stuckImports ?? 0) +
    Number(data.unlinkedSubAgents ?? 0) +
    Number(data.uninvoicedGroups ?? 0) +
    Number(data.unpaidInvoices ?? 0);

  // Clean tenant — nothing to surface. Stay out of the way.
  if (total === 0) return null;

  return (
    <Card data-testid="umrah-journey-health">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-status-warning-foreground" />
          صحة الرحلة — بنود تحتاج متابعة
          <Badge variant="outline" className="ms-auto text-[10px]">
            {formatNumber(total)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BUCKETS.map(({ key, label, href, icon: Icon, tone }) => {
          const count = Number(data[key] ?? 0);
          return (
            <Link
              key={key}
              href={href}
              data-testid={`journey-health-${key}`}
              className="block rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TONE_BG[tone]}`}>
                  <Icon className={`w-4 h-4 ${TONE_FG[tone]}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-lg font-bold ${count > 0 ? TONE_FG[tone] : "text-muted-foreground"}`}>
                    {formatNumber(count)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
