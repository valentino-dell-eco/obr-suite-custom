// GET /characters/{room}/{card}/data.json — see server/cards.ts.
import { corsPreflight, error, readCard, validCard, validRoom, type Env } from "../../server/cards";

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "GET" && request.method !== "HEAD") return error(405, "method not allowed");
  const bucket = env.CARDS;
  if (!bucket) return error(500, "storage not configured (bind an R2 bucket as CARDS)");
  const parts = new URL(request.url).pathname.replace(/^\/characters\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 3 || parts[2] !== "data.json") return error(404, "not found");
  const [room, card] = parts;
  if (!validRoom(room) || !validCard(card)) return error(400, "invalid room or card id");
  return await readCard(bucket, env, room, card);
};
