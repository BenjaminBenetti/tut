/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import captureConfig from "./capture-vite.config.mjs";

const output = "docs/design/diagnostics/1084/generated/cutaway";
mkdirSync(output, { recursive: true });
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const server = await createServer({
  ...captureConfig,
  server: {
    ...captureConfig.server,
    host: "127.0.0.1",
    port: 8796,
    strictPort: true,
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
      page.on("console", (m) => {
        if (
          m.type() === "error" ||
          /\[assets\].*failed to load/i.test(m.text())
        )
          errors.push(m.text());
      });
      let closed;
      for (const units of [0, 1, 2]) {
        await page.mouse.move(0, 0);
        const url = `http://127.0.0.1:8796/tools/art/preview/roof-cutaway.html?roof=pitched&place=johannesburg&units=${units}&yaw=0`;
        await page.goto(url, {
          timeout: 120000,
          waitUntil: "domcontentloaded",
        });
        await page
          .locator('body[data-ready="true"]')
          .waitFor({ timeout: 120000 });
        const state = await page.evaluate(() => ({ ...document.body.dataset }));
        if (
          state.radius !== "4" ||
          state.floor !== "0.175" ||
          Number(state.ghostCount) !== units
        )
          throw new Error("Accepted unit reveal settings or occupancy changed");
        const name = units === 0 ? "hip-closed" : `hip-${units}-squads`;
        const bytes = await page.screenshot();
        save(name, bytes, { url, ...state }, repeat);
        if (!units) closed = bytes;
        if (units === 2) {
          await page.keyboard.press("l");
          await page.locator('body[data-left="true"]').waitFor();
          await page.evaluate(async () => {
            for (let i = 0; i < 20; i++)
              await new Promise((resolve) => requestAnimationFrame(resolve));
          });
          const left = await page.screenshot();
          if (!left.equals(closed))
            throw new Error(
              "Hip roof did not close byte-identically after the force left",
            );
          save(
            "hip-force-left",
            left,
            { url, closesByteIdentically: true },
            repeat,
          );
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    `${output}/captures.json`,
    JSON.stringify(
      {
        sourceHead,
        renderer: "SwiftShader",
        repeatedBrowsers: 2,
        records,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await server.close();
}

/** Stores the first view and checks the next independently loaded browser against it. */
function save(name, bytes, state, repeat) {
  const path = `${output}/${name}.png`;
  if (repeat) {
    if (!bytes.equals(readFileSync(path)))
      throw new Error(`Capture drift: ${name}`);
  } else {
    writeFileSync(path, bytes);
    records.push({
      name,
      ...state,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  console.log(
    `${name}: ${repeat ? "second browser byte-identical" : "captured"}`,
  );
}
