import { BIOME_IDS } from "../../content/model/biome-id";
import type { BiomeId } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { GenerationDiagnostics } from "../../mapgen/model/diagnostics";
import type { MapMetrics } from "../../mapgen/model/map-metrics";
import type { MapSizePreset } from "../../mapgen/model/map-recipe";
import { MAP_SIZE_PRESETS } from "../../mapgen/model/map-recipe";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { ASCII_LEGEND } from "../../mapgen/service/ascii-map-renderer";

// ===========================================
// Types
// ===========================================

/** What the controls say to generate. */
export interface PreviewControlsState {
  readonly seed: string;
  readonly biome: BiomeId;
  readonly settlement: SettlementScale;
  readonly size: MapSizePreset;
}

/** A finished generation for the panel to describe. */
export interface PreviewResult {
  readonly map: TacticalMap;
  readonly diagnostics: GenerationDiagnostics;
  readonly metrics: MapMetrics;
  readonly ascii: string;
  readonly elapsedMs: number;
}

/** Callbacks the screen raises. */
export interface MapgenPreviewScreenOptions {
  /** The user asked for a new map. */
  readonly onGenerate: (state: PreviewControlsState) => void;
  /** The level slider moved; `undefined` shows every level. */
  readonly onLevelChange: (maxLevel: number | undefined) => void;
}

// ===========================================
// MapgenPreviewScreen
// ===========================================

/**
 * The control panel of the map generation preview (ADR 0004 §7.5):
 * seed and parameter inputs, a level slider, and read-outs of the
 * generated map (counts, ASCII render, pass notes and timings). Plain
 * DOM, no generation logic; the entry script wires it to the generator
 * and the three.js view.
 *
 * ```
 *   ┌ controls ────────┐
 *   │ seed [____] [⟳]  │
 *   │ biome ▾ scale ▾  │
 *   │ size ▾ [Generate]│
 *   │ level ──●──── all│
 *   ├ stats ───────────┤
 *   ├ ascii (mono) ────┤
 *   └ notes ───────────┘
 * ```
 */
export class MapgenPreviewScreen {
  // ===========================================
  // Fields
  // ===========================================

