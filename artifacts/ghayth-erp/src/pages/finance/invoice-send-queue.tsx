import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Send, Search, ExternalLink, Download, AlertTriangle,
  CheckCircle2, FileText, Clock, Filter, Mail,
} from "lucide-react";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";

/**
 * Invoice Send Queue
 *
 * Daily AR clerk workflow: shows invoices that are approved/issued but not
 * yet sent to the customer. Each row deep-links to the invoice for the
 * "إرسال" action. Helps clear the backlog and ensures customers receive
 * their invoices on time.
 *
 * Endpoint: GET /finance/invoices
 */

interface Invoice {
  id: number;
  ref: string;
  clientId: number | null;
  clientName?: string | null;
  status: string;
  total: number | string;
  paidAmount?: number | string;
  vatAmount?: number | string;
  createdAt: string;
  dueDate?: string | null;
  sentAt?: string | null;
}

interface ListResp { data: Invoice[]; total: number; }

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "text-muted-foreground" },
  pending: { label: "معلق", color: "text-status-warning-foreground" },
  approved: { label: "معتمدة", color: "text-status-info-foreground" },
  sent: { label: "مُرسلة", color: "text-status-success-foreground" },
  partial: { label: "مُدفوعة جزئياً", color: "text-status-success-foreground" },
  paid: { label: "مدفوعة", color: "text-status-success-foreground" },
  overdue: { label: "متأخر", color: "text-status-danger-foreground" },
  cancelled: { label: "ملغاة", color: "text-muted-foreground" },
};

