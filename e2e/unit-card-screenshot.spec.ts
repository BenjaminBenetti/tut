import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A mech carries an arm gun and a back gun, so its card lists two (#532). */
const EXPECTED_WEAPONS = 2;

/**
 * Captures the unit card with a mech selected, so the two weapons it
 * carries can be judged on the screen rather than in a DOM assertion
 * (#641).
 *
 * Not an assertion of how it looks — that is a human call. What it does
 * assert is that the shot is of a real two-weapon card, so a frame that
 * still runs the weapons together is a styling bug rather than a mech
 * that happened to be carrying one gun.
 */
test("captures a two-weapon unit card for review", async ({ page }) => {
  // A capture, not a gate. Its output is a file in docs/design, so it
  // stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/unit-card-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the unit-card screenshot",
  );
  await launchMission(page, "4242");

  // The mech is the unit that carries more than one weapon.
  const mechId = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as {
      state: {
        activeMission?: { units: { id: string; kind?: string }[] };
      };
    };
    const units = envelope.state.activeMission?.units ?? [];
    return units.find((u) => u.kind === "mech")?.id ?? null;
  });
  expect(mechId, "the deployed force includes a mech").not.toBeNull();
  if (mechId === null) return;
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
    mechId,
  );

  // One block per weapon, each titled — the shape #641 put there. A
  // run-on string renders as one block, so this is the check that makes
  // the frame evidence of anything.
  const card = page.locator('[data-field="weapon"]');
  await expect(card.locator(".tut-card__entry")).toHaveCount(EXPECTED_WEAPONS);
  await expect(card.locator(".tut-card__entry-name")).toHaveCount(
    EXPECTED_WEAPONS,
  );

  await settleForShot(page);
  await page.screenshot({ path: "docs/design/tactical-unit-card.png" });
});
