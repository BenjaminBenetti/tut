import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { isCampaignFlagId } from "../../content/model/campaign-flag-id";
import { ACT_IDS } from "../../content/model/act-id";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { LAST_HOPE_FLAG } from "../../overworld/service/story-service";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import { TECH_NODES } from "../../tech/data/tech-tree";
import { isStoryTechNode } from "../../tech/model/tech-node-kind-traits";
import { ACT_LABELS } from "./act-labels";
import { STORY_MISSION_TITLES } from "./story-mission-titles";
import { TECH_STORY_NOTES } from "./tech-story-notes";

/** Every campaign flag a shipped story node sets, in tree order. */
const STORY_FLAGS: readonly CampaignFlagId[] = TECH_NODES.filter((node) =>
  isStoryTechNode(node),
).flatMap((node) =>
  node.effects.flatMap((effect) =>
    effect.kind === "flag" && isCampaignFlagId(effect.flag)
      ? [effect.flag]
      : [],
  ),
);

/** The notes as `[flag, note]` rows. */
const ROWS = Object.entries(TECH_STORY_NOTES).flatMap(([flag, note]) =>
  note && isCampaignFlagId(flag) ? [[flag, note] as const] : [],
);

describe("TECH_STORY_NOTES (#1237)", () => {
  it("has a note for exactly the flags the shipped story nodes set", () => {
    expect(ROWS.map(([flag]) => flag).sort()).toEqual([...STORY_FLAGS].sort());
    expect(STORY_FLAGS).toEqual([
      "capture-net",
      "platform-approach",
      "last-hope",
      "pod-telemetry",
    ]);
  });

  it("names the mission each note opens by its board title, in one line with no closing stop", () => {
    for (const [flag, note] of ROWS) {
      expect(note.opens, flag).toContain(STORY_MISSION_TITLES[note.mission]);
      expect(note.opens, flag).not.toContain("\n");
      expect(note.opens.endsWith("."), flag).toBe(false);
    }
  });

  it("names the act a mission ends as the story spine does", () => {
    for (const [flag, note] of ROWS) {
      const ends = ACT_IDS.find(
        (act) => STORY_SPINE[act].endedBy === note.mission,
      );
      expect(ends, flag).toBeDefined();
      if (ends === undefined || ends === "finale") continue;
      // "Act I · Emergence" ──► "Act I", which must not match "Act II".
      const act = ACT_LABELS[ends].split(" · ")[0] ?? ends;
      expect(note.opens, flag).toMatch(
        new RegExp(`the mission that ends ${act}\\b`),
      );
    }
    // The finale's mission ends the campaign, which its note says.
    expect(TECH_STORY_NOTES["last-hope"]?.opens).toContain("ends the campaign");
  });

  it("opens a mission the story actually pins on that flag", () => {
    for (const [flag, note] of ROWS) {
      const rule = STORY_MISSION_RULES[note.mission];
      expect(rule, flag).toBeDefined();
      if (flag === LAST_HOPE_FLAG) {
        // D7: the platform's own loss rule holds it back until Last Hope.
        expect(rule?.onLost.kind, flag).toBe("platform");
        continue;
      }
      expect(rule?.pinWhen, flag).toContain(flag);
    }
  });
});