function daysSince(iso: string, today: string): number {
  const a = new Date(iso.split("T")[0] + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export default function InvoiceSendQueuePage() {
  const today = todayLocal();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"unsent" | "all" | "draft">("unsent");

  const { data, isLoading } = useApiQuery<ListResp>(
    ["invoice-send-queue"],
    `/finance/invoices`,
  );

  const filtered = useMemo(() => {
    if (!data?.data) return [];
    let list = data.data;
    if (filter === "unsent") {
      list = list.filter(i =>
        (i.status === "approved" || i.status === "pending") && !i.sentAt
      );
    } else if (filter === "draft") {
      list = list.filter(i => i.status === "draft");
    } else {
      list = list.filter(i => i.status !== "cancelled");
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i =>
        i.ref.toLowerCase().includes(s) ||
        (i.clientName ?? "").toLowerCase().includes(s)
      );
    }
    return list.slice().sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data, search, filter]);

  const stats = useMemo(() => {
    if (!data?.data) return { unsent: 0, draft: 0, totalValue: 0, oldUnsent: 0 };
    const unsent = data.data.filter(i => (i.status === "approved" || i.status === "pending") && !i.sentAt);
    const draft = data.data.filter(i => i.status === "draft");
    const totalValue = unsent.reduce((s, i) => s + Number(i.total), 0);
    const oldUnsent = unsent.filter(i => daysSince(i.createdAt, today) > 7).length;
    return { unsent: unsent.length, draft: draft.length, totalValue, oldUnsent };
  }, [data, today]);

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`صف الفواتير المعلقة — ${today}`);
    lines.push("");
    lines.push("الرقم,العميل,الإجمالي,الحالة,تاريخ الإنشاء,أيام عمر,تاريخ الاستحقاق");
    for (const i of filtered) {
      const age = daysSince(i.createdAt, today);
      lines.push([
        i.ref,
        (i.clientName ?? "").replace(/,/g, "،"),
        Number(i.total).toFixed(2),
        STATUS_LABELS[i.status]?.label ?? i.status,
        i.createdAt.split("T")[0],
        age.toString(),
        i.dueDate ? i.dueDate.split("T")[0] : "",
      ].join(","));
    }
    // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
    // Routed through unified export helper for audit + letterhead.
    {
      const _allLines = lines;
      const _headers = (_allLines[0] ?? "").split(",");
      const _rows = _allLines.slice(1).map((line) => {
        const parts = line.split(",");
        const obj: Record<string, string> = {};
        _headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
        return obj;
      });
      void exportRowsToCsv({
        entityType: "report_invoice_send_queue",
        title: String(`invoice-send-queue-${today}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="صف إرسال الفواتير"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "صف إرسال الفواتير" },
      ]}
      subtitle="فواتير معتمدة لم تُرسل بعد — اعرض، أرسل، وانتقل لجلب الدفعة"
    >
      <FinanceTabsNav />

      {/* Controls */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-muted-foreground mb-1 block">بحث</label>
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="رقم فاتورة أو اسم عميل..."
                className="pr-9"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الفلتر</label>
            <div className="flex gap-1">
              <Button variant={filter === "unsent" ? "default" : "outline"} size="sm" onClick={() => setFilter("unsent")}>
                <Send className="w-3 h-3 ml-1" />
                لم تُرسل
              </Button>
              <Button variant={filter === "draft" ? "default" : "outline"} size="sm" onClick={() => setFilter("draft")}>
                <FileText className="w-3 h-3 ml-1" />
                مسودة
              </Button>
              <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                <Filter className="w-3 h-3 ml-1" />
                الكل
              </Button>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data}>
            <Download className="w-4 h-4 ml-1" />
            CSV
          </Button>
          <PrintButton
            entityType="report_invoice_send_queue"
            entityId="all"
            payload={{ entity: { title: "صف إرسال الفواتير" }, items: [] }}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card className={stats.unsent > 0 ? "border-status-warning-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-status-warning-foreground" />
                  معلقة للإرسال
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.unsent > 0 ? "text-status-warning-foreground" : ""}`}>
                  {stats.unsent}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">معتمدة بلا إرسال</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1">قيمة المعلقة</div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalValue)}</div>
              </CardContent>
            </Card>
            <Card className={stats.oldUnsent > 0 ? "border-status-danger-foreground border-2" : ""}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  أقدم من 7 أيام
                </div>
                <div className={`text-2xl font-bold tabular-nums ${stats.oldUnsent > 0 ? "text-status-danger-foreground" : ""}`}>
                  {stats.oldUnsent}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">يستوجب المتابعة</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  مسودات
                </div>
                <div className="text-2xl font-bold tabular-nums">{stats.draft}</div>
                <div className="text-[11px] text-muted-foreground mt-1">تحتاج اعتماد</div>
              </CardContent>
            </Card>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-status-success-foreground" />
                لا فواتير في الصف الحالي — كل شيء تم إرساله ✓
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">القائمة ({filtered.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  noToolbar
                  data={filtered}
                  columns={[
                    {
                      key: "ref", header: "الفاتورة", ltr: true,
                      render: (i) => <span className="font-mono text-xs">{i.ref}</span>,
                      footer: (rows) => `الإجمالي (${rows.length} فاتورة)`,
                    },
                    {
                      key: "clientName", header: "العميل",
                      render: (i) => (
                        i.clientId ? (
                          <Link href={`/finance/customer-360-sheet?clientId=${i.clientId}`}>
                            <span className="hover:underline cursor-pointer">{i.clientName ?? `عميل #${i.clientId}`}</span>
                          </Link>
                        ) : (
                          <span>{i.clientName ?? "—"}</span>
                        )
                      ),
                    },
                    {
                      key: "total", header: "المبلغ", align: "end",
                      render: (i) => (
                        <span className="tabular-nums font-semibold">{formatCurrency(Number(i.total))}</span>
                      ),
                      footer: (rows) => (
                        <span className="tabular-nums">
                          {formatCurrency(rows.reduce((s, i) => s + Number(i.total), 0))}
                        </span>
                      ),
                    },
                    {
                      key: "status", header: "الحالة",
                      render: (i) => {
                        const status = STATUS_LABELS[i.status] ?? { label: i.status, color: "" };
                        return (
                          <Badge variant="outline" className={`text-[10px] ${status.color}`}>
                            {status.label}
                          </Badge>
                        );
                      },
                      exportValue: (i) => STATUS_LABELS[i.status]?.label ?? i.status,
                    },
                    {
                      key: "createdAt", header: "عمر", align: "end",
                      render: (i) => {
                        const age = daysSince(i.createdAt, today);
                        const ageColor = age > 14 ? "text-status-danger-foreground" : age > 7 ? "text-status-warning-foreground" : "";
                        return <span className={`tabular-nums ${ageColor}`}>{age} يوم</span>;
                      },
                      exportValue: (i) => daysSince(i.createdAt, today),
                    },
                    {
                      key: "_action", header: "إجراء", width: "8rem", sortable: false,
                      render: (i) => (
                        <Button asChild variant="outline" size="sm" className="w-full"><Link href={`/finance/invoices/${i.id}`}>
                            <ExternalLink className="w-3 h-3 ml-1" />
                            فتح
                          </Link></Button>
                      ),
                    },
                  ] satisfies DataTableColumn<Invoice>[]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
