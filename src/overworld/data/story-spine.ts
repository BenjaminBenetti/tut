import type { StorySpine } from "../model/story-spine";

// ===========================================
// Story spine
// ===========================================

/**
 * Which story mission ends each act (campaign arc §3 "Ends when", §4).
 * An act exists once its ending mission, and every earlier act's, is
 * defined in `STORY_MISSION_RULES` (`actExists`), and `advance-act` past the last act that exists
 * wins the campaign (arc §13).
 *
 * | Act      | Ended by         | Gate in the arc                           | Entering it          |
 * |----------|------------------|-------------------------------------------|----------------------|
 * | `act-1`  | `live-specimen`  | Intel I researched, Live Specimen won     |                      |
 * | `act-2`  | `intact-pod`     | Intel II researched, Intact Pod won       | scripts the 1st hive |
 * | `act-3`  | `launch-window`  | Great Hives ×3 + Intel III: the Launch    |                      |
 * |          |                  | Window pin, whose `pinWhen` holds both    |                      |
 * | `finale` | `spore-platform` | the platform destroyed: victory           |                      |
 *
 * The arc lists Launch Window under the finale. The spine plays it as
 * Act III's last mission instead: its pin is Act III's gate, and its
 * win opens the finale, which then holds only the platform.
 *
 * So with nothing built the campaign never leaves Act I, and with only
 * Live Specimen built its win is the victory.
 */
export const STORY_SPINE: StorySpine = {
  "act-1": { endedBy: "live-specimen", formsFirstHive: false },
  "act-2": { endedBy: "intact-pod", formsFirstHive: true },
  "act-3": { endedBy: "launch-window", formsFirstHive: false },
  finale: { endedBy: "spore-platform", formsFirstHive: false },
};
