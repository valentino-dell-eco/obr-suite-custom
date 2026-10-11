// Room Chat — background module.
import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import {
  PANEL_IDS,
  getPanelOffset,
  getPanelSize,
  registerPanelBbox,
  BC_PANEL_DRAG_END,
  BC_PANEL_RESET,
} from "../../utils/panelLayout";
import { registerSuiteItem, unregisterSuiteItem } from "../toolsSuite";
import {
  PLUGIN_ID,
  BC_CHAT_MESSAGE,
  BC_CHAT_UPDATED,
  BC_CHAT_CLOSE,
  BC_CHAT_OPEN,
  BC_CHAT_CLEAR,
  BC_CHAT_CLEARED,
  ChatMessage,
  ChatRole,
  isChatMessage,
  isVisibleTo,
  toolOf,
} from "./types";
import { sfxChatMessage } from "../dice/sfx-broadcast";
import { appendHistory, clearHistory } from "./history";
import { initBroadcastAuth, isFromSelf, isFromGM, senderOf } from "../../utils/broadcastAuth";

const ITEM_ID = `${PLUGIN_ID}/suite-item`;
const POPOVER_ID = `${PLUGIN_ID}/popover`;
const POPOVER_URL = assetUrl("room-chat.html");
const ICON_URL = assetUrl("room-chat-icon.svg");

const CHAT_W = 360;
const CHAT_H = 440;
const INSET_LEFT = 16;
const INSET_BOTTOM = 96;

const unsubs: Array<() => void> = [];
let popoverOpen = false;
let meId = "";
let meRole: ChatRole = "PLAYER";
let roomId = "";

async function anchor(): Promise<{ left: number; top: number; w: number; h: number }> {
  let vw = 1280, vh = 720;
  try { vw = await OBR.viewport.getWidth(); } catch {}
  try { vh = await OBR.viewport.getHeight(); } catch {}
  const size = getPanelSize(PANEL_IDS.roomChat);
  const w = size?.width ?? CHAT_W;
  const h = size?.height ?? CHAT_H;
  const off = getPanelOffset(PANEL_IDS.roomChat);
  const left = Math.min(Math.max(8, INSET_LEFT + off.dx), vw - w - 8);
  const top = Math.min(Math.max(8, vh - h - INSET_BOTTOM + off.dy), vh - h - 8);
  return { left, top, w, h };
}

