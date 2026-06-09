import { useApiQuery } from "@/lib/api";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

// §6 من شرائع #1870 — drill-through محاسبي.
// كرت يعرض القيد المحاسبي المرتبط بمصدر عمرة (فاتورة بيع/نسك/دفعة/...)
// مع كل سطر بحسابه + توازن المدين/الدائن + الأبعاد التحليلية.

interface JournalLine {
  id: number;
  accountCode: string;
  accountName: string | null;
  accountType: string | null;
  debit: string | number;
  credit: string | number;
  description: string | null;
  costCenter: string | null;
  umrahSeasonId: number | null;
  umrahAgentId: number | null;
  departmentId: number | null;
  projectId: number | null;
  employeeId: number | null;
}

interface JournalHeader {
  id: number;
  ref: string | null;
  description: string | null;
  date: string;
  type: string;
  status: string;
  approvalStatus: string;
  postedAt: string | null;
  reversalOfId: number | null;
  reversedById: number | null;
  reversedAt: string | null;
  reversalReason: string | null;
}

interface DrillResp {
  source: { id: number; sourceType: string; ref: string | null; status: string | null };
  journal: JournalHeader | null;
  lines: JournalLine[];
  totals?: { debit: number; credit: number };
  isBalanced?: boolean;
  message?: string;
  orphanJournalEntryId?: number;
}

interface Props {
  sourceType:
    | "umrah_sales_invoices"
    | "umrah_nusk_invoices"
    | "umrah_payments"
    | "umrah_agent_invoices"
    | "umrah_penalties";
  sourceId: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft:           "مسودة",
  posted:          "مرحَّل",
  pending_approval:"بانتظار الاعتماد",
  approved:        "معتمد",
  rejected:        "مرفوض",
  returned:        "مرجَع",
  cancelled:       "ملغى",
};

const STATUS_TONES: Record<string, string> = {
  draft:           "bg-status-neutral-surface text-status-neutral-foreground",
  posted:          "bg-status-success-surface text-status-success-foreground",
  pending_approval:"bg-status-warning-surface text-status-warning-foreground",
  approved:        "bg-status-info-surface text-status-info-foreground",
  rejected:        "bg-status-error-surface text-status-error-foreground",
  returned:        "bg-status-error-surface text-status-error-foreground",
  cancelled:       "bg-status-neutral-surface text-status-neutral-foreground",
};

export function UmrahJournalDrillCard({ sourceType, sourceId }: Props) {
  const { data, isLoading } = useApiQuery<DrillResp>(
    ["umrah-journal-drill", sourceType, String(sourceId)],
    `/umrah/journal/${sourceType}/${sourceId}`,
    !!sourceId,
  );

  if (isLoading) return null;
  if (!data) return null;

  const { journal, lines, totals, isBalanced, message, orphanJournalEntryId } = data;

  if (!journal) {
    return (
      <Card data-testid="umrah-journal-drill-card-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            القيد المحاسبي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-status-warning-foreground" />
            <div>
              <p>{message || "لم يتم ترحيل قيد محاسبي بعد لهذا المصدر."}</p>
              {orphanJournalEntryId && (
                <p className="mt-1 font-mono text-status-warning-foreground" data-testid="umrah-journal-drill-orphan">
                  #{orphanJournalEntryId}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isReversed = journal.reversedById != null && journal.reversedAt != null;

  return (
    <Card data-testid="umrah-journal-drill-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            القيد المحاسبي
          </span>
          <Link
            href={`/finance/journal-entries/${journal.id}`}
            className="text-blue-600 hover:underline text-xs flex items-center gap-1"
            data-testid="umrah-journal-drill-link"
          >
            فتح القيد <ArrowRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">المرجع</p>
            <p className="font-mono font-semibold">{journal.ref || `JE-${journal.id}`}</p>
          </div>
          <div>
            <p className="text-muted-foreground">التاريخ</p>
            <p>{formatDateAr(journal.date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">الحالة</p>
            <Badge className={`text-[10px] ${STATUS_TONES[journal.status] || ""}`}>
              {STATUS_LABELS[journal.status] || journal.status}
            </Badge>
          </div>
          <div>
            <p className="text-muted-foreground">التوازن</p>
            {isBalanced ? (
              <span className="inline-flex items-center gap-1 text-status-success-foreground text-xs font-semibold" data-testid="umrah-journal-drill-balanced">
                <CheckCircle2 className="h-3 w-3" />
                متوازن
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-status-error-foreground text-xs font-semibold" data-testid="umrah-journal-drill-imbalanced">
                <AlertTriangle className="h-3 w-3" />
                غير متوازن
              </span>
            )}
          </div>
        </div>

        {isReversed && (
          <div className="bg-status-warning-surface text-status-warning-foreground text-xs p-2 rounded flex items-start gap-2" data-testid="umrah-journal-drill-reversed">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">القيد منعكس بقيد #{journal.reversedById}</p>
              {journal.reversedAt && <p className="text-[10px]">في {formatDateAr(journal.reversedAt)}</p>}
              {journal.reversalReason && <p className="text-[10px] mt-1">السبب: {journal.reversalReason}</p>}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="umrah-journal-drill-table">
            <thead>
              <tr className="text-right text-muted-foreground border-b bg-surface-subtle">
                <th className="p-2 font-medium">الحساب</th>
                <th className="p-2 font-medium">الاسم</th>
                <th className="p-2 font-medium">مدين</th>
                <th className="p-2 font-medium">دائن</th>
                <th className="p-2 font-medium">البيان</th>
                <th className="p-2 font-medium">الأبعاد</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr
                  key={l.id}
                  className="border-b last:border-b-0 hover:bg-muted/30"
                  data-testid={`umrah-journal-drill-line-${l.id}`}
                >
                  <td className="p-2 font-mono text-[11px]">{l.accountCode}</td>
                  <td className="p-2">{l.accountName || "—"}</td>
                  <td className="p-2 text-status-info-foreground font-semibold" data-testid={`umrah-journal-drill-debit-${l.id}`}>
                    {Number(l.debit) > 0 ? formatCurrency(Number(l.debit)) : "—"}
                  </td>
                  <td className="p-2 text-status-success-foreground font-semibold" data-testid={`umrah-journal-drill-credit-${l.id}`}>
                    {Number(l.credit) > 0 ? formatCurrency(Number(l.credit)) : "—"}
                  </td>
                  <td className="p-2 text-[11px] text-muted-foreground">{l.description || "—"}</td>
                  <td className="p-2 text-[10px]">
                    {l.umrahAgentId && <Badge variant="outline" className="text-[9px] mr-1">وكيل #{l.umrahAgentId}</Badge>}
                    {l.umrahSeasonId && <Badge variant="outline" className="text-[9px] mr-1">موسم #{l.umrahSeasonId}</Badge>}
                    {l.costCenter && <Badge variant="outline" className="text-[9px] mr-1">{l.costCenter}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="border-t-2 bg-surface-subtle font-bold">
                  <td className="p-2" colSpan={2}>الإجمالي</td>
                  <td className="p-2 text-status-info-foreground" data-testid="umrah-journal-drill-total-debit">{formatCurrency(totals.debit)}</td>
                  <td className="p-2 text-status-success-foreground" data-testid="umrah-journal-drill-total-credit">{formatCurrency(totals.credit)}</td>
                  <td className="p-2" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
