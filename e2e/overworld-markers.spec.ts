import { expect, test, type Page } from "@playwright/test";

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

/**
 * Settlement models load asynchronously after the scene is built, so a
 * look read straight after Continue may still say `loading`; poll until
 * the GLB (or, if the asset is missing, its placeholder) is in place.
 */
async function settledLook(page: Page, cityId: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => (globalThis as HookGlobal).__tut__?.cityMarkerLook(id)?.model,
          cityId,
        ),
      { timeout: 10000 },
    )
    .not.toBe("loading");
  return page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.cityMarkerLook(id),
    cityId,
  );
}

test("map markers follow the campaign: a city with a mission wears eggs in its region's style, a clean one does not", async ({
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

  const looks = {
    newYork: await settledLook(page, "new-york"),
    london: await settledLook(page, "london"),
    tokyo: await settledLook(page, "tokyo"),
  };
  expect(looks.newYork).toBeDefined();
  expect(looks.london).toBeDefined();
  expect(looks.tokyo).toBeDefined();
  // Every city stands as a settlement model (#1155), never as the stand-in box.
  expect(looks.newYork?.model).toBe("glb");
  expect(looks.london?.model).toBe("glb");
  expect(looks.tokyo?.model).toBe("glb");
  // The mission on offer is cued by the egg overlay on New York alone.
  expect(looks.newYork?.mission).toBe(true);
  expect(looks.london?.mission).toBe(false);
  // Each region draws its own architectural family: three cities, three models.
  expect(looks.newYork?.style).toBe("north-american");
  expect(looks.london?.style).toBe("european");
  expect(looks.tokyo?.style).toBe("east-asian");
  expect(
    new Set([
      looks.newYork?.modelId,
      looks.london?.modelId,
      looks.tokyo?.modelId,
    ]).size,
  ).toBe(3);

  expect(errors).toEqual([]);
});
