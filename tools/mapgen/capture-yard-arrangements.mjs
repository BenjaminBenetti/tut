/* global window, document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "../art/preview/capture-vite.config.mjs";

const phase = process.argv[2] ?? "after";
const projectRoot = process.env.FRONTAGE_ROOT ?? process.cwd();
const out = `docs/design/diagnostics/960/arrangements/${phase}`;
mkdirSync(out, { recursive: true });
const controls = [
  [
    "I01-city-frontages",
    "mc-resume-01",
    "city",
    "medium",
    { x: 43, y: 2, z: 39 },
    0,
  ],
  [
    "I02-city-frontages-rotated",
    "mc-resume-01",
    "city",
    "medium",
    { x: 43, y: 2, z: 39 },
    1,
  ],
  [
    "S01-nearby-shop-workplace-home",
    "mc-resume-01",
    "city",
    "medium",
    { x: 24, y: 2, z: 37 },
    0,
  ],
  [
    "I03-second-seed",
    "mc-opening-02",
    "city",
    "medium",
    { x: 23, y: 1, z: 34 },
    0,
  ],
  [
    "I04-second-seed-rotated",
    "mc-opening-02",
    "city",
    "medium",
    { x: 23, y: 1, z: 34 },
    1,
  ],
  [
    "C01-rural-roof-control",
    "mc-opening-01",
    "rural",
    "small",
    { x: 23, y: 4, z: 13 },
    0,
  ],
  [
    "S02-shop-delivery-yard",
    "mc-resume-01",
    "city",
    "medium",
    { x: 34, y: 2, z: 12 },
    2,
  ],
].filter(([id]) =>
  process.env.CAPTURE_CASES
    ? process.env.CAPTURE_CASES.split(",").includes(id)
    : !id.startsWith("S02"),
);
const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  cwd: projectRoot,
}).trim();
const server = await createServer({
  ...captureConfig,
  root: projectRoot,
  server: {
    ...captureConfig.server,
    port: 8797,
    strictPort: true,
    host: "127.0.0.1",
    // The detached comparison tree lives below .git; serve only it and dependencies.
    fs: {
      allow: [projectRoot, `${process.cwd()}/node_modules`],
      deny: ["**/.env", "**/.env.*", "**/*.{crt,pem}"],
    },
  },
});
await server.listen();
const records = [];
try {
  for (let repeat = 0; repeat < 2; repeat++) {
    const browser = await chromium.launch({
      args: [
        "--use-angle=swiftshader",
        "--use-gl=angle",
        "--enable-unsafe-swiftshader",
      ],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 2400, height: 1500 },
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
      // Diagnostic access only; use the production generator, renderer and rig.
      await page.route(
        "**/src/graphics/service/orthographic-camera-rig.ts*",
        async (route) => {
          const response = await route.fetch();
          const body = await response.text();
          const marker = "this.state = createCameraState(initial);";
          if (!body.includes(marker))
            throw new Error("Camera constructor changed");
          await route.fulfill({
            response,
            body: body.replace(
              marker,
              `${marker} window.__frontageRig = this;`,
            ),
          });
        },
      );
      await page.route("**/src/mapgen-preview.ts*", async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        const marker = body.match(
          /const builder = new TacticalSceneBuilder\(\{[\s\S]*?\}\);/,
        )?.[0];
        if (!marker) throw new Error("Map Lab builder constructor changed");
        await route.fulfill({
          response,
          body: body.replace(marker, `${marker} window.__frontageMap = map;`),
        });
      });
      for (const [id, seed, settlement, size, focus, rotation] of controls) {
        await page.mouse.move(0, 0);
        const query = new URLSearchParams({
          seed,
          biome: "temperate",
          settlement,
          size,
          models: "1",
          units: "1",
          slope: "100",
        });
        const url = `http://127.0.0.1:8797/mapgen-preview.html?${query}`;
        if (page.url() !== url)
          await page.goto(url, {
            timeout: 120000,
            waitUntil: "domcontentloaded",
          });
        // Map Lab's map-load promise and unit-load promise have distinct markers.
        await page
          .locator('body[data-models-ready="true"][data-preview-ready="true"]')
          .waitFor({ timeout: 120000 });
        const info = await page.evaluate(
          async ({ focus, rotation }) => {
            const rig = window.__frontageRig;
            while (rig.getState().yawIndex !== rotation) rig.rotateRight();
            rig.apply();
            const target = {
              x: focus.x + 0.5,
              y: focus.y * 0.75 + 0.15,
              z: focus.z + 0.5,
            };
            rig.lookAt(target);
            rig.apply();
            const rect = document
              .querySelector("canvas")
              .getBoundingClientRect();
            const project = (p) => {
              const v = rig.camera.position
                .clone()
                .set(p.x, p.y, p.z)
                .project(rig.camera);
              return {
                x: rect.x + ((v.x + 1) * rect.width) / 2,
                y: rect.y + ((1 - v.y) * rect.height) / 2,
              };
            };
            let a = project(target),
              b = project({ ...target, x: target.x + 1 });
            rig.zoomBy(45 / Math.hypot(a.x - b.x, a.y - b.y));
            rig.apply();
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            a = project(target);
            b = project({ ...target, x: target.x + 1 });
            return {
              camera: rig.getState(),
              actualPitch: Math.hypot(a.x - b.x, a.y - b.y),
              pixel: a,
              map: window.__frontageMap,
            };
          },
          { focus, rotation },
        );
        const clip = {
          x: Math.max(0, Math.min(1100, Math.round(info.pixel.x - 650))),
          y: Math.max(0, Math.min(450, Math.round(info.pixel.y - 525))),
          width: 1300,
          height: 1050,
        };
        const bytes = await page.screenshot({ clip, timeout: 120000 });
        const file = `${out}/${id}.png`;
        if (repeat && !bytes.equals(readFileSync(file)))
          throw new Error(`Capture drift: ${id}`);
        if (!repeat) {
          writeFileSync(file, bytes);
          writeFileSync(
            `.git/mapgen-960/${phase}-${seed}-map.json`,
            JSON.stringify(info.map) + "\n",
          );
          const camera = {
            camera: info.camera,
            actualPitch: info.actualPitch,
            pixel: info.pixel,
          };
          records.push({
            id,
            seed,
            biome: "temperate",
            settlement,
            size,
            focus,
            rotation,
            ...camera,
            clip,
            viewport: { width: 2400, height: 1500 },
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        console.log(
          `${phase}/${id}: ${repeat ? "second browser byte-identical" : "captured"}`,
        );
      }
      if (errors.length) throw new Error(errors.join("\n"));
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    `${out}/captures.json`,
    JSON.stringify({ baseCommit, repeatedBrowsers: 2, records }, null, 2) +
      "\n",
  );
} finally {
  await server.close();
}
