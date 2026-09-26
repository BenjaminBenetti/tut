import { BIOME_INFO } from "../../content/data/biome-info";
import type { City, CityId } from "../../overworld/model/city";
import { MAX_INFESTATION } from "../../overworld/model/city";
import type { HiveTuning } from "../../overworld/model/hive-tuning";
import type { RegionId } from "../../overworld/model/region";
import {
  citiesInRegion,
  findRegion,
} from "../../overworld/service/earth-map-query-service";
import { regionInfestation } from "../../overworld/service/threat-service";
import type { GameState } from "../../save/model/game-state";
import type { OverworldSelectionSnapshot } from "../model/overworld-selection";
import { formatWhole } from "../service/format";
import { hiveText } from "../service/hive-text";
import type { ThreatTone } from "../service/threat-band";
import { threatTone } from "../service/threat-band";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

/** What the region panel reports back to its owner. */
export interface RegionPanelViewHandlers {
  /** The player clicked a city row. */
  readonly onSelectCity: (cityId: CityId) => void;
}

/** What the region panel reads besides the campaign. */
export interface RegionPanelViewDeps {
  /** How fast a hive levels, for the hive line (campaign arc §6.5). */
  readonly hiveTuning: Pick<HiveTuning, "difficultyStepDays">;
}

// ===========================================
// Constants
// ===========================================

/** What an undetected city's infestation cell reads (GDD §5.3). */
export const UNDETECTED_INFESTATION = "?";

/** Meter modifier per infestation band: the style guide's status tints. */
const METER_CLASS: Readonly<Record<ThreatTone, string>> = {
  ok: "tut-meter--ok",
  warn: "tut-meter--warn",
  danger: "tut-meter--danger",
};

// ===========================================
// RegionPanelView
// ===========================================

/**
 * The Situation panel's region card (#1154, GDD §5.1): the selected
 * region's name and biome, its worst and mean infestation with a meter
 * on the worst, the region's hive and its level when it holds one
 * (campaign arc §6.5), and one row per city with that city's scale and
 * infestation. The selected city's row is `aria-current`; clicking a
 * row selects that city. Built once in `mount`; `update` rewrites the
 * values and reuses rows, so a tick never rebuilds it.
 *
 * ```
 *   ┌ REGION ─────────────────────────────────────┐
 *   │ EAST ASIA                                   │
 *   │ Biome  Temperate   Worst 62   Mean 41       │
 *   │ ▮▮▮▮▮▮░░░░                                  │
 *   │ ⬡ Hive (level 2)          (only with a hive) │
 *   │ ▸ Tokyo      city   62                      │
 *   │   Seoul      city   37                      │
 *   │   Beijing    city   24                      │
 *   └─────────────────────────────────────────────┘
 * ```
 */
