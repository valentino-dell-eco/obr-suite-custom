// Echo Companion — the GM side, always loaded (background).
//
// 1. QR pickup relay. When a player opens Settings → Echo Companion,
//    their suite broadcasts BC_HELLO with the hash of a secret it
//    keeps. Here, on the GM's client, we check WHO really sent it (OBR
//    stamps the sender's connection id; the payload's own claims are
//    ignored) and register that hash on the player's QR code at the
//    backend. Then we tell the player (BC_CHANGED) to pick it up.
//
// 2. Roll executor. A WebSocket to the room's bridge on the backend
//    (echo-version-backend/src/bridge.ts). When a player rolls on the
//    phone, the bridge sends the request here; we roll it with the
//    suite's own dice pipeline in the player's name (history + dice on
//    the map for everybody, hidden rolls stay hidden) and send the
//    result back to the phone.
//
// 3. Room Chat for the phones. Every chat message this GM client
//    receives (the GM sees them all) goes to the bridge, which passes it
//    to the phones allowed to see it (bridge.ts → exec.chat).
//
// All need this browser to hold the room key (Settings → Echo
// Companion → Activate). Without it, nothing happens.

import OBR from "@owlbear-rodeo/sdk";
import { initBroadcastAuth, senderOf } from "../../utils/broadcastAuth";
import { CC_ORIGIN } from "../characterCards/backend";
import { rollForCompanion } from "../dice";
import { BC_CHANGED, BC_HELLO, readSecret, roomKey } from "./shared";
import { characterState, runAction, type Actor } from "./actions";
import { syncForms } from "./forms";
import { stampChatMessage } from "../roomChat";
import { BC_CHAT_MESSAGE } from "../roomChat/types";

const BOUND_CARD_KEY = "com.character-cards/boundCardId";

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
  // Room Chat → phones (only while the bridge is connected).
  OBR.broadcast.onMessage(BC_CHAT_MESSAGE, (ev) => {
    const sock = ws;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    const msg = stampChatMessage(ev);
    if (!msg) return;
    try {
      sock.send(JSON.stringify({ t: "exec.chat", msg }));
    } catch {}
  });
  void startExecutor();
}

// --- Roll executor ----------------------------------------------------------------------

interface ExecRoll {
  t: "exec.roll";
  rid: string;
  /** Connection id of the phone (the bridge routes the answer back). */
  to: string;
  player: string;
  name: string;
  /** Colour chosen in the app's Settings ("#rrggbb"), or null. */
  color?: string | null;
  card: string | null;
  /** The card's name (from the backend): "Name (Player)" without a token. */
  cardName?: string;
  /** Stat keywords from the character ("chara", default) or its form. */
  source?: "chara" | "form";
  expr: string;
  label: string;
  mode: "normal" | "adv" | "dis";
  crit: boolean;
  hidden: boolean;
}

let ws: WebSocket | null = null;
let retryMs = 1000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let connectedWith = "";

// Players' OBR colours, remembered: a player rolling from the phone
// without being in the room still gets their own colour.
const COLORS_LS = "obr-suite/companion/player-colors";

function readColors(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(COLORS_LS) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function rememberColors(players: Array<{ id: string; color: string }>): void {
  const map = readColors();
  let changed = false;
  for (const p of players) {
    if (p.id && p.color && map[p.id] !== p.color) {
      map[p.id] = p.color;
      changed = true;
    }
  }
  if (!changed) return;
  try {
    localStorage.setItem(COLORS_LS, JSON.stringify(map));
  } catch {}
}

async function startExecutor(): Promise<void> {
  try {
    rememberColors(await OBR.party.getPlayers());
    OBR.party.onChange((players) => rememberColors(players));
  } catch {}
  // Characters' state: re-send to the phones when tokens change
  // (HP, resources, form) or the scene changes. First the saved bestiary
  // forms are put back on / taken from the tokens (forms.ts).
  let t: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      void syncForms().finally(() => {
        for (const card of watched) void pushState(card, false);
      });
    }, 200);
  };
  refresh();
  try {
    OBR.scene.items.onChange(refresh);
    OBR.scene.onReadyChange(refresh);
  } catch {}
  // The room key is saved by the Settings page (same origin): connect
  // as soon as it appears, reconnect if it changes.
  window.addEventListener("storage", (e) => {
    if (e.key && e.key.startsWith("obr-suite/companion/room-secret/")) void connect();
  });
  await connect();
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, 30_000);
}

