import { describe, expect, it } from "vitest";

import { TECH_NODES } from "../../tech/data/tech-tree";
import type { TechNode } from "../../tech/model/tech-node";
import { TECH_STORY_NOTES } from "../data/tech-story-notes";
import { TECH_STORY_FALLBACK, techStoryText } from "./tech-story-text";

/** The shipped node with `id`. */
const node = (id: string): TechNode => {
  const found = TECH_NODES.find((each) => each.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};

describe("techStoryText (#1237)", () => {
  it("says what each shipped story node opens, in plain words", () => {
    const said = (id: string) => techStoryText(node(id), TECH_STORY_NOTES);
    expect(said("tech.pheromone-analysis")).toBe(
      "Story: opens Live Specimen, the mission that ends Act I.",
    );
    expect(said("tech.pod-telemetry")).toBe(
      "Story: opens Intact Pod, the mission that ends Act II.",
    );
    expect(said("tech.platform-approach")).toBe(
      "Story: opens Launch Window, the mission that ends Act III, once all three Great Hives have fallen.",
    );
    expect(said("tech.last-hope")).toBe(
      "Story: opens the Spore Platform again for one last assault; a second defeat ends the campaign.",
    );
  });

  it("finds the note through a flag, skipping effects and flags with none (Pheromone Analysis leads with its upgrade)", () => {
    const notes = {
      "pod-telemetry": { mission: "intact-pod", opens: "the second" },
    } as const;
    expect(
      techStoryText(
        {
          kind: "intel",
          effects: [
            { kind: "infantry-upgrade", upgradeId: "capture-net" },
            { kind: "flag", flag: "field-notes" },
            { kind: "flag", flag: "capture-net" },
            { kind: "flag", flag: "pod-telemetry" },
          ],
        },
        notes,
      ),
    ).toBe("Story: opens the second.");
  });

  it("falls back to a plain line for a story node no note covers", () => {
    expect(
      techStoryText(
        { kind: "story", effects: [{ kind: "flag", flag: "field-notes" }] },
        TECH_STORY_NOTES,
      ),
    ).toBe(TECH_STORY_FALLBACK);
    expect(techStoryText(node("tech.last-hope"), {})).toBe(TECH_STORY_FALLBACK);
  });

  it("says nothing for a node whose kind does not advance the story, even one setting a story flag", () => {
    for (const each of TECH_NODES.filter(
      (n) => n.kind !== "intel" && n.kind !== "story",
    )) {
      expect(techStoryText(each, TECH_STORY_NOTES), each.id).toBeUndefined();
    }
    expect(
      techStoryText(
        { kind: "part", effects: [{ kind: "flag", flag: "capture-net" }] },
        TECH_STORY_NOTES,
      ),
    ).toBeUndefined();
  });
});
