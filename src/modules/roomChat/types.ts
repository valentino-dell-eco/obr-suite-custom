// Room Chat — shared types + visibility rules.
//
// Transport: OBR broadcast (destination "ALL"). Broadcast has NO
// per-player addressing, so every client physically receives every
// message; privacy is enforced by CLIENT-SIDE filtering (same model
// as the dice module's hidden/dark rolls). It hides whispers from the
// UI of everyone who isn't a recipient, but it is NOT cryptographic
// privacy — a technical user inspecting broadcast traffic could read
// them. Fine for a table game; don't put secrets in here that matter
// beyond that.

export const PLUGIN_ID = "com.obr-suite/room-chat";

export const BC_CHAT_MESSAGE = `${PLUGIN_ID}/message`;
export const BC_CHAT_UPDATED = `${PLUGIN_ID}/updated`;
export const BC_CHAT_CLOSE = `${PLUGIN_ID}/close`;
/** LOCAL only: "open the chat popover" — fired by the background when a
 *  message arrives that this client is allowed to see (sent to all, a
 *  whisper addressed to me, or any message when I'm the GM). */
export const BC_CHAT_OPEN = `${PLUGIN_ID}/open`;
/** GM → everyone (destination ALL): wipe every client's local history. */
export const BC_CHAT_CLEAR = `${PLUGIN_ID}/clear`;
/** LOCAL only: background → chat popover, "history was just wiped,
 *  re-render empty". */
export const BC_CHAT_CLEARED = `${PLUGIN_ID}/cleared`;

export const MAX_TEXT = 500;
export const MAX_HISTORY = 300;

export type ChatScope = "all" | "gm" | "player";
/** Messages posted automatically by a tool (rendered as a notice, not a
 *  speech bubble). Spell casts are always "cast" via `msg.cast`. */
export type ChatTool = "status" | "rest" | "cast";
export const CHAT_TOOLS: readonly ChatTool[] = ["status", "rest", "cast"];
export type ChatRole = "GM" | "PLAYER";

/** A token resource spent with a cast / feature use. */
export interface ChatSpent {
  name: string;
  amount: number;
  /** What's left afterwards (shown as "left/max"). */
  left?: number;
  max?: number;
}

export interface ChatCast {
  /** "feature" = a character feature used from the card (no levels,
   *  no DC); absent = a spell cast. `spellName` holds the name. */
  kind?: "feature";
  /** Feature only: which list it comes from ("Class feature", …). */
  featureLabel?: string;
  /** Resource spent with this cast / use, if any. */
  spent?: ChatSpent;
  /** The spell was edited on the card (its fields differ from the
   *  library); `source` is then the library source it was based on. */
  edited?: boolean;
  spellName: string;
  baseLevel: number;
  castLevel: number;
  /** Full spell description text, as shown on the character card. */
  description?: string;
  /** Pre-formatted "school · casting time · range · components ·
   *  duration" line, built on the sender side from the spell's own
   *  meta fields — kept as one string so this type doesn't need to
   *  mirror characterCards' CharacterData spell-meta shape. */
  meta?: string;
  /** Save DC shown next to the name — only set when the spell forces
   *  a saving throw. */
  dc?: number;
  /** True when the caster changed the DC away from the card's value. */
  dcEdited?: boolean;
  /** Library source code (e.g. "PHB") or "Homebrew". */
  source?: string;
  /** Dice rewritten for the cast level (slot upcast) or the caster's
   *  level (cantrip scaling), e.g. [{ from: "8d6", to: "10d6" }]. */
  scaled?: Array<{ from: string; to: string }>;
  /** Token of the character card that posted it: dice in the card roll
   *  for that token (quick roll modal, card stats). */
  tokenId?: string;
}

export interface ChatMessage {
  id: string;
  ts: number;
  fromId: string;
  fromName: string;
  fromColor: string;
  fromRole: ChatRole;
  scope: ChatScope;
  toId?: string;
  toName?: string;
  text: string;
  cast?: ChatCast;
  /** Set by tool announcements (status changes, rests…). */
  tool?: ChatTool;
}

export function isChatMessage(v: unknown): v is ChatMessage {
  const m = v as ChatMessage | null;
  return (
    !!m &&
    typeof m.id === "string" &&
    typeof m.ts === "number" &&
    typeof m.fromId === "string" &&
    typeof m.fromName === "string" &&
    typeof m.text === "string" &&
    (m.scope === "all" || m.scope === "gm" || m.scope === "player")
  );
}

/** The tool that posted `msg`, or null for a message a person typed.
 *  Whitelisted — the field comes from the network / local history. */
export function toolOf(msg: ChatMessage): ChatTool | null {
  if (msg.cast) return "cast";
  return CHAT_TOOLS.includes(msg.tool as ChatTool) ? (msg.tool as ChatTool) : null;
}

export function isVisibleTo(msg: ChatMessage, meId: string, meRole: ChatRole): boolean {
  if (msg.fromId === meId) return true;
  if (msg.scope === "all") return true;
  if (meRole === "GM") return true;
  if (msg.scope === "player") return msg.toId === meId;
  return false;
}
