import OBR from "@owlbear-rodeo/sdk";
import { CHASES_KEY, MEMBER_KEY, ChaseEntry } from "./types";

export async function readChases(): Promise<ChaseEntry[]> {
  try {
    const meta = await OBR.scene.getMetadata();
    const raw = meta[CHASES_KEY];
    if (Array.isArray(raw)) return raw as ChaseEntry[];
  } catch {}
  return [];
}

export async function writeChases(chases: ChaseEntry[]): Promise<void> {
  await OBR.scene.setMetadata({ [CHASES_KEY]: chases });
}

export function findChaseOfToken(
  chases: ChaseEntry[],
  tokenId: string,
): ChaseEntry | undefined {
  return chases.find((c) => c.participants.some((p) => p.tokenId === tokenId));
}

export function genChaseId(): string {
  return `chase-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Enforces the chase's core invariants:
 *  - No participant's distance ever goes below 0 (the line's left
 *    edge is always the fixed zero point).
 *  - The quarry is always at the FRONT of the line, i.e. its
 *    `distance` is always the maximum among every participant
 *    (itself included). Any pursuer whose distance was pushed past
 *    the quarry's (e.g. after a manual edit) simply pulls the quarry
 *    forward with it — the quarry can never be behind a pursuer.
 *  Call this after every mutation before writing. */
export function normalizeChase(chase: ChaseEntry): ChaseEntry {
  const clamped = chase.participants.map((p) => ({
    ...p,
    distance: Math.max(0, p.distance),
  }));
  const quarryIdx = clamped.findIndex((p) => p.role === "quarry");
  if (quarryIdx === -1) return { ...chase, participants: clamped };
  const maxDistance = Math.max(...clamped.map((p) => p.distance));
  const participants = clamped.map((p, i) =>
    i === quarryIdx ? { ...p, distance: maxDistance } : p,
  );
  return { ...chase, participants };
}

/** Stamps (or clears, when chaseId is null) the per-token "which
 *  chase am I in" flag. Safe to call even if the item was deleted
 *  from the scene in the meantime (updateItems on a missing id is a
 *  silent no-op in the OBR SDK). */
export async function stampMemberFlag(
  tokenId: string,
  chaseId: string | null,
): Promise<void> {
  try {
    await OBR.scene.items.updateItems([tokenId], (items) => {
      for (const item of items) {
        if (chaseId) (item.metadata as Record<string, unknown>)[MEMBER_KEY] = chaseId;
        else delete (item.metadata as Record<string, unknown>)[MEMBER_KEY];
      }
    });
  } catch {}
}
