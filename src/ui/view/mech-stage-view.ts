import type { LoadoutError } from "../../roster/model/loadout-error";
import type {
  MechLoadout,
  SinglePartSlot,
} from "../../roster/model/mech-loadout";
import { LOADOUT_FIELD_FOR_SLOT } from "../../roster/model/mech-loadout";
import type { MechPart } from "../../roster/model/mech-part";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import { utilitySlotsOf } from "../../roster/service/loadout-fit-service";
import type { SlotAnchor } from "../model/mech-preview-host";
import { SLOT_LABELS } from "./part-palette-view";

// ===========================================
// Types
// ===========================================

/** What the stage reports back to its owner. */
export interface MechStageViewHandlers {
  /**
   * A part was dropped on the mech. `utilityIndex` names the utility
   * slot it landed on, when it landed on one in particular.
   */
  readonly onDrop: (part: MechPart, utilityIndex?: number) => void;
  /** The player pressed the remove button on a fitted utility. */
  readonly onRemoveUtility: (index: number) => void;
}

// ===========================================
// Constants
// ===========================================

/** Pixels kept between two badges, and between a badge and the stage edge. */
const BADGE_GAP = 6;

/** Single-part slots in the order their badges stack before anchors arrive. */
const BADGE_SLOTS: readonly SinglePartSlot[] = [
  "back-weapon",
  "chassis",
  "arms",
  "arm-weapon",
  "legs",
];

// ===========================================
// MechStageView
// ===========================================

/**
 * The middle of the mech bay (#1145): the viewport a `MechPreviewHost`
 * draws the assembled mech into, a badge on every fitted part naming
 * it, a row of utility slots along the bottom, and the drop handling
 * that lets a part from the palette be dragged onto any of it.
 *
 * ```
 *   ┌ #mech-stage ───────────────────────────────────────────┐
 *   │                    ┌ BACK WEAPON ┐                      │
 *   │                    │ Missile Pod │◄── anchored to the   │
 *   │        ┌ ARMS ┐    └─────────────┘    part's silhouette │
 *   │        │Brace │      [ mech ]    ┌ ARM WEAPON ┐         │
 *   │        └──────┘                  │ Autocannon │         │
 *   │                    ┌ LEGS ┐      └────────────┘         │
 *   │                    │Strider                             │
 *   │  ┌ UTILITY 1 ──┐ ┌ UTILITY 2 ──┐                        │
 *   │  │ Radiator  × │ │ empty       │  ◄── drop targets too  │
 *   └──┴─────────────┴─┴─────────────┴────────────────────────┘
 * ```
 *
 * The badges are DOM anchored to projected world points (ADR 0007):
 * the host reports where each part landed after every draw, and the
 * badges follow. Before the first report — and in jsdom, where nothing
 * draws — they stack in a column so the slots are still there to read
 * and to drop on.
 *
 * A drop anywhere on the stage fits the dragged part into the slot it
 * is made for; a drop on a utility slot fits it into that slot. The
 * stage learns what is being dragged from its owner (`setDragging`)
 * rather than from the drop event, so the jsdom specs can dispatch a
 * plain `drop` and the real browser's `DataTransfer` is not required.
 */
