/// <reference types="node" />
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { GameState } from "../src/save/model/game-state";
import { drawnFrame } from "./capture-frame.helper";

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
 * tech tree as a web with every status on screen at once (one node
 * bought, the rest of tier 2 split by what the remaining pool covers,
 * tier 3 locked behind it) and the selected node in the detail panel,
 * and the mech bay palette with locked parts.
 *
 * The web is three: a node is picked by clicking its pedestal where
 * the dev hooks say it is on screen, and Unlock lives in the detail
 * panel. The Free TP button is the dev build's, and the dev server the
 * suite runs against is one.
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
  const stage = page.locator('[data-role="tech-graph"]');
  await expect(stage).toHaveAttribute("data-tech-models-ready", "true");
  const detail = page.locator("#tech-tree-detail");
  await expect(detail.locator('[data-role="empty"]')).toBeVisible();

  // Click the pedestal itself, not the label: the pick is the graph's.
  const jumpJets = page.locator('[data-node="tech.jump-jets"]');
  await expect(jumpJets).toHaveAttribute("data-status", "available");
  const stageBox = await stage.boundingBox();
  const at = await page.evaluate(
    () => window.__tutTech__?.nodeScreenPosition("tech.jump-jets") ?? null,
  );
  expect(stageBox).not.toBeNull();
  expect(at).not.toBeNull();
  if (!stageBox || !at) return;
  await page.mouse.click(stageBox.x + at.x, stageBox.y + at.y);
  await expect(detail).toHaveAttribute("data-selected-node", "tech.jump-jets");
  await expect(detail.locator('[data-field="name"]')).toHaveText("Jump Jets");
  await expect(jumpJets).toHaveAttribute("data-selected", "true");

  await detail.locator('[data-action="unlock"]').click();
  await expect(jumpJets).toHaveAttribute("data-status", "unlocked");
  await expect(detail).toHaveAttribute("data-status", "unlocked");
  await expect(
    page.locator('#tech-tree-bar [data-field="techPoints"]'),
  ).toHaveText("12 TP");
  await expect(
    page.locator('[data-node][data-status="unaffordable"]').first(),
  ).toBeAttached();
  await expect(page.locator('[data-node="tech.sprint-frame"]')).toHaveAttribute(
    "data-status",
    "locked",
  );
  // Two frames: one for the unlock to retint the web, one for the labels to follow.
  await drawnFrame(page);
  await page.screenshot({ path: "docs/design/tech-tree.png" });

  // A label click selects too, and the reason names the missing rung.
  // Centre the camera on it first: the outer tier can sit under the
  // detail panel, and a label is only clickable where it is on top.
  await page.evaluate(() => window.__tutTech__?.focus("tech.sprint-frame"));
  await drawnFrame(page);
  await page.locator('[data-node="tech.sprint-frame"]').click();
  await expect(detail.locator('[data-field="reason"]')).toHaveText(
    "Requires All-Terrain Actuators",
  );
  await page.evaluate(() => window.__tutTech__?.select("tech.jump-jets"));
  await expect(detail).toHaveAttribute("data-selected-node", "tech.jump-jets");

  // The dev build's Free TP button (#1171): ten points a press.
  await page.locator('#tech-tree-bar [data-action="free-tech-points"]').click();
  await expect(
    page.locator('#tech-tree-bar [data-field="techPoints"]'),
  ).toHaveText("22 TP");
  await expect(page.locator('[data-node="tech.railgun"]')).toHaveAttribute(
    "data-status",
    "available",
  );

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
  // A locked card is not draggable; an unlocked one is.
  await expect(palette.locator('[data-part-id="legs-sprint"]')).toHaveAttribute(
    "draggable",
    "false",
  );
  await expect(palette.locator('[data-part-id="legs-jumper"]')).toHaveAttribute(
    "draggable",
    "true",
  );
  await page.screenshot({
    path: "docs/design/mech-bay-locked-parts.png",
    fullPage: true,
  });
});
