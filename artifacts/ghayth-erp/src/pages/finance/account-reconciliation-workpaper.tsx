import { useMemo, useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useApiQuery } from "@/lib/api";
import { PageShell, DataTable } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
import {
  Scale, Plus, Trash2, Download, CheckCircle2, AlertTriangle,
  Building2, FileText, ArrowDown, Equal,
} from "lucide-react";
import {
  formatCurrency, formatDateAr, todayLocal, currentYearRiyadh,
  currentMonthPaddedRiyadh,
} from "@/lib/formatters";

/**
 * GL Account Reconciliation Workpaper
 *
 * Classic month-end reconciliation: reconcile any GL account balance to its
 * external/sub-ledger source (bank statement, customer aging, vendor aging,
 * VAT filing, etc.) by listing adjusting items.
 *
 *   GL balance        XXX,XXX
 *   + Items in source not in GL
 *   - Items in GL not in source
 *   ───────────────────────────
 *   = Reconciled balance
 *   = External source balance ✓
 *
 * Operator inputs the external balance and lists reconciling items; the
 * tool computes the variance live. CSV export for archival.
 *
 * Endpoints: GET /finance/accounts, GET /finance/ledger/:code
 */

interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface LedgerResp {
  account: { code: string; name: string; type: string };
  summary: { totalDebit: number; totalCredit: number; balance: number; count: number };
  entries: Array<{ id: number; ref: string; description: string; date: string; debit: number; credit: number; runningBalance: number }>;
}

interface ReconItem {
  id: string;
  category: "src_not_gl_add" | "src_not_gl_sub" | "gl_not_src_add" | "gl_not_src_sub";
  description: string;
  reference: string;
  amount: number;
}

const CATEGORY_LABELS: Record<ReconItem["category"], { label: string; sign: "+" | "-"; hint: string; color: string }> = {
  src_not_gl_add: {
    label: "في المصدر، لم يُسجَّل بـ GL — يُضاف",
    sign: "+",
    hint: "مثال: ودائع في الطريق، مطلوبات منسية",
    color: "text-status-success-foreground",
  },
  src_not_gl_sub: {
    label: "في المصدر، لم يُسجَّل بـ GL — يُطرح",
    sign: "-",
    hint: "مثال: مصاريف بنكية لم تُسجَّل، فوائد مدينة",
    color: "text-status-danger-foreground",
  },
  gl_not_src_add: {
    label: "في GL، لم يظهر بالمصدر — يُضاف",
    sign: "+",
    hint: "مثال: شيك مودَع لم يحرّر بعد",
    color: "text-status-success-foreground",
  },
  gl_not_src_sub: {
    label: "في GL، لم يظهر بالمصدر — يُطرح",
    sign: "-",
    hint: "مثال: شيكات صادرة لم تُصرف بعد",
    color: "text-status-danger-foreground",
  },
};

let _itemId = 0;
const nextItemId = () => `item-${++_itemId}-${Date.now()}`;

