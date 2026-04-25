"use client";

import { useState, useCallback } from "react";

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: "destructive" | "default";
  onConfirm: () => void;
}

const initialState: ConfirmState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  variant: "default",
  onConfirm: () => {},
};

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
}

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(initialState);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: options.title || "Confirm",
        description: options.description,
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        variant: options.variant || "default",
        onConfirm: () => resolve(true),
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState(initialState);
  }, []);

  const handleConfirm = useCallback(() => {
    state.onConfirm();
    setState(initialState);
  }, [state]);

  const dialogProps = {
    open: state.open,
    onOpenChange: (open: boolean) => {
      if (!open) handleCancel();
    },
  };

  return {
    /** Opens a confirmation dialog. Returns true if confirmed, false if cancelled. */
    confirm,
    /** Props to spread onto the AlertDialogRoot component */
    dialogProps,
    /** State for rendering the dialog content */
    dialogState: state,
    /** Cancel handler */
    handleCancel,
    /** Confirm handler */
    handleConfirm,
  };
}
