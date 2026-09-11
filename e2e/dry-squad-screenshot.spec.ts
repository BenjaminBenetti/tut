import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { PassMask } from "../src/mapgen/model/pass-mask";
import type { TacticalMap } from "../src/mapgen/model/tactical-map";
import { UNIT_TUNING } from "../src/tactical/data/unit-tuning";
import { nearestSightPosition } from "../src/tactical/service/map-assessment-service";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";
import { openUnitWheel, wheelItem } from "./action-wheel.helper";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Seed whose first mission puts a spawner within reach of the deploy zone. */
const SEED = "f2";

/** Turns to allow for closing on the objective and emptying the magazine. */
const MAX_TURNS = 20;

/** Attack attempts per turn: one per action point, plus slack for a refusal. */
const ATTEMPTS_PER_TURN = 3;

/** How long the autosave needs to catch up with a move or a shot. */
const SETTLE_MS = 250;

/** Longer than a notice floater dwells, so none is left on the frame. */
const NOTICE_DWELL_MS = 3_500;

/** Driving a squad dry costs far more than the suite's 30 s default. */
const TEST_TIMEOUT_MS = 240_000;

/** Just enough of the live mission to drive it and read the magazine. */
interface MissionSnapshot {
  readonly map: TacticalMap;
  readonly units: readonly {
    readonly id: string;
    readonly team: string;
    readonly kind?: string;
    readonly hp: number;
    readonly templateId: string;
    readonly charges?: Record<string, number>;
    readonly pos: { x: number; y: number; z: number };
  }[];
  readonly templates: Record<
    string,
    { readonly weapons: readonly { readonly id: string }[] }
  >;
  readonly spawners: readonly {
    readonly id: string;
    readonly hp: number;
    readonly destroyed?: boolean;
    readonly pos: { x: number; y: number; z: number };
  }[];
}

/** Reads the live mission out of the autosave. */
async function snapshot(page: Page): Promise<MissionSnapshot | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) {
      return null;
    }
    const mission = (
      JSON.parse(raw) as { state: { activeMission?: MissionSnapshot } }
    ).state.activeMission;
    return mission ?? null;
  });
}

