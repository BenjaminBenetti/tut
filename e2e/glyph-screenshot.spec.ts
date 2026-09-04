import { expect, test } from "@playwright/test";

import { launchMission, settleForShot } from "./mission-capture.helper";

/** Glyphs the roster screen must show once it has the starter force (#595). */
const ROSTER_ICONS = ["squad", "mech"];

/**
 * Captures the screens #595 glyphs, for the Art Director to judge.
 *
 * Not an assertion of how they look — that is a human call. What it does
 * assert is the one thing no DOM test notices: **every mask resolves.**
 * An icon whose SVG is missing, or whose `--icon` was double-wrapped in
 * `url(…)`, still produces a `.tut-icon` element with the right
 * `data-icon`; it just paints as a solid block. So this reads the
 * computed style and fails on a glyph whose mask image is `none`.
 */
test("captures the glyphed screens for review", async ({ page }) => {
  // A capture, not a gate. Its output is files in docs/design, so it
  // stays out of every CI run:
  //   CAPTURE=1 pnpm exec playwright test e2e/glyph-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the glyph screenshots",
  );

  /** Every glyph on the page whose mask failed to load. */
  const unresolved = async (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".tut-icon")]
        .filter((el) => {
          const mask = getComputedStyle(el).maskImage;
          return mask === "" || mask === "none";
        })
        .map((el) => el.dataset.icon ?? "(unnamed)"),
    );

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");

  // Roster: one glyph per row, by kind.
  await page.locator('[data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  const kinds = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#ui .tut-icon")]
      .map((el) => el.dataset.icon ?? "")
      .filter((id) => id !== ""),
  );
  for (const icon of ROSTER_ICONS) {
    expect(kinds, `roster shows a ${icon} glyph`).toContain(icon);
  }
  expect(await unresolved(), "every roster glyph resolves").toEqual([]);
  await page.screenshot({ path: "docs/design/ui-glyphs-roster.png" });

  // Hit preview: the chips only appear with a target picked, so play into
  // a mission and aim at something.
  await page.goto("/");
  await launchMission(page, "4242");
  const mineId = await page.evaluate(() => {
    const raw = localStorage.getItem("tut:save:autosave");
    if (raw === null) return null;
    const mission = (
      JSON.parse(raw) as {
        state: { activeMission?: { units: { id: string; team: string }[] } };
      }
    ).state.activeMission;
    return mission?.units.find((u) => u.team === "tdf")?.id ?? null;
  });
  expect(mineId, "the deployed force has a unit to select").not.toBeNull();
  if (mineId === null) return;
  await page.evaluate(
    (id) =>
      (
        globalThis as { __tutTactical__?: { selectUnit(id: string): void } }
      ).__tutTactical__?.selectUnit(id),
    mineId,
  );
  await settleForShot(page);
  expect(await unresolved(), "every tactical glyph resolves").toEqual([]);
  await page.screenshot({ path: "docs/design/ui-glyphs-tactical.png" });
});
