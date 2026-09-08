/* global requestAnimationFrame */
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
      for (const units of [0, 1]) {
        await page.mouse.move(-10, -10);
        await page.goto(
          `http://127.0.0.1:8797/tools/art/preview/roof-cutaway.html?roof=flat&yaw=2&units=${units}&pointer=1`,
          { timeout: 120000 },
        );
        await page
          .locator('body[data-ready="true"]')
          .waitFor({ timeout: 120000 });
        const control = await capture(`flat-${units ? "squad" : "closed"}`);
        if (phase === "after") {
          await page.mouse.move(760, 405);
          await settled(1);
          await capture(`flat-${units ? "overlap" : "hover"}`);
          await page.mouse.move(-10, -10);
          await settled(0);
          const restored = await capture(
            `flat-${units ? "squad-restored" : "closed-restored"}`,
          );
          if (!restored.equals(control))
            throw new Error("Frontage cutaway did not close exactly");
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));

      /** Wait for the real fade to finish and for that state to be drawn. */
      async function settled(strength) {
        await page.waitForFunction(
          (s) => globalThis.__cutawayState().pointerStrength === s,
          strength,
        );
        await page.evaluate(async () => {
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
        });
      }

      /** Record the live shader state and require exact second-browser reproduction. */
      async function capture(id) {
        const state = await page.evaluate(() => globalThis.__cutawayState());
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
