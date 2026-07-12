import OBR from "@owlbear-rodeo/sdk";
import { installDebugOverlay } from "../../utils/debugOverlay";
import { ICONS } from "../../icons";
import { resolveClickRollTarget } from "../dice/tags";
import {
  bindRollableContextMenu,
  bindRollableClickPopup,
} from "../dice/context-menu";
import { subscribeToSfx } from "../dice/sfx-broadcast";
import { bindPanelDrag } from "../../utils/panelDrag";
import { PANEL_IDS } from "../../utils/panelLayout";
import { readBubbles, type BubblesData } from "../../utils/statEdit";
import { mountResourcePanel } from "../resourceTracker/panel";
import { mountStatBanner } from "../../utils/statBanner";
import { installPanelZoom } from "../../utils/panelZoom";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";
import { normalizeCombatGearFlags } from "./data-normalize";
import {
  RecoveryType,
  BC_RECOVERY_NOTICE,
  expandRecoveryTypes,
  tokensHaveRecoveryType,
  writeRecoveryPassForTokens,
  rollChargeResource,
} from "./recovery";
import {
  showLrExtraConfirm,
  showChargesRollModal,
} from "./recovery-ui";

// 2026-05-13 — Was previously dev-only (gated through STABLE_HIDES /
// STABLE_HIDES_CC) until cc-fullscreen + hp-bar integration matured.
// Now ships in both stable and dev channels; flags removed.

// 2026-05-10: pin-panel feature. When ON, the cc-info popover stays
// open even after the user clears / changes selection — bg module
// reads the same localStorage key + listens for the broadcast below.
const LS_CC_INFO_PINNED = "obr-suite/cc-info-pinned";
const BC_CC_INFO_PIN_CHANGED = "com.obr-suite/cc-info-pin-changed";

let lang = getLocalLang();
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);

function readPanelPinned(): boolean {
  try {
    return localStorage.getItem(LS_CC_INFO_PINNED) === "1";
  } catch {
    return false;
  }
}

function togglePanelPinned(): void {
  const next = !readPanelPinned();
  try {
    localStorage.setItem(LS_CC_INFO_PINNED, next ? "1" : "0");
  } catch {}
  // Broadcast both LOCAL (so the bg module on this client picks it
  // up) and let the iframe re-render its button on next render call.
  try {
    OBR.broadcast.sendMessage(
      BC_CC_INFO_PIN_CHANGED,
      { pinned: next },
      { destination: "LOCAL" },
    );
  } catch {}
  // Update the DOM live without a full re-render — the pin state is
  // purely visual at this layer.
  const btn = document.querySelector<HTMLButtonElement>("#panel-pin-btn");
  if (btn) {
    btn.classList.toggle("pinned", next);
    btn.setAttribute("aria-pressed", String(next));
    btn.title = next ? tt("ccPanelPinned") : tt("ccPanelPinTooltip");
  }
}

// === Resource-tracker tab strip =============================================
// Same pattern as bestiary monster-info-page: name + statBanner stay
// pinned at the top, the tab strip slides an indicator between attr
// (existing chips / abilities / weapons / features) and res (resource
// tracker). Hover or click switches; mouse-leave returns the indicator
// to the active tab.

type RtTabId = "attr" | "res";
let activeRtTab: RtTabId = "attr";

function renderRtTabStrip(): string {
  // 2026-07 — per-card SR/LR/DW/DS recovery row, shown above the
  // attr/res tabs ("sopra le sezioni"). Hidden by default; visibility
  // is resolved async by refreshRecoveryPermission() right after this
  // markup lands in the DOM (owner-or-GM check needs a round trip).
  const recoveryRow = `
    <div class="cc-recovery-row" id="cardRecoveryRow" style="display:none">
      <button type="button" class="cc-recovery-btn" data-recovery="SR" title="${escapeHtml(tt("rcvBtnSRTitle"))}">SR</button>
      <button type="button" class="cc-recovery-btn" data-recovery="LR" title="${escapeHtml(tt("rcvBtnLRTitle"))}">LR</button>
      <button type="button" class="cc-recovery-btn" data-recovery="DW" title="${escapeHtml(tt("rcvBtnDWTitle"))}">DW</button>
      <button type="button" class="cc-recovery-btn" data-recovery="DS" title="${escapeHtml(tt("rcvBtnDSTitle"))}">DS</button>
    </div>
  `;
  return `
    ${recoveryRow}
    <div class="rt-tabstrip">
      <div class="rt-tab-indicator" data-rt-indicator></div>
      <button class="rt-tab ${activeRtTab === "attr" ? "on" : ""}" data-rt-tab="attr" type="button">${tt("ccTabAbilities")}</button>
      <button class="rt-tab ${activeRtTab === "res" ? "on" : ""}" data-rt-tab="res" type="button">${tt("ccTabResources")}</button>
    </div>
  `;
}

function setupRtTabSwitching(): void {
  const strip = root.querySelector<HTMLElement>(".rt-tabstrip");
  const clip = root.querySelector<HTMLElement>(".rt-clip");
  if (!strip) return;
  const buttons = strip.querySelectorAll<HTMLButtonElement>(".rt-tab");
  const indicator = strip.querySelector<HTMLElement>("[data-rt-indicator]");
  const moveIndicatorTo = (target: HTMLElement | null) => {
    if (!indicator || !target) return;
    indicator.style.transform = `translateX(${target.offsetLeft}px)`;
    indicator.style.width = `${target.offsetWidth}px`;
  };
  const findActiveButton = (): HTMLElement | null =>
    strip.querySelector<HTMLElement>(`.rt-tab[data-rt-tab="${activeRtTab}"]`);

  // 2026-05-12 — JS height tracking removed. .rt-clip uses CSS grid
  // overlap now; both panes share a single grid cell that sizes to
  // max(active, inactive) automatically. See monster-info-page.ts
  // for full rationale.
  requestAnimationFrame(() => moveIndicatorTo(findActiveButton()));

  const switchTo = (next: RtTabId) => {
    if (next === activeRtTab) return;
    activeRtTab = next;
    buttons.forEach((b) => b.classList.toggle("on", b.dataset.rtTab === next));
    moveIndicatorTo(findActiveButton());
    if (clip) clip.setAttribute("data-active", next);
    if (next === "res") void ensureRtResourceMount();
    // 2026-05-15 — pane swap changes content height (the inactive pane
    // collapses to 0). Re-fit the popover so e.g. a short attribute
    // tab → tall resource tab grows back, or vice-versa shrinks.
    queueAdjustHeight();
  };

  // 2026-05-15 — click-only switching. Hover-to-switch (added in
  // 2026-05-11b for "instant" feedback) made the panel jumpy: any
  // accidental mouse-over while reading the resource list would flip
  // back to attributes. User explicitly asked to revert to click.
  buttons.forEach((b) => {
    const target = (b.dataset.rtTab as RtTabId) ?? "attr";
    b.addEventListener("click", () => switchTo(target));
  });
}

// --- Per-card recovery buttons (SR/LR/DW/DS) ------------------------------
//
// Visible to the card's owner OR the GM (see refreshRecoveryPermission).
// Touches only `boundItemId` — the token currently bound to THIS card.
// Shares its actual logic with the global button row in panel-page.ts
// via the recovery.ts / recovery-ui.ts modules, so both stay in sync
// behaviourally without duplicating the write/roll code.

