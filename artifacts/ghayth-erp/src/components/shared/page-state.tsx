import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Ban,
  FileQuestion,
  Inbox,
  Lock,
  PlugZap,
  RefreshCw,
  WifiOff,
  Clock as ClockIcon,
} from "lucide-react";
import { ApiError } from "@/lib/api";

/**
 * Unified page state: loading / error / empty / content.
 *
 * Replaces 126+ instances of generic "حدث خطأ في تحميل البيانات" scattered
 * across list and detail pages. Reads the typed-error shape from `ApiError`
 * (P0.3) and picks the right icon, title, description and recovery action
 * for each error code — the user no longer sees the same generic message
 * regardless of what actually went wrong.
 *
 * Error kinds distinguished:
 *   - AUTH_MISSING / AUTH_EXPIRED / AUTH_INVALID  → "سجّل الدخول"
 *   - FORBIDDEN                                   → "صلاحيات غير كافية"
 *   - NOT_FOUND                                   → "السجل غير موجود"
 *   - VALIDATION_ERROR                            → "بيانات غير صالحة"
 *   - CONFLICT                                    → "لا يمكن تنفيذ العملية"
 *   - INTEGRATION_ERROR                           → "خدمة خارجية متعطّلة"
 *   - DB_UNAVAILABLE / TIMEOUT                    → "انقطع الاتصال"
 *   - network (TypeError)                         → "لا يوجد اتصال"
 *   - unknown                                     → "حدث خطأ غير متوقع"
 *
 * Usage:
 *   <PageStateWrapper
 *     isLoading={isLoading}
 *     error={error}
 *     isEmpty={data.length === 0}
 *     emptyText="لا توجد فواتير بعد"
 *     emptyAction={<Button>إنشاء فاتورة</Button>}
 *     onRetry={refetch}
 *   >
 *     <Table data={data} />
 *   </PageStateWrapper>
 */

interface PageStateWrapperProps {
  isLoading?: boolean;
  error?: Error | null | unknown;
  isEmpty?: boolean;
  emptyText?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  /** Text shown in the loading skeleton area. Defaults to "جاري التحميل...". */
  loadingText?: string;
  /** Render as compact (inline) instead of a full card. */
  compact?: boolean;
  children: ReactNode;
}

interface ErrorDescriptor {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "destructive" | "warning" | "info" | "muted";
  allowRetry: boolean;
  fix?: string;
  field?: string;
  code?: string;
  meta?: Record<string, unknown>;
}

function describeError(err: unknown): ErrorDescriptor {
  // ApiError (typed server response)
  if (err instanceof ApiError) {
    const code = err.code;
    const message = err.message;
    const fix = err.fix;
    const field = err.field;
    const meta = err.meta;

    switch (code) {
      case "AUTH_MISSING":
      case "AUTH_INVALID":
      case "AUTH_EXPIRED":
        return {
          title: "انتهت الجلسة",
          description: message || "يرجى تسجيل الدخول مجدداً",
          icon: Lock,
          tone: "warning",
          allowRetry: false,
          fix,
          code,
        };
      case "FORBIDDEN":
        return {
          title: "صلاحيات غير كافية",
          description: message || "لا تملك الصلاحية اللازمة لعرض هذه البيانات",
          icon: Ban,
          tone: "destructive",
          allowRetry: false,
          fix: fix || "تواصل مع مدير النظام لمنحك الصلاحية",
          code,
          meta,
        };
      case "NOT_FOUND":
        return {
          title: "السجل غير موجود",
          description: message || "لم نعثر على هذا العنصر — ربما تم حذفه",
          icon: FileQuestion,
          tone: "info",
          allowRetry: false,
          fix,
          code,
        };
      case "VALIDATION_ERROR":
        return {
          title: "بيانات غير صالحة",
          description: message,
          icon: AlertTriangle,
          tone: "warning",
          allowRetry: true,
          fix,
          field,
          code,
        };
      case "CONFLICT":
        return {
          title: "لا يمكن تنفيذ العملية الآن",
          description: message,
          icon: AlertTriangle,
          tone: "warning",
          allowRetry: true,
          fix,
          code,
          meta,
        };
      case "INTEGRATION_ERROR":
        return {
          title: "خدمة خارجية متعطّلة",
          description: message || "تعذّر الاتصال بالخدمة الخارجية — حاول لاحقاً",
          icon: PlugZap,
          tone: "destructive",
          allowRetry: true,
          fix,
          code,
        };
      case "DB_UNAVAILABLE":
        return {
          title: "انقطع الاتصال بقاعدة البيانات",
          description: message || "الخادم لا يستجيب — يعاد المحاولة تلقائياً",
          icon: WifiOff,
          tone: "destructive",
          allowRetry: true,
          code,
        };
      case "TIMEOUT":
        return {
          title: "انتهت مهلة الاستجابة",
          description: message || "استغرقت العملية وقتاً طويلاً — حاول مرة أخرى",
          icon: ClockIcon,
          tone: "warning",
          allowRetry: true,
          code,
        };
      default:
        return {
          title: "تعذّر تحميل البيانات",
          description: message || "حدث خطأ أثناء تحميل هذه الصفحة",
          icon: AlertTriangle,
          tone: "destructive",
          allowRetry: true,
          fix,
          code,
        };
    }
  }

  // Network error from apiFetch (TypeError wrapped in plain Error)
  if (err instanceof Error) {
    if (err.message.includes("انقطع الاتصال") || err.message.toLowerCase().includes("fetch")) {
      return {
        title: "لا يوجد اتصال بالإنترنت",
        description: err.message,
        icon: WifiOff,
        tone: "destructive",
        allowRetry: true,
      };
    }
    return {
      title: "حدث خطأ غير متوقع",
      description: err.message,
      icon: AlertTriangle,
      tone: "destructive",
      allowRetry: true,
    };
  }

  return {
    title: "حدث خطأ غير متوقع",
    description: "تعذّر تحميل البيانات — حاول مرة أخرى",
    icon: AlertTriangle,
    tone: "destructive",
    allowRetry: true,
  };
}

