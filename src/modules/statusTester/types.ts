// Status Tester — shared types, constants and (de)serialisation.
//
// Two pieces of data:
//   * the status LIBRARY  — room metadata, shared by every scene;
//     compact on-disk shape (see CompactDef) because room metadata is
//     ~16KB for EVERYTHING.
//   * the APPLIED list    — per-token metadata: [{uid, defId, hidden?}].
//
// Everything read from metadata goes through the sanitisers below
// (hex colours, http(s)-only URLs, length caps) — metadata is writable
// by any client, so nothing in it is trusted.

import type { Item } from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";

export const PLUGIN_ID = "com.obr-suite/status-tester";
export const LIBRARY_KEY = `${PLUGIN_ID}/library`;
export const APPLIED_KEY = `${PLUGIN_ID}/applied`;
/** Metadata key stamped on every LOCAL item we create (value = token id). */
export const OWNER_KEY = `${PLUGIN_ID}/owner`;

export const CTX_MENU_ID = `${PLUGIN_ID}/context-menu`;
export const SUITE_ITEM_ID = `${PLUGIN_ID}/suite-item`;
export const SHORTCUT_ACTION_ID = `${PLUGIN_ID}/shortcut`;
export const CHIP_POPOVER_ID = `${PLUGIN_ID}/chip-popover`;
export const MANAGE_MODAL_ID = `${PLUGIN_ID}/manage`;
export const LIBRARY_MODAL_ID = `${PLUGIN_ID}/library`;
/** Draggable status palette (popover, layout-editor panel). */
export const PALETTE_POPOVER_ID = `${PLUGIN_ID}/palette`;
/** Fullscreen modal that owns a chip drag from the palette. */
export const DROP_MODAL_ID = `${PLUGIN_ID}/drop`;
/** Palette → background: a chip drag left the deadzone. */
export const BC_DRAG_START = `${PLUGIN_ID}/drag-start`;
/** Palette / drop modal → background: drag finished or cancelled. */
export const BC_DRAG_END = `${PLUGIN_ID}/drag-end`;
/** Palette → drop modal: cursor position in viewport px while dragging. */
export const BC_DRAG_MOVE = `${PLUGIN_ID}/drag-move`;
/** Palette → drop modal (+ background, kept until the modal is ready): released at x/y. */
export const BC_DRAG_DROP = `${PLUGIN_ID}/drag-drop`;
/** Drop modal → background: mounted; replay a drop that arrived earlier. */
export const BC_DRAG_READY = `${PLUGIN_ID}/drag-ready`;
/** Background → drop modal: drop-target rects, computed while the modal loads. */
export const BC_DRAG_TARGETS = `${PLUGIN_ID}/drag-targets`;

/** A droppable token's bounds in viewport px. */
export interface DragTargetRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Palette → background: close the palette. */
export const BC_PALETTE_CLOSE = `${PLUGIN_ID}/palette-close`;

/** LOCAL broadcast: "re-render everything" (sent by our own pages). */
export const BC_REFRESH = `${PLUGIN_ID}/refresh`;

/** localStorage key prefix for the per-token "gear visible" flag of the
 *  chip popover (survives the close/reopen used to reposition it). */
export const LS_GEAR_PREFIX = "obr-suite/status-tester/gear/";

/** Rotation period of tokens carrying ≥2 statuses. Background renderer
 *  and chip popover both derive the current index from the wall clock
 *  (floor(now / ROTATE_MS) % n) so they stay in step without messages. */
export const ROTATE_MS = 5000;

/** Soft cap for the serialised library — warn above this. */
export const LIBRARY_WARN_BYTES = 8 * 1024;

