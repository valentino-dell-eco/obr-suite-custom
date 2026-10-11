// Status Tester — chip popover (floats over the selected token's chip).
//
// URL params:
//   tokenId — the selected token
//   h       — chip height in screen px (matches the on-map chip)
//
// Renders the CURRENT chip in HTML (same rotation formula as the map
// renderer: floor(now / ROTATE_MS) % n). Clicking the chip toggles a
// gear button for users allowed to manage the token; the gear opens the
// management modal.

import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { initStatusGridScale } from "./modules/statusTester/grid-scale";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { escapeHtml } from "./utils/html";
import {
  CHIP_POPOVER_ID,
  APPLIED_KEY,
  GEAR_URL,
  LS_GEAR_PREFIX,
  StatusDef,
  canManage,
  displayTitle,
  iconUrl,
  resolveVisible,
  rotationIndex,
  textColorFor,
} from "./modules/statusTester/types";
import { onLibraryChange, readLibrary } from "./modules/statusTester/library";
import { chipMetrics, chipText, drawnStatuses } from "./modules/statusTester/render";
import {
  getLocalSettings,
  initRoomSettings,
  onLocalSettingsChange,
  rotateMs,
} from "./modules/statusTester/settings";
import { openManageModal } from "./modules/statusTester/open";

const params = new URLSearchParams(location.search);
const tokenId = params.get("tokenId") ?? "";
const H = Math.min(Math.max(Number(params.get("h")) || 24, 12), 120);
// "center" (chip above / below the token), "start" (chip to the right
// of the token: pinned at the popover's left edge), "end" (left of the
// token: pinned at the right edge).
const ALIGN = (["start", "end"] as const).find((a) => a === params.get("align")) ?? "center";
const BASE_W = Math.max(Number(params.get("w")) || 360, 40);
// Each token has its own chip popover; this is ours.
const POPOVER_ID = params.get("pid") || CHIP_POPOVER_ID;
const LIST_MIN_W = 240;
/** Gap between the chip band and the hover list (px). */
const LIST_GAP = 4;

const chipEl = document.getElementById("chip") as HTMLDivElement;
const gearEl = document.getElementById("gear") as HTMLButtonElement;
const gearImg = gearEl.querySelector("img") as HTMLImageElement;
const listEl = document.getElementById("list") as HTMLDivElement;

// The popover is opened just tall enough for the chip; the chip is
// pinned at that height's centre so growing the popover (for the hover
// list) doesn't move it.
const BASE_H = Math.ceil(H * 1.15 + 8);
document.documentElement.style.setProperty("--chip-cy", `${BASE_H / 2}px`);
let listOpen = false;

const lang = getLocalLang();
let isGM = false;
let playerId = "";
let token: Item | null = null;
let library = new Map<string, StatusDef>();
let shownKey = "";
let gearOpen = false;
let ls = getLocalSettings();

// Horizontal placement of the chip / hover list for this alignment.
function placeH(el: HTMLElement, translateY: boolean): void {
  const ty = translateY ? "translateY(-50%)" : "";
  if (ALIGN === "start") {
    el.style.left = "0px";
    el.style.right = "auto";
    el.style.transform = ty || "none";
  } else if (ALIGN === "end") {
    el.style.left = "auto";
    el.style.right = "0px";
    el.style.transform = ty || "none";
  } else {
    el.style.left = "50%";
    el.style.right = "auto";
    el.style.transform = `translateX(-50%) ${ty}`.trim();
  }
}
placeH(chipEl, true);
placeH(listEl, false);

try { gearOpen = localStorage.getItem(LS_GEAR_PREFIX + tokenId) === "1"; } catch {}

function statuses() {
  return token ? resolveVisible(token, library, isGM) : [];
}

function mayManage(): boolean {
  return !!token && canManage(token, isGM, playerId);
}

function placeGear(): void {
  const size = Math.round(H * 0.95);
  gearEl.style.width = `${size}px`;
  gearEl.style.height = `${size}px`;
  const chipW = chipEl.offsetWidth;
  if (ALIGN === "start") {
    gearEl.style.left = `${Math.round(chipW + 6)}px`;
    gearEl.style.right = "auto";
  } else if (ALIGN === "end") {
    gearEl.style.left = "auto";
    gearEl.style.right = `${Math.round(chipW + 6)}px`;
  } else {
    gearEl.style.left = `calc(50% + ${Math.round(chipW / 2 + 6)}px)`;
    gearEl.style.right = "auto";
  }
  gearEl.classList.toggle("visible", gearOpen && mayManage() && statuses().length > 0);
  gearEl.removeAttribute("title");
  gearEl.setAttribute("aria-label", t(lang, "sttManageTitle"));
}