const TONE_CLS: Record<ErrorDescriptor["tone"], { bg: string; fg: string; border: string }> = {
  destructive: { bg: "bg-red-50", fg: "text-red-600", border: "border-red-100" },
  warning: { bg: "bg-amber-50", fg: "text-amber-600", border: "border-amber-100" },
  info: { bg: "bg-blue-50", fg: "text-blue-600", border: "border-blue-100" },
  muted: { bg: "bg-gray-50", fg: "text-gray-500", border: "border-gray-100" },
};

export function PageStateWrapper({
  isLoading,
  error,
  isEmpty,
  emptyText = "لا توجد بيانات",
  emptyHint,
  emptyAction,
  onRetry,
  loadingText = "جاري التحميل...",
  compact = false,
  children,
}: PageStateWrapperProps) {
  if (isLoading) {
    return (
      <div className={compact ? "py-6" : "py-12"} dir="rtl">
        <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-xs">{loadingText}</p>
        </div>
      </div>
    );
  }

  if (error) {
    const desc = describeError(error);
    const Icon = desc.icon;
    const tone = TONE_CLS[desc.tone];
    const blockers = Array.isArray(desc.meta?.blockers) ? (desc.meta!.blockers as unknown[]).filter(b => typeof b === "string") as string[] : [];

    const body = (
      <div className="flex flex-col items-center text-center gap-3" dir="rtl">
        <div className={`rounded-full p-3 ${tone.bg}`}>
          <Icon className={`h-7 w-7 ${tone.fg}`} />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <h3 className="text-base font-semibold text-gray-900">{desc.title}</h3>
            {desc.code && <Badge variant="outline" className="text-[10px] font-mono">{desc.code}</Badge>}
          </div>
          <p className="text-sm text-gray-600 max-w-lg">{desc.description}</p>
          {desc.field && (
            <p className="text-xs text-gray-500">
              الحقل: <code className="bg-gray-100 px-1 rounded">{desc.field}</code>
            </p>
          )}
          {desc.fix && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">الإصلاح:</span> {desc.fix}
            </p>
          )}
          {blockers.length > 0 && (
            <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5 mt-2">
              {blockers.slice(0, 5).map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2 pt-1">
          {desc.allowRetry && onRetry && (
            <Button onClick={onRetry} size="sm" variant="default">
              <RefreshCw className="h-4 w-4 ms-1" />
              إعادة المحاولة
            </Button>
          )}
          {(desc.code === "AUTH_MISSING" || desc.code === "AUTH_EXPIRED" || desc.code === "AUTH_INVALID") && (
            <Button
              onClick={() => { window.location.href = "/login"; }}
              size="sm"
              variant="default"
            >
              تسجيل الدخول
            </Button>
          )}
          {desc.code === "NOT_FOUND" && (
            <Button onClick={() => window.history.back()} size="sm" variant="outline">
              رجوع
            </Button>
          )}
        </div>
      </div>
    );

    if (compact) {
      return <div className="py-6">{body}</div>;
    }
    return (
      <Card className={`border ${tone.border}`}>
        <CardContent className="py-10">{body}</CardContent>
      </Card>
    );
  }

  if (isEmpty) {
    const body = (
      <div className="flex flex-col items-center text-center gap-3 py-8" dir="rtl">
        <div className="rounded-full p-3 bg-gray-50">
          <Inbox className="h-7 w-7 text-gray-400" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium text-gray-700">{emptyText}</h3>
          {emptyHint && <p className="text-xs text-gray-500 max-w-md">{emptyHint}</p>}
        </div>
        {emptyAction}
      </div>
    );
    if (compact) return body;
    return (
      <Card className="border-gray-100">
        <CardContent className="py-6">{body}</CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
