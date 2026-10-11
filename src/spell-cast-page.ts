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
  resourceOptionLabel,
  spendResource,
  tokenResources,
} from "./modules/characterCards/spend";
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
const levelSel = $<HTMLSelectElement>("level");
const dcField = $("dcField");
const dcInput = $<HTMLInputElement>("dc");
const dcLbl = $("dcLbl");
const dcNote = $("dcNote");
const resField = $("resField");
const resLbl = $("resLbl");
const resSel = $<HTMLSelectElement>("res");
const resAmt = $<HTMLInputElement>("resAmt");
const resNote = $("resNote");
const introEl = $("intro");
const castBtn = $<HTMLButtonElement>("cast");
const cancelBtn = $<HTMLButtonElement>("cancel");

let detail: SpellDetail | null | undefined = undefined;
let sending = false;

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

function refreshAmount(): void {
  resAmt.disabled = !resSel.value || sending;
}

/** Fill the resource select from the bound token. */
async function loadResources(): Promise<void> {
  resField.classList.remove("hidden");
  resLbl.textContent = tt("ccSpendLabel");
  resAmt.title = tt("ccSpendAmount");
  resSel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = tt("ccSpendNone");
  resSel.appendChild(none);
  if (!itemId) {
    resSel.disabled = true;
    resNote.textContent = tt("ccSpendNoToken");
    resNote.classList.remove("hidden");
    refreshAmount();
    return;
  }
  const list = await tokenResources(itemId);
  for (const r of list) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = resourceOptionLabel(r);
    resSel.appendChild(o);
  }
  if (!list.length) {
    resSel.disabled = true;
    resNote.textContent = tt("ccSpendNoResources");
    resNote.classList.remove("hidden");
  }
  refreshAmount();
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
      castLevel: parseInt(levelSel.value, 10) || baseLevel,
      dcInput: Number.isFinite(n) ? n : null,
      cardDc,
      detail: d,
      characterLevel: payload.characterLevel ?? null,
    });
  }

  const choice = cleanSpend({ resourceId: resSel.value, amount: resAmt.value });
  if (choice && itemId) {
    try {
      const spent = await spendResource(itemId, choice);
      if (spent) c.spent = spent;
    } catch (e) {
      console.warn("[spell-cast] spend resource failed", e);
    }
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
  resSel.addEventListener("change", refreshAmount);
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
