import { toast } from "@/hooks/use-toast";

export class RateLimitError extends Error {
  readonly name = "RateLimitError";
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`تم تجاوز الحد المسموح، حاول بعد ${retryAfterSeconds} ثانية`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let lastToastAt = 0;
const DEBOUNCE_MS = 3000;

/**
 * Live cooldown broadcast — Task #169 (mirrors the main app's Task #155).
 *
 * Every successful 429 detection sets `cooldownUntilMs` to the absolute
 * timestamp at which the user may retry, and notifies subscribers so any
 * mounted button can disable itself and tick down a "حاول بعد N ثانية…"
 * label. The hook `useRateLimitCooldown` is the canonical consumer.
 *
 * The single global cooldown intentionally covers all action buttons rather
 * than scoping per-route — the API limiter groups by IP+route, so when one
 * submit fails with 429 the next submit is overwhelmingly likely to be
 * throttled too. One consistent message beats a parade of failing buttons.
 */
let cooldownUntilMs = 0;
type CooldownListener = (until: number) => void;
const cooldownListeners = new Set<CooldownListener>();

function setCooldown(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const next = Date.now() + seconds * 1000;
  // Only extend the cooldown — never shorten it. A second 429 with a
  // smaller retry-after must not reset the still-running countdown.
  if (next <= cooldownUntilMs) return;
  cooldownUntilMs = next;
  cooldownListeners.forEach((l) => l(cooldownUntilMs));
}

export function subscribeRateLimitCooldown(listener: CooldownListener): () => void {
  cooldownListeners.add(listener);
  // Replay current state so consumers mounted mid-cooldown see it immediately.
  listener(cooldownUntilMs);
  return () => {
    cooldownListeners.delete(listener);
  };
}

export function getRateLimitCooldownUntil(): number {
  return cooldownUntilMs;
}

export function parseRetryAfterSeconds(res: Response): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
    const t = Date.parse(retryAfter);
    if (!Number.isNaN(t)) return Math.max(0, Math.ceil((t - Date.now()) / 1000));
  }
  const reset = res.headers.get("ratelimit-reset");
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n) && n >= 0) {
      if (n > 1_000_000_000) {
        return Math.max(0, Math.ceil(n - Date.now() / 1000));
      }
      return Math.ceil(n);
    }
  }
  return 60;
}

export function notifyRateLimited(res: Response): number {
  const seconds = parseRetryAfterSeconds(res);
  // Always extend the live cooldown — even when the toast itself is
  // debounced — so buttons keep showing the correct remaining time
  // through a burst of 429s.
  setCooldown(seconds);
  const now = Date.now();
  if (now - lastToastAt < DEBOUNCE_MS) return seconds;
  lastToastAt = now;
  toast({
    title: "تم تجاوز الحد المسموح",
    description: `حاول بعد ${seconds} ثانية`,
    variant: "destructive",
  });
  return seconds;
}
