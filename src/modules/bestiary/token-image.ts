// Per-creature token image (bestiary → monster card → image button).
//
// Every token of a bestiary creature (same slug) shows either:
//   • the LIBRARY image — the monster's image at the token-image
//     source, or the pawn for its creature type when there is none /
//     it doesn't load (data.ts → libraryTokenUrl, token-fallback.ts);
//   • an image the GM picked from their Owlbear Rodeo asset library
//     for this creature, stored in scene metadata under
//     TOKEN_IMAGES_KEY (slug → image).
//
// Changing it updates every token of the creature in the scene AND is
// used for new spawns (spawn.ts → creatureImageFor). Tokens whose image
// was changed by hand (OBR "Replace image", or a pre-existing token
// bound to the bestiary) keep their own image: only tokens still
// showing the creature's previous image — or a library / pawn image —
// are updated.
import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { GENERIC_PAWN_URL, pawnUrlFor } from "./token-fallback";

export const TOKEN_IMAGES_KEY = "com.obr-suite/bestiary/token-images";
/** monster card → background: change a creature's image (LOCAL). The
 *  work runs in the background page because the monster-card popover
 *  can close while OBR's asset picker is open. */
export const BC_CREATURE_IMAGE = "com.obr-suite/bestiary/creature-image";
/** background → monster card: result of BC_CREATURE_IMAGE (LOCAL). */
export const BC_CREATURE_IMAGE_DONE = "com.obr-suite/bestiary/creature-image-done";

export interface CreatureImageRequest {
  slug: string;
  act: "library" | "pick";
  /** Library image URL for the monster ("" = none). */
  libraryUrl: string;
  /** Raw 5etools creature type (to pick its pawn). */
  type: unknown;
  /** Search text for OBR's asset picker. */
  name: string;
}

export interface CreatureImageResult {
  slug: string;
  ok: boolean;
  cancelled?: boolean;
  updated?: number;
}
const BESTIARY_SLUG_KEY = "com.bestiary/slug";

export interface CreatureImage {
  url: string;
  mime: string;
  width: number;
  height: number;
}

function isImage(v: unknown): v is CreatureImage {
  const o = v as CreatureImage | null;
  return !!o && typeof o.url === "string" && !!o.url &&
    typeof o.width === "number" && o.width > 0 &&
    typeof o.height === "number" && o.height > 0;
}

