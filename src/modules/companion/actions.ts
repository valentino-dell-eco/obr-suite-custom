// Echo Companion — what the GM's suite does for a phone, besides rolls:
// the character's state (HP + resources of its token) and actions
// (rest, recharge, hit dice). Called by index.ts (the executor).
//
// Everything goes through the suite's own code (resourceTracker
// storage, recovery.ts, the dice pipeline, Room Chat), so the room sees
// exactly what it would see if the player had pressed the button in
// their own browser — in the player's name.

import OBR from "@owlbear-rodeo/sdk";
import { readBubbles, patchBubbles } from "../../utils/statEdit";
import { readResources, updateResource } from "../resourceTracker/storage";
import { broadcastChanged } from "../resourceTracker/panel";
import { cleanPools, dieSides, hitDieSize, slotTotals, type HitDiePool, type Resource } from "../resourceTracker/types";
import {
  announceRestInChat,
  expandRecoveryTypes,
  rollChargeResource,
  tokensHaveRecoveryType,
  writeRecoveryPassForTokens,
  type RecoveryType,
} from "../characterCards/recovery";
import { conModFromCard } from "../characterCards/hit-dice";
import { broadcastDiceRoll } from "../dice";
import { loadCardById } from "../dice/stat-keywords";
import { sendChat } from "../roomChat/send";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";

const BOUND_CARD_KEY = "com.character-cards/boundCardId";

/** Who the action is for (from the bridge). */
export interface Actor {
  player: string;
  name: string;
  color: string;
  card: string;
  cardName: string;
}

/** HP + resources of a character's token, as sent to the phone. */
export interface CharacterState {
  /** null = no token on the map is bound to this card (scene not loaded,
   *  or the character isn't placed). Actions then can't run. */
  tokenId: string | null;
  tokenName: string;
  hp: { current: number | null; max: number | null; temp: number } | null;
  resources: Resource[];
  /** Resting: the long-rest choice "also Dawn / Dusk" applies. */
  hasDawn: boolean;
  hasDusk: boolean;
  conMod: number;
}

/** First token on the map bound to this character card. */
export async function tokenForCard(card: string): Promise<{ id: string; name: string } | null> {
  try {
    const items = await OBR.scene.items.getItems(
      (it: any) => (it.metadata as Record<string, unknown> | undefined)?.[BOUND_CARD_KEY] === card,
    );
    const it = items[0] as any;
    return it ? { id: it.id, name: String(it.text?.plainText || it.name || "").trim() } : null;
  } catch {
    return null;
  }
}

const conModCache = new Map<string, number>();
async function conModFor(card: string): Promise<number> {
  if (!conModCache.has(card)) conModCache.set(card, conModFromCard(await loadCardById(card)));
  return conModCache.get(card) ?? 0;
}

export async function characterState(card: string): Promise<CharacterState> {
  const tok = await tokenForCard(card);
  const conMod = await conModFor(card).catch(() => 0);
  if (!tok) {
    return { tokenId: null, tokenName: "", hp: null, resources: [], hasDawn: false, hasDusk: false, conMod };
  }
  let resources: Resource[] = [];
  try {
    const [item] = await OBR.scene.items.getItems([tok.id]);
    resources = readResources(item ?? null);
  } catch {}
  const b = await readBubbles(tok.id);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    tokenId: tok.id,
    tokenName: tok.name,
    hp: { current: num(b.health), max: num(b["max health"]), temp: num(b["temporary health"]) ?? 0 },
    resources,
    hasDawn: resources.some((r) => r.recovery === "DW"),
    hasDusk: resources.some((r) => r.recovery === "DS"),
    conMod,
  };
}

function chatFrom(a: Actor) {
  return { id: a.player, name: a.name || "?", color: a.color || "#5dade2", role: "PLAYER" as const };
}

async function requireToken(a: Actor): Promise<string> {
  const tok = await tokenForCard(a.card);
  if (!tok) throw new Error("no_token");
  return tok.id;
}

// --- Rest ------------------------------------------------------------------------

const REST_TYPES = new Set<RecoveryType>(["SR", "LR", "DW", "DS"]);

/** Same steps as a card's rest buttons in the suite (info-page.ts →
 *  runCardRecovery): chat line, instant recovery, then what still needs
 *  the player — charges to roll, hit dice to spend after a short rest. */
async function rest(a: Actor, data: any) {
  const pressed = data?.type as RecoveryType;
  if (!REST_TYPES.has(pressed)) throw new Error("bad rest type");
  const itemId = await requireToken(a);
  const dawn = pressed === "LR" && data?.dawn === true && (await tokensHaveRecoveryType([itemId], "DW"));
  const dusk = pressed === "LR" && data?.dusk === true && (await tokensHaveRecoveryType([itemId], "DS"));
  const types = expandRecoveryTypes(pressed, dawn, dusk);
  announceRestInChat([a.cardName], pressed, { dawn, dusk }, chatFrom(a));
  const needsRollByItem = await writeRecoveryPassForTokens([itemId], types);
  const needsRoll = (needsRollByItem.get(itemId) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    current: r.current,
    max: r.max,
    formula: r.chargesFormula || "",
  }));
  let hitDice = false;
  if (pressed === "SR") {
    const [item] = await OBR.scene.items.getItems([itemId]);
    const hd = readResources(item ?? null).find((r) => r.type === "hitDice");
    hitDice = !!hd && hd.current > 0;
  }
  // FYI for the GM (in the suite a player's rest sends the GM a notice).
  const lang = getLocalLang();
  const label = t(
    lang,
    pressed === "SR" ? "rcvBtnSRTitle" : pressed === "LR" ? "rcvBtnLRTitle" : pressed === "DW" ? "rcvBtnDWTitle" : "rcvBtnDSTitle",
  ).split(" — ")[0];
  void OBR.notification.show(`📱 ${a.name} — ${a.cardName}: ${label}`).catch(() => {});
  return { needsRoll, hitDice };
}

