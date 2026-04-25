"use client";

import { X, Download, FileText, Loader2, AlertCircle, Copy, Check, Image as ImageIcon } from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { MarkdownRender } from "./markdown-render";
import { API_BASE_URL } from "@/lib/constants";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  File type helpers                                                  */
/* ------------------------------------------------------------------ */

function isPreviewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const previewable = new Set([
    "txt", "md", "markdown", "rst",
    "py", "js", "ts", "tsx", "jsx", "json", "yaml", "yml", "toml", "xml", "html", "css", "scss",
    "sh", "bash", "zsh", "fish",
    "c", "cpp", "h", "hpp", "java", "kt", "go", "rs", "rb", "php", "swift",
    "sql", "graphql",
    "csv", "tsv", "log", "env", "ini", "cfg", "conf",
    "dockerfile", "makefile",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico",
    "pdf",
  ]);
  return previewable.has(ext) || name.toLowerCase() === "dockerfile" || name.toLowerCase() === "makefile";
}

function isImageFile(name: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico)$/i.test(name);
}

function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name);
}

function isMarkdownFile(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function isJsonFile(name: string): boolean {
  return /\.json$/i.test(name);
}

/* ------------------------------------------------------------------ */
/*  JSON 语法高亮                                                      */
/* ------------------------------------------------------------------ */

function highlightJson(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
      let cls = "text-emerald-600 dark:text-emerald-400";
      if (/:$/.test(match)) {
        cls = "text-violet-600 dark:text-violet-400";
      }
      return `<span class="${cls}">${match}</span>`;
    })
    .replace(/\b(true|false)\b/g, '<span class="text-amber-600 dark:text-amber-400">$1</span>')
    .replace(/\b(null)\b/g, '<span class="text-red-500 dark:text-red-400">$1</span>')
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>');
}

/* ------------------------------------------------------------------ */
/*  Auth helper                                                        */
/* ------------------------------------------------------------------ */

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}";
    return JSON.parse(raw).access_token ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  ArtifactsPanel — 所有 hooks 必须在条件判断之前调用                  */
/* ------------------------------------------------------------------ */

export function ArtifactsPanel({ width = 480 }: { width?: number }) {
  const { activeArtifact, fileCache, setActiveArtifact, setFileCache } = useChatStore();
  const [copied, setCopied] = useState(false);

  // 从 activeArtifact 派生值（可能为 null，hooks 不受影响）
  const path = activeArtifact?.path ?? "";
  const name = activeArtifact?.name ?? "";
  const threadId = activeArtifact?.threadId ?? "";
  const isActive = activeArtifact !== null;

  const cache = isActive ? fileCache[path] : undefined;
  const isLoading = cache?.loading;
  const content = cache?.content;
  const blobUrl = cache?.blobUrl;
  const error = cache?.error;

  const imageFile = isImageFile(name);
  const pdfFile = isPdfFile(name);
  const mdFile = isMarkdownFile(name);
  const jsonFile = isJsonFile(name);
  const previewable = isPreviewable(name);

  // 自动加载文件内容（首次打开时）
  useEffect(() => {
    if (!isActive || !previewable || cache) return;
    loadFile();
  }, [path, isActive]);

  async function loadFile() {
    setFileCache(path, { loading: true });
    try {
      const token = getAccessToken();
      const url = `${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to load file");

      if (imageFile || pdfFile) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setFileCache(path, { blobUrl, loading: false });
      } else {
        const content = await response.text();
        setFileCache(path, { content, loading: false });
      }
    } catch {
      setFileCache(path, { loading: false, error: "加载失败" });
      toast.error("无法预览文件内容");
    }
  }

  const handleDownload = async () => {
    try {
      const token = getAccessToken();
      const url = `${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(path)}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch {
      toast.error("下载失败");
    }
  };

  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // JSON 格式化
  const formattedJson = useMemo(() => {
    if (!jsonFile || !content) return null;
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return null;
    }
  }, [jsonFile, content]);

  // ─── 无 activeArtifact → 不渲染 ───
  if (!isActive) return null;

  // ─── 不可预览文件 → 显示提示面板 ───
  if (!previewable) {
    return (
      <div style={{ width }} className="border-l bg-background flex flex-col h-full shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate" title={name}>{name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const url = `${API_BASE_URL}/api/threads/${threadId}/files/${encodeURIComponent(path)}`;
                const token = getAccessToken();
                fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
                  .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
                  .then((blob) => {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = name;
                    document.body.appendChild(a);
                    a.click();
                    URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);
                  })
                  .catch(() => toast.error("下载失败"));
              }}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="下载文件"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveArtifact(null)}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
          <FileText className="w-12 h-12 opacity-20" />
          <p>此文件类型不支持预览</p>
          <button
            onClick={() => setActiveArtifact(null)}
            className="text-xs text-violet-500 hover:underline"
          >
            关闭面板
          </button>
        </div>
      </div>
    );
  }

  // ─── 可预览文件 → 正常面板 ───
  return (
    <div style={{ width }} className="border-l bg-background flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {imageFile ? (
            <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-sm truncate" title={name}>{name}</span>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          {!imageFile && !pdfFile && (
            <button
              onClick={handleCopy}
              disabled={!content}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="复制内容"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="下载文件"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setActiveArtifact(null)}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && !content && !blobUrl && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            正在加载内容...
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
            <p>{error}</p>
            <button
              onClick={() => { setFileCache(path, { loading: true }); loadFile(); }}
              className="mt-2 text-xs text-violet-500 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* 图片预览 */}
        {!isLoading && blobUrl && imageFile && (
          <div className="flex items-center justify-center min-h-full">
            <img
              src={blobUrl}
              alt={name}
              className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-lg shadow-sm"
            />
          </div>
        )}

        {/* PDF 预览 */}
        {!isLoading && blobUrl && pdfFile && (
          <iframe
            src={blobUrl}
            className="w-full h-[calc(100vh-200px)] rounded-lg border"
            title={name}
          />
        )}

        {/* Markdown 预览 */}
        {!isLoading && content && mdFile && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRender content={content} threadId={null} />
          </div>
        )}

        {/* JSON 预览（带语法高亮） */}
        {!isLoading && content && jsonFile && formattedJson && (
          <pre
            className="bg-muted/30 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: highlightJson(formattedJson) }}
          />
        )}

        {/* 其他文本/代码预览 */}
        {!isLoading && content && !mdFile && !jsonFile && !imageFile && !pdfFile && (
          <pre className="bg-muted/30 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
