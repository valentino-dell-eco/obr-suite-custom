// Chase Tracker — data model.
//
// A "chase" is one quarry being pursued by one or more pursuers along
// an abstract 1-D track. Every participant (quarry included) just
// carries a `distance` number in whatever unit the GM is using (feet,
// squares, "zones"...) — there is no fixed zero point. Only the
// DIFFERENCE between a pursuer's distance and the quarry's distance
// matters: that's the "N away" gap rendered in the tracker bar and
// edited via the "Change Chase position" context-menu entry.

export const PLUGIN_ID = "com.obr-suite/chase-tracker";

// Scene metadata key — GM-owned, replicated to every client. Holds
// the full list of active chases.
export const CHASES_KEY = `${PLUGIN_ID}/chases`;

// Per-token metadata key. Sits on every token that's currently part
// of a chase (quarry or pursuer) and points back at the chase's id.
// Used to (a) hide the "Add to Chase" context-menu entries once a
// token is already a member and (b) show "Change Chase position"
// only for tokens that ARE a member.
export const MEMBER_KEY = `${PLUGIN_ID}/memberOf`;

export interface ChaseParticipant {
  tokenId: string;
  role: "quarry" | "pursuer";
  /** Distance travelled so far along the chase. Arbitrary unit,
   *  arbitrary zero point — see file header. */
  distance: number;
}

export interface ChaseEntry {
  id: string;
  participants: ChaseParticipant[];
  createdAt: number;
}

export const DEFAULT_PURSUER_GAP = 30;
