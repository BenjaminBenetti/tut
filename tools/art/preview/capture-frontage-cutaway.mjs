/* global document, window, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import captureConfig from "./capture-vite.config.mjs";

const phase = process.argv[2] ?? "after";
const projectRoot = process.env.FRONTAGE_ROOT ?? process.cwd();
const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();
const output = `docs/design/diagnostics/960/${phase}`;
mkdirSync(output, { recursive: true });
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
        viewport: { width: 1200, height: 950 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" ||
          /\[assets\].*failed to load/i.test(message.text())
        )
          errors.push(message.text());
      });
      // Expose the real builder only in this diagnostic response, for level controls.
      await page.route(
        "**/tools/art/preview/roof-cutaway.mjs*",
        async (route) => {
          const response = await route.fetch();
          const body = await response.text();
          const marker = body.match(
            /const builder = new TacticalSceneBuilder\(\{[\s\S]*?\}\);/,
          )?.[0];
          if (!marker)
            throw new Error("Roof fixture builder constructor changed");
          await route.fulfill({
            response,
            body: body.replace(
              marker,
              `${marker} window.__frontageBuilder = builder; window.__frontageMap = map;`,
            ),
          });
        },
      );
      let closed;
      for (const units of [0, 1, 2]) {
        await page.mouse.move(-10, -10);
        await page.goto(
          `http://127.0.0.1:8797/tools/art/preview/roof-cutaway.html?roof=flat&yaw=2&units=${units}`,
          { timeout: 120000 },
        );
        await page
          .locator('body[data-ready="true"]')
          .waitFor({ timeout: 120000 });
        await settled(units);
        const defaults = await page.evaluate(() => ({
          radius: document.body.dataset.radius,
          floor: document.body.dataset.floor,
        }));
        if (defaults.radius !== "4" || defaults.floor !== "0.175")
          throw new Error("Accepted unit reveal defaults changed");
        const name = units === 2 ? "two-squads" : units ? "squad" : "closed";
        const control = await capture(`flat-${name}`);
        if (units === 0) {
          closed = control;
          await page.evaluate(() => {
            const map = window.__frontageMap;
            const tile = map.tiles.find(
              (t) => t.x === 25 && t.y === 6 && t.z === 14,
            );
            const building = map.buildings.find(
              (b) => b.id === tile.buildingId,
            );
            window.__frontageBuilder.setLayerFocus({
              storey: 0,
              storeyCount: Math.max(
                ...map.buildings.map((b) => b.floors.length),
              ),
              cutLevel: building.groundLevel + 1,
            });
          });
          await drawn();
          await capture("flat-ground-storey");
          await page.evaluate(() =>
            window.__frontageBuilder.setLayerFocus(undefined),
          );
          await drawn();
          const restored = await capture("flat-levels-restored");
          if (!restored.equals(closed))
            throw new Error("Restoring levels changed the complete roof");
          await page.evaluate(async () => {
            const { TileIndex } =
              await import("/src/mapgen/service/tile-index.ts");
            const map = window.__frontageMap;
            const index = new TileIndex(map);
            const owner = map.tiles.find(
              (t) => t.x === 25 && t.y === 6 && t.z === 14,
            ).buildingId;
            const building = map.buildings.find((b) => b.id === owner);
            const left = Math.min(...building.footprint.map((r) => r.x));
            const right = Math.max(...building.footprint.map((r) => r.x + r.w));
            const visible = map.tiles
              .filter((t) => t.x < left + (right - left) / 3)
              .map((t) => index.keyOf(t));
            const explored = map.tiles
              .filter((t) => t.x < left + (2 * (right - left)) / 3)
              .map((t) => index.keyOf(t));
            window.__frontageBuilder.setVision({
              visible,
              explored,
              spotted: [],
              lastSeen: {},
            });
            window.__frontageVision = {
              visible: visible.length,
              remembered: explored.length - visible.length,
              unexplored: map.tiles.length - explored.length,
            };
          });
          await drawn();
          await capture("flat-fog-states");
          await page.evaluate(() => {
            window.__frontageBuilder.setVision(undefined);
            window.__frontageVision = undefined;
          });
          await drawn();
          const visionRestored = await capture("flat-vision-restored");
          if (!visionRestored.equals(closed))
            throw new Error("Restoring vision changed the complete building");
        } else {
          await page.keyboard.press("l");
          await page.locator('body[data-left="true"]').waitFor();
          await settled(0);
          const restored = await capture(`flat-${name}-left`);
          if (!restored.equals(closed))
            throw new Error("Frontages did not close exactly after units left");
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));

      /** Wait for the real fade to finish and for that state to be drawn. */
      async function settled(count) {
        await page.waitForFunction((n) => {
          const state = globalThis.__cutawayState();
          return (
            state.ghostCount === n &&
            state.ghostStrength.slice(0, n).every((s) => s === 1)
          );
        }, count);
        await drawn();
      }

      /** Capture only after the production renderer has drawn the requested state. */
      async function drawn() {
        await page.evaluate(async () => {
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
        });
      }

      /** Record the live shader state and require exact second-browser reproduction. */
      async function capture(id) {
        if (errors.length) throw new Error(errors.join("\n"));
        const state = await page.evaluate(() => ({
          ...globalThis.__cutawayState(),
          vision: window.__frontageVision ?? "full",
        }));
        if (state.ghostStrength.length !== 8)
          throw new Error("Accepted unit slot count changed");
        const bytes = await page.screenshot({ timeout: 120000 });
        const path = `${output}/${id}.png`;
        if (repeat) {
          if (!bytes.equals(readFileSync(path)))
            throw new Error(`Capture drift: ${id}`);
        } else {
          writeFileSync(path, bytes);
          records.push({
            id,
            state,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        console.log(
          `${phase}/${id}: ${repeat ? "second browser byte-identical" : "captured"}`,
        );
        return bytes;
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    `${output}/cutaway.json`,
    JSON.stringify({ baseCommit, repeatedBrowsers: 2, records }, null, 2) +
      "\n",
  );
} finally {
  await server.close();
}