async function refreshRecoveryPermission(): Promise<void> {
  canUseRecoveryButtons = false;
  if (cachedIsGM) {
    canUseRecoveryButtons = true;
  } else if (boundItemId) {
    try {
      const myId = await OBR.player.getId();
      const items = await OBR.scene.items.getItems([boundItemId]);
      canUseRecoveryButtons =
        (items[0] as any)?.createdUserId === myId;
    } catch {
      canUseRecoveryButtons = false;
    }
  }
  const row = root.querySelector<HTMLElement>("#cardRecoveryRow");
  if (row) {
    row.style.display = canUseRecoveryButtons && boundItemId ? "grid" : "none";
  }
}

function wireCardRecoveryButtons(): void {
  const row = root.querySelector<HTMLElement>("#cardRecoveryRow");
  if (!row) return;
  row.addEventListener("click", (e) => {
    if (!canUseRecoveryButtons || !boundItemId) return;
    const btn = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "button[data-recovery]",
    );
    if (!btn || btn.disabled) return;
    const type = btn.dataset.recovery as RecoveryType | undefined;
    if (!type) return;
    const buttons = Array.from(
      row.querySelectorAll<HTMLButtonElement>("button[data-recovery]"),
    );
    for (const b of buttons) b.disabled = true;
    runCardRecovery(type).finally(() => {
      for (const b of buttons) b.disabled = false;
    });
  });
}

async function runCardRecovery(pressed: RecoveryType): Promise<void> {
  const itemId = boundItemId;
  if (!itemId) return;

  let dawn = false;
  let dusk = false;
  if (pressed === "LR") {
    const [hasDawn, hasDusk] = await Promise.all([
      tokensHaveRecoveryType([itemId], "DW"),
      tokensHaveRecoveryType([itemId], "DS"),
    ]);
    if (hasDawn || hasDusk) {
      const choice = await showLrExtraConfirm({
        hasDawn,
        hasDusk,
        title: tt("rcvConfirmDwDsTitle"),
        bodyText: tt("rcvConfirmDwDsBody"),
        dawnLabel: tt("rcvConfirmDwDsDawn"),
        duskLabel: tt("rcvConfirmDwDsDusk"),
        continueLabel: tt("rcvConfirmDwDsConfirm"),
      });
      dawn = choice.dawn;
      dusk = choice.dusk;
    }
  }
  const types = expandRecoveryTypes(pressed, dawn, dusk);

  const needsRollByItem = await writeRecoveryPassForTokens([itemId], types);
  // Reflect the instant part of the write in the Resources tab right
  // away rather than waiting on the scene-sync round trip.
  void rtMountHandle?.refresh();

  const resources = needsRollByItem.get(itemId) ?? [];
  if (resources.length > 0) {
    showChargesRollModal({
      title: tt("rcvChargesModalTitle"),
      rechargeLabel: tt("rcvBtnRecharge"),
      closeLabel: tt("reClose"),
      groups: [
        {
          rows: resources.map((r) => ({
            itemId,
            resourceId: r.id,
            name: r.name,
            current: r.current,
            max: r.max,
            formula: r.chargesFormula || "",
            onRecharge: async () => {
              const result = await rollChargeResource(itemId, r);
              void rtMountHandle?.refresh();
              if (!result) return null;
              return {
                current: result.resource.current,
                max: result.resource.max,
                total: result.total,
              };
            },
          })),
        },
      ],
    });
  }

  // FYI-only notice to the GM — never sent when the GM itself pressed
  // the button (nothing to notify itself about).
  if (!cachedIsGM) {
    try {
      const playerName = (await OBR.player.getName()) || "?";
      OBR.broadcast.sendMessage(
        BC_RECOVERY_NOTICE,
        { playerName, cardName: currentCardDisplayName, types },
        { destination: "REMOTE" },
      );
    } catch (e) {
      console.warn("[cc-info] recovery notice broadcast failed", e);
    }
  }
}

let rtMountHandle: {
  refresh: () => Promise<void>;
  unmount: () => void;
} | null = null;
// Shared stat-banner component handle (HP / temp HP / AC / lock). Same
// lifecycle as rtMountHandle — render() unmounts the previous instance
// and re-mounts so the component's scene.items.onChange subscription
// doesn't leak one listener per card switch.
let ccStatHandle: { refresh: () => Promise<void>; unmount: () => void } | null =
  null;
async function ensureRtResourceMount(): Promise<void> {
  const container = root.querySelector<HTMLElement>("#rt-mount");
  if (!container) return;
  rtMountHandle?.unmount();
  rtMountHandle = mountResourcePanel({
    container,
    getItemId: () => boundItemId,
  });
  await rtMountHandle.refresh();
  // The resource panel can grow / shrink as items are added/removed.
  // Re-fit the popover so the active="res" pane drives popover height.
  queueAdjustHeight();
}

const SHOW_MSG = "com.character-cards/info-show";

const root = document.getElementById("root") as HTMLDivElement;

// 2026-05-15 — popover-height auto-shrink. The popover opens at
// INFO_HEIGHT (260px in index.ts) so it has room for the tallest
// likely card, but on most cards the actual content is ~180-240px and
// the leftover whitespace makes the panel feel oversized + blocks
// canvas underneath. After every render / pane-switch we measure
// the content's actual extent and ask OBR to shrink the popover. We
// never grow past INFO_MAX_HEIGHT (captured at OBR.onReady from the
// actual opened popover height — respects user resize via the layout
// editor), so long content keeps an inner scrollbar instead of
// escaping the popover.
//
// NOTE on measurement: `root.scrollHeight` does NOT work here. Per
// CSSOM spec, scrollHeight on an `overflow:auto` box returns
// max(content, clientHeight) — i.e. when content is SHORTER than
// the box it just returns the box height, defeating the shrink. So
// we measure the children's bounding rects directly: the bottom of
// the lowest child minus the top of the highest child + root's own
// vertical padding gives the true content extent regardless of box
// size. This is the bug the user reported as "高度依旧过高导致需要
// 滚轮，但实际上内容并没有到需要滚轮的程度" — content fit fine but
// the popover stayed at INFO_HEIGHT because scrollHeight === clientHeight.
const INFO_POPOVER_ID = "com.obr-suite/cc-info";
const INFO_MIN_HEIGHT = 140;
let INFO_MAX_HEIGHT = 360;

let _adjustQueued = false;
function queueAdjustHeight(): void {
  if (_adjustQueued) return;
  _adjustQueued = true;
  // Two RAFs so the browser has time to lay out + the slide-pane
  // transitions stop animating (transform isn't part of scrollHeight,
  // but the inactive pane's height:0 collapse only takes effect after
  // the data-active attribute flip is committed).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      _adjustQueued = false;
      void adjustHeight();
    });
  });
}

