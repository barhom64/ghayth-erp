// ════════════════════════════════════════════════════════════════════════════
// PR-9 (#2077) — رفيق الميدان (Field Companion).
//
// Mobile-first PWA surface for the FIELD employee only. Doctrine:
//   • No new tracking engine — wraps the existing POST /hr/attendance/
//     field-ping (category-policy enforced + throttled server-side).
//   • Eligibility FIRST: GET /field-ping/eligibility runs before any
//     geolocation permission prompt. Office/manager/executive
//     categories (trackingFrequencySeconds=0) see a clear Arabic
//     message and the page never asks for location.
//   • Interval honours trackingFrequencySeconds from the policy —
//     no battery-draining free-running watch.
//   • Offline queue (localStorage, capped at 50) keeps the ORIGINAL
//     capturedAt; the server dedupes on (assignmentId, capturedAt) so
//     replays are idempotent.
//   • Stop button + auto-stop when the tab hides for > 30 min.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch, API_BASE } from "@/lib/api";
import {
  isNativeFieldTracking,
  startNativeFieldTracking,
  stopNativeFieldTracking,
} from "@/lib/field-tracking-native";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import {
  MapPin, Play, Square, WifiOff, CheckCircle2, AlertTriangle, Battery, Clock,
} from "lucide-react";

interface Eligibility {
  eligible: boolean;
  reason: string | null;
  trackingFrequencySeconds: number;
  categoryKey: string | null;
}

interface QueuedPing {
  lat: number; lng: number; accuracy?: number; speed?: number | null;
  heading?: number | null; altitude?: number | null; battery?: number | null;
  capturedAt: string; source: string;
}

const QUEUE_KEY = "ghayth_field_ping_queue";
const MAX_QUEUE = 50;

