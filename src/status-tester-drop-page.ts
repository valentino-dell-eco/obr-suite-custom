// Status Tester — fullscreen drop modal for a chip dragged out of the
// status palette.
//
// The palette owns the press (the browser keeps routing the pointer to
// the frame it started in) and forwards cursor positions; this modal
// only draws and applies:
//   * the chip ghost is painted from the URL hash (status + cursor
//     position) on first paint, before the OBR SDK handshake;
//   * token outlines come precomputed from the background (computed
//     while this iframe was loading) — we build them ourselves only if
//     they don't arrive;
//   * releasing over a target adds the status (GM: hold Shift to add
//     it hidden from players); releasing elsewhere does nothing;
//   * Esc, right-click or inactivity cancel.
// Every exit broadcasts BC_DRAG_END so the background closes us.

import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { escapeHtml } from "./utils/html";
import { initBroadcastAuth, isFromSelf } from "./utils/broadcastAuth";
import {
  BC_DRAG_DROP,
  BC_DRAG_END,
  BC_DRAG_MOVE,
  BC_DRAG_READY,
  BC_DRAG_TARGETS,
  DragTargetRect,
  StatusDef,
  canManage,
  iconUrl,
  isStatusToken,
  sanitizeDef,
  textColorFor,
} from "./modules/statusTester/types";
import { readLibrary } from "./modules/statusTester/library";
import { addStatusToTokens } from "./modules/statusTester/apply";
import { getLocalSettings, initRoomSettings } from "./modules/statusTester/settings";

// GM: new statuses start hidden when that personal setting is on;
// Shift on release flips it.
const defaultHidden = getLocalSettings().gmDefaultHidden;

const lang = getLocalLang();
const defId = new URLSearchParams(location.search).get("def") ?? "";
const blocker = document.getElementById("blocker") as HTMLDivElement;
const targetsEl = document.getElementById("targets") as HTMLDivElement;
const ghost = document.getElementById("ghost") as HTMLDivElement;
const banner = document.getElementById("banner") as HTMLDivElement;

const IDLE_MS = 8000;
/** Build targets ourselves if the background hasn't sent them by then. */
const TARGETS_FALLBACK_MS = 1500;

interface Target extends DragTargetRect {
  el: HTMLDivElement;
}

let isGM = false;
let playerId = "";
let def: StatusDef | null = null;
let targets: Target[] = [];
let haveTargets = false;
let hot: Target | null = null;
let ended = false;
let dropping = false;
let tagEl: HTMLElement | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let last = { x: -1000, y: -1000, shift: false };

let markTargets: () => void = () => {};
const targetsReady = new Promise<void>((r) => { markTargets = r; });

function end(): void {
  if (ended) return;
  ended = true;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    void OBR.broadcast.sendMessage(BC_DRAG_END, {}, { destination: "LOCAL" }).catch(() => {});
  } catch {} // SDK not ready yet — the background safety timer closes us
}

function bumpIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(end, IDLE_MS);
}

function renderGhost(): void {
  if (!def) return;
  const fg = textColorFor(def.color);
  let icon = "";
  if (def.emoji) icon = `<span class="emoji">${escapeHtml(def.emoji)}</span>`;
  else if (def.icon) icon = `<img src="${escapeHtml(iconUrl(def.icon, fg !== "#ffffff"))}" alt="">`;
  ghost.style.background = def.color;
  ghost.style.color = fg;
  ghost.innerHTML = `${icon}<span>${escapeHtml(def.title || t(lang, "sttUntitled"))}</span>` +
    `<span class="tag" id="tag" hidden>${escapeHtml(t(lang, "sttHiddenBadge"))}</span>`;
  tagEl = document.getElementById("tag");
}

function setTargets(rects: DragTargetRect[]): void {
  if (haveTargets) return;
  haveTargets = true;
  const color = def?.color ?? "#5dade2";
  targets = rects.map((r) => {
    const el = document.createElement("div");
    el.className = "target";
    el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    el.style.setProperty("--c", color);
    return { ...r, el };
  });
  targetsEl.replaceChildren(...targets.map((x) => x.el));
  hot = null;
  setHot(hitTest(last.x, last.y));
  markTargets();
}

/** Fallback when the background's precomputed rects never arrive. */
async function buildTargetsLocally(): Promise<void> {
  let items: Item[] = [];
  try {
    items = await OBR.scene.items.getItems(
      (it) => isStatusToken(it) && canManage(it, isGM, playerId) && (isGM || it.visible !== false),
    );
  } catch {}
  const out: DragTargetRect[] = [];
  await Promise.all(
    items.map(async (it) => {
      try {
        const b = await OBR.scene.items.getItemBounds([it.id]);
        const [p1, p2] = await Promise.all([
          OBR.viewport.transformPoint(b.min),
          OBR.viewport.transformPoint(b.max),
        ]);
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        if (width < 2 || height < 2) return;
        out.push({ id: it.id, left: Math.min(p1.x, p2.x), top: Math.min(p1.y, p2.y), width, height });
      } catch {}
    }),
  );
  setTargets(out);
}

/** Smallest target under the point (overlapping tokens: the more
 *  specific one wins); ties go to the nearer centre. */