// --- Base icon set ---------------------------------------------------------
// Files live under public/status-tester/icons/<id>.svg (white, 24×24
// viewBox, rendered at 96px intrinsic size) with black copies under
// icons/dark/<id>.svg for light chip colours.
export const ICON_IDS = [
  "skull",
  "poison",
  "flame",
  "snowflake",
  "bolt",
  "heart",
  "shield",
  "eye-off",
  "sleep",
  "chain",
  "spiral",
  "web",
  "sword",
  "star",
  "ghost",
  "plus",
  // D&D 5e (2014) condition / buff icons — used by the presets.
  "dnd-blinded",
  "dnd-charmed",
  "dnd-deafened",
  "dnd-exhaustion",
  "dnd-frightened",
  "dnd-grappled",
  "dnd-incapacitated",
  "dnd-invisible",
  "dnd-paralyzed",
  "dnd-petrified",
  "dnd-poisoned",
  "dnd-prone",
  "dnd-restrained",
  "dnd-stunned",
  "dnd-unconscious",
  "dnd-blessed",
  "dnd-bardic-inspiration",
  "dnd-guidance",
  "dnd-hasted",
  "dnd-heroism",
  "dnd-shield-of-faith",
  "dnd-raging",
  "dnd-concentrating",
  "dnd-dodging",
  "dnd-hidden",
  "dnd-protection-evil-good",
  "dnd-mage-armor",
] as const;
export type IconId = (typeof ICON_IDS)[number];
export const ICON_PX = 96;

/** `dark` = black variant (icons/dark/<id>.svg) for light chip colours. */
export function iconUrl(id: string, dark = false): string {
  return assetUrl(`status-tester/icons/${dark ? "dark/" : ""}${id}.svg`);
}
export const GEAR_URL = (): string => assetUrl("status-tester/gear.svg");
export const SUITE_ICON_URL = (): string => assetUrl("status-tester/icon.svg");

export const COLOR_PRESETS = [
  "#c0392b",
  "#e67e22",
  "#f1c40f",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#8e44ad",
  "#7f8c8d",
  "#2c3e50",
  "#ecf0f1",
];

// --- Types -----------------------------------------------------------------

export interface StatusAttachment {
  url: string;
  width: number;
  height: number;
  mime: string;
  dpi?: number;
}

export interface StatusDef {
  id: string;
  title: string;
  /** #rrggbb */
  color: string;
  /** Base icon id (ICON_IDS). Ignored when `emoji` is set. */
  icon?: string;
  /** Emoji glyph — takes precedence over `icon`. */
  emoji?: string;
  attachment?: StatusAttachment;
  /** The status carries a numeric level ("Exhaustion 3"). `false` is
   *  stored explicitly once set, so preset upgrades never re-enable it. */
  levels?: boolean;
  /** The level is a distance on the scene grid ("Flying 30 ft"): it
   *  steps by the grid scale and shows the grid unit. */
  levelGrid?: boolean;
}

export interface AppliedStatus {
  uid: string;
  defId: string;
  hidden?: boolean;
  /** Integer level, only meaningful when the definition has `levels`. */
  level?: number;
}

// Wide enough for grid distances ("Flying 120 ft").
export const LEVEL_MIN = -9999;
export const LEVEL_MAX = 9999;
/** − / + step for levels. */
export const LEVEL_STEP = 0.5;

/** Clamp anything to a valid level (undefined if not a number). */
export function cleanLevel(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  // Steps of 0.5 (1, 1.5, 2 …): snap to the nearest half.
  return Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(n * 2) / 2));
}

// --- Scene grid scale (for grid-distance levels) ---------------------------
// Kept here (no SDK import) and filled by grid-scale.ts in every page
// that shows or edits levels.
let gridScale = { step: 5, unit: "ft" };

export function setStatusGridScale(step: number, unit: string): void {
  gridScale = { step: step > 0 ? step : 5, unit: unit.trim() };
}

/** − / + step for this status: the grid scale for distance levels. */
export function levelStep(def: Pick<StatusDef, "levelGrid"> | null | undefined): number {
  return def?.levelGrid ? gridScale.step : LEVEL_STEP;
}

/** Level a status starts at when added: one grid square for distance
 *  levels, else 1. */
export function levelStart(def: Pick<StatusDef, "levelGrid"> | null | undefined): number {
  return def?.levelGrid ? gridScale.step : 1;
}

/** Title as shown on a chip: "Exhaustion 3", or "Flying 30 ft" for
 *  grid-distance levels. */
