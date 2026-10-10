// World-pack importer — opposite of exporter. Reads a .fobr blob,
// resolves embed sentinels back to data: URLs, and applies items +
// scene metadata to the active scene.
//
// Two modes:
//   replace — the pack's items are added FIRST; the current scene is
//     removed only after they are in (on rejected items the user can
//     roll back and keep the scene untouched).
//   merge   — keep the current scene; the import's items get fresh
//     ids before they're added.
//
// Robustness notes (added 2026-05-04 after first user trial showed
// "addItems batch failed"):
//   * IDs are ALWAYS regenerated on import — even in replace mode.
//     OBR doesn't always flush deleteItems before the next addItems
//     hits the wire, so re-using deleted IDs sometimes 409s. Cheap
//     to mint new ids; attachedTo remap keeps internal references.
//   * Ephemeral fields the SDK auto-manages (`lastModified`,
//     `createdUserId`) are stripped — passing stale values can fail
//     server-side validation.
//   * Items are topologically sorted so a child item never lands
//     before its `attachedTo` parent.
//   * On batch failure we fall back to per-item add so the user can
//     see WHICH item is the culprit in the console (and the rest of
//     the scene still loads).

import OBR from "@owlbear-rodeo/sdk";
import { FobrManifest, EMBED_PREFIX, unpackFobr } from "./format";
import { t } from "../../i18n";
import { getLocalLang } from "../../state";

export interface ImportProgress {
  phase: "parsing" | "rewriting" | "applying-metadata" | "applying-items" | "done" | "error";
  doneItems: number;
  totalItems: number;
  message?: string;
}

export interface ImportOptions {
  /** "replace" wipes existing scene state first; "merge" keeps it. */
  mode: "replace" | "merge";
  /** When true, ALSO apply roomMetadata if the manifest contains it.
   *  Default false — the room scope persists across scenes (suite
   *  settings, contributor list); blindly applying it could clobber
   *  the importer's own preferences. The user opts in via the UI. */
  applyRoomMetadata?: boolean;
  onProgress?: (p: ImportProgress) => void;
  /** Asks the user a yes/no question. Defaults to window.confirm. */
  confirm?: (message: string) => Promise<boolean> | boolean;
}

export interface ImportResult {
  manifest: FobrManifest;
  applied: number;
  /** Number of items that failed validation / addItems. The console
   *  has per-item details; this surface count is for the UI summary. */
  failed: number;
  /** True when the user cancelled: the scene was left untouched
   *  (replace mode rolls back the items it had added). */
  aborted?: boolean;
}

const MAX_URL_LEN = 2048;

/** Structural check of the manifest's items BEFORE anything in the
 *  scene is touched. Throws on a broken pack; returns how many image
 *  URLs OBR is likely to reject (data: URLs, or URLs that are too long
 *  / not http(s)). */
function validateItems(items: unknown[]): { riskyImages: number } {
  let riskyImages = 0;
  items.forEach((raw, i) => {
    const it = raw as any;
    if (!it || typeof it !== "object" || Array.isArray(it)) {
      throw new Error(`item #${i}: not an object`);
    }
    if (typeof it.type !== "string" || typeof it.layer !== "string") {
      throw new Error(`item #${i}: missing type/layer`);
    }
    const url = it.image?.url;
    if (typeof url === "string") {
      const httpOk = /^https?:\/\//i.test(url) && url.length <= MAX_URL_LEN;
      if (!httpOk) riskyImages++;
    }
  });
  return { riskyImages };
}

function freshId(): string {
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function embeddedToDataUrl(rec: FobrManifest["images"][string]): string {
  return `data:${rec.mime};base64,${rec.data}`;
}

// Re-stamp the server-managed audit fields. OBR REQUIRES
// `createdUserId` (validation rejects items missing it), and
// `lastModified` / `lastModifiedUserId` are readonly server fields
// that get re-asserted on add — but we still need to provide
// well-formed values up front. We rewrite all three to the current
// importing player so the items are correctly attributed.
function reauditItem(item: any, currentUserId: string, nowIso: string): void {
  item.createdUserId = currentUserId;
  item.lastModified = nowIso;
  item.lastModifiedUserId = currentUserId;
}

// Topological sort: parents (no attachedTo, or attachedTo points to
// items NOT in our set) come first. We then iterate adding items
// whose parents are already in the output set, until all are placed.
// Cyclic refs (extremely unlikely on real scene data) get appended
// at the end so they at least try to add.
function topologicalSort<T extends { id?: string; attachedTo?: string }>(items: T[]): T[] {
  const idSet = new Set(items.map((i) => i.id).filter(Boolean));
  const placed = new Set<string>();
  const out: T[] = [];
  // Pass 1: items without an attachedTo reference INSIDE this batch.
  // attachedTo to an external id (or undefined) is treated as a root.
  const remaining: T[] = [];
  for (const it of items) {
    const att = it.attachedTo;
    if (!att || !idSet.has(att)) {
      out.push(it);
      if (it.id) placed.add(it.id);
    } else {
      remaining.push(it);
    }
  }
  // Pass 2..N: drain remaining as their parents become placed.
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const it = remaining[i];
      const att = it.attachedTo;
      if (att && placed.has(att)) {
        out.push(it);
        if (it.id) placed.add(it.id);
        remaining.splice(i, 1);
        progress = true;
      }
    }
  }
  // Anything left is part of a cycle — append in original order.
  if (remaining.length > 0) out.push(...remaining);
  return out;
}