/** Roll one charges resource's recovery formula (the "Recharge" button). */
async function recharge(a: Actor, data: any) {
  const itemId = await requireToken(a);
  const [item] = await OBR.scene.items.getItems([itemId]);
  const r = readResources(item ?? null).find((x) => x.id === data?.resourceId);
  if (!r || r.type !== "charges" || !r.chargesFormula) throw new Error("no such charges resource");
  const result = await rollChargeResource(itemId, r);
  if (!result) throw new Error("bad formula");
  return { current: result.resource.current, max: result.resource.max, total: result.total };
}

function readPools(r: Resource | null): HitDiePool[] {
  if (!r) return [];
  const p = cleanPools(r.pools);
  return p.length ? p : [{ die: hitDieSize(r.dieInfo) ?? "d8", current: r.current, max: r.max }];
}

/** Spend hit dice after a short rest — the suite's hit-dice window
 *  (hit-dice-page.ts → roll), for the phone. */
async function hitDice(a: Actor, data: any) {
  const itemId = await requireToken(a);
  const secret = data?.secret === true;
  const [item] = await OBR.scene.items.getItems([itemId]);
  const res = readResources(item ?? null).find((r) => r.type === "hitDice") ?? null;
  if (!res) throw new Error("no hit dice");
  const pools = readPools(res);
  const counts: Record<string, number> = {};
  for (const p of pools) {
    const want = Math.floor(Number(data?.counts?.[p.die]) || 0);
    counts[p.die] = Math.max(0, Math.min(p.current, want));
  }
  const rolled: Array<{ die: string; value: number }> = [];
  for (const p of pools) {
    for (let i = 0; i < (counts[p.die] ?? 0); i++) {
      rolled.push({ die: p.die, value: 1 + Math.floor(Math.random() * dieSides(p.die)) });
    }
  }
  const n = rolled.length;
  if (!n) throw new Error("no dice chosen");
  const conMod = await conModFor(a.card).catch(() => 0);
  const heal = rolled.reduce((sum, r) => sum + Math.max(0, r.value + conMod), 0);

  // 1. Take the dice off their pools.
  let prev = 0;
  const updated = await updateResource(itemId, res.id, (r) => {
    prev = r.current;
    const next = readPools(r).map((p) => ({ ...p, current: Math.max(0, p.current - (counts[p.die] ?? 0)) }));
    const tot = slotTotals(next);
    return { ...r, pools: next, current: tot.current, max: tot.max, dieInfo: next[0]?.die ?? r.dieInfo };
  });
  if (updated) void broadcastChanged(itemId, updated, updated.current - prev, prev, secret);

  // 2. Heal the token, capped at max HP.
  const before = await readBubbles(itemId);
  const hpNow = typeof before.health === "number" ? before.health : 0;
  const maxHp = typeof before["max health"] === "number" ? before["max health"] : null;
  const target = maxHp != null ? Math.min(maxHp, hpNow + heal) : hpNow + heal;
  const after = await patchBubbles(itemId, { health: target });
  const hp = after.health ?? target;

  // 3. Dice in the room: by the character's token; secret = the
  //    player's hidden roll (only GM + player see it).
  const lang = getLocalLang();
  try {
    await broadcastDiceRoll({
      itemId,
      dice: rolled.map((r) => ({ type: r.die, value: r.value })),
      winnerIdx: -1,
      modifier: conMod * n,
      label: t(lang, "hdLabel"),
      ...(secret
        ? { hidden: true, rollerId: a.player, rollerIsGM: false, rollerName: a.name, rollerColor: a.color, via: "app" as const }
        : { rollerId: itemId, via: "app" as const }),
    });
  } catch {}

  // 4. Room Chat line.
  const mix = pools.map((p) => (counts[p.die] ? `${counts[p.die]}${p.die}` : "")).filter(Boolean).join(" + ");
  const en = lang === "en";
  const text = t(lang, "rcvChatHitDice")
    .replace("{name}", a.cardName)
    .replace("{n}", String(n))
    .replace("{dice}", en ? (n === 1 ? "die" : "dice") : "")
    .replace("{heal}", String(heal));
  const hpTxt = `${hp}${maxHp != null ? ` / ${maxHp}` : ""}`;
  void sendChat({ scope: secret ? "gm" : "all", text: `${text} (${mix} · ${hpTxt})`, tool: "rest", from: chatFrom(a) }).catch(
    () => {},
  );

  return {
    rolls: rolled,
    conMod,
    heal,
    hp,
    maxHp,
    left: updated?.current ?? 0,
  };
}

/** Runs one action from the phone; returns what goes back to it. */
export async function runAction(kind: string, a: Actor, data: unknown): Promise<unknown> {
  switch (kind) {
    case "rest":
      return rest(a, data);
    case "recharge":
      return recharge(a, data);
    case "hitDice":
      return hitDice(a, data);
    default:
      throw new Error(`unknown action ${kind}`);
  }
}
