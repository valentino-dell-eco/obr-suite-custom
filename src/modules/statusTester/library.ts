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

interface LibraryV2 {
  v: 2;
  c: unknown[];
  d: string[];
}

function isV2(raw: unknown): raw is LibraryV2 {
  return !!raw && typeof raw === "object" && (raw as { v?: unknown }).v === 2;
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

/** Room value → the full library this viewer sees. */
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

/** Full library → the compact room value. */
export function encodeLibrary(defs: StatusDef[]): LibraryV2 {
  const have = new Set(defs.map((d) => d.id));
  return {
    v: 2,
    c: serializeLibrary(defs.filter((d) => !isUneditedPreset(d))),
    d: PRESET_IDS.filter((id) => !have.has(id)),
  };
}

/** Bytes the library takes in room metadata. */
export function encodedLibraryBytes(defs: StatusDef[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(encodeLibrary(defs))).length;
  } catch {
    return 0;
  }
}

export async function readLibrary(): Promise<StatusDef[]> {
  try {
    const meta = await OBR.room.getMetadata();
    return resolveLibrary(meta[LIBRARY_KEY]);
  } catch {
    return presetDefs(getLocalLang());
  }
}

export function libraryFromMetadata(meta: Record<string, unknown>): StatusDef[] {
  return resolveLibrary(meta[LIBRARY_KEY]);
}

export function onLibraryChange(cb: (defs: StatusDef[]) => void): () => void {
  let last = "";
  return OBR.room.onMetadataChange((meta) => {
    // Room metadata is shared by every module — only react when OUR
    // key actually changed.
    let raw = "";
    try { raw = JSON.stringify(meta[LIBRARY_KEY] ?? null); } catch {}
    if (raw === last) return;
    last = raw;
    cb(resolveLibrary(meta[LIBRARY_KEY]));
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
  await OBR.room.setMetadata({ [LIBRARY_KEY]: encodeLibrary(next) });
  return next;
}

/** GM load: rooms still holding the original full-list format are
 *  converted to the compact diff (frees most of the space). Nothing
 *  is written for a room that never touched the library — the presets
 *  are implicit. Call from a GM client only. */
export async function seedPresetsIfMissing(lang: string): Promise<boolean> {
  try {
    const meta = await OBR.room.getMetadata();
    const raw = meta[LIBRARY_KEY];
    if (!Array.isArray(raw)) return false;
    await OBR.room.setMetadata({ [LIBRARY_KEY]: encodeLibrary(resolveLibrary(raw, lang)) });
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
