import { describe, expect, it } from "vitest";

import { err, ok } from "../../core/model/result";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { CommandContext } from "../../overworld/model/command-handler";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { advanceStage } from "../model/advance-stage-command";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { StageAdvancer } from "../model/stage-advancer";
import type { TacticalState } from "../model/tactical-state";
import { createAdvanceStageHandler } from "./advance-stage-handler";

// ===========================================
// Fixtures
// ===========================================

const CTX: CommandContext = {
  rng: new Mulberry32Rng(1),
  ids: new SequentialIdGenerator(),
};

/** A campaign with `missionId` live, or none. */
function campaign(missionId?: string): MissionCampaignState {
  return {
    ...(missionId === undefined
      ? {}
      : { activeMission: { missionId } as TacticalState }),
  } as MissionCampaignState;
}

/** An advancer that records its calls and answers `answer`. */
function advancer(answer: "ok" | "refuse"): StageAdvancer & { calls: number } {
  const recorder = {
    calls: 0,
    advanceStage<TState extends MissionCampaignState>(state: TState) {
      recorder.calls += 1;
      return answer === "ok"
        ? ok({
            ...state,
            activeMission: { missionId: "next" } as TacticalState,
          })
        : err({ kind: "no-stage-to-advance" as const, missionId: "m1" });
    },
  };
  return recorder;
}

// ===========================================
// Tests
// ===========================================

describe("the AdvanceStage handler", () => {
  it("hands a live mission to the advancer and keeps what it builds", () => {
    const stages = advancer("ok");
    const handle = createAdvanceStageHandler({ advancer: stages });
    const applied = handle(campaign("m1"), advanceStage("m1"), CTX);
    expect(stages.calls).toBe(1);
    expect(applied.ok && applied.value.state.activeMission?.missionId).toBe(
      "next",
    );
  });

  it("refuses with no mission live, or another one live, without asking", () => {
    const stages = advancer("ok");
    const handle = createAdvanceStageHandler({ advancer: stages });
    const none = handle(campaign(), advanceStage("m1"), CTX);
    const other = handle(campaign("m2"), advanceStage("m1"), CTX);
    expect(!none.ok && none.error.code).toBe("no-active-mission");
    expect(!other.ok && other.error.code).toBe("mission-mismatch");
    expect(stages.calls).toBe(0);
  });

  it("passes the advancer's refusal on", () => {
    const handle = createAdvanceStageHandler({ advancer: advancer("refuse") });
    const refused = handle(campaign("m1"), advanceStage("m1"), CTX);
    expect(!refused.ok && refused.error.code).toBe("no-stage-to-advance");
  });
});
