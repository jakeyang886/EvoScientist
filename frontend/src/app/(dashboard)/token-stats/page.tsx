"use client";

import { TokenStatsPanel } from "@/components/settings/token-stats-panel";
import { ChatHeader } from "@/components/chat/chat-header";
import { useRouter } from "next/navigation";

export default function TokenStatsPage() {
  const router = useRouter();

  return (
    <>
      <ChatHeader />
      <TokenStatsPanel onBack={() => router.push("/chat")} />
    </>
  );
}
