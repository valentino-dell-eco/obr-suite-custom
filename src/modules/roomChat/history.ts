import { PLUGIN_ID, MAX_HISTORY, ChatMessage, isChatMessage } from "./types";

const keyFor = (roomId: string) => `${PLUGIN_ID}/history/${roomId}`;

export function loadHistory(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(keyFor(roomId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isChatMessage) : [];
  } catch {
    return [];
  }
}

export function appendHistory(roomId: string, msg: ChatMessage): boolean {
  const list = loadHistory(roomId);
  if (list.some((m) => m.id === msg.id)) return false;
  list.push(msg);
  list.sort((a, b) => a.ts - b.ts);
  const trimmed = list.length > MAX_HISTORY ? list.slice(-MAX_HISTORY) : list;
  try { localStorage.setItem(keyFor(roomId), JSON.stringify(trimmed)); } catch {}
  return true;
}

export function clearHistory(roomId: string): void {
  try { localStorage.removeItem(keyFor(roomId)); } catch {}
}
