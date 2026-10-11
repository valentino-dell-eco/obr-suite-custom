// Short rest → spend hit dice.
//
// Opened (as its own OBR modal) right after a SHORT REST on a card
// whose token has a "Hit dice" resource with dice left. The player
// picks how many to roll; each die heals roll + CON modifier (never
// below 0 per die). The roll goes through the suite's dice broadcast
// (toast + history), the HP lands on the token's HP bar (capped at max
// HP), the dice are taken off the resource and Room Chat gets a line.
// The window stays open so more dice can be spent; "Done" closes it.
import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { readBubbles, patchBubbles } from "./utils/statEdit";
import { readResources, updateResource } from "./modules/resourceTracker/storage";
import { broadcastChanged } from "./modules/resourceTracker/panel";
import { broadcastDiceRoll } from "./modules/dice";
import { sendChat } from "./modules/roomChat/send";
import {
  cleanPools,
  dieSides,
  hitDieSize,
  slotTotals,
  type HitDiePool,
  type Resource,
} from "./modules/resourceTracker/types";
import { HIT_DICE_MODAL_ID, type HitDicePayload } from "./modules/characterCards/hit-dice";

const lang = getLocalLang();
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let payload: HitDicePayload = { itemId: "" };
try {
  payload = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
} catch {}
const itemId = typeof payload.itemId === "string" ? payload.itemId : "";
const conMod = Number.isFinite(Number(payload.conMod)) ? Math.trunc(Number(payload.conMod)) : 0;
const charName = String(payload.name ?? "").trim() || "?";

const introEl = $("intro");
const subEl = $("sub");
const poolsEl = $("pools");
const countField = $("countField");
const resultEl = $("result");
const noteEl = $("note");
const rollBtn = $<HTMLButtonElement>("roll");
const doneBtn = $<HTMLButtonElement>("done");

let res: Resource | null = null;
let pools: HitDiePool[] = [];
/** Dice to roll per die size. */
let counts: Record<string, number> = {};
let busy = false;

const fmtMod = (n: number) => (n >= 0 ? `+${n}` : String(n));

function close(): void {
  void OBR.modal.close(HIT_DICE_MODAL_ID);
}

function readPools(r: Resource | null): HitDiePool[] {
  if (!r) return [];
  const p = cleanPools(r.pools);
  return p.length ? p : [{ die: hitDieSize(r.dieInfo) ?? "d8", current: r.current, max: r.max }];
}

/** Keep counts within what's left; default 1 die of the biggest size. */
function clampCounts(initial: boolean): void {
  const next: Record<string, number> = {};
  for (const p of pools) next[p.die] = Math.max(0, Math.min(p.current, Math.floor(counts[p.die] ?? 0)));
  if (initial) {
    const first = pools.find((p) => p.current > 0);
    if (first) next[first.die] = 1;
  }
  counts = next;
}

function totalCount(): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

function paint(): void {
  const cur = res?.current ?? 0;
  const max = res?.max ?? 0;
  const dice = pools.map((p) => `${p.max}${p.die}`).join(" + ") || "—";
  subEl.textContent = `${tt("hdLabel")}: ${cur} / ${max} · ${dice} · CON ${fmtMod(conMod)}`;
  introEl.textContent = tt("hdIntro")
    .replace("{name}", charName)
    .replace("{cur}", String(cur))
    .replace("{max}", String(max))
    .replace("{die}", dice)
    .replace("{con}", fmtMod(conMod));
  poolsEl.innerHTML = pools
    .map((p) => `<div class="pool">
      <span class="die">${p.die}</span>
      <span class="left">${p.current} / ${p.max}</span>
      <span class="stepper">
        <button type="button" data-die="${p.die}" data-step="-1">−</button>
        <input type="number" min="0" max="${p.current}" step="1" data-die="${p.die}" value="${counts[p.die] ?? 0}">
        <button type="button" data-die="${p.die}" data-step="1">+</button>
      </span>
    </div>`)
    .join("");
  const none = !res || cur <= 0;
  countField.classList.toggle("hidden", none);
  rollBtn.disabled = none || busy || totalCount() <= 0;
  if (none) {
    noteEl.textContent = tt("hdNone");
    noteEl.classList.remove("hidden");
  }
}

async function load(): Promise<void> {
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    res = readResources(items[0] ?? null).find((r) => r.type === "hitDice") ?? null;
  } catch {
    res = null;
  }
  pools = readPools(res);
  clampCounts(true);
  paint();
}

