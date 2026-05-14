import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import {
  Building2, Receipt, AlertTriangle, TrendingUp, Briefcase, MessageSquare,
  Info, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientContextSection = "invoice" | "opportunity" | "ticket" | "project" | "contract";

export interface ClientContextCardProps {
  clientId: string | number | null | undefined;
  section?: ClientContextSection;
  className?: string;
}

interface ClientDetail {
  id: number;
  name: string;
  ref?: string;
  type?: string;
  status?: string;
  phone?: string;
  email?: string;
  creditLimit?: number | string;
  financials?: {
    totalInvoiced: number | string;
    totalPaid: number | string;
    totalOutstanding: number | string;
    invoiceCount: number;
    paidCount: number;
    overdueCount: number;
  };
  invoices?: Array<{
    id: number;
    ref: string;
    status: string;
    total: number | string;
    paidAmount: number | string;
    dueDate?: string;
  }>;
  opportunities?: Array<{
    id: number;
    title: string;
    stage: string;
    value: number | string;
  }>;
  tickets?: Array<{
    id: number;
    ref: string;
    status: string;
    priority: string;
  }>;
  projects?: Array<{
    id: number;
    name: string;
    status: string;
  }>;
}

/**
 * Shows rich client context when a client is selected in a form.
 * Pulls /clients/:id which already returns financials + invoices +
 * opportunities + tickets + projects — no new backend needed.
 */
export function ClientContextCard({
  clientId,
  section,
  className,
}: ClientContextCardProps) {
  const hasId = clientId !== null && clientId !== undefined && String(clientId).trim() !== "";
  const { data, isLoading } = useApiQuery<ClientDetail>(
    ["client-context", String(clientId ?? "")],
    hasId ? `/clients/${clientId}` : null,
    { enabled: hasId },
  );

  if (!hasId) return null;

  if (isLoading) {
    return (
      <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const fin = data.financials || {
    totalInvoiced: 0, totalPaid: 0, totalOutstanding: 0,
    invoiceCount: 0, paidCount: 0, overdueCount: 0,
  };
  const outstanding = Number(fin.totalOutstanding || 0);
  const overdueCount = Number(fin.overdueCount || 0);
  const creditLimit = Number(data.creditLimit || 0);
  const creditWarning = creditLimit > 0 && outstanding > creditLimit * 0.8;
  const creditExceeded = creditLimit > 0 && outstanding >= creditLimit;

  const openOpportunities = (data.opportunities || []).filter(
    (o) => o.stage !== "won" && o.stage !== "lost" && o.stage !== "closed",
  );
  const openTickets = (data.tickets || []).filter((t) => t.status === "open" || t.status === "in_progress");

  return (
    <Card className={cn("border-indigo-200 bg-indigo-50/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header: name + status */}
        <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span className="font-semibold text-sm">{data.name}</span>
            {data.ref && (
              <Badge variant="outline" className="text-xs font-mono">
                {data.ref}
              </Badge>
            )}
          </div>
          {data.status && (
            <Badge variant="outline" className="text-xs">
              {data.status === "active" ? "نشط" : data.status}
            </Badge>
          )}
        </div>

        {/* Financials grid — always shown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <FinTile
            icon={Receipt}
            label="الفواتير"
            value={`${fin.invoiceCount} فاتورة`}
            tone="neutral"
          />
          <FinTile
            icon={TrendingUp}
            label="مدفوع"
            value={formatCurrency(Number(fin.totalPaid))}
            tone="green"
          />
          <FinTile
            icon={CreditCard}
            label="المتبقي"
            value={formatCurrency(outstanding)}
            tone={outstanding > 0 ? "red" : "neutral"}
          />
          <FinTile
            icon={AlertTriangle}
            label="متأخرة"
            value={overdueCount > 0 ? `${overdueCount} فاتورة` : "—"}
            tone={overdueCount > 0 ? "red" : "neutral"}
          />
        </div>

        {/* Credit limit warning */}
        {creditLimit > 0 && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs p-1.5 rounded border",
            creditExceeded && "bg-status-error-surface text-status-error-foreground border-status-error-surface",
            creditWarning && !creditExceeded && "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface",
            !creditWarning && "bg-surface-subtle text-muted-foreground border-border",
          )}>
            <Info className="h-3 w-3 shrink-0" />
            <span>
              حد الائتمان: {formatCurrency(creditLimit)} — المستخدم: {formatCurrency(outstanding)}
              {creditExceeded && " (تجاوز الحد)"}
              {creditWarning && !creditExceeded && " (تجاوز 80%)"}
            </span>
          </div>
        )}

        {/* Section-specific context */}
        {section === "invoice" && (
          <InvoiceSection invoices={data.invoices || []} overdueCount={overdueCount} />
        )}
        {section === "opportunity" && (
          <OpportunitySection openOpportunities={openOpportunities} allCount={(data.opportunities || []).length} />
        )}
        {section === "ticket" && (
          <TicketSection openTickets={openTickets} allCount={(data.tickets || []).length} />
        )}
        {section === "project" && (
          <ProjectSection projects={data.projects || []} />
        )}
      </CardContent>
    </Card>
  );
}

function FinTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "neutral" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "red" ? "text-status-error-foreground border-status-error-surface" :
    tone === "green" ? "text-status-success-foreground border-status-success-surface" :
    tone === "amber" ? "text-status-warning-foreground border-status-warning-surface" :
    "text-gray-800 border-border";
  return (
    <div className={cn("bg-white rounded p-2 border", toneClass.split(" ")[1])}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className={cn("text-sm font-semibold", toneClass.split(" ")[0])}>
        {value}
      </div>
    </div>
  );
}

function InvoiceSection({
  invoices,
  overdueCount,
}: {
  invoices: NonNullable<ClientDetail["invoices"]>;
  overdueCount: number;
}) {
  const recentOpen = invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").slice(0, 3);
  if (recentOpen.length === 0 && overdueCount === 0) return null;

  return (
    <div className="pt-2 border-t border-indigo-100 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <Receipt className="h-3.5 w-3.5" />
        <span>فواتير مفتوحة حديثة</span>
      </div>
      {recentOpen.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between bg-white rounded p-1.5 text-xs border border-border">
          <span className="font-mono text-gray-700">{inv.ref}</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{formatCurrency(Number(inv.total))}</span>
            {inv.dueDate && (
              <Badge variant="outline" className="text-[10px]">
                {new Date(inv.dueDate).toLocaleDateString("ar-SA")}
              </Badge>
            )}
          </div>
        </div>
      ))}
      {overdueCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
          <AlertTriangle className="h-3 w-3" />
          <span>
            يوجد {overdueCount} فاتورة متأخرة — قد يكون التحصيل أولى من فاتورة جديدة
          </span>
        </div>
      )}
    </div>
  );
}

