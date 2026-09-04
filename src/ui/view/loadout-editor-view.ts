import type { LoadoutError } from "../../roster/model/loadout-error";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { LOADOUT_FIELD_FOR_SLOT } from "../../roster/model/mech-loadout";
import type { MechPart, PartId, PartSlot } from "../../roster/model/mech-part";
import { isChassisPart } from "../../roster/model/mech-part";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import { partThumbnail } from "../data/part-thumbnail-table";
import { thumbnailUrl } from "../data/thumbnail-manifest";
import { formatCredits } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the editor reports back to its owner. */
export interface LoadoutEditorViewHandlers {
  /** The draft changed; the owner validates it and calls `setErrors`. */
  readonly onChange: (loadout: MechLoadout) => void;
}

/** Single-part slots the editor shows below the chassis, in mech-bay order. */
const COMPONENT_SLOTS = ["legs", "arms", "arm-weapon", "back-weapon"] as const;

/** Slot labels for the pickers. */
const SLOT_LABELS: Readonly<Record<PartSlot, string>> = {
  chassis: "Chassis",
  legs: "Legs",
  arms: "Arms",
  "arm-weapon": "Arm weapon",
  "back-weapon": "Back weapon",
  utility: "Utility",
};

/** Edge of a part thumbnail in CSS pixels; the assets are 128 px square. */
const THUMB_PX = 48;

/** `value` of the picker option that leaves a utility slot empty. */
const EMPTY_OPTION = "";

// ===========================================
// LoadoutEditorView
// ===========================================

/**
 * The mech bay's left half (GDD §5.8): a name field, a chassis picker,
 * one picker per single-part slot, and as many utility pickers as the
 * chosen chassis has slots. Every picker lists the catalogue's parts
 * for its slot as `Name · ¢cost`. A change rebuilds the draft and hands
 * it to the owner; validation never happens here, the owner feeds the
 * resulting errors back through `setErrors` and they render beside the
 * slot they concern.
 *
 * ```
 *   ┌ Loadout ──────────────────────────────────┐
 *   │ Name        [Skirmisher________]           │
 *   │ Chassis     [Vanguard · ¢1,200 ▾]          │
 *   │ Legs        [Strider · ¢350 ▾]   ⚠ error   │
 *   │ …                                          │
 *   │ Utility 1   [Radiator · ¢250 ▾]            │
 *   │ Utility 2   [(empty) ▾]                    │
 *   └────────────────────────────────────────────┘
 * ```
 */
