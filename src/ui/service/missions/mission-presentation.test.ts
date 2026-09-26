import { describe, expect, it, vi } from "vitest";

import type { MissionTypeId } from "../../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../../content/model/mission-type-id";
import type { Mission } from "../../../overworld/model/mission";
import type { MissionResult } from "../../../overworld/model/mission-result";
import { wreckOf } from "../../../overworld/service/wreck-service";
import { STARTER_LOADOUT } from "../../../roster/data/starter-roster";
import { createMech } from "../../../roster/service/mech-factory";
import { ICON_MANIFEST } from "../../data/icon-manifest";
import type {
  MissionPresentation,
  MissionPresentationCatalogue,
} from "../../model/mission-presentation";
import {
  campaignOnDay,
  missionAt,
} from "../../view/mission-fixtures.test-helper";
import {
  MISSION_PRESENTATION,
  briefingFieldsOf,
  debriefTaglineFor,
} from "./mission-presentation";

// ===========================================
// Fixtures
// ===========================================

const CLEARANCE = missionAt("mission-1", "cairo", 7, 4);

const DEFENCE: Mission = {
  ...CLEARANCE,
  id: "mission-2",
  typeId: "defend-installation",
  defence: {
    installation: "sensor-array",
    deployableId: "deployable-1",
    generators: 2,
    waves: 3,
  },
};

const CRASH: Mission = {
  ...CLEARANCE,
  id: "mission-3",
  typeId: "crash-site",
  crashSite: { landingCityId: "cairo", preLandingInfestation: 7 },
};

const RECOVERY: Mission = {
  ...CLEARANCE,
  id: "mission-4",
  typeId: "wreck-recovery",
  wreck: wreckOf(
    createMech(STARTER_LOADOUT, "mech-9", "Hammerhead"),
    CLEARANCE,
    3,
    2,
  ),
};

const EVACUATION: Mission = {
  ...CLEARANCE,
  id: "mission-5",
  typeId: "evacuation",
  ignorePenalty: 0,
  evacuation: { groups: 5, creditsPerGroup: 100 },
};

const ASSAULT: Mission = {
  ...CLEARANCE,
  id: "mission-6",
  typeId: "hive-assault",
  hive: { hiveId: "hive-1", regionId: "middle-east", level: 2 },
  pinned: true,
};

/**
 * One offer per type, carrying the type's payload. Keyed by the union,
 * so a new type cannot join the table without a fixture here.
 */
const OFFERS: Readonly<Record<MissionTypeId, Mission>> = {
  "infestation-clearance": CLEARANCE,
  "defend-installation": DEFENCE,
  "crash-site": CRASH,
  "wreck-recovery": RECOVERY,
  evacuation: EVACUATION,
  "hive-assault": ASSAULT,
};

const CAMPAIGN = campaignOnDay(4, [CLEARANCE, DEFENCE, ASSAULT]);

/** The campaign with the assaulted hive standing, formed on day 1. */
const CTX = {
  state: {
    ...CAMPAIGN,
    overworld: {
      ...CAMPAIGN.overworld,
      hives: [{ id: "hive-1", regionId: "middle-east", formedDay: 1 }],
    },
  },
};

const RESULT: MissionResult = {
  missionId: "mission-2",
  cityId: "cairo",
  outcome: "won",
  squadCasualties: [],
  squadsWiped: [],
  mechsDestroyed: [],
  mechDamage: [],
  creditsAwarded: 0,
  techPointsAwarded: 0,
  infestationDelta: 0,
};

/** A presentation with only what a test needs; the rest is inert. */
function stub(
  typeId: MissionTypeId,
  overrides: Partial<MissionPresentation> = {},
): MissionPresentation {
  return {
    typeId,
    icon: "mission",
    briefingFields: [],
    briefingRows: () => [],
    ...overrides,
  };
}

// ===========================================
// MISSION_PRESENTATION
// ===========================================

