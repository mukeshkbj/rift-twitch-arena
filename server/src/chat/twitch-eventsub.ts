import type { GameEngine } from "../game/engine.js";
import { parseCommand } from "./command-parser.js";
import type { TwitchAccount, TwitchOAuth } from "../auth/twitch-oauth.js";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";
const SUBSCRIPTIONS_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";

interface EventSubEnvelope {
  metadata?: { message_id?: unknown; message_type?: unknown; subscription_type?: unknown };
  payload?: {
    session?: { id?: unknown; reconnect_url?: unknown; keepalive_timeout_seconds?: unknown };
    subscription?: { type?: unknown; status?: unknown };
    event?: {
      chatter_user_id?: unknown;
      chatter_user_name?: unknown;
      message?: { text?: unknown };
    };
  };
}

type StatusListener = (status: "disconnected" | "connecting" | "connected" | "error") => void;

export class TwitchEventSub {
  private activeSocket: WebSocket | undefined;
  private pendingSocket: WebSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private reconnectAttempt = 0;
  private readonly listeners = new Set<StatusListener>();
  private readonly seenMessageIds = new Set<string>();

  constructor(private readonly engine: GameEngine, private readonly oauth: TwitchOAuth) {}

  subscribeStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get status(): "disconnected" | "connecting" | "connected" | "error" {
    const state = this.engine.getSnapshot().input.twitchStatus;
    return state;
  }

  async connect(): Promise<void> {
    if (this.status === "connected") return;
    this.stopped = false;
    this.setStatus("connecting");
    try {
      await this.openSocket(EVENTSUB_URL, false);
    } catch (error) {
      this.setStatus("error");
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const sockets = [this.pendingSocket, this.activeSocket];
    this.pendingSocket = undefined;
    this.activeSocket = undefined;
    for (const socket of sockets) {
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Disconnected by streamer");
    }
    this.setStatus("disconnected");
  }

  private openSocket(url: string, transferSubscriptions: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
      let welcomeTimer: ReturnType<typeof setTimeout> | undefined;
      let keepaliveSeconds = 10;
      const socket = new WebSocket(url);
      this.pendingSocket = socket;

      const clearTimers = (): void => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        if (welcomeTimer) clearTimeout(welcomeTimer);
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimers();
        if (this.pendingSocket === socket) this.pendingSocket = undefined;
        if (socket.readyState < WebSocket.CLOSING) socket.close();
        reject(error);
      };
      const activate = (): void => {
        const old = this.activeSocket;
        this.activeSocket = socket;
        if (this.pendingSocket === socket) this.pendingSocket = undefined;
        settled = true;
        if (welcomeTimer) clearTimeout(welcomeTimer);
        this.reconnectAttempt = 0;
        this.setStatus("connected");
        if (old && old !== socket && old.readyState < WebSocket.CLOSING) old.close(1000, "EventSub session transferred");
        resolve();
      };
      const resetHeartbeat = (seconds: number): void => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) socket.close(4005, "EventSub keepalive timed out");
        }, Math.max(10, seconds) * 1000);
      };

      welcomeTimer = setTimeout(() => fail(new Error("Twitch chat did not finish connecting in time.")), 12_000);
      socket.addEventListener("message", (message) => {
        let envelope: EventSubEnvelope;
        try {
          envelope = JSON.parse(String(message.data)) as EventSubEnvelope;
        } catch {
          return;
        }
        const messageType = envelope.metadata?.message_type;
        const session = envelope.payload?.session;
        if (messageType === "session_welcome" && typeof session?.keepalive_timeout_seconds === "number") {
          keepaliveSeconds = session.keepalive_timeout_seconds;
        }
        resetHeartbeat(keepaliveSeconds);

        if (messageType === "session_welcome") {
          if (transferSubscriptions) {
            activate();
            return;
          }
          if (typeof session?.id !== "string") {
            fail(new Error("Twitch opened a chat session without a session ID."));
            return;
          }
          void this.createChatSubscription(session.id)
            .then(activate)
            .catch((error: unknown) => fail(error instanceof Error ? error : new Error("Could not subscribe to Twitch chat.")));
          return;
        }

        if (messageType === "session_reconnect" && typeof session?.reconnect_url === "string") {
          void this.openSocket(session.reconnect_url, true).catch(() => this.scheduleReconnect());
          return;
        }

        if (messageType === "revocation") {
          this.setStatus("error");
          return;
        }

        if (messageType === "notification" && envelope.metadata?.subscription_type === "channel.chat.message") {
          this.receiveChatMessage(envelope, String(envelope.metadata?.message_id ?? ""));
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) fail(new Error("Could not connect to Twitch EventSub."));
      });
      socket.addEventListener("close", () => {
        clearTimers();
        if (this.pendingSocket === socket) this.pendingSocket = undefined;
        if (this.activeSocket === socket) {
          this.activeSocket = undefined;
          if (!this.stopped) {
            this.setStatus("connecting");
            this.scheduleReconnect();
          }
        } else if (!settled) {
          fail(new Error("Twitch closed the chat connection before it was ready."));
        }
      });
    });
  }

  private async createChatSubscription(sessionId: string): Promise<void> {
    const account: TwitchAccount = this.oauth.getAccount();
    const accessToken = await this.oauth.getAccessToken();
    let response: Response;
    try {
      response = await fetch(SUBSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": this.oauth.getClientId(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "channel.chat.message",
          version: "1",
          condition: { broadcaster_user_id: account.id, user_id: account.id },
          transport: { method: "websocket", session_id: sessionId },
        }),
      });
    } catch {
      throw new Error("Could not reach Twitch to subscribe to chat.");
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { message?: unknown } | null;
      const message = typeof detail?.message === "string" ? detail.message : "check your Twitch authorization";
      throw new Error(`Twitch could not subscribe to this channel (${message}).`);
    }
  }

  private receiveChatMessage(envelope: EventSubEnvelope, messageId: string): void {
    const event = envelope.payload?.event;
    if (!event || typeof event.chatter_user_id !== "string" || typeof event.chatter_user_name !== "string" ||
        typeof event.message?.text !== "string") return;
    if (messageId && this.seenMessageIds.has(messageId)) return;
    if (messageId) {
      this.seenMessageIds.add(messageId);
      if (this.seenMessageIds.size > 512) this.seenMessageIds.clear();
    }
    if (event.chatter_user_id === this.oauth.getAccount().id) return;

    const parsed = parseCommand(event.message.text, {
      userId: event.chatter_user_id,
      displayName: event.chatter_user_name,
      source: "twitch",
    });
    if (parsed.ok) this.engine.submitVote(parsed.command);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt - 1, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stopped) return;
      void this.openSocket(EVENTSUB_URL, false).catch(() => {
        this.setStatus("error");
        this.scheduleReconnect();
      });
    }, delay);
  }

  private setStatus(status: "disconnected" | "connecting" | "connected" | "error"): void {
    if (status === "connected") this.engine.setInput("twitch", status);
    else if (status === "disconnected") this.engine.setInput("simulator", status);
    else this.engine.setTwitchStatus(status);
    for (const listener of this.listeners) listener(status);
  }
}