function renderChip(): void {
  const list = statuses();
  if (list.length === 0) {
    chipEl.style.display = "none";
    shownKey = "";
    placeGear();
    renderList();
    return;
  }
  chipEl.style.display = "flex";
  const drawn = drawnStatuses(list, ls);
  const idx = rotationIndex(drawn.list.length, Date.now(), rotateMs(ls));
  const { def, applied } = drawn.list[idx];
  const text = chipText(def, applied, drawn.extra);
  shownKey = `${applied.uid}|${JSON.stringify(def)}|${text}|${list.length}`;
  const hasIcon = !!(def.emoji || def.icon);
  const m = chipMetrics(text, H, hasIcon, ls);
  const fg = textColorFor(def.color);
  chipEl.style.height = `${H}px`;
  chipEl.style.width = `${Math.ceil(m.w) + 2}px`;
  chipEl.style.maxWidth = "calc(50% + 120px)";
  chipEl.style.padding = `0 ${m.pad}px`;
  chipEl.style.gap = `${m.gap}px`;
  chipEl.style.fontSize = `${m.fontSize}px`;
  chipEl.style.background = def.color;
  chipEl.style.color = fg;
  chipEl.classList.toggle("hidden-status", !!applied.hidden);
  let icon = "";
  if (def.emoji) {
    icon = `<span class="emoji" style="width:${m.iconSize}px;height:${m.iconSize}px;font-size:${m.iconSize * 0.9}px">${escapeHtml(def.emoji)}</span>`;
  } else if (def.icon) {
    icon = `<img src="${escapeHtml(iconUrl(def.icon, fg !== "#ffffff"))}" style="width:${m.iconSize}px;height:${m.iconSize}px" alt="">`;
  }
  // No "1/3" badge: this chip is an invisible hit area over the map
  // chip, which has none — a badge made the hover ring wider than the
  // chip you actually see.
  const count = "";
  chipEl.innerHTML = `${icon}${text ? `<span class="title">${escapeHtml(text)}</span>` : ""}${count}`;
  chipEl.removeAttribute("title"); // no browser tooltip on hover
  if (count) chipEl.style.width = `${Math.ceil(m.w + m.fontSize * 1.6) + 2}px`;
  placeGear();
  if (listOpen) renderList();
}

function listRowHtml(
  e: { applied: { uid: string; hidden?: boolean; level?: number }; def: StatusDef },
  current: boolean,
): string {
  const fg = textColorFor(e.def.color);
  let icon = "";
  if (e.def.emoji) icon = `<span class="emoji">${escapeHtml(e.def.emoji)}</span>`;
  else if (e.def.icon) icon = `<img src="${escapeHtml(iconUrl(e.def.icon, fg !== "#ffffff"))}" alt="">`;
  const cls = ["row", current ? "cur" : "", e.applied.hidden ? "hid" : ""].filter(Boolean).join(" ");
  const tag = e.applied.hidden ? `<span class="tag">${escapeHtml(lang === "en" ? "hidden" : "隐藏")}</span>` : "";
  return `<div class="${cls}" style="background:${escapeHtml(e.def.color)};color:${fg}">${icon}<span class="t">${escapeHtml(displayTitle(e.def, e.applied) || "—")}</span>${tag}</div>`;
}

/** Hover popup listing every status on the token, below the chip. The
 *  popover grows to fit it and shrinks back when the mouse leaves. */