export class MechStageView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: MechStageViewHandlers;
  private root: HTMLElement | undefined;
  private view: HTMLElement | undefined;
  private anchorLayer: HTMLElement | undefined;
  private utilities: HTMLElement | undefined;
  private badges = new Map<SinglePartSlot, HTMLElement>();
  private dragging: MechPart | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Drop and remove callbacks. */
  constructor(handlers: MechStageViewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the stage under `parent`; call `setLoadout` to label it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const stage = doc.createElement("section");
    stage.id = "mech-stage";
    stage.className = "tut-mech-bay__stage";
    stage.dataset.role = "mech-stage";

    const view = doc.createElement("div");
    view.className = "tut-mech-bay__stage-view";
    view.dataset.role = "preview-viewport";
    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "preview-empty";
    empty.textContent = "No preview available.";
    view.appendChild(empty);

    const anchors = doc.createElement("div");
    anchors.className = "tut-mech-bay__anchors";
    anchors.dataset.role = "slot-anchors";
    for (const slot of BADGE_SLOTS) {
      anchors.appendChild(this.badge(doc, slot));
    }

    const utilities = doc.createElement("div");
    utilities.className = "tut-mech-bay__utilities";
    utilities.dataset.role = "utility-slots";

    const hint = doc.createElement("p");
    hint.className = "tut-dim tut-mech-bay__drop-hint";
    hint.dataset.role = "drop-hint";
    hint.textContent = "Drag a part onto the mech to fit it";

    stage.append(view, anchors, utilities, hint);
    this.listen(stage, "dragover", (event) => {
      if (this.dragging) {
        event.preventDefault();
        stage.classList.add("is-over");
      }
    });
    this.listen(stage, "dragleave", (event) => {
      const to = (event as DragEvent).relatedTarget;
      if (!(to instanceof Node) || !stage.contains(to)) {
        stage.classList.remove("is-over");
      }
    });
    this.listen(stage, "drop", (event) => {
      event.preventDefault();
      stage.classList.remove("is-over");
      const part = this.dragging;
      if (!part) {
        return;
      }
      const chip = this.utilityChipOf(event.target);
      const index =
        chip !== undefined && part.slot === "utility"
          ? Number(chip.dataset.index)
          : undefined;
      this.handlers.onDrop(part, index);
    });
    this.listen(utilities, "click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest<HTMLElement>(
        '[data-action="remove-utility"]',
      );
      const chip = this.utilityChipOf(button);
      if (button && chip) {
        this.handlers.onRemoveUtility(Number(chip.dataset.index));
      }
    });

    parent.appendChild(stage);
    this.root = stage;
    this.view = view;
    this.anchorLayer = anchors;
    this.utilities = utilities;
  }

  /**
   * The element a preview host renders into, or undefined before mount.
   *
   * @returns The viewport element.
   */
  viewport(): HTMLElement | undefined {
    return this.view;
  }

  /**
   * Hides the "no preview" note, for when a host has taken the viewport.
   * The note is not removed: releasing the host puts the stage back to
   * an empty box, and a box with no explanation looks like a bug.
   */
  markAttached(): void {
    const empty = this.view?.querySelector<HTMLElement>(
      '[data-role="preview-empty"]',
    );
    if (empty) {
      empty.hidden = true;
    }
  }

  /** Names every badge after the draft's part and rebuilds the utility row. */
  setLoadout(loadout: MechLoadout, parts: PartCatalogue): void {
    for (const [slot, badge] of this.badges) {
      const id = loadout[LOADOUT_FIELD_FOR_SLOT[slot]];
      const part = parts.getPart(id);
      const name = badge.querySelector<HTMLElement>('[data-role="part-name"]');
      if (name) {
        name.textContent =
          part?.name ?? (id === "" ? "empty" : `${id} (unknown)`);
      }
      badge.dataset.partId = id;
    }
    this.renderUtilities(loadout, parts);
  }

  /** Moves each badge onto its part; an empty list stacks them again. */
  setAnchors(anchors: readonly SlotAnchor[]): void {
    if (!this.anchorLayer) {
      return;
    }
    const placed = new Set<SinglePartSlot>();
    for (const anchor of anchors) {
      const badge = this.badges.get(anchor.slot);
      if (!badge) {
        continue;
      }
      badge.style.left = `${String(Math.round(anchor.x))}px`;
      badge.style.top = `${String(Math.round(anchor.y))}px`;
      badge.dataset.anchored = "true";
      placed.add(anchor.slot);
    }
    for (const [slot, badge] of this.badges) {
      if (!placed.has(slot)) {
        badge.style.removeProperty("left");
        badge.style.removeProperty("top");
        delete badge.dataset.anchored;
      }
    }
    this.anchorLayer.classList.toggle("is-anchored", placed.size > 0);
    this.separateBadges();
  }

  /** Lights the slot a dragged part would land in, or clears it when the drag ends. */
  setDragging(part: MechPart | undefined): void {
    this.dragging = part;
    if (!this.root) {
      return;
    }
    if (part) {
      this.root.dataset.dragging = part.slot;
    } else {
      delete this.root.dataset.dragging;
      this.root.classList.remove("is-over");
    }
    for (const [slot, badge] of this.badges) {
      badge.dataset.target = part?.slot === slot ? "true" : "false";
    }
    for (const chip of this.utilityChips()) {
      chip.dataset.target = part?.slot === "utility" ? "true" : "false";
    }
  }

  /** Shows each error on the badge of the slot it concerns; errors with no slot go on the chassis. */
  setErrors(errors: readonly LoadoutError[]): void {
    const lines = new Map<string, string[]>();
    for (const error of errors) {
      const key = error.slot ?? "chassis";
      lines.set(key, [...(lines.get(key) ?? []), error.detail]);
    }
    for (const [slot, badge] of this.badges) {
      this.showErrors(badge, lines.get(slot) ?? []);
    }
    const chips = this.utilityChips();
    chips.forEach((chip, index) => {
      this.showErrors(chip, index === 0 ? (lines.get("utility") ?? []) : []);
    });
  }

  /** Removes the stage and every listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.view = undefined;
    this.anchorLayer = undefined;
    this.utilities = undefined;
    this.badges = new Map();
    this.dragging = undefined;
  }

  // ===========================================
  // DOM
  // ===========================================

  /** One slot badge: label, part name, error line. */
  private badge(doc: Document, slot: SinglePartSlot): HTMLElement {
    const badge = doc.createElement("div");
    badge.className = "tut-mech-bay__slot";
    badge.dataset.slot = slot;
    badge.dataset.row = slot;
    badge.dataset.target = "false";
    const label = doc.createElement("span");
    label.className = "tut-label";
    label.textContent = SLOT_LABELS[slot];
    const name = doc.createElement("span");
    name.className = "tut-mech-bay__slot-name";
    name.dataset.role = "part-name";
    name.dataset.field = slot;
    const error = doc.createElement("div");
    error.className = "tut-mech-bay__error";
    error.dataset.role = "slot-error";
    error.hidden = true;
    badge.append(label, name, error);
    this.badges.set(slot, badge);
    return badge;
  }

  /** One chip per utility slot the chassis has, filled or empty. */
  private renderUtilities(loadout: MechLoadout, parts: PartCatalogue): void {
    if (!this.utilities) {
      return;
    }
    const doc = this.utilities.ownerDocument;
    const slots = utilitySlotsOf(loadout, parts);
    const chips: HTMLElement[] = [];
    for (let index = 0; index < slots; index++) {
      const id = loadout.utilityIds[index];
      const chip = doc.createElement("div");
      chip.className = "tut-mech-bay__slot tut-mech-bay__utility";
      chip.dataset.slot = "utility";
      chip.dataset.row = `utility-${String(index)}`;
      chip.dataset.index = String(index);
      chip.dataset.target =
        this.dragging?.slot === "utility" ? "true" : "false";
      const label = doc.createElement("span");
      label.className = "tut-label";
      label.textContent = `${SLOT_LABELS.utility} ${String(index + 1)}`;
      const name = doc.createElement("span");
      name.className = "tut-mech-bay__slot-name";
      name.dataset.role = "part-name";
      name.dataset.field = `utility-${String(index)}`;
      chip.append(label, name);
      if (id === undefined) {
        chip.dataset.empty = "true";
        name.textContent = "empty";
        name.classList.add("tut-dim");
      } else {
        chip.dataset.empty = "false";
        chip.dataset.partId = id;
        name.textContent = parts.getPart(id)?.name ?? `${id} (unknown)`;
        const remove = doc.createElement("button");
        remove.type = "button";
        remove.className = "tut-btn tut-mech-bay__remove";
        remove.dataset.action = "remove-utility";
        remove.textContent = "×";
        remove.title = "Remove";
        remove.setAttribute("aria-label", `Remove ${name.textContent}`);
        chip.appendChild(remove);
      }
      const error = doc.createElement("div");
      error.className = "tut-mech-bay__error";
      error.dataset.role = "slot-error";
      error.hidden = true;
      chip.appendChild(error);
      chips.push(chip);
    }
    this.utilities.replaceChildren(...chips);
  }

  /**
   * Pushes anchored badges apart so none covers another (#1145). Two
   * parts can project to nearly the same point — the arm weapon hangs
   * beside the legs — and a badge that hides a badge is a slot the
   * player cannot read or drop on. Walked top to bottom: a badge that
   * overlaps one already placed moves below it, and then everything is
   * kept inside the stage. Measured from the live layout, so in jsdom,
   * where every box is empty, nothing moves.
   */
  private separateBadges(): void {
    if (!this.root) {
      return;
    }
    const stage = this.root.getBoundingClientRect();
    if (stage.width === 0 || stage.height === 0) {
      return;
    }
    const badges = [...this.badges.values()]
      .filter((badge) => badge.dataset.anchored === "true")
      .map((badge) => ({
        badge,
        x: Number.parseFloat(badge.style.left),
        y: Number.parseFloat(badge.style.top),
      }))
      .sort((a, b) => a.y - b.y);
    const placed: DOMRect[] = [];
    for (const entry of badges) {
      let rect = entry.badge.getBoundingClientRect();
      // Each pass drops the badge under the first badge it overlaps; one
      // pass per placed badge bounds the walk however they stack.
      for (const _ of placed) {
        const hit = placed.find((other) => overlaps(rect, other));
        if (!hit) {
          break;
        }
        entry.y += hit.bottom - rect.top + BADGE_GAP;
        entry.badge.style.top = `${String(Math.round(entry.y))}px`;
        rect = entry.badge.getBoundingClientRect();
      }
      // Inside the stage, whatever the projection said.
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;
      const x = Math.min(
        Math.max(entry.x, halfWidth + BADGE_GAP),
        stage.width - halfWidth - BADGE_GAP,
      );
      const y = Math.min(
        Math.max(entry.y, halfHeight + BADGE_GAP),
        stage.height - halfHeight - BADGE_GAP,
      );
      entry.badge.style.left = `${String(Math.round(x))}px`;
      entry.badge.style.top = `${String(Math.round(y))}px`;
      placed.push(entry.badge.getBoundingClientRect());
    }
  }

  /** Writes error lines into a badge's error slot, or hides it when there are none. */
  private showErrors(badge: HTMLElement, details: readonly string[]): void {
    const error = badge.querySelector<HTMLElement>('[data-role="slot-error"]');
    if (!error) {
      return;
    }
    const doc = badge.ownerDocument;
    error.replaceChildren(
      ...details.map((detail) => {
        const line = doc.createElement("div");
        line.textContent = detail;
        return line;
      }),
    );
    error.hidden = details.length === 0;
    badge.dataset.tone = details.length === 0 ? "ok" : "danger";
  }

  /** Every utility chip currently shown. */
  private utilityChips(): HTMLElement[] {
    return [
      ...(this.utilities?.querySelectorAll<HTMLElement>("[data-index]") ?? []),
    ];
  }

  /** The utility chip an event target sits in, if any. */
  private utilityChipOf(
    target: EventTarget | Element | null | undefined,
  ): HTMLElement | undefined {
    if (!(target instanceof Element)) {
      return undefined;
    }
    return target.closest<HTMLElement>("[data-index]") ?? undefined;
  }

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    event: string,
    handler: (event: Event) => void,
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}

// ===========================================
// Helpers
// ===========================================

/** Whether two boxes share any area. Empty boxes never do. */
function overlaps(a: DOMRect, b: DOMRect): boolean {
  return (
    a.width > 0 &&
    b.width > 0 &&
    a.left < b.right &&
    b.left < a.right &&
    a.top < b.bottom &&
    b.top < a.bottom
  );
}
