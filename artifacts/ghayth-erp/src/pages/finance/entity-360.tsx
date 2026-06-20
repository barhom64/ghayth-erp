import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  VehicleSelect, ProjectSelect, EmployeeSelect, DriverSelect, ClientSelect,
} from "@/components/shared/entity-selects";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import {
  Search, Activity, TrendingUp, TrendingDown, ExternalLink,
  Wallet, Layers, FileText, AlertCircle, Calendar,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";

/**
 * Universal Entity 360° Financial View
 *
 * Pick any entity (vehicle / property / project / employee / driver /
 * client / vendor / umrah_agent / umrah_season) and see its complete
 * financial footprint in one screen:
 *
 *  - Top KPIs: total debit, total credit, net P&L, journal count
 *  - Subsidiary accounts: each chart-of-accounts entry directly linked
 *    to this entity (e.g. vehicle's own AR sub-ledger)
 *  - Cost breakdown by account: which accounts has this entity hit
 *    most, sorted by amount
 *  - Recent transactions: last 50 JE lines tied to this entity
 *
 * Powered by GET /finance/entity-financial-profile.
 *
 * Replaces "open vendor page, scroll down, open 5 different reports
 * for each dimension" with a single deep-dive screen.
 */

type EntityType =
  | "vehicle" | "property" | "unit" | "project" | "contract"
  | "employee" | "driver" | "asset" | "client" | "supplier" | "department";

const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  vehicle:    "مركبة",
  property:   "عقار",
  unit:       "وحدة سكنية",
  project:    "مشروع",
  contract:   "عقد",
  employee:   "موظف",
  driver:     "سائق",
  asset:      "أصل ثابت",
  client:     "عميل",
  supplier:   "مورد",
  department: "إدارة",
};

interface SubsidiaryAccount {
  id: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number | string;
}

interface CostBreakdownRow {
  code: string;
  name: string;
  totalDebit: number | string;
  totalCredit: number | string;
  netAmount: number | string;
  transactionCount: number | string;
}

interface RecentTransaction {
  id: number;
  ref: string;
  description: string | null;
  createdAt: string;
  journalType: string;
  sourceType: string | null;
  sourceId: number | null;
  accountCode: string;
  accountName: string | null;
  debit: number | string;
  credit: number | string;
}

interface EntityProfileResp {
  entityType: string;
  entityId: number;
  subsidiaryAccounts: SubsidiaryAccount[];
  summary: {
    journalCount: number | string;
    totalDebit: number | string;
    totalCredit: number | string;
    firstTransaction: string | null;
    lastTransaction: string | null;
  };
  costBreakdown: CostBreakdownRow[];
  recentTransactions: RecentTransaction[];
}

const TYPE_COLOR: Record<string, string> = {
  asset:     "bg-blue-100 text-blue-800",
  liability: "bg-orange-100 text-orange-800",
  equity:    "bg-purple-100 text-purple-800",
  revenue:   "bg-emerald-100 text-emerald-800",
  expense:   "bg-red-100 text-red-800",
};

