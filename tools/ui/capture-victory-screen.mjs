/* global document, requestAnimationFrame, window */
/**
 * Captures the end screen with its chronicle (#1179):
 *
 * - `docs/design/victory-screen.png`: a first-attempt platform victory
 *   with a full four-act chronicle, over the key art;
 * - `docs/design/victory-screen-last-hope.png`: the victory after Last
 *   Hope, the platform taken on its second assault;
 * - `docs/design/defeat-screen-chronicle.png`: a threat defeat twelve
 *   missions into Act II;
 * - `docs/design/victory-screen-720.png`: the first-attempt victory at
 *   1280×720, where the chronicle scrolls inside its own frame.
 *
 * Each campaign starts from a real new game in the page, is given its
 * last day's progress, chronicle and roster in Node, ended through the
 * shipped outcome service, and handed back to the page as its autosave.
 * Every variant is checked at 1280×720 and 1440×900: the page must not
 * scroll and the whole panel, its button included, must sit inside the
 * window, and no frame may spill its content (the lists scroll inside
 * their frames). The three named PNGs are the 1440×900 frames, where
 * the whole chronicle shows; `CAPTURE_EXTRA_DIR` also saves the rest.
 *
 * ```
 *   vite --port 4240 --strictPort &
 *   CAPTURE_BASE_URL=http://localhost:4240 node tools/ui/capture-victory-screen.mjs
 * ```
 */
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:4240";
const extraDir = process.env.CAPTURE_EXTRA_DIR;
/** The frame each doc render is taken at. */
const DOC_VIEWPORT = { width: 1440, height: 900 };
/** The one tight frame kept beside them, as `<file>-720.png`. */
const TIGHT_FILE = "victory-screen";
const SEED = 1179;
const SAVE_KEY = "tut:save:autosave";
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

// ===========================================
// The campaigns
// ===========================================

/** Every story win of a full campaign to the finale (arc §1's pace). */
const WINS_TO_THE_FINALE = [
  { storyId: "first-skyfall", act: "act-1", day: 2 },
  { storyId: "live-specimen", act: "act-1", day: 14 },
  { storyId: "intact-pod", act: "act-2", day: 38 },
  { storyId: "uplink", act: "act-3", day: 42 },
  { storyId: "great-hive", act: "act-3", day: 48 },
  { storyId: "great-hive", act: "act-3", day: 52 },
  { storyId: "great-hive", act: "act-3", day: 56 },
  { storyId: "launch-window", act: "act-3", day: 60 },
];
const WON_TO_THE_FINALE = [
  "first-skyfall",
  "live-specimen",
  "intact-pod",
  "uplink",
  "great-hive",
  "launch-window",
];
const FOUR_ACTS = [
  { act: "act-2", day: 14, missionsPlayed: 12 },
  { act: "act-3", day: 38, missionsPlayed: 32 },
  { act: "finale", day: 60, missionsPlayed: 47 },
];

/** A named broodmother that hunted the squad. */
const nemesis = (id, name, regionId) => ({
  id,
  speciesId: "broodmother",
  name,
  scar: "burned by the Hellfire battery",
  regionId,
  level: 2,
  escapes: 1,
});

/** The records each campaign's roster finished with, in roster order. */
const LATE_RECORDS = {
  mechs: [
    ["Hammerhead", 64, 44, 640],
    ["Lantern", 31, 29, 310],
    ["Anvil", 19, 15, 190],
    ["Kestrel", 8, 7, 80],
  ],
  squads: [
    ["Alpha", 23, 31, 230],
    ["Bravo", 17, 24, 170],
    ["Charlie", 6, 18, 60],
    ["Delta", 12, 11, 120],
  ],
};
const EARLY_RECORDS = {
  mechs: [
    ["Hammerhead", 21, 17, 210],
    ["Lantern", 6, 6, 60],
  ],
  squads: [
    ["Alpha", 9, 13, 90],
    ["Bravo", 4, 9, 40],
    ["Charlie", 1, 8, 10],
    ["Delta", 3, 4, 30],
  ],
};

