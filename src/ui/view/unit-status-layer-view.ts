import type { Team, UnitId } from "../../tactical/model/unit";
import type { ScreenAnchor } from "./radial-menu-view";

// ===========================================
// Types
// ===========================================

/** What one chip says about one unit. */
export interface UnitStatusChip {
  readonly unitId: UnitId;
  /** Where the top of the unit's model is on screen; the chip sits above it. */
  readonly anchor: ScreenAnchor;
  readonly name: string;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  /**
   * The unit's charges, in the register its card uses — `ammo 2 / 3`,
   * `heat 1 / 4` — or undefined for a unit that carries no pool.
   */
  readonly charge?: {
    readonly gauge: string;
    readonly value: number;
    readonly max: number;
  };
}

// ===========================================
// UnitStatusLayerView
// ===========================================

/**
 * The status chips above every visible unit while Shift is held (the
 * Executive Director's ask on #1113): name, a health bar and the
 * charge gauge, compact, and in the world rather than on a rail — DOM
 * anchored to the unit's head (ADR 0007), so it follows the unit and
 * the camera and leaves with the key.
 *
 * ```
 *        ┌ Hammerhead ────────┐
 *        │ ████████████░░░░░  │   80 / 80 as a bar
 *        │ heat 4 / 4         │
 *        └─────────┬──────────┘
 *                 (unit)
 * ```
 *
 * Presentation only: it takes chips and screen anchors and draws them;
 * the HUD decides which units are visible and where their heads are.
 * Chips are kept by unit id and moved in place, because `show` runs
 * once a frame while the key is held.
 */
export class UnitStatusLayerView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private readonly chips = new Map<UnitId, HTMLElement>();

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the (hidden) layer under `parent`; call `show` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.id = "unit-status-layer";
    root.className = "tut-status-layer";
    root.hidden = true;
    parent.appendChild(root);
    this.root = root;
  }

  /** Removes the layer. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.chips.clear();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Draws `chips`, one per unit, at their anchors; a unit missing from
   * the list loses its chip. Calling it again moves the chips in place.
   *
   * @param chips - What to show, for every unit that has a head on screen.
   */
  show(chips: readonly UnitStatusChip[]): void {
    const root = this.root;
    if (!root) {
      return;
    }
    const doc = root.ownerDocument;
    const seen = new Set<UnitId>();
    for (const chip of chips) {
      seen.add(chip.unitId);
      let element = this.chips.get(chip.unitId);
      if (element === undefined) {
        element = buildChip(doc, chip.unitId);
        root.appendChild(element);
        this.chips.set(chip.unitId, element);
      }
      fillChip(element, chip);
    }
    for (const [unitId, element] of this.chips) {
      if (!seen.has(unitId)) {
        element.remove();
        this.chips.delete(unitId);
      }
    }
    root.hidden = false;
    root.dataset.open = "true";
  }

  /** Hides the layer and forgets its chips. */
  hide(): void {
    const root = this.root;
    if (!root) {
      return;
    }
    root.hidden = true;
    delete root.dataset.open;
    root.replaceChildren();
    this.chips.clear();
  }

  /** True while chips are on screen. */
  get isOpen(): boolean {
    return this.root !== undefined && !this.root.hidden;
  }
}

// ===========================================
// Helpers
// ===========================================

/** One chip's DOM: name, bar, gauge. */
function buildChip(doc: Document, unitId: UnitId): HTMLElement {
  const chip = doc.createElement("div");
  chip.className = "tut-status-chip";
  chip.dataset.unitId = unitId;
  const name = doc.createElement("div");
  name.className = "tut-status-chip__name";
  name.dataset.field = "status-name";
  const bar = doc.createElement("div");
  bar.className = "tut-status-chip__bar";
  const fill = doc.createElement("div");
  fill.className = "tut-status-chip__fill";
  fill.dataset.field = "status-hp";
  bar.appendChild(fill);
  const gauge = doc.createElement("div");
  gauge.className = "tut-status-chip__gauge tut-mono";
  gauge.dataset.field = "status-charge";
  chip.append(name, bar, gauge);
  return chip;
}

/** Writes a chip's words, bar and position. */
function fillChip(element: HTMLElement, chip: UnitStatusChip): void {
  element.dataset.team = chip.team;
  element.style.left = `${String(chip.anchor.x)}px`;
  element.style.top = `${String(chip.anchor.y)}px`;
  const name = element.querySelector<HTMLElement>('[data-field="status-name"]');
  if (name && name.textContent !== chip.name) {
    name.textContent = chip.name;
  }
  const fill = element.querySelector<HTMLElement>('[data-field="status-hp"]');
  if (fill) {
    const share =
      chip.maxHp > 0 ? Math.max(0, Math.min(1, chip.hp / chip.maxHp)) : 0;
    fill.style.width = `${String(Math.round(share * 100))}%`;
    fill.dataset.hp = `${String(chip.hp)}/${String(chip.maxHp)}`;
    fill.dataset.tone = share > 0.5 ? "ok" : share > 0.25 ? "warn" : "danger";
  }
  const gauge = element.querySelector<HTMLElement>(
    '[data-field="status-charge"]',
  );
  if (gauge) {
    const text =
      chip.charge === undefined
        ? ""
        : `${chip.charge.gauge} ${String(chip.charge.value)} / ${String(chip.charge.max)}`;
    if (gauge.textContent !== text) {
      gauge.textContent = text;
    }
    gauge.hidden = chip.charge === undefined;
  }
}
