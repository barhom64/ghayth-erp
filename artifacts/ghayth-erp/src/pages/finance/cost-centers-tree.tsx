import { useState, useMemo } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { Link } from "wouter";
import {
  Building, Briefcase, Car, FileText, Layers, MapPin, ChevronDown,
  ChevronRight, RefreshCw, MoveVertical, List, Sparkles, BarChart3,
  ArrowUpDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

/**
 * Hierarchical view of cost_centers. Backed by GET /finance/cost-centers/tree
 * which returns rows shaped by a recursive CTE: each row carries
 * `depth`, `path` (root → leaf id chain), and a roll-up
 * `descendantSpend` so totals show at every level without a second
 * round-trip.
 *
 * Drag-to-reparent: when the operator picks a different parent from
 * the dropdown in a node's row, we POST to PATCH /cost-centers/:id/parent
 * which cycle-checks server-side. The mutation invalidates the tree
 * query so the new structure renders without a manual refresh.
 *
 * Why this page exists alongside the flat /finance/cost-centers list:
 * the list is best for filter + create; the tree is the operator's
 * mental model — مركز رئيسي يحوي فروع تكلفة فرعية.
 */

interface TreeNode {
  id: number;
  code: string | null;
  name: string;
  type: string | null;
  parentId: number | null;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  autoCreatedReason: string | null;
  depth: number;
  path: number[];
  allocatedAmount: number | string | null;
  descendantSpend: number | string | null;
  /** Distinct JE count posted against this CC. 0 = «dead» CC — no
   *  activity ever, candidate for cleanup. Surfaces as a badge. */
  jeCount?: number;
  /** Most-recent date a JE posted against this CC. Surfaces under the
   *  spend line — operators can spot CCs that went silent. */
  lastActivityAt?: string | null;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  branch:     MapPin,
  project:    Briefcase,
  contract:   FileText,
  vehicle:    Car,
  department: Layers,
  general:    Building,
};

const TYPE_LABEL: Record<string, string> = {
  branch:     "فرع",
  project:    "مشروع",
  contract:   "عقد",
  vehicle:    "مركبة",
  department: "إدارة",
  general:    "عام",
};

export default function CostCentersTreePage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const { data, isLoading, error, refetch } = useApiQuery<{ data: TreeNode[] }>(
    ["cost-centers-tree"],
    "/finance/cost-centers/tree",
  );
  const rows: TreeNode[] = data?.data ?? [];

  const reparentMut = useApiMutation<
    { id: number; parentId: number | null },
    { id: number; parentId: number | null }
  >(
    // Function form — the caller's body carries the id, which we
    // splice into the URL and keep on the body (the server ignores
    // the extra id field; the URL param is what matters).
    (body) => `/finance/cost-centers/${body.id}/parent`,
    "PATCH",
    [["cost-centers-tree"]],
    { successMessage: "تم تعديل الترتيب" },
  );

  const backfillMut = useApiMutation<
    { summary: { created: number } },
    Record<string, never>
  >("/finance/cost-centers/backfill", "POST", [["cost-centers-tree"]], {
    successMessage: "تم استكمال مراكز التكلفة المفقودة",
  });

  // Build a quick "valid parent" map per node. A node's valid parents
  // are everything NOT in its own descendants subtree (to prevent
  // cycles). The server cycle-checks anyway, but doing this client-side
  // keeps the dropdown clean.
  const descendantsByNode = useMemo(() => {
    const out = new Map<number, Set<number>>();
    for (const r of rows) {
      // path[0..depth-1] are ancestors; descendants must be computed
      // by scanning for rows whose path includes this id.
      out.set(r.id, new Set());
    }
    for (const r of rows) {
      for (const ancestor of r.path) {
        if (ancestor !== r.id) {
          out.get(ancestor)?.add(r.id);
        }
      }
    }
    return out;
  }, [rows]);

  // Filter — when search is set, show the matching row AND all its
  // ancestors so the operator sees the context. We use the path array
  // to find ancestors quickly.
  const visibleIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    const matched = rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.code ?? "").toLowerCase().includes(q),
    );
    const visible = new Set<number>();
    for (const m of matched) {
      for (const id of m.path) visible.add(id);
    }
    return visible;
  }, [rows, search]);

  // Collapse logic — a node is rendered only if NONE of its ancestors
  // are collapsed. Search overrides collapse (force-expand to show
  // matches in context).
  const isHidden = (node: TreeNode): boolean => {
    if (visibleIds && !visibleIds.has(node.id)) return true;
    if (search.trim()) return false;
    for (const ancestor of node.path.slice(0, -1)) {
      if (collapsed.has(ancestor)) return true;
    }
    return false;
  };

  const hasChildren = (id: number): boolean => (descendantsByNode.get(id)?.size ?? 0) > 0;

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onReparent = async (id: number, parentId: number | null) => {
    try {
      await reparentMut.mutateAsync({ id, parentId });
    } catch (err: any) {
      toast({
        title: "تعذّر التعديل",
        description: err?.message ?? "حصل خطأ غير متوقع",
        variant: "destructive",
      });
    }
  };

  const visibleRows = rows.filter((r) => !isHidden(r));
  const roots = rows.filter((r) => r.parentId == null);

  return (
    <PageShell
      title="شجرة مراكز التكلفة"
      subtitle="عرض هرمي لمراكز التكلفة — يعكس البنية التنظيمية (فرع → مشروع/عقد/مركبة)، مع تجميع المصروفات على كل مستوى"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/cost-centers", label: "مراكز التكلفة" },
        { label: "الشجرة" },
      ]}
      actions={
        <div className="flex gap-2">
          <GuardedButton
            perm="finance.cost_centers:create"
            variant="outline"
            onClick={async () => {
              await backfillMut.mutateAsync({});
              refetch();
            }}
            data-testid="cost-centers-tree-backfill"
          >
            <Sparkles className="h-4 w-4 ms-1" />
            استكمال المفقود
          </GuardedButton>
          <Button asChild variant="ghost" data-testid="cost-centers-tree-flat-link"><Link href="/finance/cost-centers">
              <List className="h-4 w-4 ms-1" />
              العرض الجدولي
            </Link></Button>
          <Button asChild variant="ghost" data-testid="cost-centers-tree-ranking-link"><Link href="/finance/cost-centers/ranking">
              <ArrowUpDown className="h-4 w-4 ms-1" />
              التصنيف
            </Link></Button>
        </div>
      }
    >
      <FinanceTabsNav />

      <Card className="mb-3">
        <CardContent className="p-3 flex items-center gap-2">
          <Input
            placeholder="بحث بالاسم أو الرمز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md h-8 text-sm"
            data-testid="cost-centers-tree-search"
          />
          <span className="text-xs text-muted-foreground">
            {visibleRows.length} / {rows.length} مركز · {roots.length} جذر
          </span>
        </CardContent>
      </Card>

      <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              لا توجد مراكز تكلفة بعد. اضغط «استكمال المفقود» لإنشاء مراكز تكلفة تلقائية
              للفروع والمشاريع والعقود والمركبات الموجودة.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-2" data-testid="cost-centers-tree-list">
              {visibleRows.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  hasChildren={hasChildren(node.id)}
                  collapsed={collapsed.has(node.id)}
                  onToggle={() => toggleCollapse(node.id)}
                  validParents={rows.filter((r) => {
                    if (r.id === node.id) return false;
                    return !descendantsByNode.get(node.id)?.has(r.id);
                  })}
                  onReparent={(parentId) => onReparent(node.id, parentId)}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </PageStateWrapper>
    </PageShell>
  );
}

