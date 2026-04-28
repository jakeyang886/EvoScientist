"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2, MessageSquarePlus, X } from "lucide-react";
import { toast } from "sonner";
import { suggestionsApi } from "@/lib/api";

interface SuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuggestionDialog({ open, onOpenChange }: SuggestionDialogProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const reset = () => {
    setTitle("");
    setContent("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const submit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t("suggestions.required"));
      return;
    }
    setSubmitting(true);
    try {
      await suggestionsApi.create({ title: title.trim(), content: content.trim(), files });
      toast.success(t("suggestions.submitted"));
      close();
    } catch {
      toast.error(t("suggestions.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquarePlus className="h-4 w-4 text-violet-600" />
            <h2 className="text-base font-semibold">{t("suggestions.title")}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("suggestions.subject")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("suggestions.subjectPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("suggestions.content")}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={6}
              className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder={t("suggestions.contentPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.zip,.rtf"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/50"
            >
              <FileUp className="h-4 w-4" />
              {t("suggestions.attach")}
            </button>
            {files.length > 0 && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0">{Math.ceil(file.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent/50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("suggestions.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
