import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck, ShieldAlert, Workflow, Target, AlertCircle,
  Pencil, ChevronLeft,
} from "lucide-react";

/**
 * AllocationHealthCard — surfaces line-level allocation health on
 * top-level finance pages (dashboard, CFO cockpit) so the enforce
 * flag + coverage + override volume are visible without navigating
 * into the allocation cluster.
 *
 * Reads three endpoints in parallel:
 *   GET /finance/settings/enforce-line-allocation  (flag status)
 *   GET /finance/allocation-results                (resolved / unmapped / override mix)
 *   GET /finance/allocation-override-log           (bypass audit count)
 *
 * The first endpoint defines what mode the system is in; the second
 * answers "is the resolver actually doing work?"; the third answers
 * "how often is the gate being bypassed?".
 */

interface EnforceResp { enforce: boolean; key: string }
interface AllocResultsResp { data: Array<{ resolutionStatus: string }>; total: number }
interface OverrideLogResp { data: unknown[]; total: number }

export function AllocationHealthCard() {
  const { data: enforceResp } = useApiQuery<EnforceResp>(
    ["finance-settings-enforce-line-allocation"],
    "/finance/settings/enforce-line-allocation",
  );
  const { data: resultsResp } = useApiQuery<AllocResultsResp>(
    ["allocation-results-health"],
    "/finance/allocation-results",
  );
  const { data: overrideResp } = useApiQuery<OverrideLogResp>(
    ["allocation-override-log-health"],
    "/finance/allocation-override-log",
  );

  const enforce = !!enforceResp?.enforce;
  const rows = resultsResp?.data ?? [];
  const total = rows.length;
  const resolved = rows.filter((r) => r.resolutionStatus === "resolved").length;
  const unmapped = rows.filter((r) => r.resolutionStatus === "unmapped").length;
  const overrideCount = rows.filter((r) => r.resolutionStatus === "manual_override").length;
  const coveragePct = total > 0 ? Math.round((resolved / total) * 100) : 0;
  const bypassCount = overrideResp?.data?.length ?? 0;

  // Health = the worst of (enforce off | low coverage | many bypasses)
  const isPoorCoverage = total > 0 && coveragePct < 70;
  const hasBypasses = bypassCount > 0;
  const health: "good" | "fair" | "poor" =
    !enforce ? "fair"
    : isPoorCoverage ? "poor"
    : hasBypasses ? "fair"
    : "good";

  const headerTone =
    health === "good" ? "border-status-success-surface bg-status-success-surface/30"
    : health === "fair" ? "border-status-warning-surface bg-status-warning-surface/30"
    : "border-status-danger-surface bg-status-danger-surface/30";

  return (
    <Card className={`mb-4 ${headerTone}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Workflow className="h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">صحة التوجيه المحاسبي (Line-Level Allocation)</p>
              <p className="text-[11px] text-muted-foreground">
                وضع الإلزام + تغطية القواعد + معدّل التجاوزات في لمحة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {enforce ? (
              <Badge variant="outline" className="text-[10px] gap-1 border-status-success-surface text-status-success-foreground">
                <ShieldCheck className="h-3 w-3" /> الإلزام مُفعَّل
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1 border-status-warning-surface text-status-warning-foreground">
                <ShieldAlert className="h-3 w-3" /> الإلزام معطّل
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <Tile
            icon={<Target className="h-4 w-4" />}
            label="التغطية التلقائية"
            value={total > 0 ? `${coveragePct}%` : "—"}
            sub={total > 0 ? `${resolved} من ${total}` : "لا توجد بيانات بعد"}
            tone={total === 0 ? "muted" : isPoorCoverage ? "danger" : coveragePct >= 90 ? "success" : "info"}
          />
          <Tile
            icon={<AlertCircle className="h-4 w-4" />}
            label="بنود غير موجَّهة"
            value={String(unmapped)}
            sub="status=unmapped"
            tone={unmapped === 0 ? "success" : "warning"}
          />
          <Tile
            icon={<Pencil className="h-4 w-4" />}
            label="تعديلات يدوية"
            value={String(overrideCount)}
            sub="manual_override"
            tone={overrideCount === 0 ? "muted" : "info"}
          />
          <Tile
            icon={<ShieldAlert className="h-4 w-4" />}
            label="تجاوزات الإلزام"
            value={String(bypassCount)}
            sub="bypass log"
            tone={bypassCount === 0 ? "muted" : "warning"}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-coverage">
              <Target className="h-3.5 w-3.5 ml-1" />
              تشخيص التغطية
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            </Link></Button>
          <Button asChild variant="outline" size="sm" className="h-7 text-xs"><Link href="/finance/allocation-rules">
              <Workflow className="h-3.5 w-3.5 ml-1" />
              قواعد التوجيه
            </Link></Button>
          {bypassCount > 0 && (
            <Button asChild variant="outline" size="sm" className="h-7 text-xs text-status-warning-foreground"><Link href="/finance/allocation-override-log">
                <ShieldAlert className="h-3.5 w-3.5 ml-1" />
                سجل التجاوزات ({bypassCount})
              </Link></Button>
          )}
          {unmapped > 0 && (
            <Button asChild variant="outline" size="sm" className="h-7 text-xs text-status-warning-foreground"><Link href="/finance/allocation-results?status=unmapped">
                <AlertCircle className="h-3.5 w-3.5 ml-1" />
                البنود غير الموجَّهة ({unmapped})
              </Link></Button>
          )}
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link href="/finance/settings">
              مركز الإعدادات
            </Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "success" | "warning" | "danger" | "info" | "muted";
}

const TONE_BG: Record<TileProps["tone"], string> = {
  success: "bg-status-success-surface/40",
  warning: "bg-status-warning-surface/40",
  danger:  "bg-status-danger-surface/40",
  info:    "bg-status-info-surface/40",
  muted:   "bg-muted/30",
};

const TONE_FG: Record<TileProps["tone"], string> = {
  success: "text-status-success-foreground",
  warning: "text-status-warning-foreground",
  danger:  "text-status-danger-foreground",
  info:    "text-status-info-foreground",
  muted:   "text-muted-foreground",
};

function Tile(props: TileProps) {
  return (
    <div className={`rounded-md p-2 ${TONE_BG[props.tone]}`}>
      <div className={`flex items-center gap-1 text-[10px] ${TONE_FG[props.tone]}`}>
        {props.icon}
        <span className="truncate">{props.label}</span>
      </div>
      <p className={`font-bold text-lg leading-tight mt-0.5 ${TONE_FG[props.tone]}`}>{props.value}</p>
      <p className="text-[9px] text-muted-foreground">{props.sub}</p>
    </div>
  );
}
