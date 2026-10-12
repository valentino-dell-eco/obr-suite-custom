// One look for status emojis everywhere.
//
// The map chip is drawn by OBR in its canvas, where an emoji is rendered
// with the operating system's emoji font (Segoe UI Emoji on Windows,
// Apple Color Emoji on macOS…), while the HTML pages (library, palette,
// drop, hover list, manage) use whatever emoji font the browser picks —
// so the same 🪁 looked different on the map and in the lists. Both now
// show the same picture: the OpenMoji image (openmoji package, served
// by jsDelivr). When an image can't be found / loaded, the plain emoji
// text is used as before.

const EMOJI_CDN = "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg/";

/** In ZWJ sequences (👁️‍🗨️, 🏳️‍🌈, 🧔‍♂️…) OpenMoji's file names keep U+FE0F
 *  after these code points (unless a skin-tone modifier follows); single
 *  emojis drop it, keycaps keep "X-FE0F-20E3". Derived from the
 *  package's openmoji.json (checked against every file name). */
const ZWJ_FE0F_AFTER = new Set(
  "1F32B 1F3CB 1F3CC 1F3F3 1F441 1F575 1F5E8 2194 2195 2620 2640 2642 2695 2696 26A7 26D3 26F9 2708 2744 2764 27A1".split(" "),
);
const SKIN_TONES = new Set(["1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"]);

/** OpenMoji image URL of an emoji ("🪁" → …/1FA81.svg), or null for
 *  text that can't be an emoji. */
export function emojiImageUrl(emoji: string | undefined | null): string | null {
  const s = (emoji ?? "").trim();
  if (!s) return null;
  const cps = [...s]
    .map((c) => c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0"))
    .filter((h) => h !== "FE0F");
  if (!cps.length || cps.length > 12) return null;
  // Plain letters / digits alone aren't emojis (a keycap needs 20E3).
  if (cps.every((h) => parseInt(h, 16) < 0xa9)) return null;
  let name: string;
  if (cps.length === 2 && cps[1] === "20E3") {
    name = `${cps[0]}-FE0F-20E3`;
  } else if (!cps.includes("200D")) {
    name = cps.join("-");
  } else {
    const out: string[] = [];
    cps.forEach((h, i) => {
      out.push(h);
      if (ZWJ_FE0F_AFTER.has(h) && !SKIN_TONES.has(cps[i + 1] ?? "")) out.push("FE0F");
    });
    name = out.join("-");
  }
  return `${EMOJI_CDN}${name}.svg`;
}

/** The emoji as an <img> (falls back to its text if the image fails).
 *  Sized in em, so it follows the surrounding font size. */
export function emojiHtml(emoji: string, esc: (s: string) => string, size = "1.15em"): string {
  const url = emojiImageUrl(emoji);
  if (!url) return esc(emoji);
  return `<img class="emoji-img" src="${esc(url)}" alt="${esc(emoji)}" draggable="false" ` +
    `style="width:${size};height:${size};display:inline-block;vertical-align:middle;object-fit:contain" ` +
    `onerror="this.replaceWith(this.alt)">`;
}

// --- Map: only use the image once it's known to load -----------------------

const status = new Map<string, "ok" | "bad" | "pending">();
const waiters = new Set<() => void>();

/** "ok" when the image is loadable, "bad" when not, undefined while
 *  unknown (a check starts; onEmojiChecked listeners run when done). */
export function emojiImageState(url: string): "ok" | "bad" | undefined {
  const st = status.get(url);
  if (st === "ok" || st === "bad") return st;
  if (!st && typeof Image !== "undefined") {
    status.set(url, "pending");
    const img = new Image();
    img.onload = () => { status.set(url, "ok"); for (const fn of waiters) fn(); };
    img.onerror = () => { status.set(url, "bad"); for (const fn of waiters) fn(); };
    img.src = url;
  }
  return undefined;
}

export function onEmojiChecked(fn: () => void): () => void {
  waiters.add(fn);
  return () => { waiters.delete(fn); };
}
