import type { TechStoryNotes } from "../model/tech-story-notes";

// ===========================================
// Tech story notes
// ===========================================

/**
 * What each story flag a research node sets opens (#1237; campaign arc
 * §4, §6.9), for the tech tree's detail panel. One line per flag the
 * story pins a mission on; the act each mission ends is the spine's
 * (`STORY_SPINE`), and the data test holds the words to it.
 *
 * ```
 *   node                  flag               opens
 *   Pheromone Analysis    capture-net        Live Specimen    (ends Act I)
 *   Pod Telemetry         pod-telemetry      Intact Pod       (ends Act II)
 *   Platform Approach     platform-approach  Launch Window    (ends Act III, with the Great Hives down)
 *   Last Hope             last-hope          Spore Platform   (the finale, a second time; D7)
 * ```
 */
export const TECH_STORY_NOTES: TechStoryNotes = {
  // Live Specimen pins on this flag, the day after the research (arc §4).
  "capture-net": {
    mission: "live-specimen",
    opens: "Live Specimen, the mission that ends Act I",
  },
  // Intact Pod pins on this flag (arc §4).
  "pod-telemetry": {
    mission: "intact-pod",
    opens: "Intact Pod, the mission that ends Act II",
  },
  // Half of Launch Window's pin; the last Great Hive falling is the other.
  "platform-approach": {
    mission: "launch-window",
    opens:
      "Launch Window, the mission that ends Act III, once all three Great Hives have fallen",
  },
  // The story holds the platform back after its first loss until this
  // flag is set; a second loss ends the campaign (arc D7).
  "last-hope": {
    mission: "spore-platform",
    opens:
      "the Spore Platform again for one last assault; a second defeat ends the campaign",
  },
};