function readQueue(): QueuedPing[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}
function writeQueue(q: QueuedPing[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
}

export default function FieldCompanionPage() {
  const { data: elig, isLoading } = useApiQuery<Eligibility>(
    ["field-ping-eligibility"], "/my/field/eligibility",
  );

  const [running, setRunning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [queueLen, setQueueLen] = useState(readQueue().length);
  const [sentCount, setSentCount] = useState(0);
  // "native" = التتبع الخلفي الأصلي (Capacitor)؛ "browser" = مسار المتصفح
  // (Wake Lock، يتوقف عند قفل الشاشة)؛ null = متوقف.
  const [mode, setMode] = useState<"native" | "browser" | null>(null);
  const [hiddenWarning, setHiddenWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isNative = isNativeFieldTracking();

  const freq = elig?.trackingFrequencySeconds ?? 0;

  // ── Wake Lock: يمنع قفل الشاشة فيبقى JS حيًّا أطول في مسار المتصفح ──
  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as any;
      if (nav.wakeLock?.request) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch { /* مرفوض/غير مدعوم — يكمل التتبع لكن قد تُقفل الشاشة */ }
  }, []);
  const releaseWakeLock = useCallback(() => {
    try { wakeLockRef.current?.release?.(); } catch { /* ignore */ }
    wakeLockRef.current = null;
  }, []);

  // ── send one ping (or queue it when offline) ──────────────────────
  const sendPing = useCallback(async (p: QueuedPing): Promise<boolean> => {
    try {
      const resp = await apiFetch<{ accepted: boolean; reason?: string }>(
        "/my/field/ping",
        { method: "POST", body: JSON.stringify(p) },
      );
      // accepted:false covers throttled + duplicate — both are SUCCESS
      // from the client's perspective (the server made the call).
      setLastSent(new Date().toLocaleTimeString("ar-SA"));
      setLastError(null);
      if (resp.accepted) setSentCount((c) => c + 1);
      return true;
    } catch (err: any) {
      // 403 = policy says not tracked → stop the loop entirely.
      if (err?.code === "FORBIDDEN") {
        setLastError("فئتك لا تخضع للتتبع — تم إيقاف الإرسال");
        stopTracking();
        return true; // don't queue policy rejections
      }
      // Network/offline → queue with the ORIGINAL capturedAt.
      const q = readQueue();
      if (!q.some((x) => x.capturedAt === p.capturedAt)) {
        q.push(p);
        writeQueue(q);
        setQueueLen(readQueue().length);
      }
      setLastError("انقطاع بالاتصال — حُفظت النقطة وستُرسل عند عودة الشبكة");
      return false;
    }
  }, []);

  // ── flush the offline queue (called on reconnect + before each tick) ──
  const flushQueue = useCallback(async () => {
    let q = readQueue();
    if (q.length === 0) return;
    const remaining: QueuedPing[] = [];
    for (const p of q) {
      const okSent = await sendPing(p);
      if (!okSent) { remaining.push(p); }
    }
    writeQueue(remaining);
    setQueueLen(remaining.length);
  }, [sendPing]);

  // ── one capture-and-send tick ─────────────────────────────────────
  const tick = useCallback(() => {
    if (!navigator.geolocation) {
      setLastError("هذا الجهاز لا يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPermissionDenied(false);
        const battery = (navigator as any).getBattery
          ? Math.round(((await (navigator as any).getBattery()).level ?? 0) * 100)
          : null;
        const ping: QueuedPing = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          altitude: pos.coords.altitude,
          battery,
          capturedAt: new Date(pos.timestamp).toISOString(),
          source: "mobile",
        };
        await flushQueue();
        await sendPing(ping);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setLastError("تم رفض إذن الموقع — فعِّل إذن الموقع من إعدادات المتصفح ثم أعد المحاولة");
          stopTracking();
        } else {
          setLastError(`تعذّر تحديد الموقع: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }, [flushQueue, sendPing]);

  const startTracking = useCallback(async () => {
    if (!elig?.eligible || freq <= 0) return;

    // ── المسار الأصلي (Capacitor): تتبع خلفي حقيقي والتطبيق مقفول ──
    if (isNative) {
      try {
        const { token } = await apiFetch<{ token: string }>(
          "/my/field/tracking-token", { method: "POST" },
        );
        // Use the single native-aware origin (API_BASE) so the plugin posts
        // to the real server, not the app bundle origin (https://localhost).
        const apiOrigin = API_BASE;
        const started = await startNativeFieldTracking({
          token,
          apiOrigin,
          onSent: () => { setLastSent(new Date().toLocaleTimeString("ar-SA")); setSentCount((c) => c + 1); setLastError(null); },
          onError: (m) => setLastError(m),
        });
        if (started) { setRunning(true); setMode("native"); return; }
      } catch (err: any) {
        if (err?.code === "FORBIDDEN") { setLastError("فئتك لا تخضع للتتبع — تم الإيقاف"); return; }
        // فشل بدء الأصلي → اسقط إلى مسار المتصفح.
      }
    }

    // ── مسار المتصفح: Wake Lock يبقي الشاشة/JS حيًّا + التقاط دوري ──
    setRunning(true);
    setMode("browser");
    await acquireWakeLock();
    tick(); // immediate first capture
    timerRef.current = setInterval(tick, freq * 1000);
  }, [elig, freq, tick, isNative, acquireWakeLock]);

  const stopTracking = useCallback(() => {
    setRunning(false);
    setHiddenWarning(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    releaseWakeLock();
    if (mode === "native") { stopNativeFieldTracking().catch(() => {}); }
    setMode(null);
  }, [mode, releaseWakeLock]);

  // Flush the queue automatically when connectivity returns.
  useEffect(() => {
    const onOnline = () => { flushQueue(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushQueue]);

  // مسار المتصفح فقط: حذّر عند إخفاء الصفحة (التتبع سيتوقف)، وأعد طلب
  // Wake Lock عند العودة (المتصفح يحرّره تلقائيًا عند الإخفاء). الأصلي لا
  // يتأثر — يكمل في الخلفية.
  useEffect(() => {
    if (!running || mode !== "browser") return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setHiddenWarning(true);
      } else {
        setHiddenWarning(false);
        acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running, mode, acquireWakeLock]);

  // Stop on unmount — never leave a timer / wake-lock / native watcher running.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    releaseWakeLock();
    stopNativeFieldTracking().catch(() => {});
  }, [releaseWakeLock]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <PageShell
      title="رفيق الميدان"
      subtitle="إرسال نقاط الموقع حسب سياسة فئتك — للموظفين الميدانيين فقط"
      breadcrumbs={[{ href: "/my-space", label: "مساحاتي" }, { label: "رفيق الميدان" }]}
      data-testid="field-companion"
    >
      <div className="max-w-md mx-auto space-y-3">
        {/* Eligibility banner — the page NEVER asks for location when
            the category isn't tracked. */}
        {!elig?.eligible ? (
          <Card data-testid="not-eligible-banner">
            <CardContent className="p-5 text-center space-y-2">
              <MapPin className="h-10 w-10 mx-auto opacity-30" />
              <p className="font-semibold">فئتك لا تخضع للتتبع الميداني</p>
              <p className="text-sm text-muted-foreground">
                التتبع مفعَّل فقط للفئات الميدانية (سائق، ميداني، …) حسب سياسة الحضور.
                {elig?.categoryKey ? ` فئتك الحالية: «${elig.categoryKey}».` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                لا حاجة لأي إذن موقع — لن يُرسَل أي شيء من جهازك.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Status card */}
            <Card data-testid="tracking-status-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                    <span className="font-semibold">{running ? "التتبع نشط" : "التتبع متوقف"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {running && (
                      <Badge variant={mode === "native" ? "default" : "secondary"} className="gap-1" data-testid="tracking-mode">
                        {mode === "native" ? "خلفي (تطبيق)" : "يتطلب شاشة مفتوحة"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      كل {freq} ثانية
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-surface-subtle rounded p-2">
                    <p className="text-xs text-muted-foreground">آخر إرسال ناجح</p>
                    <p className="font-mono font-semibold" data-testid="last-sent">{lastSent ?? "—"}</p>
                  </div>
                  <div className="bg-surface-subtle rounded p-2">
                    <p className="text-xs text-muted-foreground">نقاط مُرسلة</p>
                    <p className="font-mono font-semibold" data-testid="sent-count">{sentCount}</p>
                  </div>
                </div>
                {queueLen > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm" data-testid="offline-queue-banner">
                    <WifiOff className="h-4 w-4 shrink-0" />
                    <span>{queueLen} نقطة بانتظار الإرسال (ستُرسل تلقائيًا عند عودة الاتصال)</span>
                  </div>
                )}
                {hiddenWarning && (
                  <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm" data-testid="hidden-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>التتبع قد يتوقف وأنت خارج هذه الصفحة. أبقِ الشاشة مفتوحة على هذه الصفحة، أو استخدم تطبيق غيث للجوال للتتبع في الخلفية.</span>
                  </div>
                )}
                {lastError && (
                  <div className="flex items-start gap-2 p-2 rounded bg-status-error-surface text-status-error-foreground text-sm" data-testid="error-banner">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{lastError}</span>
                  </div>
                )}
                {permissionDenied && (
                  <div className="text-xs text-muted-foreground p-2 border rounded" data-testid="permission-help">
                    لتفعيل الإذن: افتح إعدادات المتصفح ← الموقع ← اسمح لهذا الموقع، ثم اضغط «بدء التتبع» مجددًا.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Start/stop — the ONLY control. No free-running watch. */}
            {running ? (
              <Button onClick={stopTracking} variant="destructive" className="w-full h-12 text-base gap-2" data-testid="stop-btn">
                <Square className="h-5 w-5" /> إيقاف التتبع
              </Button>
            ) : (
              <Button onClick={() => { void startTracking(); }} className="w-full h-12 text-base gap-2" data-testid="start-btn">
                <Play className="h-5 w-5" /> بدء التتبع
              </Button>
            )}

            <p className="text-xs text-muted-foreground text-center px-4">
              يُرسَل موقعك فقط أثناء تشغيل التتبع وبالفاصل المحدد في سياسة فئتك
              ({elig?.categoryKey ?? "—"}). أوقفه عند نهاية الدوام أو المهمة.
              {isNative
                ? " يعمل في الخلفية حتى مع قفل الشاشة."
                : " في المتصفح يتطلب إبقاء الشاشة مفتوحة — للتتبع الخلفي استخدم تطبيق غيث للجوال."}
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
