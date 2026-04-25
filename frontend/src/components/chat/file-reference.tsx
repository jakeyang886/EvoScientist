"use client";

import { Download, FileText, Image, Loader2, X } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";

interface FileReferenceProps {
  href: string;
  threadId: string;
  children?: React.ReactNode;
}

export function FileReference({ href, threadId, children }: FileReferenceProps) {
  const { activeArtifact, setActiveArtifact, fileCache, setFileCache } = useChatStore();
  const isActive = activeArtifact?.path === href;
  const cache = fileCache[href];
  const isLoading = cache?.loading;

  // Extract clean file name for download
  const fileName = href.split("/").pop() || "file";

  const handlePreview = async () => {
    // 如果已经激活，再次点击则取消激活（toggle）
    if (isActive) {
      setActiveArtifact(null);
      return;
    }

    setActiveArtifact({ path: href, name: fileName, threadId });

    // 如果没缓存过，则加载内容
    if (!cache) {
      setFileCache(href, { loading: true });
      try {
        const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
        const accessToken = tokens.access_token;

        const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(href)}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });

        if (!response.ok) throw new Error("Failed to load file");

        const content = await response.text();
        setFileCache(href, { content, loading: false });
      } catch (err) {
        setFileCache(href, { loading: false, error: "加载失败" });
        toast.error("无法预览文件内容");
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
      const accessToken = tokens.access_token;

      const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(href)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!response.ok) throw new Error("Download failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error("下载失败");
    }
  };

  return (
    <span className="inline-flex items-center group/file gap-1 mx-1 align-middle">
      <button
        onClick={handlePreview}
        className={`
          inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono border transition-all
          hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-300 dark:hover:border-violet-700
          ${isActive 
            ? "bg-violet-100 border-violet-400 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-600" 
            : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"}
        `}
      >
        <FileText className="w-3 h-3 shrink-0" />
        <span className="max-w-[120px] truncate">{children || fileName}</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-1" />}
      </button>

      <button
        onClick={handleDownload}
        className="
          opacity-0 group-hover/file:opacity-100 
          p-1 rounded-md transition-all
          hover:bg-accent text-muted-foreground hover:text-foreground
        "
        title="下载文件"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// ─── FileAttachmentCard — 消息气泡内的文件附件卡片 ─────────────────

interface FileAttachmentCardProps {
  filename: string;
  virtualPath: string;
  size: number;
  threadId: string | null;
}

export function FileAttachmentCard({ filename, virtualPath, size, threadId }: FileAttachmentCardProps) {
  const { activeArtifact, setActiveArtifact, fileCache, setFileCache } = useChatStore();
  const isActive = activeArtifact?.path === virtualPath;
  const isLoading = fileCache[virtualPath]?.loading;
  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(filename);
  const Icon = isImage ? Image : FileText;

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePreview = async () => {
    if (!threadId) return;
    if (isActive) { setActiveArtifact(null); return; }
    setActiveArtifact({ path: virtualPath, name: filename, threadId });
    if (!fileCache[virtualPath]) {
      setFileCache(virtualPath, { loading: true });
      try {
        const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
        const accessToken = tokens.access_token;
        const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(virtualPath)}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });
        if (!response.ok) throw new Error("Failed to load file");
        const content = await response.text();
        setFileCache(virtualPath, { content, loading: false });
      } catch {
        setFileCache(virtualPath, { loading: false, error: "加载失败" });
        toast.error("无法预览文件内容");
      }
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!threadId) return;
    try {
      const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
      const accessToken = tokens.access_token;
      const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(virtualPath)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error("下载失败");
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-accent/10 text-xs">
      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <button
        onClick={handlePreview}
        className="flex-1 min-w-0 text-left font-medium truncate hover:text-violet-500 transition-colors"
      >
        {filename}
      </button>
      {size > 0 && <span className="text-muted-foreground shrink-0">{formatSize(size)}</span>}
      {isLoading && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
      <button
        onClick={handleDownload}
        className="p-1 hover:text-violet-500 transition-colors shrink-0"
        title="下载"
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── ParsedFileAttachments — 解析旧消息中的 [File: xxx] 模式 ──────

interface ParsedFileAttachmentsProps {
  content: string;
  threadId: string | null;
}

export function ParsedFileAttachments({ content, threadId }: ParsedFileAttachmentsProps) {
  const regex = /\[File:\s*([^\]]+)\]/g;
  const files: Array<{ filename: string; virtual_path: string }> = [];
  const seen = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1].trim();
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ filename: path.split("/").pop() || path, virtual_path: path });
  }

  if (files.length === 0) return null;

  return (
    <div className="mb-2 space-y-1.5">
      {files.map((file, i) => (
        <FileAttachmentCard
          key={i}
          filename={file.filename}
          virtualPath={file.virtual_path}
          size={0}
          threadId={threadId}
        />
      ))}
    </div>
  );
}
