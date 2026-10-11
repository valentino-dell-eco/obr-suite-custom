// Status Tester — background module.
//
// * Renders status chips + attachments on tokens (render.ts, local items).
// * Tools Suite entry → library editor modal.
// * Context menu on CHARACTER / MOUNT images → management modal
//   (GM: any token; players: only tokens they created).
// * Chip popovers: local items can't be hovered/clicked with OBR's
//   default Move tool, so every on-screen token with visible statuses
//   gets a small HTML popover over its chip (status-tester-chip.html):
//   hover → list of all statuses, click → gear, gear → manage modal.

import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";
import { registerSuiteItem, unregisterSuiteItem, SHORTCUT_TOOLS } from "../toolsSuite";
import { initBroadcastAuth, isFromSelf } from "../../utils/broadcastAuth";
import {
  BC_REFRESH,
  CHIP_POPOVER_ID,
  CTX_MENU_ID,
  SHORTCUT_ACTION_ID,
  LS_GEAR_PREFIX,
  SUITE_ICON_URL,
  SUITE_ITEM_ID,
  canManage,
  isStatusToken,
  resolveVisible,
} from "./types";
import { onLibraryChange, readLibrary, seedPresetsIfMissing } from "./library";
import {
  applySettingsChange,
  chipAnchor,
  chipMetrics,
  chipText,
  drawnStatuses,
  fullResync,
  getLibraryMap,
  getSceneDpi,
  resetState,
  scheduleSync,
  setLibrary,
  setRole,
  startRenderer,
  stopRenderer,
} from "./render";
import { openManageModal } from "./open";
import { setupPalette, teardownPalette, togglePalette } from "./palette";
import { getLocalSettings, initRoomSettings, onLocalSettingsChange } from "./settings";
import { initStatusGridScale } from "./grid-scale";
import { onOccludersChanged, openPanelRects, type PanelBbox } from "../../utils/panelLayout";

const CHIP_URL = assetUrl("status-tester-chip.html");
const MOVE_EPS = 2;

const unsubs: Array<() => void> = [];
let isGM = false;
let playerId = "";

// --- Chip popovers (one per token with visible statuses) -----------------
//
// The map chips are local items, which OBR's default Move tool never
// reports hover/click on. So every token whose statuses this client may
// see gets a small HTML popover floating exactly over its chip (hover →
// list of all statuses, click → gear, gear → manage modal). OBR has no
// viewport-change event: positions are re-checked ~4×/s and a popover
// is reopened only when its chip moved by more than a couple of px.
// Off-screen chips get no popover; at most MAX_POPOVERS are open.

const MAX_POPOVERS = 12;

interface PopState { left: number; top: number; hpx: number; w: number; align: string }
const candidates = new Map<string, Item>(); // tokens with visible statuses
const boundsCache = new Map<string, Awaited<ReturnType<typeof OBR.scene.items.getItemBounds>>>();
const openPops = new Map<string, PopState>();
let posTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
// Camera-move detection: while the map is being panned/zoomed the
// popovers would lag behind ("dragged" chips), so they're hidden until
// the viewport has been still for SETTLE_TICKS consecutive checks.
const MOVE_POLL_MS = 60;
const SETTLE_TICKS = 5; // ~300 ms of stillness
let lastView: { x: number; y: number; s: number } | null = null;
let stillTicks = SETTLE_TICKS;
// Popovers already placed for the current (still) view and token set —
// nothing to do until the camera moves or tokens/statuses change.
let placedDirty = true;

function overlapsAny(r: PanelBbox, list: PanelBbox[]): boolean {
  return list.some(
    (p) => r.left < p.left + p.width && r.left + r.width > p.left && r.top < p.top + p.height && r.top + r.height > p.top,
  );
}

function popId(tokenId: string): string {
  return `${CHIP_POPOVER_ID}/${tokenId}`;
}

async function closePop(tokenId: string): Promise<void> {
  if (!openPops.has(tokenId)) return;
  openPops.delete(tokenId);
  try { await OBR.popover.close(popId(tokenId)); } catch {}
}

