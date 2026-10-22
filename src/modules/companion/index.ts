// Echo Companion — GM relay (runs in the always-loaded background).
//
// When a player opens Settings → Echo Companion, their suite
// broadcasts BC_HELLO with the hash of a secret it keeps. Here, on the
// GM's client, we check WHO really sent it (OBR stamps the sender's
// connection id; the payload's own claims are ignored) and register
// that hash on the player's QR code at the backend. Then we tell the
// player (BC_CHANGED) so their tab picks the code up.
//
// Needs this browser to hold the room key (Settings → Echo Companion →
// Activate). Without it, it does nothing.

import OBR from "@owlbear-rodeo/sdk";
import { initBroadcastAuth, senderOf } from "../../utils/broadcastAuth";
import { CC_ORIGIN } from "../characterCards/backend";
import { BC_CHANGED, BC_HELLO, readSecret, roomKey } from "./shared";

let started = false;

export async function setupCompanionRelay(): Promise<void> {
  if (started || !CC_ORIGIN) return;
  started = true;
  await initBroadcastAuth();
  OBR.broadcast.onMessage(BC_HELLO, async (event) => {
    try {
      if ((await OBR.player.getRole()) !== "GM") return;
      const room = roomKey();
      const secret = readSecret(room);
      if (!secret) return;
      const sender = senderOf(event);
      if (!sender || sender.role === "GM") return;
      const hash = String((event.data as { hash?: unknown } | undefined)?.hash ?? "");
      if (!/^[0-9a-f]{64}$/.test(hash)) return;
      const res = await fetch(`${CC_ORIGIN}/companion/pickup-hash`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Room-Secret": secret },
        body: JSON.stringify({ room, player: sender.id, hash }),
      });
      if (!res.ok) return;
      const { has_token } = (await res.json()) as { has_token?: boolean };
      if (has_token) {
        await OBR.broadcast.sendMessage(BC_CHANGED, { player: sender.id }, { destination: "REMOTE" });
      }
    } catch (e) {
      console.warn("[obr-suite/companion] relay failed", e);
    }
  });
}