function hitTest(x: number, y: number): Target | null {
  let best: Target | null = null;
  let bestArea = Infinity;
  let bestDist = Infinity;
  for (const tg of targets) {
    if (x < tg.left || x > tg.left + tg.width || y < tg.top || y > tg.top + tg.height) continue;
    const area = tg.width * tg.height;
    const dist = Math.hypot(x - (tg.left + tg.width / 2), y - (tg.top + tg.height / 2));
    if (area < bestArea - 1 || (Math.abs(area - bestArea) <= 1 && dist < bestDist)) {
      best = tg;
      bestArea = area;
      bestDist = dist;
    }
  }
  return best;
}

function setHot(next: Target | null): void {
  if (next === hot) return;
  hot?.el.classList.remove("hot");
  hot = next;
  hot?.el.classList.add("hot");
}

function moveTo(x: number, y: number, shift: boolean): void {
  last = { x, y, shift };
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
  ghost.classList.add("on");
  if (tagEl) tagEl.hidden = !(isGM && shift !== defaultHidden);
  setHot(hitTest(x, y));
}

/** Apply at x/y (if over a target), then close. Waits for the targets
 *  when the release arrives while they are still on their way. */
async function dropAt(x: number, y: number, shift: boolean): Promise<void> {
  if (ended || dropping) return;
  dropping = true;
  moveTo(x, y, shift);
  await targetsReady;
  if (ended) return;
  moveTo(x, y, shift);
  const target = hot;
  if (target && def) {
    try {
      await addStatusToTokens([target.id], def.id, {
        isGM,
        playerId,
        hidden: isGM && shift !== defaultHidden,
        levels: !!def.levels,
      });
    } catch (err) {
      console.warn("[status-tester] drop apply failed", err);
    }
  }
  end();
}

function isPoint(d: unknown): d is { x: number; y: number; shift?: boolean } {
  const p = d as { x?: unknown; y?: unknown } | null;
  return !!p && typeof p.x === "number" && Number.isFinite(p.x) &&
    typeof p.y === "number" && Number.isFinite(p.y);
}

function isRectList(d: unknown): d is { targets: DragTargetRect[] } {
  const list = (d as { targets?: unknown } | null)?.targets;
  return Array.isArray(list) && list.every((r) =>
    r && typeof r.id === "string" &&
    [r.left, r.top, r.width, r.height].every((n) => typeof n === "number" && Number.isFinite(n)));
}

// --- First paint: ghost from the URL hash, no SDK needed ------------------

try {
  const seed = JSON.parse(decodeURIComponent(location.hash.slice(1)) || "{}") as {
    def?: unknown; x?: unknown; y?: unknown;
  };
  const seeded = sanitizeDef(seed.def);
  if (seeded && seeded.id === defId) def = seeded;
  if (def) {
    renderGhost();
    if (isPoint(seed)) moveTo(seed.x, seed.y, false);
  }
} catch {}
banner.textContent = t(lang, "sttDropBanner");

// --- Pointer fallbacks (browsers that DO hand the pointer to us) ----------

window.addEventListener("pointermove", (e) => {
  if (ended || dropping || (e.buttons & 1) === 0) return;
  bumpIdle();
  moveTo(e.clientX, e.clientY, e.shiftKey);
});
window.addEventListener("pointerup", (e) => {
  if (e.button !== 0) return;
  void dropAt(e.clientX, e.clientY, e.shiftKey);
});
window.addEventListener("contextmenu", (e) => { e.preventDefault(); end(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") end(); });
blocker.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

// --- SDK side: listeners are only legal after OBR.onReady -----------------

OBR.onReady(async () => {
  bumpIdle();
  const [role, pid] = await Promise.all([
    OBR.player.getRole().catch(() => "PLAYER"),
    OBR.player.getId().catch(() => ""),
    initBroadcastAuth(),
  ]);
  isGM = role === "GM";
  playerId = pid;
  if (tagEl) tagEl.hidden = !(isGM && last.shift !== defaultHidden);
  void initRoomSettings();

  OBR.broadcast.onMessage(BC_DRAG_MOVE, (ev) => {
    if (ended || dropping || !isFromSelf(ev) || !isPoint(ev.data)) return;
    bumpIdle();
    moveTo(ev.data.x, ev.data.y, !!ev.data.shift);
  });
  OBR.broadcast.onMessage(BC_DRAG_DROP, (ev) => {
    if (!isFromSelf(ev) || !isPoint(ev.data)) return;
    void dropAt(ev.data.x, ev.data.y, !!ev.data.shift);
  });
  OBR.broadcast.onMessage(BC_DRAG_TARGETS, (ev) => {
    if (!isFromSelf(ev) || !isRectList(ev.data)) return;
    setTargets(ev.data.targets);
  });
  // Ask the background for the precomputed targets (and a release that
  // beat us here, if any).
  void OBR.broadcast.sendMessage(BC_DRAG_READY, {}, { destination: "LOCAL" }).catch(() => {});

  if (!def) {
    const lib = await readLibrary();
    def = lib.find((d) => d.id === defId) ?? null;
    if (!def) { end(); return; }
    renderGhost();
  }
  setTimeout(() => { if (!haveTargets && !ended) void buildTargetsLocally(); }, TARGETS_FALLBACK_MS);
});
