// Character-card API — see server/cards.ts.
import {
  corsPreflight,
  createCard,
  deleteCard,
  error,
  parseCard,
  readUploadedJson,
  saveCard,
  validCard,
  validRoom,
  type Env,
} from "../../../server/cards";

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (request.method === "OPTIONS") return corsPreflight();
  const bucket = env.CARDS;
  if (!bucket) return error(500, "storage not configured (bind an R2 bucket as CARDS)");

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/character\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const origin = url.origin;

  try {
    // POST /create-from-json  |  POST /upload
    if (request.method === "POST" && parts.length === 1 && (parts[0] === "create-from-json" || parts[0] === "upload")) {
      const room = url.searchParams.get("room");
      if (!validRoom(room)) return error(400, "invalid room");
      const uploader = url.searchParams.get("uploader") ?? "";
      let text: string;
      if (parts[0] === "upload") {
        const t = await readUploadedJson(request);
        if (t instanceof Response) return t;
        text = t;
      } else {
        const len = Number(request.headers.get("content-length") || 0);
        if (len > 600 * 1024) return error(413, "card too large (max 512 KB)");
        text = await request.text();
      }
      const d = parseCard(text);
      if (d instanceof Response) return d;
      return await createCard(bucket, origin, room, uploader, d);
    }

    // PUT /{room}/{card}/data
    if (request.method === "PUT" && parts.length === 3 && parts[2] === "data") {
      const [room, card] = parts;
      if (!validRoom(room) || !validCard(card)) return error(400, "invalid room or card id");
      const len = Number(request.headers.get("content-length") || 0);
      if (len > 600 * 1024) return error(413, "card too large (max 512 KB)");
      const d = parseCard(await request.text());
      if (d instanceof Response) return d;
      return await saveCard(bucket, origin, room, card, d);
    }

    // DELETE /{room}/{card}
    if (request.method === "DELETE" && parts.length === 2) {
      const [room, card] = parts;
      if (!validRoom(room) || !validCard(card)) return error(400, "invalid room or card id");
      return await deleteCard(bucket, room, card);
    }

    // The old xlsx refresh: xlsx sheets are converted in the browser now.
    if (request.method === "POST" && parts[0] === "refresh") {
      return error(415, "xlsx is converted in the browser — save the card JSON with PUT instead");
    }
    return error(404, "unknown endpoint");
  } catch (e) {
    return error(500, `server error: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  }
};
