import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight, Clock, FileText, Activity, CheckSquare, Link2,
  User, Calendar, Hash, Briefcase, Printer, Eye, MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { PageStateWrapper } from "./page-state";
import { EntityDocuments } from "./entity-documents";
import { EntityTimeline } from "./entity-timeline";
import { EntityComments } from "./entity-comments";
import { LinkedTasks } from "./linked-tasks";
import { PageStatusBadge } from "@/components/page-status-badge";

/**
 * DetailPageLayout — the single source of truth for "how a detail page
 * looks" across the whole ERP. Built to satisfy the expert review: every
 * entity detail page must show, at minimum:
 *
 *   1. Reference header  → ref, status, type, creation date, last update
 *   2. Primary metadata  → creator, assignee, related project/client/etc
 *   3. Tabs              → Overview, Documents (with preview), Timeline,
 *                          Comments, Tasks, Links, Print
 *   4. Action buttons    → always gated by permissions
 *
 * Pages pass the entity-specific Overview content via `overview`, plus
 * metadata pieces through typed fields. Everything else (tabs, error
 * handling, loading skeleton, back button) is handled by this component
 * so the pages stay concise.
 *
 * Usage pattern:
 *
 *   <DetailPageLayout
 *     title="فاتورة #INV-2024-001"
 *     subtitle="للعميل أحمد محمد"
 *     backPath="/finance/invoices"
 *     status={{ label: "مرسلة", tone: "info" }}
 *     refNumber="INV-2024-001"
 *     createdAt={invoice.createdAt}
 *     updatedAt={invoice.updatedAt}
 *     createdByName={invoice.createdByName}
 *     assignedToName={invoice.assignedToName}
 *     relatedEntities={[
 *       { type: "client",  id: invoice.clientId,  label: invoice.clientName, href: `/clients/${invoice.clientId}` },
 *       { type: "project", id: invoice.projectId, label: invoice.projectName, href: `/projects/${invoice.projectId}` },
 *     ]}
 *     entityType="invoice"
 *     entityId={invoice.id}
 *     isLoading={isLoading}
 *     error={error}
 *     onRetry={refetch}
 *     actions={<GuardedButton perm="finance:update">تعديل</GuardedButton>}
 *     overview={<InvoiceOverview invoice={invoice} />}
 *     printable
 *     onPrint={() => window.print()}
 *   />
 */

export type DetailStatus = {
  label: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info" | "muted";
};

export type RelatedEntity = {
  type: string;
  id: number | string;
  label: string;
  /** Secondary line (e.g. "الميزانية: 50,000 ريال"). */
  sublabel?: string;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
};

export type DetailAction = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  disabled?: boolean;
  /** Rendered inside a PermissionGate if set. */
  permission?: string;
};

export type ExtraTab = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string | number;
  content: ReactNode | (() => ReactNode);
};

export interface DetailPageLayoutProps {
  title: string;
  subtitle?: string;
  backPath?: string;
  backLabel?: string;

  /** Reference number (shown next to title + in header strip). */
  refNumber?: string;
  status?: DetailStatus;
  typeLabel?: string;

  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  assignedToName?: string | null;

  relatedEntities?: RelatedEntity[];

  /** entityType/id power the Documents, Timeline, Tasks, Comments tabs. */
  entityType: string;
  entityId: number | string;

  /** Overview tab content. Required — this is the entity's primary info. */
  overview: ReactNode;

  /** Extra tabs (Financial, Timeline subsections, etc.). */
  extraTabs?: ExtraTab[];
  /** Default active tab key. Defaults to "overview". */
  defaultTab?: string;

  /** Action buttons in the header top-right. */
  actions?: ReactNode;

  /** Show a Print action button in header, calls onPrint when clicked. */
  printable?: boolean;
  onPrint?: () => void;

  /** Hide specific standard tabs. */
  hideTabs?: ("documents" | "timeline" | "comments" | "tasks")[];

  /** Loading / error state for the top-level entity fetch. */
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;

  /** Extra content rendered above the tabs (rarely used). */
  headerExtra?: ReactNode;
}

const STATUS_TONE_CLS: Record<NonNullable<DetailStatus["tone"]>, string> = {
  default: "bg-gray-100 text-gray-700 border-gray-200",
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  destructive: "bg-red-100 text-red-700 border-red-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
  muted: "bg-gray-50 text-gray-500 border-gray-200",
};

