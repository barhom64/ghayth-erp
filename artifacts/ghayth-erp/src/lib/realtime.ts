// ════════════════════════════════════════════════════════════════════════════
// realtime — live server→client push (SSE) so the UI updates without a manual
// refresh. The server pushes a tiny frame whenever anything changes in the
// user's company; we invalidate the react-query caches so active screens
// refetch and the change "jumps" in — web and native app stay live-linked.
//
// Auth: EventSource can't set headers, so on native we append the Bearer
// token as `?access_token=` (no cookies in the WebView); on web the
// same-origin cookie is sent automatically (withCredentials).
//
// Resilience: EventSource auto-reconnects (the server sends `retry:`). If the
// browser/WebView lacks EventSource the app simply falls back to normal
// fetch-on-focus — realtime is an enhancement, never a hard dependency.
// ════════════════════════════════════════════════════════════════════════════
import type { QueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import { isNativeAuth, getNativeAccessToken } from "@/lib/native-auth";

let source: EventSource | null = null;
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Open the realtime stream and wire incoming change-events to react-query
 * invalidation. Idempotent — a second call while connected is a no-op.
 * Returns a disconnect function.
 */
export function connectRealtime(queryClient: QueryClient): () => void {
  if (typeof EventSource === "undefined") return () => {};
  // e2e builds set VITE_DISABLE_REALTIME=1: a persistent SSE connection keeps
  // the network perpetually active so Playwright's waitForLoadState("networkidle")
  // never resolves. Realtime is a pure enhancement (own unit coverage), so the
  // test build simply skips it.
  if (import.meta.env.VITE_DISABLE_REALTIME === "1") return () => {};
  if (source) return disconnectRealtime;

  let url = `${API_BASE}/api/realtime/stream`;
  if (isNativeAuth()) {
    const t = getNativeAccessToken();
    if (t) url += `?access_token=${encodeURIComponent(t)}`;
  }

  try {
    source = new EventSource(url, { withCredentials: true });
  } catch {
    source = null;
    return () => {};
  }

  source.onmessage = (ev) => {
    let data: any;
    try { data = JSON.parse(ev.data); } catch { return; }
    if (!data || data.type !== "event") return;
    // Debounce: a single action often emits several events. Collect them for a
    // beat, then invalidate once so active screens refetch the latest data.
    if (invalidateTimer) clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => {
      queryClient.invalidateQueries();
    }, 400);
  };

  // onerror: EventSource reconnects itself per the server's `retry:` hint —
  // nothing to do but let it. (A hard auth failure just keeps retrying; the
  // app still works via fetch-on-focus.)
  source.onerror = () => { /* auto-reconnect */ };

  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  if (invalidateTimer) { clearTimeout(invalidateTimer); invalidateTimer = null; }
  if (source) { source.close(); source = null; }
}