async function closeAllPops(): Promise<void> {
  // All at once (not one by one) so they vanish together the moment a
  // camera move is detected.
  const ids = [...openPops.keys()];
  openPops.clear();
  await Promise.all(ids.map((id) => OBR.popover.close(popId(id)).catch(() => {})));
}

/** Widest drawn chip among the token's statuses, in screen px. */
function chipWidthPx(item: Item, hpx: number): number {
  const ls = getLocalSettings();
  const drawn = drawnStatuses(resolveVisible(item, getLibraryMap(), isGM), ls);
  let w = hpx;
  for (const { def, applied } of drawn.list) {
    const m = chipMetrics(chipText(def, applied, drawn.extra), hpx, !!(def.emoji || def.icon), ls);
    w = Math.max(w, m.w);
  }
  return Math.ceil(w) + 2;
}

/** Recompute which tokens need a popover (call on item/library change). */
/** Pause all chip popovers until the scene has been still for
 *  SETTLE_TICKS checks (camera, token drag, press on a token). */
function pausePopovers(): void {
  stillTicks = 0;
  placedDirty = true;
  void closeAllPops();
}

const lastTokenPos = new Map<string, string>();
let lastSelection = "";

function refreshCandidates(items: Item[]): void {
  candidates.clear();
  let tokenMoved = false;
  for (const it of items) {
    if (!isImage(it) || !isStatusToken(it)) continue;
    if (resolveVisible(it, getLibraryMap(), isGM).length === 0) continue;
    candidates.set(it.id, it);
    // A status token being dragged (or nudged) → hide the popovers
    // while it moves, like for a camera pan.
    const pos = `${Math.round(it.position.x)},${Math.round(it.position.y)},${it.rotation},${it.scale.x},${it.scale.y}`;
    const prev = lastTokenPos.get(it.id);
    if (prev !== undefined && prev !== pos) tokenMoved = true;
    lastTokenPos.set(it.id, pos);
  }
  for (const id of [...lastTokenPos.keys()]) if (!candidates.has(id)) lastTokenPos.delete(id);
  boundsCache.clear();
  placedDirty = true;
  if (tokenMoved) pausePopovers();
  if (candidates.size > 0 && !posTimer) {
    posTimer = setInterval(() => { void tick(); }, MOVE_POLL_MS);
  }
  void tick();
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (candidates.size === 0) {
      await closeAllPops();
      if (posTimer) clearInterval(posTimer);
      posTimer = null;
      return;
    }
    const [scale, vw, vh, vpos] = await Promise.all([
      OBR.viewport.getScale(),
      OBR.viewport.getWidth(),
      OBR.viewport.getHeight(),
      OBR.viewport.getPosition(),
    ]);
    // Pause while the camera moves: hide every chip popover and wait for
    // the view to settle before placing them again.
    const view = { x: vpos.x, y: vpos.y, s: scale };
    const moved =
      !!lastView &&
      (Math.abs(lastView.x - view.x) > 0.5 ||
        Math.abs(lastView.y - view.y) > 0.5 ||
        Math.abs(lastView.s - view.s) > 1e-4);
    lastView = view;
    if (moved) {
      pausePopovers();
      return;
    }
    if (stillTicks < SETTLE_TICKS) {
      stillTicks++;
      if (stillTicks < SETTLE_TICKS) return;
    }
    if (!placedDirty) return;
    placedDirty = false;
    // Open suite panels (Room Chat, initiative, dice history): a chip
    // under one of them gets no popover, so its hover list never pops
    // up over the panel.
    const panels = await openPanelRects();
    const wanted = new Set<string>();
    for (const [id, item] of candidates) {
      if (wanted.size >= MAX_POPOVERS) break;
      let b = boundsCache.get(id);
      if (!b) {
        try { b = await OBR.scene.items.getItemBounds([id]); } catch { continue; }
        boundsCache.set(id, b);
      }
      const c = chipAnchor(b, getSceneDpi());
      const screen = await OBR.viewport.transformPoint({ x: c.x, y: c.y });
      if (screen.x < 0 || screen.y < 0 || screen.x > vw || screen.y > vh) continue;
      wanted.add(id);
      const hpx = Math.round(Math.min(Math.max(c.h * scale, 14), 120));
      const baseH = Math.ceil(hpx * 1.15 + 8);
      // Chip + room for the gear: on both sides when centred (so the
      // chip stays centred), on the outer side when beside the token.
      const gearSpace = hpx + 10;
      const w = chipWidthPx(item, hpx) + (c.align === "center" ? 2 : 1) * gearSpace;
      const left = Math.round(screen.x);
      const top = Math.round(screen.y - baseH / 2);
      const x0 = c.align === "start" ? left : c.align === "end" ? left - w : left - w / 2;
      if (overlapsAny({ left: x0, top, width: w, height: baseH }, panels)) {
        wanted.delete(id);
        continue;
      }
      const prev = openPops.get(id);
      if (
        prev &&
        Math.abs(prev.left - left) <= MOVE_EPS &&
        Math.abs(prev.top - top) <= MOVE_EPS &&
        Math.abs(prev.hpx - hpx) <= 1 &&
        prev.w === w &&
        prev.align === c.align
      ) continue;
      const hOrigin = c.align === "start" ? "LEFT" : c.align === "end" ? "RIGHT" : "CENTER";
      if (prev) {
        try { await OBR.popover.close(popId(id)); } catch {}
        openPops.delete(id);
      }
      try {
        await OBR.popover.open({
          id: popId(id),
          url: `${CHIP_URL}?tokenId=${encodeURIComponent(id)}&h=${hpx}&w=${w}&align=${c.align}&pid=${encodeURIComponent(popId(id))}`,
          width: w,
          height: baseH,
          anchorReference: "POSITION",
          anchorPosition: { left, top },
          // Pinned at the chip's centre (top / bottom) or at its inner
          // edge (left / right of the token): when the page widens the
          // popover for the hover list it grows away from the token.
          anchorOrigin: { horizontal: hOrigin, vertical: "TOP" },
          transformOrigin: { horizontal: hOrigin, vertical: "TOP" },
          hidePaper: true,
          disableClickAway: true,
          marginThreshold: 0,
        });
        openPops.set(id, { left, top, hpx, w, align: c.align });
      } catch {}
    }
    for (const id of [...openPops.keys()]) {
      if (!wanted.has(id)) await closePop(id);
    }
  } catch {
    // Scene not ready etc. — next tick retries.
  } finally {
    ticking = false;
  }
}

