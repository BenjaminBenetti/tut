import { describe, expect, it } from "vitest";
import { createRelay } from "../../relay/server.mjs";
import {
  validGameRequest,
  GAME_SIMPLE_ACTIONS,
} from "../../relay/game-request.mjs";
import { JEV_ACTION_OWNER_FIELDS } from "../../src/tactical/model/jev-control.ts";
import { MECH_ACTION_DEFINITIONS } from "../../src/tactical/model/mech-action-command.ts";
import {
  captureJev,
  jevChoicePage,
} from "../../src/tactical/ai/jev-request.ts";
import { jevDistancePage } from "../../src/tactical/ai/jev-distance.ts";
import {
  missionWith,
  openField,
  unitAt,
} from "../../src/tactical/service/tactical-fixtures.test-helper.ts";
import { withVision } from "../../src/tactical/service/vision-service.ts";
import { EQUIPMENT } from "../../src/tactical/data/equipment.ts";
import { COMBAT_TUNING } from "../../src/tactical/data/combat-tuning.ts";
import { OBJECTIVE_TUNING } from "../../src/tactical/data/objective-tuning.ts";
import {
  createExtractHandler,
  createInteractHandler,
} from "../../src/tactical/service/objective-service.ts";
import { createHarvestHandler } from "../../src/tactical/service/harvest-service.ts";
import { FixtureMapBuilder } from "../../src/mapgen/service/fixture-map-builder.ts";

/** Real observations and legal choices with renamed loadouts, every item kind and rich shared intel. */
function scenario(team, passClass = "infantry") {
  const self = {
    ...unitAt("actor", passClass, { x: 1, y: 0, z: 1 }, { team, hp: 5 }),
    heat: 3,
    braced: true,
    movedThisTurn: false,
    ablativeSpent: 0,
    overwatchShots: 1,
    weaponReadyOnTurn: { "new-weapon": 0 },
  };
  const mission = missionWith(openField().build(), [
    self,
    { ...unitAt("ally", "mech", { x: 1, y: 0, z: 3 }, { hp: 5 }), team },
    unitAt("organic-ally", "infantry", { x: 2, y: 0, z: 3 }, { team, hp: 5 }),
    unitAt(
      "enemy",
      "infantry",
      { x: 3, y: 0, z: 1 },
      { team: team === "tdf" ? "bugs" : "tdf" },
    ),
  ]);
  const items = Object.values(EQUIPMENT).map((item) => ({
    ...item,
    id: `new-${item.id}`,
    name: `New ${item.name}`,
  }));
  const template = mission.templates[self.templateId];
  const state = withVision({
    state: {
      ...mission,
      phase: team === "tdf" ? "player" : "bugs",
      templates: {
        ...mission.templates,
        [template.id]: {
          ...template,
          equipment: items.map((item) => item.id),
          systems: {
            heatCapacity: 100,
            cooling: 2,
            idleHeat: 0,
            movementHeat: 1,
            jumpRange: 4,
            jumpHeight: 4,
            jumpHeat: 1,
            allTerrain: true,
            braceAccuracy: 5,
            stationaryAccuracy: 5,
            energyHeatFactor: 0.5,
            ablativeHits: 2,
            ablativeAbsorption: 1,
            coolantUses: 2,
            designationAccuracy: 5,
            sightBonus: 1,
            equipment: items.map((item) => item.id),
          },
          weapons: [
            {
              id: "new-weapon",
              name: "New weapon",
              charges: 3,
              profile: {
                ...template.weapons[0].profile,
                aoe: { radius: 2, falloff: 0.4 },
                aoeEffect: { kind: "smoke", chance: 1, falloff: 0.1 },
                heat: 1,
                energy: true,
                indirect: true,
                guided: true,
                requiresBrace: true,
                minRange: 0,
                beam: false,
                cooldown: 1,
                endsTurn: false,
                overwatchShots: 2,
                demoForce: 1,
              },
            },
          ],
        },
      },
      extraction: [{ x: 7, y: 0, z: 2 }],
      objectives: [
        {
          id: "objective",
          kind: "destroy-spawner",
          targetId: "nest",
          complete: false,
        },
      ],
      spawners: [
        {
          id: "nest",
          pos: { x: 6, y: 0, z: 1 },
          hp: 10,
          destroyed: false,
          timer: 3,
          hatchRadius: 3,
        },
      ],
      carcasses: [
        {
          id: "carcass",
          pos: { x: 1, y: 0, z: 2 },
          techPoints: 5,
          harvested: false,
        },
      ],
      radars: [
        {
          id: "radar",
          team,
          pos: { x: 3, y: 0, z: 3 },
          range: 10,
          turnsLeft: 3,
        },
      ],
      charges: [
        {
          id: "charge",
          ownerId: "actor",
          equipmentId: "new-breaching-charge",
          tile: { x: 2, y: 0, z: 2 },
          detonatesOnTurn: 3,
        },
      ],
      effects: [
        { id: "fire", kind: "fire", tile: { x: 2, y: 0, z: 1 }, phasesLeft: 2 },
      ],
    },
    events: [],
  }).state;
  const rules = {
    handlers: {
      "tactical:extract": createExtractHandler(OBJECTIVE_TUNING),
      "tactical:interact": createInteractHandler(OBJECTIVE_TUNING),
      "tactical:harvest-carcass": createHarvestHandler(OBJECTIVE_TUNING),
    },
    combat: COMBAT_TUNING,
    equipment: {
      catalogue: {
        ids: items.map((item) => item.id),
        get: (id) => items.find((item) => item.id === id),
      },
      combat: COMBAT_TUNING,
    },
  };
  return { state, rules };
}