function measureContentHeight(): number {
  if (!root.children.length) return 0;
  const rootRect = root.getBoundingClientRect();
  let contentTop = rootRect.bottom;
  let contentBottom = rootRect.top;
  for (const child of Array.from(root.children) as HTMLElement[]) {
    // Skip invisible children (e.g. inactive .rt-pane is height:0 +
    // overflow:hidden — its bounding rect is a zero-height line but
    // still contributes a single point, throwing off the min/max.
    // `offsetHeight === 0` filters cleanly).
    if (child.offsetHeight === 0) continue;
    const r = child.getBoundingClientRect();
    if (r.top < contentTop) contentTop = r.top;
    if (r.bottom > contentBottom) contentBottom = r.bottom;
  }
  if (contentBottom <= contentTop) return 0;
  const cs = getComputedStyle(root);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  // contentTop is at root's padding-top edge in viewport coords; root's
  // top is `rootRect.top` (= padding-top edge minus padTop). So the
  // content area extent is (contentBottom - contentTop), and adding
  // both vertical paddings reconstructs the full box height the popover
  // would need.
  return contentBottom - contentTop + padTop + padBottom;
}

async function adjustHeight(): Promise<void> {
  const contentH = measureContentHeight();
  if (!contentH) return;
  // +6 for a tiny breathing margin so the bottom border doesn't kiss
  // the popover edge. Clamp to [MIN, MAX] — never exceed the popover's
  // opened height (so user-resized larger popovers stay larger).
  const target = Math.max(
    INFO_MIN_HEIGHT,
    Math.min(contentH + 6, INFO_MAX_HEIGHT),
  );
  try {
    await OBR.popover.setHeight(INFO_POPOVER_ID, target);
  } catch {
    /* popover may have closed mid-flight */
  }
}

// The token id this card is currently bound to. Updated whenever the
// info popover is shown for a different character. Quick-rolls fire
// on this token (for camera focus + dice anchoring above the head).
let boundItemId: string | null = null;

const ABBR: Record<string, string> = {
  str: tt("ccAbbrStr"),
  dex: tt("ccAbbrDex"),
  con: tt("ccAbbrCon"),
  int: tt("ccAbbrInt"),
  wis: tt("ccAbbrWis"),
  cha: tt("ccAbbrCha"),
};
// Full Chinese names for the dice-roll label (e.g. "敏捷检定" rather
// than "敏检定"). Used for the panel-page formula label / history
// display — the chip itself still shows the single-char ABBR.
const FULL: Record<string, string> = {
  str: tt("ccFullStr"),
  dex: tt("ccFullDex"),
  con: tt("ccFullCon"),
  int: tt("ccFullInt"),
  wis: tt("ccFullWis"),
  cha: tt("ccFullCha"),
};
const ORDER = ["str", "dex", "con", "int", "wis", "cha"];

function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function renderNameButton(name: string, clickable: boolean): string {
  if (!clickable) {
    return `<div class="name">${escapeHtml(name)}</div>`;
  }
  const title = t(getLocalLang(), "ccInfoNameSyncTitle").replace(
    "{name}",
    name,
  );
  return `<button class="name name-btn" type="button" data-name-text="${escapeHtml(name)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(name)}</button>`;
}

async function toggleTokenNameText(
  itemId: string,
  name: string,
  btn: HTMLButtonElement,
): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) return;
  btn.disabled = true;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    const current = String((items[0] as any)?.text?.plainText ?? "").trim();
    const next = current === cleanName ? "" : cleanName;
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      for (const d of drafts) {
        const anyDraft = d as any;
        anyDraft.text = {
          ...(anyDraft.text ?? {}),
          type: anyDraft.text?.type ?? "PLAIN",
          plainText: next,
        };
      }
    });
  } catch (e) {
    console.warn("[character-cards/info] toggle token name text failed", e);
  } finally {
    btn.disabled = false;
  }
}

function fmtMod(n: unknown): string {
  if (typeof n !== "number") return "?";
  return n >= 0 ? `+${n}` : `${n}`;
}

// attack_bonus is either "+3" (weapons) or "D20+7" (spells). Normalise to
// just the signed bonus like "+7".
function extractBonus(s: unknown): string {
  const str = String(s ?? "");
  const m = /([+-]\s*\d+)\s*$/.exec(str);
  if (!m) return str || "?";
  return m[1].replace(/\s+/g, "");
}

// Split a weapon's `properties` string into individual chips, each
// clickable to search the property name in the suite's global search.
//
// Delimiter handling is paren-aware: commas / slashes inside `(…)`
// or `（…）` belong to the same tag and don't trigger a split — that
// way "投掷(射程20，60)" stays one chip instead of getting torn into
// "投掷(射程20" and "60)". Supports CN+ASCII commas, slashes, and
// the explicit "精通：xxx" 2024-mastery prefix.
function renderWeaponPropertyChips(raw: string): string {
  if (!raw.trim()) return "";
  const out: string[] = [];
  // Split mastery from the rest first — "精通：xxx" or "精通: xxx"
  // is a single mastery label, even if the rest is comma-separated.
  let masteryPart = "";
  let restPart = raw;
  const mastM = /精通\s*[：:]\s*([^,，、/\s]+)/.exec(raw);
  if (mastM) {
    masteryPart = mastM[1];
    restPart = raw.replace(mastM[0], "").replace(/[,，、]\s*$/, "");
  }
  const tags: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of restPart) {
    if (ch === "(" || ch === "（") depth++;
    else if (ch === ")" || ch === "）") depth = Math.max(0, depth - 1);
    if (
      depth === 0 &&
      (ch === "," || ch === "，" || ch === "、" || ch === "/")
    ) {
      const t = buf.trim();
      if (t) tags.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) tags.push(tail);
  for (const t of tags) {
    // For search, strip any "(...)" parenthetical so a chip labelled
    // "投掷(射程20，60)" looks up just "投掷" in the index. The
    // visible label keeps the full text.
    const searchKey = t.replace(/[(（][^)）]*[)）]\s*/g, "").trim() || t;
    out.push(
      `<span class="prop prop-chip" data-search="${escapeHtml(searchKey)}" title="${tt("ccSearchTitle")}：${escapeHtml(searchKey)}">${escapeHtml(t)}</span>`,
    );
  }
  if (masteryPart) {
    out.push(
      `<span class="prop prop-chip prop-mastery" data-search="${escapeHtml(masteryPart)}" title="${tt("ccMasterySearchTitle")}：${escapeHtml(masteryPart)}"><em>${tt("ccMasteryLabel")}</em>${escapeHtml(masteryPart)}</span>`,
    );
  }
  return out.length ? `<span class="prop-row">${out.join("")}</span>` : "";
}

function classesStr(d: any): string {
  if (!Array.isArray(d.classes)) return "";
  return d.classes
    .map((c: any) => {
      const nm = c.name || c.class_name || c.cls || "";
      const lv = c.level ?? c.lvl ?? "";
      return `${nm}${lv}`;
    })
    .filter(Boolean)
    .join("/");
}

let currentCardId: string | null = null;
let currentRoomId: string | null = null;
type CardDataSource = "imported" | "dirty" | "server";
type CardCacheEntry = { data: any; source: CardDataSource };
const cardCache = new Map<string, CardCacheEntry>();

// const SERVER_ORIGIN = "https://obr.dnd.center";
const SERVER_ORIGIN = "/api-dnd-center";
const API_BASE = `${SERVER_ORIGIN}/api/character`;
const LS_PREFIX = "character-cards/";

// Broadcast ids mirrored from panel-page.ts / fullscreen-page.tsx.
const BC_CARD_UPDATED = "com.obr-suite/cc-card-updated";
const BC_DIRTY_CHANGED = "com.obr-suite/cc-dirty-changed";

