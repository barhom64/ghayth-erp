/**
 * EntityPrintButton — thin compatibility wrapper around <PrintButton/>.
 *
 * Originally it composed a local print modal from `sections=[...]`. Every
 * detail page now supplies `entityType + entityId` and the Print Engine v2
 * server templates own the layout end-to-end (branch letterhead, audit row,
 * reprint detection, thermal/excel formats). The legacy modal branch is
 * gone; this file stays only because 54 callsites still import the name.
 *
 *   <EntityPrintButton
 *     entityType="invoice"
 *     entityId={invoice.id}
 *     formats={["a4", "thermal_80"]}
 *   />
 */

import { PrintButton, type PrintFormat } from "@/components/shared/print-button";

interface EntityPrintButtonProps {
  entityType: string;
  entityId: string | number;
  /** Output formats supported by the entity. */
  formats?: PrintFormat[];
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function EntityPrintButton({
  entityType,
  entityId,
  formats,
  label = "طباعة / معاينة",
  variant = "outline",
  size = "sm",
}: EntityPrintButtonProps) {
  return (
    <PrintButton
      entityType={entityType}
      entityId={entityId}
      formats={formats}
      label={label}
      variant={variant === "ghost" ? "ghost" : variant}
      size={size}
    />
  );
}
