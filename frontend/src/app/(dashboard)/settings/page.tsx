"use client";

import { SettingsDialog } from "@/components/settings/settings-dialog";
import { ChatHeader } from "@/components/chat/chat-header";

export default function SettingsPage() {
  return (
    <>
      <ChatHeader />
      <SettingsDialog />
    </>
  );
}