// Cloud status icons — same glyphs as cc-panel sidebar.
const CLOUD_SYNCED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
const CLOUD_DIRTY_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="16" x2="12" y2="18"/></svg>`;
const CLOUD_LOCAL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>`;
const CLOUD_SPINNER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-dasharray="28 56" stroke-linecap="round"/></svg>`;
const REFRESH_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8 a5 5 0 1 0 1.5 -3.5"/><path d="M3.2 3 V5.5 H5.5"/></svg>`;

let syncLoading = false;

function resolveCardDataSource(cardId: string): CardDataSource {
  if (cardId.startsWith("imported_")) return "imported";
  if (localStorage.getItem(`cc-dirty/${cardId}`)) return "dirty";
  return "server";
}

function getSyncStatus(cardId: string): "synced" | "dirty" | "local" {
  if (cardId.startsWith("imported_")) return "local";
  if (localStorage.getItem(`cc-dirty/${cardId}`)) return "dirty";
  return "synced";
}

function cacheEntryValid(cardId: string, entry: CardCacheEntry): boolean {
  return entry.source === resolveCardDataSource(cardId);
}

// Same load order as fullscreen-page.tsx: imported → cc-dirty → server.
async function fetchCardData(
  cardId: string,
  roomId: string,
  signal?: AbortSignal,
): Promise<{ data: any; source: CardDataSource }> {
  let json: any;
  let source: CardDataSource = "server";

  if (cardId.startsWith("imported_")) {
    const localKey = `${LS_PREFIX}imported/${cardId}`;
    const storedData = localStorage.getItem(localKey);
    if (!storedData) throw new Error(tt("ccErrImportedMissing"));
    json = JSON.parse(storedData);
    source = "imported";
  } else {
    const dirtyKey = `cc-dirty/${cardId}`;
    const dirtyData = localStorage.getItem(dirtyKey);
    if (dirtyData) {
      try {
        json = JSON.parse(dirtyData);
        source = "dirty";
      } catch {
        json = null;
      }
    }
    if (!json) {
      const url = `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
      source = "server";
    }
  }

  return {
    data: normalizeCombatGearFlags(json),
    source: source,
  };
}

async function uploadDirtyCardToServer(cardId: string): Promise<void> {
  if (!currentRoomId || cardId.startsWith("imported_")) return;
  const dirtyKey = `cc-dirty/${cardId}`;
  const stored = localStorage.getItem(dirtyKey);
  if (!stored) return;

  updateSyncButtons("loading");
  try {
    const parsed = JSON.parse(stored);
    const url = `${API_BASE}/${encodeURIComponent(currentRoomId)}/${encodeURIComponent(cardId)}/data`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} — ${errText.slice(0, 120)}`);
    }

    localStorage.removeItem(dirtyKey);
    try {
      localStorage.removeItem(`cc-dirty-ts/${cardId}`);
    } catch {}
    cardCache.delete(cardId);
    try {
      const payload = {
        cardId,
        url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(currentRoomId)}/${encodeURIComponent(cardId)}/`,
      };
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "LOCAL",
      });
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "REMOTE",
      });
      OBR.broadcast.sendMessage(
        BC_DIRTY_CHANGED,
        { cardId },
        { destination: "LOCAL" },
      );
    } catch {}
    if (currentCardId === cardId && currentRoomId) {
      await showCard(cardId, currentRoomId, { force: true });
    } else {
      updateSyncButtons(getSyncStatus(cardId));
    }
  } catch (e) {
    console.warn("[cc-info] dirty upload failed", e);
    updateSyncButtons("dirty");
  }
}

function renderSyncCloudMarkup(
  cardId: string,
  loading = false,
): { className: string; title: string; html: string } {
  if (loading) {
    return {
      className: "cc-cloud is-spinning",
      title: tt("ccLoadingCard"),
      html: CLOUD_SPINNER_SVG,
    };
  }
  const status = getSyncStatus(cardId);
  if (status === "local") {
    return {
      className: "cc-cloud is-local",
      title: tt("ccPanelLocalOnlyTitle"),
      html: CLOUD_LOCAL_SVG,
    };
  }
  if (status === "dirty") {
    return {
      className: "cc-cloud is-dirty",
      title: tt("ccPanelDirtyTitle"),
      html: CLOUD_DIRTY_SVG,
    };
  }
  return {
    className: "cc-cloud is-synced",
    title: tt("ccPanelSyncedTitle"),
    html: CLOUD_SYNCED_SVG,
  };
}

function updateSyncButtons(
  state: "synced" | "dirty" | "local" | "loading",
): void {
  if (!currentCardId) return;
  const cloud = root.querySelector<HTMLButtonElement>("#cc-cloud-btn");
  const refresh = root.querySelector<HTMLButtonElement>("#cc-refresh-btn");
  if (!cloud || !refresh) return;

  const loading = state === "loading";
  syncLoading = loading;
  const cloudUi = renderSyncCloudMarkup(currentCardId, loading);
  cloud.className = cloudUi.className;
  cloud.title = cloudUi.title;
  cloud.innerHTML = cloudUi.html;
  cloud.style.pointerEvents =
    loading || state === "synced" || state === "local" ? "none" : "";
  refresh.classList.toggle("spinning", loading);
  refresh.disabled = loading;
}

function setupSyncControls(cardId: string): void {
  const cloud = root.querySelector<HTMLButtonElement>("#cc-cloud-btn");
  const refresh = root.querySelector<HTMLButtonElement>("#cc-refresh-btn");
  if (!cloud || !refresh) return;

  updateSyncButtons(getSyncStatus(cardId));

  refresh.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    void refreshCurrentCard();
  };

  cloud.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (getSyncStatus(cardId) === "dirty") {
      void uploadDirtyCardToServer(cardId);
    }
  };
}

async function refreshCurrentCard(): Promise<void> {
  const cardId = currentCardId;
  const roomId = currentRoomId;
  if (!cardId || !roomId) return;

  updateSyncButtons("loading");
  cardCache.delete(cardId);
  try {
    await showCard(cardId, roomId, { force: true });
    if (!cardId.startsWith("imported_")) {
      try {
        const payload = {
          cardId,
          url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/`,
        };
        OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
          destination: "LOCAL",
        });
        OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
          destination: "REMOTE",
        });
      } catch {}
    }
  } finally {
    if (currentCardId === cardId) {
      updateSyncButtons(getSyncStatus(cardId));
    }
  }
}

// Cached role lookup. The DM-only lock button at the right end of the
// stat banner reads this. OBR.onReady below populates it before any
// showCard runs, so the very first render already has the right value.
let cachedIsGM = false;
// Recovery buttons (SR/LR/DW/DS) — set by render() so
// runCardRecovery()'s GM-notice broadcast can label which card a
// player used the buttons on. See refreshRecoveryPermission() /
// wireCardRecoveryButtons() further down for the rest of the feature.
let currentCardDisplayName = "";
let canUseRecoveryButtons = false;

