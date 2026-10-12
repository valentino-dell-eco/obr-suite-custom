// Status Tracker — status library (room metadata) access.
//
// Room metadata is capped at 16 KB for EVERY extension in the room
// together, so the library is stored as a DIFF against the built-in
// D&D 5e presets (which live in code, presets.ts):
//
//   { v: 2, c: [compact defs], d: [preset ids] }
//     c — custom statuses + presets the GM edited (full definition)
//     d — presets the GM deleted
//
// An untouched room stores nothing at all (= every preset), and preset
// titles follow each viewer's UI language. The original format — a
// plain array holding every status — is still read, and converted the
// first time a GM client loads the module.
//
// v3 (current) packs the same diff deflated, with image attachments in
// their own map instead of inside the definitions:
//
//   { v: 3, z: "<base64 deflate-raw of { c, d, a }>" }
//     a — { statusId: { u, w, h, m?, d? } }  (m only when the URL's
//          extension doesn't tell it)
//
// So a preset with an image stays an UNEDITED preset (its title still
// follows the viewer's language) and the whole value is ~3× smaller.
// v1 / v2 rooms are still read and converted to v3 by the GM client.
//
// Writes are "merge by id against a fresh read": the caller says which
// ids it upserts / deletes, we re-read right before the single
// setMetadata call and apply only those changes, so concurrent edits
// to OTHER statuses aren't clobbered.

import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "../../state";
import {
  LIBRARY_KEY,
  StatusDef,
  parseLibrary,
  sanitizeDef,
  serializeLibrary,
} from "./types";
import { LEGACY_PRESET_LOOK, PRESET_ICON, PRESET_IDS, presetDefs } from "./presets";
import { isPacked, packJson, unpackJson } from "../../utils/metaCompress";
import { guessMime, sanitizeAttachment, type StatusAttachment } from "./types";

interface LibraryV2 {
  v: 2;
  c: unknown[];
  d: string[];
}

function isV2(raw: unknown): raw is LibraryV2 {
  return !!raw && typeof raw === "object" && (raw as { v?: unknown }).v === 2;
}

interface LibraryV3 {
  v: 3;
  z: string;
}

/** Unpacked v3 content. */
interface LibraryV3Body {
  c: unknown[];
  d: string[];
  a: Record<string, { u: string; w: number; h: number; m?: string; d?: number }>;
}

function isV3(raw: unknown): raw is LibraryV3 {
  return isPacked(raw) && (raw as { v?: unknown }).v === 3;
}

function packAttachment(a: StatusAttachment): LibraryV3Body["a"][string] {
  const out: LibraryV3Body["a"][string] = { u: a.url, w: a.width, h: a.height };
  if (a.mime !== guessMime(a.url)) out.m = a.mime;
  if (a.dpi) out.d = a.dpi;
  return out;
}

function unpackAttachment(raw: unknown): StatusAttachment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { u?: unknown; w?: unknown; h?: unknown; m?: unknown; d?: unknown };
  return sanitizeAttachment({ url: r.u, width: r.w, height: r.h, mime: r.m, dpi: r.d });
}

const PRESET_SET = new Set(PRESET_IDS);

function presetById(id: string, lang: string): StatusDef | undefined {
  return presetDefs(lang).find((p) => p.id === id);
}

/** Canonical JSON of a definition, for equality checks. */
function canon(d: StatusDef): string {
  return JSON.stringify(serializeLibrary([d])[0]);
}

/** Is `d` just an unedited preset (in either UI language)? Entries from
 *  the original seeding (old icon / emoji, no `levels` yet) count as
 *  unedited too. */
function isUneditedPreset(d: StatusDef): boolean {
  if (!PRESET_SET.has(d.id)) return false;
  let probe: StatusDef = { ...d };
  const old = LEGACY_PRESET_LOOK[d.id];
  if (old && (probe.icon ?? undefined) === old.icon && (probe.emoji ?? undefined) === old.emoji) {
    const { emoji: _drop, ...rest } = probe;
    probe = { ...rest, icon: PRESET_ICON[d.id] || undefined };
  }
  for (const lang of ["en", "zh"]) {
    const p = presetById(d.id, lang);
    if (!p) continue;
    // `levels` never set = take the preset's; false and unset are equal.
    const cmp = { ...probe, levels: (probe.levels ?? p.levels) || undefined };
    if (canon(cmp) === canon({ ...p, levels: p.levels || undefined })) return true;
  }
  return false;
}

/** Room value (any version) → the full library this viewer sees. */
export async function decodeLibrary(raw: unknown, lang: string = getLocalLang()): Promise<StatusDef[]> {
  if (!isV3(raw)) return resolveLibrary(raw, lang);
  let body: Partial<LibraryV3Body> = {};
  try {
    body = (await unpackJson<LibraryV3Body>(raw)) ?? {};
  } catch (e) {
    console.warn("[status-tester] library unpack failed", e);
  }
  const defs = resolveLibrary({ v: 2, c: Array.isArray(body.c) ? body.c : [], d: Array.isArray(body.d) ? body.d : [] }, lang);
  const atts = body.a && typeof body.a === "object" ? body.a : {};
  return defs.map((d) => {
    const att = unpackAttachment(atts[d.id]);
    return att ? { ...d, attachment: att } : d;
  });
}

