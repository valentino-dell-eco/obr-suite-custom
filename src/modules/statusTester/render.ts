// Status Tester — per-client map rendering with OBR.scene.local items.
//
// For every CHARACTER / MOUNT token with statuses THIS client may see
// (players: non-hidden statuses on visible tokens) we build, for EACH
// visible status:
//   bg    — rounded-rect Path (fill = status colour), above the token
//   icon  — Image (base SVG icon)  …or…  emoji — Text item
//   title — Text item
//   att   — optional Image overlay sized like the token (ATTACHMENT layer)
// All items are LOCAL (never synced), attached to the token (they
// follow its position), disableHit + locked, and carry OWNER_KEY so they
// can be swept on setup / teardown / scene change.
//
// Only one status per token is "shown" at a time; the others are kept
// at alpha 0 (paths / text: fill opacity 0, images: scale ≈ 0 — OBR
// Image items have no opacity property). Every ROTATE_MS a single shared
// timer cross-fades tokens with ≥2 statuses to the next one.
//
// Re-sync is signature-gated: a token is rebuilt (delete + add of its
// own items) only when its statuses / library entries / size / rotation
// / visibility changed. Position is NOT in the signature — attached
// items follow token moves on their own.

import OBR, {
  buildImage,
  buildPath,
  buildText,
  Command,
  isImage,
  type BoundingBox,
  type FormattedText,
  type Image,
  type RichText,
  type Item,
  type PathCommand,
} from "@owlbear-rodeo/sdk";
import {
  ICON_PX,
  OWNER_KEY,
  PLUGIN_ID,
  StatusDef,
  displayTitle,
  titleParts,
  iconUrl,
  isStatusToken,
  resolveVisible,
  rotationIndex,
  textColorFor,
  type AppliedStatus,
} from "./types";
import {
  getLocalSettings,
  getRoomSettings,
  rotateMs,
  type ChipPosition,
  type SttLocalSettings,
} from "./settings";

type Role = "bg" | "icon" | "emoji" | "title" | "att";

const FONT = '-apple-system,"Segoe UI","Microsoft YaHei",sans-serif';
const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji","Twemoji Mozilla",sans-serif';
const BG_ALPHA = 0.95;
const STROKE_ALPHA = 0.45;
const MIN_SCALE = 0.0001;
const FADE_STEPS = 5;
const FADE_STEP_MS = 70; // ≈350 ms total
const Z_ATT = 10;
const Z_BG = 20;
const Z_FG = 30;

// --- Geometry (shared with the chip popover) -------------------------------

export interface ChipMetrics {
  w: number;
  h: number;
  fontSize: number;
  pad: number;
  iconSize: number;
  gap: number;
  textW: number;
}

