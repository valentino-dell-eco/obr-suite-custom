// Status Tracker — settings.
//
// Personal (this browser, localStorage — every iframe of the suite
// shares the origin, so a change in Settings reaches the background
// and the chip popovers through the `storage` event):
//   rotateSec        seconds per status when a token has several (0 = no
//                    rotation: first status + "+N")
//   chipScale        overall chip size multiplier
//   iconScale        icon / emoji size multiplier (inside the chip)
//   textScale        title size multiplier (inside the chip)
//   hoverList        hover a chip → list of every status
//   showAttachments  draw status image overlays on tokens
//   gmDefaultHidden  GM: statuses start hidden from players
//
// Room (GM decides, room metadata, same for everyone):
//   position         chip side: top / bottom / left / right of the token
//   offsetX/offsetY  extra shift of the chips, in scene px (−200 … 200)
//   playerPerm       players may: "view" | "apply" (own tokens) |
//                    "library" (apply + edit the library)

import OBR from "@owlbear-rodeo/sdk";
import { PLUGIN_ID, setPlayersMayApplyFlag } from "./types";

export type ChipPosition = "top" | "bottom" | "left" | "right";
export type PlayerPerm = "view" | "apply" | "library";

export interface SttLocalSettings {
  rotateSec: number;
  chipScale: number;
  iconScale: number;
  textScale: number;
  hoverList: boolean;
  showAttachments: boolean;
  gmDefaultHidden: boolean;
}

export interface SttRoomSettings {
  position: ChipPosition;
  offsetX: number;
  offsetY: number;
  playerPerm: PlayerPerm;
}

export const ROTATE_CHOICES = [0, 3, 5, 8, 12] as const;
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;

export const LOCAL_DEFAULTS: SttLocalSettings = {
  rotateSec: 5,
  chipScale: 1,
  iconScale: 1,
  textScale: 1,
  hoverList: true,
  showAttachments: true,
  gmDefaultHidden: false,
};

export const ROOM_DEFAULTS: SttRoomSettings = {
  position: "top",
  offsetX: 0,
  offsetY: 0,
  playerPerm: "apply",
};

const LS_KEY = "obr-suite/status-tester/settings";
const ROOM_KEY = `${PLUGIN_ID}/settings`;
const SAME_WINDOW_EVENT = "obr-suite:stt-local-settings";

function scale(v: unknown, d: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.round(n * 20) / 20));
}

function cleanLocal(raw: unknown): SttLocalSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rot = Number(r.rotateSec);
  return {
    rotateSec: (ROTATE_CHOICES as readonly number[]).includes(rot) ? rot : LOCAL_DEFAULTS.rotateSec,
    chipScale: scale(r.chipScale, 1),
    iconScale: scale(r.iconScale, 1),
    textScale: scale(r.textScale, 1),
    hoverList: typeof r.hoverList === "boolean" ? r.hoverList : LOCAL_DEFAULTS.hoverList,
    showAttachments: typeof r.showAttachments === "boolean" ? r.showAttachments : LOCAL_DEFAULTS.showAttachments,
    gmDefaultHidden: typeof r.gmDefaultHidden === "boolean" ? r.gmDefaultHidden : LOCAL_DEFAULTS.gmDefaultHidden,
  };
}

export const OFFSET_LIMIT = 200;
function offset(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round(n))) : 0;
}

function cleanRoom(raw: unknown): SttRoomSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pos = r.position;
  const perm = r.playerPerm;
  return {
    position: pos === "bottom" || pos === "left" || pos === "right" ? pos : "top",
    offsetX: offset(r.offsetX),
    offsetY: offset(r.offsetY),
    playerPerm: perm === "view" || perm === "library" ? perm : "apply",
  };
}

// --- Personal --------------------------------------------------------------

export function getLocalSettings(): SttLocalSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return cleanLocal(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...LOCAL_DEFAULTS };
  }
}

export function setLocalSettings(patch: Partial<SttLocalSettings>): SttLocalSettings {
  const next = cleanLocal({ ...getLocalSettings(), ...patch });
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new CustomEvent(SAME_WINDOW_EVENT)); } catch {}
  return next;
}

/** Fires when the personal settings change (this or another iframe). */
export function onLocalSettingsChange(cb: (s: SttLocalSettings) => void): () => void {
  let last = JSON.stringify(getLocalSettings());
  const fire = () => {
    const s = getLocalSettings();
    const k = JSON.stringify(s);
    if (k === last) return;
    last = k;
    cb(s);
  };
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LS_KEY) fire(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_WINDOW_EVENT, fire);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_WINDOW_EVENT, fire);
  };
}

/** Milliseconds per rotation step (0 = rotation off). */
export function rotateMs(s: SttLocalSettings = getLocalSettings()): number {
  return s.rotateSec * 1000;
}

// --- Room ------------------------------------------------------------------

let roomCache: SttRoomSettings = { ...ROOM_DEFAULTS };

/** Last known room settings (call initRoomSettings first in each iframe). */
export function getRoomSettings(): SttRoomSettings {
  return roomCache;
}

export function roomSettingsFromMetadata(meta: Record<string, unknown>): SttRoomSettings {
  return cleanRoom(meta[ROOM_KEY]);
}

/** Load the room settings and keep the cache current. `cb` runs on
 *  every later change. Must be called after OBR.onReady. */
export async function initRoomSettings(cb?: (s: SttRoomSettings) => void): Promise<() => void> {
  try {
    roomCache = cleanRoom((await OBR.room.getMetadata())[ROOM_KEY]);
  } catch {}
  setPlayersMayApplyFlag(roomCache.playerPerm !== "view");
  let last = JSON.stringify(roomCache);
  return OBR.room.onMetadataChange((meta) => {
    const next = cleanRoom(meta[ROOM_KEY]);
    const k = JSON.stringify(next);
    if (k === last) return;
    last = k;
    roomCache = next;
    setPlayersMayApplyFlag(next.playerPerm !== "view");
    cb?.(next);
  });
}

/** GM only: merge `patch` into the room settings. */
export async function setRoomSettings(patch: Partial<SttRoomSettings>): Promise<void> {
  let cur = roomCache;
  try { cur = cleanRoom((await OBR.room.getMetadata())[ROOM_KEY]); } catch {}
  const next = cleanRoom({ ...cur, ...patch });
  roomCache = next;
  setPlayersMayApplyFlag(next.playerPerm !== "view");
  await OBR.room.setMetadata({ [ROOM_KEY]: next });
}

// --- Permissions -----------------------------------------------------------

/** May this viewer add / remove / edit statuses on their own tokens? */
export function playersMayApply(): boolean {
  return roomCache.playerPerm !== "view";
}

/** May this viewer edit the library? */
export function mayEditLibrary(isGM: boolean): boolean {
  return isGM || roomCache.playerPerm === "library";
}
