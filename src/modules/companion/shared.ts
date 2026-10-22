// Bits shared by the Echo Companion settings tab and the GM relay.

import OBR from "@owlbear-rodeo/sdk";

/** Player → GM: "here is the hash of my pickup secret" ({ hash }). */
export const BC_HELLO = "com.obr-suite/companion/hello";
/** GM → everyone: "player X's QR code changed" ({ player }). Carries no secret. */
export const BC_CHANGED = "com.obr-suite/companion/changed";

const SECRET_LS = "obr-suite/companion/room-secret/";
const NONCE_LS = "obr-suite/companion/pickup-nonce/";

/** Room id as the backend uses it (same as the character cards). */
export function roomKey(): string {
  return (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** GM only: the room key (proves to the backend we are the GM). */
export function readSecret(room: string): string {
  try {
    return localStorage.getItem(SECRET_LS + room) ?? "";
  } catch {
    return "";
  }
}

export function writeSecret(room: string, secret: string): void {
  try {
    if (secret) localStorage.setItem(SECRET_LS + room, secret);
    else localStorage.removeItem(SECRET_LS + room);
  } catch {}
}

/** Player only: a random secret kept in this browser, used to pick up
 *  our own QR code. Only its hash ever leaves the browser via OBR. */
export function pickupNonce(room: string): string {
  try {
    const old = localStorage.getItem(NONCE_LS + room);
    if (old) return old;
  } catch {}
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  const nonce = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(NONCE_LS + room, nonce);
  } catch {}
  return nonce;
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d].map((x) => x.toString(16).padStart(2, "0")).join("");
}
