import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

const AUTOSAVE_KEY = "tut:save:autosave";

/** A save envelope as stored, with just the fields this test edits typed. */
interface StoredSave {
  state: {
    overworld: {
      map: { cities: { id: string; infestation: number }[] };
      missions: unknown[];
    };
  };
}

test("map markers follow the campaign: an overrun city with a mission looks different from a clean one", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  // Push New York to 99 with an active mission in the autosave, then Continue.
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("no autosave");
    const save = JSON.parse(raw) as StoredSave;
    const city = save.state.overworld.map.cities.find(
      (c) => c.id === "new-york",
    );
    if (!city) throw new Error("no New York");
    city.infestation = 99;
    save.state.overworld.missions.push({
      id: "mission-e2e",
      typeId: "infestation-clearance",
      cityId: "new-york",
      difficulty: 5,
      mapParams: {
        biome: "temperate",
        settlement: "city",
        size: "medium",
        seed: "e2e",
      },
      rewards: { credits: 1500 },
      createdDay: 1,
      expiresDay: 99,
      ignorePenalty: 10,
    });
    localStorage.setItem(key, JSON.stringify(save));
  }, AUTOSAVE_KEY);
  await page.reload();
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="continue"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const looks = await page.evaluate(() => {
    const hooks = (globalThis as HookGlobal).__tut__;
    return {
      newYork: hooks?.cityMarkerLook("new-york"),
      london: hooks?.cityMarkerLook("london"),
    };
  });
  expect(looks.newYork).toBeDefined();
  expect(looks.london).toBeDefined();
  expect(looks.newYork?.mission).toBe(true);
  expect(looks.london?.mission).toBe(false);
  expect(looks.newYork?.colourHex).not.toBe(looks.london?.colourHex);
  // Overrun reads red: the red channel dominates and green has fallen away.
  const hex = looks.newYork?.colourHex ?? 0;
  expect((hex >> 16) & 0xff).toBeGreaterThan(0xc0);
  expect((hex >> 8) & 0xff).toBeLessThan(0x80);

  expect(errors).toEqual([]);
});