export class LoadoutEditorView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: LoadoutEditorViewHandlers;
  private readonly parts: PartCatalogue;
  /** One thumbnail per picker row, by the picker's key. */
  private thumbs = new Map<string, HTMLImageElement>();
  private root: HTMLElement | undefined;
  private form: HTMLElement | undefined;
  private nameInput: HTMLInputElement | undefined;
  private pickers = new Map<string, HTMLSelectElement>();
  private errorSlots = new Map<string, HTMLElement>();
  private draft: MechLoadout | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param handlers - Change callback.
   * @param parts - Catalogue the pickers list.
   */
  constructor(handlers: LoadoutEditorViewHandlers, parts: PartCatalogue) {
    this.handlers = handlers;
    this.parts = parts;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `setLoadout` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "loadout-editor";
    panel.className = "tut-panel tut-mech-bay__editor";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Loadout";
    const form = doc.createElement("div");
    form.className = "tut-stack tut-mech-bay__form";
    panel.append(title, form);
    parent.appendChild(panel);
    this.root = panel;
    this.form = form;
  }

  /** Rebuilds every picker to show `loadout`; utility pickers follow its chassis. */
  setLoadout(loadout: MechLoadout): void {
    if (!this.form) {
      return;
    }
    this.draft = loadout;
    this.clearForm();
    const doc = this.form.ownerDocument;

    this.nameInput = doc.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.className = "tut-input";
    this.nameInput.dataset.field = "loadout-name";
    this.nameInput.value = loadout.name;
    this.nameInput.maxLength = 24;
    this.listen(this.nameInput, "input", () => {
      this.emit();
    });
    this.form.appendChild(this.row(doc, "Name", "name", this.nameInput));

    this.form.appendChild(
      this.pickerRow(doc, "chassis", "chassis", loadout.chassisId, false),
    );
    for (const slot of COMPONENT_SLOTS) {
      this.form.appendChild(
        this.pickerRow(
          doc,
          slot,
          slot,
          loadout[LOADOUT_FIELD_FOR_SLOT[slot]],
          false,
        ),
      );
    }
    const utilitySlots = this.utilitySlotsOf(loadout.chassisId);
    for (let i = 0; i < utilitySlots; i++) {
      this.form.appendChild(
        this.pickerRow(
          doc,
          "utility",
          `utility-${i}`,
          loadout.utilityIds[i] ?? EMPTY_OPTION,
          true,
          i + 1,
        ),
      );
    }
  }

  /** Shows each error beside its slot; errors with no slot go under the chassis. */
  setErrors(errors: readonly LoadoutError[]): void {
    for (const el of this.errorSlots.values()) {
      el.textContent = "";
      el.hidden = true;
    }
    for (const error of errors) {
      const key = error.slot ?? "chassis";
      const target =
        this.errorSlots.get(key) ??
        (key === "utility" ? this.firstUtilityError() : undefined) ??
        this.errorSlots.get("chassis");
      if (!target) {
        continue;
      }
      const line = target.ownerDocument.createElement("div");
      line.dataset.code = error.code;
      line.textContent = error.detail;
      target.appendChild(line);
      target.hidden = false;
    }
  }

  /** Removes the panel and every listener. */
  unmount(): void {
    this.clearForm();
    this.root?.remove();
    this.root = undefined;
    this.form = undefined;
  }

  // ===========================================
  // Draft
  // ===========================================

  /** Reads the pickers back into a loadout and reports it. */
  private emit(): void {
    const next = this.readDraft();
    if (!next) {
      return;
    }
    const chassisChanged = next.chassisId !== this.draft?.chassisId;
    this.draft = next;
    if (chassisChanged) {
      // The utility slot count may have changed; rebuild so the pickers follow.
      this.setLoadout(next);
    }
    this.handlers.onChange(next);
  }

  /** The loadout the pickers currently show. */
  private readDraft(): MechLoadout | undefined {
    if (!this.draft || !this.nameInput) {
      return undefined;
    }
    const value = (key: string): string => this.pickers.get(key)?.value ?? "";
    const chassisId = value("chassis");
    const utilityIds: PartId[] = [];
    for (let i = 0; i < this.utilitySlotsOf(chassisId); i++) {
      const id = value(`utility-${i}`);
      if (id !== EMPTY_OPTION) {
        utilityIds.push(id);
      }
    }
    return {
      ...this.draft,
      name: this.nameInput.value,
      chassisId,
      legsId: value("legs"),
      armsId: value("arms"),
      armWeaponId: value("arm-weapon"),
      backWeaponId: value("back-weapon"),
      utilityIds,
    };
  }

  /** How many utilities the given chassis carries; `0` for an unknown id. */
  private utilitySlotsOf(chassisId: PartId): number {
    const part = this.parts.getPart(chassisId);
    return part !== undefined && isChassisPart(part)
      ? part.capacity.utilitySlots
      : 0;
  }

  // ===========================================
  // DOM
  // ===========================================

  /** A label, a picker for `slot` preselecting `selected`, and its error line. */
  private pickerRow(
    doc: Document,
    slot: PartSlot,
    key: string,
    selected: PartId,
    optional: boolean,
    index?: number,
  ): HTMLElement {
    const picker = doc.createElement("select");
    picker.className = "tut-select";
    picker.dataset.slot = slot;
    picker.dataset.field = key;
    if (optional) {
      const empty = doc.createElement("option");
      empty.value = EMPTY_OPTION;
      empty.textContent = "(empty)";
      picker.appendChild(empty);
    }
    for (const part of this.parts.partsForSlot(slot)) {
      picker.appendChild(this.option(doc, part));
    }
    if (selected !== EMPTY_OPTION && !this.parts.getPart(selected)) {
      // Keep an id the catalogue lacks visible so its error makes sense.
      const missing = doc.createElement("option");
      missing.value = selected;
      missing.textContent = `${selected} (unknown)`;
      picker.appendChild(missing);
    }
    picker.value = selected;
    const thumb = this.thumbnail(doc, key, selected);
    this.listen(picker, "change", () => {
      this.showThumbnail(key, picker.value);
      this.emit();
    });
    this.pickers.set(key, picker);
    const label =
      index === undefined ? SLOT_LABELS[slot] : `${SLOT_LABELS[slot]} ${index}`;
    return this.row(doc, label, key, picker, thumb);
  }

  /**
   * The picture of the part a picker has chosen (#495). A mech bay of
   * seven dropdowns and a stat sheet gave no sense of what was being
   * built; the thumbnails are already rendered from the same models the
   * mech is assembled from.
   */
  private thumbnail(doc: Document, key: string, selected: PartId): HTMLElement {
    const thumb = doc.createElement("img");
    thumb.className = "tut-mech-bay__thumb";
    thumb.dataset.role = "part-thumb";
    thumb.dataset.field = key;
    thumb.width = THUMB_PX;
    thumb.height = THUMB_PX;
    // Decorative: the picker beside it already names the part, so a
    // screen reader announcing the picture twice would only be noise.
    thumb.alt = "";
    this.thumbs.set(key, thumb);
    this.showThumbnail(key, selected);
    return thumb;
  }

  /** Points one row's thumbnail at the chosen part, or hides it for a part with no picture. */
  private showThumbnail(key: string, partId: string): void {
    const thumb = this.thumbs.get(key);
    if (thumb === undefined) {
      return;
    }
    const id = partThumbnail(partId);
    if (id === undefined) {
      // A utility part has no picture. The cell stays, empty, so the
      // pickers below it do not shift left out of alignment.
      thumb.classList.add("is-empty");
      thumb.removeAttribute("src");
      delete thumb.dataset.thumb;
      return;
    }
    thumb.classList.remove("is-empty");
    thumb.src = thumbnailUrl(id);
    thumb.dataset.thumb = id;
  }

  /** `Name · ¢cost` for a part. */
  private option(doc: Document, part: MechPart): HTMLOptionElement {
    const option = doc.createElement("option");
    option.value = part.id;
    option.textContent = `${part.name} · ${formatCredits(part.cost)}`;
    return option;
  }

  /** A labelled row with an error line underneath. */
  private row(
    doc: Document,
    label: string,
    key: string,
    control: HTMLElement,
    thumb?: HTMLElement,
  ): HTMLElement {
    const row = doc.createElement("div");
    row.className = "tut-mech-bay__row";
    row.dataset.row = key;
    const term = doc.createElement("label");
    term.className = "tut-label";
    term.textContent = label;
    const error = doc.createElement("div");
    error.className = "tut-mech-bay__error";
    error.dataset.role = "slot-error";
    error.hidden = true;
    row.append(term, control, error);
    if (thumb) {
      row.insertBefore(thumb, control);
    } else {
      row.classList.add("tut-mech-bay__row--no-thumb");
    }
    this.errorSlots.set(key, error);
    return row;
  }

  /** The error line of the first utility picker, for utility-wide errors. */
  private firstUtilityError(): HTMLElement | undefined {
    return this.errorSlots.get("utility-0");
  }

  /** Drops every picker, listener and error line. */
  private clearForm(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.pickers = new Map();
    this.errorSlots = new Map();
    this.thumbs = new Map();
    this.nameInput = undefined;
    this.form?.replaceChildren();
  }

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement,
    event: "change" | "input",
    handler: () => void,
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}
