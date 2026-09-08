import { expect, test } from "@playwright/test";

import { launchMission, settleForShot } from "./mission-capture.helper";

/**
 * Captures the objective tracker for the Director to judge (#949).
 *
 * The reported case is the objective label, which used to read
 * "Destroy spawner spawner-1" — an internal id in text the player looks
 * at for the whole mission. The **control** in the same frame is the
 * turn banner's mission name: #753 fixed that one to name the city
 * rather than the mission id, it already reads correctly, and it must
 * still read correctly here.
 *
 * The capture asserts as well as shoots, because a `CAPTURE=1` spec is
 * never run by CI and a broken one quietly recommits a stale frame.
 */
test("captures the objective tracker and the banner beside it", async ({
  page,
}) => {
  // A capture, not a gate. Its output is files in docs/design, so it
  // stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/objective-label-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the objective label screenshots",
  );
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await launchMission(page, "4242");
  await settleForShot(page);

  const rows = page.locator("[data-objective-id]");
  await expect(rows.first()).toBeVisible();

  // The reported case: no raw id in anything the player reads.
  for (const text of await rows.allTextContents()) {
    expect(
      text,
      "an objective label still carries a raw spawner id",
    ).not.toMatch(/spawner-\d/);
  }
  // Two objectives still tell each other apart from the label alone.
  const labels = await rows.evaluateAll((els) =>
    els.map(
      (el) =>
        [...el.querySelectorAll("span")]
          .map((span) => span.textContent ?? "")
          .find((t) => t.startsWith("Destro")) ?? "",
    ),
  );
  expect(new Set(labels).size, "objective labels are not distinct").toBe(
    labels.length,
  );

  // The control: the banner names the city, as #753 made it do.
  const missionName = page.locator('[data-field="mission-name"]');
  await expect(missionName).not.toHaveText(/mission-\d/);
  await expect(missionName).not.toBeEmpty();

  const rail = page.locator(".tut-hud__side");
  await rail.screenshot({ path: "docs/design/ui-objective-tracker.png" });
  await page.screenshot({ path: "docs/design/ui-objective-tracker-hud.png" });
});