const CAMPAIGNS = [
  {
    file: "victory-screen",
    kind: "victory",
    variant: "platform",
    tagline: "The platform burns in orbit. Earth holds.",
    acts: ["act-1", "act-2", "act-3", "finale"],
    day: 67,
    threat: 52,
    lost: 4,
    infested: 19,
    records: LATE_RECORDS,
    progress: {
      act: "finale",
      missionsPlayed: 50,
      missionsWon: 41,
      flags: ["uplink-won", "platform-approach", "campaign-won"],
      storyWon: [...WON_TO_THE_FINALE, "spore-platform"],
      chronicle: {
        acts: FOUR_ACTS,
        storyWins: [
          ...WINS_TO_THE_FINALE,
          { storyId: "spore-platform", act: "finale", day: 66 },
        ],
        nemesesKilled: [
          {
            id: "nemesis-1",
            name: "Old Scald",
            speciesId: "broodmother",
            day: 52,
          },
        ],
      },
      nemeses: [nemesis("nemesis-2", "Grey Widow", "west")],
    },
  },
  {
    file: "victory-screen-last-hope",
    kind: "victory",
    variant: "last-hope",
    tagline: "The last chance held. Earth holds.",
    acts: ["act-1", "act-2", "act-3", "finale"],
    day: 75,
    threat: 78,
    lost: 9,
    infested: 31,
    records: LATE_RECORDS,
    progress: {
      act: "finale",
      missionsPlayed: 53,
      missionsWon: 43,
      flags: [
        "uplink-won",
        "platform-approach",
        "platform-failed",
        "last-hope",
        "campaign-won",
      ],
      storyWon: [...WON_TO_THE_FINALE, "spore-platform"],
      chronicle: {
        acts: FOUR_ACTS,
        storyWins: [
          ...WINS_TO_THE_FINALE,
          { storyId: "spore-platform", act: "finale", day: 74 },
        ],
        nemesesKilled: [
          {
            id: "nemesis-1",
            name: "Old Scald",
            speciesId: "broodmother",
            day: 52,
          },
          {
            id: "nemesis-2",
            name: "Grey Widow",
            speciesId: "broodmother",
            day: 71,
          },
        ],
      },
      nemeses: [],
    },
  },
  {
    file: "defeat-screen-chronicle",
    kind: "defeat",
    variant: "threat-defeat",
    tagline: "Global threat reached 100, ending the campaign.",
    acts: ["act-1", "act-2"],
    day: 29,
    threat: 100,
    lost: 6,
    infested: 38,
    records: EARLY_RECORDS,
    progress: {
      act: "act-2",
      missionsPlayed: 24,
      missionsWon: 15,
      flags: [],
      storyWon: ["first-skyfall", "live-specimen"],
      chronicle: {
        acts: [{ act: "act-2", day: 14, missionsPlayed: 12 }],
        storyWins: WINS_TO_THE_FINALE.slice(0, 2),
        nemesesKilled: [],
      },
      nemeses: [nemesis("nemesis-1", "Old Scald", "east")],
    },
  },
];

/** `roster` with the records, mechs added by cloning the first one. */
const withRecords = (roster, records) => {
  const [firstMech] = roster.mechs;
  assert.ok(firstMech, "the new game has a mech");
  return {
    ...roster,
    mechs: records.mechs.map(([name, kills, missionsSurvived, xp], n) => ({
      ...(roster.mechs[n] ?? { ...firstMech, id: `mech-${String(90 + n)}` }),
      name,
      kills,
      missionsSurvived,
      xp,
    })),
    squads: roster.squads.map((squad, n) => {
      const record = records.squads[n];
      if (record === undefined) return squad;
      const [name, kills, missionsSurvived, xp] = record;
      return { ...squad, name, kills, missionsSurvived, xp };
    }),
  };
};

/** `map` with the first `lost` cities at 100 and the next ones infested. */
const withInfestation = (map, lost, infested) => ({
  ...map,
  cities: map.cities.map((city, n) => ({
    ...city,
    infestation: n < lost ? 100 : n < infested ? 25 + ((n * 7) % 50) : 0,
  })),
});

// ===========================================
// Capture
// ===========================================

