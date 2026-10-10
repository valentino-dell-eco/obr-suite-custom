// Sender checks for OBR.broadcast messages.
//
// OBR.broadcast has no access control: any client in the room — or a
// player typing in the browser console — can send any message on any
// channel, and the receiving client runs the handler with ITS OWN
// permissions (a GM client can delete items, move tokens, ...).
// Every handler that performs an action must therefore check WHO sent
// the message, using the `connectionId` OBR stamps on every event.
//
//   isFromSelf(ev) — message came from this same client (any iframe of
//                    this extension on this browser). Use for channels
//                    that only exist to talk between our own iframes.
//   isFromGM(ev)   — message came from a client whose player is a GM.
//   senderOf(ev)   — the real { id, name, role, color } of the sender.
//
// Call initBroadcastAuth() once per iframe (after OBR.onReady). The
// checks are synchronous and use a cache kept fresh via OBR.party.

import OBR from "@owlbear-rodeo/sdk";

export interface BroadcastSender {
  id: string;
  name: string;
  role: "GM" | "PLAYER";
  color: string;
}

let myConnectionId = "";
let me: BroadcastSender | null = null;
const byConnection = new Map<string, BroadcastSender>();
let initPromise: Promise<void> | null = null;

function toSender(p: { id: string; name: string; role: string; color: string }): BroadcastSender {
  return { id: p.id, name: p.name, role: p.role === "GM" ? "GM" : "PLAYER", color: p.color };
}

export function initBroadcastAuth(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [connId, id, name, role, color] = await Promise.all([
        OBR.player.getConnectionId(),
        OBR.player.getId(),
        OBR.player.getName(),
        OBR.player.getRole(),
        OBR.player.getColor(),
      ]);
      myConnectionId = connId;
      me = toSender({ id, name, role, color });
    } catch (e) {
      console.warn("[obr-suite/broadcastAuth] self lookup failed", e);
    }
    try {
      const players = await OBR.party.getPlayers();
      for (const p of players) byConnection.set(p.connectionId, toSender(p));
    } catch {}
    try {
      OBR.party.onChange((players) => {
        byConnection.clear();
        for (const p of players) byConnection.set(p.connectionId, toSender(p));
      });
      OBR.player.onChange((p) => {
        me = toSender(p);
        if (p.connectionId) myConnectionId = p.connectionId;
      });
    } catch {}
  })();
  return initPromise;
}

/** True when the message was sent by this same client. */
export function isFromSelf(ev: { connectionId?: string }): boolean {
  return !!myConnectionId && ev.connectionId === myConnectionId;
}

/** Real identity of the sender, or null if unknown. */
export function senderOf(ev: { connectionId?: string }): BroadcastSender | null {
  if (!ev.connectionId) return null;
  if (isFromSelf(ev)) return me;
  return byConnection.get(ev.connectionId) ?? null;
}

/** True when the sender is a GM. */
export function isFromGM(ev: { connectionId?: string }): boolean {
  return senderOf(ev)?.role === "GM";
}
