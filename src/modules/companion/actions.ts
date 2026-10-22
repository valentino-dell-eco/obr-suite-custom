// Echo Companion — what the GM's suite does for a phone, besides rolls:
// the character's state (HP + resources of its token) and actions
// (rest, recharge, hit dice, HP, resources, spell casts, feature uses).
// Called by index.ts (the
// executor).
//
// Everything goes through the suite's own code (resourceTracker
// storage, recovery.ts, the dice pipeline, Room Chat), so the room sees
// exactly what it would see if the player had pressed the button in
// their own browser — in the player's name.

import OBR from "@owlbear-rodeo/sdk";
import { readBubbles, patchBubbles } from "../../utils/statEdit";
import { readResources, updateResource } from "../resourceTracker/storage";
import { broadcastChanged } from "../resourceTracker/panel";
import {
  cleanPools,
  cleanSlots,
  dieSides,
  hitDieSize,
  slotTotals,
  type HitDiePool,
  type Resource,
} from "../resourceTracker/types";
import {
  announceRestInChat,
  expandRecoveryTypes,
  rollChargeResource,
  tokensHaveRecoveryType,
  writeRecoveryPassForTokens,
  type RecoveryType,
} from "../characterCards/recovery";
import { conModFromCard } from "../characterCards/hit-dice";
import { broadcastDiceRoll, rollForCompanion } from "../dice";
import { cleanSpend, dieRollFormula, spendResource, spendSpellSlot } from "../characterCards/spend";
import { buildCast, buildFeatureUse, cardSaveDc, castLevelOptions } from "../characterCards/cast-core";
import { effectiveSpellDetail } from "../characterCards/spell-detail";
import type { ChatCast } from "../roomChat/types";
import { formOfToken, formStatBlock, type FormInfo } from "./forms";
import { readLibrary } from "../statusTester/library";
import { iconUrl, readApplied, textColorFor, titleParts } from "../statusTester/types";
import { emojiImageUrl } from "../statusTester/emoji";
import { loadCardById } from "../dice/stat-keywords";
import { sendChat } from "../roomChat/send";
import { loadHistory } from "../roomChat/history";
import { MAX_TEXT, isVisibleTo, type ChatMessage, type ChatScope } from "../roomChat/types";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";

const BOUND_CARD_KEY = "com.character-cards/boundCardId";
const CARD_LIST_KEY = "com.character-cards/list";

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
  /** Bestiary form on the token (Wild Shape…), or null. */
  form: FormInfo | null;
  /** Status Tracker chips on the token, as a player sees them. */
  statuses: StatusChip[];
}

/** One status on the token, ready to draw (Status Tracker chip). */
export interface StatusChip {
  title: string;
  /** "3", "(30 ft)", or "" without levels. */
  level: string;
  /** Chip colour "#rrggbb" and the text colour that reads on it. */
  color: string;
  text: string;
  emoji?: string;
  /** OpenMoji picture of the emoji (same look as the map). */
  emojiUrl?: string;
  /** Base icon (white or black SVG to match the chip). */
  iconUrl?: string;
}

/** The statuses a PLAYER sees on the token: hidden ones (GM only) and
 *  everything on a hidden token are left out, like on the map. */
async function statusChips(item: any): Promise<StatusChip[]> {
  if (!item || item.visible === false) return [];
  const applied = readApplied(item).filter((a) => !a.hidden);
  if (!applied.length) return [];
  let defs: Awaited<ReturnType<typeof readLibrary>> = [];
  try {
    defs = await readLibrary();
  } catch {
    return [];
  }
  const byId = new Map(defs.map((d) => [d.id, d]));
  const out: StatusChip[] = [];
  for (const a of applied) {
    const def = byId.get(a.defId);
    if (!def) continue;
    const p = titleParts(def, a);
    const text = textColorFor(def.color);
    const chip: StatusChip = { title: p.title, level: p.level, color: def.color, text };
    if (def.emoji) {
      chip.emoji = def.emoji;
      const url = emojiImageUrl(def.emoji);
      if (url) chip.emojiUrl = url;
    } else if (def.icon) {
      chip.iconUrl = iconUrl(def.icon, text !== "#ffffff");
    }
    out.push(chip);
  }
  return out;
}