async function roll(): Promise<void> {
  if (busy || !res || totalCount() <= 0) return;
  busy = true;
  rollBtn.disabled = true;
  // Roll every chosen die; each heals roll + CON (minimum 0 per die).
  const rolled: Array<{ die: string; value: number }> = [];
  for (const p of pools) {
    const n = counts[p.die] ?? 0;
    const sides = dieSides(p.die);
    for (let i = 0; i < n; i++) rolled.push({ die: p.die, value: 1 + Math.floor(Math.random() * sides) });
  }
  const n = rolled.length;
  const heal = rolled.reduce((sum, r) => sum + Math.max(0, r.value + conMod), 0);

  // 1. Take the dice off their pools.
  let prev = 0;
  const updated = await updateResource(itemId, res.id, (r) => {
    prev = r.current;
    const next = readPools(r).map((p) => ({ ...p, current: Math.max(0, p.current - (counts[p.die] ?? 0)) }));
    const tot = slotTotals(next);
    return { ...r, pools: next, current: tot.current, max: tot.max, dieInfo: next[0]?.die ?? r.dieInfo };
  });
  if (updated) {
    res = updated;
    pools = readPools(updated);
    void broadcastChanged(itemId, updated, updated.current - prev, prev);
  }

  // 2. Heal the token (HP bar), capped at max HP.
  const before = await readBubbles(itemId);
  const hpNow =
    typeof before.health === "number"
      ? before.health
      : typeof payload.hpCurrent === "number"
        ? payload.hpCurrent
        : 0;
  const maxHp =
    typeof before["max health"] === "number"
      ? before["max health"]
      : typeof payload.hpMax === "number"
        ? payload.hpMax
        : null;
  const target = maxHp != null ? Math.min(maxHp, hpNow + heal) : hpNow + heal;
  const after = await patchBubbles(itemId, {
    health: target,
    ...(maxHp != null && typeof before["max health"] !== "number" ? { "max health": maxHp } : {}),
  });
  const hpTxt = `${after.health ?? target}${maxHp != null ? ` / ${maxHp}` : ""}`;

  // 3. Dice toast / history (rolled "by" the character's token).
  try {
    await broadcastDiceRoll({
      itemId,
      dice: rolled.map((r) => ({ type: r.die, value: r.value })),
      winnerIdx: -1,
      modifier: conMod * n,
      label: tt("hdLabel"),
      rollerId: itemId,
    });
  } catch {}

  // 4. Room Chat line (same "rest" notice style).
  const mix = pools
    .map((p) => (counts[p.die] ? `${counts[p.die]}${p.die}` : ""))
    .filter(Boolean)
    .join(" + ");
  try {
    const en = lang === "en";
    const text = tt("rcvChatHitDice")
      .replace("{name}", charName)
      .replace("{n}", String(n))
      .replace("{dice}", en ? (n === 1 ? "die" : "dice") : "")
      .replace("{heal}", String(heal));
    await sendChat({ scope: "all", text: `${text} (${mix} · ${hpTxt})`, tool: "rest" });
  } catch {}

  resultEl.textContent = tt("hdResult")
    .replace("{rolls}", rolled.map((r) => `${r.value}${conMod ? fmtMod(conMod) : ""}`).join(", "))
    .replace("{heal}", String(heal))
    .replace("{hp}", hpTxt);
  resultEl.classList.remove("hidden");
  busy = false;
  clampCounts(true);
  paint();
}

OBR.onReady(() => {
  $("title").textContent = tt("hdTitle");
  $("name").textContent = charName;
  $("countLbl").textContent = tt("hdCount");
  rollBtn.textContent = tt("hdRoll");
  doneBtn.textContent = tt("hdDone");
  $("close").addEventListener("click", close);
  doneBtn.addEventListener("click", close);
  rollBtn.addEventListener("click", () => void roll());
  poolsEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    if (!b || busy) return;
    const die = b.dataset.die ?? "";
    counts[die] = (counts[die] ?? 0) + parseInt(b.dataset.step ?? "0", 10);
    clampCounts(false);
    paint();
  });
  poolsEl.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset.die) return;
    counts[el.dataset.die] = Math.floor(Number(el.value) || 0);
    clampCounts(false);
    paint();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !busy) close();
    if (e.key === "Enter" && !busy) void roll();
  });
  if (!itemId) { paint(); return; }
  void load();
});
