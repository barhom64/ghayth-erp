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
// Reconnect (the native gotcha): the access token is 15 minutes and is baked
// into the EventSource URL. EventSource's BUILT-IN reconnect would reuse that
// same (expired) URL and 401 forever. So we manage reconnection ourselves:
// on error we close, refresh the native token (via the same de-duped path
// apiFetch uses), and reopen with a fresh token — with capped backoff. On the
// web the cookie is refreshed by apiFetch's own 401 flow, so a plain reopen
// suffices. If EventSource is unavailable the app simply falls back to
// fetch-on-focus — realtime is an enhancement, never a hard dependency.
// ════════════════════════════════════════════════════════════════════════════
import type { QueryClient } from "@tanstack/react-query";
import { API_BASE, refreshNativeTokenOnce } from "@/lib/api";
import { isNativeAuth, getNativeAccessToken } from "@/lib/native-auth";

let source: EventSource | null = null;
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 3000;
const MAX_BACKOFF_MS = 30_000;
let stopped = false;

function buildUrl(): string {
  let url = `${API_BASE}/api/realtime/stream`;
  if (isNativeAuth()) {
    const t = getNativeAccessToken();
    if (t) url += `?access_token=${encodeURIComponent(t)}`;
  }
  return url;
}

function open(queryClient: QueryClient): void {
  if (stopped) return;
  try {
    source = new EventSource(buildUrl(), { withCredentials: true });
  } catch {
    source = null;
    return;
  }

  source.onopen = () => { backoffMs = 3000; }; // healthy connection → reset backoff

  source.onmessage = (ev) => {
    let data: any;
    try { data = JSON.parse(ev.data); } catch { return; }
    if (!data || data.type !== "event") return;
    // Debounce: one action often emits several events. Collect for a beat,
    // then invalidate once. react-query refetches only ACTIVE (mounted)
    // queries by default, so idle screens don't thrash the network/battery.
    if (invalidateTimer) clearTimeout(invalidateTimer);
    invalidateTimer = setTimeout(() => { queryClient.invalidateQueries(); }, 400);
  };

  source.onerror = () => {
    // Take over reconnection: close, refresh the (native) token, reopen with a
    // fresh URL after a capped backoff. Prevents the expired-token-in-URL
    // death-loop on native.
    if (source) { source.close(); source = null; }
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      try { await refreshNativeTokenOnce(); } catch { /* reopen anyway */ }
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      open(queryClient);
    }, backoffMs);
  };
}

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
  if (source || reconnectTimer) return disconnectRealtime;
  stopped = false;
  backoffMs = 3000;
  open(queryClient);
  return disconnectRealtime;
}

export function disconnectRealtime(): void {
  stopped = true;
  if (invalidateTimer) { clearTimeout(invalidateTimer); invalidateTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (source) { source.close(); source = null; }
}