async function showCard(
  cardId: string,
  roomId: string,
  opts?: { force?: boolean },
) {
  currentCardId = cardId;
  currentRoomId = roomId;

  // Cache hit — only when the cached source still matches local state
  // (server vs cc-dirty vs imported). Mirrors fullscreen load order.
  if (!opts?.force) {
    const cached = cardCache.get(cardId);
    if (cached && cacheEntryValid(cardId, cached)) {
      const live = await readLiveBubbles();
      render(cached.data, cardId, roomId, live);
      return;
    }
  }

  // Cold load: only show "loading" if nothing's rendered yet (first open).
  // When switching between bound characters, keep the previous card's content
  // on screen until the new data arrives — single atomic A→B swap, no flash.
  const isEmpty = root.childElementCount === 0;
  if (isEmpty) {
    root.innerHTML = `<div class="loading">${escapeHtml(tt("ccLoadingCard"))}</div>`;
  } else {
    updateSyncButtons("loading");
  }

  try {
    const [{ data: d, source }, live] = await Promise.all([
      fetchCardData(cardId, roomId),
      readLiveBubbles(),
    ]);
    // If user switched cards between fetch start and end, ignore.
    if (currentCardId !== cardId) return;
    cardCache.set(cardId, { data: d, source });
    render(d, cardId, roomId, live);
  } catch (e: any) {
    if (currentCardId !== cardId) return;
    syncLoading = false;
    root.innerHTML = `<div class="err">${escapeHtml(tt("ccLoadFailedPrefix"))}${escapeHtml(e?.message ?? e)}</div>`;
  }
}

// Read the bound token's live bubbles metadata so the panel reflects
// the canonical HP/AC state (which the bubbles bar above the token
// also draws from). Falls back to {} when no token is bound — render()
// then uses the static card data values.
async function readLiveBubbles(): Promise<BubblesData> {
  if (!boundItemId) return {};
  return readBubbles(boundItemId);
}

