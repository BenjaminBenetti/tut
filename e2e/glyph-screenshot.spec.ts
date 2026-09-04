import { expect, test } from "@playwright/test";

import { launchMission, settleForShot } from "./mission-capture.helper";

/** Turns to hand over before giving up on a bug walking into view. */
const TURNS_FOR_A_TARGET = 10;

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
  // Handing turns over to reach a target costs far more than the
  // suite's default, and it is still bounded by TURNS_FOR_A_TARGET.
  test.setTimeout(180_000);

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
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  // The top bar's glyphs live here and nowhere the frames below reach.
  expect(await unresolved(), "every overworld glyph resolves").toEqual([]);

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

  // The chips only exist once something is targeted *and in range*. On
  // seed 4242 the board is empty until turn 4, the squad has eyes on a
  // bug by turn 5, and they are in contact by turn 6 — so aim every
  // turn and stop when the preview offers a shot rather than a refusal.
  // A refused preview leaves the chip row empty, which has no box at
  // all, so "visible" is the honest test for "there is a shot here".
  const endTurn = page.locator('#action-bar [data-action="end-turn"]');
  const chips = page.locator('[data-field="preview-terrain"]');
  let aimed = false;
  for (let turn = 0; turn < TURNS_FOR_A_TARGET && !aimed; turn++) {
    const mark = await page.evaluate(() => {
      const raw = localStorage.getItem("tut:save:autosave");
      if (raw === null) return null;
      const mission = (
        JSON.parse(raw) as {
          state: {
            activeMission?: { vision: { tdf: { spotted: string[] } } };
          };
        }
      ).state.activeMission;
      return mission?.vision.tdf.spotted[0] ?? null;
    });
    if (mark !== null) {
      // Aiming is three steps, not one — pick the shooter, arm Attack,
      // pick the mark. Selecting the bug alone only inspects it, which
      // is why an earlier version of this walk produced no preview.
      await page.evaluate(
        (id) =>
          (
            globalThis as { __tutTactical__?: { selectUnit(id: string): void } }
          ).__tutTactical__?.selectUnit(id),
        mineId,
      );
      await page.keyboard.press("2");
      await page.evaluate(
        (id) =>
          (
            globalThis as { __tutTactical__?: { selectUnit(id: string): void } }
          ).__tutTactical__?.selectUnit(id),
        mark,
      );
      aimed = await chips.isVisible();
      if (aimed) {
        break;
      }
    }
    await expect(endTurn).toBeEnabled();
    await endTurn.click();
    await expect(
      page.locator('#turn-banner [data-field="phase"]'),
    ).toContainText(/player/i, { timeout: 30000 });
  }
  // Required, not conditional: a capture behind an `if` that quietly
  // does nothing is how a committed frame goes stale unnoticed (#650).
  expect(aimed, "a bug came into range to aim at").toBe(true);
  await settleForShot(page);
  expect(await unresolved(), "every hit-preview glyph resolves").toEqual([]);
  await page.screenshot({ path: "docs/design/ui-glyphs-hit-preview.png" });
});
