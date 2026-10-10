// Chase Tracker — settings.
//
// Room (GM decides, room metadata, same for everyone and every scene):
//   step        −/+ step: 0 = the scene's grid scale, else a fixed number
//   unit        label after distances: "scene" (grid unit), "ft", "m", "none"
//   playerView  what players see: "all" | "distances" (quarry hidden) | "none"
//   playerMove  who edits distances: "gm" | "owners" (players: own tokens)
//
// Personal (this browser, localStorage):
//   autoSelect  select the token whose initiative turn starts
//   autoOpen    open the panel by itself when a chase is running

import OBR from "@owlbear-rodeo/sdk";
import { PLUGIN_ID } from "./types";

export type ChaseUnit = "scene" | "ft" | "m" | "none";
export type ChasePlayerView = "all" | "distances" | "none";
export type ChasePlayerMove = "gm" | "owners";

export interface ChaseRoomSettings {
  step: number;
  unit: ChaseUnit;
  playerView: ChasePlayerView;
  playerMove: ChasePlayerMove;
}

export interface ChaseLocalSettings {
  autoSelect: boolean;
  autoOpen: boolean;
}

export const STEP_CHOICES = [0, 1, 5, 10, 30] as const;

export const CHASE_ROOM_DEFAULTS: ChaseRoomSettings = {
  step: 0,
  unit: "scene",
  playerView: "all",
  playerMove: "gm",
};

export const CHASE_LOCAL_DEFAULTS: ChaseLocalSettings = {
  autoSelect: true,
  autoOpen: true,
};

const ROOM_KEY = `${PLUGIN_ID}/settings`;
const LS_KEY = "obr-suite/chase-tracker/settings";
const SAME_WINDOW_EVENT = "obr-suite:chase-local-settings";

function cleanRoom(raw: unknown): ChaseRoomSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const step = Number(r.step);
  const unit = r.unit;
  const view = r.playerView;
  return {
    step: (STEP_CHOICES as readonly number[]).includes(step) ? step : 0,
    unit: unit === "ft" || unit === "m" || unit === "none" ? unit : "scene",
    playerView: view === "distances" || view === "none" ? view : "all",
    playerMove: r.playerMove === "owners" ? "owners" : "gm",
  };
}

function cleanLocal(raw: unknown): ChaseLocalSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    autoSelect: typeof r.autoSelect === "boolean" ? r.autoSelect : true,
    autoOpen: typeof r.autoOpen === "boolean" ? r.autoOpen : true,
  };
}

// --- Room ------------------------------------------------------------------

let roomCache: ChaseRoomSettings = { ...CHASE_ROOM_DEFAULTS };

export function getChaseRoomSettings(): ChaseRoomSettings {
  return roomCache;
}

/** Load the room settings and keep the cache current; `cb` runs on
 *  every later change. Call after OBR.onReady. */
export async function initChaseRoomSettings(cb?: (s: ChaseRoomSettings) => void): Promise<() => void> {
  try {
    roomCache = cleanRoom((await OBR.room.getMetadata())[ROOM_KEY]);
  } catch {}
  let last = JSON.stringify(roomCache);
  return OBR.room.onMetadataChange((meta) => {
    const next = cleanRoom(meta[ROOM_KEY]);
    const k = JSON.stringify(next);
    if (k === last) return;
    last = k;
    roomCache = next;
    cb?.(next);
  });
}

/** GM only: merge `patch` into the room settings. */
export async function setChaseRoomSettings(patch: Partial<ChaseRoomSettings>): Promise<void> {
  let cur = roomCache;
  try { cur = cleanRoom((await OBR.room.getMetadata())[ROOM_KEY]); } catch {}
  const next = cleanRoom({ ...cur, ...patch });
  roomCache = next;
  await OBR.room.setMetadata({ [ROOM_KEY]: next });
}

// --- Personal --------------------------------------------------------------

export function getChaseLocalSettings(): ChaseLocalSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return cleanLocal(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...CHASE_LOCAL_DEFAULTS };
  }
}

export function setChaseLocalSettings(patch: Partial<ChaseLocalSettings>): ChaseLocalSettings {
  const next = cleanLocal({ ...getChaseLocalSettings(), ...patch });
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new CustomEvent(SAME_WINDOW_EVENT)); } catch {}
  return next;
}

export function onChaseLocalSettingsChange(cb: (s: ChaseLocalSettings) => void): () => void {
  let last = JSON.stringify(getChaseLocalSettings());
  const fire = () => {
    const s = getChaseLocalSettings();
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

// --- Helpers ---------------------------------------------------------------

/** May this viewer edit the distance of `item`? */
export function mayMoveParticipant(
  isGM: boolean,
  playerId: string,
  item: { createdUserId?: string } | undefined,
): boolean {
  if (isGM) return true;
  return roomCache.playerMove === "owners" && !!item && !!playerId && item.createdUserId === playerId;
}

/** Does this viewer get the panel at all? */
export function mayViewPanel(isGM: boolean): boolean {
  return isGM || roomCache.playerView !== "none";
}
