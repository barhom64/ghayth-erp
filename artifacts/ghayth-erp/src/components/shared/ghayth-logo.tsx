/**
 * Ghayth brand logo — drop-in replacement for the placeholder `CloudRain`
 * icon that was sprinkled around the app.
 *
 * Two variants:
 *   - `<GhaythLogo />`           → icon-only (cloud + ascending bars) at 32px
 *   - `<GhaythLogo variant="full" />` → cloud + bars + "غيث / GHAITH" wordmark
 *
 * The SVG ships from /public so it can also be referenced from print
 * letterheads, the login backdrop, and the favicon.
 */

import { cn } from "@/lib/utils";

interface GhaythLogoProps {
  /** Size in px for the icon variant (default 32). Ignored for `variant="full"`. */
  size?: number;
  /** Render mode: just the mark or the mark + Arabic/Latin wordmark. */
  variant?: "mark" | "full";
  className?: string;
  /** Optional title for accessibility / hover. */
  title?: string;
}

export function GhaythLogo({
  size = 32,
  variant = "mark",
  className,
  title = "غيث ERP",
}: GhaythLogoProps) {
  const src = variant === "full" ? "/logo.svg" : "/logo-mark.svg";
  // Full logo is wider than tall; ratio is 200:200 so we still treat it as
  // a square but it visually has wordmark below the mark.
  return (
    <img
      src={src}
      alt={title}
      title={title}
      width={size}
      height={size}
      className={cn("inline-block select-none", className)}
      draggable={false}
    />
  );
}