export function displayTitle(def: StatusDef, applied?: Pick<AppliedStatus, "level"> | null): string {
  if (!def.levels) return def.title;
  const lv = applied?.level ?? levelStart(def);
  const val = def.levelGrid && gridScale.unit ? `${lv} ${gridScale.unit}` : String(lv);
  return def.title ? `${def.title} ${val}` : val;
}

/** On-disk shape — short keys to save room-metadata bytes. */
interface CompactDef {
  id: string;
  t: string;
  c: string;
  i?: string;
  e?: string;
  a?: { u: string; w: number; h: number; m: string; d?: number };
  /** levels: 1 / 0 (absent = never set) */
  l?: number;
  /** levelGrid: 1 (absent = plain number) */
  g?: number;
}

// --- Sanitisers ------------------------------------------------------------

export const MAX_TITLE = 40;
const MAX_EMOJI = 16;
const MAX_URL = 1024;
const MAX_ID = 40;
const MAX_LIBRARY = 200;
const MAX_APPLIED = 32;

const HEX_RE = /^#[0-9a-f]{6}$/i;
const MIME_RE = /^(image|video)\/[\w.+-]{1,40}$/i;
const ID_RE = /^[\w-]{1,40}$/;

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v);
}

export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > MAX_URL) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function posNum(v: unknown, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : undefined;
}

export function sanitizeAttachment(raw: unknown): StatusAttachment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (!isHttpUrl(r.url)) return undefined;
  const width = posNum(r.width, 16384) ?? 512;
  const height = posNum(r.height, 16384) ?? 512;
  const mime = typeof r.mime === "string" && MIME_RE.test(r.mime) ? r.mime : guessMime(r.url);
  const out: StatusAttachment = { url: r.url, width: Math.round(width), height: Math.round(height), mime };
  const dpi = posNum(r.dpi, 10000);
  if (dpi) out.dpi = dpi;
  return out;
}

export function guessMime(url: string): string {
  const p = url.split(/[?#]/)[0].toLowerCase();
  if (p.endsWith(".webm")) return "video/webm";
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".avif")) return "image/avif";
  return "image/png";
}

function clampStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const chars = Array.from(v.trim());
  return chars.slice(0, max).join("");
}

/** Normalise one definition (from metadata or from an editor form). */
export function sanitizeDef(raw: unknown): StatusDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID_RE.test(r.id)) return null;
  const def: StatusDef = {
    id: r.id,
    title: clampStr(r.title, MAX_TITLE),
    color: isHexColor(r.color) ? r.color.toLowerCase() : "#7f8c8d",
  };
  const emoji = clampStr(r.emoji, MAX_EMOJI);
  if (emoji) def.emoji = emoji;
  if (typeof r.icon === "string" && (ICON_IDS as readonly string[]).includes(r.icon)) {
    def.icon = r.icon;
  }
  const att = sanitizeAttachment(r.attachment);
  if (att) def.attachment = att;
  if (typeof r.levels === "boolean") def.levels = r.levels;
  if (r.levelGrid === true) def.levelGrid = true;
  return def;
}

function toCompact(d: StatusDef): CompactDef {
  const c: CompactDef = { id: d.id, t: d.title, c: d.color };
  if (d.icon) c.i = d.icon;
  if (d.emoji) c.e = d.emoji;
  if (d.attachment) {
    const a = d.attachment;
    c.a = { u: a.url, w: a.width, h: a.height, m: a.mime };
    if (a.dpi) c.a.d = a.dpi;
  }
  if (d.levels !== undefined) c.l = d.levels ? 1 : 0;
  if (d.levelGrid) c.g = 1;
  return c;
}

function fromCompact(raw: unknown): StatusDef | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const a = c.a && typeof c.a === "object" ? (c.a as Record<string, unknown>) : null;
  return sanitizeDef({
    id: c.id,
    title: c.t,
    color: c.c,
    icon: c.i,
    emoji: c.e,
    attachment: a ? { url: a.u, width: a.w, height: a.h, mime: a.m, dpi: a.d } : undefined,
    levels: c.l === 1 ? true : c.l === 0 ? false : undefined,
    levelGrid: c.g === 1,
  });
}

