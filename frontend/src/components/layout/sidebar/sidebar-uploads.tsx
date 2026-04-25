"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  FileText, Image, Trash2, Loader2, Upload, FolderOpen, Folder,
  ChevronRight, ChevronDown, RefreshCw, Download, Eye,
} from "lucide-react";
import { useChatStore } from "@/store/chat-store";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ThreadFile {
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  created_at: number;
  is_dir: boolean;
}

/** Tree node built from flat file list */
interface TreeNode {
  name: string;
  virtual_path: string;
  is_dir: boolean;
  size: number;
  mime_type: string;
  created_at: number;
  children: TreeNode[];
}

interface SidebarUploadsProps {
  collapsed: boolean;
  style?: React.CSSProperties;
}

/* ------------------------------------------------------------------ */
/*  Tree builder                                                       */
/* ------------------------------------------------------------------ */

function buildTree(files: ThreadFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const f of files) {
    const parts = f.virtual_path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.find((n) => n.name === part);

      if (existing) {
        current = existing.children;
      } else {
        const node: TreeNode = {
          name: part,
          virtual_path: parts.slice(0, i + 1).join("/"),
          is_dir: !isLast || f.is_dir,
          size: isLast && !f.is_dir ? f.size : 0,
          mime_type: isLast && !f.is_dir ? f.mime_type : "",
          created_at: f.created_at,
          children: [],
        };
        current.push(node);
        current = node.children;
      }
    }
  }
  return root;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const getFileIcon = (mimeOrName: string) => {
  if (mimeOrName.startsWith("image/")) return Image;
  return FileText;
};

const getMimeTypeFromName = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
    pdf: "application/pdf", txt: "text/plain", md: "text/markdown", json: "application/json",
  };
  return map[ext || ""] || "application/octet-stream";
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

/* ------------------------------------------------------------------ */
/*  可预览性判断（与 artifacts-panel.tsx 保持一致）                     */
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
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico",
    "pdf",
  ]);
  return previewable.has(ext) || name.toLowerCase() === "dockerfile" || name.toLowerCase() === "makefile";
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

