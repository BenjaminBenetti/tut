/* global window, document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "./capture-vite.config.mjs";
import { format } from "prettier";

const exteriors = process.argv.includes("--exteriors");
const out = exteriors
  ? "docs/design/diagnostics/business-signs"
  : "docs/design/diagnostics/building-interiors";
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
const requestedKinds = new Set(
  process.argv.slice(2).filter((arg) => arg !== "--exteriors"),
);
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
  const interiors = [
    ["shops-review", "city", "large", "shop", 0, 0, "grocery"],
    ["shops-review", "city", "large", "shop", 0, 2, "bakery-cafe"],
    ["shops-review", "city", "large", "shop", 0, 0, "pharmacy"],
    ["shops-review", "city", "large", "shop", 0, 2, "clothing"],
    ["shops-review", "city", "large", "shop", 0, 0, "electronics"],
    ["shops-review", "city", "large", "shop", 0, 2, "hardware"],
    ["shops-review", "city", "large", "shop", 0, 2, "bookshop"],
    ["interiors-second", "city", "medium", "shop", 0, 0],
    ["interiors-second", "city", "medium", "tower", 1, 0],
    ["interiors-second", "city", "medium", "tower", 0, 1],
    ["interiors-review", "city", "medium", "house", 0, 2],
    ["interiors-review", "city", "medium", "apartment", 1, 1],
    ["warehouse-review", "rural", "medium", "warehouse", 0, 0],
    ["interiors-review", "city", "large", "shop", 0, 1],
  ];
  const cases = exteriors
    ? [
        ...interiors.filter((entry) => entry[0] === "shops-review"),
        ["interiors-second", "city", "medium", "tower", 0, 0],
        ["warehouse-review", "rural", "medium", "warehouse", 0, 0],
      ]
    : interiors;
  for (const [seed, settlement, size, kind, floorIndex, yaw, style] of cases) {
    if (
      requestedKinds.size &&
      !requestedKinds.has(kind) &&
      !requestedKinds.has(style)
    )
      continue;
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
      async ({ kind, floorIndex, yaw, style, exteriors }) => {
        const map = window.__interiorMap;
        const candidates = map.buildings.filter(
          (b) =>
            b.kind === kind &&
            b.floors[floorIndex] &&
            (style === undefined || b.interiorStyle === style),
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
        window.__interiorView.setLayerFocus(
          exteriors
            ? undefined
            : {
                storey: floorIndex,
                storeyCount:
                  1 + Math.max(...map.buildings.map((b) => b.floors.length)),
              },
        );
        const rig = window.__interiorRig;
        // Select an ordinary camera quadrant that faces the actual entrance.
        const front = building.entrances[0];
        const directions = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
        let chosenYaw = yaw;
        if (exteriors) {
          const normal = directions[front.side];
          for (let i = 0; i < 4; i++) {
            rig.apply();
            const state = rig.getState();
            const facing =
              (rig.camera.position.x - state.target.x) * normal[0] +
              (rig.camera.position.z - state.target.z) * normal[1];
            if (facing > 0) {
              chosenYaw = state.yawIndex;
              break;
            }
            rig.rotateRight();
          }
        }
        while (rig.getState().yawIndex !== chosenYaw) rig.rotateRight();
        const target = {
          x: rect.x + rect.w / 2,
          y: floor.y * 0.75 + (exteriors ? 1.4 : 0.55),
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
        let businessName;
        if (exteriors) {
          const { resolveBusinessSigns } =
            await import("/src/graphics/service/business-sign-selection.ts");
          const { BUSINESS_NAMES } =
            await import("/src/graphics/data/business-names.ts");
          const sign = resolveBusinessSigns(map.buildings, map.recipe.seed).get(
            building.id,
          );
          businessName = sign && BUSINESS_NAMES[sign.kind][sign.nameIndex];
        }
        return {
          seed: map.recipe.seed,
          building,
          floorIndex,
          exteriors,
          businessName,
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
      { kind, floorIndex, yaw, style, exteriors },
    );
    const id = exteriors
      ? `${seed}-${style ?? kind}-exterior`
      : `${seed}-${style ?? kind}-floor-${floorIndex}`;
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
    await format(JSON.stringify(records), { parser: "json" }),
  );
} finally {
  await browser.close();
  await server.close();
}
