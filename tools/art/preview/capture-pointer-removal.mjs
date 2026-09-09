/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "./capture-vite.config.mjs";

const phase = process.argv[2] ?? "after";
const projectRoot = process.env.CAPTURE_ROOT ?? process.cwd();
const output = `docs/design/diagnostics/1023/${phase}`;
const baseline = "docs/design/diagnostics/1023/before";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: projectRoot,
  encoding: "utf8",
}).trim();
mkdirSync(output, { recursive: true });
const server = await createServer({
  ...captureConfig,
  root: projectRoot,
  server: {
    ...captureConfig.server,
    host: "127.0.0.1",
    port: 8798,
    strictPort: true,
    // Permit the detached baseline inside .git, limited to that tree and dependencies.
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
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (
          message.type() === "error" ||
          /\[assets\].*failed to load/i.test(message.text())
        )
          errors.push(message.text());
      });
      for (const [roof, yaw, units] of [
        ["pitched", 0, 1],
        ["flat", 2, 2],
      ]) {
        const prefix = `${roof}-yaw${yaw}`;
        await load(0);
        const closed = await capture(`${prefix}-closed`, [-10, -10]);
        await page.mouse.move(760, 405);
        if (phase === "before") {
          await page.waitForFunction(
            () => globalThis.__cutawayState().pointerStrength === 1,
          );
          await drawn();
        } else {
          await observeHover();
        }
        const hovered = await capture(`${prefix}-hover`, [760, 405]);
        if (phase === "before" && hovered.equals(closed))
          throw new Error("The baseline pointer must visibly open this roof");
        if (phase === "after" && !hovered.equals(closed))
          throw new Error(
            "Hovering an empty building changed its closed frame",
          );
        await load(units);
        const squad = await capture(`${prefix}-squad`, [-10, -10]);
        if (phase === "after") {
          for (const [id, bytes] of [
            ["closed", closed],
            ["squad", squad],
          ]) {
            if (!bytes.equals(readFileSync(`${baseline}/${prefix}-${id}.png`)))
              throw new Error(`Current-main control changed: ${prefix}-${id}`);
          }
          await page.mouse.move(760, 405);
          await observeHover();
          const overlap = await capture(`${prefix}-squad-hover`, [760, 405]);
          if (!overlap.equals(squad))
            throw new Error("Pointer changed the squad-only reveal");
          await page.keyboard.press("l");
          await page.locator('body[data-left="true"]').waitFor();
          await page.waitForFunction(
            () => globalThis.__cutawayState().ghostCount === 0,
          );
          await drawn();
          const left = await capture(`${prefix}-units-left`, [760, 405]);
          if (!left.equals(closed))
            throw new Error("Roof failed to close after units left");
        }

        /** Load production defaults; the same pointer query enables the baseline source. */
        async function load(count) {
          await page.mouse.move(-10, -10);
          await page.goto(
            `http://127.0.0.1:8798/tools/art/preview/roof-cutaway.html?roof=${roof}&yaw=${yaw}&units=${count}&pointer=1`,
            { timeout: 120000 },
          );
          await page
            .locator('body[data-ready="true"]')
            .waitFor({ timeout: 120000 });
          await page.waitForFunction((n) => {
            const state = globalThis.__cutawayState();
            return (
              state.ghostCount === n &&
              state.ghostStrength.slice(0, n).every((s) => s === 1)
            );
          }, count);
          const data = await page.evaluate(() => ({
            ...document.body.dataset,
          }));
          if (data.radius !== "4" || data.floor !== "0.175")
            throw new Error("Production unit radius or opacity changed");
          await drawn();
        }
      }

      /** Observe beyond the removed 120+150 ms dwell/fade, then inspect the drawn result. */
      async function observeHover() {
        await page.evaluate(async () => {
          const start = performance.now();
          do {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          } while (performance.now() - start < 500);
        });
        await drawn();
      }

      /** Cross the actual render loop; no delayed keyboard release or camera timing guess. */
      async function drawn() {
        await page.evaluate(async () => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        });
      }

      /** Save real scene bytes and reject errors or second-browser drift. */
      async function capture(id, pointer) {
        if (errors.length) throw new Error(errors.join("\n"));
        const bytes = await page.screenshot({ timeout: 120000 });
        const state = await page.evaluate(() => globalThis.__cutawayState());
        if (state.ghostStrength.length !== 8)
          throw new Error("Unit slot count changed");
        const file = `${output}/${id}.png`;
        if (repeat) {
          if (!bytes.equals(readFileSync(file)))
            throw new Error(`Capture drift: ${id}`);
        } else {
          writeFileSync(file, bytes);
          records.push({
            id,
            pointer,
            state,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          });
        }
        console.log(
          `${phase}/${id}: ${repeat ? "second browser byte-identical" : "captured"}`,
        );
        return bytes;
      }
      if (errors.length) throw new Error(errors.join("\n"));
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    `${output}/captures.json`,
    JSON.stringify({ sourceCommit, repeatedBrowsers: 2, records }, null, 2) +
      "\n",
  );
} finally {
  await server.close();
}
