import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Link } from "wouter";
import {
  Sparkles, CheckCircle2, AlertTriangle, Network, Wallet2,
  Building, Briefcase, Car, FileText, Layers, MapPin, User, Users,
  Calendar, ExternalLink, ScrollText, ArrowUpDown,
} from "lucide-react";

/**
 * Unified «التأصيل المالي» dashboard. Answers the operator's recurring
 * question: «هل النظام المالي متأصل في اصل النظام؟» — at a glance.
 *
 * One row per entity type that should be financially routed (branches,
 * departments, projects, contracts, vehicles, drivers, umrah agents /
 * sub-agents / seasons). For each row:
 *   - total count of live entities
 *   - linked count (subsidiary_accounts mapping exists)
 *   - withCc count (cost_centers mapping exists)
 *   - missing on either side → one-click backfill button against
 *     the appropriate endpoint
 *
 * Two backends feed the «missing» calls:
 *   - POST /finance/cost-centers/backfill   (branches, projects,
 *     contracts, vehicles, departments)
 *   - POST /umrah/backfill-dimensional-accounts (umrah agents,
 *     sub-agents, seasons)
 *
 * The page intentionally does NOT show drill-down per entity — that
 * lives on each entity's detail page via DimensionalAccountsCard.
 * This page is the BIRD'S-EYE: where do we have coverage gaps?
 */

interface HealthRow {
  entityType: string;
  label: string;
  total: number;
  linked: number;
  withCc: number;
  missingAccounts: number;
  missingCcs: number;
  subsidiaryBackfillPath: string | null;
  ccBackfillPath: string | null;
}

interface HealthResponse {
  data: HealthRow[];
  totals: { entities: number; missingAccounts: number; missingCcs: number };
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  branch:           MapPin,
  department:       Layers,
  project:          Briefcase,
  contract:         FileText,
  vehicle:          Car,
  driver:           User,
  umrah_agent:      Users,
  umrah_sub_agent:  Users,
  umrah_season:     Calendar,
};

const DETAIL_LINK_BY_TYPE: Record<string, string> = {
  branch:          "/settings/branches",
  department:      "/settings/departments",
  project:         "/projects",
  contract:        "/legal/contracts",
  vehicle:         "/fleet/vehicles",
  driver:          "/fleet/drivers",
  umrah_agent:     "/umrah/agents",
  umrah_sub_agent: "/umrah/sub-agents",
  umrah_season:    "/umrah/seasons",
};

interface CoverageResponse {
  totalLines: number;
  withCc: number;
  withDimensionButNoCc: number;
  orphanCorporate: number;
  coveragePct: number;
}

interface SubstitutionState {
  enabled: boolean;
  subsidiaryCount: number;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 100; // a zero-entity tenant is 100% "covered"
  return Math.round((part / whole) * 100);
}

