// Small "minimized sheet" bar: shown after an action from the full
// character sheet (spell cast, feature use, roll, short rest). Click →
// reopen the sheet on the same card / tab / scroll; ✕ → just hide.
import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";

export const BC_CC_RESTORE = "com.obr-suite/cc-restore";
export const BC_CC_MINI_CLOSE = "com.obr-suite/cc-mini-close";

const en = getLocalLang() === "en";
let name = "";
try { name = decodeURIComponent(location.hash.slice(1)); } catch {}

const $ = (id: string) => document.getElementById(id) as HTMLElement;
$("nm").textContent = name || (en ? "Character sheet" : "角色卡");
$("hint").textContent = en ? "reopen" : "打开";
$("open").title = en ? "Reopen the character sheet" : "重新打开角色卡";
$("x").title = en ? "Hide" : "隐藏";

OBR.onReady(() => {
  $("open").addEventListener("click", () => {
    void OBR.broadcast.sendMessage(BC_CC_RESTORE, {}, { destination: "LOCAL" }).catch(() => {});
  });
  $("x").addEventListener("click", () => {
    void OBR.broadcast.sendMessage(BC_CC_MINI_CLOSE, {}, { destination: "LOCAL" }).catch(() => {});
  });
});
