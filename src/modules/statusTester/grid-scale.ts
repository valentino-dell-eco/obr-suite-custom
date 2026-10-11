// Keeps the Status Tracker's grid-scale cache (types.ts) in sync with
// the scene grid — used by grid-distance levels ("Flying 30 ft").
// Call once per page after OBR.onReady; `onChange` runs when it moves.

import OBR from "@owlbear-rodeo/sdk";
import { setStatusGridScale } from "./types";

async function read(): Promise<void> {
  try {
    const scale = await OBR.scene.grid.getScale();
    const m = Number(scale?.parsed?.multiplier);
    setStatusGridScale(m > 0 ? m : 5, String(scale?.parsed?.unit ?? ""));
  } catch {}
}

export async function initStatusGridScale(onChange?: () => void): Promise<void> {
  await read();
  try {
    OBR.scene.grid.onChange(() => { void read().then(() => onChange?.()); });
  } catch {}
}
