/**
 * Constructed #911 art fixtures, not proof that MapGen reserves a landing site.
 * Run: node tools/art/preview/capture-dropship.mjs
 * Each fixed camera is captured in three separate browser launches before its
 * frame is used as evidence. The shared scene awaits every GLTF and draws it.
 */
/* global document, requestAnimationFrame */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, serveRepo } from "./serve-repo.mjs";

const PORT = 8796;
const scratch = join(REPO_ROOT, ".git/art-911/layouts");
const output = join(REPO_ROOT, "docs/design/diagnostics/911");
const records = JSON.parse(
  readFileSync(join(REPO_ROOT, "tools/art/placeholders.manifest.json"), "utf8"),
);
const models = new Map(records.map((entry) => [entry.id, entry.path]));

/** Resolve actual registered art; the layout never invents a model path. */
function place(model, x, z, y = 0, yaw = 0) {
  const path = models.get(model);
  if (!path) throw new Error(`Unregistered model ${model}`);
  return { model: path, x, y, z, yaw };
}

/** Flat level-zero support with a separate, connected four-by-four boarding patch. */
function layout(kind, yaw) {
  const placements = [];
  for (let x = -6; x <= 5; x++) {
    for (let z = -7; z <= 5; z++) {
      const paved = kind === "town" && x < 4;
      const ground = paved ? "tile.city.sidewalk" : "tile.ground.grass";
      // The raw reference slabs are .12/.05 high; the game ground top is .15.
      // Extend their sides from y=0, preserving the surface's full tile UVs.
      placements.push({
        ...place(ground, x + 0.5, z + 0.5),
        scale: { x: 1, y: paved ? 1.25 : 3, z: 1 },
      });
    }
  }
  // Reservation min=(-2,-2), size=5x7: the MapGen-agreed pivot formula.
  placements.push(place("tdf.dropship", 0.5, 1.5, 0.15));
  // Boarding columns x=-1..2, z=-6..-3; none touches the hull's interior.
  placements.push(place("tdf.mech.assembled-a", -0.5, -3.5, 0.15));
  placements.push(place("tdf.infantry.rifle", 1.5, -3.5, 0.15));
  placements.push(place("tdf.infantry.engineer", 1.5, -5.5, 0.15));
  placements.push(place("prop.crate", -2.5, -5.5, 0.15));
  if (kind === "rural") {
    placements.push(place("prop.tree-oak", -4.5, 2.5, 0.15));
    placements.push(place("prop.tree-pine", 4.5, 2.5, 0.15));
    placements.push(place("prop.fence", -4.5, -2.5, 0.15));
  } else {
    // A small neighbouring building stops at x=-3, leaving the circulation column.
    for (let x = -6; x < -3; x++) {
      for (let z = 1; z < 4; z++) {
        placements.push(place("building.floor", x + 0.5, z + 0.5, 0.15));
        placements.push(place("building.roof", x + 0.5, z + 0.5, 1.65));
      }
      placements.push(
        place(
          x === -5 ? "building.wall-door" : "building.wall-window",
          x + 0.5,
          1,
          0.15,
        ),
      );
      placements.push(place("building.wall-window", x + 0.5, 4, 0.15));
    }
    for (let z = 1; z < 4; z++) {
      placements.push(place("building.wall-window", -6, z + 0.5, 0.15, 90));
      placements.push(place("building.wall-window", -3, z + 0.5, 0.15, 90));
    }
  }
  return { size: 960, px: 64, yaw, cx: 0.5, cy: 1, cz: -0.5, placements };
}

/** Hash full PNG bytes rather than comparing file sizes or tolerating drift. */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Render all fixed poses with real assets, checking reproducibility before saving evidence. */
async function main() {
  mkdirSync(scratch, { recursive: true });
  mkdirSync(output, { recursive: true });
  const server = await serveRepo(PORT);
  const captures = [];
  try {
    for (const kind of ["rural", "town"]) {
      for (const yaw of [45, 225]) {
        const name = `${kind}-yaw${yaw}`;
        writeFileSync(
          join(scratch, `${name}.json`),
          JSON.stringify(layout(kind, yaw)),
        );
        const runs = [];
        let reference;
        for (let run = 0; run < 3; run++) {
          const browser = await chromium.launch({
            args: [
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
            ],
          });
          try {
            const page = await browser.newPage({
              viewport: { width: 960, height: 960 },
            });
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
              if (message.type() === "error") errors.push(message.text());
            });
            await page.goto(
              `http://127.0.0.1:${PORT}/tools/art/preview/scene.html?layout=/.git/art-911/layouts/${name}.json`,
            );
            await page.waitForFunction(() => document.title === "READY", null, {
              timeout: 120000,
            });
            await page.evaluate(() => new Promise(requestAnimationFrame));
            const frame = await page.screenshot({ timeout: 120000 });
            if (errors.length) throw new Error(errors.join("\n"));
            if (reference && !reference.equals(frame))
              throw new Error(`${name} changed on run ${run + 1}`);
            reference ??= frame;
            runs.push(sha256(frame));
          } finally {
            await browser.close();
          }
        }
        writeFileSync(join(output, `${name}.png`), reference);
        captures.push({
          file: `${name}.png`,
          kind,
          yaw,
          runs,
          byteIdentical: true,
        });
        console.log(`${name}: three separate launches, byte-identical`);
      }
    }
    writeFileSync(
      join(output, "captures.json"),
      JSON.stringify(
        {
          fixture:
            "Constructed art fixture; site reservation remains MapGen work",
          source: "tools/art/preview/capture-dropship.mjs",
          supportLayer: 0,
          groundTop: 0.15,
          hull: {
            minX: -2,
            minZ: -2,
            width: 5,
            depth: 7,
            pivot: [0.5, 0.15, 1.5],
            yaw: 0,
          },
          boarding: { minX: -1, minZ: -6, width: 4, depth: 4, count: 16 },
          viewport: [960, 960],
          pixelsPerUnit: 64,
          captures,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    server.close();
  }
}

await main();