function OpportunitySection({
  openOpportunities,
  allCount,
}: {
  openOpportunities: NonNullable<ClientDetail["opportunities"]>;
  allCount: number;
}) {
  const totalOpenValue = openOpportunities.reduce((sum, o) => sum + Number(o.value || 0), 0);
  return (
    <div className="pt-2 border-t border-indigo-100 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>الفرص التجارية</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">مفتوحة</p>
          <p className="text-sm font-semibold">{openOpportunities.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-status-success-surface">
          <p className="text-xs text-muted-foreground">قيمة المفتوحة</p>
          <p className="text-sm font-semibold text-status-success-foreground">{formatCurrency(totalOpenValue)}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className="text-sm font-semibold">{allCount}</p>
        </div>
      </div>
    </div>
  );
}

function TicketSection({
  openTickets,
  allCount,
}: {
  openTickets: NonNullable<ClientDetail["tickets"]>;
  allCount: number;
}) {
  return (
    <div className="pt-2 border-t border-indigo-100 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <MessageSquare className="h-3.5 w-3.5" />
        <span>التذاكر</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded p-2 border border-status-warning-surface">
          <p className="text-xs text-muted-foreground">مفتوحة</p>
          <p className="text-sm font-semibold text-status-warning-foreground">{openTickets.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className="text-sm font-semibold">{allCount}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">حرجة</p>
          <p className="text-sm font-semibold">
            {openTickets.filter((t) => t.priority === "urgent" || t.priority === "critical").length}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProjectSection({
  projects,
}: {
  projects: NonNullable<ClientDetail["projects"]>;
}) {
  const active = projects.filter((p) => p.status === "active" || p.status === "in_progress");
  if (projects.length === 0) return null;
  return (
    <div className="pt-2 border-t border-indigo-100 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
        <Briefcase className="h-3.5 w-3.5" />
        <span>المشاريع</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded p-2 border border-status-success-surface">
          <p className="text-xs text-muted-foreground">نشطة</p>
          <p className="text-sm font-semibold text-status-success-foreground">{active.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">الإجمالي</p>
          <p className="text-sm font-semibold">{projects.length}</p>
        </div>
      </div>
    </div>
  );
}