function render(
  d: any,
  cardId: string,
  roomId: string,
  live: BubblesData = {},
) {
  const id = d.identity || {};
  const cs = d.core_stats || {};
  const ab = d.abilities || {};
  const cb = d.combat || {};
  const sp = d.spellcasting || {};

  const name =
    id.display_name || id.character_name || t(getLocalLang(), "ccInfoUnnamed");
  currentCardDisplayName = name;
  const cls = classesStr(d);
  const lvl = d.total_level != null ? `Lv${d.total_level}` : "";
  const sub = [cls, lvl].filter(Boolean).join(" ");

  const rawUrl = `https://obr.dnd.center/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/`;

  const hp = cs.hp || {};
  const statFallback: Partial<Record<keyof BubblesData, number>> = {
    health: typeof hp.current === "number" ? hp.current : 0,
    "max health": typeof hp.max === "number" ? hp.max : 0,
    "temporary health": typeof hp.temp === "number" ? hp.temp : 0,
    "armor class": typeof cs.ac === "number" ? cs.ac : 10,
  };

  const speedStr = cs.speed != null ? `${cs.speed}${tt("ccFtUnit")}` : "?";
  const castAbility = sp.spellcasting_ability || "—";

  const statBanner = `<div class="cc-stat-mount" id="cc-stat-mount"></div>`;

  const initExpr = `1d20${cs.initiative >= 0 ? `+${cs.initiative}` : cs.initiative}`;
  const chips = `
    <div class="chip init" ><span class="k">${tt("ccInit")}</span><span class="v rollable" data-expr="${initExpr}" data-label="${tt("ccFullInit")}">${fmtMod(cs.initiative)}</span></div>
    <div class="chip"><span class="k">${tt("ccSpeed")}</span><span class="v">${escapeHtml(speedStr)}</span></div>
    <div class="chip"><span class="k">${tt("ccPassivePerception")}</span><span class="v">${escapeHtml(cs.passive_perception)}</span></div>
    <div class="chip"><span class="k">${tt("ccProfBonus")}</span><span class="v">${fmtMod(cs.proficiency_bonus)}</span></div>
    <div class="chip"><span class="k">${tt("ccSaveDC")}</span><span class="v">${escapeHtml(cs.dc)}</span></div>
    <div class="chip"><span class="k">${tt("ccSpellcastingAbility")}</span><span class="v">${escapeHtml(castAbility)}</span></div>
  `;

  const skills = Array.isArray(d.skills) ? d.skills : [];
  const skillsByAbil: Record<string, any[]> = {};
  for (const s of skills) {
    const k = String(s?.ability ?? "").toLowerCase();
    if (!k) continue;
    (skillsByAbil[k] ??= []).push(s);
  }

  const renderSkillRow = (s: any) => {
    const cls =
      s.proficiency === "expertise"
        ? "sk sk-exp"
        : s.proficiency === "proficient"
          ? "sk sk-prof"
          : "sk";
    const total = typeof s.total === "number" ? s.total : 0;
    const expr = `1d20${total >= 0 ? `+${total}` : total}`;
    const lbl = `${s.name ?? "?"}`;
    return `<div class="${cls} rollable" data-expr="${expr}" data-label="${escapeHtml(lbl)}" title="${escapeHtml(lbl)} ${expr}">
      <span class="sk-n">${escapeHtml(s.name ?? "?")}</span>
      <span class="sk-v">${fmtMod(s.total)}</span>
    </div>`;
  };

  const abl = ORDER.map((k) => {
    const a = ab[k] || {};
    const prof = !!a.save?.proficient;
    const skList = skillsByAbil[k] ?? [];
    const skHtml = skList.map(renderSkillRow).join("");
    const aMod = typeof a.modifier === "number" ? a.modifier : 0;
    const aExpr = `1d20${aMod >= 0 ? `+${aMod}` : aMod}`;
    const aLbl = `${FULL[k] ?? ABBR[k] ?? k}${t(getLocalLang(), "ccInfoSkillSuffix")}`;
    const saveBonus =
      typeof a.save?.bonus === "number"
        ? a.save.bonus
        : a.save?.proficient
          ? aMod + (cs.proficiency_bonus ?? 0)
          : aMod;
    const saveExpr = `1d20${saveBonus >= 0 ? `+${saveBonus}` : saveBonus}`;
    const saveLbl = `${FULL[k] ?? ABBR[k] ?? k}${t(getLocalLang(), "ccInfoSaveSuffix")}`;
    return `<div class="abl${prof ? " prof" : ""}">
        <div class="abl-head">
          <span class="a rollable" data-expr="${saveExpr}" data-label="${escapeHtml(saveLbl)}" title="${escapeHtml(saveLbl)} ${saveExpr}">${ABBR[k]}</span>
          <span class="t" style="padding-left: 5px !important;">${escapeHtml(a.total)}</span>
          <span class="m rollable" data-expr="${aExpr}" data-label="${escapeHtml(aLbl)}" title="${escapeHtml(aLbl)} ${aExpr}">${fmtMod(a.modifier)}</span>
        </div>
        ${skHtml ? `<div class="abl-skills">${skHtml}</div>` : ""}
      </div>`;
  }).join("");

  const weaponRows: string[] = [];

  if (sp.attack_bonus) {
    const bonus = extractBonus(sp.attack_bonus);
    const bn = parseInt(bonus.replace(/[^\d-]/g, ""), 10) || 0;
    const atkExpr = `1d20${bn >= 0 ? `+${bn}` : bn}`;
    const atkLbl = tt("ccSpellAttack");
    weaponRows.push(`<div class="wp spell">
      <div class="wp-left">
        <span class="n">${tt("ccMeleeRangedSpellAttack")}</span>
      </div>
      <div class="wp-right">
        <div class="wp-main-atk-dmg">
          <span class="atk rollable" data-expr="${atkExpr}" data-label="${escapeHtml(atkLbl)}" title="${escapeHtml(atkLbl)} ${atkExpr}">${escapeHtml(bonus)}</span>
          <span class="dmg">DC ${escapeHtml(sp.save_dc ?? cs.dc ?? "?")}</span>
        </div>
      </div>
    </div>`);
  }

  if (Array.isArray(cb.weapons)) {
    for (const w of cb.weapons) {
      const wpName = w.name ?? "?";

      // Properties + Special
      const propsRaw = String(w.properties ?? "");
      const masteryName = String((w as any).mastery ?? "").trim();
      const lang = getLocalLang();
      const masteryPrefix = masteryName
        ? `${t(lang, "ccInfoMasteryPrefix")}${masteryName}`
        : "";

      const propsCombined =
        masteryPrefix && !/精通[：:]/.test(propsRaw)
          ? propsRaw
            ? `${propsRaw}, ${masteryPrefix}`
            : masteryPrefix
          : propsRaw;

      // Array che conterrà tutti i singoli chip HTML
      const individualChips: string[] = [];

      // 1. Elaborazione delle proprietà standard (se presenti)
      if (propsCombined.trim()) {
        // Divide la stringa usando come separatore una virgola, un punto e virgola o un punto, rimuovendo gli spazi extra
        const splitProps = propsCombined
          .split(/[,;.]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        for (const prop of splitProps) {
          individualChips.push(`
            <span class="prop-chip" data-search="${escapeHtml(prop)}" title="${escapeHtml(prop)}">
              ${escapeHtml(prop)}
            </span>
          `);
        }
      }

      // 2. Elaborazione della proprietà Special (se presente)
      if (w.special_properties && String(w.special_properties).trim()) {
        const spText = String(w.special_properties).trim();
        individualChips.push(`
          <span class="prop-chip prop-special" 
                data-search="Special"
                title="${escapeHtml(spText)}">
            Special
          </span>
        `);
      }

      // 3. Unione di tutti i chip dentro lo stesso identico wrapper .prop-row
      const propHtml =
        individualChips.length > 0
          ? `<div class="prop-row">${individualChips.join("")}</div>`
          : "";

      // Attack & Damage variables
      // ... (Resto del codice di calcolo attacchi, danni e push in weaponRows rimane identico) ...

      // Attack & Damage variables
      const atkBonusStr = String(w.attack_bonus ?? "").trim();
      const atkM = /([+-]?\s*\d+)/.exec(atkBonusStr);
      const atkBn = atkM ? parseInt(atkM[1].replace(/\s+/g, ""), 10) : 0;
      const atkExpr = `1d20${atkBn >= 0 ? `+${atkBn}` : atkBn}`;
      const atkLbl = `${wpName}${t(getLocalLang(), "ccInfoHitSuffix")}`;

      const dmgRaw = [w.damage, w.damage_type].filter(Boolean).join(" ");
      const dmgExprRaw = String(w.damage ?? "").replace(/\s+/g, "");
      const dmgExprMatch = /\d*d\d+([+-]\d+)?/.exec(dmgExprRaw);
      const dmgExpr = dmgExprMatch ? dmgExprMatch[0] : dmgExprRaw;
      const dmgLbl = `${wpName}${t(getLocalLang(), "ccInfoDmgSuffix")}${w.damage_type ? `(${w.damage_type})` : ""}`;

      let mainDmgHtml = dmgExpr
        ? `<span class="rollable" data-expr="${escapeHtml(dmgExpr)}" data-label="${escapeHtml(dmgLbl)}" title="${escapeHtml(dmgLbl)} ${escapeHtml(dmgExpr)}">${escapeHtml(dmgRaw || "?")}</span>`
        : escapeHtml(dmgRaw || "?");

      // Extra Damages adattati per incolonnarsi a destra
      const extraRows: string[] = [];
      const extras =
        Array.isArray(w.extra_damages) && w.extra_damages.length > 0
          ? w.extra_damages
          : w.extra_damage
            ? [{ damage: w.extra_damage, damage_type: w.extra_damage_type }]
            : [];

      for (const ex of extras) {
        if (!ex?.damage) continue;
        const exDmgRaw = String(ex.damage).replace(/\s+/g, "");
        const exType = ex.damage_type ? ` (${ex.damage_type})` : "";
        const exLbl = `${wpName} Extra Damage${exType}`;
        extraRows.push(`
          <div>
            <span class="rollable" 
                  data-expr="${escapeHtml(exDmgRaw)}" 
                  data-label="${escapeHtml(exLbl)}" 
                  title="${escapeHtml(exLbl)} ${escapeHtml(exDmgRaw)}"
                  style="color:#ffb088; font-size:11px;">
              +${escapeHtml(ex.damage)}${ex.damage_type ? ` <span style="opacity:0.8;font-size:9.5px">${escapeHtml(ex.damage_type)}</span>` : ""}
            </span>
          </div>
        `);
      }

      // Push della nuova struttura allineata all'evidenziazione di image_e762a4.png
      weaponRows.push(`
        <div class="wp">
          <div class="wp-left">
            <span class="n">${escapeHtml(wpName)}</span>
            ${propHtml ? propHtml : ""}
          </div>
          
          <div class="wp-right">
            <div class="wp-main-atk-dmg">
              <span class="atk rollable" data-expr="${atkExpr}" data-label="${escapeHtml(atkLbl)}" title="${escapeHtml(atkLbl)} ${atkExpr}">${escapeHtml(w.attack_bonus ?? "?")}</span>
              <span class="dmg">${mainDmgHtml}</span>
            </div>
            ${extraRows.join("")}
          </div>
        </div>
      `);
    }
  }
  const weps = weaponRows.length
    ? weaponRows.join("")
    : `<div class="empty">${t(getLocalLang(), "ccInfoEmpty")}</div>`;

  const featuresHtml = renderSearchChips(d);

  const attrInner = `
    <div class="row">${chips}</div>
    <div class="abil">${abl}</div>
    <div class="sect">${ICONS.swords} ${tt("ccSecWeapons")}</div>
    ${weps}
    ${featuresHtml}
  `;

  const stickyTop = `${statBanner}${renderRtTabStrip()}`;
  const contentBlock = `
    <div class="rt-clip" data-active="${activeRtTab}">
      <div class="rt-pane" data-pane="attr">${attrInner}</div>
      <div class="rt-pane" data-pane="res">
        <div id="rt-mount" style="position:relative; min-height:80px"></div>
      </div>
    </div>
  `;

  const pinned = readPanelPinned();
  const syncCloud = renderSyncCloudMarkup(cardId, syncLoading);

  root.innerHTML = `
    <div class="hdr">
      <button class="reset-btn" id="bubbles-reset-btn" type="button"
        title="${t(getLocalLang(), "hpBarResetTitle")}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8 a5 5 0 1 0 1.5 -3.5"/>
          <path d="M3.2 3 V5.5 H5.5"/>
        </svg>
      </button>
      <div class="drag-handle" id="drag-handle" title="${t(getLocalLang(), "hpBarDragTitle")}" aria-label="${t(getLocalLang(), "hpBarDragTitle")}">
        <svg viewBox="0 0 12 18" aria-hidden="true">
          <circle cx="3" cy="3" r="1.2" fill="currentColor"/>
          <circle cx="9" cy="3" r="1.2" fill="currentColor"/>
          <circle cx="3" cy="9" r="1.2" fill="currentColor"/>
          <circle cx="9" cy="9" r="1.2" fill="currentColor"/>
          <circle cx="3" cy="15" r="1.2" fill="currentColor"/>
          <circle cx="9" cy="15" r="1.2" fill="currentColor"/>
        </svg>
      </div>
      <button class="panel-pin-btn ${pinned ? "pinned" : ""}" id="panel-pin-btn" type="button"
        aria-pressed="${pinned}"
        title="${t(getLocalLang(), pinned ? "ccInfoPinnedTitle" : "ccInfoPinTitle")}">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.339-.016-.484-.041L7.176 13.04a.5.5 0 0 1-.708 0L3.633 10.207 1.4 12.439a.5.5 0 0 1-.707-.707L2.926 9.5.74 7.314a.5.5 0 0 1 0-.708l1.51-1.51c.41-.41.945-.625 1.482-.711.534-.085 1.139-.097 1.683-.024.546.073 1.169.114 1.643-.04.305-.099.62-.281.94-.602.193-.193.282-.467.348-.749.066-.281.117-.572.196-.793a1.51 1.51 0 0 1 .31-.508c.094-.092.215-.174.357-.232a.5.5 0 0 1 .19-.04Z" fill="currentColor"/>
        </svg>
      </button>
      <div class="title-block">
        <div class="name-wrap">
          ${renderNameButton(name, !!boundItemId)}
        </div>
        <div class="sub">${escapeHtml(sub)}</div>
      </div>
      <div class="sync-wrap" id="cc-sync-wrap">
        <button class="${syncCloud.className}" id="cc-cloud-btn" type="button"
          title="${escapeHtml(syncCloud.title)}">${syncCloud.html}</button>
        <button class="cc-refresh${syncLoading ? " spinning" : ""}" id="cc-refresh-btn" type="button"
          title="${escapeHtml(tt("ccRefreshTitle"))}"${syncLoading ? " disabled" : ""}>${REFRESH_SVG}</button>
      </div>
      <a class="raw-link" href="${rawUrl}" target="_blank" rel="noopener">${tt("ccRawData")}</a>
    </div>
    ${stickyTop}
    ${contentBlock}
  `;

  setupRtTabSwitching();
  wireCardRecoveryButtons();
  void refreshRecoveryPermission();
  void ensureRtResourceMount();

  const statMount = root.querySelector<HTMLElement>("#cc-stat-mount");
  if (statMount) {
    ccStatHandle?.unmount();
    ccStatHandle = mountStatBanner({
      container: statMount,
      getItemId: () => boundItemId,
      isGM: cachedIsGM,
      fallback: statFallback,
      initialLive: live,
    });
  }

  const handle = root.querySelector<HTMLDivElement>("#drag-handle");
  if (handle) {
    if (currentDragUnbind) currentDragUnbind();
    currentDragUnbind = bindPanelDrag(handle, PANEL_IDS.ccInfo);
  }

  const pinBtn = root.querySelector<HTMLButtonElement>("#panel-pin-btn");
  if (pinBtn) {
    pinBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanelPinned();
    });
  }

  const resetBtn = root.querySelector<HTMLButtonElement>("#bubbles-reset-btn");
  if (resetBtn && boundItemId) {
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        OBR.broadcast.sendMessage(
          "com.obr-suite/bubbles-reset-token",
          { tokenId: boundItemId },
          { destination: "LOCAL" },
        );
      } catch (err) {
        console.warn("[cc-info] reset broadcast failed", err);
      }
      resetBtn.classList.add("flash");
      setTimeout(() => resetBtn.classList.remove("flash"), 400);
    });
  }

  setupSyncControls(cardId);

  const nameBtn = root.querySelector<HTMLButtonElement>(
    ".name-btn[data-name-text]",
  );
  if (nameBtn && boundItemId) {
    nameBtn.addEventListener("click", () => {
      void toggleTokenNameText(
        boundItemId!,
        nameBtn.dataset.nameText || name,
        nameBtn,
      );
    });
  }

  queueAdjustHeight();
}