async function rescanCandidates(): Promise<void> {
  try {
    refreshCandidates(await OBR.scene.items.getItems());
  } catch {}
}

function clearAllGearFlags(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_GEAR_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}

// --- Context menu ----------------------------------------------------------

async function createContextMenu(): Promise<void> {
  const label = t(getLocalLang(), "sttName");
  const icon = SUITE_ICON_URL();
  const layerIcons = (["CHARACTER", "MOUNT"] as const).flatMap((layer) => [
    {
      icon,
      label,
      filter: {
        roles: ["GM" as const],
        max: 1,
        every: [
          { key: "type", value: "IMAGE" },
          { key: "layer", value: layer },
        ],
      },
    },
    {
      icon,
      label,
      filter: {
        roles: ["PLAYER" as const],
        max: 1,
        every: [
          { key: "type", value: "IMAGE" },
          { key: "layer", value: layer },
          // Context menus are registered per client, so we can bake
          // this player's id into the filter: own tokens only.
          { key: "createdUserId", value: playerId },
        ],
      },
    },
  ]);
  await OBR.contextMenu.create({
    id: CTX_MENU_ID,
    icons: layerIcons,
    onClick: (ctx) => {
      const item = ctx.items[0];
      if (!item || ctx.items.length !== 1 || !isStatusToken(item)) return;
      // Filters are a UI hint only — re-check here. A player whose GM
      // allows viewing only still opens the window, read-only.
      if (!canManage(item, isGM, playerId) && item.createdUserId !== playerId) return;
      void openManageModal(item.id);
    },
  });
}

