import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, X } from "lucide-react";

interface SystemHealth {
  services?: {
    redisRateLimit?: string;
  };
}

interface ErpUser {
  id?: number;
  userRoles?: { roleKey: string }[];
}

const STORAGE_KEY = "careers_ratelimit_fallback_dismissed_at";
const DISMISS_TTL_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;
const ROLE_STALE_MS = 5 * 60 * 1000;
const SYSTEM_STATUS_URL = "/admin/monitoring";

async function fetchErpUser(): Promise<ErpUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchSystemHealth(): Promise<SystemHealth | null> {
  const res = await fetch("/api/admin/system-health", {
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isAdminLike(user: ErpUser | null | undefined): boolean {
  if (!user?.userRoles) return false;
  return user.userRoles.some(
    (r) => r.roleKey === "owner" || r.roleKey === "general_manager",
  );
}

export function RateLimitFallbackBanner() {
  const { data: erpUser } = useQuery<ErpUser | null>({
    queryKey: ["careers", "erp-auth-me", "ratelimit-banner"],
    queryFn: fetchErpUser,
    retry: false,
    staleTime: ROLE_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const allowed = isAdminLike(erpUser);

  const { data } = useQuery<SystemHealth | null>({
    queryKey: ["careers", "admin", "system-health", "ratelimit-banner"],
    queryFn: fetchSystemHealth,
    enabled: allowed,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: POLL_INTERVAL_MS,
  });

  const status = data?.services?.redisRateLimit;
  const isFallback = status === "fallback-memory";

  const [dismissedAt, setDismissedAt] = useState<number | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? Number(raw) || null : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!isFallback && dismissedAt !== null) {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setDismissedAt(null);
    }
  }, [isFallback, dismissedAt]);

  if (!allowed || !isFallback) return null;

  if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
    return null;
  }

  const handleDismiss = () => {
    const now = Date.now();
    try {
      sessionStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      /* ignore */
    }
    setDismissedAt(now);
  };

  return (
    <div className="mx-4 lg:mx-8 mt-3" role="alert" data-testid="banner-ratelimit-fallback">
      <a
        href={SYSTEM_STATUS_URL}
        target="_blank"
        rel="noopener noreferrer"
        dir="rtl"
        className="block bg-amber-50 border border-amber-300 rounded-lg p-3 cursor-pointer hover:bg-amber-100 hover:border-amber-400 transition-colors"
        data-testid="link-open-system-health"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                تنبيه تشغيلي
              </span>
            </div>
            <p className="text-sm font-medium text-amber-900">
              حدود الطلبات تعمل حالياً بالذاكرة المحلية فقط (تعذّر الاتصال بـ Redis)
            </p>
            <p className="text-xs text-amber-800 mt-1">
              لا تزال الحدود مُطبَّقة، لكنها تُحسب لكل خادم على حدة. يُرجى مراجعة حالة Redis في
              <span className="font-semibold"> صفحة حالة النظام </span>
              في أقرب وقت. سيختفي هذا التنبيه تلقائياً عند عودة الاتصال.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-900 underline decoration-amber-400 underline-offset-2">
              <ExternalLink className="h-3.5 w-3.5" />
              افتح صفحة حالة النظام
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDismiss();
            }}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0"
            aria-label="إخفاء التنبيه"
            data-testid="button-dismiss-ratelimit-banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </a>
    </div>
  );
}
