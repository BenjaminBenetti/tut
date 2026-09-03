/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { GAME_STATE_SCHEMA_VERSION } from "../src/save/model/game-state";

/** Storage key the app autosaves to (`AUTOSAVE_SLOT_ID` under the save prefix). */
const AUTOSAVE_KEY = "tut:save:autosave";

/**
 * A schema v1 autosave captured from the first shipped build (`35857b2`,
 * 2026-09-03). It is frozen on purpose: every later schema bump must keep
 * a migration chain from v1, or this file stops loading and the tests
 * below go red.
 */
const V1_ENVELOPE = readFileSync(
  fileURLToPath(new URL("./fixtures/autosave-v1.json", import.meta.url)),
  "utf8",
);

/** Shape of the parts of the envelope the tests read; the rest is opaque. */
interface EnvelopeSummary {
  readonly schemaVersion: number;
  readonly state: { readonly meta: { readonly seed: number } };
}

/** Collects console and page errors so a test can assert none were logged. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}

/** Boots to the main menu. */
async function bootToMenu(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "main-menu",
  );
}

/** The autosave slot as the app last wrote it. */
async function readAutosave(page: Page): Promise<EnvelopeSummary> {
  const text = await page.evaluate(
    (key) => localStorage.getItem(key) ?? "",
    AUTOSAVE_KEY,
  );
  return JSON.parse(text) as EnvelopeSummary;
}

const fixture = JSON.parse(V1_ENVELOPE) as EnvelopeSummary;

test("fixture is a schema v1 envelope", () => {
  expect(fixture.schemaVersion).toBe(1);
  expect(GAME_STATE_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
});

test("a v1 autosave migrates on Continue and is rewritten at the current schema", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await bootToMenu(page);

  await page.evaluate(
    ([key, text]) => {
      localStorage.setItem(key, text);
    },
    [AUTOSAVE_KEY, V1_ENVELOPE] as const,
  );
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");

  const cont = page.locator('[data-action="continue"]');
  await expect(cont).toBeEnabled();
  await cont.click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await expect(
    page.locator('section[data-screen="overworld"] [data-field="seed"]'),
  ).toHaveText(String(fixture.state.meta.seed));

  // Starting the session autosaves the migrated state at the current version.
  await expect
    .poll(async () => (await readAutosave(page)).schemaVersion)
    .toBe(GAME_STATE_SCHEMA_VERSION);
  const rewritten = await readAutosave(page);
  expect(rewritten.state.meta.seed).toBe(fixture.state.meta.seed);

  expect(errors).toEqual([]);
});

test("a v1 export imports into a new campaign", async ({ page }) => {
  const errors = collectErrors(page);
  await bootToMenu(page);

  await page.locator('textarea[data-field="save-json"]').fill(V1_ENVELOPE);
  await page.locator('[data-action="import"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  await expect(
    page.locator('section[data-screen="overworld"] [data-field="seed"]'),
  ).toHaveText(String(fixture.state.meta.seed));

  expect(errors).toEqual([]);
});