  private readonly options: MapgenPreviewScreenOptions;
  private readonly seedInput: HTMLInputElement;
  private readonly biomeSelect: HTMLSelectElement;
  private readonly settlementSelect: HTMLSelectElement;
  private readonly sizeSelect: HTMLSelectElement;
  private readonly levelSlider: HTMLInputElement;
  private readonly levelLabel: HTMLSpanElement;
  private readonly stats: HTMLElement;
  private readonly ascii: HTMLPreElement;
  private readonly notes: HTMLElement;
  private readonly status: HTMLElement;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the panel into `root` with the initial control values. */
  constructor(
    root: HTMLElement,
    initial: PreviewControlsState,
    options: MapgenPreviewScreenOptions,
  ) {
    this.options = options;
    const doc = root.ownerDocument;

    const form = el(doc, "form", "tut-panel mapgen-controls");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.options.onGenerate(this.getState());
    });

    this.seedInput = el(doc, "input", "tut-input");
    this.seedInput.id = "seed";
    this.seedInput.value = initial.seed;
    const reroll = el(doc, "button", "tut-btn");
    reroll.type = "button";
    reroll.id = "reroll";
    reroll.textContent = "⟳";
    reroll.title = "Random seed";
    reroll.addEventListener("click", () => {
      this.seedInput.value = randomSeed(doc);
      this.options.onGenerate(this.getState());
    });
    form.appendChild(labelled(doc, "Seed", this.seedInput, reroll));

    this.biomeSelect = select(doc, "biome", BIOME_IDS, initial.biome);
    this.settlementSelect = select(
      doc,
      "settlement",
      SETTLEMENT_SCALES,
      initial.settlement,
    );
    this.sizeSelect = select(doc, "size", MAP_SIZE_PRESETS, initial.size);
    form.appendChild(labelled(doc, "Biome", this.biomeSelect));
    form.appendChild(labelled(doc, "Settlement", this.settlementSelect));
    form.appendChild(labelled(doc, "Size", this.sizeSelect));

    const generate = el(doc, "button", "tut-btn tut-btn-accent");
    generate.type = "submit";
    generate.id = "generate";
    generate.textContent = "Generate";
    form.appendChild(generate);

    this.levelSlider = el(doc, "input");
    this.levelSlider.type = "range";
    this.levelSlider.id = "level";
    this.levelSlider.min = "0";
    this.levelSlider.max = "0";
    this.levelSlider.value = "0";
    this.levelLabel = el(doc, "span", "mapgen-level-label");
    this.levelLabel.textContent = "all";
    this.levelSlider.addEventListener("input", () => {
      this.options.onLevelChange(this.currentMaxLevel());
      this.levelLabel.textContent = this.describeLevel();
    });
    form.appendChild(
      labelled(doc, "Levels", this.levelSlider, this.levelLabel),
    );

    this.status = el(doc, "div", "mapgen-status");
    this.status.id = "status";
    this.stats = el(doc, "dl", "tut-panel mapgen-stats");
    this.stats.id = "stats";
    this.ascii = el(doc, "pre", "tut-panel mapgen-ascii");
    this.ascii.id = "ascii";
    this.ascii.title = ASCII_LEGEND;
    this.notes = el(doc, "ol", "tut-panel mapgen-notes");
    this.notes.id = "notes";

    root.append(form, this.status, this.stats, this.ascii, this.notes);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Current control values. */
  getState(): PreviewControlsState {
    return {
      seed: this.seedInput.value.trim() || "seed",
      biome: this.biomeSelect.value as BiomeId,
      settlement: this.settlementSelect.value as SettlementScale,
      size: this.sizeSelect.value as MapSizePreset,
    };
  }

  /** Describes a generated map in the read-outs. */
  showResult(result: PreviewResult): void {
    const { map, diagnostics, metrics } = result;
    this.status.textContent = "";
    this.status.dataset.state = "ok";
    this.levelSlider.max = String(map.levels);
    this.levelSlider.value = String(map.levels);
    this.levelLabel.textContent = "all";

    const repairs =
      diagnostics.notes.filter((n) => n.pass === "connectivity").length - 1;
    const totalMs = diagnostics.timings.reduce(
      (sum, t) => sum + t.durationMs,
      0,
    );
    this.renderStats([
      ["Map", `${map.width}×${map.depth}×${map.levels}`],
      ["Tiles", String(map.tiles.length)],
      ["Buildings", String(map.buildings.length)],
      ["Props", String(map.props.length)],
      ["Connectors", String(map.connectors.length)],
      ["Objectives", String(map.hooks.objectives.length)],
      ["Repairs", String(Math.max(0, repairs))],
      [
        "Generated in",
        `${result.elapsedMs.toFixed(1)} ms (passes ${totalMs.toFixed(1)} ms)`,
      ],
      ["Open ground", `${metrics.openTiles} of ${metrics.groundTiles}`],
      ["Beside cover", percent(metrics.coverAdjacency)],
      ["Beside a wall", percent(metrics.wallAdjacency)],
      [
        "Cover per 100",
        `${metrics.highCoverPer100.toFixed(1)} high, ${metrics.lowCoverPer100.toFixed(1)} low`,
      ],
      [
        "Interior props",
        `${metrics.interiorPropsPerBuilding.toFixed(1)} per building`,
      ],
      [
        "Vertical",
        `${metrics.ramps} ramps, ${metrics.stairs} stairs, ${metrics.ladders} ladders, ${metrics.maxFloors} floors max`,
      ],
      [
        "Hatch space",
        `${metrics.hatchSpaceMin} min, ${metrics.hatchSpaceMean.toFixed(1)} mean`,
      ],
    ]);
    this.ascii.textContent = result.ascii;
    this.renderNotes(diagnostics);
  }

  /** Shows a generation failure in place of the read-outs. */
  showError(message: string): void {
    this.status.textContent = message;
    this.status.dataset.state = "error";
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** The slider as a maximum level, or undefined at the top of its range. */
  private currentMaxLevel(): number | undefined {
    const value = Number(this.levelSlider.value);
    return value >= Number(this.levelSlider.max) ? undefined : value;
  }

  /** Slider read-out text. */
  private describeLevel(): string {
    const max = this.currentMaxLevel();
    return max === undefined ? "all" : `≤ ${max}`;
  }

  /** Rewrites the stats definition list. */
  private renderStats(rows: readonly (readonly [string, string])[]): void {
    const doc = this.stats.ownerDocument;
    this.stats.replaceChildren();
    for (const [term, value] of rows) {
      const dt = el(doc, "dt");
      dt.textContent = term;
      const dd = el(doc, "dd");
      dd.textContent = value;
      this.stats.append(dt, dd);
    }
  }

  /** Rewrites the pass notes and timings. */
  private renderNotes(diagnostics: GenerationDiagnostics): void {
    const doc = this.notes.ownerDocument;
    this.notes.replaceChildren();
    for (const timing of diagnostics.timings) {
      const item = el(doc, "li", "mapgen-note mapgen-note-pass");
      item.textContent = `${timing.pass}: ${timing.durationMs.toFixed(1)} ms`;
      this.notes.appendChild(item);
      for (const note of diagnostics.notes.filter(
        (n) => n.pass === timing.pass,
      )) {
        const line = el(doc, "li", "mapgen-note");
        const where = note.at
          ? ` @ ${note.at.x},${note.at.y},${note.at.z}`
          : "";
        line.textContent = `${note.message}${where}`;
        this.notes.appendChild(line);
      }
    }
  }
}

// ===========================================
// DOM helpers
// ===========================================

/** Creates an element with an optional class list. */
function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) {
    element.className = className;
  }
  return element;
}

/** A labelled row of controls. */
function labelled(
  doc: Document,
  text: string,
  ...controls: HTMLElement[]
): HTMLElement {
  const row = el(doc, "label", "mapgen-row");
  const caption = el(doc, "span", "mapgen-caption");
  caption.textContent = text;
  row.append(caption, ...controls);
  return row;
}

/** A select over fixed options. */
function select(
  doc: Document,
  id: string,
  values: readonly string[],
  initial: string,
): HTMLSelectElement {
  const element = el(doc, "select", "tut-input");
  element.id = id;
  for (const value of values) {
    const option = el(doc, "option");
    option.value = value;
    option.textContent = value;
    option.selected = value === initial;
    element.appendChild(option);
  }
  return element;
}

/**
 * A memorable random seed for the reroll button. The preview is
 * presentation, so `crypto` is the sanctioned entropy source here; the
 * generator itself never sees it, only the resulting seed string.
 */
function randomSeed(doc: Document): string {
  const bytes = new Uint8Array(4);
  doc.defaultView?.crypto.getRandomValues(bytes);
  return `seed-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Formats a share in [0, 1] as a percentage. */
function percent(share: number): string {
  return `${(100 * share).toFixed(1)} %`;
}
