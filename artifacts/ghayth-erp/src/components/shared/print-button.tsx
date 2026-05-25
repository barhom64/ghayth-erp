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

import { useState } from "react";
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

  const primary: PrintFormat = defaultFormat ?? formats[0] ?? "a4";

  // Guard: if the page passed us a placeholder id (0, undefined, empty string),
  // the entity hasn't loaded yet — clicking would either 400 from the server or
  // print an empty document. Better to disable the button so the user can't
  // even try, with a tooltip explaining why.
  const hasRealId =
    entityId !== undefined &&
    entityId !== null &&
    entityId !== "" &&
    entityId !== 0 &&
    entityId !== "0";

  async function run(format: PrintFormat) {
    if (!hasRealId) {
      toast({
        title: "الوثيقة غير محمّلة",
        description: "يرجى الانتظار حتى يكتمل تحميل البيانات قبل الطباعة.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    // Open the preview window synchronously *before* awaiting the API call so
    // browsers don't treat it as a popup (popup blockers permit windows opened
    // directly from user gesture handlers). For downloads we don't need a
    // window at all.
    const previewWindow =
      format === "excel" || download ? null : window.open("", "_blank");

    if (previewWindow && !download && format !== "excel") {
      // Friendly loading screen until the bytes arrive — beats the user
      // staring at an empty about:blank tab.
      previewWindow.document.write(
        `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><title>جارٍ تجهيز الطباعة…</title></head><body style="font-family:Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#475569"><div style="text-align:center"><div style="font-size:18pt">جارٍ تجهيز المعاينة…</div><div style="margin-top:8px;font-size:11pt;color:#94a3b8">يرجى الانتظار قليلاً</div></div></body></html>`
      );
    }

    try {
      const resp = await apiFetch<RenderResponse>(`/print/render`, {
        method: "POST",
        body: JSON.stringify({ entityType, entityId: String(entityId), format }),
      });

      if (format === "excel" || download) {
        // Binary downloads stay on the current tab.
        const bytes = base64ToUint8Array(resp.base64);
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: resp.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = resp.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        // HTML preview goes into the pre-opened window. document.write() lets
        // the embedded auto-print script run in the same-origin context the
        // window inherited from this page — blob:// iframes were getting
        // blocked from calling window.print() in Chrome/Firefox.
        const html = atob(resp.base64);
        if (previewWindow) {
          previewWindow.document.open();
          previewWindow.document.write(html);
          previewWindow.document.close();
          previewWindow.focus();
        } else {
          // Popup blocker stopped us — fall back to a Blob link click so the
          // user can at least see the document. They'll need to print manually.
          const bytes = base64ToUint8Array(resp.base64);
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: resp.mime });
          const url = URL.createObjectURL(blob);
          window.location.href = url;
        }
      }
      if (resp.isReprint) {
        toast({
          title: "نسخة مكررة",
          description: `هذه النسخة رقم ${resp.copyNumber} — تم ختمها بـ "نسخة مكررة"`,
        });
      }
    } catch (err) {
      // The preview window is still showing "جارٍ تجهيز…" — close it so the
      // user gets the toast instead of staring at the loading screen.
      if (previewWindow && !previewWindow.closed) previewWindow.close();
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
        // eslint-disable-next-line no-console
        console.error("[PrintButton] forbidden", { msg: e.message, entityType, entityId });
        toast({
          title: "غير مصرح",
          description: e.message || "لا تملك صلاحية طباعة هذه الوثيقة.",
          variant: "destructive",
        });
      } else {
        // Surface the actual server message + status so support tickets can
        // pin down the real cause. Console.error too — anyone diagnosing
        // "the print button doesn't work" can paste the browser-console line
        // straight into a bug report.
        const status = e.status ?? "?";
        const code = e.code ?? "";
        const msg = e.message || "حدث خطأ غير متوقع.";
        // eslint-disable-next-line no-console
        console.error("[PrintButton] render failed", { status, code, msg, entityType, entityId });
        toast({
          title: `فشلت الطباعة (${status}${code ? ` · ${code}` : ""})`,
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (formats.length <= 1) {
    return (
      <Button variant={variant} size={size} onClick={() => run(primary)} disabled={loading || !hasRealId} title={!hasRealId ? "الوثيقة غير محمّلة بعد" : undefined} className="gap-1">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
        {label}
      </Button>
    );
  }

  return (
    <div className="flex">
      <Button variant={variant} size={size} onClick={() => run(primary)} disabled={loading || !hasRealId} title={!hasRealId ? "الوثيقة غير محمّلة بعد" : undefined} className="gap-1 rounded-l-none">
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