/** Manhattan distance, the metric the combat rules and the HUD both use. */
function manhattan(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** Rounds left in a unit's first weapon, or undefined when it has no pool. */
function ammoOf(state: MissionSnapshot, unitId: string): number | undefined {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  const weapon = unit && state.templates[unit.templateId]?.weapons[0];
  if (!unit || !weapon) {
    return undefined;
  }
  return unit.charges?.[weapon.id];
}

/**
 * Captures a rifle squad that has fired its magazine dry (#1062).
 *
 * The Director asked for one squad frame carrying three things, after QA
 * reproduced them together on shipped v0.2.16: the bar marking Attack
 * unavailable at `ammo 0`, the card not advertising a shot the unit
 * cannot take, and the refusal in the card's own register — `ammo`
 * and `reload`, with no mention of venting, which a squad cannot do.
 *
 * It plays the squad dry for real rather than editing state into place:
 * the whole finding is that three surfaces disagreed about a unit the
 * rules considered spent, so the unit here has to be spent by the
 * rules.
 */
test("captures a squad with an empty magazine, and the three things that follow", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the dry-squad screenshot",
  );
  test.setTimeout(TEST_TIMEOUT_MS);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, SEED);
  await settleForShot(page);

  const start = await snapshot(page);
  const squad = start?.units.find(
    (unit) => unit.team === "tdf" && unit.kind === "squad",
  );
  expect(squad, "the deployed force includes a rifle squad").toBeDefined();
  const squadId = squad?.id ?? "";
  const target = [...(start?.spawners ?? [])].sort(
    (a, b) => manhattan(a.pos, squad!.pos) - manhattan(b.pos, squad!.pos),
  )[0];
  expect(target, "the mission has an egg spawner to shoot at").toBeDefined();
  const spawnerId = target?.id ?? "";
  expect(
    ammoOf(start!, squadId),
    "the squad starts with a magazine to empty",
  ).toBeGreaterThan(0);

  /** Arms Attack on the squad and targets the spawner. */
  const aim = async (): Promise<boolean> => {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      squadId,
    );
    await page.keyboard.press("f");
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectSpawner(id),
      spawnerId,
    );
    await page.waitForTimeout(SETTLE_MS);
    return page.evaluate(() => {
      const fire = document.querySelector(
        '#hit-preview [data-action="confirm-attack"]',
      );
      return fire !== null && !(fire as HTMLButtonElement).disabled;
    });
  };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_TURN; attempt++) {
      const state = await snapshot(page);
      if (state === null || (ammoOf(state, squadId) ?? 1) === 0) {
        break;
      }
      if (await aim()) {
        await page
          .locator('#hit-preview [data-action="confirm-attack"]')
          .click();
        await page.waitForTimeout(SETTLE_MS);
        continue;
      }
      // Out of range or no sight line: close the ground with a right
      // click, which is how a player moves since #520.
      const self = state.units.find((unit) => unit.id === squadId);
      const nest = state.spawners.find((s) => s.id === spawnerId);
      if (self === undefined || nest === undefined || self.hp <= 0) {
        break;
      }
      const firing =
        nearestSightPosition(
          state.map,
          self.pos,
          nest.pos,
          PassMask.INFANTRY,
          UNIT_TUNING.infantry.weapon.range,
        ) ?? nest.pos;
      const stepX = Math.sign(firing.x - self.pos.x);
      const stepZ = Math.sign(firing.z - self.pos.z);
      const goals = [
        firing,
        { x: self.pos.x + stepX * 4, y: self.pos.y, z: self.pos.z },
        { x: self.pos.x, y: self.pos.y, z: self.pos.z + stepZ * 4 },
        { x: self.pos.x + stepX * 2, y: self.pos.y, z: self.pos.z + stepZ * 2 },
        { x: self.pos.x + stepX, y: self.pos.y, z: self.pos.z },
        { x: self.pos.x, y: self.pos.y, z: self.pos.z + stepZ },
      ].filter((goal) => goal.x !== self.pos.x || goal.z !== self.pos.z);
      await page.evaluate(
        (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
        squadId,
      );
      for (const goal of goals) {
        await page.evaluate(
          (tile) =>
            (globalThis as HookGlobal).__tutTactical__?.invokeTile(tile),
          goal,
        );
        await page.waitForTimeout(SETTLE_MS);
        const moved = await snapshot(page);
        const nowAt = moved?.units.find((unit) => unit.id === squadId);
        if (nowAt !== undefined && manhattan(nowAt.pos, self.pos) > 0) {
          break;
        }
      }
    }
    const dry = await snapshot(page);
    if (dry !== null && (ammoOf(dry, squadId) ?? 1) === 0) {
      break;
    }
    const endTurn = page.locator('#turn-bar [data-action="end-turn"]');
    if (await endTurn.isEnabled()) {
      await endTurn.click();
      await page.waitForTimeout(SETTLE_MS);
    }
  }

  // The precondition, asserted rather than assumed: without it this
  // would photograph a loaded squad and call it a dry one.
  const dry = await snapshot(page);
  expect(
    ammoOf(dry!, squadId),
    "the squad fired its magazine dry within the turn budget",
  ).toBe(0);

  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    squadId,
  );
  await page.keyboard.press("Escape");
  // Let the last notice expire before the frame. A chip dwells a couple
  // of seconds, so a screenshot taken straight after the drive shows a
  // refusal from some earlier moment — in the first run of this, one
  // reading "has no action points left" over a card reading `AP 1 / 2`,
  // contradicting the very panel the frame exists to show.
  await page.waitForTimeout(NOTICE_DWELL_MS);
  await drawnFrame(page);

  // 1. The card does not advertise a shot the unit has nothing for.
  await expect(page.locator('[data-field="attacks"]')).toHaveText("0");
  // 2. The register is the card's: `ammo`, not `charges` or `heat`.
  await expect(page.locator('[data-field="weapon"]').first()).toContainText(
    "ammo 0",
  );
  // 3. The wheel names the refill in that register too (#1112).
  await openUnitWheel(page, squadId);
  await expect(
    wheelItem(page, "reload").locator(".tut-radial__label"),
  ).toHaveText("Reload");

  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-dry-squad.png",
  });
  await page.keyboard.press("Escape");

  // ...and asking for Attack says why, in that same register.
  await page.locator("#tactical-viewport canvas").hover();
  await page.keyboard.press("f");
  await drawnFrame(page);
  const status = page.locator('[data-role="status"]');
  await expect(status).toContainText("out of ammo");
  await expect(status).not.toContainText("vent");
  // Named as the card names it — the roster name, not the template.
  // QA rejected the first head of this frame because the status said
  // `Rifle Squad` beside a card reading `ALPHA` (#1067).
  const cardName = await page
    .locator('#unit-card [data-field="unit-name"]')
    .textContent();
  expect(cardName, "the card names the selected unit").toBeTruthy();
  await expect(status).toHaveText(
    `${String(cardName)} is out of ammo; reload first`,
  );
  await page.locator("#tactical-viewport").screenshot({
    path: "docs/design/ui-dry-squad-refusal.png",
  });
});
