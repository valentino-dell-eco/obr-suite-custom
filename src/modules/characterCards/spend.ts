// Spending a token resource from a spell cast / feature use.
//
// Both cast UIs (the mini panel's spell-cast modal and the fullscreen
// sheet, through its host cc-panel) offer a "resource spent" select
// listing the bound token's Resource Tracker entries + an amount. On
// confirm the amount is taken off that resource (clamped at 0), the
// usual bottom-center resource toast fires, and the chat card says
// what was spent.

import OBR from "@owlbear-rodeo/sdk";
import { readResources, updateResource } from "../resourceTracker/storage";
import { broadcastChanged } from "../resourceTracker/panel";
import type { Resource } from "../resourceTracker/types";
import type { ChatSpent } from "../roomChat/types";

export interface SpendChoice {
  resourceId: string;
  amount: number;
}

/** Clean an untrusted { resourceId, amount } (postMessage / UI). */
export function cleanSpend(raw: unknown): SpendChoice | null {
  const r = raw as { resourceId?: unknown; amount?: unknown } | null;
  if (!r || typeof r.resourceId !== "string" || !r.resourceId) return null;
  const n = Math.floor(Number(r.amount));
  if (!Number.isFinite(n) || n <= 0) return null;
  return { resourceId: r.resourceId, amount: Math.min(n, 999) };
}

/** "Ki Points (3/5)" — the select's option label. */
export function resourceOptionLabel(r: Pick<Resource, "name" | "current" | "max">): string {
  const name = r.name?.trim() || "?";
  return `${name} (${r.current}/${r.max})`;
}

/** The bound token's resources, [] when there's no token / no SDK. */
export async function tokenResources(itemId: string | null | undefined): Promise<Resource[]> {
  if (!itemId) return [];
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return readResources(items[0] ?? null);
  } catch {
    return [];
  }
}

/** Take `amount` off the resource (never below 0). Returns what the
 *  chat card shows, or null when the resource is gone / not writable. */
export async function spendResource(
  itemId: string,
  choice: SpendChoice,
): Promise<ChatSpent | null> {
  let prev = 0;
  const updated = await updateResource(itemId, choice.resourceId, (r) => {
    prev = r.current;
    return { ...r, current: Math.max(0, r.current - choice.amount) };
  });
  if (!updated) return null;
  const delta = updated.current - prev;
  if (delta !== 0) void broadcastChanged(itemId, updated, delta, prev);
  return {
    name: updated.name?.trim() || "?",
    amount: choice.amount,
    left: updated.current,
    max: updated.max,
  };
}
