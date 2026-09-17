/* global document, window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import captureConfig from "./capture-vite.config.mjs";

const out = "docs/design/diagnostics/infestation";
mkdirSync(out, { recursive: true });
const server = await createServer({
  ...captureConfig,
  optimizeDeps: { include: ["three/addons/utils/BufferGeometryUtils.js"] },
  server: {
    ...captureConfig.server,
    port: 8797,
    strictPort: true,
    host: "127.0.0.1",
  },
});
await server.listen();
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
const records = [];
const quick = process.argv.includes("--quick");
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" || /failed to load/i.test(message.text()))
      errors.push(message.text());
  });
  // Expose the real scene solely to frame close-ups and record geometry counts.
  await page.route(
    "**/src/graphics/service/orthographic-camera-rig.ts*",
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const marker = "this.state = createCameraState(initial);";
      if (!body.includes(marker)) throw new Error("Camera constructor changed");
      await route.fulfill({
        response,
        body: body.replace(marker, `${marker} window.__resinRig = this;`),
      });
    },
  );
  await page.route("**/src/mapgen-preview.ts*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const marker = body.match(
      /const builder = new TacticalSceneBuilder\(\{[\s\S]*?\}\);/,
    )?.[0];
    if (!marker) throw new Error("Map Lab constructor changed");
    await route.fulfill({
      response,
      body: body.replace(
        marker,
        `${marker} window.__resinMap = map; window.__resinView = builder;`,
      ),
    });
  });
  for (const biome of quick
    ? ["temperate"]
    : ["temperate", "snowy", "desert", "coastal"]) {
    const levels = quick
      ? [4, 10]
      : biome === "temperate"
        ? [0, 1, 4, 7, 10]
        : [10];
    const query = new URLSearchParams({
      seed: "resin-review",
      biome,
      settlement: "town",
      size: "small",
      models: "1",
      infestation: "0",
    });
    await page.goto(`http://127.0.0.1:8797/mapgen-preview.html?${query}`, {
      timeout: 120000,
    });
    await page
      .locator('body[data-models-ready="true"]')
      .waitFor({ timeout: 120000 });
    for (const level of levels) {
      const started = Date.now();
      await page
        .getByRole("slider", { name: /Infestation Level/ })
        .fill(String(level));
      await page
        .locator(
          `body[data-infestation-level="${level}"][data-models-ready="true"]`,
        )
        .waitFor({ timeout: 120000 });
      const name = `${biome}-level-${level}`;
      await page.screenshot({ path: `${out}/${name}.png` });
      records.push({
        name,
        captureMs: Date.now() - started,
        url: page.url().replace("http://127.0.0.1:8797", ""),
        ...(await page.evaluate(() => ({
          infestedTiles: Number(document.body.dataset.infestedTiles),
          stats: document.querySelector("#stats").textContent,
        }))),
      });
      console.log(name);
    }
    if (biome === "temperate") {
      await page.locator("#level").fill("6");
      await page.screenshot({ path: `${out}/temperate-level-10-cutaway.png` });
      await page
        .locator("#level")
        .fill(await page.locator("#level").getAttribute("max"));
      const detail = await page.evaluate(async () => {
        const map = window.__resinMap;
        const building = map.buildings[0];
        const rect = building.footprint[0];
        const rig = window.__resinRig;
        rig.lookAt({
          x: rect.x + rect.w * 0.65,
          y: building.groundLevel * 0.75 + 1.3,
          z: rect.z + rect.d,
        });
        rig.zoomBy(1.7);
        rig.apply();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        let batches = 0,
          triangles = 0;
        window.__resinView.root.traverse((object) => {
          if (!object.isMesh || !object.name.startsWith("infestation-model:"))
            return;
          batches++;
          triangles +=
            ((object.geometry.index?.count ??
              object.geometry.getAttribute("position").count) /
              3) *
            (object.count ?? 1);
        });
        return { building: building.id, rect, batches, triangles };
      });
      records.push({ name: "temperate-level-10-detail", ...detail });
      await page.screenshot({ path: `${out}/temperate-level-10-detail.png` });
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    `${out}/captures.json`,
    await format(JSON.stringify({ errors, records }), { parser: "json" }),
  );
} finally {
  await browser.close();
  await server.close();
}
