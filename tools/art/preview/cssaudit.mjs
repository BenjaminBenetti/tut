#!/usr/bin/env node
/**
 * Reports CSS rules that ask for a grid and do not get one.
 *
 *   node tools/art/preview/cssaudit.mjs
 *
 * A declaration that loses to a more specific rule is silent: the code
 * reads correctly, the screen ignores it. `.tut-list > li` sets
 * `display: flex` and out-ranks a plain row class, which left the
 * mission list's `grid-template-columns` dead for months and its columns
 * ragged (#683, style guide §5).
 *
 * Walks every stylesheet rule declaring `display: grid` or
 * `grid-template-columns`, queries its selector on each screen, and
 * prints any whose elements compute something else. A closed modal
 * computing `none` is expected and is the only hit today.
 *
 * Needs `@playwright/test`.
 */
import { spawn } from "node:child_process";
const PORT = 4272,
  BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(
  "node_modules/.bin/vite",
  ["--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
  { cwd: "/workspaces/tut", stdio: "ignore" },
);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* wait */
  }
  await new Promise((r) => setTimeout(r, 500));
}
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const audit = `(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (!rule.style || !rule.selectorText) continue;
      const wants = rule.style.getPropertyValue("display");
      const tracks = rule.style.getPropertyValue("grid-template-columns");
      if (wants !== "grid" && !tracks) continue;
      let els = [];
      try { els = [...document.querySelectorAll(rule.selectorText)]; } catch { continue; }
      if (els.length === 0) continue;
      const got = getComputedStyle(els[0]).display;
      const gotTracks = getComputedStyle(els[0]).gridTemplateColumns;
      const dead =
        (wants === "grid" && got !== "grid") ||
        (tracks && got !== "grid" && got !== "inline-grid");
      if (dead) out.push({ selector: rule.selectorText, wants: wants || "(tracks only)", got, gotTracks: gotTracks.slice(0, 40), n: els.length });
    }
  }
  return out;
})()`;

async function walk(label) {
  const found = await page.evaluate(audit);
  for (const f of found) {
    console.log(`  [${label}] ${f.selector}`);
    console.log(
      `      asks display:${f.wants}  computes:${f.got}   (${f.n} element(s))`,
    );
  }
  if (found.length === 0) console.log(`  [${label}] no dead grid declarations`);
}

await page.goto(BASE);
await page.waitForFunction('document.body.dataset.appState === "ready"', null, {
  timeout: 60000,
});
await walk("menu");
await page.locator('[data-field="seed"]').fill("4242");
await page.locator('[data-action="new-game"]').click();
await page.waitForFunction(
  'document.body.dataset.screen === "overworld"',
  null,
  { timeout: 30000 },
);
const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
for (let d = 0; d < 25; d++) {
  if (await choice.first().isVisible()) await choice.first().click();
  await page.locator('[data-action="advance-day"]').click();
  await page.waitForTimeout(90);
}
if (await choice.first().isVisible()) await choice.first().click();
await page.waitForTimeout(800);
await walk("overworld");
await page
  .locator('[data-role="mission-list"] [data-mission-id]')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(600);
await walk("overworld+city");
const id = await rows.first().getAttribute("data-mission-id");
await page.evaluate((i) => globalThis.__tut__?.startTacticalMission(i), id);
await page.waitForFunction(
  'document.body.dataset.screen === "tactical"',
  null,
  { timeout: 30000 },
);
await page.locator("#tactical-viewport canvas").waitFor();
await page.waitForTimeout(2500);
await page.evaluate(`globalThis.__tutTactical__?.selectUnit('unit-1')`);
await page.waitForTimeout(1000);
await walk("tactical");
await browser.close();
server.kill();