// Load only simulation modules here; the browser renders the application.
const loader = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: "custom",
});
const browser = await chromium.launch({
  args: [
    "--use-angle=swiftshader",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const { applyOutcome } = await loader.ssrLoadModule(
    "/src/overworld/service/outcome-service.ts",
  );
  const page = await browser.newPage({ viewport: VIEWPORTS[0] });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(baseUrl);
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill(String(SEED));
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );
  const base = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );

  if (extraDir !== undefined) mkdirSync(extraDir, { recursive: true });
  for (const campaign of CAMPAIGNS) {
    const overworld = base.state.overworld;
    const state = applyOutcome({
      ...base.state,
      roster: withRecords(base.state.roster, campaign.records),
      overworld: {
        ...overworld,
        day: campaign.day,
        threat: campaign.threat,
        map: withInfestation(overworld.map, campaign.lost, campaign.infested),
        progress: {
          ...overworld.progress,
          ...campaign.progress,
          actStartedAt: 0,
        },
      },
    }).state;
    const outcome = state.overworld.outcome;
    assert.equal(outcome?.kind, campaign.kind, campaign.file);
    assert.deepEqual(
      outcome.summary.acts?.map((act) => act.act),
      campaign.acts,
      `${campaign.file}: every act recorded`,
    );

    await page.setViewportSize(VIEWPORTS[0]);
    await page.evaluate(
      ([key, save]) => {
        localStorage.setItem(key, JSON.stringify(save));
      },
      [SAVE_KEY, { ...base, state }],
    );
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute(
      "data-app-state",
      "ready",
    );
    await page.locator('[data-action="continue"]').click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-screen",
      "game-over",
    );
    const panel = page.locator("section.tut-game-over");
    await expect(panel).toHaveAttribute("data-variant", campaign.variant);
    await expect(page.locator('[data-field="outcome-tagline"]')).toHaveText(
      campaign.tagline,
    );
    await expect(page.locator(".tut-chronicle__act")).toHaveCount(
      campaign.acts.length,
    );
    if (campaign.kind === "victory") {
      await expect
        .poll(() =>
          page
            .locator('[data-role="outcome-art"]')
            .evaluate((img) => img.complete && img.naturalWidth),
        )
        .toBe(1536);
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      });
      const fit = await page.evaluate(() => {
        const scroller = document.scrollingElement;
        const rect = (selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return (
            box && {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
            }
          );
        };
        const acts = document.querySelector(".tut-chronicle__acts");
        // A frame whose content spills past it (the roll once ran over
        // the button) has a scroll height above its client height even
        // though nothing scrolls; the scrolling lists sit inside these.
        const spills = [
          "section.tut-game-over",
          ".tut-chronicle",
          ".tut-game-over__record",
          ".tut-roll",
        ].filter((selector) => {
          const frame = document.querySelector(selector);
          return frame !== null && frame.scrollHeight > frame.clientHeight + 1;
        });
        return {
          spills,
          pageScrolls:
            scroller.scrollHeight > window.innerHeight ||
            scroller.scrollWidth > window.innerWidth,
          panel: rect("section.tut-game-over"),
          button: rect('[data-action="main-menu"]'),
          timelineScrolls: acts ? acts.scrollHeight > acts.clientHeight : false,
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
        };
      });
      const label = `${campaign.file} @ ${String(viewport.width)}×${String(viewport.height)}`;
      assert.equal(fit.pageScrolls, false, `${label}: the page scrolls`);
      assert.ok(
        fit.panel.top >= 0 && fit.panel.bottom <= fit.innerHeight,
        `${label}: the panel leaves the window`,
      );
      assert.ok(
        fit.panel.left >= 0 && fit.panel.right <= fit.innerWidth,
        `${label}: the panel leaves the window`,
      );
      assert.deepEqual(fit.spills, [], `${label}: content spills its frame`);
      assert.ok(
        fit.button.bottom <= fit.panel.bottom,
        `${label}: the button is cut off`,
      );
      console.log(
        `${label}: panel ${String(Math.round(fit.panel.top))}–${String(Math.round(fit.panel.bottom))} of ${String(fit.innerHeight)}, timeline ${fit.timelineScrolls ? "scrolls inside its panel" : "fits"}`,
      );
      await page.mouse.move(0, 0);
      const isDoc = viewport.width === DOC_VIEWPORT.width;
      const path = isDoc
        ? `docs/design/${campaign.file}.png`
        : campaign.file === TIGHT_FILE
          ? `docs/design/${campaign.file}-720.png`
          : extraDir && `${extraDir}/${campaign.file}-720.png`;
      if (path) {
        await page.screenshot({ path, animations: "disabled" });
      }
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await loader.close();
}
