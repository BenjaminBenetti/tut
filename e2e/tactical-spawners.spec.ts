import type { Page } from "@playwright/test";

import type { TacticalState } from "../src/tactical/model/tactical-state";
import type { TileCoord } from "../src/mapgen/model/tile-coord";
import type { MoveGraph } from "../src/tactical/service/movement-service";
import {
  buildMoveGraph,
  pathTo,
} from "../src/tactical/service/movement-service";
import { perceivedSpawners } from "../src/tactical/service/vision-service";
import { PassMask } from "../src/mapgen/model/pass-mask";
import {
  nearestSightPosition,
  pathBetween,
} from "../src/tactical/service/map-assessment-service";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/**
 * #484: an egg spawner is a mission's primary objective, so it has to be
 * visible on the map and clickable. Before this it had no mesh at all —
 * the objective tracker listed it and the map showed nothing.
 */
test("egg spawners are drawn on the tactical map and can be targeted by clicking one", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(rows.first()).toBeVisible();

  await rows.first().click();
  await page
    .locator('[data-role="mission-details"] [data-action="plan-deployment"]')
    .click();
  await expect(body).toHaveAttribute("data-screen", "deployment");
  // Scouting is not a promise that a lone rifle squad survives a wave (#911).
  // Use the available starting force; keep the campaign seed and real scout walk.
  for (const option of await page
    .locator(
      '#deploy-mechs input[type="checkbox"]:enabled, #deploy-squads input[type="checkbox"]:enabled',
    )
    .all())
    await option.check();
  await page.locator('[data-action="launch"]').click();
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
  await expect(body).toHaveAttribute("data-tactical-ready", "true");

  // Since #551 the scene draws the player's view, so a spawner nobody has
  // scouted is not on the map at all. That is the point: the objective
  // tracker names it, the map does not give away where it is.
  const objectives = page.locator('[data-role="objective-list"] li');
  expect(await objectives.count()).toBeGreaterThan(0);
  await expect(body).toHaveAttribute("data-tactical-spawners", "0");

  // Scout until one is found: walk the leading unit at the nearest spawner a
  // few tiles a turn. This is the spotting step ADR 0006 §3 asks every
  // spec that used to look straight at the map to gain.
  const sighting = await scoutToASpawner(page);
  expect(sighting, "no spawner found while scouting").toBeTruthy();
  if (!sighting) throw new Error("No scouted spawner");
  const { spawnerId, unitId } = sighting;
  await expect(body).not.toHaveAttribute("data-tactical-spawners", "0");

  // It has a place on screen, which is what makes it clickable at all.
  const at = await page.evaluate(
    (id: string) =>
      (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(id),
    spawnerId ?? "",
  );
  expect(at).toBeTruthy();

  // Scouting spent the scout's action points, and Attack is disabled for
  // a unit that cannot act. End the turn so the side refreshes before
  // the targeting half of this spec — otherwise whether the button is
  // clickable depends on how many moves the walk happened to take.
  await endTurn(page, body);
  await expect(
    page.locator('#action-bar [data-action="attack"]').first(),
  ).toBeEnabled();

  // Selecting the scout, arming attack and clicking the spawner targets it.
  await page.evaluate(
    (id: string) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    unitId,
  );
  await expect(body).toHaveAttribute("data-selected-unit", unitId);
  await page.locator('#action-bar [data-action="attack"]').first().click();
  // Use real view controls to expose and frame the scouted interior before
  // testing the picker. The old direct selection hook also accepted offscreen
  // coordinates; a real mouse click must hit the visible spawner mesh.
  const layerDown = page.locator('[data-action="layer-down"]');
  while (await layerDown.isEnabled()) await layerDown.click();
  const canvas = page.locator("#tactical-viewport canvas");
  await canvas.hover();
  await page.mouse.wheel(0, 360);
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  let point: { x: number; y: number } | undefined;
  await expect
    .poll(async () => {
      point = await page.evaluate(
        (id: string) =>
          (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(id),
        spawnerId,
      );
      return (
        point !== undefined &&
        bounds !== null &&
        point.x > bounds.x + 20 &&
        point.x < bounds.x + bounds.width - 20 &&
        point.y > bounds.y + 20 &&
        point.y < bounds.y + bounds.height - 20
      );
    })
    .toBe(true);
  await expect(body).not.toHaveAttribute("data-selected-spawner", spawnerId);
  await page.mouse.click(point!.x, point!.y);
  await expect(body).toHaveAttribute("data-selected-spawner", spawnerId ?? "");
  // The scout keeps the card; a spawner is aimed at, never selected.
  await expect(body).toHaveAttribute("data-selected-unit", unitId);

  expect(errors).toEqual([]);
});

// ===========================================
// Scouting (#551)
// ===========================================

/** The real saved state supplies movement budgets, command progress and knowledge. */
type SavedMission = TacticalState;

/** Reads the live mission out of the autosave. */
async function savedMission(page: Page): Promise<SavedMission | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: { activeMission?: SavedMission };
    };
    return envelope.state.activeMission ?? null;
  });
}

