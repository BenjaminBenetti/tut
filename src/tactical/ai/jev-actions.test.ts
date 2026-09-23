import { describe, expect, it } from "vitest";
import { captureJev, jevChoicePage } from "./jev-request";
import { EQUIPMENT, GRENADE, MEDKIT, RADAR_DISH } from "../data/equipment";
import { COMBAT_TUNING } from "../data/combat-tuning";
import { RADAR_TUNING } from "../data/radar-tuning";
import { TURRET_TUNING } from "../data/turret-tuning";
import { SHIPPED_EQUIPMENT } from "../repository/equipment-catalogue";
import type {
  EquipmentCatalogue,
  EquipmentDefinition,
} from "../model/equipment";
import type { JevCandidate } from "../model/jev-control";
import type { Team } from "../model/unit";
import type { TacticalState } from "../model/tactical-state";
import type { UnitTemplate } from "../model/unit-template";
import { MECH_ACTION_DEFINITIONS } from "../model/mech-action-command";
import {
  previewEquipmentUse,
  previewHealUse,
  validateEquipmentUse,
  createUseEquipmentHandler,
} from "../service/equipment-service";
import { previewAttack, createAttackHandler } from "../service/combat-service";
import { withVision } from "../service/vision-service";
import {
  missionWith,
  openField,
  unitAt,
  blockUnitAt,
  ctxWith,
  riggedRng,
  fixtureAttackDeps,
} from "../service/tactical-fixtures.test-helper";
import { createMechActionHandler } from "../service/mech-action-service";
import { createJevActHandler } from "../service/jev-control-service";
import { bugUnit } from "../service/unit-factory";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";

const rules = {
  handlers: {},
  combat: COMBAT_TUNING,
  equipment: { catalogue: SHIPPED_EQUIPMENT, combat: COMBAT_TUNING },
};

/** Reveal the scene after assigning the actor its test loadout. */
function fitted(
  mission: TacticalState,
  loadout: Partial<UnitTemplate>,
): TacticalState {
  const id = mission.units[0]!.templateId;
  return withVision({
    state: {
      ...mission,
      templates: {
        ...mission.templates,
        [id]: { ...mission.templates[id]!, ...loadout },
      },
    },
    events: [],
  }).state;
}

/** An injected catalogue can add content without importing or editing the harness. */
function catalogue(items: readonly EquipmentDefinition[]): EquipmentCatalogue {
  return {
    ids: items.map((item) => item.id),
    get: (id) => items.find((item) => item.id === id),
  };
}

/** Read the factual payload visible in a target-choice question. */
function details(candidate: JevCandidate): Record<string, unknown> {
  return (
    JSON.parse(candidate.description) as { details: Record<string, unknown> }
  ).details;
}

