/* global window, document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "./capture-vite.config.mjs";

const phase = process.argv[2] ?? "after";
const projectRoot = process.env.ROAD_CAPTURE_ROOT ?? process.cwd();
const out = `docs/design/diagnostics/1043/${phase}`;
mkdirSync(out, { recursive: true });
const controls = [
  [
    "D1-coastal-approach",
    "mc-resume-03",
    "coastal",
    "rural",
    "small",
    { x: 13, y: 2, z: 24 },
    0,
  ],
  [
    "E1-coastal-junction",
    "mc-resume-03",
    "coastal",
    "rural",
    "small",
    { x: 21, y: 2, z: 10 },
    0,
  ],
  [
    "E2-coastal-junction",
    "mc-resume-03",
    "coastal",
    "rural",
    "small",
    { x: 21, y: 2, z: 10 },
    1,
  ],
  [
    "P1-temperate-control",
    "mc-resume-01",
    "temperate",
    "rural",
    "small",
    { x: 13, y: 2, z: 24 },
    0,
  ],
  [
    "P2-temperate-control",
    "mc-resume-01",
    "temperate",
    "rural",
    "small",
    { x: 13, y: 2, z: 24 },
    1,
  ],
  [
    "P3-snowy-control",
    "mc-resume-01",
    "snowy",
    "rural",
    "small",
    { x: 13, y: 3, z: 24 },
    0,
  ],
  [
    "P4-desert-control",
    "mc-resume-01",
    "desert",
    "rural",
    "small",
    { x: 13, y: 2, z: 24 },
    0,
  ],
];
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
      await page.route(
        "**/src/graphics/service/scene-service.ts*",
        async (route) => {
          const response = await route.fetch();
          const body = await response.text();
          const marker =
            "this.renderer.setPixelRatio(window.devicePixelRatio);";
          if (!body.includes(marker))
            throw new Error("Renderer constructor changed");
          await route.fulfill({
            response,
            body: body.replace(
              marker,
              marker + " window.__coastalRoadRenderer = this.renderer;",
            ),
          });
        },
      );
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
              `${marker} window.__coastalRoadRig = this;`,
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
          body: body.replace(
            marker,
            `${marker} window.__coastalRoadMap = map;`,
          ),
        });
      });
      for (const [
        id,
        seed,
        biome,
        settlement,
        size,
        focus,
        rotation,
      ] of controls) {
        await page.mouse.move(0, 0);
        const query = new URLSearchParams({
          seed,
          biome,
          settlement,
          size,
          models: "1",
          units: "1",
          slope: "100",
        });
        const url = `http://127.0.0.1:8797/mapgen-preview.html?${query}`;
        if (page.url() !== url) await page.goto(url, { timeout: 120000 });
        // Map Lab's map-load promise and unit-load promise have distinct markers.
        await page
          .locator('body[data-models-ready="true"][data-preview-ready="true"]')
          .waitFor({ timeout: 120000 });
        const info = await page.evaluate(
          async ({ focus, rotation }) => {
            const rig = window.__coastalRoadRig;
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
              map: window.__coastalRoadMap,
              rendering: {
                render: { ...window.__coastalRoadRenderer.info.render },
                memory: { ...window.__coastalRoadRenderer.info.memory },
                programs: window.__coastalRoadRenderer.info.programs.length,
              },
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
            `.git/art-1043/${phase}-${biome}-${settlement}-${size}-${seed}-map.json`,
            JSON.stringify(info.map) + "\n",
          );
          const camera = {
            camera: info.camera,
            actualPitch: info.actualPitch,
            pixel: info.pixel,
            rendering: info.rendering,
          };
          records.push({
            id,
            seed,
            biome,
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