// Tracks the drag-handle's current bindPanelDrag unbind function so we
// can release the previous element's listeners before binding to the
// re-rendered one. (innerHTML reassignment GCs the old DOM nodes; their
// DOM listeners die with them — but we still want to clear our local
// pointer-capture state inside panelDrag, which the unbind handles.)
let currentDragUnbind: (() => void) | null = null;

// Compact name-only chips. Click → fires BC_SEARCH_QUERY to populate
// the cluster's search input. The cluster echoes its own input value
// from this broadcast so the user sees the chip text appear in the
// search box and the search popover opens with matching results.
function renderSearchChips(d: any): string {
  const sections: string[] = [];
  const features = d.features ?? {};

  const renderChips = (items: any[]) =>
    items
      .filter((x) => x && x.name)
      .map((x) => {
        const nm = String(x.name);
        return `<span class="srch-chip" data-q="${escapeHtml(nm)}">${escapeHtml(nm)}</span>`;
      })
      .join("");

  // 特性 = race_features + class_features (merged into one tight grid).
  const featList: any[] = [];
  if (Array.isArray(features.race_features))
    featList.push(...features.race_features);
  if (Array.isArray(features.class_features))
    featList.push(...features.class_features);
  if (featList.length) {
    sections.push(`<div class="srch-sect">
      <div class="srch-sect-h">${tt("ccTabFeatures")}</div>
      <div class="srch-grid">${renderChips(featList)}</div>
    </div>`);
  }

  // 专长 — class feats list.
  if (Array.isArray(features.feats) && features.feats.length) {
    sections.push(`<div class="srch-sect">
      <div class="srch-sect-h">${tt("ccFeats")}</div>
      <div class="srch-grid">${renderChips(features.feats)}</div>
    </div>`);
  }

  // 法术 — flatten always_known + prepared + cantrips_known into one
  // grid (de-duplicated by name).
  const sp = d.spellcasting ?? {};
  const allSpells: any[] = [];
  for (const key of ["cantrips_known", "always_known", "prepared"]) {
    const arr = sp[key];
    if (Array.isArray(arr))
      for (const s of arr) if (s && s.name) allSpells.push(s);
  }
  if (allSpells.length) {
    const seen = new Set<string>();
    const uniq = allSpells.filter((s) => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    });
    sections.push(`<div class="srch-sect">
      <div class="srch-sect-h">${tt("ccTabSpells")}</div>
      <div class="srch-grid">${renderChips(uniq)}</div>
    </div>`);
  }

  return sections.join("");
}

// Single delegated click handler for ALL rollable spans inside the
// card. Reads the bound token id at click time so dice anchor on the
// currently-selected character (falls back to live selection if the
// info popover wasn't opened with one).
async function resolveBoundToken(): Promise<string | null> {
  if (boundItemId) return boundItemId;
  return resolveClickRollTarget();
}