/** v1 / v2 room value → the full library this viewer sees. */
export function resolveLibrary(raw: unknown, lang: string = getLocalLang()): StatusDef[] {
  const presets = presetDefs(lang);
  if (raw === undefined || raw === null) return presets;
  if (Array.isArray(raw)) {
    // Original format: every status stored in full.
    return parseLibrary(raw).map((d) => (isUneditedPreset(d) ? presetById(d.id, lang) ?? d : d));
  }
  if (!isV2(raw)) return presets;
  const custom = parseLibrary(raw.c);
  const deleted = new Set(Array.isArray(raw.d) ? raw.d.filter((x): x is string => typeof x === "string") : []);
  const byId = new Map(custom.map((d) => [d.id, d]));
  const out = presets.filter((p) => !deleted.has(p.id)).map((p) => byId.get(p.id) ?? p);
  for (const d of custom) if (!PRESET_SET.has(d.id)) out.push(d);
  return out;
}

/** Full library → the packed (v3) room value. Attachments go to their
 *  own map, so linking an image doesn't turn a preset into an edited
 *  copy. */
export async function encodeLibrary(defs: StatusDef[]): Promise<LibraryV3> {
  const have = new Set(defs.map((d) => d.id));
  const a: LibraryV3Body["a"] = {};
  const bare: StatusDef[] = [];
  for (const d of defs) {
    if (d.attachment) a[d.id] = packAttachment(d.attachment);
    const { attachment: _att, ...rest } = d;
    bare.push(rest);
  }
  const body: LibraryV3Body = {
    c: serializeLibrary(bare.filter((d) => !isUneditedPreset(d))),
    d: PRESET_IDS.filter((id) => !have.has(id)),
    a,
  };
  return { v: 3, ...(await packJson(body)) };
}

/** Bytes the library takes in room metadata. */
export async function encodedLibraryBytes(defs: StatusDef[]): Promise<number> {
  try {
    return new TextEncoder().encode(JSON.stringify(await encodeLibrary(defs))).length;
  } catch {
    return 0;
  }
}

export async function readLibrary(): Promise<StatusDef[]> {
  try {
    const meta = await OBR.room.getMetadata();
    return await decodeLibrary(meta[LIBRARY_KEY]);
  } catch {
    return presetDefs(getLocalLang());
  }
}

export function libraryFromMetadata(meta: Record<string, unknown>): Promise<StatusDef[]> {
  return decodeLibrary(meta[LIBRARY_KEY]);
}

export function onLibraryChange(cb: (defs: StatusDef[]) => void): () => void {
  let last = "";
  let seq = 0;
  return OBR.room.onMetadataChange((meta) => {
    // Room metadata is shared by every module — only react when OUR
    // key actually changed.
    let raw = "";
    try { raw = JSON.stringify(meta[LIBRARY_KEY] ?? null); } catch {}
    if (raw === last) return;
    last = raw;
    // Unpacking is async: drop a result a newer change overtook.
    const my = ++seq;
    void decodeLibrary(meta[LIBRARY_KEY]).then((defs) => {
      if (my === seq) cb(defs);
    });
  });
}

/** Room metadata is capped at 16 KB for ALL extensions together. Used
 *  to explain a failed write: total size + the biggest keys. */
export const ROOM_LIMIT_BYTES = 16 * 1024;
export async function roomMetadataUsage(): Promise<{ total: number; top: Array<{ key: string; bytes: number }> }> {
  const enc = new TextEncoder();
  const meta = await OBR.room.getMetadata();
  const top = Object.entries(meta)
    .map(([key, v]) => ({ key, bytes: enc.encode(JSON.stringify({ [key]: v })).length }))
    .sort((a, b) => b.bytes - a.bytes);
  return { total: enc.encode(JSON.stringify(meta)).length, top };
}

/** True when an OBR error means "room metadata over 16 KB". */
export function isSizeLimitError(e: unknown): boolean {
  return /size limit/i.test(String((e as Error)?.message ?? e));
}

export async function writeLibraryChanges(changes: {
  upsert?: StatusDef[];
  remove?: string[];
}): Promise<StatusDef[]> {
  const fresh = await readLibrary();
  const removeSet = new Set(changes.remove ?? []);
  let next = fresh.filter((d) => !removeSet.has(d.id));
  for (const raw of changes.upsert ?? []) {
    const d = sanitizeDef(raw);
    if (!d) continue;
    const i = next.findIndex((x) => x.id === d.id);
    if (i >= 0) next[i] = d;
    else next = [...next, d];
  }
  await OBR.room.setMetadata({ [LIBRARY_KEY]: await encodeLibrary(next) });
  return next;
}

/** GM load: rooms still holding an older format (full list, or the
 *  unpacked v2 diff) are converted to the packed v3 value (frees most
 *  of the space). Nothing is written for a room that never touched the
 *  library — the presets are implicit. Call from a GM client only. */
export async function seedPresetsIfMissing(lang: string): Promise<boolean> {
  try {
    const meta = await OBR.room.getMetadata();
    const raw = meta[LIBRARY_KEY];
    if (!Array.isArray(raw) && !isV2(raw)) return false;
    await OBR.room.setMetadata({ [LIBRARY_KEY]: await encodeLibrary(resolveLibrary(raw, lang)) });
    return true;
  } catch (e) {
    console.warn("[status-tester] library conversion failed", e);
    return false;
  }
}

/** Re-add every preset missing from the library (edited presets keep
 *  their edits). Returns how many were added. */
export async function restoreMissingPresets(lang: string): Promise<number> {
  const fresh = await readLibrary();
  const have = new Set(fresh.map((d) => d.id));
  const missing = presetDefs(lang).filter((d) => !have.has(d.id));
  if (missing.length) await writeLibraryChanges({ upsert: missing });
  return missing.length;
}