/** First token on the map bound to this character card. */
/** The character's token: the same one the suite's card uses — the
 *  scene's card list says which (com.character-cards/list →
 *  boundedTokenId). A copied token keeps the card link too, so "the
 *  first token with this card" could be the copy; that is only the
 *  fallback when the list doesn't name one on the map. */
export async function tokenForCard(card: string): Promise<{ id: string; name: string } | null> {
  try {
    const items = (await OBR.scene.items.getItems(
      (it: any) => (it.metadata as Record<string, unknown> | undefined)?.[BOUND_CARD_KEY] === card,
    )) as any[];
    if (!items.length) return null;
    let bound: unknown = null;
    try {
      const list = (await OBR.scene.getMetadata())[CARD_LIST_KEY];
      if (Array.isArray(list)) bound = list.find((c: any) => c?.id === card)?.boundedTokenId ?? null;
    } catch {}
    const it = items.find((x) => x.id === bound) ?? items[0];
    return { id: it.id, name: String(it.text?.plainText || it.name || "").trim() };
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
    return { tokenId: null, tokenName: "", hp: null, resources: [], hasDawn: false, hasDusk: false, conMod, form: null, statuses: [] };
  }
  let resources: Resource[] = [];
  let statuses: StatusChip[] = [];
  try {
    const [item] = await OBR.scene.items.getItems([tok.id]);
    resources = readResources(item ?? null);
    statuses = await statusChips(item);
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
    form: await formOfToken(tok.id),
    statuses,
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

// --- HP and resources (the suite's stat banner + resource panel) ---------------

/** HP of the token: set current / temp / max, or damage / heal
 *  (damage takes temporary HP first; heal stops at max). */
async function hp(a: Actor, data: any) {
  const itemId = await requireToken(a);
  const b = await readBubbles(itemId);
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  let cur = n(b.health) ?? 0;
  let temp = n(b["temporary health"]) ?? 0;
  let max = n(b["max health"]);
  const damage = n(data?.damage);
  const heal = n(data?.heal);
  if (damage != null && damage > 0) {
    const fromTemp = Math.min(temp, damage);
    temp -= fromTemp;
    cur -= damage - fromTemp;
  }
  if (heal != null && heal > 0) cur = max != null ? Math.min(max, cur + heal) : cur + heal;
  if (n(data?.current) != null) cur = n(data.current)!;
  if (n(data?.temp) != null) temp = Math.max(0, n(data.temp)!);
  if (n(data?.max) != null) max = Math.max(1, n(data.max)!);
  cur = Math.max(-999, cur);
  const after = await patchBubbles(itemId, {
    health: cur,
    "temporary health": temp,
    ...(max != null ? { "max health": max } : {}),
  });
  return { current: after.health ?? cur, temp: after["temporary health"] ?? temp, max: after["max health"] ?? max };
}

/** Roll at the table in the player's name; returns the roll for the
 *  phone's History (null when nothing was rolled). */
async function rollAtTable(a: Actor, expression: string, label: string, itemId: string, hidden: boolean) {
  const { payload } = await rollForCompanion(
    { expression, label, itemId, hidden },
    { id: a.player, name: a.name, color: a.color, via: "app", tokenName: a.cardName },
  );
  if (!payload) return null;
  return {
    total: payload.total,
    modifier: payload.modifier,
    label: payload.label,
    expression,
    hidden: !!payload.hidden,
    tokenName: payload.tokenName ?? "",
    rollerName: payload.rollerName,
    rollerColor: payload.rollerColor,
    dice: payload.dice.map((d) => ({ type: d.type, value: d.value, ...(d.loser ? { loser: true } : {}) })),
  };
}

/** Use / restore a resource: like a click on the suite's resource
 *  panel. `current` = the new value; for spell slots also `level`
 *  (0 = 1st), for hit dice `die` ("d8"). Using a "die roll" resource
 *  rolls its dice at the table first (the roll comes back too). */
async function res(a: Actor, data: any) {
  const itemId = await requireToken(a);
  const [item] = await OBR.scene.items.getItems([itemId]);
  const r = readResources(item ?? null).find((x) => x.id === data?.resourceId);
  if (!r) throw new Error("no such resource");
  const want = Math.round(Number(data?.current));
  if (!Number.isFinite(want)) throw new Error("bad value");
  let next: Resource;
  if (r.type === "spellSlots") {
    const lv = Math.floor(Number(data?.level));
    const slots = cleanSlots(r.slots);
    if (!slots[lv]) throw new Error("bad level");
    slots[lv] = { ...slots[lv], current: Math.max(0, Math.min(slots[lv].max, want)) };
    const tot = slotTotals(slots);
    next = { ...r, slots, current: tot.current, max: tot.max };
  } else if (r.type === "hitDice" && typeof data?.die === "string") {
    const pools = readPools(r).map((p) => (p.die === data.die ? { ...p, current: Math.max(0, Math.min(p.max, want)) } : p));
    const tot = slotTotals(pools);
    next = { ...r, pools, current: tot.current, max: tot.max };
  } else {
    // "number" may go above max (as in the suite); the others stop at max.
    const top = r.type === "number" ? Number.POSITIVE_INFINITY : r.max;
    next = { ...r, current: Math.max(0, Math.min(top, want)) };
  }
  const delta = next.current - r.current;
  if (delta === 0) return { current: r.current, max: r.max };

  // Die roll resource used → roll its dice first (in the player's name).
  let roll: unknown = null;
  if (r.type === "dieRoll" && delta < 0 && r.dieInfo) {
    const expression = dieRollFormula(r, -delta) ?? r.dieInfo;
    const label = `${r.name} ${t(getLocalLang(), "rpDieRollLabel")}`.trim();
    roll = await rollAtTable(a, expression, label, itemId, data?.hidden === true);
  }
  const updated = await updateResource(itemId, r.id, () => next);
  if (updated) void broadcastChanged(itemId, updated, delta, r.current);
  return { current: next.current, max: next.max, roll };
}

// --- Spell casts and feature uses ---------------------------------------------
// The suite's "Activation" windows (fullscreen-page.tsx → CastSpellModal /
// UseFeatureModal, host side in panel-page.ts → cc-cast-spell), for the
// phone: same chat card (cast-core.ts), same spending (spend.ts).

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A spell object from the player's card (name, level, stored fields).
 *  Size-capped: it comes from the phone. */
function cleanSpell(raw: unknown): any {
  if (!raw || typeof raw !== "object") throw new Error("bad spell");
  const spell = raw as Record<string, unknown>;
  const name = str(spell.name, 200);
  if (!name) throw new Error("bad spell");
  if (JSON.stringify(spell).length > 40_000) throw new Error("spell too large");
  return { ...spell, name };
}

/** 1–9, or null. */
function slotLevel(raw: unknown): number | null {
  const n = Math.floor(Number(raw));
  return n >= 1 && n <= 9 ? n : null;
}

/** The spell's details from the suite's libraries, for the cast window. */
async function spellInfo(_a: Actor, data: any) {
  const d = await effectiveSpellDetail(cleanSpell(data?.spell));
  return {
    meta: d.meta,
    hasSave: d.hasSave,
    body: d.body.slice(0, 6000),
    higher: d.higher.slice(0, 2000),
  };
}

/** Cast a spell / use a feature: spend the chosen spell slot or
 *  resource, post the card to Room Chat in the player's name, and roll a
 *  "die roll" resource's dice (the roll comes back for History). */
async function cast(a: Actor, data: any) {
  const itemId = await requireToken(a);
  const secret = data?.secret === true;
  const isFeature = data?.kind === "feature";
  let c: ChatCast;
  let slot = slotLevel(data?.slot);
  if (isFeature) {
    const f = (data?.feature ?? {}) as Record<string, unknown>;
    const name = str(f.name, 200);
    if (!name) throw new Error("bad feature");
    const lv = Math.floor(Number(f.level));
    c = buildFeatureUse({
      name,
      label: str(f.label, 80) || undefined,
      description: str(f.description, 8000),
      meta: Number.isFinite(lv) && f.level != null ? `Lv ${lv}` : undefined,
    });
  } else {
    const spell = cleanSpell(data?.spell);
    const baseLevel = Math.min(9, Math.max(0, Math.floor(Number(spell.level) || 0)));
    if (baseLevel === 0) slot = null; // cantrips never use a slot
    if (slot != null && slot < baseLevel) throw new Error("slot below spell level");
    const want = Math.floor(Number(data?.castLevel));
    const castLevel = slot ?? (castLevelOptions(baseLevel).includes(want) ? want : baseLevel);
    let detail = null;
    try {
      detail = await effectiveSpellDetail(spell);
    } catch {}
    const dc = Number(data?.dc);
    const charLv = Math.floor(Number(data?.characterLevel));
    c = buildCast({
      spellName: spell.name,
      baseLevel,
      castLevel,
      dcInput: data?.dc != null && Number.isFinite(dc) ? Math.round(dc) : null,
      cardDc: cardSaveDc(data?.cardDc),
      detail,
      characterLevel: charLv > 0 ? charLv : null,
    });
  }

  // A spell slot or an eligible resource — never both.
  let rollExpr: string | null = null;
  if (slot != null) {
    const spent = await spendSpellSlot(itemId, slot, { secret });
    if (!spent) throw new Error("no_slot");
    c.spent = spent;
  } else {
    const pick = cleanSpend(data?.spend);
    if (pick) {
      const res = await spendResource(itemId, pick, { secret });
      if (res) {
        const { roll, ...spent } = res;
        c.spent = spent;
        rollExpr = roll ?? null;
      }
    }
  }

  // Link the chat card to the token: dice in it roll with its stats.
  c.tokenId = itemId;
  await sendChat({ scope: secret ? "gm" : "all", text: "", cast: c, from: chatFrom(a) });
  const roll = rollExpr
    ? await rollAtTable(a, rollExpr, `${c.spellName} · ${c.spent?.name ?? ""}`, itemId, secret)
    : null;
  return { spent: c.spent ?? null, roll };
}

// --- Room Chat ------------------------------------------------------------------
// The phone reads the chat through this GM client (its history has every
// message) and writes into it in the player's name.

/** Send a chat message: to everyone, a whisper to the GM, or to a player. */
async function chat(a: Actor, data: any) {
  const scope = data?.scope as ChatScope;
  if (scope !== "all" && scope !== "gm" && scope !== "player") throw new Error("bad scope");
  const text = str(data?.text, MAX_TEXT);
  if (!text) throw new Error("empty");
  const toId = scope === "player" ? str(data?.toId, 100) : "";
  if (scope === "player" && !toId) throw new Error("no recipient");
  const ok = await sendChat({
    scope,
    text,
    ...(scope === "player" ? { toId, toName: str(data?.toName, 100) || "?" } : {}),
    from: chatFrom(a),
  });
  if (!ok) throw new Error("not sent");
  return { ok: true };
}

/** What the player may see of the chat history (last messages) and who
 *  they can whisper to. */
async function chatHistory(a: Actor) {
  const all = loadHistory(OBR.room.id || "room").filter((m) => isVisibleTo(m, a.player, "PLAYER"));
  // Newest first until ~300 KB, then back in time order.
  const out: ChatMessage[] = [];
  let size = 0;
  for (let i = all.length - 1; i >= 0 && out.length < 150; i--) {
    size += JSON.stringify(all[i]).length;
    if (size > 300_000) break;
    out.push(all[i]);
  }
  out.reverse();
  let players: Array<{ id: string; name: string }> = [];
  try {
    players = (await OBR.party.getPlayers())
      .filter((p) => p.role !== "GM" && p.id !== a.player)
      .map((p) => ({ id: p.id, name: p.name || "?" }));
  } catch {}
  return { messages: out, players };
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
    case "hp":
      return hp(a, data);
    case "res":
      return res(a, data);
    case "cast":
      return cast(a, data);
    case "spellInfo":
      return spellInfo(a, data);
    case "chat":
      return chat(a, data);
    case "formStatblock":
      // Read only: the form itself is bound in the suite.
      return { statblock: await formStatBlock(await requireToken(a)) };
    case "chatHistory":
      return chatHistory(a);
    default:
      throw new Error(`unknown action ${kind}`);
  }
}