/**
 * Scouts with real movement until the player's saved knowledge contains a
 * spawner, then waits for that mesh. Drawing follows queued animations, so
 * a zero mesh count must never tell a scout that already found it to walk on.
 */
async function scoutToASpawner(
  page: Page,
): Promise<{ spawnerId: string; unitId: string } | undefined> {
  const body = page.locator("body");
  const progress: unknown[] = [];
  const initial = await savedMission(page);
  expect(initial, "scouting needs an active saved mission").not.toBeNull();
  const graph = buildMoveGraph(initial!.map);
  try {
    for (let attempt = 0; attempt < 14; attempt++) {
      const mission = await savedMission(page);
      const unit = mission?.units.find((u) => u.team === "tdf" && u.hp > 0);
      const spawner = nearestSpawner(mission, unit);
      expect(
        { mission: !!mission, unit: !!unit, spawner: !!spawner },
        `scouting lost its fixture: ${JSON.stringify(progress)}`,
      ).toEqual({ mission: true, unit: true, spawner: true });
      if (!mission || !unit || !spawner) return undefined;
      const known = perceivedSpawners(mission, "tdf")[0];
      if (known) return await waitForScoutedMesh(page, known.id, unit.id);

      const vantage =
        nearestSightPosition(
          mission.map,
          unit.pos,
          spawner.pos,
          unit.passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY,
          mission.templates[unit.templateId].sightRange,
        ) ?? spawner.pos;
      const moved = await stepToward(page, unit, vantage, mission, graph);
      const after = await savedMission(page);
      const scout = after?.units.find((u) => u.id === unit.id);
      progress.push({
        attempt,
        turn: mission.turn,
        commandBefore: mission.commandSeq,
        commandAfter: after?.commandSeq,
        from: unit.pos,
        to: scout?.pos,
        apBefore: unit.ap,
        apAfter: scout?.ap,
        hp: scout?.hp,
        perceived: after
          ? perceivedSpawners(after, "tdf").map((s) => s.id)
          : [],
        drawn: await body.getAttribute("data-tactical-spawners"),
      });
      expect(moved, `scout made no progress: ${JSON.stringify(progress)}`).toBe(
        true,
      );
      const found = after && perceivedSpawners(after, "tdf")[0];
      if (found) return await waitForScoutedMesh(page, found.id, unit.id);
      if ((scout?.ap ?? 0) <= 0) await endTurn(page, body);
    }
    return undefined;
  } finally {
    await test.info().attach("scout-progress", {
      body: JSON.stringify(progress, null, 2),
      contentType: "application/json",
    });
  }
}

/** Waits for the specific known spawner's actual scene object before targeting it. */
async function waitForScoutedMesh(
  page: Page,
  spawnerId: string,
  unitId: string,
) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (id: string) =>
            (globalThis as HookGlobal).__tutTactical__?.spawnerScreenPosition(
              id,
            ),
          spawnerId,
        ),
      {
        message: `scouted ${spawnerId}; waiting for its mesh after queued animations`,
      },
    )
    .toBeTruthy();
  return { spawnerId, unitId };
}

/** The spawner closest to the unit, so the walk is the short one. */
function nearestSpawner(
  mission: SavedMission | null,
  unit: SavedMission["units"][number] | undefined,
) {
  if (!mission || !unit) return undefined;
  return [...mission.spawners].sort(
    (a, b) => manhattan(a.pos, unit.pos) - manhattan(b.pos, unit.pos),
  )[0];
}

