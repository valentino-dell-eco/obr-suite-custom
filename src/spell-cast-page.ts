// Standalone cast / use modal, opened by the character card's MINI
// panel (info-page.ts):
//   * a spell chip   → cast it (level pick + editable save DC);
//   * a feature chip → use it (no level, no DC).
// Both can spend a resource of the bound token (Resource Tracker) and
// post a card to Room Chat. The fullscreen sheet has its own in-page
// Preact modals; all of them build the chat payload through
// cast-core.ts so the level list, DC rule and source display match.
import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang, startSceneSync, refreshFromScene, gateStateOn } from "./state";
import { t } from "./i18n";
import { effectiveSpellDetail, type SpellDetail } from "./modules/characterCards/spell-detail";
import {
  buildCast,
  buildFeatureUse,
  castLevelOptions,
  cardSaveDc,
  type SlotMap,
} from "./modules/characterCards/cast-core";
import {
  cleanSpend,
  eligibleResources,
  bestNameMatch,
  hasSpellSlots,
  resourceOptionLabel,
  slotOptions,
  spendResource,
  spendSpellSlot,
  tokenResources,
  type SlotOption,
} from "./modules/characterCards/spend";
import {
  amountFromClick,
  ensureSpendVisualStyles,
  spendVisualHtml,
} from "./modules/characterCards/spend-visual";
import type { Resource } from "./modules/resourceTracker/types";
import { sendChat } from "./modules/roomChat/send";
import { BC_CHAT_OPEN, type ChatCast } from "./modules/roomChat/types";

const MODAL_ID = "com.obr-suite/spell-cast";
const lang = getLocalLang();
const en = lang === "en";
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface FeaturePayload {
  name?: string;
  description?: string;
  /** Which list ("Class Features", …), already localized. */
  label?: string;
  level?: number | null;
}

let payload: {
  spell?: any;
  feature?: FeaturePayload;
  slots?: SlotMap;
  saveDc?: unknown;
  characterLevel?: number | null;
  /** Token bound to the card — whose resources can be spent. */
  itemId?: string | null;
} = {};
try {
  payload = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
} catch {}
const feature: FeaturePayload | null =
  payload.feature && typeof payload.feature.name === "string" ? payload.feature : null;
const isFeature = !!feature;
const spell = payload.spell ?? {};
const slots: SlotMap = payload.slots ?? {};
const baseLevel = Math.max(0, Math.floor(spell.level ?? 0));
const cardDc = cardSaveDc(payload.saveDc);
const itemId = typeof payload.itemId === "string" && payload.itemId ? payload.itemId : null;
const displayName = String((isFeature ? feature!.name : spell.name) ?? "?");

const levelLabel = (lv: number) =>
  lv === 0 ? (en ? "Cantrip" : "戏法") : en ? `Level ${lv}` : `${lv}环`;

const boxEl = $("box");
const nameEl = $("name");
const lvlEl = $("lvl");
const metaEl = $("meta");
const descEl = $("desc");
const levelField = $("levelField");
const levelLbl = $("levelLbl");
const levelSel = $<HTMLSelectElement>("level");
const dcField = $("dcField");
const dcInput = $<HTMLInputElement>("dc");
const dcLbl = $("dcLbl");
const dcNote = $("dcNote");
const resField = $("resField");
const resLbl = $("resLbl");
const resSel = $<HTMLSelectElement>("res");
const resVisual = $("resVisual");
const resNote = $("resNote");
const slotField = $("slotField");
const slotLbl = $("slotLbl");
const slotSel = $<HTMLSelectElement>("slot");
const slotVisual = $("slotVisual");
const slotNote = $("slotNote");
const introEl = $("intro");
const castBtn = $<HTMLButtonElement>("cast");
const cancelBtn = $<HTMLButtonElement>("cancel");

/** "Resource spent" entry meaning "a spell slot". */
const SLOTS = "__slots__";

let detail: SpellDetail | null | undefined = undefined;
let sending = false;

// What will be spent: "" = nothing, SLOTS = a spell slot, else a resource id.
let all: Resource[] = [];
let eligible: Resource[] = [];
let slotOpts: SlotOption[] = [];
let slotsAllowed = false;
let choice = "";
let amount = 1;
let slotLevel = 0;

function refreshDcLabel(): void {
  const n = parseInt(dcInput.value, 10);
  const edited = cardDc != null && n !== cardDc;
  dcLbl.innerHTML = "";
  dcLbl.append(tt("ccCastDcLabel"));
  if (edited) {
    const sp = document.createElement("span");
    sp.className = "edited";
    sp.textContent = ` · ${tt("ccCastDcEdited")}`;
    dcLbl.appendChild(sp);
  }
}

function option(value: string, text: string, disabled = false): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  o.disabled = disabled;
  return o;
}

