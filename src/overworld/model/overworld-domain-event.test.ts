import { describe, expect, it } from "vitest";

import type { CreditsChangedEvent } from "../../economy/model/economy-event";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import type { DayAdvancedEvent } from "./day-advanced-event";
import { DAY_ADVANCED } from "./day-advanced-event";
import type { GameEndedEvent } from "./game-ended-event";
import type {
  CampaignEvent,
  OverworldDomainEvent,
} from "./overworld-domain-event";

// ===========================================
// Compile-time proofs
// ===========================================
//
// These assignments are the test: `pnpm typecheck` fails if the derived
// union stops accepting a registered event or starts accepting an
// unregistered one. The runtime assertions only keep vitest honest.

/** A registered overworld event is a `CampaignEvent`. */
const dayAdvanced: CampaignEvent = {
  type: DAY_ADVANCED,
  payload: { from: 1, to: 2 },
} satisfies DayAdvancedEvent;

/** The economy group is part of the campaign union. */
const creditsChanged: CampaignEvent = {
  type: CREDITS_CHANGED,
  payload: {
    before: 10,
    after: 5,
    transaction: { id: "txn-1", day: 1, amount: -5, kind: "upkeep", ref: "d1" },
  },
} satisfies CreditsChangedEvent;

/** The old name still compiles as an alias. */
const legacy: OverworldDomainEvent = dayAdvanced;

/** An unregistered tag is rejected by the derived union. */
// @ts-expect-error "overworld:not-an-event" is not a key of OverworldEventMap
const bogus: CampaignEvent = { type: "overworld:not-an-event", payload: {} };

/** Narrowing on `type` reaches the registered member's payload. */
function outcomeDay(event: CampaignEvent): number | undefined {
  if (event.type === "overworld:game-ended") {
    const ended: GameEndedEvent = event;
    return ended.payload.outcome.day;
  }
  return undefined;
}

describe("CampaignEvent", () => {
  it("accepts registered overworld and economy events", () => {
    expect(dayAdvanced.type).toBe(DAY_ADVANCED);
    expect(creditsChanged.type).toBe(CREDITS_CHANGED);
    expect(legacy).toBe(dayAdvanced);
    expect(bogus.type).toBe("overworld:not-an-event");
  });

  it("narrows by type tag", () => {
    expect(outcomeDay(dayAdvanced)).toBeUndefined();
  });
});
