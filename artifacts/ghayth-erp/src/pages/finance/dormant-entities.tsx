import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Trash2, Moon, Sparkles, Network, Wallet2, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

/**
 * Dormant entities report — cost-centres + subsidiary accounts that
 * have ZERO journal-line traffic in the lookback window. These are
 * dead-weight in the dimensional graph: minted somewhere but never
 * used, or used once and now abandoned.
 *
 * Operationally: this is the cleanup view. The operator can soft-
 * delete a CC or a subsidiary mapping with one click; the action
 * doesn't touch any JEs (they keep referencing the row by id, but
 * the row is filtered out of the tree + reports going forward).
 *
 * Backed by GET /finance/dormant-entities?days=N.
 */

interface DormantCc {
  id: number;
  code: string | null;
  name: string;
  type: string | null;
  autoCreatedReason: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  jeCount: number;
}

interface DormantSub {
  id: number;
  entityType: string;
  entityId: number;
  accountType: string;
  accountCode: string;
  accountName: string;
  currentBalance: number | string | null;
  createdAt: string;
  lastActivityAt: string | null;
  jeCount: number;
}

interface Response {
  lookbackDays: number;
  costCenters: DormantCc[];
  subsidiaryAccounts: DormantSub[];
  totals: { costCenters: number; subsidiaryAccounts: number };
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  employee: "موظف",
  client: "عميل",
  vendor: "مورد",
  vehicle: "مركبة",
  driver: "سائق",
  property: "عقار",
  property_unit: "وحدة عقارية",
  umrah_agent: "وكيل عمرة",
  umrah_sub_agent: "وكيل فرعي",
  umrah_season: "موسم عمرة",
};

export default function DormantEntitiesPage() {
  const [days, setDays] = useState(90);
  const { data, isLoading, error, refetch } = useApiQuery<Response>(
    ["dormant-entities", String(days)],
    `/finance/dormant-entities?days=${days}`,
  );

  return (
    <PageShell
      title="الكيانات الخاملة"
      subtitle="مراكز التكلفة والحسابات الفرعية التي لم يُسجَّل عليها أي قيد في الفترة المُحدَّدة — مرشّحة للتنظيف"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/dimensional-routing", label: "التأصيل المالي" },
        { label: "الكيانات الخاملة" },
      ]}
      actions={
        <Link href="/finance/dimensional-routing">
          <Button variant="ghost" data-testid="dormant-back-link">
            <Network className="h-4 w-4 ms-1" />
            رجوع للتأصيل
          </Button>
        </Link>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3 flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs text-muted-foreground">فترة التحقق (أيام)</Label>
            <Input
              type="number"
              min={7}
              max={730}
              value={days}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setDays(Math.max(7, Math.min(730, v)));
              }}
              className="w-32 h-8 text-xs"
              data-testid="dormant-days-input"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            data-testid="dormant-refresh"
          >
            تحديث
          </Button>
          {data && (
            <span className="text-xs text-muted-foreground ms-auto">
              فترة التحقق: آخر {data.lookbackDays} يوماً
            </span>
          )}
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {data && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Card data-testid="dormant-cc-tile">
                <CardContent className="p-3 flex items-center gap-3">
                  <Moon className="h-7 w-7 text-status-warning-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">مراكز تكلفة خاملة</div>
                    <div className="text-2xl font-bold">{data.totals.costCenters.toLocaleString("ar-SA")}</div>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="dormant-sub-tile">
                <CardContent className="p-3 flex items-center gap-3">
                  <Wallet2 className="h-7 w-7 text-status-warning-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">حسابات فرعية خاملة</div>
                    <div className="text-2xl font-bold">{data.totals.subsidiaryAccounts.toLocaleString("ar-SA")}</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  مراكز التكلفة ({data.costCenters.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.costCenters.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    لا توجد مراكز تكلفة خاملة في هذه الفترة
                  </div>
                ) : (
                  <div className="divide-y" data-testid="dormant-cc-list">
                    {data.costCenters.map((cc) => (
                      <CcRow key={cc.id} cc={cc} onChanged={refetch} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet2 className="h-4 w-4 text-muted-foreground" />
                  الحسابات الفرعية ({data.subsidiaryAccounts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.subsidiaryAccounts.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    لا توجد حسابات فرعية خاملة في هذه الفترة
                  </div>
                ) : (
                  <div className="divide-y" data-testid="dormant-sub-list">
                    {data.subsidiaryAccounts.map((sa) => (
                      <SubRow key={sa.id} sa={sa} onChanged={refetch} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}

function CcRow({ cc, onChanged }: { cc: DormantCc; onChanged: () => void }) {
  const deleteMut = useApiMutation<{ success: boolean }, Record<string, never>>(
    `/finance/cost-centers/${cc.id}`,
    "DELETE",
    [["dormant-entities"]],
    { successMessage: "تم الحذف" },
  );
  const ageDays = Math.floor(
    (Date.now() - new Date(cc.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div
      className="p-3 flex items-center gap-3 hover:bg-muted/30"
      data-testid={`dormant-cc-row-${cc.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{cc.name}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {cc.code ?? `#${cc.id}`}
          </span>
          {cc.autoCreatedReason && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              تلقائي
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          منذ {ageDays.toLocaleString("ar-SA")} يوماً · 0 قيد في الفترة
        </div>
      </div>
      <Link href={`/finance/cost-centers/${cc.id}/pnl`}>
        <Button
          size="sm"
          variant="ghost"
          data-testid={`dormant-cc-view-${cc.id}`}
          title="فتح P&L للمركز"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </Link>
      <GuardedButton
        perm="finance.cost_centers:delete"
        size="sm"
        variant="ghost"
        className="text-status-error-foreground"
        onClick={async () => {
          await deleteMut.mutateAsync({});
          onChanged();
        }}
        data-testid={`dormant-cc-delete-${cc.id}`}
        title="حذف ناعم"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    </div>
  );
}

function SubRow({ sa, onChanged }: { sa: DormantSub; onChanged: () => void }) {
  const deleteMut = useApiMutation<{ success: boolean }, Record<string, never>>(
    `/finance/subsidiary-accounts/${sa.id}`,
    "DELETE",
    [["dormant-entities"]],
    { successMessage: "تم إلغاء الربط" },
  );
  const ageDays = Math.floor(
    (Date.now() - new Date(sa.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  return (
    <div
      className="p-3 flex items-center gap-3 hover:bg-muted/30"
      data-testid={`dormant-sub-row-${sa.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {ENTITY_TYPE_LABEL[sa.entityType] ?? sa.entityType} #{sa.entityId}
          </Badge>
          <span className="text-sm">{sa.accountName}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {sa.accountCode}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          منذ {ageDays.toLocaleString("ar-SA")} يوماً · رصيد {formatCurrency(Number(sa.currentBalance ?? 0))}
        </div>
      </div>
      <GuardedButton
        perm="finance.accounting_engine:delete"
        size="sm"
        variant="ghost"
        className="text-status-error-foreground"
        onClick={async () => {
          await deleteMut.mutateAsync({});
          onChanged();
        }}
        data-testid={`dormant-sub-delete-${sa.id}`}
        title="إلغاء ربط الحساب الفرعي"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </GuardedButton>
    </div>
  );
}
