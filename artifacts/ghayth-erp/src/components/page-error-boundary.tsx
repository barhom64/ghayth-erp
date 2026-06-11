import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * PageErrorBoundary — P0.5 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The existing <ErrorBoundary> at the root of App.tsx catches anything that
 * bubbles through to the top and shows a full-screen fallback. That's the
 * right behaviour for a truly broken app, but it's wrong for a single page
 * that hit a 403 / 404 / 422 / 500 — crashing the entire shell for a
 * single page's data failure is disorienting and loses the sidebar context.
 *
 * This boundary is meant to wrap each <PageShell> body (coming in P1.1):
 *
 *   <PageShell title="الموظفون">
 *     <PageErrorBoundary>
 *       <EmployeesList />   // throws? the shell stays, only the body swaps
 *     </PageErrorBoundary>
 *   </PageShell>
 *
 * It is aware of the P0.3 typed error shape — if `err.code` matches one of
 * our known codes (VALIDATION_ERROR / NOT_FOUND / CONFLICT / FORBIDDEN /
 * INTEGRATION_ERROR) the fallback adapts:
 *   - NOT_FOUND       → "هذا المورد غير متاح" + Back/Home, no retry
 *   - FORBIDDEN       → "غير مصرح بالوصول" + Home, no retry
 *   - VALIDATION/CONFLICT → retry + message + optional field + fix hint
 *   - INTEGRATION     → "خدمة خارجية متعطّلة" + retry
 *   - fallback        → generic "حدث خطأ" with retry
 *
 * Stack traces are only rendered in dev mode. The reset key resets the
 * boundary so after a retry the children re-mount fresh.
 */