export default function DimensionalRoutingPage() {
  const { data, isLoading, error, refetch } = useApiQuery<HealthResponse>(
    ["dimensional-routing-health"],
    "/finance/dimensional-routing/health",
  );
  const rows = data?.data ?? [];
  const totals = data?.totals ?? { entities: 0, missingAccounts: 0, missingCcs: 0 };

  // The third dimension of «التأصيل» — journal-line coverage. The
  // enricher in createJournalEntry fills costCenterId at posting time
  // for NEW JEs. This query surfaces past JEs that are missing the
  // routing so the operator can hit a one-click backfill.
  const { data: coverage, refetch: refetchCoverage } = useApiQuery<CoverageResponse>(
    ["dim-routing-line-coverage"],
    "/finance/journal-lines/dimensional-coverage",
  );
  const jlBackfillMut = useApiMutation<{ totalUpdated: number }, Record<string, never>>(
    "/finance/journal-lines/backfill-dimensions",
    "POST",
    [["dim-routing-line-coverage"]],
    { successMessage: "تم تأصيل القيود السابقة" },
  );

  // Subsidiary-substitution toggle — when ON, every NEW JE that
  // posts to a control account (e.g. 1121) with an entity FK gets
  // its accountCode swapped to the per-entity subsidiary (1121-0042).
  // OFF by default; the dashboard surfaces the toggle so operators
  // can opt in once they're confident their reports support it.
  const { data: substitution, refetch: refetchSubstitution } = useApiQuery<SubstitutionState>(
    ["dim-routing-substitution-state"],
    "/finance/subsidiary-substitution/state",
  );
  const substitutionMut = useApiMutation<{ enabled: boolean }, { enabled: boolean }>(
    "/finance/subsidiary-substitution/state",
    "PATCH",
    [["dim-routing-substitution-state"]],
    { successMessage: "تم التحديث" },
  );

  return (
    <PageShell
      title="التوجيه البُعدي"
      subtitle="نظرة عامة على ربط الكيانات بالحسابات الفرعية ومراكز التكلفة — يوضّح أين توجد فجوات تغطية تحتاج استكمال"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "التأصيل المالي" },
      ]}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="ghost" data-testid="dim-routing-subsidiary-link"><Link href="/finance/subsidiary-accounts">
              <Wallet2 className="h-4 w-4 ms-1" />
              الحسابات الفرعية
            </Link></Button>
          <Button asChild variant="ghost" data-testid="dim-routing-tree-link"><Link href="/finance/cost-centers/tree">
              <Network className="h-4 w-4 ms-1" />
              شجرة مراكز التكلفة
            </Link></Button>
          <Button asChild variant="ghost" data-testid="dim-routing-dormant-link"><Link href="/finance/dormant-entities">
              <AlertTriangle className="h-4 w-4 ms-1" />
              الخاملة
            </Link></Button>
          <Button asChild variant="ghost" data-testid="dim-routing-ranking-link"><Link href="/finance/entity-ranking">
              <ArrowUpDown className="h-4 w-4 ms-1" />
              التصنيف
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {/* Tenant rollup tiles — the operator's "am I covered?" answer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <KpiTile
            title="إجمالي الكيانات"
            value={totals.entities}
            icon={Network}
            tone="default"
            testid="dim-routing-total-entities"
          />
          <KpiTile
            title="بدون حساب فرعي"
            value={totals.missingAccounts}
            icon={Wallet2}
            tone={totals.missingAccounts > 0 ? "warning" : "success"}
            testid="dim-routing-missing-accounts"
          />
          <KpiTile
            title="بدون مركز تكلفة"
            value={totals.missingCcs}
            icon={Layers}
            tone={totals.missingCcs > 0 ? "warning" : "success"}
            testid="dim-routing-missing-ccs"
          />
        </div>

        {/* Control-account / subsidiary-ledger substitution toggle.
            The deepest operator-facing knob: when ON, every JE post
            at runtime swaps control-account codes for the per-entity
            subsidiary. ON by default (البند ٤) — surfaced so operators
            can opt OUT if their reports read literal leaf codes. */}
        {substitution && (
          <Card className="mb-4" data-testid="dim-routing-substitution">
            <CardContent className="p-3 flex items-center gap-3 flex-wrap">
              <Wallet2 className="h-7 w-7 text-muted-foreground" />
              <div className="flex-1 min-w-[14rem]">
                <div className="text-sm font-medium">
                  استبدال الحسابات الفرعية في القيود تلقائياً
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  مُفعَّل افتراضيًّا: قيدٌ على حساب رئيسي (مثل 1121 سلفة) لموظف #42 يُسجَّل
                  تلقائيًّا على حسابه الفرعي 1121-0042. الرصيد الأبوي يتجمّع عبر شجرة الحسابات —
                  يمكن إيقافه لهذه الشركة إن كانت تقاريرها تقرأ الأكواد الورقية.
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {substitution.subsidiaryCount.toLocaleString("ar-SA")} ربط حالي للحسابات الفرعية
                </div>
              </div>
              <GuardedButton
                perm="finance.cost_centers:update"
                variant={substitution.enabled ? "default" : "outline"}
                onClick={async () => {
                  await substitutionMut.mutateAsync({ enabled: !substitution.enabled });
                  refetchSubstitution();
                }}
                data-testid="dim-routing-substitution-toggle"
              >
                {substitution.enabled ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 ms-1" />
                    مفعّل
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 ms-1" />
                    تفعيل
                  </>
                )}
              </GuardedButton>
            </CardContent>
          </Card>
        )}

        {/* Journal-line coverage — the deepest signal. New JEs get
            costCenterId auto-filled by the enricher; this surfaces how
            much of the EXISTING ledger still needs the backfill. */}
        {coverage && (
          <Card className="mb-4" data-testid="dim-routing-jl-coverage">
            <CardContent className="p-3 flex items-center gap-3 flex-wrap">
              <ScrollText className="h-7 w-7 text-muted-foreground" />
              <div className="flex-1 min-w-[12rem]">
                <div className="text-xs text-muted-foreground">تغطية القيود بمراكز التكلفة</div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${coverage.coveragePct === 100 ? "text-status-success-foreground" : "text-status-warning-foreground"}`}>
                    {coverage.coveragePct}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {coverage.withCc.toLocaleString("ar-SA")} / {coverage.totalLines.toLocaleString("ar-SA")}
                  </span>
                </div>
                <Progress value={coverage.coveragePct} className="h-1.5 mt-1" />
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                  <span data-testid="dim-routing-jl-fixable">
                    قابلة للتأصيل: {coverage.withDimensionButNoCc.toLocaleString("ar-SA")}
                  </span>
                  <span data-testid="dim-routing-jl-orphan">
                    قيود عامة (بدون بُعد): {coverage.orphanCorporate.toLocaleString("ar-SA")}
                  </span>
                </div>
              </div>
              {coverage.withDimensionButNoCc > 0 && (
                <GuardedButton
                  perm="finance.cost_centers:update"
                  variant="outline"
                  onClick={async () => {
                    await jlBackfillMut.mutateAsync({});
                    refetchCoverage();
                  }}
                  data-testid="dim-routing-jl-backfill"
                >
                  <Sparkles className="h-4 w-4 ms-1" />
                  استكمل {coverage.withDimensionButNoCc.toLocaleString("ar-SA")} قيد
                </GuardedButton>
              )}
              {coverage.coveragePct === 100 && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  تأصيل كامل
                </Badge>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">التغطية حسب نوع الكيان</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y" data-testid="dim-routing-rows">
              {rows.map((row) => (
                <EntityHealthRow key={row.entityType} row={row} onChanged={refetch} />
              ))}
            </div>
          </CardContent>
        </Card>
      </PageStateWrapper>
    </PageShell>
  );
}

function KpiTile({
  title, value, icon: Icon, tone, testid,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "warning" | "success";
  testid: string;
}) {
  const toneClass =
    tone === "warning" ? "text-status-warning-foreground"
    : tone === "success" ? "text-status-success-foreground"
    : "text-foreground";
  return (
    <Card data-testid={testid}>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={`h-7 w-7 ${toneClass}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className={`text-2xl font-bold ${toneClass}`}>{value.toLocaleString("ar-SA")}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EntityHealthRow({ row, onChanged }: { row: HealthRow; onChanged: () => void }) {
  const Icon = TYPE_ICON[row.entityType] ?? Building;
  const detailLink = DETAIL_LINK_BY_TYPE[row.entityType];
  const coversAccounts = row.subsidiaryBackfillPath != null;
  const coversCc = row.ccBackfillPath != null;
  const acctPct = coversAccounts ? pct(row.linked, row.total) : null;
  const ccPct = coversCc ? pct(row.withCc, row.total) : null;
  const acctFull = coversAccounts && row.missingAccounts === 0;
  const ccFull = coversCc && row.missingCcs === 0;

  return (
    <div
      className="p-3 flex flex-wrap items-center gap-3"
      data-testid={`dim-routing-row-${row.entityType}`}
    >
      <div className="flex items-center gap-2 min-w-[10rem]">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{row.label}</span>
        <Badge variant="outline" className="text-xs">{row.total}</Badge>
      </div>

      {coversAccounts && (
        <div className="flex flex-col gap-1 min-w-[12rem] flex-1">
          <div className="flex items-center gap-2 text-xs">
            <Wallet2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">حسابات فرعية:</span>
            <span className={acctFull ? "text-status-success-foreground" : "text-status-warning-foreground"}>
              {row.linked} / {row.total}
            </span>
            {acctFull && <CheckCircle2 className="h-3 w-3 text-status-success-foreground" />}
          </div>
          {acctPct != null && <Progress value={acctPct} className="h-1.5" />}
        </div>
      )}

      {coversCc && (
        <div className="flex flex-col gap-1 min-w-[12rem] flex-1">
          <div className="flex items-center gap-2 text-xs">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">مراكز تكلفة:</span>
            <span className={ccFull ? "text-status-success-foreground" : "text-status-warning-foreground"}>
              {row.withCc} / {row.total}
            </span>
            {ccFull && <CheckCircle2 className="h-3 w-3 text-status-success-foreground" />}
          </div>
          {ccPct != null && <Progress value={ccPct} className="h-1.5" />}
        </div>
      )}

      <div className="flex gap-1 ms-auto">
        {coversAccounts && row.missingAccounts > 0 && (
          <BackfillButton
            path={row.subsidiaryBackfillPath!}
            body={{ entityType: row.entityType }}
            label={`استكمل ${row.missingAccounts}`}
            permission={row.entityType.startsWith("umrah_") ? "umrah:update" : "finance.accounting_engine:create"}
            invalidateKey="dimensional-routing-health"
            onDone={onChanged}
            testid={`dim-routing-backfill-acct-${row.entityType}`}
          />
        )}
        {coversCc && row.missingCcs > 0 && (
          <BackfillButton
            path={row.ccBackfillPath!}
            body={{ entityType: row.entityType }}
            label={`استكمل ${row.missingCcs}`}
            permission="finance.cost_centers:create"
            invalidateKey="dimensional-routing-health"
            onDone={onChanged}
            testid={`dim-routing-backfill-cc-${row.entityType}`}
          />
        )}
        {detailLink && (
          <Button asChild variant="ghost" size="sm" data-testid={`dim-routing-open-${row.entityType}`}><Link href={detailLink}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link></Button>
        )}
        {!coversAccounts && !coversCc && (
          <Badge variant="secondary" className="text-xs">
            <AlertTriangle className="h-3 w-3 ms-1" />
            بلا تأصيل
          </Badge>
        )}
      </div>
    </div>
  );
}

function BackfillButton({
  path, body, label, permission, invalidateKey, onDone, testid,
}: {
  path: string;
  body: Record<string, unknown>;
  label: string;
  permission: string;
  invalidateKey: string;
  onDone: () => void;
  testid: string;
}) {
  const mut = useApiMutation<{ summary: { created?: number } }, Record<string, unknown>>(
    path,
    "POST",
    [[invalidateKey]],
    { successMessage: "تم الاستكمال" },
  );
  return (
    <GuardedButton
      perm={permission as any}
      size="sm"
      variant="outline"
      onClick={async () => {
        await mut.mutateAsync(body);
        onDone();
      }}
      data-testid={testid}
    >
      <Sparkles className="h-3.5 w-3.5 ms-1" />
      {label}
    </GuardedButton>
  );
}