export function DetailPageLayout(props: DetailPageLayoutProps) {
  const {
    title,
    subtitle,
    backPath = "/",
    backLabel = "العودة",
    refNumber,
    status,
    typeLabel,
    createdAt,
    updatedAt,
    createdByName,
    assignedToName,
    relatedEntities,
    entityType,
    entityId,
    overview,
    extraTabs = [],
    defaultTab = "overview",
    actions,
    printable,
    onPrint,
    hideTabs = [],
    isLoading,
    error,
    onRetry,
    headerExtra,
  } = props;

  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // --- Header strip (always visible, even during loading) -----------------
  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <Link href={backPath}>
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowRight className="h-4 w-4" />
          {backLabel}
        </Button>
      </Link>
      <div className="flex items-center gap-2 flex-wrap">
        {printable && onPrint && (
          <Button onClick={onPrint} size="sm" variant="outline" className="gap-1">
            <Printer className="h-4 w-4" />
            طباعة / معاينة
          </Button>
        )}
        {actions}
      </div>
    </div>
  );

  // --- Wrapper handles loading/error state ---------------------------------
  if (isLoading || error) {
    return (
      <div className="space-y-4" dir="rtl">
        {header}
        <PageStateWrapper isLoading={isLoading} error={error} onRetry={onRetry}>
          <div />
        </PageStateWrapper>
      </div>
    );
  }

  // --- Build list of tabs ---------------------------------------------------
  const STANDARD_TABS: ExtraTab[] = [];
  STANDARD_TABS.push({
    key: "overview",
    label: "نظرة عامة",
    icon: Activity,
    content: overview,
  });
  if (!hideTabs.includes("documents")) {
    STANDARD_TABS.push({
      key: "documents",
      label: "المرفقات",
      icon: FileText,
      content: () => <EntityDocuments entityType={entityType} entityId={entityId} />,
    });
  }
  if (!hideTabs.includes("timeline")) {
    STANDARD_TABS.push({
      key: "timeline",
      label: "السجل الزمني",
      icon: Clock,
      content: () => <EntityTimeline entityType={entityType} entityId={entityId} />,
    });
  }
  if (!hideTabs.includes("tasks")) {
    STANDARD_TABS.push({
      key: "tasks",
      label: "المهام",
      icon: CheckSquare,
      content: () => <LinkedTasks entityType={entityType} entityId={entityId} />,
    });
  }
  if (!hideTabs.includes("comments")) {
    STANDARD_TABS.push({
      key: "comments",
      label: "المناقشة",
      icon: MessageCircle,
      content: () => <EntityComments entityType={entityType} entityId={entityId} />,
    });
  }

  const allTabs = [...STANDARD_TABS, ...extraTabs];
  const statusTone = status?.tone ?? "default";

  // --- Reference card with full context ------------------------------------
  return (
    <div className="space-y-4 print:space-y-2" dir="rtl">
      {header}

      {/* Title + reference + status card */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight">{title}</h1>
                {status && (
                  status.tone ? (
                    <Badge className={cn("font-normal border", STATUS_TONE_CLS[statusTone])} variant="outline">
                      {status.label}
                    </Badge>
                  ) : (
                    <PageStatusBadge status={status.label} />
                  )
                )}
                {typeLabel && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {typeLabel}
                  </Badge>
                )}
              </div>
              {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}

              {/* Meta row — ref, dates, creator, assignee */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-gray-600">
                {refNumber && (
                  <MetaChip icon={Hash} value={refNumber} mono />
                )}
                {createdByName && (
                  <MetaChip icon={User} label="مقدم الطلب" value={createdByName} />
                )}
                {assignedToName && (
                  <MetaChip icon={Briefcase} label="المكلف" value={assignedToName} />
                )}
                {createdAt && (
                  <MetaChip icon={Calendar} label="الإنشاء" value={formatDateAr(createdAt)} />
                )}
                {updatedAt && updatedAt !== createdAt && (
                  <MetaChip icon={Clock} label="آخر تحديث" value={formatDateAr(updatedAt)} />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Related entities strip — visible in any detail page */}
      {relatedEntities && relatedEntities.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4 text-gray-500" />
              مرتبط بـ
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {relatedEntities
                .filter(e => e.id !== null && e.id !== undefined && e.label)
                .map((e, i) => {
                  const Icon = e.icon;
                  const content = (
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs",
                      e.href ? "hover:bg-gray-50 cursor-pointer" : "",
                      "bg-white border-gray-200"
                    )}>
                      {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{e.label}</p>
                        {e.sublabel && <p className="text-[10px] text-gray-500 truncate">{e.sublabel}</p>}
                      </div>
                    </div>
                  );
                  return e.href ? (
                    <Link key={i} href={e.href}>{content}</Link>
                  ) : (
                    <div key={i}>{content}</div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {headerExtra}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="w-full">
        <TabsList className="h-auto w-full flex flex-wrap gap-1 md:grid md:auto-cols-fr md:grid-flow-col bg-muted p-1 print:hidden">
          {allTabs.map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5 data-[state=active]:bg-background">
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
                {t.badge !== undefined && t.badge !== null && t.badge !== "" && (
                  <Badge variant="secondary" className="ms-1 h-5 min-w-5 px-1 text-[10px]">
                    {t.badge}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {allTabs.map(t => (
          <TabsContent key={t.key} value={t.key} className="mt-4 print:mt-2">
            {activeTab === t.key && (typeof t.content === "function" ? (t.content as () => ReactNode)() : t.content)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function MetaChip({ icon: Icon, label, value, mono }: { icon: ComponentType<{ className?: string }>; label?: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      {label && <span className="text-gray-500">{label}:</span>}
      <span className={cn("font-medium text-gray-800", mono && "font-mono")}>{value}</span>
    </div>
  );
}

export default DetailPageLayout;