// --- Setup / teardown ------------------------------------------------------

export async function setupStatusTester(): Promise<void> {
  await initBroadcastAuth();
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { playerId = await OBR.player.getId(); } catch {}
  setRole(isGM);
  // First run in this room: the GM seeds the D&D 5e (2014) presets.
  if (isGM) await seedPresetsIfMissing(getLocalLang());
  setLibrary(await readLibrary());
  // Settings: room (position, player permissions) + personal (sizes,
  // rotation, attachments). Any change rebuilds the map chips and
  // reopens the chip popovers at their new size / place.
  const onSettings = () => {
    applySettingsChange();
    pausePopovers();
    void rescanCandidates();
  };
  unsubs.push(await initRoomSettings(onSettings));
  // Grid-distance levels ("Flying 30 ft") follow the scene grid scale.
  void initStatusGridScale(onSettings);
  unsubs.push(onLocalSettingsChange(onSettings));
  // A suite panel opened / closed / moved → re-check which chips it covers.
  unsubs.push(onOccludersChanged(() => { placedDirty = true; void tick(); }));
  startRenderer();

  const lang = getLocalLang();
  registerSuiteItem({
    id: SUITE_ITEM_ID,
    suite: "shared",
    label: t(lang, "sttName"),
    icon: SUITE_ICON_URL(),
    hint: t(lang, "sttSuiteHint"),
    onPick: () => togglePalette(),
  });

  setupPalette();

  try { await createContextMenu(); } catch (e) {
    console.warn("[status-tester] context menu register failed", e);
  }

  // Shift+S (layout-independent; `]` needs AltGr on Italian
  // keyboards) toggles the status palette.
  try {
    await OBR.tool.createAction({
      id: SHORTCUT_ACTION_ID,
      shortcut: "Shift+S",
      icons: [{ icon: SUITE_ICON_URL(), label: t(lang, "sttName"), filter: { activeTools: SHORTCUT_TOOLS } }],
      onClick: () => togglePalette(),
    });
  } catch (e) {
    console.warn("[status-tester] shortcut action register failed", e);
  }

  unsubs.push(
    OBR.scene.items.onChange((items) => {
      scheduleSync(items);
      refreshCandidates(items);
    }),
  );
  unsubs.push(
    onLibraryChange((defs) => {
      setLibrary(defs);
      scheduleSync();
      void rescanCandidates();
    }),
  );
  unsubs.push(
    OBR.player.onChange((p) => {
      const gm = p.role === "GM";
      if (gm !== isGM) {
        isGM = gm;
        setRole(gm);
        void fullResync();
        void rescanCandidates();
      }
      if (p.id) playerId = p.id;
      // Pressing on a token selects it (start of a token drag), and
      // pressing on the empty map deselects (start of a camera pan when
      // something was selected): either way hide the popovers until
      // things settle again.
      const sel = (p.selection ?? []).join(",");
      if (sel !== lastSelection) {
        lastSelection = sel;
        pausePopovers();
      }
    }),
  );
  unsubs.push(
    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        void fullResync();
        void rescanCandidates();
      } else {
        resetState();
        candidates.clear();
        void closeAllPops();
      }
    }),
  );
  // LOCAL "re-render" request from our own pages (e.g. after edits).
  unsubs.push(
    OBR.broadcast.onMessage(BC_REFRESH, (ev) => {
      if (!isFromSelf(ev)) return;
      void fullResync();
      void rescanCandidates();
    }),
  );

  clearAllGearFlags();
  await fullResync();
  void rescanCandidates();
}

export async function teardownStatusTester(): Promise<void> {
  for (const u of unsubs.splice(0)) { try { u(); } catch {} }
  if (posTimer) clearInterval(posTimer);
  posTimer = null;
  candidates.clear();
  unregisterSuiteItem(SUITE_ITEM_ID);
  try { await OBR.tool.removeAction(SHORTCUT_ACTION_ID); } catch {}
  await teardownPalette();
  try { await OBR.contextMenu.remove(CTX_MENU_ID); } catch {}
  await closeAllPops();
  await stopRenderer();
}
