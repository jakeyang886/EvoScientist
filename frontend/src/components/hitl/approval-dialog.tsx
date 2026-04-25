"use client";

import { useTranslation } from "react-i18next";
import type { InterruptEvent } from "@/types/sse";

interface ApprovalDialogProps {
  interrupt: InterruptEvent;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

export function ApprovalDialog({ interrupt, onApprove, onDeny }: ApprovalDialogProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
        <h2 className="text-lg font-semibold">工具审批</h2>
        <div className="space-y-2">
          <p className="text-sm">工具: <code className="bg-muted px-1 rounded">{interrupt.tool_name}</code></p>
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(interrupt.args, null, 2)}
          </pre>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(interrupt.interrupt_id)}
            className="flex-1 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            {t("common.approve")}
          </button>
          <button
            onClick={() => onDeny(interrupt.interrupt_id)}
            className="flex-1 py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            {t("common.deny")}
          </button>
        </div>
      </div>
    </div>
  );
}
