// Short rest → "spend hit dice" window (hit-dice.html). Opened by the
// per-card SR buttons (mini panel and full sheet) after the rest has
// been applied, when the token's "Hit dice" resource has dice left.

import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { tokenResources } from "./spend";

export const HIT_DICE_MODAL_ID = "com.obr-suite/hit-dice";

export interface HitDicePayload {
  itemId: string;
  /** Character name for the window and the chat line. */
  name?: string;
  /** CON modifier added to every die. */
  conMod?: number;
  /** Card HP, used only when the token's HP bar has no values. */
  hpCurrent?: number | null;
  hpMax?: number | null;
}

/** CON modifier from card data (abilities.con.modifier, else from the score). */
export function conModFromCard(data: any): number {
  const con = data?.abilities?.con ?? {};
  if (typeof con.modifier === "number") return con.modifier;
  const score = Number(con.total ?? con.score);
  return Number.isFinite(score) ? Math.floor((score - 10) / 2) : 0;
}

export function hitDicePayloadFromCard(itemId: string, name: string, data: any): HitDicePayload {
  const hp = data?.core_stats?.hp ?? {};
  return {
    itemId,
    name,
    conMod: conModFromCard(data),
    hpCurrent: typeof hp.current === "number" ? hp.current : null,
    hpMax: typeof hp.max === "number" ? hp.max : null,
  };
}

/** Open the window if the token has hit dice left. Returns whether it opened. */
export async function openHitDiceModal(p: HitDicePayload): Promise<boolean> {
  if (!p.itemId) return false;
  const list = await tokenResources(p.itemId);
  const hd = list.find((r) => r.type === "hitDice");
  if (!hd || hd.current <= 0) return false;
  try { await OBR.modal.close(HIT_DICE_MODAL_ID); } catch {}
  try {
    await OBR.modal.open({
      id: HIT_DICE_MODAL_ID,
      url: `${assetUrl("hit-dice.html")}#${encodeURIComponent(JSON.stringify(p))}`,
      width: 380,
      height: 420,
      hidePaper: true,
    });
    return true;
  } catch (e) {
    console.warn("[cc] open hit dice modal failed", e);
    return false;
  }
}
