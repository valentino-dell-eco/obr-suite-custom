// Character-card backend: a separate Cloudflare Worker + D1 project
// (echo-version-backend), not part of this deploy.
//
//   GET    {CC_ORIGIN}/characters/{room}/{card}/data.json
//   POST   {CC_API}/create-from-json?room=&uploader=      (card JSON)
//   POST   {CC_API}/upload?room=&uploader=                (multipart .json)
//   PUT    {CC_API}/{room}/{card}/data                    (card JSON)
//   DELETE {CC_API}/{room}/{card}
//
// Its address comes from VITE_CC_BACKEND (the .env file in the project
// root, or the Pages project's build environment variables), e.g.
// https://echo-version-backend.<your-subdomain>.workers.dev. The Worker
// allows this site's origin (and localhost for `npm run dev`) through
// CORS — see ALLOWED_ORIGINS in the backend's wrangler.toml. Cards
// created on the old obr.dnd.center are copied over by the backend the
// first time they're read.
const configured = String(import.meta.env.VITE_CC_BACKEND ?? "").trim().replace(/\/+$/, "");
if (!configured && typeof console !== "undefined") {
  console.warn("[character-cards] VITE_CC_BACKEND is not set — character cards can't be loaded or saved");
}
export const CC_ORIGIN = configured;
export const CC_API = `${CC_ORIGIN}/api/character`;

export function cardDataUrl(roomId: string, cardId: string): string {
  return `${CC_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
}

// --- Saving with versions --------------------------------------------------
//
// Every card read from the backend carries its version number as
// `_version` (first field of the JSON). Sending the JSON back as-is
// sends that number too, and the backend only accepts the save if the
// card still has it. If someone else saved in between, the backend
// answers 409 with the card's current version and writes nothing.
//
//   putCardData        — one save, tells you if it hit a conflict.
//   saveCardOrAsk      — on a conflict, asks the user (OK = overwrite).
//   patchCardData      — small automatic edits (token binding, shield):
//                        on a conflict, re-reads the card, re-applies
//                        the edit and tries again.

export const VERSION_FIELD = "_version";

export type SaveResult =
  | { ok: true; version: number | null; entry: any }
  | { ok: false; conflict: true; version: number | null }
  | { ok: false; conflict: false; status: number; message: string };

/** The version a card JSON was loaded at (null = unknown / old card). */
export function cardVersion(data: unknown): number | null {
  const v = (data as Record<string, unknown> | null)?.[VERSION_FIELD];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/** The same card, marked as based on `version` (null = none). */
export function withCardVersion<T extends object>(data: T, version: number | null): T {
  const out = { ...data } as Record<string, unknown>;
  if (version == null) delete out[VERSION_FIELD];
  else out[VERSION_FIELD] = version;
  return out as T;
}

export function cardSaveUrl(roomId: string, cardId: string): string {
  return `${CC_API}/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data`;
}

/** PUT the card. Its `_version` (if any) is the version it's based on. */
export async function putCardData(
  roomId: string,
  cardId: string,
  data: object,
  opts: { signal?: AbortSignal } = {},
): Promise<SaveResult> {
  const res = await fetch(cardSaveUrl(roomId, cardId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: opts.signal,
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, conflict: true, version: cardVersion({ [VERSION_FIELD]: body?.version }) };
  }
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    return { ok: false, conflict: false, status: res.status, message };
  }
  const entry = await res.json().catch(() => ({}));
  const version = typeof entry?.version === "number" ? entry.version : null;
  return { ok: true, version, entry };
}

/** Save; if someone else saved in between, `ask()` decides:
 *  true = overwrite their changes, false = don't save (`declined`). */
export async function saveCardOrAsk(
  roomId: string,
  cardId: string,
  data: object,
  ask: () => boolean,
  opts: { signal?: AbortSignal } = {},
): Promise<SaveResult & { declined?: boolean }> {
  const first = await putCardData(roomId, cardId, data, opts);
  if (first.ok || !first.conflict) return first;
  if (!ask()) return { ...first, declined: true };
  // Overwrite on purpose: base the save on the version now on the server.
  return putCardData(roomId, cardId, withCardVersion(data, first.version), opts);
}

/** Read → edit → save, retried on a conflict (up to 3 times).
 *  `edit` returns the new card, or null for "nothing to change".
 *  Returns null when nothing was saved. */
export async function patchCardData(
  roomId: string,
  cardId: string,
  edit: (card: any) => any | null,
): Promise<SaveResult | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(cardDataUrl(roomId, cardId), { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch data.json failed: HTTP ${res.status}`);
    const next = edit(await res.json());
    if (!next) return null;
    const saved = await putCardData(roomId, cardId, next);
    if (saved.ok || !saved.conflict) return saved;
  }
  return { ok: false, conflict: true, version: null };
}
