import { useApiQuery, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { ShieldCheck, User, Clock, Edit, Plus, Trash, CheckCircle, XCircle, ArrowRight, Eye, Download, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ACTION_META: Record<string, { icon: typeof ShieldCheck; color: string; bg: string; label: string }> = {
  create:        { icon: Plus,        color: "text-status-success-foreground", bg: "bg-status-success-surface",  label: "إنشاء" },
  update:        { icon: Edit,        color: "text-status-info-foreground",    bg: "bg-status-info-surface",     label: "تعديل" },
  delete:        { icon: Trash,       color: "text-status-error-foreground",   bg: "bg-status-error-surface",    label: "حذف" },
  approve:       { icon: CheckCircle, color: "text-emerald-600",               bg: "bg-emerald-50",              label: "موافقة" },
  reject:        { icon: XCircle,     color: "text-status-error-foreground",   bg: "bg-status-error-surface",    label: "رفض" },
  status_change: { icon: ArrowRight,  color: "text-orange-600",                bg: "bg-orange-50",               label: "تغيير الحالة" },
  view:          { icon: Eye,         color: "text-muted-foreground",          bg: "bg-surface-subtle",          label: "عرض" },
  export:        { icon: Download,    color: "text-indigo-600",                bg: "bg-indigo-50",               label: "تصدير" },
  login:         { icon: Lock,        color: "text-purple-600",                bg: "bg-purple-50",               label: "دخول" },
};

interface AuditEntry {
  id: number | string;
  action: string;
  userName?: string;
  userId?: number | string;
  ipAddress?: string;
  userAgent?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
  note?: string;
}

function FieldDiff({ before, after }: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null }) {
  if (!before && !after) return null;
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  const changed = keys.filter(k => {
    const bv = JSON.stringify((before ?? {})[k] ?? null);
    const av = JSON.stringify((after ?? {})[k] ?? null);
    return bv !== av;
  });
  if (!changed.length) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {changed.slice(0, 6).map(k => (
        <div key={k} className="flex items-start gap-1.5 text-[11px]">
          <span className="font-mono text-muted-foreground shrink-0 pt-px">{k}:</span>
          {before && (before)[k] !== undefined && (
            <span className="line-through text-status-error-foreground/70 max-w-[120px] truncate">
              {String((before)[k])}
            </span>
          )}
          {before && (before)[k] !== undefined && after && (after)[k] !== undefined && (
            <span className="text-muted-foreground">→</span>
          )}
          {after && (after)[k] !== undefined && (
            <span className="text-status-success-foreground max-w-[120px] truncate">
              {String((after)[k])}
            </span>
          )}
        </div>
      ))}
      {changed.length > 6 && (
        <p className="text-[10px] text-muted-foreground">…و {changed.length - 6} حقل آخر</p>
      )}
    </div>
  );
}

interface AuditTrailPanelProps {
  entityType: string;
  entityId: number | string;
  maxItems?: number;
  className?: string;
}

export function AuditTrailPanel({ entityType, entityId, maxItems = 50, className }: AuditTrailPanelProps) {
  const { data, isLoading } = useApiQuery<any>(
    ["audit-trail", entityType, String(entityId)],
    `/audit-logs/${entityType}/${entityId}`,
    !!entityId,
  );

  const entries: AuditEntry[] = asList(data?.data ?? data);

  if (isLoading) {
    return (
      <div className={cn("space-y-3 animate-pulse", className)}>
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 rounded-lg bg-surface-subtle" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className={cn("text-center py-8 text-muted-foreground text-sm", className)}>
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        لا يوجد سجل تدقيق لهذا العنصر
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">سجل التدقيق والامتثال (PDPL)</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">{entries.length}</Badge>
      </div>

      <div className="relative">
        <div className="absolute start-4 top-0 bottom-0 w-0.5 bg-gray-200" />
        <div className="space-y-2">
          {entries.slice(0, maxItems).map((entry, i) => {
            const meta = ACTION_META[entry.action] ?? ACTION_META.update;
            const Icon = meta.icon;
            return (
              <div key={entry.id ?? i} className="relative flex items-start gap-3 ps-9">
                <div className={cn("absolute start-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white z-10", meta.bg)}>
                  <Icon className={cn("w-3 h-3", meta.color)} />
                </div>
                <div className="flex-1 min-w-0 bg-surface-subtle/50 rounded-lg p-2.5 border border-border/40">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded", meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                      {entry.userName && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="w-3 h-3" />
                          {entry.userName}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatDateAr(entry.createdAt)}
                    </span>
                  </div>

                  {entry.ipAddress && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">IP: {entry.ipAddress}</p>
                  )}

                  {entry.note && (
                    <p className="text-xs text-muted-foreground mt-1">{entry.note}</p>
                  )}

                  <FieldDiff before={entry.before} after={entry.after} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AuditTrailPanel;
