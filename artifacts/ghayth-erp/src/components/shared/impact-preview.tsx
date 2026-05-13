import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle, Info, XCircle, Eye, Loader2 } from "lucide-react";

interface ImpactItem {
  category: string;
  label: string;
  value: string;
  severity: "info" | "warning" | "danger" | "success";
}

interface ImpactPreview {
  actionType: string;
  employeeId: number;
  employeeName: string;
  items: ImpactItem[];
  summary: string;
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  info: { bg: "bg-status-info-surface border-status-info-surface", text: "text-status-info-foreground", icon: Info },
  warning: { bg: "bg-status-warning-surface border-yellow-200", text: "text-yellow-700", icon: AlertTriangle },
  danger: { bg: "bg-status-error-surface border-status-error-surface", text: "text-status-error-foreground", icon: XCircle },
  success: { bg: "bg-status-success-surface border-status-success-surface", text: "text-status-success-foreground", icon: CheckCircle },
};

interface ImpactPreviewButtonProps {
  endpoint: string;
  payload: Record<string, any>;
  label?: string;
  onImpactLoaded?: (impact: ImpactPreview) => void;
}

export function ImpactPreviewButton({ endpoint, payload, label = "معاينة الأثر", onImpactLoaded }: ImpactPreviewButtonProps) {
  const [impact, setImpact] = useState<ImpactPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const loadImpact = async () => {
    if (shown && impact) { setShown(false); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<ImpactPreview>(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImpact(result);
      setShown(true);
      onImpactLoaded?.(result);
    } catch (err: any) {
      setError(err.message || "خطأ في التحميل");
    } finally {
      setLoading(false);
    }
  };

  const hasDanger = impact?.items.some(i => i.severity === "danger");
  const hasWarning = impact?.items.some(i => i.severity === "warning");

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={loadImpact}
        disabled={loading}
        className={cn(
          "gap-1.5",
          hasDanger && shown ? "border-status-error-surface text-status-error-foreground hover:bg-status-error-surface" :
          hasWarning && shown ? "border-yellow-300 text-yellow-600 hover:bg-status-warning-surface" :
          "border-status-info-surface text-status-info-foreground hover:bg-status-info-surface"
        )}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        {label}
      </Button>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {shown && impact && (
        <ImpactPreviewPanel impact={impact} />
      )}
    </div>
  );
}

export function ImpactPreviewPanel({ impact }: { impact: ImpactPreview }) {
  const hasDanger = impact.items.some(i => i.severity === "danger");
  const hasWarning = impact.items.some(i => i.severity === "warning");

  const summaryStyle = hasDanger ? "bg-status-error-surface border-status-error-surface text-status-error-foreground"
    : hasWarning ? "bg-status-warning-surface border-yellow-300 text-yellow-700"
    : "bg-status-success-surface border-status-success-surface text-status-success-foreground";

  const groupedItems = impact.items.reduce((acc: Record<string, ImpactItem[]>, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border bg-surface-subtle p-4 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        {hasDanger ? <XCircle className="h-4 w-4 text-red-500" /> :
         hasWarning ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> :
         <CheckCircle className="h-4 w-4 text-green-500" />}
        <p className="font-semibold text-gray-800">ماذا سيحدث إذا اعتمدت؟</p>
      </div>

      {Object.entries(groupedItems).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat}</p>
          <div className="space-y-1.5">
            {items.map((item, idx) => {
              const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
              const Icon = style.icon;
              return (
                <div key={idx} className={cn("flex items-start gap-2 rounded-lg border p-2.5", style.bg)}>
                  <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", style.text)} />
                  <div className="min-w-0">
                    <span className={cn("text-xs font-medium", style.text)}>{item.label}: </span>
                    <span className="text-xs text-muted-foreground">{item.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", summaryStyle)}>
        الخلاصة: {impact.summary}
      </div>
    </div>
  );
}
