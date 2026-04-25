// ─── SSE Connection Manager with reconnection ─────────────────

import type { SSEEvent } from "@/types/sse";

export interface SSEHandlers {
  onEvent: (event: SSEEvent) => void;
  onDone: (event: SSEEvent) => void;
  onError: (error: Event) => void;
  onReconnect?: (attempt: number) => void;
}

export class SSEConnection {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  private reconnectDelays = [3000, 6000, 12000, 24000, 48000];

  constructor(private url: string, private handlers: SSEHandlers) {
    this.connect();
  }

  private connect() {
    this.eventSource = new EventSource(this.url, {
      withCredentials: true,
    });

    this.eventSource.addEventListener("done", (e) => {
      const event = JSON.parse((e as MessageEvent).data);
      this.handlers.onDone(event);
    });

    this.eventSource.addEventListener("error", (e) => {
      if (!(e as MessageEvent).data) {
        this.handlers.onError(e);
        this.tryReconnect();
      }
    });

    this.eventSource.addEventListener("message", (e) => {
      const event = JSON.parse((e as MessageEvent).data);
      this.handlers.onEvent(event);
    });

    this.eventSource.addEventListener("heartbeat", () => {
      // Ignore heartbeats
    });
  }

  private tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) {
      this.handlers.onError(new Event("max_reconnects"));
      return;
    }
    this.reconnectAttempts++;
    this.handlers.onReconnect?.(this.reconnectAttempts);
    const delay = this.reconnectDelays[this.reconnectAttempts - 1];
    setTimeout(() => this.connect(), delay);
  }

  close() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
