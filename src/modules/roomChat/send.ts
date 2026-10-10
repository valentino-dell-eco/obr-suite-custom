import OBR from "@owlbear-rodeo/sdk";
import {
  BC_CHAT_MESSAGE,
  MAX_TEXT,
  ChatCast,
  ChatMessage,
  ChatRole,
  ChatScope,
} from "./types";

export interface SendChatInput {
  scope: ChatScope;
  toId?: string;
  toName?: string;
  text: string;
  cast?: ChatCast;
}

export async function sendChat(input: SendChatInput): Promise<boolean> {
  const text = (input.text ?? "").trim().slice(0, MAX_TEXT);
  if (!text && !input.cast) return false;
  if (input.scope === "player" && !input.toId) return false;

  const [fromId, fromName, fromColor, role] = await Promise.all([
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
  };
  await OBR.broadcast.sendMessage(BC_CHAT_MESSAGE, msg, { destination: "ALL" });
  return true;
}
