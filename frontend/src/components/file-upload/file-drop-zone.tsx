"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { FileInfo } from "@/types/api";

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
}

export function FileDropZone({ onFilesSelected }: FileDropZoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) onFilesSelected(files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
    >
      <input
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer text-sm text-muted-foreground">
        {t("chat.uploadFiles")} 或拖放到此处
      </label>
    </div>
  );
}