/** Walk every real pagination branch; transport sees serialized JSON, never undefined fields. */
function requestsFor(state, rules) {
  const snapshot = captureJev(
    state,
    "actor",
    rules,
    { entity: "Cover Alpha", commander: "Reach extraction" },
    { actor: "Commander", ally: "Alpha" },
  );
  const pages = [];
  /** The same subdivision used by the live controller, without model calls. */
  const visit = (page) => {
    pages.push({
      stage: page.stage,
      request: JSON.parse(JSON.stringify(page.request)),
    });
    if (page.groups)
      for (const group of Object.values(page.groups))
        visit(jevChoicePage(snapshot, group));
  };
  visit(jevChoicePage(snapshot));
  for (const candidate of snapshot.candidates.filter(
    (candidate) => candidate.movement,
  ))
    visit(jevDistancePage(snapshot, candidate));
  return pages;
}

describe("Relay compatibility with actual game requests", () => {
  it("requires explicit relay coverage when a command or mech action family is added", () => {
    const ordinary = Object.keys(JEV_ACTION_OWNER_FIELDS)
      .filter(
        (type) =>
          ![
            "tactical:attack",
            "tactical:use-equipment",
            "tactical:mech-action",
          ].includes(type),
      )
      .map((type) => type.replace("tactical:", ""));
    expect(new Set(GAME_SIMPLE_ACTIONS)).toEqual(
      new Set([...ordinary, ...Object.keys(MECH_ACTION_DEFINITIONS)]),
    );
  });
  it.each([
    ["tdf", "infantry"],
    ["bugs", "infantry"],
    ["tdf", "mech"],
  ])(
    "accepts all decision stages for a %s %s with new loadout IDs",
    (team, passClass) => {
      const { state, rules } = scenario(team, passClass);
      const pages = requestsFor(state, rules);
      expect(new Set(pages.map((page) => page.stage))).toEqual(
        new Set([
          "action-type",
          "action-group",
          "action",
          "movement-target",
          "movement-distance",
        ]),
      );
      const top = pages[0].request.questions.action.criteria;
      expect(top).toHaveProperty("attack:new-weapon");
      expect(
        Object.keys(top).filter((key) => key.startsWith("equipment:")),
      ).toHaveLength(Object.keys(EQUIPMENT).length);
      for (const page of pages)
        expect(
          validGameRequest(page.request),
          `${team}/${passClass}/${page.stage}: ${JSON.stringify(page.request.questions).slice(0, 200)}`,
        ).toBe(true);
    },
  );

  it("accepts extraction, uncertain intel and a 100-entity observation without reopening arbitrary JSON", () => {
    const { rules } = scenario("tdf");
    const state = missionWith(
      new FixtureMapBuilder(24, 24, 6).fillGround().build(),
      [
        unitAt("actor", "infantry", { x: 0, y: 0, z: 0 }),
        ...Array.from({ length: 100 }, (_, index) =>
          unitAt(`ally-${index}`, "infantry", {
            x: 3 + (index % 10),
            y: 0,
            z: 3 + Math.floor(index / 10),
          }),
        ),
        unitAt("hidden", "infantry", { x: 23, y: 0, z: 23 }, { team: "bugs" }),
      ],
    );
    const mission = {
      ...state,
      extraction: [{ x: 0, y: 0, z: 0 }],
      radars: [
        {
          id: "radar",
          team: "tdf",
          pos: { x: 12, y: 0, z: 12 },
          range: 32,
          turnsLeft: 3,
        },
      ],
      vision: {
        ...state.vision,
        tdf: {
          ...state.vision.tdf,
          lastSeen: { historical: { x: 20, y: 0, z: 20 } },
        },
      },
    };
    const pages = requestsFor(mission, rules);
    expect(pages[0].request.state.entities).toHaveLength(100);
    expect(pages[0].request.state.last_seen).toHaveLength(1);
    expect(pages[0].request.state.radar_contacts).toHaveLength(1);
    expect(pages[0].request.questions.action.criteria).toHaveProperty(
      "extract",
    );
    for (const page of pages)
      expect(validGameRequest(page.request), page.stage).toBe(true);
  });

  it("forwards each real stage byte-for-byte as JSON through the authenticated relay", async () => {
    const { state, rules } = scenario("tdf");
    const pages = [
      ...new Map(
        requestsFor(state, rules).map((page) => [page.stage, page]),
      ).values(),
    ];
    const forwarded = [];
    const server = createRelay({
      key: "local-test-key",
      origins: ["http://localhost:5173"],
      log: () => {},
      fetchUpstream: async (url, options) => {
        expect(url).toBe("https://api.typesafe.ai/v1/systemone");
        expect(options.headers.Authorization).toBe("Bearer local-test-key");
        expect(options.redirect).toBe("error");
        forwarded.push(JSON.parse(options.body));
        return new Response(JSON.stringify({ answers: {} }));
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      for (const page of pages) {
        const response = await fetch(
          `http://127.0.0.1:${server.address().port}/v1/systemone`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Origin: "http://localhost:5173",
            },
            body: JSON.stringify(page.request),
          },
        );
        expect(response.status, page.stage).toBe(200);
        expect(await response.json()).toEqual({ answers: {} });
      }
      expect(forwarded).toEqual(pages.map((page) => page.request));
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("rejects altered follow-up shapes, missing references and oversized detail pages", () => {
    const { state, rules } = scenario("tdf");
    const pages = requestsFor(state, rules);
    for (const stage of [
      "action-type",
      "action-group",
      "action",
      "movement-target",
    ]) {
      const request = structuredClone(
        pages.find((page) => page.stage === stage).request,
      );
      const [id, option] = Object.entries(request.questions.action.criteria)[0];
      request.questions.action.criteria[id] =
        typeof option === "string"
          ? { text: option }
          : { ...option, messages: ["Unrelated task"] };
      expect(validGameRequest(request), stage).toBe(false);
    }
    const movement = structuredClone(
      pages.find((page) => page.stage === "movement-target").request,
    );
    movement.questions.action.criteria = {
      "move_to_entity:unknown": "Move toward an entity not in this state.",
    };
    expect(validGameRequest(movement)).toBe(false);
    const missing = structuredClone(pages[0].request);
    missing.state.entities[0].capability_ref = "missing-capability";
    expect(validGameRequest(missing)).toBe(false);
    const oversized = structuredClone(
      pages.find((page) => page.stage === "action").request,
    );
    const candidate = Object.values(oversized.questions.action.criteria)[0];
    oversized.questions.action.criteria = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [
        `action-${index}`,
        {
          ...candidate,
          details: { ...candidate.details, effect: "x".repeat(2048) },
        },
      ]),
    );
    expect(
      JSON.stringify(oversized.questions.action.criteria).length,
    ).toBeGreaterThan(8000);
    expect(validGameRequest(oversized)).toBe(false);
  });
});