/** Parse the room-metadata value into a clean, de-duplicated list. */
export function parseLibrary(raw: unknown): StatusDef[] {
  if (!Array.isArray(raw)) return [];
  const out: StatusDef[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const d = fromCompact(entry);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
    if (out.length >= MAX_LIBRARY) break;
  }
  return out;
}

export function serializeLibrary(defs: StatusDef[]): unknown[] {
  return defs.map(toCompact);
}

export function librarySizeBytes(defs: StatusDef[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(serializeLibrary(defs))).length;
  } catch {
    return 0;
  }
}

/** Parse a token's applied-status list. */
export function parseApplied(raw: unknown): AppliedStatus[] {
  if (!Array.isArray(raw)) return [];
  const out: AppliedStatus[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    if (typeof r.uid !== "string" || !ID_RE.test(r.uid) || seen.has(r.uid)) continue;
    if (typeof r.defId !== "string" || !ID_RE.test(r.defId)) continue;
    seen.add(r.uid);
    const a: AppliedStatus = { uid: r.uid, defId: r.defId };
    if (r.hidden === true) a.hidden = true;
    const lv = cleanLevel(r.level);
    if (lv !== undefined) a.level = lv;
    out.push(a);
    if (out.length >= MAX_APPLIED) break;
  }
  return out;
}

export function readApplied(item: Pick<Item, "metadata"> | null | undefined): AppliedStatus[] {
  return parseApplied(item?.metadata?.[APPLIED_KEY]);
}

/** Applied entries this viewer may see (players never see hidden ones). */
export function visibleApplied(applied: AppliedStatus[], isGM: boolean): AppliedStatus[] {
  return isGM ? applied : applied.filter((a) => !a.hidden);
}

/** Applied entries resolved against the library, unknown ids skipped. */
export function resolveVisible(
  item: Item,
  library: Map<string, StatusDef>,
  isGM: boolean,
): Array<{ applied: AppliedStatus; def: StatusDef }> {
  // Hidden tokens are not rendered on player clients at all.
  if (!isGM && item.visible === false) return [];
  const out: Array<{ applied: AppliedStatus; def: StatusDef }> = [];
  for (const a of visibleApplied(readApplied(item), isGM)) {
    const def = library.get(a.defId);
    if (def) out.push({ applied: a, def });
  }
  return out;
}

/** Status tokens: CHARACTER / MOUNT layer images. */
export function isStatusToken(item: Item): boolean {
  return item.type === "IMAGE" && (item.layer === "CHARACTER" || item.layer === "MOUNT");
}

// Room setting "players may only view" — mirrored here by settings.ts
// (initRoomSettings) so canManage stays a plain synchronous check.
let playersMayApplyFlag = true;
export function setPlayersMayApplyFlag(v: boolean): void {
  playersMayApplyFlag = v;
}

/** GM: every token. Player: only tokens they created (own), unless the
 *  GM restricted players to viewing. */
export function canManage(item: Pick<Item, "createdUserId">, isGM: boolean, playerId: string): boolean {
  return isGM || (playersMayApplyFlag && !!playerId && item.createdUserId === playerId);
}

export function newId(prefix = ""): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

/** Current rotation index for a token with `n` visible statuses. */
export function rotationIndex(n: number, now = Date.now(), ms = ROTATE_MS): number {
  if (n <= 1 || ms <= 0) return 0;
  return Math.floor(now / ms) % n;
}

/** Black or white text, whichever reads better on `bg`. */
export function textColorFor(bg: string): string {
  if (!isHexColor(bg)) return "#ffffff";
  const n = parseInt(bg.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white vs black — pick the larger.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? "#ffffff" : "#111111";
}

/** Icon tint for HTML pages: the SVGs are white; on light chips we
 *  invert them to black via CSS filter. */
export function iconFilterFor(bg: string): string {
  return textColorFor(bg) === "#ffffff" ? "none" : "invert(1)";
}
