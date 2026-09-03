import type { Result } from "../../core/model/result";
import { CoverLevel } from "../../mapgen/model/cover";
import type { AttackPreview } from "../../tactical/model/attack-preview";
import type { TacticalError } from "../../tactical/model/tactical-error";
import { describeTacticalError } from "../../tactical/model/tactical-error";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the preview reports back to its owner. */
export interface HitPreviewHandlers {
  /** The player confirmed the previewed attack. */
  readonly onConfirm: () => void;
}

/** What the preview shows: the target's name and the service's answer. */
export interface HitPreviewModel {
  readonly targetName: string;
  readonly preview: Result<AttackPreview, TacticalError>;
}

/** Cover level names for the chip. */
const COVER_NAMES: Readonly<Record<CoverLevel, string>> = {
  [CoverLevel.NONE]: "no cover",
  [CoverLevel.LOW]: "low cover",
  [CoverLevel.HIGH]: "high cover",
};

// ===========================================
// HitPreviewView
// ===========================================

/**
 * The numbers before committing to an attack (GDD §6.2): hit chance and
 * damage band straight from `previewAttack`, the terrain chips that
 * explain them, and a Fire button; or the service's refusal. Hidden
 * until a target is previewed.
 *
 * ```
 *   ┌ ATTACK · Swarmer ────────────┐
 *   │ 51%  hit      8–13 damage    │
 *   │ 7 tiles · low cover · +1 lvl │
 *   │                     [FIRE]   │
 *   └──────────────────────────────┘
 * ```
 */
export class HitPreviewView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: HitPreviewHandlers;
  private root: HTMLElement | undefined;
  private target: HTMLElement | undefined;
  private hit: HTMLElement | undefined;
  private damage: HTMLElement | undefined;
  private chips: HTMLElement | undefined;
  private error: HTMLElement | undefined;
  private fire: HTMLButtonElement | undefined;
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where Fire reports. */
  constructor(handlers: HitPreviewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the preview under `parent`, hidden; call `update` to show it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "hit-preview";
    section.className = "tut-panel tut-hud__preview";
    section.hidden = true;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    const target = doc.createElement("span");
    target.dataset.field = "target-name";
    title.append("Attack · ", target);
    const numbers = doc.createElement("div");
    numbers.className = "tut-row";
    const hit = doc.createElement("span");
    hit.className = "tut-data";
    hit.dataset.field = "hit-chance";
    const damage = doc.createElement("span");
    damage.className = "tut-data";
    damage.dataset.field = "damage-range";
    numbers.append(hit, damage);
    const chips = doc.createElement("div");
    chips.className = "tut-dim tut-mono";
    chips.dataset.field = "preview-terrain";
    const error = doc.createElement("p");
    error.className = "tut-dim";
    error.dataset.role = "preview-error";
    error.hidden = true;
    const fire = doc.createElement("button");
    fire.type = "button";
    fire.className = "tut-btn tut-btn--danger";
    fire.dataset.action = "confirm-attack";
    fire.textContent = "Fire";
    section.append(title, numbers, chips, error, fire);
    parent.appendChild(section);
    const onFire = (): void => {
      this.handlers.onConfirm();
    };
    fire.addEventListener("click", onFire);
    this.dispose = () => {
      fire.removeEventListener("click", onFire);
    };
    this.root = section;
    this.target = target;
    this.hit = hit;
    this.damage = damage;
    this.chips = chips;
    this.error = error;
    this.fire = fire;
  }

  /** Shows the model, or hides the preview for `undefined`. */
  update(model: HitPreviewModel | undefined): void {
    if (
      !this.root ||
      !this.target ||
      !this.hit ||
      !this.damage ||
      !this.chips ||
      !this.error ||
      !this.fire
    ) {
      return;
    }
    if (!model) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.target.textContent = model.targetName;
    if (!model.preview.ok) {
      this.hit.textContent = "—";
      this.damage.textContent = "—";
      this.chips.textContent = "";
      this.error.textContent = describeTacticalError(model.preview.error);
      this.error.hidden = false;
      this.fire.disabled = true;
      return;
    }
    const p = model.preview.value;
    this.hit.textContent = `${formatWhole(p.hitChance)}% hit`;
    this.damage.textContent = `${formatWhole(p.damage[0])}–${formatWhole(p.damage[1])} damage`;
    const chips = [
      `${formatWhole(p.distance)} tiles`,
      COVER_NAMES[p.cover],
      ...(p.flanked ? ["flanked"] : []),
      ...(p.elevation === 0
        ? []
        : [`${p.elevation > 0 ? "+" : ""}${formatWhole(p.elevation)} lvl`]),
    ];
    this.chips.textContent = chips.join(" · ");
    this.error.hidden = true;
    this.fire.disabled = false;
  }

  /** Removes the preview and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.target = undefined;
    this.hit = undefined;
    this.damage = undefined;
    this.chips = undefined;
    this.error = undefined;
    this.fire = undefined;
  }
}