export default function Entity360Page() {
  const [entityType, setEntityType] = useState<EntityType>("vehicle");
  const [entityId, setEntityId] = useState<string>("");

  const enabled = !!entityId && !!entityType;
  const { data, isLoading, isError } = useApiQuery<EntityProfileResp>(
    ["entity-360", entityType, entityId],
    enabled ? `/finance/entity-financial-profile?entityType=${entityType}&entityId=${entityId}` : null,
    enabled,
  );

  const summary = data?.summary;
  const subsidiary = data?.subsidiaryAccounts ?? [];
  const costBreakdown = data?.costBreakdown ?? [];
  const transactions = data?.recentTransactions ?? [];

  const totalDebit = Number(summary?.totalDebit ?? 0);
  const totalCredit = Number(summary?.totalCredit ?? 0);
  const netMovement = totalDebit - totalCredit;
  const journalCount = Number(summary?.journalCount ?? 0);

  // Top 5 accounts by net amount (positive = expense-like, negative = revenue-like)
  const topAccounts = useMemo(() =>
    [...costBreakdown]
      .sort((a, b) => Math.abs(Number(b.netAmount)) - Math.abs(Number(a.netAmount)))
      .slice(0, 5),
    [costBreakdown]
  );

  const txCols: DataTableColumn<RecentTransaction>[] = [
    {
      key: "createdAt",
      header: "التاريخ",
      render: (t) => <span className="text-xs font-mono">{formatDateAr(t.createdAt)}</span>,
    },
    {
      key: "ref",
      header: "المرجع",
      render: (t) => (
        <Link href={`/finance/journal/${t.id}`}
          className="font-mono text-xs text-status-info-foreground hover:underline inline-flex items-center gap-1">
          {t.ref}
          <ExternalLink className="h-3 w-3" />
        </Link>
      ),
    },
    {
      key: "accountCode",
      header: "الحساب",
      render: (t) => (
        <div className="flex flex-col">
          <Link href={`/finance/ledger/${t.accountCode}`}
            className="font-mono text-xs text-status-info-foreground hover:underline">
            {t.accountCode}
          </Link>
          {t.accountName && <span className="text-[10px] text-muted-foreground">{t.accountName}</span>}
        </div>
      ),
    },
    {
      key: "description",
      header: "الوصف",
      render: (t) => <span className="text-xs text-muted-foreground line-clamp-1 max-w-md">{t.description ?? "—"}</span>,
    },
    {
      key: "source",
      header: "المصدر",
      render: (t) => t.sourceType
        ? <Badge variant="outline" className="text-[10px]">{t.sourceType}{t.sourceId ? ` #${t.sourceId}` : ""}</Badge>
        : <span className="text-muted-foreground italic text-xs">يدوي</span>,
    },
    {
      key: "debit",
      header: "مدين",
      render: (t) => {
        const v = Number(t.debit ?? 0);
        return v === 0 ? <span className="text-muted-foreground italic">—</span>
          : <span className="font-mono text-xs font-semibold text-emerald-700">{formatCurrency(v)}</span>;
      },
    },
    {
      key: "credit",
      header: "دائن",
      render: (t) => {
        const v = Number(t.credit ?? 0);
        return v === 0 ? <span className="text-muted-foreground italic">—</span>
          : <span className="font-mono text-xs font-semibold text-red-700">{formatCurrency(v)}</span>;
      },
    },
  ];

  return (
    <PageShell
      title="نظرة شاملة على كيان"
      subtitle="اختر مركبة / عقار / موظف / مشروع → اعرض كل التأثير المالي عبر كل الأبعاد في مكان واحد"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "Entity 360" },
      ]}
      actions={
        enabled ? (
          <PrintButton
            entityType="report_finance_entity_360"
            entityId={`${entityType}-${entityId}`}
            size="icon"
            payload={{
              entity: { title: `Entity 360 — ${ENTITY_TYPE_LABEL[entityType]} #${entityId}`, total: transactions.length },
              items: [
                { "البند": "نوع الكيان", "القيمة": ENTITY_TYPE_LABEL[entityType] },
                { "البند": "إجمالي المدين", "القيمة": Number(totalDebit) },
                { "البند": "إجمالي الدائن", "القيمة": Number(totalCredit) },
                { "البند": "صافي الحركة", "القيمة": Number(netMovement) },
                { "البند": "عدد القيود", "القيمة": journalCount },
                ...costBreakdown.map((c) => ({
                  "البند": `حساب: ${c.code} — ${c.name}`,
                  "القيمة": Number(c.netAmount || 0),
                })),
              ],
            }}
          />
        ) : undefined
      }
    >
      <FinanceTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Search className="h-4 w-4" /> ليش هذي الصفحة؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عندك سؤال محدد: "كم خسرت/كسبت من المركبة ABC-123؟"، "كم صرفت
            على الموظف أحمد منذ بداية السنة؟"، "ما هي حركة العقار رقم 5 المالية؟".
            بدل ما تفتح 5 تقارير مختلفة، اختر هنا الكيان مرة واحدة وشاهد:
            ملخص KPIs + الحسابات الفرعية + توزيع الحركة على الحسابات +
            آخر 50 معاملة.
          </p>
        </CardContent>
      </Card>

      {/* ── Entity Picker ───────────────────────────────────────── */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">اختر الكيان</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">نوع الكيان</Label>
            <Select value={entityType} onValueChange={(v) => { setEntityType(v as EntityType); setEntityId(""); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(ENTITY_TYPE_LABEL) as Array<[EntityType, string]>).map(
                  ([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            {entityType === "vehicle" && (
              <VehicleSelect value={entityId} onChange={(v) => setEntityId(String(v ?? ""))} label="المركبة" />
            )}
            {entityType === "project" && (
              <ProjectSelect value={entityId} onChange={(v) => setEntityId(String(v ?? ""))} label="المشروع" />
            )}
            {entityType === "employee" && (
              <EmployeeSelect value={entityId} onChange={(v) => setEntityId(String(v ?? ""))} label="الموظف" />
            )}
            {entityType === "driver" && (
              <DriverSelect value={entityId} onChange={(v) => setEntityId(String(v ?? ""))} label="السائق" />
            )}
            {entityType === "client" && (
              <ClientSelect value={entityId} onChange={(v) => setEntityId(String(v ?? ""))} label="العميل" />
            )}
            {!["vehicle", "project", "employee", "driver", "client"].includes(entityType) && (
              <div>
                <Label className="text-xs">معرّف {ENTITY_TYPE_LABEL[entityType]}</Label>
                <Input type="number" value={entityId} onChange={(e) => setEntityId(e.target.value)}
                  placeholder="ID" className="h-9 font-mono" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!enabled ? (
        <Card className="text-center py-12 bg-muted/30">
          <CardContent>
            <Search className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">اختر الكيان أعلاه لعرض ملفه المالي</p>
          </CardContent>
        </Card>
      ) : isLoading ? <LoadingSpinner /> : isError || !data ? (
        <Card className="text-center py-12 border-amber-300 bg-amber-50/30">
          <CardContent>
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-amber-600" />
            <p className="text-sm">لا توجد معاملات لهذا الكيان</p>
            <p className="text-xs text-muted-foreground mt-1">
              {ENTITY_TYPE_LABEL[entityType]} #{entityId} لم يظهر في أي قيد محاسبي حتى الآن
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Summary KPIs ────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Activity className="h-3 w-3" /> عدد القيود
                </p>
                <p className="text-lg font-bold font-mono mt-1">{formatNumber(journalCount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-600" /> مدين تراكمي
                </p>
                <p className="text-lg font-bold font-mono text-emerald-700 mt-1">{formatCurrency(totalDebit)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingDown className="h-3 w-3 text-red-600" /> دائن تراكمي
                </p>
                <p className="text-lg font-bold font-mono text-red-700 mt-1">{formatCurrency(totalCredit)}</p>
              </CardContent>
            </Card>
            <Card className={netMovement < 0 ? "border-red-400" : "border-emerald-400"}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">صافي الحركة</p>
                <p className={`text-lg font-bold font-mono mt-1 ${netMovement < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {netMovement > 0 ? "+" : ""}{formatCurrency(netMovement)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── First / Last Activity ───────────────────────────── */}
          {summary?.firstTransaction && (
            <Card className="mb-4 bg-muted/30">
              <CardContent className="p-3 text-xs text-muted-foreground flex items-center justify-between gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  أول معاملة: <span className="font-mono">{formatDateAr(summary.firstTransaction)}</span>
                </span>
                {summary.lastTransaction && (
                  <span className="inline-flex items-center gap-1">
                    آخر معاملة: <span className="font-mono">{formatDateAr(summary.lastTransaction)}</span>
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* ── Subsidiary Accounts ──────────────────────────── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wallet className="h-4 w-4" /> الحسابات الفرعية
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5 max-h-96 overflow-y-auto">
                {subsidiary.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    لا توجد حسابات فرعية مرتبطة بهذا الكيان
                  </p>
                ) : (
                  subsidiary.map((s) => (
                    <Link key={s.id} href={`/finance/ledger/${s.accountCode}`}>
                      <div className="flex items-center justify-between p-2 rounded hover:bg-muted/40 cursor-pointer">
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono text-xs">{s.accountCode}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{s.accountName}</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <Badge variant="outline" className={`text-[10px] ${TYPE_COLOR[s.accountType] ?? ""}`}>
                            {s.accountType}
                          </Badge>
                          <span className={`font-mono text-xs font-semibold mt-0.5 ${Number(s.balance) < 0 ? "text-red-700" : ""}`}>
                            {formatCurrency(Number(s.balance))}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ── Top Accounts by Movement ──────────────────────── */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" /> أكثر الحسابات حركة ({costBreakdown.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 space-y-1.5 max-h-96 overflow-y-auto">
                {topAccounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">
                    لا توجد حركة في الحسابات
                  </p>
                ) : (
                  topAccounts.map((a) => (
                    <Link key={a.code} href={`/finance/ledger/${a.code}`}>
                      <div className="p-2 rounded hover:bg-muted/40 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{a.code}</span>
                            <span className="text-[10px] text-muted-foreground">{a.name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-emerald-700">+{formatCurrency(Number(a.totalDebit))}</span>
                            <span className="font-mono text-red-700">-{formatCurrency(Number(a.totalCredit))}</span>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {Number(a.transactionCount)} حركة
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          {(() => {
                            const debit = Number(a.totalDebit);
                            const credit = Number(a.totalCredit);
                            const total = debit + credit;
                            if (total === 0) return null;
                            const debitPct = (debit / total) * 100;
                            return (
                              <div className="h-full flex">
                                <div className="bg-emerald-500" style={{ width: `${debitPct}%` }} />
                                <div className="bg-red-500 flex-1" />
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Recent Transactions ─────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> آخر {transactions.length} معاملة
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={txCols}
                data={transactions}
                pageSize={25}
                emptyMessage="لا توجد معاملات"
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
