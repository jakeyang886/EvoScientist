"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Send, Square, Paperclip, X, FileText, Image } from "lucide-react";
import { ModelSelector } from "@/components/models/model-selector";
import { toast } from "sonner";

interface PendingFile {
  file: File;
}

/** 暴露给父组件的方法 */
export interface PromptInputHandle {
  /** 将文本填入输入框并聚焦 */
  setInputValue: (text: string) => void;
}

interface PromptInputProps {
  onSubmit: (message: string, files?: File[]) => void;
  onCancel: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  selectedModel: string;
  selectedEffort: "low" | "medium" | "high";
  onModelChange: (model: string) => void;
  onEffortChange: (effort: "low" | "medium" | "high") => void;
}

export const PromptInput = forwardRef<PromptInputHandle, PromptInputProps>(function PromptInput({
  onSubmit,
  onCancel,
  disabled,
  isLoading,
  selectedModel,
  selectedEffort,
  onModelChange,
  onEffortChange,
}, ref) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);

  // 暴露给父组件：填入文本并聚焦输入框
  useImperativeHandle(ref, () => ({
    setInputValue: (text: string) => {
      // IME composition 中不打断输入
      if (composingRef.current) return;
      setValue(text);
      // 延迟聚焦确保 React 完成 re-render
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          // 光标移到末尾
          el.setSelectionRange(text.length, text.length);
        }
      });
    },
  }), []);

  // Resize helper — skips during IME composition to avoid cursor/candidate reset
  const resizeTextarea = useCallback(() => {
    if (composingRef.current) return;
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, []);

  // Auto-resize textarea (only when NOT composing)
  useEffect(() => {
    resizeTextarea();
  }, [value, resizeTextarea]);

  // After composition ends, apply pending resize
  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    resizeTextarea();
  }, [resizeTextarea]);

  // 切换对话时清空暂存文件
  useEffect(() => {
    setPendingFiles([]);
  }, []);

  const handleFileSelect = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setPendingFiles((prev) => [...prev, ...fileArray.map((f) => ({ file: f }))]);
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    const mime = file.type;
    if (mime.startsWith("image/")) return Image;
    return FileText;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = () => {
    if (composingRef.current) return;
    if ((!value.trim() && pendingFiles.length === 0) || disabled || isLoading) return;

    const filesToSend = pendingFiles.length > 0 ? pendingFiles.map((p) => p.file) : undefined;
    onSubmit(value.trim(), filesToSend);
    setValue("");
    setPendingFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (composingRef.current || (e.nativeEvent as any).isComposing) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-all">
      {/* 已选文件列表 */}
      {pendingFiles.length > 0 && (
        <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2">
          {pendingFiles.map((pf, i) => {
            const FileIcon = getFileIcon(pf.file);
            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-accent/10 text-xs"
              >
                <FileIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="max-w-[120px] truncate">{pf.file.name}</span>
                <span className="text-muted-foreground">{formatSize(pf.file.size)}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-1 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={handleCompositionEnd}
        placeholder={t("chat.placeholder")}
        disabled={disabled}
        rows={1}
        className="w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm leading-relaxed focus:outline-none disabled:opacity-50 placeholder:text-muted-foreground/60"
      />

      {/* Bottom bar: attach file + model selector + send button */}
      <div className="flex items-center justify-between px-3 pb-2 pt-1">
        <div className="flex items-center gap-1">
          {/* 文件上传按钮 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg hover:bg-accent/50 transition-colors text-muted-foreground disabled:opacity-40"
            title={t("chat.uploadFiles") || "上传文件"}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            className="hidden"
          />

          {/* 模型选择器 */}
          <ModelSelector
            selectedModel={selectedModel}
            selectedEffort={selectedEffort}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
            compact
          />
        </div>

        {isLoading ? (
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={disabled || isLoading || (!value.trim() && pendingFiles.length === 0)}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40 transition-all shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
