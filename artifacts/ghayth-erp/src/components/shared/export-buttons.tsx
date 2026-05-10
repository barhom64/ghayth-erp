import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, ChevronDown, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { notifyRateLimited, RateLimitError } from "@/lib/rate-limit-toast";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authFetchBlob(endpoint: string, qs: string = ""): Promise<Blob> {
  const response = await fetch(`${BASE}/api${endpoint}${qs}`, { credentials: "include" });
  if (response.status === 429) {
    // Surface the live cooldown so the export button (and every other
    // rate-limit-aware button on the page) ticks down "حاول بعد N ثانية…".
    throw new RateLimitError(notifyRateLimited(response));
  }
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.blob();
}

interface ExportButtonProps {
  endpoint: string;
  filename: string;
  type: "excel" | "pdf";
  label?: string;
  params?: Record<string, string | undefined>;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}

export function ExportButton({ endpoint, filename, type, label, params, size = "sm", variant = "outline" }: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const cooldown = useRateLimitCooldown();

  const handleExport = async () => {
    setLoading(true);
    try {
      const qs = params
        ? "?" + Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&")
        : "";
      const blob = await authFetchBlob(endpoint, qs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `تم تصدير ${filename}` });
    } catch (err: any) {
      // The shared rate-limit toast already explains the 429 — skip the
      // duplicate destructive toast here.
      if (!(err instanceof RateLimitError)) {
        toast({ variant: "destructive", title: "فشل التصدير", description: err.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || cooldown.isCoolingDown;
  return (
    <Button variant={variant} size={size} onClick={handleExport} disabled={disabled} className="gap-1" rateLimitAware>
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : cooldown.isCoolingDown
          ? <Clock className="h-3.5 w-3.5" />
          : type === "excel" ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      {cooldown.isCoolingDown ? cooldown.label : (label || (type === "excel" ? "ملف إكسل" : "ملف للطباعة"))}
    </Button>
  );
}

interface MultiExportButtonProps {
  exports: Array<{
    endpoint: string;
    filename: string;
    type: "excel" | "pdf";
    label: string;
    params?: Record<string, string | undefined>;
  }>;
  label?: string;
}

export function MultiExportButton({ exports: exportItems, label = "تصدير" }: MultiExportButtonProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();
  const cooldown = useRateLimitCooldown();

  const handleExport = async (item: typeof exportItems[0]) => {
    setLoading(item.filename);
    try {
      const qs = item.params
        ? "?" + Object.entries(item.params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&")
        : "";
      const blob = await authFetchBlob(item.endpoint, qs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `تم تصدير ${item.filename}` });
    } catch (err: any) {
      if (!(err instanceof RateLimitError)) {
        toast({ variant: "destructive", title: "فشل التصدير", description: err.message });
      }
    } finally {
      setLoading(null);
    }
  };

  const triggerDisabled = !!loading || cooldown.isCoolingDown;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={triggerDisabled}>
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : cooldown.isCoolingDown
              ? <Clock className="h-3.5 w-3.5" />
              : <Download className="h-3.5 w-3.5" />}
          {cooldown.isCoolingDown ? cooldown.label : label}
          {!cooldown.isCoolingDown && <ChevronDown className="h-3 w-3" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {exportItems.map((item, i) => (
          <DropdownMenuItem key={i} onClick={() => handleExport(item)} className="gap-2">
            {item.type === "excel"
              ? <FileSpreadsheet className="h-4 w-4 text-green-600" />
              : <FileText className="h-4 w-4 text-red-600" />}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
