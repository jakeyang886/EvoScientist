"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCreateThread } from "@/hooks/use-threads";
import { useChatStore } from "@/store/chat-store";
import { PromptInput } from "@/components/chat/prompt-input/prompt-input";
import { WelcomeScreen } from "@/components/chat/welcome-screen";
import { ChatHeader } from "@/components/chat/chat-header";
import { MessageBubble } from "@/components/chat/message-bubble";
import { toast } from "sonner";

export default function ChatIndexPage() {
  const router = useRouter();
  const { reset, optimisticMessage, setOptimisticMessage } = useChatStore();
  const createThread = useCreateThread();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("model") || "");
  const [selectedEffort, setSelectedEffort] = useState<"low" | "medium" | "high">(
    () => (localStorage.getItem("reasoning_effort") as "low" | "medium" | "high") || "medium"
  );
  const [isSending, setIsSending] = useState(false);
  const [optimisticFiles, setOptimisticFiles] = useState<any[]>([]);

  const handleFirstMessage = async (
    message: string,
    files?: File[],
  ) => {
    if (isSending) return;
    setIsSending(true);
    // Optimistic UI: Show message immediately — use store so it survives reset() + router.push()
    setOptimisticMessage(message);
    // Track optimistic files for display during upload
    if (files && files.length > 0) {
      setOptimisticFiles(files.map((f) => ({
        filename: f.name,
        virtual_path: "",
        size: f.size,
        uploadStatus: "uploading" as const,
        uploadProgress: 0,
      })));
    } else {
      setOptimisticFiles([]);
    }

    try {
      // 1. 创建 thread
      const result = await createThread.mutateAsync({
        message,
        model: selectedModel || undefined,
      });
      const threadId = result.thread_id;

      // 2. 如果有文件，上传到 thread 的 workspace
      let uploadedPaths: string[] = [];
      if (files && files.length > 0) {
        const tokens = JSON.parse(localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens") || "{}");
        const accessToken = tokens.access_token;
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "";
        const url = `${gatewayUrl}/api/threads/${threadId}/uploads`;

        uploadedPaths = await new Promise<string[]>((resolve, reject) => {
          const formData = new FormData();
          files.forEach((f) => formData.append("files", f));

          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr; // Store reference for cancellation
          xhr.open("POST", url);
          if (accessToken) xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);

          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              // Update optimistic files progress (shown in FileUploadCard inside message bubble)
              setOptimisticFiles((prev) => prev.map((f) => ({
                ...f,
                uploadProgress: percent,
              })));
            }
          });

          xhr.addEventListener("load", () => {
            xhrRef.current = null;
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve((data.files || []).map((f: any) => f.virtual_path));
              } catch {
                reject(new Error("上传响应解析失败"));
              }
            } else {
              reject(new Error(`上传失败: ${xhr.status}`));
            }
          });

          xhr.addEventListener("error", () => {
            xhrRef.current = null;
            reject(new Error("网络错误，上传失败"));
          });
          xhr.addEventListener("abort", () => {
            xhrRef.current = null;
            reject(new Error("上传已取消"));
          });

          xhr.send(formData);
        });

        if (uploadedPaths.length === 0) {
          toast.error("文件上传失败，但对话已创建");
          // Mark files as error
          setOptimisticFiles((prev) => prev.map((f) => ({
            ...f,
            uploadStatus: "error" as const,
            errorMessage: "上传失败",
          })));
        } else {
          // Update optimistic files to success with actual paths
          setOptimisticFiles((prev) => prev.map((f, i) => {
            const path = uploadedPaths[i] || "";
            const rawName = path.split("/").pop() || "";
            return {
              ...f,
              filename: rawName.split("_", 1).pop() || f.filename,
              virtual_path: path,
              uploadStatus: "success" as const,
              uploadProgress: 100,
            };
          }));
        }
      }

      // 3. 同步设置 store 状态，确保跳转时 messages 不为空
      // 直接 setState 保证状态同步更新，避免 reset() 和 addMessage() 之间的异步间隙
      let attachedFiles: any[] | undefined;
      if (uploadedPaths.length > 0 && files) {
        attachedFiles = files.map((f, i) => {
          const path = uploadedPaths[i] || "";
          const rawName = path.split("/").pop() || "";
          return {
            filename: rawName.split("_", 1).pop() || f.name,
            virtual_path: path,
            size: f.size,
            uploadStatus: "success" as const,
          };
        });
      } else if (files && files.length > 0) {
        // Upload failed — still include files with error status in the message
        attachedFiles = files.map((f) => ({
          filename: f.name,
          virtual_path: "",
          size: f.size,
          uploadStatus: "error" as const,
          errorMessage: "上传失败",
        }));
      }
      useChatStore.setState({
        messages: [
          {
            role: "user",
            content: message,
            timestamp: new Date().toISOString(),
            ...(attachedFiles ? { attachedFiles } : {}),
          },
          {
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
          },
        ],
        isStreaming: true,
      });

      // 4. 携带参数跳转
      const params = new URLSearchParams();
      params.set("prompt", message);
      if (selectedModel) params.set("model", selectedModel);
      params.set("effort", selectedEffort);
      if (uploadedPaths.length > 0) {
        params.set("files", uploadedPaths.join(","));
      }
      router.push(`/chat/${threadId}?${params.toString()}`);
    } catch {
      toast.error("创建对话失败");
      setIsSending(false);
      setOptimisticMessage(null);
      setOptimisticFiles([]);
    }
  };

  const handleCancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setIsSending(false);
    setOptimisticMessage(null);
    setOptimisticFiles([]);
  };

  return (
    <>
      <ChatHeader />
      <div className="flex flex-col h-full relative">
        <div className="flex-1 overflow-y-auto">
          {optimisticMessage ? (
            <div className="max-w-3xl mx-auto py-4 space-y-4">
              <MessageBubble 
                message={{
                  role: "user",
                  content: optimisticMessage,
                  timestamp: new Date().toISOString(),
                  ...(optimisticFiles.length > 0 ? { attachedFiles: optimisticFiles } : {}),
                }}
                isLatest={true}
                isStreaming={false}
              />
              <MessageBubble 
                message={{ role: "assistant", content: "", timestamp: new Date().toISOString() }}
                isLatest={true}
                isStreaming={true}
              />
            </div>
          ) : (
            <WelcomeScreen />
          )}
        </div>
        <div className="px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            <PromptInput
              onSubmit={handleFirstMessage}
              onCancel={() => {
                setIsSending(false);
                setOptimisticMessage(null);
              }}
              disabled={isSending}
              isLoading={isSending}
              selectedModel={selectedModel}
              selectedEffort={selectedEffort}
              onModelChange={setSelectedModel}
              onEffortChange={(e) => setSelectedEffort(e as "low" | "medium" | "high")}
            />
          </div>
        </div>
      </div>
    </>
  );
}