function slotLabel(o: { level: number; current: number; max: number }): string {
  return tt("ccSlotOption")
    .replace("{n}", String(o.level))
    .replace("{cur}", String(o.current))
    .replace("{max}", String(o.max));
}

function chosenResource(): Resource | undefined {
  return choice && choice !== SLOTS ? eligible.find((r) => r.id === choice) : undefined;
}

function setNote(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

/** Redraw the "resource spent" block, the slot block and the level row. */
function paint(): void {
  const usingSlots = choice === SLOTS;
  // Resource spent
  resSel.value = choice;
  const r = chosenResource();
  if (r) {
    amount = Math.max(1, Math.min(Math.max(1, r.current), amount));
    resVisual.innerHTML = spendVisualHtml(r, amount, { titleSpend: tt("ccSpendClickHint") });
  } else {
    resVisual.innerHTML = "";
  }
  // Spell slot level
  slotField.classList.toggle("hidden", !usingSlots);
  if (usingSlots) {
    slotSel.value = String(slotLevel);
    const o = slotOpts.find((x) => x.level === slotLevel);
    const res = all.find((x) => x.type === "spellSlots");
    slotVisual.innerHTML = o
      ? spendVisualHtml({ type: "slot", icon: res?.icon, current: o.current, max: o.max }, 1, { interactive: false })
      : "";
    setNote(
      slotNote,
      !isFeature && o && o.level > baseLevel ? tt("ccSlotUpcast").replace("{n}", String(o.level)) : "",
    );
  }
  // Cast level: only when no spell slot decides it.
  levelField.classList.toggle("hidden", isFeature || baseLevel === 0 || usingSlots);
}

/** Load the bound token's resources and pick the default: spell slots
 *  first (spells, when one is left), else the first eligible resource,
 *  else nothing. */
async function loadResources(): Promise<void> {
  resField.classList.remove("hidden");
  resLbl.textContent = tt("ccSpendLabel");
  slotLbl.textContent = tt("ccSlotLevelLabel");
  resSel.innerHTML = "";
  resSel.appendChild(option("", tt("ccSpendNone")));
  if (!itemId) {
    resSel.disabled = true;
    setNote(resNote, tt("ccSpendNoToken"));
    paint();
    return;
  }
  all = await tokenResources(itemId);
  eligible = eligibleResources(all, isFeature ? "feature" : "spell");
  slotsAllowed = hasSpellSlots(all) && (isFeature || baseLevel > 0);
  slotOpts = slotsAllowed ? slotOptions(all, isFeature ? 1 : baseLevel) : [];

  if (slotsAllowed) {
    resSel.appendChild(
      option(SLOTS, tt(slotOpts.length ? "ccSlotsChoice" : "ccSlotsChoiceEmpty"), !slotOpts.length),
    );
    slotSel.innerHTML = "";
    for (const o of slotOpts) slotSel.appendChild(option(String(o.level), slotLabel(o)));
  }
  for (const r of eligible) resSel.appendChild(option(r.id, resourceOptionLabel(r)));

  if (!isFeature && slotOpts.length) {
    choice = SLOTS;
    slotLevel = slotOpts[0].level;
  } else if (isFeature) {
    // Features: only the resource named like the feature ("Wild Shape"
    // → "Wild Shape") is preselected; otherwise nothing is spent.
    choice = bestNameMatch(eligible, displayName)?.id ?? "";
    amount = 1;
  } else if (eligible.length) {
    choice = eligible[0].id;
    amount = 1;
  } else {
    choice = "";
  }
  if (isFeature && slotOpts.length) slotLevel = slotOpts[0].level;
  if (!eligible.length && !slotsAllowed) setNote(resNote, tt("ccSpendNoResources"));
  paint();
}

function close(): void {
  void OBR.modal.close(MODAL_ID);
}

async function confirm(): Promise<void> {
  if (sending || !displayName) return;
  sending = true;
  castBtn.disabled = true;
  cancelBtn.disabled = true;
  castBtn.textContent = tt(isFeature ? "ccUseSending" : "ccCastSending");

  const usingSlot = choice === SLOTS && slotLevel > 0;
  let c: ChatCast;
  if (isFeature) {
    c = buildFeatureUse({
      name: displayName,
      label: feature!.label,
      description: feature!.description,
      meta: feature!.level != null ? `Lv ${feature!.level}` : undefined,
    });
  } else {
    let d = detail ?? null;
    if (!d) {
      try { d = await effectiveSpellDetail(spell); } catch {}
    }
    const n = parseInt(dcInput.value, 10);
    c = buildCast({
      spellName: displayName,
      baseLevel,
      castLevel: usingSlot ? slotLevel : parseInt(levelSel.value, 10) || baseLevel,
      dcInput: Number.isFinite(n) ? n : null,
      cardDc,
      detail: d,
      characterLevel: payload.characterLevel ?? null,
    });
  }

  try {
    if (itemId && usingSlot) {
      const spent = await spendSpellSlot(itemId, slotLevel);
      if (spent) c.spent = spent;
    } else if (itemId && chosenResource()) {
      const pick = cleanSpend({ resourceId: choice, amount });
      if (pick) {
        const spent = await spendResource(itemId, pick);
        if (spent) c.spent = spent;
      }
    }
  } catch (e) {
    console.warn("[spell-cast] spend failed", e);
  }

  try {
    await sendChat({ scope: "all", text: "", cast: c });
    // Show the chat on top once this modal is gone (it may have been
    // auto-opened underneath it).
    await OBR.broadcast
      .sendMessage(BC_CHAT_OPEN, { front: true }, { destination: "LOCAL" })
      .catch(() => {});
  } catch (e) {
    console.error("[spell-cast] sendChat failed", e);
  }
  close();
}

function setIntro(key: "ccCastIntro" | "ccUseIntro", extra?: string): void {
  // "You are about to cast <b>X</b>. …"
  const [pre, post] = tt(key).split("{name}");
  introEl.textContent = "";
  introEl.append(pre ?? "");
  const b = document.createElement("b");
  b.textContent = displayName;
  introEl.append(b, post ?? "");
  if (extra) introEl.append(" " + extra);
}

OBR.onReady(() => {
  // Read the real suite state (libraries, disabled sources, Data
  // Version) before any spell lookup — this page starts on defaults.
  startSceneSync();
  gateStateOn(refreshFromScene());
  cancelBtn.textContent = tt("ccCancel");
  castBtn.addEventListener("click", () => void confirm());
  cancelBtn.addEventListener("click", close);
  $("close").addEventListener("click", close);
  ensureSpendVisualStyles();
  resSel.addEventListener("change", () => {
    choice = resSel.value;
    amount = 1;
    if (choice === SLOTS && !slotOpts.some((o) => o.level === slotLevel)) slotLevel = slotOpts[0]?.level ?? 0;
    paint();
  });
  slotSel.addEventListener("change", () => {
    slotLevel = parseInt(slotSel.value, 10) || 0;
    paint();
  });
  resVisual.addEventListener("click", (e) => {
    const r = chosenResource();
    if (!r || sending) return;
    const n = amountFromClick(e.target, r, amount);
    if (n != null) { amount = n; paint(); }
  });
  levelLbl.textContent = tt("ccCastLevelLabel");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sending) close();
    if (e.key === "Enter" && !sending && (e.target as HTMLElement)?.tagName !== "SELECT") void confirm();
  });
  void loadResources();

  if (isFeature) {
    $("title").textContent = tt("ccUseTitle");
    boxEl.classList.add("featbox");
    nameEl.textContent = `⚡ ${displayName}`;
    lvlEl.textContent = feature!.level != null ? `Lv ${feature!.level}` : "";
    metaEl.textContent = feature!.label ?? "";
    const desc = (feature!.description ?? "").trim();
    if (desc) {
      descEl.textContent = desc;
      descEl.classList.remove("hidden");
    }
    setIntro("ccUseIntro");
    levelField.classList.add("hidden");
    dcField.classList.add("hidden");
    castBtn.classList.add("use");
    castBtn.textContent = tt("ccUseConfirm");
    return;
  }

  $("title").textContent = tt("ccCastTitle");
  nameEl.textContent = `✨ ${displayName}`;
  lvlEl.textContent = levelLabel(baseLevel);
  setIntro("ccCastIntro", baseLevel > 0 ? tt("ccCastIntroLevel") : undefined);
  castBtn.textContent = tt("ccCastConfirm");

  if (baseLevel === 0) levelField.classList.add("hidden");
  for (const lv of castLevelOptions(baseLevel, slots)) {
    const o = document.createElement("option");
    o.value = String(lv);
    o.textContent = levelLabel(lv) + (lv === baseLevel ? ` (${tt("ccCastBaseLevel")})` : "");
    levelSel.appendChild(o);
  }
  dcInput.value = cardDc != null ? String(cardDc) : "";
  refreshDcLabel();
  dcInput.addEventListener("input", refreshDcLabel);

  metaEl.textContent = tt("ccSpellDetailLoading");
  void effectiveSpellDetail(spell).then((d) => {
    detail = d;
    metaEl.textContent = d.meta;
    // The DC field always stays; without a saving throw the DC simply
    // isn't attached to the chat message (cast-core.buildCast).
    if (!d.hasSave) {
      dcNote.textContent = tt("ccCastDcNoSave");
      dcNote.classList.remove("hidden");
    }
  });
});