/** Ground-plane distance, which is what the move budget is spent on. */
function manhattan(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * Tries reachable tiles in order of how much closer they get, and keeps
 * the first that actually moves the unit. Returns whether it moved.
 */
async function stepToward(
  page: Page,
  unit: SavedMission["units"][number],
  target: { x: number; y: number; z: number },
  mission: SavedMission,
  graph: MoveGraph,
): Promise<boolean> {
  // Follow the walk the game says exists, a few tiles at a time: the
  // vantage may be a storey up a ramp the offsets below would never find.
  const path = pathBetween(
    mission.map,
    unit.pos,
    target,
    unit.passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY,
  );
  if (path !== undefined && path.length > 0) {
    for (const hop of [6, 5, 4, 3, 2, 1]) {
      const tile = path[Math.min(hop, path.length) - 1];
      if (tile === undefined) continue;
      if (await moveAndWait(page, mission, unit, tile, graph)) {
        return true;
      }
    }
  }
  const offsets: { x: number; z: number }[] = [];
  for (const radius of [3, 2, 1]) {
    for (const [dx, dz] of [
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius, radius],
      [radius, -radius],
      [-radius, radius],
      [-radius, -radius],
    ] as const) {
      offsets.push({ x: dx, z: dz });
    }
  }
  const candidates = offsets
    .map((o) => ({ x: unit.pos.x + o.x, y: unit.pos.y, z: unit.pos.z + o.z }))
    .sort((a, b) => manhattan(a, target) - manhattan(b, target));

  for (const tile of candidates.slice(0, 10)) {
    if (await moveAndWait(page, mission, unit, tile, graph)) {
      return true;
    }
  }
  return false;
}

/**
 * Filters refusals using the HUD's movement query, then proves the accepted
 * command reached its exact saved destination and spent AP. A broken invoke
 * fails here with its attempted move, rather than burning the scout's cap.
 */
async function moveAndWait(
  page: Page,
  mission: SavedMission,
  unit: SavedMission["units"][number],
  tile: TileCoord,
  graph: MoveGraph,
): Promise<boolean> {
  const path = pathTo(mission, unit.id, tile, graph);
  if (!path?.length) return false;
  await page.evaluate(
    (args: { id: string; tile: TileCoord }) => {
      (globalThis as HookGlobal).__tutTactical__?.selectUnit(args.id);
      (globalThis as HookGlobal).__tutTactical__?.invokeTile(args.tile);
    },
    { id: unit.id, tile },
  );
  await expect
    .poll(
      async () => {
        const after = await savedMission(page);
        const scout = after?.units.find((u) => u.id === unit.id);
        return {
          turn: after?.turn,
          phase: after?.phase,
          command: after?.commandSeq,
          pos: scout?.pos,
          spentAp: (scout?.ap ?? unit.ap) < unit.ap,
        };
      },
      {
        message: `scout move refused or stalled: ${JSON.stringify({
          unit: unit.id,
          from: unit.pos,
          to: tile,
          turn: mission.turn,
          ap: unit.ap,
          command: mission.commandSeq,
        })}`,
      },
    )
    .toEqual({
      turn: mission.turn,
      phase: "player",
      command: mission.commandSeq + 1,
      pos: tile,
      spentAp: true,
    });
  // The renderer consumes an animation queue after the synchronous save. Let
  // this visible move finish before adding another command to that queue.
  await expect
    .poll(
      () =>
        page.evaluate(
          (args: { id: string; tile: TileCoord }) => {
            const hooks = (globalThis as HookGlobal).__tutTactical__;
            const unit = hooks?.unitScreenPosition(args.id);
            const destination = hooks?.tileScreenPosition(args.tile);
            return unit && destination
              ? Math.hypot(unit.x - destination.x, unit.y - destination.y)
              : Infinity;
          },
          { id: unit.id, tile },
        ),
      {
        message: `saved scout move reached ${JSON.stringify(tile)}; waiting for its rendered feet`,
      },
    )
    .toBeLessThan(0.1);
  return true;
}

/** Ends the turn and proves the saved player turn advanced, not just that a HUD exists. */
async function endTurn(page: Page, body: ReturnType<Page["locator"]>) {
  const before = await savedMission(page);
  expect(before, "end turn needs an active mission").not.toBeNull();
  await page.locator('#action-bar [data-action="end-turn"]').click();
  await expect
    .poll(
      async () => {
        const after = await savedMission(page);
        return {
          turn: after?.turn,
          phase: after?.phase,
          command: after?.commandSeq,
        };
      },
      {
        message: `player turn ${before!.turn} did not advance in the saved mission`,
      },
    )
    .toEqual({
      turn: before!.turn + 1,
      phase: "player",
      command: before!.commandSeq + 1,
    });
  await expect(body).toHaveAttribute("data-screen", "tactical");
}
