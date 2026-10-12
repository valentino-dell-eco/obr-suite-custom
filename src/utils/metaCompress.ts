// Compact storage for big JSON values in OBR metadata.
//
// Room metadata is capped at 16 KB for EVERY extension in the room
// together, so large values we keep there are stored deflated:
//   { z: "<base64 of deflate-raw(JSON)>" }
// JSON lists with repeated keys / similar URLs shrink to roughly a
// third, even after base64. Uses the browser's CompressionStream.

export interface PackedJson {
  z: string;
}

export function isPacked(v: unknown): v is PackedJson {
  return !!v && typeof v === "object" && typeof (v as { z?: unknown }).z === "string";
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** value → { z } (deflated). */
export async function packJson(value: unknown): Promise<PackedJson> {
  const raw = new TextEncoder().encode(JSON.stringify(value));
  return { z: toBase64(await pipe(raw, new CompressionStream("deflate-raw"))) };
}

/** { z } → value (throws on corrupt data). */
export async function unpackJson<T = unknown>(packed: PackedJson): Promise<T> {
  const raw = await pipe(fromBase64(packed.z), new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}
