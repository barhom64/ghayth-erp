import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function authFetchBlob(endpoint: string, qs: string = ""): Promise<Blob> {
  const token = localStorage.getItem("erp_token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const response = await fetch(`${BASE}/api${endpoint}${qs}`, { headers, credentials: "include" });
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
      toast({ variant: "destructive", title: "فشل التصدير", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleExport} disabled={loading} className="gap-1">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : type === "excel" ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      {label || (type === "excel" ? "Excel" : "PDF")}
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
      toast({ variant: "destructive", title: "فشل التصدير", description: err.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1" disabled={!!loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" dir="rtl">
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