function charWidth(ch: string, fontSize: number): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (ch === " ") return fontSize * 0.3;
  if (cp >= 0x2e80) return fontSize * 1.0; // CJK / emoji / symbols
  if (/[A-Z0-9MW@#%&]/.test(ch)) return fontSize * 0.68;
  if (/[il.,:;'|!]/.test(ch)) return fontSize * 0.3;
  return fontSize * 0.56;
}

// Real text measurement (canvas, same font as the map Text items) so the
// pill hugs its title. The old per-character estimate ran wide on long
// Latin titles and left an empty tail on the right of the chip.
let measureCtx: CanvasRenderingContext2D | null | undefined;
const MEASURE_PX = 100;
const widthCache = new Map<string, number>();
function measuredWidth100(text: string): number | null {
  if (measureCtx === undefined) {
    try { measureCtx = document.createElement("canvas").getContext("2d"); } catch { measureCtx = null; }
    if (measureCtx) measureCtx.font = `700 ${MEASURE_PX}px ${FONT}`;
  }
  if (!measureCtx) return null;
  let w = widthCache.get(text);
  if (w === undefined) {
    w = measureCtx.measureText(text).width;
    if (widthCache.size > 500) widthCache.clear();
    widthCache.set(text, w);
  }
  return w;
}

function textWidth(text: string, fontSize: number): number {
  const w100 = measuredWidth100(text);
  // +3%: the map renderer's glyph spacing differs a hair from canvas.
  if (w100 !== null) return (w100 / MEASURE_PX) * fontSize * 1.03;
  let w = 0;
  for (const ch of Array.from(text)) w += charWidth(ch, fontSize);
  return w * 1.08;
}

/** Chip size (world units) for a status title at chip height `h`.
 *  `iconScale` / `textScale` are the personal size settings. */
export function chipMetrics(
  title: string,
  h: number,
  hasIcon = true,
  scales: { iconScale?: number; textScale?: number } = {},
): ChipMetrics {
  const fontSize = h * 0.52 * (scales.textScale ?? 1);
  const pad = h * 0.32;
  const iconSize = hasIcon ? Math.min(h * 0.7 * (scales.iconScale ?? 1), h * 1.3) : 0;
  const gap = hasIcon && title ? h * 0.18 : 0;
  const textW = textWidth(title, fontSize);
  const w = Math.max(h, pad + iconSize + gap + textW + pad);
  return { w, h, fontSize, pad, iconSize, gap, textW };
}

/** Chip height in world units for a token of the given bounds. */
export function chipHeight(bounds: BoundingBox, sceneDpi: number, chipScale = 1): number {
  const h = bounds.width * 0.2;
  return Math.min(Math.max(h, sceneDpi * 0.16), sceneDpi * 0.6) * chipScale;
}

export type ChipAlign = "center" | "start" | "end";

/** Where chips sit for a token. `x` is the chip's horizontal CENTRE
 *  (align "center"), LEFT edge ("start", right of the token) or RIGHT
 *  edge ("end", left of the token); `y` is the vertical centre. */
export function chipAnchor(
  bounds: BoundingBox,
  sceneDpi: number,
  position: ChipPosition = getRoomSettings().position,
  chipScale = getLocalSettings().chipScale,
): { x: number; y: number; h: number; align: ChipAlign } {
  const h = chipHeight(bounds, sceneDpi, chipScale);
  const gap = h * 0.3;
  // Room-wide offset (scene px): negative = left / up.
  const { offsetX: dx, offsetY: dy } = getRoomSettings();
  switch (position) {
    case "bottom":
      return { x: bounds.center.x + dx, y: bounds.max.y + gap + h / 2 + dy, h, align: "center" };
    case "right":
      return { x: bounds.max.x + gap + dx, y: bounds.center.y + dy, h, align: "start" };
    case "left":
      return { x: bounds.min.x - gap + dx, y: bounds.center.y + dy, h, align: "end" };
    default:
      return { x: bounds.center.x + dx, y: bounds.min.y - gap - h / 2 + dy, h, align: "center" };
  }
}

/** Centre x of a chip of width `w` placed at `anchor`. */
export function chipCenterX(anchor: { x: number; align: ChipAlign }, w: number): number {
  if (anchor.align === "start") return anchor.x + w / 2;
  if (anchor.align === "end") return anchor.x - w / 2;
  return anchor.x;
}

/** Chip text: title (+ level) (+ "+N" when rotation is off). */
export function chipText(def: StatusDef, applied: AppliedStatus, extra = 0): string {
  const base = displayTitle(def, applied);
  return extra > 0 ? `${base} +${extra}` : base;
}

/** chipText() as OBR rich text: the level (+ unit) in italics. */
export function chipRichText(def: StatusDef, applied: AppliedStatus, extra = 0): RichText {
  const p = titleParts(def, applied);
  const tail = extra > 0 ? ` +${extra}` : "";
  const children: FormattedText[] = [];
  if (p.title) children.push({ text: p.level ? `${p.title} ` : p.title + tail, bold: true });
  if (p.level) children.push({ text: p.level, bold: true, italic: true });
  if (p.level && tail) children.push({ text: tail, bold: true });
  if (!children.length) children.push({ text: tail.trim(), bold: true });
  return [{ type: "paragraph", children }];
}

/** The statuses actually drawn: all of them while rotating, only the
 *  first (with a "+N" count) when rotation is off. */
export function drawnStatuses<T>(list: T[], s: SttLocalSettings = getLocalSettings()): { list: T[]; extra: number } {
  if (s.rotateSec > 0 || list.length <= 1) return { list, extra: 0 };
  return { list: list.slice(0, 1), extra: list.length - 1 };
}

const KAPPA = 0.5522847498;
function arc(cx: number, cy: number, r: number, a0: number, a1: number): PathCommand {
  const dir = a1 > a0 ? 1 : -1;
  const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
  const p3 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
  const k = KAPPA * r * dir;
  return [
    Command.CUBIC,
    p0.x - k * Math.sin(a0), p0.y + k * Math.cos(a0),
    p3.x + k * Math.sin(a1), p3.y - k * Math.cos(a1),
    p3.x, p3.y,
  ];
}

/** Pill-shaped path centred on (0,0). */
function pillCommands(w: number, h: number): PathCommand[] {
  const r = h / 2;
  const x0 = -w / 2 + r;
  const x1 = w / 2 - r;
  const H = Math.PI / 2;
  return [
    [Command.MOVE, x0, -r],
    [Command.LINE, x1, -r],
    arc(x1, 0, r, -H, 0),
    arc(x1, 0, r, 0, H),
    [Command.LINE, x0, r],
    arc(x0, 0, r, H, 2 * H),
    arc(x0, 0, r, 2 * H, 3 * H),
    [Command.CLOSE],
  ];
}

// --- State -----------------------------------------------------------------

interface EntryState {
  uid: string;
  ids: Partial<Record<Role, string>>;
  iconScale: number;
  attScale: number;
  dim: number;
}

interface TokenState {
  sig: string;
  entries: EntryState[];
  index: number;
  gen: number;
  animating: boolean;
  byId: Map<string, { entry: EntryState; role: Role }>;
}

let library = new Map<string, StatusDef>();
let isGM = false;
let sceneDpi = 150;
let lastItems: Item[] = [];
const tokens = new Map<string, TokenState>();
let genCounter = 0;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let syncAgain = false;
let rotAlign: ReturnType<typeof setTimeout> | null = null;
let rotTimer: ReturnType<typeof setInterval> | null = null;
let active = false;

export function getLibraryMap(): Map<string, StatusDef> {
  return library;
}
export function getSceneDpi(): number {
  return sceneDpi;
}

export function setLibrary(defs: StatusDef[]): void {
  library = new Map(defs.map((d) => [d.id, d]));
}

export function setRole(gm: boolean): void {
  isGM = gm;
}

function itemId(tokenId: string, uid: string, role: Role): string {
  return `${PLUGIN_ID}/l/${tokenId}/${uid}/${role}`;
}

function ownerMeta(tokenId: string): Record<string, unknown> {
  return { [OWNER_KEY]: tokenId };
}

function allIds(st: TokenState): string[] {
  return [...st.byId.keys()];
}

function tokenSig(token: Image, statuses: Array<{ applied: AppliedStatus; def: StatusDef }>): string {
  const ls = getLocalSettings();
  return JSON.stringify([
    statuses.map((s) => [s.applied.uid, !!s.applied.hidden, s.applied.level ?? null, s.def]),
    getRoomSettings().position,
    getRoomSettings().offsetX,
    getRoomSettings().offsetY,
    ls.chipScale, ls.iconScale, ls.textScale, ls.showAttachments, ls.rotateSec > 0,
    token.scale,
    token.rotation,
    token.image.width,
    token.image.height,
    token.grid.dpi,
    token.grid.offset,
    token.visible,
    sceneDpi,
  ]);
}

/** Build every local item for one token. Returns items + state. */
function buildToken(
  token: Image,
  statuses: Array<{ applied: AppliedStatus; def: StatusDef }>,
  bounds: BoundingBox,
  sig: string,
): { items: Item[]; state: TokenState } {
  const ls = getLocalSettings();
  const drawn = drawnStatuses(statuses, ls);
  statuses = drawn.list;
  const n = statuses.length;
  const index = rotationIndex(n, Date.now(), rotateMs(ls));
  const anchor = chipAnchor(bounds, sceneDpi, getRoomSettings().position, ls.chipScale);
  const h = anchor.h;
  const items: Item[] = [];
  const entries: EntryState[] = [];
  const byId = new Map<string, { entry: EntryState; role: Role }>();

  // Token size in world units (unrotated) for the attachment overlay.
  const tw = (token.image.width / (token.grid.dpi || 150)) * sceneDpi * Math.abs(token.scale.x || 1);
  const th = (token.image.height / (token.grid.dpi || 150)) * sceneDpi * Math.abs(token.scale.y || 1);

  statuses.forEach(({ applied, def }, k) => {
    const shown = k === index ? 1 : 0;
    const hasIcon = !!(def.emoji || def.icon);
    const text = chipText(def, applied, drawn.extra);
    const m = chipMetrics(text, h, hasIcon, ls);
    const fg = textColorFor(def.color);
    const center = { x: chipCenterX(anchor, m.w), y: anchor.y };
    const entry: EntryState = {
      uid: applied.uid,
      ids: {},
      iconScale: m.iconSize / ICON_PX,
      attScale: 1,
      dim: applied.hidden ? 0.6 : 1,
    };
    const left = center.x - m.w / 2;
    const reg = (role: Role, item: Item) => {
      entry.ids[role] = item.id;
      byId.set(item.id, { entry, role });
      items.push(item);
    };

    // Background pill.
    const bg = buildPath()
      .id(itemId(token.id, applied.uid, "bg"))
      .commands(pillCommands(m.w, h))
      .position({ x: center.x, y: center.y })
      .fillColor(def.color)
      .fillOpacity(shown * BG_ALPHA * entry.dim)
      .strokeColor(applied.hidden ? "#ffffff" : "#000000")
      .strokeOpacity(shown * STROKE_ALPHA)
      .strokeWidth(Math.max(1, h * 0.06))
      .strokeDash(applied.hidden ? [h * 0.18, h * 0.12] : [])
      .layer("ATTACHMENT")
      .zIndex(Z_BG)
      .disableAutoZIndex(true)
      .attachedTo(token.id)
      .locked(true)
      .disableHit(true)
      .disableAttachmentBehavior(["SCALE", "ROTATION", "COPY"])
      .metadata(ownerMeta(token.id))
      .build();
    reg("bg", bg);

    const iconCx = left + m.pad + m.iconSize / 2;
    if (def.emoji) {
      const box = m.iconSize * 1.5;
      const emoji = buildText()
        .id(itemId(token.id, applied.uid, "emoji"))
        .textType("PLAIN")
        .plainText(def.emoji)
        .position({ x: iconCx - box / 2, y: center.y - box / 2 })
        .width(box)
        .height(box)
        .fontSize(m.iconSize * 0.9)
        .fontFamily(EMOJI_FONT)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor(fg)
        .fillOpacity(shown * entry.dim)
        .strokeOpacity(0)
        .strokeWidth(0)
        .padding(0)
        .layer("ATTACHMENT")
        .zIndex(Z_FG)
        .disableAutoZIndex(true)
        .attachedTo(token.id)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(["SCALE", "ROTATION", "COPY"])
        .metadata(ownerMeta(token.id))
        .build();
      reg("emoji", emoji);
    } else if (def.icon) {
      const s = shown ? entry.iconScale : MIN_SCALE;
      const icon = buildImage(
        { width: ICON_PX, height: ICON_PX, mime: "image/svg+xml", url: iconUrl(def.icon, fg !== "#ffffff") },
        { dpi: sceneDpi, offset: { x: ICON_PX / 2, y: ICON_PX / 2 } },
      )
        .id(itemId(token.id, applied.uid, "icon"))
        .position({ x: iconCx, y: center.y })
        .scale({ x: s, y: s })
        .layer("ATTACHMENT")
        .zIndex(Z_FG)
        .disableAutoZIndex(true)
        .attachedTo(token.id)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(["SCALE", "ROTATION", "COPY"])
        .metadata(ownerMeta(token.id))
        .build();
      reg("icon", icon);
    }

    if (text) {
      const textX = left + m.pad + m.iconSize + m.gap;
      const title = buildText()
        .id(itemId(token.id, applied.uid, "title"))
        // Rich text only when there's a level to italicise.
        .textType(titleParts(def, applied).level ? "RICH" : "PLAIN")
        .plainText(text)
        .richText(chipRichText(def, applied, drawn.extra))
        .position({ x: textX, y: center.y - h / 2 })
        .width(m.textW + m.pad * 0.5)
        .height(h)
        .fontSize(m.fontSize)
        .fontFamily(FONT)
        .fontWeight(700)
        .textAlign("LEFT")
        .textAlignVertical("MIDDLE")
        .fillColor(fg)
        .fillOpacity(shown * entry.dim)
        .strokeOpacity(0)
        .strokeWidth(0)
        .padding(0)
        .layer("ATTACHMENT")
        .zIndex(Z_FG)
        .disableAutoZIndex(true)
        .attachedTo(token.id)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(["SCALE", "ROTATION", "COPY"])
        .metadata(ownerMeta(token.id))
        .build();
      reg("title", title);
    }

    const a = ls.showAttachments ? def.attachment : undefined;
    if (a) {
      entry.attScale = Math.min(tw / a.width, th / a.height);
      const s = shown ? entry.attScale : MIN_SCALE;
      const att = buildImage(
        { width: a.width, height: a.height, mime: a.mime, url: a.url },
        { dpi: sceneDpi, offset: { x: a.width / 2, y: a.height / 2 } },
      )
        .id(itemId(token.id, applied.uid, "att"))
        .position({ x: bounds.center.x, y: bounds.center.y })
        .rotation(token.rotation)
        .scale({ x: s, y: s })
        .layer("ATTACHMENT")
        .zIndex(Z_ATT)
        .disableAutoZIndex(true)
        .attachedTo(token.id)
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(["SCALE", "ROTATION", "COPY"])
        .metadata(ownerMeta(token.id))
        .build();
      reg("att", att);
    }
    entries.push(entry);
  });

  return {
    items,
    state: { sig, entries, index, gen: ++genCounter, animating: false, byId },
  };
}

/** Apply a visibility alpha (0..1) to a draft of one of our items. */
function applyAlpha(draft: any, role: Role, entry: EntryState, alpha: number): void {
  switch (role) {
    case "bg":
      draft.style.fillOpacity = alpha * BG_ALPHA * entry.dim;
      draft.style.strokeOpacity = alpha * STROKE_ALPHA;
      break;
    case "emoji":
    case "title":
      draft.text.style.fillOpacity = alpha * entry.dim;
      break;
    case "icon": {
      const s = Math.max(MIN_SCALE, entry.iconScale * alpha);
      draft.scale = { x: s, y: s };
      break;
    }
    case "att": {
      const s = Math.max(MIN_SCALE, entry.attScale * alpha);
      draft.scale = { x: s, y: s };
      break;
    }
  }
}

// --- Sync ------------------------------------------------------------------

async function runSync(): Promise<void> {
  if (!active) return;
  try { sceneDpi = await OBR.scene.grid.getDpi(); } catch {}
  const seen = new Set<string>();
  const changed: Array<{ token: Image; statuses: Array<{ applied: AppliedStatus; def: StatusDef }>; sig: string }> = [];
  for (const it of lastItems) {
    if (!isImage(it) || !isStatusToken(it)) continue;
    const statuses = resolveVisible(it, library, isGM);
    if (statuses.length === 0) continue;
    seen.add(it.id);
    const sig = tokenSig(it, statuses);
    if (tokens.get(it.id)?.sig === sig) continue;
    changed.push({ token: it, statuses, sig });
  }

  const toDelete: string[] = [];
  for (const [id, st] of tokens) {
    if (!seen.has(id)) {
      toDelete.push(...allIds(st));
      tokens.delete(id);
    }
  }
  const toAdd: Item[] = [];
  for (const c of changed) {
    let bounds: BoundingBox;
    try {
      bounds = await OBR.scene.items.getItemBounds([c.token.id]);
    } catch {
      continue;
    }
    if (!active) return;
    const prev = tokens.get(c.token.id);
    if (prev) toDelete.push(...allIds(prev));
    const built = buildToken(c.token, c.statuses, bounds, c.sig);
    tokens.set(c.token.id, built.state);
    toAdd.push(...built.items);
  }
  if (toDelete.length) {
    try { await OBR.scene.local.deleteItems(toDelete); } catch {}
  }
  if (toAdd.length && active) {
    try {
      await OBR.scene.local.addItems(toAdd);
    } catch (e) {
      console.warn("[status-tester] addItems failed", e);
      // Force a rebuild on the next sync.
      for (const c of changed) tokens.delete(c.token.id);
    }
  }
}

async function syncLoop(): Promise<void> {
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  try {
    do {
      syncAgain = false;
      await runSync();
    } while (syncAgain && active);
  } finally {
    syncing = false;
  }
}

/** Debounced re-sync. Pass the latest full item list when available
 *  (items.onChange gives it); otherwise the last known list is reused. */
export function scheduleSync(items?: Item[]): void {
  if (items) lastItems = items;
  if (!active) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncLoop();
  }, 80);
}

/** Sweep every local item we own (any token). */
export async function sweepAll(): Promise<void> {
  try {
    const ours = await OBR.scene.local.getItems(
      (it) => typeof it.metadata?.[OWNER_KEY] === "string",
    );
    if (ours.length) await OBR.scene.local.deleteItems(ours.map((i) => i.id));
  } catch {}
}

/** Drop all state, sweep, re-read the scene and rebuild. */
export async function fullResync(): Promise<void> {
  tokens.clear();
  if (!active) return;
  let ready = false;
  try { ready = await OBR.scene.isReady(); } catch {}
  if (!ready) return;
  await sweepAll();
  try { lastItems = await OBR.scene.items.getItems(); } catch { lastItems = []; }
  await syncLoop();
}

/** Forget everything without touching OBR (scene closed). */
export function resetState(): void {
  tokens.clear();
  lastItems = [];
}

// --- Rotation --------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function crossfade(tokenId: string, st: TokenState, to: number): Promise<void> {
  const from = st.index;
  const outE = st.entries[from];
  const inE = st.entries[to];
  if (!outE || !inE) {
    st.index = to;
    return;
  }
  st.animating = true;
  const ids = [...Object.values(outE.ids), ...Object.values(inE.ids)] as string[];
  try {
    for (let i = 1; i <= FADE_STEPS; i++) {
      if (!active || tokens.get(tokenId) !== st) return;
      const t = i / FADE_STEPS;
      const eased = t * t * (3 - 2 * t);
      await OBR.scene.local.updateItems(
        ids,
        (drafts) => {
          for (const d of drafts) {
            const ref = st.byId.get(d.id);
            if (!ref) continue;
            applyAlpha(d, ref.role, ref.entry, ref.entry === outE ? 1 - eased : eased);
          }
        },
        i < FADE_STEPS,
      );
      if (i < FADE_STEPS) await sleep(FADE_STEP_MS);
    }
    st.index = to;
  } catch {
    // Items vanished mid-animation (token rebuilt / deleted) — the next
    // sync owns the state now.
  } finally {
    st.animating = false;
  }
}

