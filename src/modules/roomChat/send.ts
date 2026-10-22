import OBR from "@owlbear-rodeo/sdk";
import {
  BC_CHAT_MESSAGE,
  MAX_TEXT,
  ChatCast,
  ChatMessage,
  ChatRole,
  ChatScope,
  ChatTool,
} from "./types";

export interface SendChatInput {
  scope: ChatScope;
  toId?: string;
  toName?: string;
  text: string;
  cast?: ChatCast;
  tool?: ChatTool;
  /** Send in someone else's name (Echo Companion: the GM's suite posts
   *  for a player using the phone app). Default: this client's player. */
  from?: { id: string; name: string; color: string; role: ChatRole };
}

export async function sendChat(input: SendChatInput): Promise<boolean> {
  const text = (input.text ?? "").trim().slice(0, MAX_TEXT);
  if (!text && !input.cast) return false;
  if (input.scope === "player" && !input.toId) return false;

  const [fromId, fromName, fromColor, role] = input.from
    ? [input.from.id, input.from.name, input.from.color, input.from.role]
    : await Promise.all([
        OBR.player.getId(),
        OBR.player.getName(),
        OBR.player.getColor(),
        OBR.player.getRole(),
      ]);
  const msg: ChatMessage = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    fromId,
    fromName: fromName || "?",
    fromColor: fromColor || "#9aa0b3",
    fromRole: role as ChatRole,
    scope: input.scope,
    ...(input.scope === "player" ? { toId: input.toId, toName: input.toName } : {}),
    text,
    ...(input.cast ? { cast: input.cast } : {}),
    ...(input.tool ? { tool: input.tool } : {}),
    // Sent for someone else = for a phone (Echo Companion).
    ...(input.from ? { via: "app" as const } : {}),
  };
  await OBR.broadcast.sendMessage(BC_CHAT_MESSAGE, msg, { destination: "ALL" });
  return true;
}