function TreeRow({
  node, hasChildren, collapsed, onToggle, validParents, onReparent,
}: {
  node: TreeNode;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  validParents: TreeNode[];
  onReparent: (parentId: number | null) => void;
}) {
  const Icon = TYPE_ICON[node.type ?? "general"] ?? Building;
  const isAuto = !!node.autoCreatedReason;
  const spend = Number(node.descendantSpend ?? 0);
  const allocated = Number(node.allocatedAmount ?? 0);
  const jeCount = Number(node.jeCount ?? 0);
  const lastActivity = node.lastActivityAt;
  // A CC with zero JEs is "dead weight" — surfaced visually so the
  // operator can clean up the COA tree without grepping reports.
  const isDead = jeCount === 0;
  // Inset by 1.5rem per depth level so the hierarchy is visually obvious
  // without needing a tree-line SVG. Capped at 12 so deep trees stay
  // within the card width.
  const indent = Math.min(node.depth, 12) * 1.5;

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 border-b last:border-b-0 hover:bg-muted/30"
      style={{ paddingInlineStart: `${indent}rem` }}
      data-testid={`cost-centers-tree-row-${node.id}`}
      data-depth={node.depth}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasChildren}
        className={`w-5 h-5 flex items-center justify-center rounded ${
          hasChildren ? "hover:bg-muted text-muted-foreground" : "text-transparent"
        }`}
        data-testid={`cost-centers-tree-toggle-${node.id}`}
      >
        {hasChildren ? (collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>

      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{node.name}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">
            {node.code ?? `#${node.id}`}
          </span>
          {node.type && <Badge variant="outline" className="text-xs">{TYPE_LABEL[node.type] ?? node.type}</Badge>}
          {isAuto && (
            <Badge variant="secondary" className="text-xs gap-1" title={node.autoCreatedReason ?? ""}>
              <Sparkles className="h-3 w-3" />
              تلقائي
            </Badge>
          )}
          {jeCount > 0 && (
            <Badge
              variant="outline"
              className="text-xs"
              data-testid={`cost-centers-tree-jecount-${node.id}`}
              title="عدد القيود المرتبطة بهذا المركز"
            >
              {jeCount} قيد
            </Badge>
          )}
          {isDead && !isAuto && (
            // Manually-created CCs with zero JEs are likely orphans
            // — surface so the operator can prune them.
            <Badge
              variant="outline"
              className="text-xs text-status-warning-foreground border-status-warning-surface/40"
              data-testid={`cost-centers-tree-dead-${node.id}`}
              title="لم يُسجَّل أي قيد على هذا المركز"
            >
              خامل
            </Badge>
          )}
        </div>
        {(spend !== 0 || allocated !== 0 || lastActivity) && (
          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
            {allocated !== 0 && <span>مخصّص: {formatCurrency(allocated)}</span>}
            <span>مصروف: {formatCurrency(spend)}</span>
            {lastActivity && (
              <span title="آخر قيد مسجّل" data-testid={`cost-centers-tree-lastact-${node.id}`}>
                آخر نشاط: {new Date(lastActivity).toLocaleDateString("ar-SA")}
              </span>
            )}
          </div>
        )}
      </div>

      <select
        className="text-xs border rounded px-2 py-1 bg-background max-w-[12rem]"
        value={node.parentId ?? ""}
        onChange={(e) => onReparent(e.target.value ? Number(e.target.value) : null)}
        data-testid={`cost-centers-tree-reparent-${node.id}`}
        title="نقل تحت أب آخر"
      >
        <option value="">— جذر (بدون أب) —</option>
        {validParents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code ? `${p.code} — ` : ""}{p.name}
          </option>
        ))}
      </select>

      <Button asChild
          size="sm"
          variant="ghost"
          data-testid={`cost-centers-tree-pnl-${node.id}`}
          title="فتح أرباح وخسائر هذا المركز"
        ><Link href={`/finance/cost-centers/${node.id}/pnl`}>
          <BarChart3 className="h-3.5 w-3.5" />
        </Link></Button>

      <MoveVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
    </div>
  );
}
