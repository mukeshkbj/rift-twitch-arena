import { ACTIONS } from "../game/types.js";
import type { Action, ChatCommand, InputMode } from "../game/types.js";

export type CommandParseResult =
  | { ok: true; command: ChatCommand }
  | { ok: false; reason: "not-command" | "unknown-command" | "invalid-identity" };

export function parseCommand(
  text: string,
  identity: { userId: string; displayName: string; source: InputMode; receivedAt?: number },
): CommandParseResult {
  if (!identity.userId.trim() || !identity.displayName.trim()) return { ok: false, reason: "invalid-identity" };
  const token = text.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!token?.startsWith("!")) return { ok: false, reason: "not-command" };
  const action = token.slice(1);
  if (!(ACTIONS as readonly string[]).includes(action)) return { ok: false, reason: "unknown-command" };
  return {
    ok: true,
    command: {
      userId: identity.userId,
      displayName: identity.displayName,
      action: action as Action,
      receivedAt: identity.receivedAt ?? Date.now(),
      source: identity.source,
    },
  };
}
