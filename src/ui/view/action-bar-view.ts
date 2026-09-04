import type { IconId } from "../data/icon-manifest";
import type { WeaponId } from "../../tactical/model/unit-weapon";
import type { ActionBarAction } from "../model/tactical-intent";
import { ACTION_BAR_ORDER } from "../model/tactical-intent";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Types
// ===========================================

export type { ActionBarAction };

/** What the bar reports back to its owner. */
export interface ActionBarHandlers {
  /** The player pressed an action button. */
  /**
   * A button was pressed. `weaponId` names which weapon an Attack press
   * arms, and is omitted for every other action and for a unit carrying
   * one weapon (#532).
   */
  readonly onAction: (action: ActionBarAction, weaponId?: WeaponId) => void;
}

/** What the bar shows. */
/** One attack the selected unit can offer, as the bar needs it (#532). */
export interface ActionBarWeapon {
  readonly id: WeaponId;
  /** What the button says: the part's name, or "Attack" for a single weapon. */
  readonly name: string;
  /** False when the unit cannot fire it at all right now. */
  readonly ready: boolean;
}

export interface ActionBarModel {
  /** Whether the selected unit may act this phase (friendly, alive, with action points). */
  readonly canAct: boolean;
  /** Whether it is the player's phase, so End turn is offered. */
  readonly playerPhase: boolean;
  /** The armed action, if any; its button reads pressed. */
  readonly mode: "move" | "attack" | undefined;
  /** Label of the reload button: "Vent" for a mech, "Reload" otherwise (#409). */
  readonly reloadLabel?: string;
  /**
   * Shots the selected unit has left this turn (#533). Shown on the
   * Attack button when it is more than one, which is how a player sees
   * that a squad fires twice and a mech once.
   */
  readonly attacksLeft?: number;
  /**
   * The selected unit's weapons (#532). One entry means the bar shows a
   * single Attack button as it always did; several replace it with one
   * button each, named after the weapon, so a mech's arm gun and back
   * gun are separate actions.
   */
  readonly weapons?: readonly ActionBarWeapon[];
  /** Which weapon Attack is armed with, when several are offered. */
  readonly armedWeaponId?: WeaponId;
  /**
   * Whether the selected unit is standing in the extraction zone, so it
   * can leave the map (#341). Extraction costs no action points, so it is
   * offered to a unit that has already spent its turn.
   */
  readonly canExtract?: boolean;
  /**
   * Whether the selected unit is in reach of an objective it could work
   * (#427). Its own flag rather than `canAct`, because being able to act
   * is not enough: there has to be something in reach to act on.
   */
  readonly canInteract?: boolean;
}

// ===========================================
// Constants
// ===========================================

/**
 * The glyph on each button (#495). Every id is already in `ICON_MANIFEST`;
 * an icon on the button a player presses every turn is the cheapest place
 * the set earns its keep.
 */
const ICONS: Readonly<Record<ActionBarAction, IconId>> = {
  move: "move",
  attack: "attack",
  overwatch: "overwatch",
  reload: "reload",
  interact: "interact",
  extract: "extract",
  "end-turn": "end-turn",
};

/** Label per action; the order comes from `ACTION_BAR_ORDER`. */
const LABELS: Readonly<Record<ActionBarAction, string>> = {
  move: "Move",
  attack: "Attack",
  overwatch: "Overwatch",
  reload: "Reload",
  interact: "Interact",
  extract: "Extract",
  "end-turn": "End turn",
};

/**
 * Buttons in display order. Derived from `ACTION_BAR_ORDER` rather than
 * listed again, because the number-row shortcuts are bound from the same
 * list and a second copy would let a digit drift off its button (#520).
 */
const BUTTONS: readonly {
  action: ActionBarAction;
  label: string;
  primary: boolean;
}[] = ACTION_BAR_ORDER.map((action) => ({
  action,
  label: LABELS[action],
  primary: action === "end-turn",
}));

// ===========================================
// ActionBarView
// ===========================================

/**
 * The action bar (GDD §6.2): one button per action plus End turn. Unit
 * actions are enabled only while a unit that can act is selected; the
 * armed action (move or attack) reads pressed until it is used or
 * cancelled. One delegated click listener serves every button.
 *
 * Three buttons answer to their own flag rather than to `canAct`: End
 * turn is offered for the whole player phase, Extract whenever the
 * selected unit stands in the extraction zone (walking out costs no
 * action points), and Interact only when an objective is in reach.
 */
