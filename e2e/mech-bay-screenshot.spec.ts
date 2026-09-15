import { expect, test } from "@playwright/test";

/**
 * Captures the rebuilt mech bay for the Director (#1145): the mech on
 * the stage with a badge on every part, the palette to its left, and
 * the sheet on the right showing the deltas for a rested-on part.
 *
 * The capture asserts as well as shoots. A `CAPTURE=1` spec is never run
 * by CI, so a broken one quietly recommits a stale frame.
 */
test("captures the mech bay with a hovered part's deltas showing", async ({
  page,
}) => {
  // A capture, not a gate. Its output is files in docs/design:
  //   CAPTURE=1 pnpm exec playwright test e2e/mech-bay-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the mech bay screenshots",
  );
  test.setTimeout(120_000);
  await page.setViewportSize({
    width: Number(process.env.VW ?? 1280),
    height: Number(process.env.VH ?? 720),
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  await page.locator('#top-bar [data-action="roster"]').click();
  await expect(body).toHaveAttribute("data-screen", "roster");
  await page.locator('[data-action="mech-bay"]').click();
  await expect(body).toHaveAttribute("data-screen", "mech-bay");

  // The host has drawn: the badges are anchored to the parts, not
  // stacked in their fallback column.
  await expect(page.locator('[data-role="slot-anchors"]')).toHaveClass(
    /is-anchored/,
  );
  const pictures = page.locator('#part-palette [data-role="part-thumb"]');
  await expect(pictures.first()).toBeVisible();
  await expect
    .poll(async () =>
      pictures.evaluateAll((imgs) =>
        imgs.every((img) => (img as HTMLImageElement).complete),
      ),
    )
    .toBe(true);

  await page.screenshot({
    path: process.env.BAY_PNG ?? "docs/design/ui-mech-bay.png",
  });

  // The reported case: a part rested on shows what it would change.
  await page
    .locator('#part-palette [data-part-id="utility-armor-plating"]')
    .hover();
  await expect(
    page.locator('#stat-sheet [data-role="delta"][data-field="combat-armor"]'),
  ).toBeVisible();
  await page.screenshot({
    path: process.env.HOVER_PNG ?? "docs/design/ui-mech-bay-hover-delta.png",
  });

  // A popover with the saved templates.
  await page.locator('[data-action="toggle-loadouts"]').click();
  await expect(page.locator('[data-role="loadout-popover"]')).toBeVisible();
  await page.screenshot({
    path: process.env.POPOVER_PNG ?? "docs/design/ui-mech-bay-loadouts.png",
  });
});
