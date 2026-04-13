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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[PageErrorBoundary]", error, info);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: Props): void {
    // Resetting via key change — if the parent passes a new resetKey the
    // boundary clears itself so the children re-mount fresh. Route param
    // changes are the most common trigger.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    const err = this.state.error;
    const serverShape = extractServerError(err);
    const code = serverShape?.code;
    const title = codeToTitle(code);
    const message = serverShape?.error ?? err.message ?? "حدث خطأ غير متوقع";
    const field = serverShape?.field;
    const fix = serverShape?.fix;
    const canRetry = codeAllowsRetry(code);
    const isDev = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

    return (
      <div className="p-6" dir="rtl">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-full bg-red-50 p-2">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                  {code && <Badge variant={codeBadgeVariant(code)}>{code}</Badge>}
                </div>
                <p className="text-sm text-gray-600">{message}</p>
                {field && (
                  <p className="text-xs text-gray-500">
                    الحقل: <code className="bg-gray-100 px-1 rounded">{field}</code>
                  </p>
                )}
                {fix && (
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">إصلاح مقترح:</span> {fix}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t">
              {canRetry && (
                <Button onClick={this.reset} size="sm" variant="default">
                  <RefreshCw className="h-4 w-4 ms-1" />
                  إعادة المحاولة
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
              <details className="text-xs text-gray-500 mt-2">
                <summary className="cursor-pointer select-none">عرض تفاصيل المطور</summary>
                <pre className="mt-2 p-2 bg-gray-50 rounded overflow-auto text-[10px] leading-tight">
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
