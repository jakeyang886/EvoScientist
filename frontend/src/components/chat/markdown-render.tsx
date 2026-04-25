"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import { FileReference } from "./file-reference";
import { memo } from "react";

interface MarkdownRenderProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  threadId?: string | null;
}

/**
 * Markdown renderer for chat messages.
 * Converts [File: uploads/xxx.pdf] references to clickable download links.
 */
export const MarkdownRender = memo(function MarkdownRender({
  content,
  className = "",
  isStreaming = false,
  threadId = null,
}: MarkdownRenderProps) {
  // Convert file references to download links before rendering
  // Matches: 
  // 1. [File: path]
  // 2. [File: path/to/file]
  // 3. 已创建文件 path
  // 4. File: path
  // 5. created path
  const filePattern = /\[File:\s*([^\]]+)\]|(?:\[File\]|已创建文件|文件|File|saved to|created)[：:： ]+`?([^\s`]+)`?/gi;
  
  const processedContent = threadId
    ? content.replace(
        filePattern,
        (match, bracketPath, plainPath) => {
          const filePath = bracketPath || plainPath;
          if (!filePath) return match;
          
          const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
          const fileName = filePath.split("/").pop() || filePath;
          // Clean up UUID prefix for download URL
          const cleanName = fileName.includes("_") && fileName.split("_")[0].length === 8
            ? fileName.split("_").slice(1).join("_")
            : fileName;
          const downloadUrl = `${gatewayUrl}/api/threads/${threadId}/files/${encodeURIComponent(fileName)}`;
          return `[📄 ${cleanName}](${downloadUrl})`;
        }
      )
    : content;

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
        // Code blocks
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match && !String(children).includes("\n");
          if (isInline) {
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        pre({ children }) {
          return (
            <pre className="relative rounded-lg bg-zinc-900 p-4 text-sm text-zinc-100 overflow-x-auto">
              {children}
            </pre>
          );
        },
        // Tables
        table({ children }) {
          return (
            <div className="my-3 overflow-x-auto rounded-md border">
              <table className="min-w-full divide-y divide-border text-sm">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="bg-muted">{children}</thead>;
        },
        th({ children }) {
          return (
            <th className="px-3 py-2 text-left font-semibold text-foreground">{children}</th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-2 border-t border-border text-muted-foreground">{children}</td>
          );
        },
        // Lists
        ul({ children }) {
          return <ul className="list-disc pl-5 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 space-y-1">{children}</ol>;
        },
        // Links — render as FileReference if it's a file download link
        a({ href, children }) {
          // Detect if this is a generated file link: /api/threads/{id}/files/{path}
          const fileMatch = href?.match(/\/api\/threads\/[^\/]+\/files\/(.+)/);
          if (fileMatch && threadId) {
            const filePath = decodeURIComponent(fileMatch[1]);
            return (
              <FileReference href={filePath} threadId={threadId}>
                {children}
              </FileReference>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80"
            >
              {children}
            </a>
          );
        },
        // Blockquote
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-primary/30 pl-4 italic text-muted-foreground">
              {children}
            </blockquote>
          );
        },
      }}
    >
      {processedContent}
    </ReactMarkdown>
    </div>
  );
});
