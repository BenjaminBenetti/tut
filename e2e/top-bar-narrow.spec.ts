import { expect, test } from "@playwright/test";

/**
 * QA's repro for #291: at 800×600 the overworld top bar must stay one
 * line with its buttons and the outcome badge inside it. The campaign is
 * ended quickly with the debug threat escalation so the badge shows.
 */
test("the overworld top bar stays one line at 800 px with the outcome badge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/?threatEscalation=100");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const bar = page.locator("#top-bar");
  const barBox = await bar.boundingBox();
  if (!barBox) throw new Error("no top bar");
  expect(barBox.height).toBeLessThanOrEqual(44);

  // Run the campaign to defeat; the overworld hands over to the game-over
  // screen a microtask later, so read the badge from the bar just before.
  const advance = page.locator('[data-action="advance-day"]');
  let sawBadge = false;
  for (let day = 0; day < 14; day++) {
    if ((await body.getAttribute("data-screen")) !== "overworld") {
      break;
    }
    const outcome = page.locator('#top-bar [data-field="outcome"]');
    if (await outcome.isVisible()) {
      sawBadge = true;
      const badgeBox = await outcome.boundingBox();
      const nowBar = await bar.boundingBox();
      if (!badgeBox || !nowBar) throw new Error("no badge or bar box");
      expect(nowBar.height).toBeLessThanOrEqual(44);
      expect(badgeBox.y).toBeGreaterThanOrEqual(nowBar.y - 1);
      expect(badgeBox.y + badgeBox.height).toBeLessThanOrEqual(
        nowBar.y + nowBar.height + 1,
      );
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(
        nowBar.x + nowBar.width + 1,
      );
      break;
    }
    // An event blocks Advance Day until answered (#77); take the first option.
    const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }

  for (const action of ["main-menu", "advance-day", "roster"]) {
    const box = await page
      .locator(`#top-bar [data-action="${action}"]`)
      .boundingBox();
    if (box) {
      expect(box.height).toBeLessThanOrEqual(40);
      expect(box.x + box.width).toBeLessThanOrEqual(800 + 1);
    }
  }
  expect(
    sawBadge || (await body.getAttribute("data-screen")) === "game-over",
  ).toBe(true);
  expect(errors).toEqual([]);
});
