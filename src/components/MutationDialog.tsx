import * as React from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "~/components/ui/dialog";

/**
 * A small dialog that runs one mutation: a trigger, a title and description,
 * the page's own fields (if any), the mutation's error, and a Cancel /
 * confirm footer that shows a busy label while it runs.
 *
 * For the version, snapshot and reporting-period dialogs. The bigger record
 * dialogs (CVR, FCO, …) have their own shell in `EntityDialog/`.
 *
 * Open state stays with the caller, so it can close the dialog from the
 * mutation's `onSuccess` and re-seed its fields when the dialog opens.
 */
export function MutationDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  className = "sm:max-w-md",
  contentProps,
  children,
  onConfirm,
  pending,
  error,
  errorFallback,
  confirmLabel,
  pendingLabel = "Saving…",
  confirmVariant = "default",
  confirmDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opens the dialog. */
  trigger: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Classes for the dialog panel — its width, mostly. */
  className?: string;
  /** Anything else for the panel, e.g. an `onClick` that stops bubbling. */
  contentProps?: Omit<
    React.ComponentProps<typeof DialogContent>,
    "className" | "children"
  >;
  children?: React.ReactNode;
  onConfirm: () => void;
  /** The mutation is running: both buttons disable, and the busy label shows. */
  pending: boolean;
  /** The mutation's last error, or null. */
  error: unknown;
  /** Shown when the error carries no message of its own. */
  errorFallback: string;
  confirmLabel: React.ReactNode;
  pendingLabel?: React.ReactNode;
  confirmVariant?: "default" | "destructive";
  /** Disables the confirm button, on top of while it is pending. */
  confirmDisabled?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={className} {...contentProps}>
        <div className="space-y-4">
          <div className="pr-8">
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            {description && (
              <p className="text-xs text-slate-500">{description}</p>
            )}
          </div>
          {children}
          {error != null && (
            <p role="alert" className="text-xs text-red-600">
              {error instanceof Error && error.message
                ? error.message
                : errorFallback}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={confirmVariant}
              onClick={onConfirm}
              disabled={pending || confirmDisabled}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
