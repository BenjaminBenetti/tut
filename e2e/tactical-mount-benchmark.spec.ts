import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** Opt-in first-mount measurement; timings are evidence, never a CI threshold. */
test("measures the first tactical mount for seed 4242", async ({
  page,
}, info) => {
  test.skip(process.env.BENCHMARK === undefined, "set BENCHMARK=1 to measure");
  // Optional diagnostic run, separate from the uninstrumented timings.
  if (process.env.PROFILE !== undefined) {
    await page.addInitScript(() => {
      let linked = 0;
      Object.defineProperty(globalThis, "__mountProgramCount", {
        get: () => linked,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Rebound to the live WebGL context with call below.
      const link = WebGL2RenderingContext.prototype.linkProgram;
      WebGL2RenderingContext.prototype.linkProgram = function (program) {
        linked++;
        link.call(this, program);
      };
    });
  }
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < 40 && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) await choice.first().click();
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  await expect(rows.first()).toBeVisible();
  const missionId = await rows.first().getAttribute("data-mission-id");
  const started = await page.evaluate((id) => {
    const started = performance.now();
    const hooks = (globalThis as { __tut__?: TutTestHooks }).__tut__;
    if (!hooks) throw new Error("missing tactical launch hook");
    const problem = hooks.startTacticalMission(id);
    if (problem !== undefined) throw new Error(String(problem));
    return started;
  }, missionId ?? "");
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(body).toHaveAttribute("data-tactical-units", /^[1-9]\d*$/);
  // The units-ready stamp follows model loading; cross two frame boundaries
  // so the measured interval includes the completed scene's first draw.
  const finished = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            // SwiftShader submits work asynchronously. Include its completed draw,
            // not just the JavaScript that queued it.
            document
              .querySelector<HTMLCanvasElement>("#tactical-viewport canvas")
              ?.getContext("webgl2")
              ?.finish();
            resolve(performance.now());
          }),
        );
      }),
  );
  info.annotations.push({
    type: "first-mount-ms",
    description: String(Math.round(finished - started)),
  });
  if (process.env.PROFILE !== undefined) {
    info.annotations.push({
      type: "linked-programs-including-overworld",
      description: String(
        await page.evaluate(
          () =>
            (globalThis as { __mountProgramCount?: number })
              .__mountProgramCount,
        ),
      ),
    });
  }
});
