// Status Tester — status library (room metadata) access.
//
// Usable from the background iframe and from every page. Writes are
// "merge by id against a fresh read": the caller says which ids it
// upserts / deletes, we re-read the room metadata right before the
// single setMetadata call and apply only those changes, so concurrent
// edits to OTHER statuses aren't clobbered.

import OBR from "@owlbear-rodeo/sdk";
import {
  LIBRARY_KEY,
  StatusDef,
  parseLibrary,
  sanitizeDef,
  serializeLibrary,
} from "./types";
import { LEGACY_PRESET_LOOK, PRESET_ICON, PRESET_LEVELS, presetDefs } from "./presets";

export async function readLibrary(): Promise<StatusDef[]> {
  try {
    const meta = await OBR.room.getMetadata();
    return parseLibrary(meta[LIBRARY_KEY]);
  } catch {
    return [];
  }
}

export function libraryFromMetadata(meta: Record<string, unknown>): StatusDef[] {
  return parseLibrary(meta[LIBRARY_KEY]);
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
    cb(parseLibrary(meta[LIBRARY_KEY]));
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
  await OBR.room.setMetadata({ [LIBRARY_KEY]: serializeLibrary(next) });
  return next;
}

/** First run in a room (no library key at all): seed the D&D 5e 2014
 *  presets. A library the GM emptied on purpose ([] stored) is left
 *  alone. Call from a GM client only. */
export async function seedPresetsIfMissing(lang: string): Promise<boolean> {
  try {
    const meta = await OBR.room.getMetadata();
    if (meta[LIBRARY_KEY] !== undefined) {
      await upgradeLegacyPresets();
      return false;
    }
    await OBR.room.setMetadata({ [LIBRARY_KEY]: serializeLibrary(presetDefs(lang)) });
    return true;
  } catch {
    return false;
  }
}

/** Re-add every preset whose id is not in the library (edited presets
 *  keep their edits). Returns how many were added. */
export async function restoreMissingPresets(lang: string): Promise<number> {
  const fresh = await readLibrary();
  const have = new Set(fresh.map((d) => d.id));
  const missing = presetDefs(lang).filter((d) => !have.has(d.id));
  if (missing.length) await writeLibraryChanges({ upsert: missing });
  return missing.length;
}

/** Presets seeded before the D&D icon set still use a generic icon or
 *  an emoji. Move them to their new icon — only entries whose icon and
 *  emoji are EXACTLY the original seeded ones (never a GM's edits). */
export async function upgradeLegacyPresets(): Promise<number> {
  const fresh = await readLibrary();
  const upsert: StatusDef[] = [];
  for (const d of fresh) {
    // Presets seeded before levels existed (Exhaustion): turn levels on
    // once — `levels` is stored explicitly afterwards, so a GM who
    // switches it off is never overridden.
    if (PRESET_LEVELS.has(d.id) && d.levels === undefined) {
      upsert.push({ ...d, levels: true });
      continue;
    }
    const old = LEGACY_PRESET_LOOK[d.id];
    const icon = PRESET_ICON[d.id];
    if (!old || !icon) continue;
    if ((d.icon ?? undefined) !== old.icon || (d.emoji ?? undefined) !== old.emoji) continue;
    const { emoji: _drop, ...rest } = d;
    upsert.push({ ...rest, icon });
  }
  if (upsert.length) await writeLibraryChanges({ upsert });
  return upsert.length;
}