export async function importPackFromBlob(
  blob: Blob,
  opts: ImportOptions,
): Promise<ImportResult> {
  const onProgress = opts.onProgress ?? (() => {});
  onProgress({ phase: "parsing", doneItems: 0, totalItems: 0 });

  const manifest = await unpackFobr(blob);
  // Deep clone so our mutations don't leak into the manifest object
  // returned to the caller.
  if (!Array.isArray(manifest.items)) throw new Error("invalid pack: no item list");
  const items: any[] = manifest.items.map((raw) => JSON.parse(JSON.stringify(raw)));
  const lang = getLocalLang();
  const ask = async (msg: string): Promise<boolean> =>
    opts.confirm ? !!(await opts.confirm(msg)) : window.confirm(msg);

  // Look up the importing player so we can re-attribute every item
  // to them. Falls back to a placeholder if OBR doesn't expose
  // getId (very old SDKs); OBR.scene.items.addItems will reject
  // an obviously-wrong id, in which case the user sees the error.
  let currentUserId = "imported";
  try { currentUserId = (await OBR.player.getId()) || currentUserId; } catch {}
  const nowIso = new Date().toISOString();

  onProgress({
    phase: "rewriting",
    doneItems: 0,
    totalItems: items.length,
  });

  // Pass 1: rewrite embedded URLs back to data: URLs + re-stamp audit
  // fields so OBR's validator accepts the items.
  for (const it of items) {
    if (it && it.image && typeof it.image.url === "string" &&
        it.image.url.startsWith(EMBED_PREFIX)) {
      const hash = it.image.url.slice(EMBED_PREFIX.length);
      const rec = manifest.images[hash];
      if (rec) {
        it.image.url = embeddedToDataUrl(rec);
        it.image.mime = rec.mime;
      }
      // Orphan reference (hash not in images) — leave the sentinel.
      // OBR will render a broken image and the user can spot it.
    }
    reauditItem(it, currentUserId, nowIso);
  }

  // Nothing in the scene has been touched yet: validate now, and warn
  // about images OBR will probably reject (embedded data: URLs, URLs
  // over 2048 chars) so the user can bail out.
  const { riskyImages } = validateItems(items);
  if (riskyImages > 0) {
    const ok = await ask(
      t(lang, "wpImportRiskyImages").replace("{n}", String(riskyImages)),
    );
    if (!ok) return { manifest, applied: 0, failed: 0, aborted: true };
  }

  // Pass 2: regenerate ids (both modes) and remap attachedTo so
  // attachments stay intact in the new id namespace.
  const oldToNew = new Map<string, string>();
  for (const it of items) {
    if (it.id) {
      const newId = freshId();
      oldToNew.set(it.id, newId);
      it.id = newId;
    }
  }
  for (const it of items) {
    if (typeof it.attachedTo === "string") {
      const remap = oldToNew.get(it.attachedTo);
      if (remap) {
        it.attachedTo = remap;
      } else {
        // attachedTo references something not in our import — drop
        // the link so OBR doesn't reject the item for dangling ref.
        delete it.attachedTo;
      }
    }
  }

  const sorted = topologicalSort(items);
  let applied = 0;
  let failed = 0;
  const addedIds: string[] = [];

  // Adds the pack's items in batches. On batch failure, retry
  // one-at-a-time so we can pinpoint the bad apple WITHOUT losing the
  // rest of the scene.
  const addAll = async () => {
    onProgress({ phase: "applying-items", doneItems: 0, totalItems: sorted.length });
    const BATCH = 100;
    for (let i = 0; i < sorted.length; i += BATCH) {
      const batch = sorted.slice(i, i + BATCH);
      try {
        await OBR.scene.items.addItems(batch);
        applied += batch.length;
        for (const b of batch) if (b.id) addedIds.push(b.id);
      } catch (batchErr) {
        console.warn(
          "[worldPack/import] batch failed, retrying per-item:",
          formatErr(batchErr),
        );
        for (const single of batch) {
          try {
            await OBR.scene.items.addItems([single]);
            applied++;
            if (single.id) addedIds.push(single.id);
          } catch (singleErr) {
            failed++;
            console.warn(
              `[worldPack/import] item rejected — id=${single.id ?? "?"} type=${single.type ?? "?"} layer=${single.layer ?? "?"}`,
              formatErr(singleErr),
              single,
            );
          }
        }
      }
      onProgress({ phase: "applying-items", doneItems: applied, totalItems: sorted.length });
    }
  };

  const applyRoomMeta = async () => {
    if (!opts.applyRoomMetadata || !manifest.roomMetadata) return;
    try {
      // OBR.room.setMetadata accepts a partial — undefined values
      // delete keys. In replace mode we wipe foreign keys too.
      const cur = await OBR.room.getMetadata();
      const delta: Record<string, unknown> = {};
      if (opts.mode === "replace") {
        for (const k of Object.keys(cur)) delta[k] = undefined;
        for (const [k, v] of Object.entries(manifest.roomMetadata)) delta[k] = v;
        await OBR.room.setMetadata(delta);
      } else {
        for (const [k, v] of Object.entries(manifest.roomMetadata)) {
          if (!(k in cur)) delta[k] = v;
        }
        if (Object.keys(delta).length > 0) await OBR.room.setMetadata(delta);
      }
    } catch (e) {
      console.warn("[worldPack/import] room metadata failed", e);
    }
  };

  if (opts.mode === "replace") {
    // SAFE ORDER: the current scene is only removed once the new
    // items are in. Snapshot the existing ids, add the pack's items
    // next to them (fresh ids → no clashes), and if anything was
    // rejected let the user roll back to the untouched scene.
    let existingIds: string[] = [];
    try {
      existingIds = (await OBR.scene.items.getItems()).map((i) => i.id);
    } catch (e) {
      throw new Error(`cannot read the current scene: ${formatErr(e)}`);
    }

    await addAll();

    if (sorted.length > 0 && (failed > 0 || applied === 0)) {
      const proceed = await ask(
        t(lang, "wpImportPartialConfirm")
          .replace("{failed}", String(failed))
          .replace("{total}", String(sorted.length)),
      );
      if (!proceed) {
        try {
          if (addedIds.length) await OBR.scene.items.deleteItems(addedIds);
        } catch (e) {
          console.warn("[worldPack/import] rollback failed", e);
        }
        return { manifest, applied: 0, failed, aborted: true };
      }
    }

    // Import succeeded (or the user accepted the partial result):
    // now drop the old scene and apply the pack's metadata.
    onProgress({ phase: "applying-metadata", doneItems: applied, totalItems: sorted.length });
    try {
      if (existingIds.length > 0) await OBR.scene.items.deleteItems(existingIds);
    } catch (e) {
      console.warn("[worldPack/import] failed to clear previous items", e);
    }
    try {
      const cur = await OBR.scene.getMetadata();
      const wipeDelta: Record<string, unknown> = {};
      for (const k of Object.keys(cur)) wipeDelta[k] = undefined;
      for (const [k, v] of Object.entries(manifest.sceneMetadata)) wipeDelta[k] = v;
      await OBR.scene.setMetadata(wipeDelta);
    } catch (e) {
      console.warn("[worldPack/import] failed to apply scene metadata", e);
    }
    await applyRoomMeta();
  } else {
    // Merge never deletes anything: metadata only fills missing keys.
    await applyRoomMeta();
    onProgress({ phase: "applying-metadata", doneItems: 0, totalItems: items.length });
    try {
      const cur = await OBR.scene.getMetadata();
      const delta: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(manifest.sceneMetadata)) {
        if (!(k in cur)) delta[k] = v;
      }
      if (Object.keys(delta).length > 0) await OBR.scene.setMetadata(delta);
    } catch (e) {
      console.warn("[worldPack/import] merge metadata failed", e);
    }
    await addAll();
  }

  onProgress({
    phase: "done",
    doneItems: applied,
    totalItems: sorted.length,
    message: failed > 0
      ? `${failed} 个 item 未能导入（详见浏览器控制台）`
      : undefined,
  });

  return { manifest, applied, failed };
}

// Pull a useful string out of whatever OBR throws — sometimes it's
// an Error, sometimes a plain object with `.message`, sometimes a
// string. Without this the console just shows "[object Object]".
function formatErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    try { return JSON.stringify(e); } catch {}
    return String((e as any).message ?? e);
  }
  return String(e);
}

export function fileToBlob(file: File): Blob {
  return file;
}