root.addEventListener("click", async (e) => {
  // Search-chip click → fill the cluster's search input so the
  // 5etools popover opens with matching results.
  const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>(
    ".srch-chip",
  );
  if (chip) {
    e.preventDefault();
    e.stopPropagation();
    const q = chip.dataset.q ?? "";
    if (q) {
      try {
        OBR.broadcast.sendMessage(
          "com.obr-suite/search-query",
          { q, autoPin: true },
          { destination: "LOCAL" },
        );
      } catch {}
    }
    chip.classList.remove("srch-flash");
    void chip.offsetWidth;
    chip.classList.add("srch-flash");
    return;
  }

  // Weapon-property chip click → same flow as the search chips.
  // Sends the property name (轻型 / 灵巧 / 缓速 / etc.) into the
  // global-search popover so the user can read the rule definition.
  const propChip = (e.target as HTMLElement | null)?.closest<HTMLElement>(
    ".prop-chip",
  );
  if (propChip) {
    e.preventDefault();
    e.stopPropagation();
    const q = propChip.dataset.search ?? "";
    if (q) {
      try {
        OBR.broadcast.sendMessage(
          "com.obr-suite/search-query",
          { q, autoPin: true },
          { destination: "LOCAL" },
        );
      } catch {}
    }
    return;
  }

  // 2026-05-10: rollable left-click is handled by the
  // bindRollableClickPopup binding installed below — opens a quick
  // pick popup (劣势 / 普通 / 优势 + 重击) at the click point.
  // Don't fire any dice-tray prefill here.
});

// Right-click → context menu (投掷 / 优势 / 劣势 / 添加到骰盘).
// Anchors on the bound character token so dice / camera focus are
// consistent with the left-click behavior above.
//
// The cc-info popover is opened from `characterCards/index.ts` with
// anchorPosition = { left: vw − RIGHT_OFFSET, top: anchorTop } and
// anchorOrigin = RIGHT/BOTTOM. That puts the iframe's BOTTOM-RIGHT
// in viewport at (vw − RIGHT_OFFSET, anchorTop), so its TOP-LEFT is
// (vw − RIGHT_OFFSET − innerWidth, anchorTop − innerHeight). Constants
// mirrored from characterCards/index.ts.
const CC_RIGHT_OFFSET = 12;
const CC_BOTTOM_OFFSET = 160;
const CC_INFO_GAP = 8;
const CC_BUTTON_HEIGHT = 48 + 8;
const ccIframeOriginGetter = async () => {
  const [vw, vh] = await Promise.all([
    OBR.viewport.getWidth().catch(() => 1280),
    OBR.viewport.getHeight().catch(() => 720),
  ]);
  const anchorBottom = vh - CC_BOTTOM_OFFSET - CC_BUTTON_HEIGHT - CC_INFO_GAP;
  // 2026-05-16 — with TOP-anchored popover the iframe's top stays at
  // anchorPosition.top = anchorBottom - h_open. h_open is captured
  // into INFO_MAX_HEIGHT at OBR.onReady. window.innerHeight tracks
  // the CURRENT (post-setHeight) height which can be smaller, so
  // using it here would drift the rollable / dice menu origin a few
  // dozen pixels off after the popover auto-shrinks. INFO_MAX_HEIGHT
  // is the right constant because it equals the open-time height.
  return {
    left: Math.round(vw - CC_RIGHT_OFFSET - window.innerWidth),
    top: Math.round(anchorBottom - INFO_MAX_HEIGHT),
  };
};
bindRollableContextMenu(
  root,
  () => "open",
  () => resolveBoundToken(),
  ccIframeOriginGetter,
);
// LEFT-click → quick-pick popup (劣势 / 普通 / 优势 + 重击).
bindRollableClickPopup(root, () => resolveBoundToken(), ccIframeOriginGetter);

OBR.onReady(async () => {
  installDebugOverlay();
  subscribeToSfx();
  // 2026-05-15 — popover-height ceiling. window.innerHeight inside an
  // OBR popover iframe equals the popover's currently-rendered height
  // (the layout-editor user-resize is already baked in by the time
  // onReady fires). adjustHeight() never grows past this — content
  // longer than the ceiling keeps the inner scrollbar instead of
  // forcing the popover to balloon.
  if (window.innerHeight > 0) INFO_MAX_HEIGHT = window.innerHeight;
  // 2026-05-16 — install the shared panel-zoom: scales text / spacing
  // / click targets when the user resizes via the layout editor.
  // Baseline = (INFO_WIDTH, INFO_HEIGHT) from characterCards/index.ts.
  // Uses the MIN of width-ratio and height-ratio so content fits both
  // axes — pulling the panel taller-but-not-wider doesn't make text
  // overflow horizontally.
  installPanelZoom({ baseWidth: 320, baseHeight: 260, target: root });
  // Cache the player's role BEFORE first render so the DM-only lock
  // button appears on first paint instead of waiting for a re-render.
  try {
    const role = await OBR.player.getRole();
    cachedIsGM = role === "GM";
  } catch {}
  // Initial card from URL — popover is opened on-demand by background.ts
  // with the ids in the query string. While the popover stays open, background
  // broadcasts in-place swaps when a different bound character is selected.
  // Drag grip is rendered inline inside .hdr (rebound after each render).
  try {
    const params = new URLSearchParams(location.search);
    const cardId = params.get("cardId");
    const roomId = params.get("roomId");
    const itemId = params.get("itemId");
    if (itemId) boundItemId = itemId;
    if (cardId && roomId) showCard(cardId, roomId);
  } catch {}

  OBR.broadcast.onMessage(SHOW_MSG, (ev: any) => {
    const p = ev?.data || {};
    // Update the bound-token used by quick-roll clicks (selecting a
    // different character should make rolls anchor on the new token).
    if (typeof p.itemId === "string") boundItemId = p.itemId;
    else if (p.itemId === null) boundItemId = null;
    // 2026-05-12 — dedupe duplicate SHOW_MSG with same card+room
    // (selection-handler-race protection; see monster-info-page.ts).
    if (
      p.cardId === currentCardId &&
      p.roomId === currentRoomId &&
      root.childElementCount > 0
    ) {
      return;
    }
    if (p.cardId && p.roomId) showCard(String(p.cardId), String(p.roomId));
  });

  // Multi-client sync — when another client refreshes / imports the
  // currently-shown card, re-fetch unless a newer local dirty copy
  // should win (same rule as fullscreen + cc-panel sidebar).
  OBR.broadcast.onMessage(BC_CARD_UPDATED, (ev: any) => {
    const payload = ev?.data as { cardId?: string } | undefined;
    if (!payload?.cardId) return;
    if (payload.cardId.startsWith("imported_")) return;
    if (localStorage.getItem(`cc-dirty/${payload.cardId}`)) return;
    cardCache.delete(payload.cardId);
    if (currentCardId === payload.cardId && currentRoomId) {
      void showCard(payload.cardId, currentRoomId, { force: true });
    }
  });

  OBR.broadcast.onMessage(BC_DIRTY_CHANGED, (ev: any) => {
    const payload = ev?.data as { cardId?: string } | undefined;
    if (!payload?.cardId) return;
    cardCache.delete(payload.cardId);
    if (currentCardId === payload.cardId && currentRoomId) {
      void showCard(payload.cardId, currentRoomId, { force: true });
    } else if (currentCardId === payload.cardId) {
      updateSyncButtons(getSyncStatus(payload.cardId));
    }
  });

  // The stat banner self-syncs on scene.items.onChange (it's the
  // shared mountStatBanner component now); the resource panel does
  // too. No card-level items.onChange hook needed here anymore.
});