function rotateAll(): void {
  if (!active) return;
  for (const [id, st] of tokens) {
    const n = st.entries.length;
    if (n < 2 || st.animating) continue;
    const target = rotationIndex(n, Date.now() + 50, rotateMs());
    if (target !== st.index) void crossfade(id, st, target);
  }
}

function startRotation(): void {
  stopRotation();
  const ms = rotateMs();
  if (ms <= 0) return; // rotation off: first status + "+N"
  // Align to the wall-clock boundary so the chip popover (same
  // formula) switches in step with the map.
  const delay = ms - (Date.now() % ms) + 20;
  rotAlign = setTimeout(() => {
    rotAlign = null;
    rotateAll();
    rotTimer = setInterval(rotateAll, ms);
  }, delay);
}

/** Settings changed (size, position, rotation, attachments): rebuild
 *  every token and restart the rotation timer. Signatures include the
 *  settings, so a plain re-sync rebuilds what changed. */
export function applySettingsChange(): void {
  if (!active) return;
  startRotation();
  scheduleSync();
}

function stopRotation(): void {
  if (rotAlign) clearTimeout(rotAlign);
  if (rotTimer) clearInterval(rotTimer);
  rotAlign = null;
  rotTimer = null;
}

export function startRenderer(): void {
  active = true;
  startRotation();
}

export async function stopRenderer(): Promise<void> {
  active = false;
  stopRotation();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  tokens.clear();
  lastItems = [];
  await sweepAll();
}
