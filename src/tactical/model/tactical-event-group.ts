import type { TacticalEvent } from "./tactical-event";

// ===========================================
// Campaign registration
// ===========================================
//
// Joins the whole tactical event group to the campaign's event map as one
// `tactical` entry, the way every command module joins `OverworldCommandMap`
// (Tech Lead ruling on #324): dependency direction stays `tactical →
// overworld`, and the overworld never learns tactical exists. This lives
// in its own module rather than in `tactical-event.ts` because TypeScript
// refuses an augmentation whose member type derives from the very map
// the augmenting file declares (TS2664 from a checker cycle); a separate
// file with a type import merges cleanly.

declare module "../../overworld/model/overworld-domain-event" {
  interface OverworldEventMap {
    /** Every tactical event, as one group (GDD §6): tactical commands run on the campaign dispatcher. */
    readonly tactical: TacticalEvent;
  }
}

export {};