interface Props {
  /** Children to render when no error. */
  children: ReactNode;
  /** Optional custom fallback — receives `error` and `reset` callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /**
   * Optional key — changing this forces the boundary to reset (useful when
   * navigating between route params).
   */
  resetKey?: string | number;
  /** Called once when an error is caught, before the fallback renders. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reloading: boolean;
}

/**
 * Detect a stale-deploy chunk-load failure. When a new build is deployed the old
 * hashed chunk files are purged, so a browser holding a stale index.html 404s on
 * `React.lazy(() => import(...))` and the rejection bubbles to this boundary.
 */
function isChunkLoadError(err: Error | null): boolean {
  if (!err) return false;
  const msg = `${err.message || ""} ${(err as any).name || ""}`;
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module|ChunkLoadError/i.test(
    msg,
  );
}

/**
 * Force a one-time full reload to fetch the fresh index.html + chunk graph. The
 * timestamp guard prevents a reload loop if a chunk is genuinely missing while
 * still recovering on each later deploy. Returns true if a reload was triggered.
 */
function tryChunkReload(): boolean {
  try {
    const KEY = "erp:chunk-reload-at";
    const last = Number(sessionStorage.getItem(KEY) || "0");
    if (Date.now() - last < 10000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

interface ServerErrorShape {
  error?: string;
  code?: string;
  field?: string;
  fix?: string;
  status?: number;
  meta?: Record<string, unknown>;
}

/**
 * Extract the server-side typed error shape from a thrown error, if the
 * `useApiQuery` / `useApiMutation` layer attached it as `.response` or `.data`.
 * Returns null if the error is a plain JS error (component crash, etc.).
 */
function extractServerError(err: Error): ServerErrorShape | null {
  const any = err as any;
  // useApiQuery attaches the parsed JSON response under `.response`
  if (any.response && typeof any.response === "object") {
    return any.response as ServerErrorShape;
  }
  // Some layers put it under `.data`
  if (any.data && typeof any.data === "object") {
    return any.data as ServerErrorShape;
  }
  return null;
}

function codeToTitle(code?: string): string {
  switch (code) {
    case "NOT_FOUND":
      return "السجل غير موجود";
    case "FORBIDDEN":
      return "غير مصرح بالوصول";
    case "VALIDATION_ERROR":
      return "بيانات غير صالحة";
    case "CONFLICT":
      return "تعارض في الحالة";
    case "INTEGRATION_ERROR":
      return "خدمة خارجية متعطّلة";
    default:
      return "حدث خطأ أثناء تحميل هذه الصفحة";
  }
}

function codeAllowsRetry(code?: string): boolean {
  // Retrying a 404 or 403 will just fail the same way; hide the button for
  // those cases so the user is nudged toward Back / Home.
  return code !== "NOT_FOUND" && code !== "FORBIDDEN";
}

function codeBadgeVariant(code?: string): "default" | "destructive" | "outline" | "secondary" {
  switch (code) {
    case "FORBIDDEN":
    case "INTEGRATION_ERROR":
      return "destructive";
    case "NOT_FOUND":
      return "outline";
    default:
      return "secondary";
  }
}

export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reloading: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isChunkLoadError(error)) {
      // Stale-deploy: a lazy chunk 404'd after a new build. Reload once to pull
      // the fresh assets instead of showing a dead-end error card.
      if (tryChunkReload()) return;
      // Already reloaded very recently → fall through to the manual error UI.
      this.setState({ reloading: false });
    }
    console.error("[PageErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: Props): void {
    // Resetting via key change — if the parent passes a new resetKey the
    // boundary clears itself so the children re-mount fresh. Route param
    // changes are the most common trigger.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, reloading: false });
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, reloading: false });
  };

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    // Stale-deploy chunk error: a reload is in flight — show a minimal placeholder
    // rather than the dead-end error card.
    if (this.state.reloading) {
      return (
        <div className="p-6 text-center text-sm text-muted-foreground" dir="rtl">
          جاري تحديث الصفحة لتحميل أحدث إصدار…
        </div>
      );
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    const err = this.state.error;
    const isChunk = isChunkLoadError(err);
    const serverShape = extractServerError(err);
    const code = serverShape?.code;
    const title = isChunk ? "صدر تحديث جديد للنظام" : codeToTitle(code);
    const message = isChunk
      ? "تم نشر إصدار محدّث. أعد تحميل الصفحة للحصول على آخر نسخة."
      : serverShape?.error ?? err.message ?? "حدث خطأ غير متوقع";
    const field = isChunk ? undefined : serverShape?.field;
    const fix = isChunk ? undefined : serverShape?.fix;
    const canRetry = isChunk || codeAllowsRetry(code);
    const isDev = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

    return (
      <div className="p-6" dir="rtl">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-full bg-status-error-surface p-2">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                  {code && <Badge variant={codeBadgeVariant(code)}>{code}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{message}</p>
                {field && (
                  <p className="text-xs text-muted-foreground">
                    الحقل: <code className="bg-gray-100 px-1 rounded">{field}</code>
                  </p>
                )}
                {fix && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">إصلاح مقترح:</span> {fix}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              {canRetry && (
                <Button
                  onClick={isChunk ? () => window.location.reload() : this.reset}
                  size="sm"
                  variant="default"
                >
                  <RefreshCw className="h-4 w-4 ms-1" />
                  {isChunk ? "إعادة تحميل" : "إعادة المحاولة"}
                </Button>
              )}
              <Button
                onClick={() => window.history.back()}
                size="sm"
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 ms-1" />
                رجوع
              </Button>
              <Button
                onClick={() => { window.location.href = "/"; }}
                size="sm"
                variant="ghost"
              >
                <Home className="h-4 w-4 ms-1" />
                الرئيسية
              </Button>
            </div>

            {isDev && err.stack && (
              <details className="text-xs text-muted-foreground mt-2">
                <summary className="cursor-pointer select-none">عرض تفاصيل المطور</summary>
                <pre className="mt-2 p-2 bg-surface-subtle rounded overflow-auto text-[10px] leading-tight">
                  {err.stack}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
}
