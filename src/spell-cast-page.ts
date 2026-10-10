// Standalone cast modal, opened by the character card's MINI panel
// (info-page.ts) when a spell chip is clicked. The fullscreen sheet has
// its own in-page Preact modal; both build the chat payload through
// cast-core.ts so the level list and DC rule stay identical.
import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang, startSceneSync, refreshFromScene, gateStateOn } from "./state";
import { t } from "./i18n";
import { effectiveSpellDetail, type SpellDetail } from "./modules/characterCards/spell-detail";
import {
  buildCast,
  castLevelOptions,
  cardSaveDc,
  type SlotMap,
} from "./modules/characterCards/cast-core";
import { sendChat } from "./modules/roomChat/send";
import { BC_CHAT_OPEN } from "./modules/roomChat/types";

const MODAL_ID = "com.obr-suite/spell-cast";
const lang = getLocalLang();
const en = lang === "en";
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let payload: { spell?: any; slots?: SlotMap; saveDc?: unknown; characterLevel?: number | null } = {};
try {
  payload = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
} catch {}
const spell = payload.spell ?? {};
const slots: SlotMap = payload.slots ?? {};
const baseLevel = Math.max(0, Math.floor(spell.level ?? 0));
const cardDc = cardSaveDc(payload.saveDc);

const levelLabel = (lv: number) =>
  lv === 0 ? (en ? "Cantrip" : "戏法") : en ? `Level ${lv}` : `${lv}环`;

const nameEl = $("name");
const lvlEl = $("lvl");
const metaEl = $("meta");
const levelField = $("levelField");
const levelSel = $<HTMLSelectElement>("level");
const dcField = $("dcField");
const dcInput = $<HTMLInputElement>("dc");
const dcLbl = $("dcLbl");
const dcNote = $("dcNote");
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

function close(): void {
  void OBR.modal.close(MODAL_ID);
}

async function cast(): Promise<void> {
  if (sending || !spell.name) return;
  sending = true;
  castBtn.disabled = true;
  cancelBtn.disabled = true;
  castBtn.textContent = tt("ccCastSending");
  let d = detail ?? null;
  if (!d) {
    try { d = await effectiveSpellDetail(spell); } catch {}
  }
  const n = parseInt(dcInput.value, 10);
  const c = buildCast({
    spellName: String(spell.name),
    baseLevel,
    castLevel: parseInt(levelSel.value, 10) || baseLevel,
    dcInput: Number.isFinite(n) ? n : null,
    cardDc,
    detail: d,
    characterLevel: payload.characterLevel ?? null,
  });
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

OBR.onReady(() => {
  // Read the real suite state (libraries, disabled sources, Data
  // Version) before any spell lookup — this page starts on defaults.
  startSceneSync();
  gateStateOn(refreshFromScene());
  $("title").textContent = tt("ccCastTitle");
  nameEl.textContent = `✨ ${spell.name ?? "?"}`;
  lvlEl.textContent = levelLabel(baseLevel);
  // "You are about to cast <b>X</b>. Choose the level at which …"
  const [pre, post] = tt("ccCastIntro").split("{name}");
  introEl.textContent = "";
  introEl.append(pre ?? "");
  const b = document.createElement("b");
  b.textContent = String(spell.name ?? "?");
  introEl.append(b, post ?? "");
  if (baseLevel > 0) introEl.append(" " + tt("ccCastIntroLevel"));
  cancelBtn.textContent = tt("ccCancel");
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

  castBtn.addEventListener("click", () => void cast());
  cancelBtn.addEventListener("click", close);
  $("close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sending) close();
    if (e.key === "Enter" && !sending) void cast();
  });

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
