// Status Tester — add a library status to tokens (palette click / drop).
//
// One updateItems call; the applied list is re-read inside the update
// callback so concurrent edits from other clients aren't lost. Tokens
// the caller may not manage are skipped, and a status already on a
// token is not added twice.

import OBR from "@owlbear-rodeo/sdk";
import { APPLIED_KEY, AppliedStatus, canManage, newId, parseApplied } from "./types";

export async function addStatusToTokens(
  tokenIds: string[],
  defId: string,
  opts: {
    isGM: boolean;
    playerId: string;
    hidden?: boolean;
    levels?: boolean;
    /** Starting level (one grid square for distance levels). */
    levelStart?: number;
  },
): Promise<string[]> {
  if (tokenIds.length === 0 || !defId) return [];
  // Names of the tokens that actually got the status.
  const added: string[] = [];
  await OBR.scene.items.updateItems(tokenIds, (drafts) => {
    for (const d of drafts) {
      if (!canManage(d, opts.isGM, opts.playerId)) continue;
      if (!opts.isGM && d.visible === false) continue;
      const meta = d.metadata as Record<string, unknown>;
      const cur = parseApplied(meta[APPLIED_KEY]);
      if (cur.some((a) => a.defId === defId)) continue;
      const entry: AppliedStatus = { uid: newId("s"), defId };
      if (opts.isGM && opts.hidden) entry.hidden = true;
      if (opts.levels) entry.level = opts.levelStart ?? 1;
      meta[APPLIED_KEY] = [...cur, entry];
      added.push(d.name ?? "");
    }
  });
  return added;
}
