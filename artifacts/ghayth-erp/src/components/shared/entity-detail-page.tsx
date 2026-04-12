import { useState, type ReactNode, type ComponentType } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, AlertCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntityTab = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode | (() => ReactNode);
  badge?: string | number;
};

export type EntityKpi = {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  color?: string;
};

export type EntityHeaderAction = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
};

export type EntityDetailPageProps = {
  title: string;
  subtitle?: string;
  avatar?: {
    text?: string;
    imageUrl?: string;
    gradientFrom?: string;
    gradientTo?: string;
    icon?: ComponentType<{ className?: string }>;
  };
  status?: {
    label: string;
    variant?: "default" | "success" | "warning" | "destructive" | "info";
  };
  badges?: ReactNode;
  metaItems?: Array<{ icon: ComponentType<{ className?: string }>; label: string }>;
  actions?: EntityHeaderAction[];
  backHref?: string;
  backLabel?: string;

  kpis?: EntityKpi[];
  tabs: EntityTab[];
  defaultTab?: string;

  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;

  children?: ReactNode;
};

const STATUS_VARIANT_CLS: Record<string, string> = {
  default: "bg-gray-100 text-gray-700 border-gray-200",
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  destructive: "bg-red-100 text-red-700 border-red-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
};

function HeaderSkeleton() {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EntityDetailPage(props: EntityDetailPageProps) {
  const {
    title,
    subtitle,
    avatar,
    status,
    badges,
    metaItems,
    actions,
    backHref = "/",
    backLabel = "العودة",
    kpis,
    tabs,
    defaultTab,
    isLoading,
    isError,
    errorMessage,
    onRetry,
    children,
  } = props;

  const initialTab = defaultTab || tabs[0]?.key || "";
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  if (isError) {
    return (
      <div className="space-y-4" dir="rtl">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowRight className="h-4 w-4" />
            {backLabel}
          </Button>
        </Link>
        <Card className="border-red-200">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-lg font-semibold text-red-700">حدث خطأ</p>
            <p className="text-sm text-gray-500">{errorMessage || "تعذر تحميل البيانات"}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
                <RotateCcw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const AvatarIcon = avatar?.icon;
  const gradientFrom = avatar?.gradientFrom || "from-blue-500";
  const gradientTo = avatar?.gradientTo || "to-indigo-600";
  const statusVariant = status?.variant || "default";

  return (
    <div className="space-y-4" dir="rtl">
      <Link href={backHref}>
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowRight className="h-4 w-4" />
          {backLabel}
        </Button>
      </Link>

      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className={cn(
                    "h-20 w-20 rounded-full flex items-center justify-center text-white text-2xl font-bold shrink-0 bg-gradient-to-br",
                    gradientFrom,
                    gradientTo
                  )}
                >
                  {avatar?.imageUrl ? (
                    <img src={avatar.imageUrl} alt={title} className="h-full w-full rounded-full object-cover" />
                  ) : AvatarIcon ? (
                    <AvatarIcon className="h-10 w-10" />
                  ) : (
                    <span>{avatar?.text || title.slice(0, 2)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight truncate">{title}</h1>
                    {status && (
                      status.variant ? (
                        <Badge className={cn("font-normal border", STATUS_VARIANT_CLS[statusVariant])} variant="outline">
                          {status.label}
                        </Badge>
                      ) : (
                        <StatusBadge status={status.label} />
                      )
                    )}
                    {badges}
                  </div>
                  {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
                  {metaItems && metaItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {metaItems.map((m, i) => {
                        const Icon = m.icon;
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100 text-xs text-gray-600"
                          >
                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                            <span>{m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {actions && actions.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  {actions.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <Button
                        key={i}
                        size="sm"
                        variant={a.variant || "outline"}
                        onClick={a.onClick}
                        disabled={a.disabled}
                        className="gap-1"
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        {a.label}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        kpis && kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map((k, i) => {
              const Icon = k.icon;
              return (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    {Icon && (
                      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", k.color || "text-blue-600 bg-blue-50")}>
                        <Icon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xl font-bold truncate">{k.value}</p>
                      <p className="text-xs text-gray-500 truncate">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {children}

      {!isLoading && tabs.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="w-full">
          <TabsList className="h-auto w-full flex flex-wrap gap-1 md:grid md:auto-cols-fr md:grid-flow-col bg-muted p-1">
            {tabs.map((t) => {
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
          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-4">
              {activeTab === t.key && (typeof t.content === "function" ? (t.content as () => ReactNode)() : t.content)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export default EntityDetailPage;
