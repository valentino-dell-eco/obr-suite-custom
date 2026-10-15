// Character-card backend: a separate Cloudflare Worker + D1 project
// (echo-version-backend), not part of this deploy.
//
//   GET    {CC_ORIGIN}/characters/{room}/{card}/data.json
//   POST   {CC_API}/create-from-json?room=&uploader=      (card JSON)
//   POST   {CC_API}/upload?room=&uploader=                (multipart .json)
//   PUT    {CC_API}/{room}/{card}/data                    (card JSON)
//   DELETE {CC_API}/{room}/{card}
//   GET    {CC_ORIGIN}/img/5etools/bestiary/...           (monster token images, see IMG_BASE)
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

/** Bestiary token images (5etools image layout), served by the same
 *  Worker with open CORS so OBR can load them as textures. Replaces
 *  obr.dnd.center/5etools-img; that address stays as the fallback only
 *  while VITE_CC_BACKEND is unset. */
export const IMG_BASE = CC_ORIGIN ? `${CC_ORIGIN}/img/5etools` : "https://obr.dnd.center/5etools-img";

export function cardDataUrl(roomId: string, cardId: string): string {
  return `${CC_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
}
