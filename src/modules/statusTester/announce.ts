// Status Tracker — tell the table when a PLAYER changes the statuses on
// their own token: one line in Room Chat's "All" channel, sent by the
// player's client (the GM's own edits are not announced).

import { sendChat } from "../roomChat/send";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";

export type StatusChange =
  | { kind: "add"; status: string }
  | { kind: "remove"; status: string }
  | { kind: "level"; status: string; from: number; to: number };

export async function announceStatusChange(
  isGM: boolean,
  tokenName: string,
  change: StatusChange,
): Promise<void> {
  if (isGM) return;
  const lang = getLocalLang();
  const token = tokenName.trim() || t(lang, "sttChatToken");
  let text: string;
  if (change.kind === "add") {
    text = t(lang, "sttChatAdded").replace("{token}", token).replace("{status}", change.status);
  } else if (change.kind === "remove") {
    text = t(lang, "sttChatRemoved").replace("{token}", token).replace("{status}", change.status);
  } else {
    text = t(lang, "sttChatLevel")
      .replace("{token}", token)
      .replace("{status}", change.status)
      .replace("{from}", String(change.from))
      .replace("{to}", String(change.to));
  }
  try {
    await sendChat({ scope: "all", text });
  } catch (e) {
    console.warn("[status-tester] chat announce failed", e);
  }
}
