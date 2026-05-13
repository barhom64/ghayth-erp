import type { ReactNode } from "react";
import { useAppContext } from "@/contexts/app-context";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * PermissionGate — single point for showing/hiding UI based on backend
 * `module:action` permissions. Wraps children with one of three behaviours:
 *
 *   <PermissionGate perm="finance:create">
 *     <Button>إنشاء فاتورة</Button>   // hidden if no permission
 *   </PermissionGate>
 *
 *   <PermissionGate perm="finance:delete" fallback={null}>
 *     <Button variant="destructive">حذف</Button>
 *   </PermissionGate>
 *
 *   <PermissionGate perm={["finance:create", "finance:approve"]} mode="any">
 *     ...
 *   </PermissionGate>
 *
 * Mirrors the backend's `requirePermission`/`requireAnyPermission` logic
 * exactly so the UI never offers an action the server would reject.
 */
interface PermissionGateProps {
  /** One permission, or array for compound checks. */
  perm: string | string[];
  /** "all" (default) → must hold every permission; "any" → hold at least one. */
  mode?: "all" | "any";
  /** Shown when the check passes. */
  children: ReactNode;
  /** Shown when the check fails. Default: null (render nothing). */
  fallback?: ReactNode;
}

export function PermissionGate({ perm, mode = "all", children, fallback = null }: PermissionGateProps) {
  const { can } = useAppContext();
  const list = Array.isArray(perm) ? perm : [perm];
  const allowed = mode === "any" ? list.some(can) : list.every(can);
  return <>{allowed ? children : fallback}</>;
}

/**
 * Permission-aware button. By default, **hides** the button entirely when the
 * user lacks the permission — features they can't use shouldn't be visible.
 * Opt in to the legacy "disable + lock icon + tooltip" presentation with
 * `hideWhenDenied={false}` when discoverability matters more than minimalism
 * (e.g. an admin-only action you want power users to know exists).
 *
 *   <GuardedButton perm="finance:create" onClick={...}>إنشاء فاتورة</GuardedButton>
 */
interface GuardedButtonProps extends ButtonProps {
  perm: string | string[];
  mode?: "all" | "any";
  /**
   * Hide entirely (default) vs. render a disabled button with a lock + tooltip.
   * Default is `true` so the UI never advertises actions the user can't take.
   */
  hideWhenDenied?: boolean;
  /** Override tooltip text shown on denial (only meaningful when not hidden). */
  deniedTooltip?: string;
}

export function GuardedButton({
  perm,
  mode = "all",
  hideWhenDenied = true,
  deniedTooltip,
  children,
  disabled,
  ...rest
}: GuardedButtonProps) {
  const { can } = useAppContext();
  const list = Array.isArray(perm) ? perm : [perm];
  const allowed = mode === "any" ? list.some(can) : list.every(can);

  if (!allowed && hideWhenDenied) return null;

  if (!allowed) {
    const tooltip = deniedTooltip || `لا تملك الصلاحية (${list.join(" + ")})`;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button {...rest} disabled className="gap-1 opacity-60 cursor-not-allowed">
                <Lock className="h-3.5 w-3.5" />
                {children}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button {...rest} disabled={disabled}>
      {children}
    </Button>
  );
}

/**
 * Hook form for imperative checks (inside event handlers, etc.).
 *
 *   const canCreate = usePermission("finance:create");
 *   const canDo = useAnyPermission(["finance:create", "finance:approve"]);
 */
export function usePermission(perm: string | string[], mode: "all" | "any" = "all"): boolean {
  const { can } = useAppContext();
  const list = Array.isArray(perm) ? perm : [perm];
  return mode === "any" ? list.some(can) : list.every(can);
}

export function useAnyPermission(perms: string[]): boolean {
  return usePermission(perms, "any");
}