async function openChat(): Promise<void> {
  const { left, top, w, h } = await anchor();
  try {
    await OBR.popover.open({
      id: POPOVER_ID,
      url: POPOVER_URL,
      width: w,
      height: h,
      anchorReference: "POSITION",
      anchorPosition: { left, top },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
    popoverOpen = true;
  } catch (e) {
    console.warn("[room-chat] open failed", e);
  }
}

async function closeChat(): Promise<void> {
  popoverOpen = false;
  try { await OBR.popover.close(POPOVER_ID); } catch {}
}

async function reanchor(): Promise<void> {
  if (!popoverOpen) return;
  try { await OBR.popover.close(POPOVER_ID); } catch {}
  popoverOpen = false;
  await openChat();
}

function preview(msg: ChatMessage): string {
  const body = msg.cast
    ? `✨ ${msg.cast.spellName} (${msg.cast.castLevel})`
    : msg.text;
  return body.length > 80 ? body.slice(0, 77) + "…" : body;
}

async function onMessage(ev: { data: unknown; connectionId?: string }): Promise<void> {
  if (!isChatMessage(ev.data)) return;
  // Never trust the sender identity inside the payload — anyone can
  // broadcast a ChatMessage claiming to be the GM. Stamp the real
  // sender (from the connectionId OBR attaches) over the from* fields.
  const sender = senderOf(ev);
  if (!sender) return;
  const raw: ChatMessage = {
    ...ev.data,
    fromId: sender.id,
    fromName: sender.name || "?",
    fromColor: sender.color || "#9aa0b3",
    fromRole: sender.role,
  };
  // Keep only a known tool tag (it is shown as a coloured notice).
  const tool = toolOf(raw);
  if (raw.cast || !tool) delete raw.tool;
  if (!meId) return;
  if (!isVisibleTo(raw, meId, meRole)) return;
  if (!roomId) roomId = OBR.room.id || "room";
  const fresh = appendHistory(roomId, raw);
  if (!fresh) return;
  // New message from someone else → "bubble" sound. The background has
  // no user gesture (suspended AudioContext), so this goes out as a
  // LOCAL broadcast that the toolbar cluster plays.
  if (raw.fromId !== meId) sfxChatMessage();
  try {
    await OBR.broadcast.sendMessage(BC_CHAT_UPDATED, raw, { destination: "LOCAL" });
  } catch {}
  // A message I'm allowed to see arrived (isVisibleTo above: a message
  // to all, a whisper addressed to me, or anything when I'm the GM) →
  // fire the "open chat" event so the popover pops up. My OWN messages
  // count too: if the chat is closed, they were sent from somewhere
  // else (e.g. a spell cast from the character sheet), so show them.
  if (!popoverOpen) {
    try {
      // Open directly (this IS the background that owns the popover)
      // and also announce it for any other listener.
      await openChat();
      console.log("[room-chat] auto-opened for message", raw.id, raw.cast ? "(cast)" : "");
      void OBR.broadcast.sendMessage(BC_CHAT_OPEN, { msgId: raw.id }, { destination: "LOCAL" }).catch(() => {});
    } catch {
      // Fallback: at least tell the user something arrived.
      const en = getLocalLang() === "en";
      const tag =
        raw.scope === "all"
          ? ""
          : raw.scope === "gm"
            ? en ? " (whisper to GM)" : "（悄悄话 → GM）"
            : en ? " (whisper)" : "（悄悄话）";
      try {
        await OBR.notification.show(`💬 ${raw.fromName}${tag}: ${preview(raw)}`, "INFO");
      } catch {}
    }
  }
}

export async function setupRoomChat(): Promise<void> {
  await initBroadcastAuth();
  try { meId = await OBR.player.getId(); } catch {}
  try { meRole = (await OBR.player.getRole()) as ChatRole; } catch {}
  roomId = OBR.room.id || "room";
  unsubs.push(OBR.player.onChange((p) => { meRole = p.role as ChatRole; }));

  const en = getLocalLang() === "en";
  registerSuiteItem({
    id: ITEM_ID,
    suite: "shared",
    label: en ? "Room Chat" : "房间聊天",
    icon: ICON_URL,
    hint: en ? "Chat, whispers to GM / players" : "聊天、给 GM / 玩家悄悄话",
    onPick: async () => {
      if (popoverOpen) await closeChat();
      else await openChat();
    },
  });

  unsubs.push(OBR.broadcast.onMessage(BC_CHAT_MESSAGE, (ev) => { void onMessage(ev); }));
  unsubs.push(OBR.broadcast.onMessage(BC_CHAT_OPEN, (ev) => {
    if (!isFromSelf(ev)) return; // LOCAL from this client only
    const front = !!(ev.data as { front?: boolean } | undefined)?.front;
    if (front) {
      // Sent by a cast UI right after its modal closed: (re)open on top
      // so the chat isn't left hidden under the modal it was opened
      // behind. Small delay lets the modal finish closing.
      setTimeout(() => {
        void (async () => {
          if (popoverOpen) {
            try { await OBR.popover.close(POPOVER_ID); } catch {}
            popoverOpen = false;
          }
          await openChat();
        })();
      }, 350);
      return;
    }
    if (!popoverOpen) void openChat();
  }));
  unsubs.push(OBR.broadcast.onMessage(BC_CHAT_CLOSE, (ev) => {
    if (!isFromSelf(ev)) return; // LOCAL from our chat popover
    void closeChat();
  }));
  // GM "clear for everyone": every client (GM included — it's sent
  // with destination ALL) wipes its own local history and tells its
  // popover, if open, to re-render empty.
  unsubs.push(
    OBR.broadcast.onMessage(BC_CHAT_CLEAR, async (ev) => {
      // Only a GM may wipe everyone's history (covers our own GM client
      // too, since destination ALL echoes back to the sender).
      if (!isFromGM(ev)) return;
      if (!roomId) roomId = OBR.room.id || "room";
      clearHistory(roomId);
      try {
        await OBR.broadcast.sendMessage(BC_CHAT_CLEARED, {}, { destination: "LOCAL" });
      } catch {}
    }),
  );

  registerPanelBbox(PANEL_IDS.roomChat, async () => {
    const { left, top, w, h } = await anchor();
    return { left, top, width: w, height: h };
  });
  unsubs.push(
    OBR.broadcast.onMessage(BC_PANEL_DRAG_END, (ev) => {
      const data = ev.data as { panelId?: string } | undefined;
      if (data?.panelId === PANEL_IDS.roomChat) void reanchor();
    }),
  );
  unsubs.push(OBR.broadcast.onMessage(BC_PANEL_RESET, () => { void reanchor(); }));
  unsubs.push(
    OBR.scene.onReadyChange((ready) => { if (!ready) void closeChat(); }),
  );
}

export async function teardownRoomChat(): Promise<void> {
  for (const u of unsubs.splice(0)) { try { u(); } catch {} }
  unregisterSuiteItem(ITEM_ID);
  await closeChat();
}