function renderList(): void {
  const list = statuses();
  if (!listOpen || !ls.hoverList || list.length === 0) {
    if (listEl.classList.contains("visible")) {
      listEl.classList.remove("visible");
      void OBR.popover.setHeight(POPOVER_ID, BASE_H).catch(() => {});
      void OBR.popover.setWidth(POPOVER_ID, BASE_W).catch(() => {});
    }
    return;
  }
  const idx = ls.rotateSec > 0 ? rotationIndex(list.length, Date.now(), rotateMs(ls)) : 0;
  listEl.innerHTML = list.map((e, i) => listRowHtml(e, i === idx)).join("");
  // Entirely BELOW the chip's band: while the popover is still at its
  // base height (before / after the resize) no sliver of the list can
  // show through — that was the dark line flashing under the chip.
  listEl.style.top = `${BASE_H + LIST_GAP}px`;
  listEl.classList.add("visible");
  const needed = Math.ceil(BASE_H + LIST_GAP + listEl.offsetHeight + 6);
  void OBR.popover.setWidth(POPOVER_ID, Math.max(BASE_W, LIST_MIN_W, Math.ceil(listEl.offsetWidth + 8))).catch(() => {});
  void OBR.popover.setHeight(POPOVER_ID, needed).catch(() => {});
}

// Open on hover; close a moment after the mouse leaves both the chip
// and the list, so crossing the small gap between them doesn't close it.
let closeTimer: ReturnType<typeof setTimeout> | null = null;
function cancelClose(): void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
}
chipEl.addEventListener("mouseenter", () => {
  cancelClose();
  if (listOpen) return;
  listOpen = true;
  renderList();
});
listEl.addEventListener("mouseenter", cancelClose);
for (const el of [chipEl, listEl]) {
  el.addEventListener("mouseleave", (ev) => {
    const to = ev.relatedTarget as Node | null;
    if (to && (chipEl.contains(to) || listEl.contains(to) || gearEl.contains(to))) return;
    cancelClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      listOpen = false;
      renderList();
    }, 160);
  });
}

/** Re-render; cross-fade when the shown status changes. */
function update(animate: boolean): void {
  const list = statuses();
  const drawn = drawnStatuses(list, ls);
  const idx = rotationIndex(drawn.list.length, Date.now(), rotateMs(ls));
  const cur = drawn.list[idx];
  const next = cur
    ? `${cur.applied.uid}|${JSON.stringify(cur.def)}|${chipText(cur.def, cur.applied, drawn.extra)}|${list.length}`
    : "";
  if (!animate || !shownKey || next === shownKey) {
    renderChip();
    return;
  }
  chipEl.classList.add("fading");
  setTimeout(() => {
    renderChip();
    chipEl.classList.remove("fading");
  }, 170);
}

function startRotationTimer(): void {
  // Same wall-clock formula as the map renderer; with rotation off we
  // still wake up once a second in case it gets switched back on.
  const delay = () => {
    const ms = rotateMs(ls) || 1000;
    return ms - (Date.now() % ms) + 20;
  };
  const tick = () => {
    update(ls.rotateSec > 0);
    setTimeout(tick, delay());
  };
  setTimeout(tick, delay());
}

chipEl.addEventListener("click", () => {
  if (!mayManage()) return; // others: nothing extra to show
  gearOpen = !gearOpen;
  try {
    if (gearOpen) localStorage.setItem(LS_GEAR_PREFIX + tokenId, "1");
    else localStorage.removeItem(LS_GEAR_PREFIX + tokenId);
  } catch {}
  placeGear();
});

gearEl.addEventListener("click", () => {
  if (!mayManage()) return;
  void openManageModal(tokenId);
});

OBR.onReady(async () => {
  gearImg.src = GEAR_URL();
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { playerId = await OBR.player.getId(); } catch {}
  // Room permissions decide whether a player may open the gear.
  await initRoomSettings(() => update(false));
  await initStatusGridScale(() => update(false));
  onLocalSettingsChange((next) => {
    ls = next;
    update(false);
  });
  library = new Map((await readLibrary()).map((d) => [d.id, d]));
  try { [token] = await OBR.scene.items.getItems([tokenId]); } catch {}
  renderChip();
  startRotationTimer();

  OBR.scene.items.onChange((items) => {
    const next = items.find((i) => i.id === tokenId) ?? null;
    const before = JSON.stringify([token?.metadata?.[APPLIED_KEY], token?.visible, token?.createdUserId]);
    const after = JSON.stringify([next?.metadata?.[APPLIED_KEY], next?.visible, next?.createdUserId]);
    token = next;
    if (before !== after) update(false);
  });
  onLibraryChange((defs) => {
    library = new Map(defs.map((d) => [d.id, d]));
    update(false);
  });
  OBR.player.onChange((p) => {
    const gm = p.role === "GM";
    if (gm !== isGM) {
      isGM = gm;
      update(false);
    }
  });
});
