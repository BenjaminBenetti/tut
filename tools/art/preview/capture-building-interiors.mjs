/* global window, document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "./capture-vite.config.mjs";

const out = "docs/design/diagnostics/building-interiors";
mkdirSync(out, { recursive: true });
const server = await createServer({
  ...captureConfig,
  server: {
    ...captureConfig.server,
    port: 8796,
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
const requestedKinds = new Set(process.argv.slice(2));
const records =
  requestedKinds.size && existsSync(`${out}/captures.json`)
    ? JSON.parse(readFileSync(`${out}/captures.json`, "utf8"))
    : [];
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      /\[assets\].*failed to load/i.test(message.text())
    )
      errors.push(message.text());
  });
  // Only exposes production objects for framing; generation, art and cut controls are unchanged.
  await page.route(
    "**/src/graphics/service/orthographic-camera-rig.ts*",
    async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      const marker = "this.state = createCameraState(initial);";
      if (!body.includes(marker)) throw new Error("Camera constructor changed");
      await route.fulfill({
        response,
        body: body.replace(marker, `${marker} window.__interiorRig = this;`),
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
        `${marker} window.__interiorMap = map; window.__interiorView = builder;`,
      ),
    });
  });
  let loadedMap;
  for (const [seed, settlement, size, kind, floorIndex, yaw] of [
    ["interiors-second", "city", "medium", "shop", 0, 0],
    ["interiors-second", "city", "medium", "tower", 1, 0],
    ["interiors-second", "city", "medium", "tower", 0, 1],
    ["interiors-review", "city", "medium", "house", 0, 2],
    ["interiors-review", "city", "medium", "apartment", 1, 1],
    ["warehouse-review", "rural", "medium", "warehouse", 0, 0],
    ["interiors-review", "city", "large", "shop", 0, 1],
  ]) {
    if (requestedKinds.size && !requestedKinds.has(kind)) continue;
    const query = new URLSearchParams({
      seed,
      biome: "temperate",
      settlement,
      size,
      models: "1",
    });
    if (loadedMap !== query.toString()) {
      await page.goto(`http://127.0.0.1:8796/mapgen-preview.html?${query}`, {
        timeout: 120000,
      });
      loadedMap = query.toString();
    }
    await page
      .locator('body[data-models-ready="true"][data-preview-ready="true"]')
      .waitFor({ timeout: 120000 });
    const info = await page.evaluate(
      async ({ kind, floorIndex, yaw }) => {
        const map = window.__interiorMap;
        const candidates = map.buildings.filter(
          (b) => b.kind === kind && b.floors[floorIndex],
        );
        // Pick a well-sized generated example, never a hand-arranged furniture scene.
        candidates.sort(
          (a, b) =>
            b.footprint[0].w * b.footprint[0].d -
            a.footprint[0].w * a.footprint[0].d,
        );
        const building = candidates[0];
        if (!building)
          throw new Error(`No generated ${kind} on seed ${map.recipe.seed}`);
        const floor = building.floors[floorIndex];
        const rect = building.footprint[0];
        window.__interiorView.setLayerFocus({
          storey: floorIndex,
          storeyCount:
            1 + Math.max(...map.buildings.map((b) => b.floors.length)),
        });
        const rig = window.__interiorRig;
        while (rig.getState().yawIndex !== yaw) rig.rotateRight();
        const target = {
          x: rect.x + rect.w / 2,
          y: floor.y * 0.75 + 0.55,
          z: rect.z + rect.d / 2,
        };
        rig.lookAt(target);
        rig.apply();
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        const a = rig.camera.position.clone().copy(target).project(rig.camera);
        const b = rig.camera.position
          .clone()
          .set(target.x + 1, target.y, target.z)
          .project(rig.camera);
        const pitch = Math.hypot(
          ((a.x - b.x) * canvas.width) / 2,
          ((a.y - b.y) * canvas.height) / 2,
        );
        rig.zoomBy(Math.min(70, 900 / (rect.w + rect.d)) / pitch);
        rig.apply();
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        return {
          seed: map.recipe.seed,
          building,
          floorIndex,
          camera: rig.getState(),
          props: map.props.filter(
            (p) =>
              p.tile.y === floor.y &&
              p.tile.x >= rect.x &&
              p.tile.x < rect.x + rect.w &&
              p.tile.z >= rect.z &&
              p.tile.z < rect.z + rect.d,
          ),
        };
      },
      { kind, floorIndex, yaw },
    );
    const id = `${seed}-${kind}-floor-${floorIndex}`;
    await page
      .locator("#map-viewport")
      .screenshot({ path: `${out}/${id}.png`, timeout: 120000 });
    const prior = records.findIndex((record) => record.id === id);
    if (prior !== -1) records.splice(prior, 1);
    records.push({ id, ...info });
    console.log(`${id}: ${info.props.length} props`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    `${out}/captures.json`,
    JSON.stringify(records, null, 2) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
