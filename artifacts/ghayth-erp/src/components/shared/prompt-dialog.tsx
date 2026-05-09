import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * PromptDialog — small replacement for window.prompt().
 *
 * Used for "enter a reason" flows (reject, cancel, terminate, …) that
 * previously called window.prompt() from inside a click handler. The native
 * prompt blocks the event loop, ignores RTL/dark-mode, and shows an
 * OS-default UI that doesn't match the rest of the app.
 *
 * Usage:
 *   const [rejecting, setRejecting] = useState<number | null>(null);
 *   const handleReject = (id: number) => setRejecting(id);
 *
 *   <Button onClick={() => handleReject(row.id)}>رفض</Button>
 *   <PromptDialog
 *     open={rejecting !== null}
 *     title="سبب الرفض"
 *     description="يرجى إدخال السبب لرفض هذا الطلب:"
 *     onSubmit={(reason) => {
 *       rejectMut.mutate({ id: rejecting, reason });
 *       setRejecting(null);
 *     }}
 *     onClose={() => setRejecting(null)}
 *   />
 *
 * Pass `optional` if an empty reason is acceptable; otherwise the confirm
 * button stays disabled until the textarea has non-whitespace content.
 */
export interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, an empty reason is allowed (e.g. "rejection reason (optional)"). */
  optional?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({
  open,
  title,
  description,
  defaultValue = "",
  placeholder = "اكتب السبب هنا...",
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  optional = false,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Reset textarea each time the dialog opens so a previous value doesn't
  // bleed into the next reject/cancel flow.
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const trimmed = value.trim();
  const canSubmit = optional || trimmed.length > 0;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <Textarea
          ref={ref}
          autoFocus
          rows={3}
          placeholder={placeholder}
          dir="rtl"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSubmit}
            onClick={() => {
              onSubmit(trimmed);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
