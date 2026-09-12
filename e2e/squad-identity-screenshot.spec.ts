/// <reference types="node" />
import { readFileSync, rmSync } from "node:fs";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";
import { drawnFrame, tacticalModelsReady } from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** The autosave the deployment is read through. */
const SAVE_KEY = "tut:save:autosave";

/** Where the frames go. */
const FRAMES = "docs/design/squad-identity";

/** The template of every deployed unit, so the fixture can be checked. */
async function templates(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    const save = JSON.parse(raw ?? "{}") as {
      state: {
        activeMission?: {
          units: { id: string; team: string; templateId: string }[];
          templates: Record<string, { name: string } | undefined>;
        };
      };
    };
    const mission = save.state.activeMission;
    return (mission?.units ?? [])
      .filter((unit) => unit.team === "tdf")
      .map(
        (unit) =>
          `${unit.id}|${unit.templateId}|${mission?.templates[unit.templateId]?.name ?? "?"}`,
      );
  }, SAVE_KEY);
}

/** The rendered event-log rows. */
async function rows(page: Page): Promise<string[]> {
  return page.locator('[data-role="event-log-list"] li').allTextContents();
}

/**
 * The #1040 evidence: two squads of one template, acting separately.
 *
 * `LOG_FRAME=before` captures the same turn against the baseline tree,
 * where both squads are named from their template and the log collapses
 * their two actions into one row.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/squad-identity-screenshot.spec.ts
 */
test("captures two same-template squads acting separately", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the squad identity frames",
  );
  const baseline = process.env.LOG_FRAME === "before";
  await launchMission(page, "4242");
  await tacticalModelsReady(page);
  await settleForShot(page);

  // The fixture, examined: the frame means nothing unless two deployed
  // squads really do share a template.
  const deployed = await templates(page);
  const squadNames = deployed
    .filter((entry) => entry.includes("|squad:"))
    .map((entry) => entry.split("|")[2] ?? "");
  expect(
    squadNames.length,
    `the seed must deploy two squads; got ${deployed.join(", ")}`,
  ).toBeGreaterThanOrEqual(2);
  // The collision is in the *name*, not the template id: `unit-factory`
  // gives each squad its own template (`squad:squad-1`, `squad:squad-2`)
  // and then names both after the squad **type**, so two rosters show
  // as one identity. I had assumed a shared template id and was wrong.
  expect(
    new Set(squadNames).size,
    `the two squads must display the same name; got ${squadNames.join(", ")}`,
  ).toBe(1);

  // Both squads go on overwatch: one action each, naming the actor, and
  // no target to complicate the sentence.
  for (const unitId of ["unit-2", "unit-3"]) {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unitId,
    );
    await page.keyboard.press("o");
    await page.waitForTimeout(250);
  }
  await drawnFrame(page);

  const shown = await rows(page);
  if (!baseline) {
    // Two rows, two names, no collapse.
    expect(shown.join(" | ")).toContain("Alpha");
    expect(shown.join(" | ")).toContain("Bravo");
    expect(shown.join(" | ")).not.toContain("×2");
  }

  const path = `${FRAMES}-${baseline ? "before" : "after"}.png`;
  await page.locator("#event-log").screenshot({ path });

  // The log is DOM: it must reproduce before either frame is evidence.
  const again = `${FRAMES}-reproducibility-check.png`;
  await page.locator("#event-log").screenshot({ path: again });
  const stable = readFileSync(path).equals(readFileSync(again));
  rmSync(again, { force: true });
  expect(stable, "the event log must render identically twice").toBe(true);
});
