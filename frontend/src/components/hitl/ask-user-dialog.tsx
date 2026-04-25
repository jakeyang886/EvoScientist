"use client";

import { useState } from "react";
import type { AskUserEvent } from "@/types/sse";

interface AskUserDialogProps {
  interrupt: AskUserEvent;
  onAnswer: (id: string, answer: string) => void;
}

export function AskUserDialog({ interrupt, onAnswer }: AskUserDialogProps) {
  const [answer, setAnswer] = useState("");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
        <h2 className="text-lg font-semibold">问题</h2>
        <p className="text-sm">{interrupt.question}</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="w-full px-3 py-2 border rounded-md bg-background text-sm"
          rows={3}
          placeholder="输入回答..."
        />
        <button
          onClick={() => onAnswer(interrupt.interrupt_id, answer)}
          disabled={!answer.trim()}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
        >
          提交
        </button>
      </div>
    </div>
  );
}
