// One look for status emojis everywhere.
//
// The map chip is drawn by OBR in its canvas, where an emoji is rendered
// with the operating system's emoji font (Segoe UI Emoji on Windows,
// Apple Color Emoji on macOS…), while the HTML pages (library, palette,
// drop, hover list, manage) use whatever emoji font the browser picks —
// so the same 🪁 looked different on the map and in the lists. Both now
// show the same picture: the Google (Noto) emoji image from the
// emoji-datasource-google package, served by jsDelivr. When an image
// can't be found / loaded, the plain emoji text is used as before.

const EMOJI_CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-google@16.0.0/img/google/64/";

/** Code points followed by U+FE0F in the package's file names (unless a
 *  skin-tone modifier follows). Derived from its emoji.json. */
const FE0F_AFTER = new Set(
  ("0023 002a 0030 0031 0032 0033 0034 0035 0036 0037 0038 0039 00a9 00ae 1f170 1f171 1f17e 1f17f " +
    "1f202 1f237 1f321 1f324 1f325 1f326 1f327 1f328 1f329 1f32a 1f32b 1f32c 1f336 1f37d 1f396 1f397 " +
    "1f399 1f39a 1f39b 1f39e 1f39f 1f3cb 1f3cc 1f3cd 1f3ce 1f3d4 1f3d5 1f3d6 1f3d7 1f3d8 1f3d9 1f3da " +
    "1f3db 1f3dc 1f3dd 1f3de 1f3df 1f3f3 1f3f5 1f3f7 1f43f 1f441 1f4fd 1f549 1f54a 1f56f 1f570 1f573 " +
    "1f574 1f575 1f576 1f577 1f578 1f579 1f587 1f58a 1f58b 1f58c 1f58d 1f590 1f5a5 1f5a8 1f5b1 1f5b2 " +
    "1f5bc 1f5c2 1f5c3 1f5c4 1f5d1 1f5d2 1f5d3 1f5dc 1f5dd 1f5de 1f5e1 1f5e3 1f5e8 1f5ef 1f5f3 1f5fa " +
    "1f6cb 1f6cd 1f6ce 1f6cf 1f6e0 1f6e1 1f6e2 1f6e3 1f6e4 1f6e5 1f6e9 1f6f0 1f6f3 203c 2049 2122 " +
    "2139 2194 2195 2196 2197 2198 2199 21a9 21aa 2328 23cf 23ed 23ee 23ef 23f1 23f2 23f8 23f9 23fa " +
    "24c2 25aa 25ab 25b6 25c0 25fb 25fc 2600 2601 2602 2603 2604 260e 2611 2618 261d 2620 2622 2623 " +
    "2626 262a 262e 262f 2638 2639 263a 2640 2642 265f 2660 2663 2665 2666 2668 267b 267e 2692 2694 " +
    "2695 2696 2697 2699 269b 269c 26a0 26a7 26b0 26b1 26c8 26cf 26d1 26d3 26e9 26f0 26f1 26f4 26f7 " +
    "26f8 26f9 2702 2708 2709 270c 270d 270f 2712 2714 2716 271d 2721 2733 2734 2744 2747 2763 2764 " +
    "27a1 2934 2935 2b05 2b06 2b07 3030 303d 3297 3299").split(" "),
);
const SKIN_TONES = new Set(["1f3fb", "1f3fc", "1f3fd", "1f3fe", "1f3ff"]);

/** Image URL of an emoji ("🪁" → …/1fa81.png), or null for text that
 *  can't be an emoji. */
export function emojiImageUrl(emoji: string | undefined | null): string | null {
  const s = (emoji ?? "").trim();
  if (!s) return null;
  const cps = [...s]
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0"))
    .filter((h) => h !== "fe0f");
  if (!cps.length || cps.length > 12) return null;
  // Plain letters / digits alone aren't emojis (a keycap needs 20e3).
  if (cps.every((h) => parseInt(h, 16) < 0xa9)) return null;
  const out: string[] = [];
  cps.forEach((h, i) => {
    out.push(h);
    if (FE0F_AFTER.has(h) && !SKIN_TONES.has(cps[i + 1] ?? "")) out.push("fe0f");
  });
  return `${EMOJI_CDN}${out.join("-")}.png`;
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
