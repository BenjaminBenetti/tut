/* global document, requestAnimationFrame */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const phase = process.argv[2] ?? "after";
assert.ok(["before", "after"].includes(phase));
const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4183";
const output = `docs/design/diagnostics/751/${phase}`;
mkdirSync(output, { recursive: true });
// Load only simulation modules here; the browser renders the built application.
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: "custom",
});
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const [{ applyOutcome }, { computeThreat }, { THREAT_TUNING }] =
    await Promise.all([
      loader.ssrLoadModule("/src/overworld/service/outcome-service.ts"),
      loader.ssrLoadModule("/src/overworld/service/threat-service.ts"),
      loader.ssrLoadModule("/src/overworld/data/threat-tuning.ts"),
    ]);
  const viewport = { width: 1280, height: 900 };
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("751");
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const base = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tut:save:autosave")),
  );
  const records = [];
  for (const kind of ["defeat", "victory-stub"]) {
    const day = kind === "defeat" ? 300 : 41;
    const infestation = kind === "defeat" ? 70 : 0;
    const map = {
      ...base.state.overworld.map,
      cities: base.state.overworld.map.cities.map((city) => ({
        ...city,
        infestation,
      })),
    };
    const state = applyOutcome({
      ...base.state,
      overworld: {
        ...base.state.overworld,
        day,
        map,
        hives: [],
        threat: computeThreat(map, day, THREAT_TUNING),
      },
    }).state;
    const outcome = state.overworld.outcome;
    assert.equal(outcome.kind, kind);
    assert.equal(outcome.summary.citiesLost, 0);
    await page.evaluate(
      (save) => {
        localStorage.setItem("tut:save:autosave", JSON.stringify(save));
      },
      { ...base, state },
    );
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "ready",
    );
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-screen",
      "game-over",
    );
    await expect(page.locator('[data-field="outcome-kind"]')).toHaveText(
      kind === "victory-stub"
        ? "Earth secured"
        : phase === "before"
          ? "Earth overrun"
          : "Threat limit reached",
    );
    await expect(page.locator('[data-field="cities-lost"]')).toHaveText(
      "0 / 37",
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.mouse.move(0, 0);
    const pixels = await page.screenshot({
      path: `${output}/${kind}.png`,
      animations: "disabled",
    });
    records.push({
      kind,
      seed: 751,
      day,
      infestation,
      viewport,
      outcome,
      sha256: createHash("sha256").update(pixels).digest("hex"),
    });
    console.log(`${phase}: ${kind}`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${output}/captures.json`,
    JSON.stringify(
      {
        source: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        baseUrl,
        records,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await loader.close();
}
