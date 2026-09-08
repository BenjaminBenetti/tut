import { expect, test } from "@playwright/test";

/**
 * Captures the mech bay's part thumbnails for Art and the Director
 * (#594).
 *
 * The reported case is a **utility** row, which has no model and so no
 * picture: its cell used to be `visibility: hidden`, leaving a gap where
 * every other row has a bordered box, which reads as a picture that
 * failed to load. The **control** in the same frame is a normal part row
 * — the chassis, which has a real thumbnail — and it must render exactly
 * as it did before.
 *
 * The capture asserts as well as shoots. A `CAPTURE=1` spec is never run
 * by CI, so a broken one quietly recommits a stale frame.
 */
test("captures the part thumbnail rows, utility and normal", async ({
  page,
}) => {
  // A capture, not a gate. Its output is files in docs/design:
  //   CAPTURE=1 pnpm exec playwright test e2e/mech-bay-thumbnail-screenshot.spec.ts
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the mech bay thumbnail screenshots",
  );
  test.setTimeout(120_000);
  await page.setViewportSize({
    width: Number(process.env.VW ?? 1280),
    height: 720,
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

  // Every thumbnail cell has settled: the normal rows have their picture
  // loaded, so the frame is not shot mid-load.
  const pictures = page.locator('[data-role="part-thumb"]:not(.is-empty)');
  await expect(pictures.first()).toBeVisible();
  await expect
    .poll(async () =>
      pictures.evaluateAll((imgs) =>
        imgs.every((img) => (img as HTMLImageElement).complete),
      ),
    )
    .toBe(true);

  // The reported case: a utility says it has no picture rather than
  // showing nothing at all.
  const utilityGlyph = page.locator(
    '[data-role="part-thumb-none"][data-field="utility-0"]',
  );
  await expect(utilityGlyph).toBeVisible();

  // The control: a normal part still shows its picture, and its
  // no-picture glyph stays hidden.
  const chassis = page.locator(
    '[data-role="part-thumb"][data-field="chassis"]',
  );
  await expect(chassis).toHaveAttribute("src", /assets\/ui\/thumbs\//);
  await expect(
    page.locator('[data-role="part-thumb-none"][data-field="chassis"]'),
  ).toBeHidden();

  const editor = page.locator("#loadout-editor");
  await editor.screenshot({
    path: process.env.EDITOR_PNG ?? "docs/design/ui-mech-bay-thumbnails.png",
  });
  await page.screenshot({
    path: process.env.PAGE_PNG ?? "docs/design/ui-mech-bay-thumbnails-full.png",
  });
});
