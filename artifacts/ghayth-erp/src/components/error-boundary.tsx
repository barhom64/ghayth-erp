import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "@/lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Route to the central observability boundary. Today this is a
    // structured console.error; when ops wires up Sentry (or another
    // vendor) the boundary above is the only file that has to change.
    captureException(error, {
      tags: { source: "react-error-boundary" },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-surface-subtle p-8" dir="rtl">
          <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">حدث خطأ غير متوقع</h1>
            <p className="text-muted-foreground mb-6">
              {this.state.error?.message || "يرجى إعادة تحميل الصفحة والمحاولة مجدداً"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