async function downloadWithAuth(url: string, filename: string) {
  const token = getAccessToken();
  const resp = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new Error("下载失败");
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/* ------------------------------------------------------------------ */
/*  TreeNodeView                                                       */
/* ------------------------------------------------------------------ */

function TreeNodeView({
  node,
  threadId,
  depth,
  deleting,
  onDelete,
}: {
  node: TreeNode;
  threadId: string;
  depth: number;
  deleting: string | null;
  onDelete: (node: TreeNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
  const { activeArtifact, setActiveArtifact } = useChatStore();

  const indent = depth * 12;

  if (node.is_dir) {
    return (
      <div>
        <div
          className="group flex items-center gap-1.5 px-2 py-1 text-sm rounded-lg hover:bg-accent/60 transition-all duration-150 cursor-pointer select-none"
          style={{ paddingLeft: `${indent + 8}px`, color: "hsl(var(--sidebar-text))" }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
          )}
          {expanded ? (
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />
          ) : (
            <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />
          )}
          <span className="text-xs truncate flex-1">{node.name}</span>
        </div>
        {expanded && node.children.map((child) => (
          <TreeNodeView
            key={child.virtual_path}
            node={child}
            threadId={threadId}
            depth={depth + 1}
            deleting={deleting}
            onDelete={onDelete}
          />
        ))}
      </div>
    );
  }

  // File node
  const mime = node.mime_type || getMimeTypeFromName(node.name);
  const Icon = getFileIcon(mime);
  const downloadUrl = `${gatewayUrl}/api/threads/${threadId}/files/${encodeURIComponent(node.virtual_path)}`;
  const isActive = activeArtifact?.path === node.virtual_path;
  const canPreview = isPreviewable(node.name);

  const handleClick = () => {
    if (canPreview) {
      // 可预览 → 在 artifacts 中打开（toggle）
      if (isActive) {
        setActiveArtifact(null);
      } else {
        setActiveArtifact({ path: node.virtual_path, name: node.name, threadId });
      }
    } else {
      // 不可预览 → 直接下载
      downloadWithAuth(downloadUrl, node.name).catch(() => toast.error("下载失败"));
    }
  };

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 text-sm rounded-lg transition-all duration-150 ${
        isActive
          ? "bg-violet-100/60 dark:bg-violet-900/30"
          : "hover:bg-accent/60"
      }`}
      style={{ paddingLeft: `${indent + 8}px`, color: "hsl(var(--sidebar-text))" }}
    >
      <button
        onClick={handleClick}
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
        title={canPreview ? "点击预览" : "点击下载"}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-violet-500" : "opacity-40"}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-xs truncate ${isActive ? "text-violet-600 dark:text-violet-400 font-medium" : ""}`}>
            {node.name}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {formatSize(node.size)} · {formatDate(node.created_at)}
          </div>
        </div>
      </button>

      {/* 预览标识（可预览的文件显示小眼睛） */}
      {canPreview && (
        <span className={`shrink-0 ${isActive ? "opacity-100 text-violet-500" : "opacity-0 group-hover:opacity-40"} transition-opacity`}>
          <Eye className="w-3 h-3" />
        </span>
      )}

      {/* hover 下载按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          downloadWithAuth(downloadUrl, node.name).catch(() => toast.error("下载失败"));
        }}
        className="p-1 hover:bg-muted/80 rounded text-muted-foreground hover:text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        title="下载"
      >
        <Download className="w-3 h-3" />
      </button>

      {/* hover 删除按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(node); }}
        disabled={deleting === node.virtual_path}
        className="p-1 hover:bg-muted/80 rounded text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        title="删除"
      >
        {deleting === node.virtual_path ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Trash2 className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SidebarUploads                                                     */
/* ------------------------------------------------------------------ */

export function SidebarUploads({ collapsed, style }: SidebarUploadsProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const fileRefreshTrigger = useChatStore((s) => s.fileRefreshTrigger);
  const [files, setFiles] = useState<ThreadFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const threadId = pathname?.startsWith("/chat/") && pathname !== "/chat"
    ? pathname.split("/")[2]
    : null;

  const loadFiles = async (tid: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ files: ThreadFile[] }>(`/api/threads/${tid}/uploads`);
      setFiles(data.files);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (threadId) {
      loadFiles(threadId);
    } else {
      setFiles([]);
      setLoading(false);
    }
  }, [threadId, fileRefreshTrigger]);

  const handleDelete = async (node: TreeNode) => {
    if (!threadId) return;
    setDeleting(node.virtual_path);
    try {
      const fileName = node.virtual_path.replace(/^uploads\//, "");
      await apiFetch<{ success: boolean }>(
        `/api/threads/${threadId}/uploads/${encodeURIComponent(fileName)}`,
        { method: "DELETE" },
      );
      setFiles((prev) => prev.filter((f) => f.virtual_path !== node.virtual_path));
      toast.success("文件已删除");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !threadId) return;
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    setLoading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((f) => formData.append("files", f));

      const accessToken = getAccessToken();
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
      const url = `${gatewayUrl}/api/threads/${threadId}/uploads`;

      const response = await fetch(url, {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail?.message || "上传失败");
      }

      toast.success(`${selectedFiles.length} 个文件已上传`);
      await loadFiles(threadId);
    } catch (err: any) {
      toast.error(err.message || "上传失败");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // Build tree from flat file list
  const tree = useMemo(() => buildTree(files), [files]);

  if (collapsed) return null;

  return (
    <div className="flex flex-col min-h-0" style={style ?? { flex: "0 0 45%" }}>
      {/* 标题栏 */}
      <div className="px-4 py-1.5 flex items-center justify-between shrink-0" style={{ color: "hsl(var(--sidebar-muted))" }}>
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-3 h-3" />
          <div className="text-[10px] font-semibold uppercase tracking-wider">工作文件</div>
        </div>
        <div className="flex items-center gap-0.5">
          {threadId && (
            <button
              onClick={() => loadFiles(threadId)}
              className="p-1 rounded hover:bg-accent/60 transition-colors"
              title="刷新文件列表"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {threadId && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded hover:bg-accent/60 transition-colors"
              title="上传文件"
            >
              <Upload className="w-3 h-3" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1">
        {!threadId && (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            进入对话后显示文件
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && threadId && files.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted-foreground text-center">
            暂无文件
          </div>
        )}

        {/* Render tree */}
        {tree.map((node) => (
          <TreeNodeView
            key={node.virtual_path}
            node={node}
            threadId={threadId!}
            depth={0}
            deleting={deleting}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