export function mimeFromUrl(url: string): string {
  const u = url.toLowerCase();
  if (/\.svg(\?|#|$)/.test(u)) return "image/svg+xml";
  if (/\.png(\?|#|$)/.test(u)) return "image/png";
  if (/\.(jpe?g)(\?|#|$)/.test(u)) return "image/jpeg";
  if (/\.gif(\?|#|$)/.test(u)) return "image/gif";
  if (/\.bmp(\?|#|$)/.test(u)) return "image/bmp";
  if (/\.avif(\?|#|$)/.test(u)) return "image/avif";
  return "image/webp";
}

/** Load an image the way OBR will (CORS), with a timeout. */
export function probeImage(url: string, timeoutMs = 6000): Promise<{ ok: boolean; w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = "";
      resolve({ ok: false, w: 280, h: 280 });
    }, timeoutMs);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      resolve({ ok: true, w: img.naturalWidth || 280, h: img.naturalHeight || 280 });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, w: 280, h: 280 });
    };
    img.src = url;
  });
}

export async function readCreatureImages(): Promise<Record<string, CreatureImage>> {
  try {
    const meta = await OBR.scene.getMetadata();
    const raw = meta[TOKEN_IMAGES_KEY];
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, CreatureImage> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (isImage(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The GM-picked image for this creature, or null (= library image). */
export async function creatureImageFor(slug: string): Promise<CreatureImage | null> {
  return (await readCreatureImages())[slug] ?? null;
}

/** Resolve the library image: `libraryUrl` if it loads, else the pawn
 *  for the creature type. */
export async function resolveLibraryImage(libraryUrl: string, type: unknown): Promise<CreatureImage> {
  if (libraryUrl) {
    const p = await probeImage(libraryUrl);
    if (p.ok) return { url: libraryUrl, mime: mimeFromUrl(libraryUrl), width: p.w, height: p.h };
  }
  const pawn = pawnUrlFor(type);
  const p = await probeImage(pawn);
  return { url: pawn, mime: "image/svg+xml", width: p.w, height: p.h };
}

/** Set (img) or clear (null → library) the creature's image, then
 *  update its tokens in the scene. `library` is the resolved library
 *  image; `type` the creature type (to recognise its pawn). Returns
 *  how many tokens changed. */
export async function setCreatureImage(
  slug: string,
  img: CreatureImage | null,
  library: CreatureImage,
  libraryUrl: string,
  type: unknown,
): Promise<number> {
  const all = await readCreatureImages();
  const previous = all[slug] ?? null;
  if (img) all[slug] = img;
  else delete all[slug];
  await OBR.scene.setMetadata({ [TOKEN_IMAGES_KEY]: all });

  const target = img ?? library;
  // Images that count as "not customised by hand": the creature's
  // previous image, its library image / pawn, and any image the
  // bestiary itself sets — a 5etools-layout token image from any host
  // (old tokens spawned via obr.dnd.center or an earlier source) or one
  // of the suite's pawns. Anything else (an asset from someone's OBR
  // library put there with "Replace image", a pre-existing token bound
  // to the bestiary) is left alone.
  const managed = new Set<string>(
    [previous?.url, libraryUrl, library.url, pawnUrlFor(type), GENERIC_PAWN_URL].filter(
      (u): u is string => !!u,
    ),
  );
  const isManaged = (url: string) =>
    managed.has(url) ||
    /\/bestiary\/tokens\//i.test(url) ||
    /\/5etools-img\//i.test(url) ||
    /\/pawns\/[a-z]+\.svg(\?|#|$)/i.test(url) ||
    /\/monster-pawn\.svg(\?|#|$)/i.test(url);
  let items: Item[] = [];
  try {
    items = await OBR.scene.items.getItems(
      (it) => (it.metadata as Record<string, unknown>)[BESTIARY_SLUG_KEY] === slug,
    );
  } catch {
    return 0;
  }
  const ids = items
    .filter((it) => {
      const url = (it as Item & { image?: { url?: string } }).image?.url;
      return !!url && isManaged(url) && url !== target.url;
    })
    .map((it) => it.id);
  if (!ids.length) return 0;
  await OBR.scene.items.updateItems(ids, (drafts) => {
    for (const d of drafts as any[]) {
      if (!d.image) continue;
      d.image = { ...d.image, url: target.url, mime: target.mime, width: target.width, height: target.height };
      // Same convention as spawn: one grid cell = the image width,
      // anchored at its centre; the token's scale keeps the creature's
      // size footprint.
      d.grid = { ...(d.grid ?? {}), dpi: target.width, offset: { x: target.width / 2, y: target.height / 2 } };
    }
  });
  return ids.length;
}

/** Background handler for BC_CREATURE_IMAGE. */
export async function handleCreatureImageRequest(req: CreatureImageRequest): Promise<CreatureImageResult> {
  const slug = String(req?.slug ?? "");
  if (!slug) return { slug, ok: false };
  try {
    let img: CreatureImage | null = null;
    if (req.act === "pick") {
      const res = await OBR.assets.downloadImages(false, String(req.name ?? ""), "CHARACTER");
      const first = res?.[0];
      if (!first?.image?.url) return { slug, ok: false, cancelled: true };
      img = {
        url: first.image.url,
        mime: first.image.mime,
        width: first.image.width,
        height: first.image.height,
      };
    }
    const libraryUrl = String(req.libraryUrl ?? "");
    const library = await resolveLibraryImage(libraryUrl, req.type);
    const updated = await setCreatureImage(slug, img, library, libraryUrl, req.type);
    return { slug, ok: true, updated };
  } catch (e) {
    console.warn("[bestiary] creature image change failed", e);
    return { slug, ok: false };
  }
}
