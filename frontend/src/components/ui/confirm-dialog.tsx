"use client";

import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

interface ConfirmDialogRenderProps {
  dialogProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  dialogState: {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    variant: "destructive" | "default";
  };
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Renders the confirmation dialog UI.
 * Use together with useConfirmDialog() hook.
 *
 * Usage:
 *   const { confirm, dialogProps, dialogState, handleConfirm, handleCancel } = useConfirmDialog();
 *   // ... in JSX:
 *   <ConfirmDialog dialogProps={dialogProps} dialogState={dialogState} onConfirm={handleConfirm} onCancel={handleCancel} />
 */
export function ConfirmDialog({ dialogProps, dialogState, onConfirm, onCancel }: ConfirmDialogRenderProps) {
  const { t } = useTranslation();

  if (!dialogState.description) return null;
  const dialogTitle = dialogState.title || t("common.confirm") || "Confirm";

  return (
    <AlertDialogRoot {...dialogProps}>
      <AlertDialogContent>
        <div className="space-y-4">
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {dialogState.description}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              {dialogState.cancelLabel || t("common.cancel") || "Cancel"}
            </button>
            <button
              onClick={onConfirm}
              className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                dialogState.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {dialogState.confirmLabel || t("common.confirm") || "Confirm"}
            </button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialogRoot>
  );
}
