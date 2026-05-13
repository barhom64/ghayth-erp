/**
 * PrintButton — unified Print Engine v2 trigger.
 *
 *   <PrintButton entityType="invoice" entityId={42} />
 *
 * Replaces the per-page `EntityPrintButton sections={[...]}` pattern. The
 * server is the source of truth for layout: the button POSTs to
 * /api/print/render, the response is a base64 HTML payload that we drop into
 * an iframe, and the iframe's onload triggers the native browser print.
 *
 * Supports multiple formats via a small dropdown when the backend reports the
 * entity has more than one allowed format.
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, ChevronDown, Download, FileSpreadsheet, FileText, Receipt, Tag } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PrintFormat = "a4" | "thermal_80" | "thermal_58" | "label" | "excel";

interface RenderResponse {
  jobId: string | null;
  format: PrintFormat;
  mime: string;
  filename: string;
  copyNumber: number;
  isReprint: boolean;
  watermark?: string | null;
  base64: string;
}

const FORMAT_LABEL: Record<PrintFormat, string> = {
  a4: "طباعة A4",
  thermal_80: "إيصال حراري 80mm",
  thermal_58: "إيصال حراري 58mm",
  label: "ملصق / باركود",
  excel: "تصدير Excel",
};

const FORMAT_ICON: Record<PrintFormat, React.ReactNode> = {
  a4: <FileText className="h-4 w-4" />,
  thermal_80: <Receipt className="h-4 w-4" />,
  thermal_58: <Receipt className="h-4 w-4" />,
  label: <Tag className="h-4 w-4" />,
  excel: <FileSpreadsheet className="h-4 w-4" />,
};

interface PrintButtonProps {
  entityType: string;
  entityId: string | number;
  /** Formats supported. If omitted, only A4 is shown. */
  formats?: PrintFormat[];
  /** Default format on click of the main button. */
  defaultFormat?: PrintFormat;
  /** Button label override. */
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  /** Force download instead of in-browser print dialog. */
  download?: boolean;
}

export function PrintButton({
  entityType,
  entityId,
  formats = ["a4"],
  defaultFormat,
  label = "طباعة",
  variant = "outline",
  size = "sm",
  download = false,
}: PrintButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const primary: PrintFormat = defaultFormat ?? formats[0] ?? "a4";

  async function run(format: PrintFormat) {
    setLoading(true);
    try {
      const resp = await apiFetch<RenderResponse>(`/print/render`, {
        method: "POST",
        body: JSON.stringify({ entityType, entityId: String(entityId), format }),
      });
      const bytes = base64ToUint8Array(resp.base64);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: resp.mime });
      const url = URL.createObjectURL(blob);

      if (format === "excel" || download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = resp.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        // HTML — open in iframe so the embedded auto-print script runs.
        if (!iframeRef.current) {
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.right = "-10000px";
          iframe.style.top = "0";
          iframe.style.width = "1px";
          iframe.style.height = "1px";
          iframe.style.border = "0";
          document.body.appendChild(iframe);
          iframeRef.current = iframe;
        }
        iframeRef.current.src = url;
      }
      if (resp.isReprint) {
        toast({
          title: "نسخة مكررة",
          description: `هذه النسخة رقم ${resp.copyNumber} — تم ختمها بـ "نسخة مكررة"`,
        });
      }
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 409) {
        toast({
          title: "يلزم موافقة لإعادة الطباعة",
          description: "تم تسجيل طلب إعادة الطباعة. يحتاج موافقة المدير قبل إصدار النسخة.",
          variant: "destructive",
        });
        // Auto-create a reprint request
        try {
          await apiFetch(`/print/reprint-requests`, {
            method: "POST",
            body: JSON.stringify({
              entityType,
              entityId: String(entityId),
              reason: "طلب إعادة طباعة تلقائي من زر الطباعة",
            }),
          });
        } catch {
          /* ignore */
        }
      } else if (e.status === 403) {
        toast({
          title: "غير مصرح",
          description: "لا تملك صلاحية طباعة هذه الوثيقة.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "فشلت الطباعة",
          description: e.message || "حدث خطأ غير متوقع.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    return () => {
      if (iframeRef.current) {
        iframeRef.current.remove();
        iframeRef.current = null;
      }
    };
  }, []);

  if (formats.length <= 1) {
    return (
      <Button variant={variant} size={size} onClick={() => run(primary)} disabled={loading} className="gap-1">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {label}
      </Button>
    );
  }

  return (
    <div className="flex">
      <Button variant={variant} size={size} onClick={() => run(primary)} disabled={loading} className="gap-1 rounded-l-none">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : FORMAT_ICON[primary]}
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size} className="px-1.5 rounded-r-none border-r-0">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {formats.map((f) => (
            <DropdownMenuItem key={f} onClick={() => run(f)} className="gap-2">
              {FORMAT_ICON[f]}
              <span>{FORMAT_LABEL[f]}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => run(primary)} className="gap-2 border-t mt-1 pt-2">
            <Download className="h-4 w-4" />
            <span>تنزيل</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
