// Character-card storage backend (Cloudflare Pages Functions + R2).
//
// Replaces the card endpoints of obr.dnd.center that the suite used.
// The server only STORES JSON: an xlsx sheet is converted to JSON in
// the browser (src/modules/characterCards/xlsx-import.ts), so no
// uploaded file is ever parsed here.
//
// Routes (see functions/api/character/[[path]].ts and
// functions/characters/[[path]].ts):
//
//   POST   /api/character/create-from-json?room=R&uploader=U   body: card JSON
//   POST   /api/character/upload?room=R&uploader=U             multipart "file" (.json)
//   PUT    /api/character/{room}/{card}/data                   body: card JSON
//   DELETE /api/character/{room}/{card}
//   GET    /characters/{room}/{card}/data.json
//
// Storage (R2 bucket bound as CARDS):
//   cards/{room}/{card}/data.json    the card
//   cards/{room}/{card}/prev.json    the version before the last save
//   trash/{room}/{card}/data.json    deleted cards (recoverable; add an
//                                    R2 lifecycle rule to expire them)
//
// Security model: a card is reachable only by knowing its room id (a
// long id from OBR, only known to people in the room) AND its card id
// (random, server-generated). There is no listing endpoint. Bodies are
// size-limited and must look like a card; ids are validated; deletes
// are soft. Legacy cards: a GET that misses R2 is looked up once on
// obr.dnd.center and copied over (lazy migration).

export interface R2ObjectBody {
  text(): Promise<string>;
  customMetadata?: Record<string, string>;
  uploaded?: Date;
}
export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}
export interface Env {
  CARDS?: R2Bucket;
  /** Optional: set to "0" to turn off lazy migration from obr.dnd.center. */
  LEGACY_MIGRATION?: string;
}

export const MAX_BODY_BYTES = 512 * 1024;
const LEGACY_ORIGIN = "https://obr.dnd.center";
/** OBR room ids are long; refuse short / placeholder ones ("default"). */
const ROOM_RE = /^[A-Za-z0-9_-]{16,128}$/;
/** Server-made ids are 12 hex; legacy / imported ids may differ a bit. */
const CARD_RE = /^[A-Za-z0-9_-]{6,64}$/;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function validRoom(room: string | null | undefined): room is string {
  return !!room && ROOM_RE.test(room);
}

export function validCard(card: string | null | undefined): card is string {
  return !!card && CARD_RE.test(card);
}

function newCardId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const key = (room: string, card: string, file = "data.json") => `cards/${room}/${card}/${file}`;

/** Parse + check a card body. Returns the object or an error Response. */
export function parseCard(text: string): Record<string, unknown> | Response {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return error(413, "card too large (max 512 KB)");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return error(400, "body is not valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return error(400, "card must be a JSON object");
  const d = data as Record<string, unknown>;
  if (!("identity" in d) && !("abilities" in d)) return error(400, "not a character card (missing identity / abilities)");
  return d;
}

function cardName(d: Record<string, unknown>): string {
  const id = (d.identity ?? {}) as Record<string, unknown>;
  const n = id.display_name || id.character_name || "";
  return String(n).slice(0, 120) || "Unnamed";
}

export interface CardEntry {
  id: string;
  name: string;
  uploader: string;
  uploaded_at: string;
  url: string;
}

function entryFor(origin: string, room: string, card: string, name: string, uploader: string, at: string): CardEntry {
  return {
    id: card,
    name,
    uploader,
    uploaded_at: at,
    url: `${origin}/characters/${encodeURIComponent(room)}/${encodeURIComponent(card)}/`,
  };
}

async function store(bucket: R2Bucket, room: string, card: string, d: Record<string, unknown>, meta: Record<string, string>): Promise<void> {
  await bucket.put(key(room, card), JSON.stringify(d), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    customMetadata: meta,
  });
}

/** POST create-from-json / upload (json). */
export async function createCard(
  bucket: R2Bucket,
  origin: string,
  room: string,
  uploader: string,
  d: Record<string, unknown>,
): Promise<Response> {
  const card = newCardId();
  const at = new Date().toISOString();
  const name = cardName(d);
  const who = uploader.slice(0, 80) || "?";
  const meta = (d.meta && typeof d.meta === "object" ? d.meta : {}) as Record<string, unknown>;
  const stored = { ...d, meta: { ...meta, card_id: card, uploader: who, uploaded_at: at } };
  await store(bucket, room, card, stored, { name, uploader: who, created: at });
  return json(entryFor(origin, room, card, name, who, at), 201);
}

/** PUT {room}/{card}/data — replaces the card (creates it if missing,
 *  e.g. a legacy card saved for the first time). The previous version
 *  is kept as prev.json. */
export async function saveCard(
  bucket: R2Bucket,
  origin: string,
  room: string,
  card: string,
  d: Record<string, unknown>,
): Promise<Response> {
  const cur = await bucket.get(key(room, card));
  let meta: Record<string, string> = {};
  if (cur) {
    meta = cur.customMetadata ?? {};
    await bucket.put(key(room, card, "prev.json"), await cur.text(), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
  }
  const at = new Date().toISOString();
  const name = cardName(d);
  await store(bucket, room, card, d, { ...meta, name, updated: at, created: meta.created ?? at });
  return json({ ok: true, ...entryFor(origin, room, card, name, meta.uploader ?? "", meta.created ?? at), saved_at: at });
}

/** DELETE {room}/{card} — moves the card to trash/. */
export async function deleteCard(bucket: R2Bucket, room: string, card: string): Promise<Response> {
  const cur = await bucket.get(key(room, card));
  if (!cur) return json({ ok: true, deleted: false });
  await bucket.put(`trash/${room}/${card}/data.json`, await cur.text(), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { ...(cur.customMetadata ?? {}), deleted: new Date().toISOString() },
  });
  await bucket.delete(key(room, card));
  await bucket.delete(key(room, card, "prev.json"));
  return json({ ok: true, deleted: true });
}

/** GET /characters/{room}/{card}/data.json (+ lazy legacy migration). */
export async function readCard(
  bucket: R2Bucket,
  env: Env,
  room: string,
  card: string,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const obj = await bucket.get(key(room, card));
  if (obj) {
    return new Response(await obj.text(), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  if (env.LEGACY_MIGRATION === "0") return error(404, "card not found");
  // Never migrate a card the GM deleted here.
  if (await bucket.head(`trash/${room}/${card}/data.json`)) return error(404, "card not found");
  try {
    const res = await fetchFn(
      `${LEGACY_ORIGIN}/characters/${encodeURIComponent(room)}/${encodeURIComponent(card)}/data.json`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return error(404, "card not found");
    const text = await res.text();
    const d = parseCard(text);
    if (d instanceof Response) return error(404, "card not found");
    await store(bucket, room, card, d, { name: cardName(d), migrated: new Date().toISOString() });
    return new Response(JSON.stringify(d), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return error(404, "card not found");
  }
}

/** Read a multipart upload's "file" part as text (JSON only). */
export async function readUploadedJson(request: Request): Promise<string | Response> {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES + 4096) return error(413, "file too large (max 512 KB)");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error(400, "expected multipart/form-data with a 'file' field");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return error(400, "missing 'file'");
  const name = String((file as File).name || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    return error(415, "xlsx is converted in the browser — send the card JSON instead");
  }
  if (file.size > MAX_BODY_BYTES) return error(413, "file too large (max 512 KB)");
  return await file.text();
}