export class ActionBarView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: ActionBarHandlers;
  private root: HTMLElement | undefined;
  private readonly buttons = new Map<ActionBarAction, HTMLButtonElement>();
  private attackSlot: HTMLElement | undefined;
  /** The weapon ids the slot currently shows, so it rebuilds only on a change. */
  private shownWeapons = "";
  private dispose: (() => void) | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Where presses are reported. */
  constructor(handlers: ActionBarHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the bar under `parent`, every button disabled; call `update` to enable. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const bar = doc.createElement("div");
    bar.id = "action-bar";
    bar.className = "tut-hud__actions tut-row";
    for (const { action, label, primary } of BUTTONS) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
      button.dataset.action = action;
      // The digit that arms it, from the same order the shortcuts are
      // bound from, so the bar documents the number row (#520).
      const key = doc.createElement("span");
      key.className = "tut-btn__key";
      key.dataset.role = "shortcut";
      key.textContent = String(ACTION_BAR_ORDER.indexOf(action) + 1);
      const icon = iconGlyph(doc, ICONS[action]);
      const text = doc.createElement("span");
      text.className = "tut-btn__label";
      text.textContent = label;
      button.append(key, icon, text);
      button.title = `${label} (${key.textContent})`;
      button.disabled = true;
      if (action === "attack") {
        // The attack slot is rebuilt per selection: one button per weapon
        // when the unit carries several (#532).
        const slot = doc.createElement("span");
        slot.className = "tut-row tut-row--tight";
        slot.dataset.role = "attack-slot";
        slot.appendChild(button);
        bar.appendChild(slot);
        this.attackSlot = slot;
      } else {
        bar.appendChild(button);
      }
      this.buttons.set(action, button);
    }
    parent.appendChild(bar);
    const onClick = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest<HTMLButtonElement>("button[data-action]");
      if (!button || button.disabled) {
        return;
      }
      const action = button.dataset.action as ActionBarAction | undefined;
      if (action === "attack") {
        this.handlers.onAction(action, button.dataset.weaponId);
        return;
      }
      if (action !== undefined && this.buttons.has(action)) {
        this.handlers.onAction(action);
      }
    };
    bar.addEventListener("click", onClick);
    this.dispose = () => {
      bar.removeEventListener("click", onClick);
    };
    this.root = bar;
  }

  /** Enables buttons per the model and marks the armed action. */
  update(model: ActionBarModel): void {
    this.refreshAttackSlot(model);
    for (const [action, button] of this.buttons) {
      if (action === "attack" && (model.weapons?.length ?? 0) > 1) {
        // Replaced by per-weapon buttons, which carry their own state.
        continue;
      }
      button.disabled = !isEnabled(action, model);
      const pressed = action === model.mode;
      button.classList.toggle("is-selected", pressed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      if (action === "attack") {
        const label = button.querySelector<HTMLElement>(".tut-btn__label");
        const left = model.attacksLeft ?? 0;
        const text =
          left > 1 ? `${LABELS.attack} ×${String(left)}` : LABELS.attack;
        if (label) {
          label.textContent = text;
        }
        button.dataset.attacksLeft = String(left);
      }
      if (action === "reload") {
        // Only the label changes; the digit hint beside it stays put.
        const label = button.querySelector<HTMLElement>(".tut-btn__label");
        const text = model.reloadLabel ?? "Reload";
        if (label) {
          label.textContent = text;
        }
        button.title = `${text} (${String(ACTION_BAR_ORDER.indexOf(action) + 1)})`;
      }
    }
  }

  /**
   * Rebuilds the attack slot when the selection's weapons change. One
   * weapon keeps the plain Attack button; several replace it with one
   * button each, named after the weapon and armed independently.
   */
  private refreshAttackSlot(model: ActionBarModel): void {
    const slot = this.attackSlot;
    const attack = this.buttons.get("attack");
    if (!slot || !attack) {
      return;
    }
    const weapons = model.weapons ?? [];
    const key = weapons.map((weapon) => weapon.id).join("|");
    if (weapons.length > 1) {
      if (key !== this.shownWeapons) {
        const doc = slot.ownerDocument;
        slot.replaceChildren();
        weapons.forEach((weapon, index) => {
          slot.appendChild(this.weaponButton(doc, weapon, index === 0));
        });
        this.shownWeapons = key;
      }
      for (const weapon of weapons) {
        const button = slot.querySelector<HTMLButtonElement>(
          `[data-weapon-id="${weapon.id}"]`,
        );
        if (button) {
          button.disabled = !weapon.ready || !model.canAct;
          const armed =
            model.mode === "attack" && model.armedWeaponId === weapon.id;
          button.classList.toggle("is-selected", armed);
          button.setAttribute("aria-pressed", armed ? "true" : "false");
        }
      }
      return;
    }
    if (this.shownWeapons !== "") {
      slot.replaceChildren(attack);
      this.shownWeapons = "";
    }
  }

  /** One Attack button for one weapon, labelled with the weapon's name. */
  private weaponButton(
    doc: Document,
    weapon: ActionBarWeapon,
    first: boolean,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn";
    button.dataset.action = "attack";
    button.dataset.weaponId = weapon.id;
    // Attack keeps its digit whatever is selected (#532): the key arms
    // the first weapon and pressing it again cycles to the next, rather
    // than renumbering the bar and moving Overwatch's key with it. Only
    // the first button carries the hint, because there is one key.
    if (first) {
      const key = doc.createElement("span");
      key.className = "tut-btn__key";
      key.dataset.role = "shortcut";
      key.textContent = String(ACTION_BAR_ORDER.indexOf("attack") + 1);
      button.appendChild(key);
    }
    const icon = iconGlyph(doc, ICONS.attack);
    const text = doc.createElement("span");
    text.className = "tut-btn__label";
    text.textContent = weapon.name;
    button.append(icon, text);
    button.title = first
      ? `${weapon.name} (${String(ACTION_BAR_ORDER.indexOf("attack") + 1)}, press again for the next weapon)`
      : weapon.name;
    button.disabled = true;
    return button;
  }

  /** Removes the bar and its listener. */
  unmount(): void {
    this.dispose?.();
    this.dispose = undefined;
    this.root?.remove();
    this.root = undefined;
    this.buttons.clear();
  }
}

// ===========================================
// Helpers
// ===========================================

/** Whether one button is offered for the model. */
function isEnabled(action: ActionBarAction, model: ActionBarModel): boolean {
  switch (action) {
    case "end-turn":
      return model.playerPhase;
    case "extract":
      return model.canExtract ?? false;
    case "interact":
      return model.canInteract ?? false;
    default:
      return model.canAct;
  }
}