export class RegionPanelView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: RegionPanelViewHandlers;
  private readonly deps: RegionPanelViewDeps;
  private root: HTMLElement | undefined;
  private name: HTMLElement | undefined;
  private biome: HTMLElement | undefined;
  private worst: HTMLElement | undefined;
  private mean: HTMLElement | undefined;
  private meter: HTMLElement | undefined;
  private fill: HTMLElement | undefined;
  private hive: HTMLElement | undefined;
  private hiveLabel: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private body: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly rows = new Map<CityId, HTMLElement>();
  private onClick: ((event: Event) => void) | undefined;
  private onKey: ((event: KeyboardEvent) => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Callback for the city rows.
   * @param deps - Tuning the hive line reads.
   */
  constructor(handlers: RegionPanelViewHandlers, deps: RegionPanelViewDeps) {
    this.handlers = handlers;
    this.deps = deps;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the card under `parent` with empty values; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "region-panel";
    section.className = "tut-region";
    // Focusable so the city wheel's Region entry can land here (#1154).
    section.tabIndex = -1;

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Region";

    const name = doc.createElement("div");
    name.id = "selected-region";
    name.className = "tut-region__name";
    name.dataset.field = "region-name";
    name.textContent = "—";

    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-region";
    empty.textContent = "Select a region on the map.";

    const body = doc.createElement("div");
    body.className = "tut-stack";
    body.hidden = true;

    const grid = doc.createElement("dl");
    grid.className = "tut-kv";
    const biome = this.addField(doc, grid, "Biome", "biome");
    const worst = this.addField(doc, grid, "Worst", "worst");
    const mean = this.addField(doc, grid, "Mean", "mean");

    const meter = doc.createElement("div");
    meter.className = "tut-meter";
    meter.dataset.field = "worst-meter";
    const fill = doc.createElement("div");
    fill.className = "tut-meter__fill";
    meter.appendChild(fill);

    const hive = doc.createElement("p");
    hive.className = "tut-region__hive";
    hive.dataset.field = "hive";
    hive.hidden = true;
    const hiveLabel = doc.createElement("span");
    hiveLabel.dataset.field = "hive-label";
    hive.append(iconGlyph(doc, "marker-hive"), hiveLabel);

    const list = doc.createElement("ul");
    list.className = "tut-list tut-region__cities";
    list.dataset.role = "city-list";

    body.append(grid, meter, hive, list);
    section.append(title, name, empty, body);
    parent.appendChild(section);

    this.onClick = (event: Event): void => {
      const cityId = rowCityId(event.target);
      if (cityId !== undefined) {
        this.handlers.onSelectCity(cityId);
      }
    };
    this.onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const cityId = rowCityId(event.target);
      if (cityId !== undefined) {
        event.preventDefault();
        this.handlers.onSelectCity(cityId);
      }
    };
    list.addEventListener("click", this.onClick);
    list.addEventListener("keydown", this.onKey);

    this.root = section;
    this.name = name;
    this.biome = biome;
    this.worst = worst;
    this.mean = mean;
    this.meter = meter;
    this.fill = fill;
    this.hive = hive;
    this.hiveLabel = hiveLabel;
    this.list = list;
    this.body = body;
    this.empty = empty;
  }

  /**
   * Shows the selected region from `state`. With no campaign or no
   * region the card shows its placeholder; a region id that is not on
   * the map (a stale selection after a load) is treated as none.
   */
  update(
    state: GameState | undefined,
    selection: OverworldSelectionSnapshot,
  ): void {
    if (!this.body || !this.empty || !this.name || !this.list) {
      return;
    }
    const region =
      state && selection.regionId !== undefined
        ? findRegion(state.overworld.map, selection.regionId)
        : undefined;
    if (!state || !region) {
      this.setText(this.name, "—");
      this.body.hidden = true;
      this.empty.hidden = false;
      this.clearRows();
      return;
    }
    const cities = citiesInRegion(state.overworld.map, region.id);
    const worst = Math.max(0, ...cities.map((city) => city.infestation));
    const environment = BIOME_INFO[region.biome];
    this.setText(this.name, region.name);
    this.setText(this.biome, environment.name);
    if (this.biome) this.biome.title = environment.description;
    this.setText(this.worst, formatWhole(worst));
    this.setText(
      this.mean,
      formatWhole(regionInfestation(state.overworld.map, region.id)),
    );
    this.updateMeter(worst);
    this.updateHive(state, region.id);
    this.updateRows(cities, selection.cityId);
    this.body.hidden = false;
    this.empty.hidden = true;
  }

  /** Moves keyboard focus to the card, scrolling it into view where the platform can. */
  focus(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    if (typeof root.scrollIntoView === "function") {
      root.scrollIntoView({ block: "nearest" });
    }
    root.focus();
  }

  /** Removes the card and its listeners. */
  unmount(): void {
    if (this.list) {
      if (this.onClick) this.list.removeEventListener("click", this.onClick);
      if (this.onKey) this.list.removeEventListener("keydown", this.onKey);
    }
    this.root?.remove();
    this.root = undefined;
    this.name = undefined;
    this.biome = undefined;
    this.worst = undefined;
    this.mean = undefined;
    this.meter = undefined;
    this.fill = undefined;
    this.hive = undefined;
    this.hiveLabel = undefined;
    this.list = undefined;
    this.body = undefined;
    this.empty = undefined;
    this.rows.clear();
    this.onClick = undefined;
    this.onKey = undefined;
  }

  // ===========================================
  // Helpers
  // ===========================================

  /** Appends a label/value pair to `grid` and returns the value cell. */
  private addField(
    doc: Document,
    grid: HTMLElement,
    label: string,
    field: string,
  ): HTMLElement {
    const term = doc.createElement("dt");
    term.className = "tut-label";
    term.textContent = label;
    const value = doc.createElement("dd");
    value.className = "tut-mono";
    value.dataset.field = field;
    value.textContent = "—";
    grid.append(term, value);
    return value;
  }

  /** Fills the worst-city meter and tints it by that value's band. */
  private updateMeter(worst: number): void {
    if (!this.meter || !this.fill) {
      return;
    }
    const tone = threatTone(worst);
    this.meter.className = `tut-meter ${METER_CLASS[tone]}`;
    this.meter.dataset.tone = tone;
    this.fill.style.setProperty(
      "--value",
      `${String((100 * worst) / MAX_INFESTATION)}%`,
    );
  }

  /**
   * Shows the region's hive and its level today, or hides the line when
   * the region holds none.
   */
  private updateHive(state: GameState, regionId: RegionId): void {
    if (!this.hive) {
      return;
    }
    const text = hiveText(state.overworld, regionId, this.deps.hiveTuning);
    this.hive.hidden = text === undefined;
    this.setText(this.hiveLabel, text?.label ?? "");
    if (text === undefined) {
      this.hive.removeAttribute("title");
    } else {
      this.hive.title = text.detail;
    }
  }

  /** Syncs one row per city, in region order, marking the selected one current. */
  private updateRows(
    cities: readonly City[],
    selectedCityId: CityId | undefined,
  ): void {
    const list = this.list;
    if (!list) {
      return;
    }
    const doc = list.ownerDocument;
    const keep = new Set<CityId>();
    for (const city of cities) {
      keep.add(city.id);
      let row = this.rows.get(city.id);
      if (!row) {
        row = this.createRow(doc, city.id);
        this.rows.set(city.id, row);
      }
      this.fillRow(row, city);
      if (city.id === selectedCityId) {
        row.setAttribute("aria-current", "true");
      } else {
        row.removeAttribute("aria-current");
      }
      list.appendChild(row);
    }
    for (const [id, row] of this.rows) {
      if (!keep.has(id)) {
        row.remove();
        this.rows.delete(id);
      }
    }
  }

  /** Drops every row: the card is showing its placeholder. */
  private clearRows(): void {
    for (const row of this.rows.values()) {
      row.remove();
    }
    this.rows.clear();
  }

  /** A row skeleton with name, scale and infestation cells; values come from `fillRow`. */
  private createRow(doc: Document, cityId: CityId): HTMLElement {
    const row = doc.createElement("li");
    row.className = "tut-region__city";
    row.dataset.cityId = cityId;
    row.dataset.action = "select-city";
    row.tabIndex = 0;
    const name = doc.createElement("span");
    name.dataset.field = "city-name";
    const scale = doc.createElement("span");
    scale.className = "tut-data";
    scale.dataset.field = "city-scale";
    const infestation = doc.createElement("span");
    infestation.className = "tut-mono";
    infestation.dataset.field = "city-infestation";
    row.append(name, scale, infestation);
    return row;
  }

  /**
   * Writes a city's cells into an existing row, touching only changed
   * text. A city the player has not detected (GDD §5.3) shows
   * `UNDETECTED_INFESTATION` with no tone: its infestation is hidden,
   * whether it is clean or quietly infested.
   */
  private fillRow(row: HTMLElement, city: City): void {
    const cells = row.querySelectorAll<HTMLElement>("[data-field]");
    const values: Record<string, string> = {
      "city-name": city.name,
      "city-scale": city.scale,
      "city-infestation": city.detected
        ? formatWhole(city.infestation)
        : UNDETECTED_INFESTATION,
    };
    for (const cell of cells) {
      const field = cell.dataset.field ?? "";
      this.setText(cell, values[field] ?? "");
      if (field === "city-infestation") {
        if (city.detected) {
          cell.dataset.tone = threatTone(city.infestation);
        } else {
          delete cell.dataset.tone;
        }
      }
    }
  }

  /** Writes text only when it changed, so unchanged nodes are left alone. */
  private setText(element: HTMLElement | undefined, text: string): void {
    if (element && element.textContent !== text) {
      element.textContent = text;
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/** The city id of the row an event landed in, or undefined outside one. */
function rowCityId(target: EventTarget | null): CityId | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  return target.closest<HTMLElement>("[data-city-id]")?.dataset.cityId;
}
