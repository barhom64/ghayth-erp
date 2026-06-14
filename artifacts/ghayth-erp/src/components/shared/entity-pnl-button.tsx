import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";

/**
 * Generic "أرباح وخسائر" entry-point button. Drop this into ANY
 * entity detail page (client, vendor, employee, vehicle, driver,
 * project, contract, umrah_agent, umrah_season) and it deep-links
 * to /finance/entity-pnl/:entityType/:entityId.
 *
 * Single line of integration per detail page — keeps the new
 * dimensional-routing payoff discoverable without churning each
 * entity's existing layout.
 *
 * Permission: the target endpoint requires finance.cost_centers:view,
 * so callers without that permission see the button but the page
 * returns 403. Future iteration could gate the button itself behind
 * usePermission(). For now the page-level gate is sufficient.
 */
export interface EntityPnlButtonProps {
  entityType:
    | "client"
    | "vendor"
    | "employee"
    | "vehicle"
    | "driver"
    | "project"
    | "contract"
    | "umrah_agent"
    | "umrah_season";
  entityId: number;
  /**
   * `inline` (default): subtle ghost button intended for action bars.
   * `card`: full-width prominent button for a sidebar card slot.
   */
  variant?: "inline" | "card";
}

export function EntityPnlButton({
  entityType,
  entityId,
  variant = "inline",
}: EntityPnlButtonProps) {
  const href = `/finance/entity-pnl/${entityType}/${entityId}`;
  if (variant === "card") {
    return (
      <Button asChild
          variant="outline"
          className="w-full justify-start"
          data-testid={`entity-pnl-button-${entityType}-${entityId}`}
        ><Link href={href}>
          <TrendingUp className="h-4 w-4 ms-1" />
          أرباح وخسائر
        </Link></Button>
    );
  }
  return (
    <Button asChild
        size="sm"
        variant="ghost"
        data-testid={`entity-pnl-button-${entityType}-${entityId}`}
      ><Link href={href}>
        <TrendingUp className="h-4 w-4 ms-1" />
        أرباح وخسائر
      </Link></Button>
  );
}
