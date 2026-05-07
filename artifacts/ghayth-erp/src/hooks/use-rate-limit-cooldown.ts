import { useEffect, useState } from "react";
import {
  subscribeRateLimitCooldown,
  getRateLimitCooldownUntil,
} from "@/lib/rate-limit-toast";

/**
 * Live retry countdown — Task #155.
 *
 * When the API replies with `429 Too Many Requests`, `notifyRateLimited`
 * stores the absolute "may-retry-at" timestamp and broadcasts it. This
 * hook subscribes to that broadcast and exposes a ticking remaining-
 * seconds value so action buttons (login, save, search, export, change
 * password, …) can disable themselves and show "حاول بعد N ثانية…"
 * directly on the affected button.
 *
 * Usage:
 *
 *   const { isCoolingDown, remainingSeconds, label } = useRateLimitCooldown();
 *   <Button disabled={isLoading || isCoolingDown} onClick={save}>
 *     {isCoolingDown ? label : "حفظ"}
 *   </Button>
 *
 * The label is in Arabic to match the existing toast wording. The hook
 * ticks at ~250 ms which is smooth enough for a one-second display
 * without spamming React with 60 fps re-renders. When the countdown
 * reaches zero the interval shuts itself off and the button returns to
 * its normal state automatically — callers don't need any cleanup.
 */
export interface RateLimitCooldownState {
  /** True while the user must wait before retrying. */
  isCoolingDown: boolean;
  /** Whole seconds remaining (ceil), 0 when not cooling down. */
  remainingSeconds: number;
  /** Arabic button label, empty string when not cooling down. */
  label: string;
}

export function useRateLimitCooldown(): RateLimitCooldownState {
  const [until, setUntil] = useState<number>(() => getRateLimitCooldownUntil());
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => subscribeRateLimitCooldown(setUntil), []);

  useEffect(() => {
    if (until <= Date.now()) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(handle);
    };
    const handle = setInterval(tick, 250);
    // Run once immediately so the label appears without a 250 ms gap.
    tick();
    return () => clearInterval(handle);
  }, [until]);

  const remainingMs = Math.max(0, until - now);
  const remainingSeconds = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  const isCoolingDown = remainingSeconds > 0;

  return {
    isCoolingDown,
    remainingSeconds,
    label: isCoolingDown ? `حاول بعد ${remainingSeconds} ثانية…` : "",
  };
}