describe("Jev capability discovery", () => {
  it("carries a new bug species loadout through spawning into its Jev choices", () => {
    const build = bugUnit(
      {
        id: "new-species",
        name: "New species",
        hp: 20,
        armor: 1,
        move: 3,
        ap: 2,
        weapon: { range: 1, damage: 2, accuracy: 70, armorPen: 0 },
        weapons: [
          {
            id: "acid",
            name: "Acid spray",
            charges: 2,
            profile: { range: 5, damage: 3, accuracy: 80, armorPen: 1 },
          },
          {
            id: "spines",
            name: "Spines",
            profile: { range: 5, damage: 4, accuracy: 70, armorPen: 0 },
          },
        ],
        equipment: [GRENADE.id],
        sightRange: 8,
        modelId: "bug.swarmer",
      },
      { pos: { x: 1, y: 0, z: 1 }, facing: "e" },
      { ids: new SequentialIdGenerator() },
    );
    const base = missionWith(
      openField().build(),
      [build.unit, unitAt("enemy", "infantry", { x: 3, y: 0, z: 1 })],
      { phase: "bugs" },
    );
    const mission = withVision({
      state: {
        ...base,
        templates: { ...base.templates, [build.template.id]: build.template },
      },
      events: [],
    }).state;
    const groups = jevChoicePage(
      captureJev(mission, build.unit.id, rules),
    ).groups!;
    expect(Object.keys(groups)).toEqual(
      expect.arrayContaining([
        "attack:acid",
        "attack:spines",
        `equipment:${GRENADE.id}`,
      ]),
    );
    expect(build.unit.charges).toMatchObject({ acid: 2 });
  });
  it.each<Team>(["tdf", "bugs"])(
    "discovers newly named weapons and every usable item kind on %s loadouts",
    (team) => {
      const items = Object.values(EQUIPMENT).map((item) => ({
        ...item,
        id: `new-${team}-${item.id}`,
        name: `New ${item.name}`,
      }));
      const custom = {
        ...rules,
        equipment: { ...rules.equipment, catalogue: catalogue(items) },
      };
      const base = missionWith(
        openField().build(),
        [
          unitAt("actor", "infantry", { x: 1, y: 0, z: 1 }, { team, hp: 7 }),
          {
            ...unitAt(
              "mechanical-ally",
              "mech",
              { x: 2, y: 0, z: 1 },
              { hp: 5 },
            ),
            team,
          },
          unitAt(
            "enemy",
            "infantry",
            { x: 3, y: 0, z: 1 },
            { team: team === "tdf" ? "bugs" : "tdf" },
          ),
        ],
        { phase: team === "tdf" ? "player" : "bugs" },
      );
      const weapons = [
        {
          id: `new-${team}-rifle`,
          name: "New rifle",
          charges: 3,
          profile: { range: 5, accuracy: 80, damage: 3, armorPen: 0 },
        },
        {
          id: `new-${team}-cannon`,
          name: "New cannon",
          charges: 2,
          profile: {
            range: 5,
            accuracy: 70,
            damage: 8,
            armorPen: 2,
            aoe: { radius: 2, falloff: 0.4 },
          },
        },
      ];
      const mission = fitted(base, {
        equipment: items.map((item) => item.id),
        weapons,
      });
      const snapshot = captureJev(mission, "actor", custom);
      const top = jevChoicePage(snapshot);
      const enabled = {
        ...mission,
        jev: {
          entities: { actor: { enabled: true, entityPrompt: "" } },
          commanders: { tdf: "", bugs: "" },
        },
      };
      const handler = createJevActHandler({
        "tactical:attack": createAttackHandler(
          COMBAT_TUNING,
          fixtureAttackDeps(),
        ),
        "tactical:use-equipment": createUseEquipmentHandler({
          ...custom.equipment,
          attack: fixtureAttackDeps(),
          radar: RADAR_TUNING,
          turret: TURRET_TUNING,
        }),
      });
      /** Newly discovered content must also execute through Jev, not just appear in a menu. */
      const execute = (candidate: JevCandidate): void => {
        const result = handler(
          enabled,
          {
            type: "tactical:jev-act",
            payload: {
              unitId: "actor",
              expectedSeq: enabled.commandSeq,
              choice: candidate.id,
              command: candidate.command,
            },
          },
          ctxWith(riggedRng(true)),
        );
        expect(result.ok, candidate.actionType?.id).toBe(true);
      };
      for (const weapon of weapons) {
        expect(
          previewAttack(mission, "actor", "enemy", rules.combat, weapon.id).ok,
        ).toBe(true);
        expect(top.groups![`attack:${weapon.id}`]).toHaveLength(1);
        expect(
          top.groups![`attack:${weapon.id}`]![0]!.command!.payload,
        ).toMatchObject({ weaponId: weapon.id, targetId: "enemy" });
        execute(top.groups![`attack:${weapon.id}`]![0]!);
      }
      for (const item of items) {
        const choices = top.groups![`equipment:${item.id}`]!;
        expect(choices.length, item.id).toBeGreaterThan(0);
        execute(choices[0]!);
        expect(
          top.request.questions.action!.criteria[`equipment:${item.id}`],
        ).toMatchObject({
          name: `Use ${item.name}`,
          capability: { kind: item.kind, uses_left: item.uses },
        });
        for (const candidate of choices) {
          const command = candidate.command!;
          expect(command.type).toBe("tactical:use-equipment");
          if (command.type !== "tactical:use-equipment")
            throw new Error("Expected equipment");
          expect(
            validateEquipmentUse(
              mission,
              "actor",
              item.id,
              command.payload.tile,
              custom.equipment,
            ).ok,
          ).toBe(true);
        }
      }
      // Spent items, empty weapons and AP limits all come from normal rules.
      const spent = {
        ...mission,
        units: mission.units.map((unit) =>
          unit.id === "actor"
            ? {
                ...unit,
                ap: 1,
                equipment: Object.fromEntries(
                  items.map((item) => [item.id, 0]),
                ),
                charges: Object.fromEntries(
                  weapons.map((weapon) => [weapon.id, 0]),
                ),
              }
            : unit,
        ),
      };
      const remaining = jevChoicePage(
        captureJev(spent, "actor", custom),
      ).groups!;
      expect(
        Object.keys(remaining).some(
          (id) => id.startsWith("equipment:") || id.startsWith("attack:"),
        ),
      ).toBe(false);
      expect(remaining.reload).toHaveLength(1);
    },
  );

  it("keeps a grenade target when only a large enemy's nearer footprint tile is in range", () => {
    const mission = fitted(
      missionWith(openField().build(), [
        unitAt("actor", "infantry", { x: 7, y: 0, z: 2 }),
        blockUnitAt("brute", { x: 1, y: 0, z: 1 }),
      ]),
      { equipment: [GRENADE.id] },
    );
    expect(
      validateEquipmentUse(
        mission,
        "actor",
        GRENADE.id,
        { x: 1, y: 0, z: 1 },
        rules.equipment,
      ).ok,
    ).toBe(false);
    const choices = jevChoicePage(captureJev(mission, "actor", rules)).groups![
      `equipment:${GRENADE.id}`
    ]!;
    expect(choices).toHaveLength(1);
    expect(choices[0]!.command!.payload).toMatchObject({
      tile: { x: 2, y: 0, z: 2 },
    });
    expect(details(choices[0]!)).toMatchObject({ targetId: "brute" });
  });

  it("includes real blast victims and healing benefits without sending footprint tile lists", () => {
    const mission = fitted(
      missionWith(openField().build(), [
        unitAt("actor", "infantry", { x: 1, y: 0, z: 1 }, { hp: 6 }),
        unitAt("enemy", "infantry", { x: 3, y: 0, z: 1 }, { team: "bugs" }),
        unitAt("ally", "infantry", { x: 3, y: 0, z: 2 }, { hp: 4 }),
      ]),
      { equipment: [GRENADE.id, MEDKIT.id] },
    );
    const groups = jevChoicePage(captureJev(mission, "actor", rules)).groups!;
    const grenade = groups[`equipment:${GRENADE.id}`]![0]!;
    const preview = previewEquipmentUse(
      mission,
      "actor",
      GRENADE.id,
      mission.units[1]!.pos,
      rules.equipment,
    );
    if (!preview.ok) throw new Error("Expected a grenade preview");
    expect(details(grenade)).toMatchObject({
      hit_chance_percent: preview.value.hitChance,
      blast: { victims: preview.value.blast!.victims },
    });
    expect(details(grenade).blast).not.toHaveProperty("tiles");
    expect(preview.value.blast!.victims).toContainEqual(
      expect.objectContaining({ id: "ally", team: "tdf" }),
    );
    const selfHeal = groups[`equipment:${MEDKIT.id}`]!.find(
      (candidate) =>
        candidate.command?.type === "tactical:use-equipment" &&
        JSON.stringify(candidate.command.payload.tile) ===
          JSON.stringify(mission.units[0]!.pos),
    )!;
    expect(selfHeal).toBeDefined();
    const healing = previewHealUse(
      mission,
      "actor",
      MEDKIT.id,
      mission.units[0]!.pos,
      rules.equipment,
    );
    if (!healing.ok) throw new Error("Expected a healing preview");
    expect(details(selfHeal)).toMatchObject({
      healing: { beneficiaries: healing.value.beneficiaries },
    });
    expect(details(selfHeal).healing).not.toHaveProperty("tiles");
  });

  it("keeps legal deployment sites that a Manhattan-distance shortcut would prune", () => {
    const item = { ...RADAR_DISH, id: "compact-scanner", range: 1.5 };
    const custom = {
      ...rules,
      equipment: { ...rules.equipment, catalogue: catalogue([item]) },
    };
    const mission = fitted(
      missionWith(openField().build(), [
        unitAt("actor", "infantry", { x: 1, y: 0, z: 1 }),
      ]),
      { equipment: [item.id] },
    );
    const tile = { x: 2, y: 0, z: 2 };
    expect(
      validateEquipmentUse(mission, "actor", item.id, tile, custom.equipment)
        .ok,
    ).toBe(true);
    expect(captureJev(mission, "actor", custom).candidates).toContainEqual(
      expect.objectContaining({
        command: {
          type: "tactical:use-equipment",
          payload: { unitId: "actor", equipmentId: item.id, tile },
        },
      }),
    );
  });

  it("discovers every fitted mech system and executes each through the Jev wrapper", () => {
    const mission = fitted(
      missionWith(openField().build(), [
        { ...unitAt("actor", "mech", { x: 2, y: 0, z: 2 }), heat: 2 },
        unitAt("enemy", "infantry", { x: 4, y: 0, z: 2 }, { team: "bugs" }),
      ]),
      {
        systems: {
          heatCapacity: 10,
          cooling: 1,
          idleHeat: 0,
          movementHeat: 1,
          jumpRange: 3,
          jumpHeight: 2,
          jumpHeat: 1,
          braceAccuracy: 10,
          coolantUses: 1,
          designationAccuracy: 15,
          equipment: ["mech-coolant", "mech-designator"],
        },
      },
    );
    const enabled = {
      ...mission,
      jev: {
        entities: { actor: { enabled: true, entityPrompt: "" } },
        commanders: { tdf: "", bugs: "" },
      },
    };
    const top = jevChoicePage(captureJev(enabled, "actor", rules));
    const handler = createJevActHandler({
      "tactical:mech-action": createMechActionHandler(),
    });
    for (const action of Object.keys(MECH_ACTION_DEFINITIONS)) {
      const candidate = top.groups![action]![0]!;
      expect(candidate, action).toBeDefined();
      const result = handler(
        enabled,
        {
          type: "tactical:jev-act",
          payload: {
            unitId: "actor",
            expectedSeq: enabled.commandSeq,
            choice: candidate.id,
            command: candidate.command,
          },
        },
        ctxWith(riggedRng(true)),
      );
      expect(result.ok, action).toBe(true);
      if (!result.ok) throw new Error("Expected system execution");
      expect(result.value.state.units[0]!.ap).toBe(
        enabled.units[0]!.ap - candidate.apCost!,
      );
    }
  });
});