describe("MISSION_PRESENTATION", () => {
  it("has one entry per mission type, each keyed by its own id", () => {
    expect(Object.keys(MISSION_PRESENTATION).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
    for (const typeId of MISSION_TYPE_IDS) {
      expect(MISSION_PRESENTATION[typeId].typeId).toBe(typeId);
    }
  });

  it("gives every type a registered glyph of its own, so the list tells them apart", () => {
    const icons = MISSION_TYPE_IDS.map((id) => MISSION_PRESENTATION[id].icon);
    for (const icon of icons) {
      expect(Object.keys(ICON_MANIFEST)).toContain(icon);
    }
    expect(new Set(icons).size).toBe(MISSION_TYPE_IDS.length);
  });

  it("fills only fields its type declares, in their declared order", () => {
    for (const typeId of MISSION_TYPE_IDS) {
      const presentation = MISSION_PRESENTATION[typeId];
      const declared = presentation.briefingFields.map((f) => f.field);
      const filled = presentation
        .briefingRows(OFFERS[typeId], CTX)
        .map((row) => row.field);
      expect(declared.filter((field) => filled.includes(field))).toEqual(
        filled,
      );
    }
  });

  it("briefs a defence's installation and waves, and nothing without its payload (#1175)", () => {
    const defend = MISSION_PRESENTATION["defend-installation"];
    expect(defend.briefingRows(DEFENCE, CTX)).toEqual([
      {
        field: "installation",
        label: "Installation",
        value: "Sensor array · 2 generators",
      },
      { field: "waves", label: "Bug waves", value: "3 timed waves" },
    ]);
    const { defence: _dropped, ...bare } = DEFENCE;
    expect(defend.briefingRows(bare, CTX)).toEqual([]);
    expect(
      MISSION_PRESENTATION["infestation-clearance"].briefingRows(
        CLEARANCE,
        CTX,
      ),
    ).toEqual([]);
  });

  it("briefs a crash site's clock, its landing by city name and its tech premium (arc §6.3)", () => {
    const crash = MISSION_PRESENTATION["crash-site"];
    expect(crash.icon).toBe("pod");
    expect(crash.briefingRows(CRASH, CTX)).toEqual([
      {
        field: "pod",
        label: "Spore pod",
        value: "Matures at the end of turn 8",
      },
      {
        field: "landing",
        label: "Fresh landing",
        value: "Cairo · +10 now · erased if the pod falls",
      },
      { field: "tech-bonus", label: "Tech bonus", value: "TP ×1.5" },
    ]);
    const { crashSite: _dropped, ...bare } = CRASH;
    expect(crash.briefingRows(bare, CTX).map((row) => row.field)).toEqual([
      "pod",
      "tech-bonus",
    ]);
  });
});

describe("EVACUATION_PRESENTATION (arc §6.4)", () => {
  const evacuation = MISSION_PRESENTATION.evacuation;

  it("briefs the groups, the half to extract and the stipend's stakes", () => {
    expect(evacuation.icon).toBe("evacuate");
    expect(evacuation.briefingRows(EVACUATION, CTX)).toEqual([
      {
        field: "civilians",
        label: "Civilians",
        value: "Free 5 civilian groups",
      },
      { field: "evacuation-win", label: "Win", value: "At least 3 extracted" },
      {
        field: "evacuation-saved",
        label: "Saved",
        value: "Stipend +50% for 10 days · ¢100 a group",
      },
      {
        field: "evacuation-lost",
        label: "Lost or ignored",
        value: "Stipend −10% for 10 days",
      },
    ]);
    const four = {
      ...EVACUATION,
      evacuation: { groups: 4, creditsPerGroup: 100 },
    };
    expect(evacuation.briefingRows(four, CTX)[1]?.value).toBe(
      "At least 2 extracted",
    );
  });

  it("keeps the stakes and drops the counts for an offer without its spec", () => {
    const { evacuation: _dropped, ...bare } = EVACUATION;
    expect(
      evacuation.briefingRows(bare, CTX).map((row) => [row.field, row.value]),
    ).toEqual([
      ["evacuation-saved", "Stipend +50% for 10 days"],
      ["evacuation-lost", "Stipend −10% for 10 days"],
    ]);
  });
});

// ===========================================
// briefingFieldsOf
// ===========================================

describe("briefingFieldsOf", () => {
  it("lists every type's fields in type order, a shared field once at its first place", () => {
    const waves = { field: "waves", label: "Bug waves" };
    const catalogue: MissionPresentationCatalogue = {
      "infestation-clearance": stub("infestation-clearance", {
        briefingFields: [{ field: "hives", label: "Hives" }, waves],
      }),
      "defend-installation": stub("defend-installation", {
        briefingFields: [
          { field: "installation", label: "Installation" },
          waves,
        ],
      }),
      "crash-site": stub("crash-site"),
      "wreck-recovery": stub("wreck-recovery"),
      evacuation: stub("evacuation"),
      "hive-assault": stub("hive-assault"),
    };
    expect(briefingFieldsOf(catalogue).map((f) => f.field)).toEqual([
      "hives",
      "waves",
      "installation",
    ]);
  });

  it("gives the shipped briefing the defence's two rows, the crash site's three, the wreck's three, the evacuation's four and the assault's three", () => {
    expect(briefingFieldsOf(MISSION_PRESENTATION)).toEqual([
      { field: "installation", label: "Installation" },
      { field: "waves", label: "Bug waves" },
      { field: "pod", label: "Spore pod" },
      { field: "landing", label: "Fresh landing" },
      { field: "tech-bonus", label: "Tech bonus" },
      { field: "wreck", label: "Wreck" },
      { field: "parts", label: "Parts" },
      { field: "strip", label: "Strip time" },
      { field: "civilians", label: "Civilians" },
      { field: "evacuation-win", label: "Win" },
      { field: "evacuation-saved", label: "Saved" },
      { field: "evacuation-lost", label: "Lost or ignored" },
      { field: "hive-level", label: "Hive level" },
      { field: "liberates", label: "Liberates" },
      { field: "tech-multiplier", label: "Tech multiplier" },
    ]);
  });
});

// ===========================================
// debriefTaglineFor
// ===========================================

describe("debriefTaglineFor", () => {
  it("says what became of a defended installation, and leaves a clearance to its outcome's line", () => {
    expect(
      debriefTaglineFor(
        { ...RESULT, defence: { installation: "sensor-array", held: true } },
        CTX,
      ),
    ).toBe(
      "The sensor array held through every wave. The force is coming home with full rewards.",
    );
    expect(debriefTaglineFor(RESULT, CTX)).toBeUndefined();
  });

  it("says whether a crash site's pod was wrecked, matured or left standing (arc §6.3)", () => {
    const pod = (
      podDestroyed: boolean,
      outcome: MissionResult["outcome"],
      failed = false,
    ): MissionResult => ({
      ...RESULT,
      outcome,
      podDestroyed,
      objectives: [{ kind: "destroy-pod", complete: podDestroyed, failed }],
    });
    expect(debriefTaglineFor(pod(true, "won"), CTX)).toBe(
      "The spore pod is wreckage and the landing at Cairo is burned out. The force is coming home with full rewards.",
    );
    expect(debriefTaglineFor(pod(true, "lost"), CTX)).toBe(
      "The spore pod is wreckage and the landing at Cairo is burned out, but the force did not make it home.",
    );
    expect(debriefTaglineFor(pod(false, "extracted", true), CTX)).toBe(
      "The spore pod matured and burst. The landing at Cairo takes root.",
    );
    expect(debriefTaglineFor(pod(false, "extracted"), CTX)).toBe(
      "The force left the spore pod standing. The landing at Cairo takes root.",
    );
  });

  it("counts an evacuation's groups aboard and says what it does to the stipend (arc §6.4)", () => {
    const evacuated = (
      rescued: number,
      outcome: MissionResult["outcome"],
      complete: boolean,
    ): MissionResult => ({
      ...RESULT,
      outcome,
      civiliansRescued: rescued,
      civiliansTotal: 4,
      objectives: [
        {
          kind: "rescue-civilians",
          complete,
          failed: !complete,
          done: rescued,
          total: 4,
        },
      ],
    });
    expect(debriefTaglineFor(evacuated(4, "won", true), CTX)).toBe(
      "Every civilian group in Cairo is aboard. Stipend +50% for 10 days.",
    );
    expect(debriefTaglineFor(evacuated(3, "won", true), CTX)).toBe(
      "3 of 4 civilian groups are out of Cairo. Stipend +50% for 10 days.",
    );
    expect(debriefTaglineFor(evacuated(2, "lost", true), CTX)).toBe(
      "2 of 4 civilian groups are out of Cairo. The force did not make it home. Stipend +50% for 10 days.",
    );
    expect(debriefTaglineFor(evacuated(1, "extracted", false), CTX)).toBe(
      "Only 1 of 4 civilian groups got out of Cairo. Stipend −10% for 10 days.",
    );
    expect(debriefTaglineFor(evacuated(0, "lost", false), CTX)).toBe(
      "No civilian group got out of Cairo. Stipend −10% for 10 days.",
    );
  });

  it("asks each type in id order with the context, and takes the first answer", () => {
    const first = vi.fn(() => undefined);
    const second = vi.fn(() => "second");
    const catalogue: MissionPresentationCatalogue = {
      "infestation-clearance": stub("infestation-clearance", {
        debriefTagline: first,
      }),
      "defend-installation": stub("defend-installation", {
        debriefTagline: second,
      }),
      "crash-site": stub("crash-site"),
      "wreck-recovery": stub("wreck-recovery"),
      evacuation: stub("evacuation"),
      "hive-assault": stub("hive-assault"),
    };
    expect(debriefTaglineFor(RESULT, CTX, catalogue)).toBe("second");
    expect(first).toHaveBeenCalledWith(RESULT, CTX);
    expect(second).toHaveBeenCalledWith(RESULT, CTX);

    const answered = vi.fn(() => "first");
    const skipped = vi.fn(() => "second");
    expect(
      debriefTaglineFor(RESULT, CTX, {
        "infestation-clearance": stub("infestation-clearance", {
          debriefTagline: answered,
        }),
        "defend-installation": stub("defend-installation", {
          debriefTagline: skipped,
        }),
        "crash-site": stub("crash-site"),
        "wreck-recovery": stub("wreck-recovery"),
        evacuation: stub("evacuation"),
        "hive-assault": stub("hive-assault"),
      }),
    ).toBe("first");
    expect(skipped).not.toHaveBeenCalled();
  });
});
