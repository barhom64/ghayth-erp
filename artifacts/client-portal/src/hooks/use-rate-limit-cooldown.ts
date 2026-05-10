import { useEffect, useState } from "react";
import {
  subscribeRateLimitCooldown,
  getRateLimitCooldownUntil,
} from "@/lib/rate-limit-toast";

/**
 * Live retry countdown — Task #169 (mirrors the main app's Task #155).
 *
 * When the API replies with `429 Too Many Requests`, `notifyRateLimited`
 * stores the absolute "may-retry-at" timestamp and broadcasts it. This
 * hook subscribes to that broadcast and exposes a ticking remaining-
 * seconds value so submit / send / save buttons can disable themselves
 * and show "حاول بعد N ثانية…" directly on the affected button.
 */
export interface RateLimitCooldownState {
  isCoolingDown: boolean;
  remainingSeconds: number;
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