export default function AccountReconciliationWorkpaperPage() {
  const initialCode = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("accountCode") ?? "1110"
    : "1110";
  const [accountCode, setAccountCode] = useState<string>(initialCode);
  const [year, setYear] = useState<number>(currentYearRiyadh());
  const [month, setMonth] = useState<string>(currentMonthPaddedRiyadh());
  const [externalBalance, setExternalBalance] = useState<string>("0");
  const [preparedBy, setPreparedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [items, setItems] = useState<ReconItem[]>([]);

  const asOf = useMemo(() => {
    const lastDay = new Date(Date.UTC(year, Number(month), 0)).getUTCDate();
    return `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  }, [year, month]);

  const periodStart = `${year}-${month}-01`;
  const period = `${year}-${month}`;

  const { data: accounts } = useApiQuery<{ data: Account[] }>(
    ["coa-recon"],
    `/finance/accounts`,
  );

  const { data: ledger, isLoading } = useApiQuery<LedgerResp>(
    ["ledger-recon", accountCode, asOf],
    accountCode ? `/finance/ledger/${accountCode}?endDate=${asOf}` : null,
  );

  const accountOptions = (accounts?.data ?? []).slice().sort((a, b) => a.code.localeCompare(b.code));

  const glBalance = ledger?.summary?.balance ?? 0;
  const extBalance = Number(externalBalance) || 0;

  const adjustedGlBalance = useMemo(() => {
    let b = glBalance;
    for (const it of items) {
      if (it.category.endsWith("_add")) b += it.amount;
      else b -= it.amount;
    }
    return b;
  }, [glBalance, items]);

  const variance = extBalance - adjustedGlBalance;
  const reconciled = Math.abs(variance) < 0.01;

  const addItem = (category: ReconItem["category"]) => {
    setItems(prev => [...prev, {
      id: nextItemId(),
      category,
      description: "",
      reference: "",
      amount: 0,
    }]);
  };

  const updateItem = (id: string, patch: Partial<ReconItem>) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const groupedItems = useMemo(() => {
    const out: Record<ReconItem["category"], ReconItem[]> = {
      src_not_gl_add: [], src_not_gl_sub: [], gl_not_src_add: [], gl_not_src_sub: [],
    };
    for (const it of items) out[it.category].push(it);
    return out;
  }, [items]);

  const subtotal = (cat: ReconItem["category"]) =>
    groupedItems[cat].reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const exportCSV = () => {
    const lines: string[] = [];
    lines.push("ورقة عمل تسوية حساب,");
    lines.push(`الحساب,${accountCode} — ${ledger?.account?.name ?? ""}`);
    lines.push(`الفترة,${period}`);
    lines.push(`كما في,${asOf}`);
    lines.push(`أعدّها,${preparedBy}`);
    lines.push(`راجعها,${reviewedBy}`);
    lines.push("");
    lines.push("البند,الإشارة,المرجع,الوصف,المبلغ");
    lines.push(`رصيد GL,,,,${glBalance.toFixed(2)}`);
    for (const cat of Object.keys(groupedItems) as ReconItem["category"][]) {
      lines.push(`,,,${CATEGORY_LABELS[cat].label},`);
      for (const it of groupedItems[cat]) {
        lines.push([
          "",
          CATEGORY_LABELS[cat].sign,
          (it.reference ?? "").replace(/,/g, "،"),
          (it.description ?? "").replace(/,/g, "،"),
          it.amount.toFixed(2),
        ].join(","));
      }
      const sub = subtotal(cat);
      if (sub !== 0) lines.push(`,,,مجموع جزئي,${sub.toFixed(2)}`);
    }
    lines.push("");
    lines.push(`رصيد GL المعدّل,,,,${adjustedGlBalance.toFixed(2)}`);
    lines.push(`رصيد المصدر الخارجي,,,,${extBalance.toFixed(2)}`);
    lines.push(`الفرق,,,,${variance.toFixed(2)}`);
    lines.push(`الحالة,,,,${reconciled ? "مسوَّاة" : "غير مسوَّاة"}`);

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
        entityType: "report_account_reconciliation_workpaper",
        title: String(`recon-${accountCode}-${period}.csv`).replace(/\.csv$/i, ""),
        rows: _rows,
        columns: _headers.map((h) => ({ key: h, label: h })),
      }).catch((err) => console.error("[export] failed", err));
    }
};

  return (
    <PageShell
      title="ورقة عمل تسوية حساب"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "ورقة عمل تسوية حساب" },
      ]}
      subtitle="تسوية أي حساب GL إلى مصدر خارجي (كشف بنك، مساعد، إقرار ضريبي)"
    >
      <FinanceTabsNav />

      {/* Header inputs */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            معلومات التسوية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الحساب</label>
              <select
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background w-full"
              >
                {accountOptions.map(a => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border rounded px-3 py-1.5 text-sm bg-background w-full"
              >
                {[currentYearRiyadh(), currentYearRiyadh() - 1, currentYearRiyadh() - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background w-full"
              >
                {["01","02","03","04","05","06","07","08","09","10","11","12"].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">أعدّها</label>
              <Input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} placeholder="اسم المُعد" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">راجعها</label>
              <Input value={reviewedBy} onChange={e => setReviewedBy(e.target.value)} placeholder="اسم المراجع" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top: balances side-by-side */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  رصيد دفتر الأستاذ (GL)
                </div>
                <div className="text-2xl font-bold tabular-nums">{formatCurrency(glBalance)}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {ledger?.summary?.count ?? 0} حركة كما في {formatDateAr(asOf)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Scale className="w-3 h-3" />
                  رصيد المصدر الخارجي
                </div>
                <Input
                  type="number"
                  step="0.01"
                  value={externalBalance}
                  onChange={(e) => setExternalBalance(e.target.value)}
                  className="text-xl font-bold tabular-nums h-10 text-end"
                  placeholder="0.00"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  من كشف البنك/المساعد
                </div>
              </CardContent>
            </Card>
            <Card className={reconciled ? "border-status-success-foreground border-2" : "border-status-danger-foreground border-2"}>
              <CardContent className="pt-6">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {reconciled ? (
                    <CheckCircle2 className="w-3 h-3 text-status-success-foreground" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-status-danger-foreground" />
                  )}
                  الفرق
                </div>
                <div className={`text-2xl font-bold tabular-nums ${reconciled ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                  {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                </div>
                <div className="text-[11px] mt-1">
                  {reconciled ? (
                    <span className="text-status-success-foreground font-semibold">✓ مسوَّاة</span>
                  ) : (
                    <span className="text-status-danger-foreground">يجب أن يكون = 0</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* The workpaper itself */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">ورقة العمل</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="text-sm font-semibold">رصيد GL كما هو</div>
                <div className="text-lg font-bold tabular-nums">{formatCurrency(glBalance)}</div>
              </div>

              {(Object.keys(CATEGORY_LABELS) as ReconItem["category"][]).map(cat => {
                const def = CATEGORY_LABELS[cat];
                const list = groupedItems[cat];
                return (
                  <div key={cat} className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <Badge variant="outline" className={`font-mono ${def.color}`}>
                            {def.sign}
                          </Badge>
                          {def.label}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{def.hint}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => addItem(cat)}>
                        <Plus className="w-3 h-3 ml-1" />
                        إضافة
                      </Button>
                    </div>

                    {list.length > 0 && (
                      <DataTable<ReconItem>
                        noToolbar
                        pageSize={0}
                        data={list}
                        rowKey={(it) => it.id}
                        columns={[
                          {
                            key: "reference", header: "المرجع", sortable: false, width: "8rem",
                            render: (it) => (
                              <Input
                                value={it.reference}
                                onChange={(e) => updateItem(it.id, { reference: e.target.value })}
                                placeholder="رقم"
                                className="h-7 text-xs"
                              />
                            ),
                          },
                          {
                            key: "description", header: "الوصف", sortable: false,
                            render: (it) => (
                              <Input
                                value={it.description}
                                onChange={(e) => updateItem(it.id, { description: e.target.value })}
                                placeholder="وصف البند"
                                className="h-7 text-xs"
                              />
                            ),
                            footer: () => <span className="text-xs text-muted-foreground">مجموع جزئي:</span>,
                          },
                          {
                            key: "amount", header: "المبلغ", sortable: false, align: "end", width: "8rem",
                            render: (it) => (
                              <Input
                                type="number"
                                step="0.01"
                                value={it.amount}
                                onChange={(e) => updateItem(it.id, { amount: Number(e.target.value) || 0 })}
                                className="h-7 text-xs text-end tabular-nums"
                              />
                            ),
                            footer: () => <span className={`tabular-nums ${def.color}`}>{def.sign}{formatCurrency(subtotal(cat))}</span>,
                          },
                          {
                            key: "_actions", header: "", sortable: false, width: "2rem",
                            render: (it) => (
                              <Button
                                variant="ghost"
                                size="icon" title="حذف"
                                className="h-7 w-7 text-status-danger-foreground"
                                onClick={() => removeItem(it.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            ),
                          },
                        ]}
                      />
                    )}
                  </div>
                );
              })}

              <div className="border-t-2 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Equal className="w-4 h-4" />
                    رصيد GL المعدّل
                  </div>
                  <div className="text-xl font-bold tabular-nums">{formatCurrency(adjustedGlBalance)}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <ArrowDown className="w-4 h-4" />
                    رصيد المصدر الخارجي
                  </div>
                  <div className="text-xl font-bold tabular-nums">{formatCurrency(extBalance)}</div>
                </div>
                <div className={`flex items-center justify-between p-3 rounded ${reconciled ? "bg-status-success-surface" : "bg-status-danger-surface"}`}>
                  <div className={`text-sm font-bold flex items-center gap-2 ${reconciled ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                    {reconciled ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    الفرق المتبقي
                  </div>
                  <div className={`text-xl font-bold tabular-nums ${reconciled ? "text-status-success-foreground" : "text-status-danger-foreground"}`}>
                    {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="pt-6 flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                المرجع: <code className="font-mono">RECON-{accountCode}-{period}</code>
              </div>
              <Button variant="outline" onClick={exportCSV}>
                <Download className="w-4 h-4 ml-2" />
                تصدير ورقة العمل (CSV)
              </Button>
              <PrintButton
                entityType="report_account_reconciliation"
                entityId={`${accountCode}:${period}`}
                variant="default"
                label="طباعة ورقة العمل"
                payload={{
                  entity: {
                    title: "ورقة عمل تسوية الحساب",
                    accountCode,
                    accountName: ledger?.account?.name ?? "",
                    period,
                    asOfDate: asOf,
                    ref: `RECON-${accountCode}-${period}`,
                    systemBalance: Number(ledger?.summary?.balance ?? 0),
                  },
                  items: items.map((it) => ({
                    "النوع": CATEGORY_LABELS[it.category]?.label ?? it.category,
                    "البيان": it.description,
                    "المرجع": it.reference ?? "",
                    "المبلغ": Number(it.amount ?? 0),
                  })),
                }}
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
