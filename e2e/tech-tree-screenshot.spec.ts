/// <reference types="node" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { GameState } from "../src/save/model/game-state";

/** The autosave slot the pool is granted through. */
const SAVE_KEY = "tut:save:autosave";

/** Enough for one tier 2 node with change, so every status shows at once. */
const POOL = 30;

/**
 * Starts a campaign on the fixed seed and grants it a tech point pool
 * through the autosave, then resumes it, the way the progression spec
 * funds its research (#1171).
 */
async function fundedCampaign(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const envelope = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!) as { state: GameState },
    SAVE_KEY,
  );
  const funded: GameState = {
    ...envelope.state,
    economy: { ...envelope.state.economy, techPoints: POOL },
  };
  await page.evaluate(
    ({ key, saved }) => {
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: SAVE_KEY, saved: { ...envelope, state: funded } },
  );
  await page.reload();
  await page.locator('[data-action="continue"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
}

/**
 * The #1171 frames: the top bar with tech points beside credits, the
 * tech tree with every card status on screen at once (one node bought,
 * the rest of tier 2 split by what the remaining pool covers, tier 3
 * locked behind it), and the mech bay palette with locked parts.
 */
test("tech points, the tech tree and locked parts (#1171)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fundedCampaign(page);

  const topBar = page.locator("#top-bar");
  await expect(topBar.locator('[data-field="techPoints"]')).toHaveText(
    `${POOL} TP`,
  );
  await topBar.screenshot({ path: "docs/design/top-bar-tech-points.png" });

  await topBar.locator('[data-action="tech-tree"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "tech-tree",
  );
  const jumpJets = page.locator('[data-node="tech.jump-jets"]');
  await expect(jumpJets).toHaveAttribute("data-status", "available");
  await jumpJets.locator('[data-action="unlock"]').click();
  await expect(jumpJets).toHaveAttribute("data-status", "unlocked");
  await expect(
    page.locator('#tech-tree-bar [data-field="techPoints"]'),
  ).toHaveText("12 TP");
  await expect(
    page.locator('[data-node][data-status="unaffordable"]').first(),
  ).toBeVisible();
  await expect(page.locator('[data-node="tech.sprint-frame"]')).toHaveAttribute(
    "data-status",
    "locked",
  );
  await page.screenshot({ path: "docs/design/tech-tree.png", fullPage: true });

  await page.locator('#tech-tree-bar [data-action="mech-bay"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-screen", "mech-bay");
  const palette = page.locator("#part-palette");
  await expect(palette.locator('[data-part-id="legs-jumper"]')).toHaveAttribute(
    "data-locked",
    "false",
  );
  await expect(palette.locator('[data-part-id="legs-sprint"]')).toHaveAttribute(
    "data-locked",
    "true",
  );
  await page.screenshot({
    path: "docs/design/mech-bay-locked-parts.png",
    fullPage: true,
  });
});