async function connect(): Promise<void> {
  let isGM = false;
  try {
    isGM = (await OBR.player.getRole()) === "GM";
  } catch {}
  const room = roomKey();
  const secret = isGM ? readSecret(room) : "";
  if (!secret) {
    // Not the GM / not activated: check again later (role can change).
    closeSocket();
    retryMs = 30_000;
    scheduleRetry();
    return;
  }
  if (ws && ws.readyState <= WebSocket.OPEN && connectedWith === secret) return;
  closeSocket();
  connectedWith = secret;
  const url = `${CC_ORIGIN.replace(/^http/, "ws")}/companion/ws?role=exec&room=${encodeURIComponent(room)}`;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    retryMs = 1000;
    sock.send(JSON.stringify({ t: "exec.hello", secret }));
    // Keep the line alive through proxies; answered by the backend
    // without waking anything up.
    pingTimer = setInterval(() => {
      if (sock.readyState === WebSocket.OPEN) sock.send("ping");
    }, 30_000);
  };
  sock.onmessage = (e) => {
    if (typeof e.data !== "string" || e.data === "pong") return;
    let m: any;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m?.t === "exec.roll") void execRoll(sock, m as ExecRoll);
    else if (m?.t === "exec.action") void execAction(sock, m);
    else if (m?.t === "exec.watch" && typeof m.card === "string") {
      watched.add(m.card);
      void pushState(m.card, true);
    } else if (m?.t === "exec.ok" || m?.t === "exec.active") {
      console.info(`[obr-suite/companion] bridge connected — ${m.active ? "rolling for phones" : "standby (another GM tab rolls)"}`);
    }
  };
  sock.onclose = (e) => {
    if (ws === sock) ws = null;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    if (e.code === 4003) {
      // Wrong room key: wait for a new one (storage event) or retry slowly.
      console.warn("[obr-suite/companion] bridge refused the room key");
      retryMs = 60_000;
    }
    scheduleRetry();
  };
}

function closeSocket(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
  const old = ws;
  ws = null;
  try {
    old?.close(1000, "reconnect");
  } catch {}
}

/** First token on the map bound to this character card. */
async function tokenForCard(card: string): Promise<string | null> {
  try {
    const items = await OBR.scene.items.getItems(
      (it: any) => (it.metadata as Record<string, unknown> | undefined)?.[BOUND_CARD_KEY] === card,
    );
    return items[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function execRoll(sock: WebSocket, m: ExecRoll): Promise<void> {
  const reply = (msg: Record<string, unknown>) => {
    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ ...msg, rid: m.rid, to: m.to }));
  };
  try {
    // Colour: the one chosen in the app, else OBR's (in the room now,
    // or remembered from the last time).
    let color: string | undefined =
      typeof m.color === "string" && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : undefined;
    if (!color) {
      try {
        color = (await OBR.party.getPlayers()).find((p) => p.id === m.player)?.color;
      } catch {}
    }
    color ??= readColors()[m.player];
    const itemId = m.card ? await tokenForCard(m.card) : null;
    const { payload, expression } = await rollForCompanion(
      {
        expression: m.expr,
        label: m.label || undefined,
        itemId,
        hidden: m.hidden,
        advMode: m.mode === "adv" ? "adv" : m.mode === "dis" ? "dis" : undefined,
        critMode: m.crit,
        ...(m.card ? { cardId: m.card, statSource: m.source === "form" ? ("form" as const) : ("chara" as const) } : {}),
      },
      { id: m.player, name: m.name || "?", color, via: "app", tokenName: m.cardName || undefined },
    );
    if (!payload) {
      reply({ t: "exec.roll.fail", message: "nothing to roll" });
      return;
    }
    reply({
      t: "exec.roll.done",
      roll: {
        total: payload.total,
        modifier: payload.modifier,
        label: payload.label,
        expression,
        hidden: !!payload.hidden,
        tokenName: payload.tokenName ?? "",
        // So the phone can draw the row like the suite's history.
        rollerName: payload.rollerName,
        rollerColor: payload.rollerColor,
        statSource: payload.statSource ?? null,
        dice: payload.dice.map((d) => ({
          type: d.type,
          value: d.value,
          ...(d.loser ? { loser: true } : {}),
          ...(d.subtract ? { subtract: true } : {}),
        })),
      },
    });
  } catch (e) {
    reply({ t: "exec.roll.fail", message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

// --- Character state + actions (actions.ts) -------------------------------------

/** Cards some phone is showing (the bridge tells us with exec.watch). */
const watched = new Set<string>();
const lastSent = new Map<string, string>();

/** Send a character's HP + resources to the phones watching it — only
 *  when something changed, unless forced (a phone just asked). */
async function pushState(card: string, force: boolean): Promise<void> {
  const sock = ws;
  if (!sock || sock.readyState !== WebSocket.OPEN) return;
  try {
    const state = await characterState(card);
    const json = JSON.stringify(state);
    if (!force && lastSent.get(card) === json) return;
    lastSent.set(card, json);
    sock.send(JSON.stringify({ t: "exec.state", card, state }));
  } catch (e) {
    console.warn("[obr-suite/companion] state failed", e);
  }
}

async function execAction(sock: WebSocket, m: any): Promise<void> {
  const reply = (msg: Record<string, unknown>) => {
    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ ...msg, rid: m.rid, to: m.to }));
  };
  try {
    let color: string | undefined =
      typeof m.color === "string" && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : undefined;
    if (!color) {
      try {
        color = (await OBR.party.getPlayers()).find((p) => p.id === m.player)?.color;
      } catch {}
    }
    color ??= readColors()[m.player] ?? "#5dade2";
    const actor: Actor = {
      player: String(m.player ?? ""),
      name: String(m.name ?? "") || "?",
      color: color!,
      card: String(m.card ?? ""),
      cardName: String(m.cardName ?? ""),
    };
    const result = await runAction(String(m.kind ?? ""), actor, m.data);
    reply({ t: "exec.action.done", result });
    if (actor.card) void pushState(actor.card, false); // chat has no card
  } catch (e) {
    reply({ t: "exec.action.fail", message: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}
