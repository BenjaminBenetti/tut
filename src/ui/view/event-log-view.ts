import type { TacticalEvent } from "../../tactical/model/tactical-event";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { UnitId } from "../../tactical/model/unit";
import { iconUrl } from "../data/icon-manifest";
import type { IconId } from "../data/icon-manifest";
import { formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** One line in the log: what to say, how to mark it, and how loud it is. */
interface LogEntry {
  readonly text: string;
  readonly icon: IconId;
  /** Style-guide tone; `plain` is body text. */
  readonly tone: "plain" | "danger" | "ok" | "accent" | "bug" | "dim";
}

/** Reads a unit's display name out of the mission, falling back to its id. */
type NameOf = (unitId: UnitId) => string;

// ===========================================
// Constants
// ===========================================

/** Lines kept in the scrollback. A long mission is a few hundred events. */
const MAX_ENTRIES = 200;

/** Remembered for the session so the log does not reopen on every mission. */
let collapsedForSession = false;

// ===========================================
// Phrasing
// ===========================================

/**
 * One event, one sentence. Everything the log knows how to say lives here,
 * so supporting a new event type is a single entry rather than a change to
 * the view (#525). Returning `undefined` drops the event silently — some
 * events exist for the renderer, not for the player.
 *
 * @param event - The tactical event.
 * @param nameOf - Resolves a unit id to its display name.
 * @returns The line to show, or undefined to skip it.
 */
function describe(event: TacticalEvent, nameOf: NameOf): LogEntry | undefined {
  switch (event.type) {
    case "tactical:turn-started":
      return {
        text: `Turn ${formatWhole(event.payload.turn)} — ${
          event.payload.phase === "player" ? "TDF" : "bug"
        } phase`,
        icon: "advance",
        tone: "accent",
      };
    case "tactical:unit-moved":
      return {
        text: `${nameOf(event.payload.unitId)} moved ${tiles(
          event.payload.path.length,
        )}`,
        icon: "move",
        tone: "dim",
      };
    case "tactical:attack-resolved":
      return event.payload.hit
        ? {
            text: `${nameOf(event.payload.attackerId)} hit ${nameOf(
              event.payload.targetId,
            )} for ${formatWhole(event.payload.damage)}`,
            icon: "attack",
            tone: "danger",
          }
        : {
            text: `${nameOf(event.payload.attackerId)} missed ${nameOf(
              event.payload.targetId,
            )}`,
            icon: "attack",
            tone: "dim",
          };
    case "tactical:unit-died":
      return {
        text: `${nameOf(event.payload.unitId)} destroyed`,
        icon: "warning",
        tone: "danger",
      };
    case "tactical:unit-reloaded":
      return {
        text: `${nameOf(event.payload.unitId)} reloaded`,
        icon: "reload",
        tone: "dim",
      };
    case "tactical:unit-status-changed":
      return {
        text:
          event.payload.status.length > 0
            ? `${nameOf(event.payload.unitId)} is ${event.payload.status.join(", ")}`
            : `${nameOf(event.payload.unitId)} is clear`,
        icon: statusIcon(event.payload.status[0]),
        tone: "plain",
      };
    case "tactical:bugs-spawned":
      return {
        text: `${formatWhole(event.payload.unitIds.length)} bugs ${
          event.payload.source === "spawner" ? "hatched" : "arrived at the edge"
        }`,
        icon: "egg",
        tone: "bug",
      };
    case "tactical:objective-updated":
      return {
        text: event.payload.complete
          ? `Objective complete: ${event.payload.objectiveId}`
          : `Objective updated: ${event.payload.objectiveId}`,
        icon: event.payload.complete ? "check" : "mission",
        tone: event.payload.complete ? "ok" : "accent",
      };
    case "tactical:mission-ended":
      return {
        text: `Mission ${event.payload.outcome}`,
        icon: event.payload.outcome === "won" ? "check" : "warning",
        tone: event.payload.outcome === "won" ? "ok" : "danger",
      };
    default:
      return undefined;
  }
}

/** "1 tile", "4 tiles" — the log is sentences, so it counts like one. */
function tiles(count: number): string {
  return `${formatWhole(count)} ${count === 1 ? "tile" : "tiles"}`;
}

/** The glyph for a status change, defaulting to the overwatch eye. */
function statusIcon(status: string | undefined): IconId {
  return status === "hidden" || status === "suppressed" ? status : "overwatch";
}

// ===========================================
// EventLogView
// ===========================================

/**
 * The mission's event log, bottom left, collapsible (#525). Every tactical
 * event the player can act on, phrased as a sentence and kept in order so a
 * fight can be reviewed after it has scrolled past.
 *
 * ```
 *   ┌─ EVENT LOG ──────────── ▾ ┐
 *   │ ▸ Turn 4 — bug phase      │
 *   │ ▸ Swarmer hit Alpha for 3 │
 *   │ ▸ Alpha missed Swarmer    │  newest last, scrolled to the bottom
 *   └───────────────────────────┘
 * ```
 *
 * It is a view over the existing event stream: nothing is logged twice, and
 * the phrasing table above is the only place that knows what an event means.
 */
export class EventLogView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private toggle: HTMLButtonElement | undefined;
  private count = 0;

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the log under `parent`; call `append` as events arrive. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "event-log";
    section.className = "tut-panel tut-hud__log";
    section.dataset.collapsed = String(collapsedForSession);

    const header = doc.createElement("div");
    header.className = "tut-log__header";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Event log";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-log__toggle";
    toggle.dataset.action = "toggle-log";
    toggle.addEventListener("click", () => {
      this.setCollapsed(!collapsedForSession);
    });
    header.append(title, toggle);

    const list = doc.createElement("ol");
    list.className = "tut-log__list";
    list.dataset.role = "event-log-list";

    section.append(header, list);
    parent.appendChild(section);
    this.root = section;
    this.list = list;
    this.toggle = toggle;
    this.setCollapsed(collapsedForSession);
  }

  /** Removes the log and forgets its nodes; the collapsed state survives. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.toggle = undefined;
    this.count = 0;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Appends the lines for `events`, oldest first, and scrolls to the newest.
   * Events with nothing to say are skipped.
   *
   * @param events - The batch that just resolved.
   * @param mission - Mission state, for unit names.
   */
  append(
    events: readonly TacticalEvent[],
    mission: TacticalState | undefined,
  ): void {
    const list = this.list;
    if (!list || events.length === 0) {
      return;
    }
    const nameOf = nameResolver(mission);
    const doc = list.ownerDocument;
    for (const event of events) {
      const entry = describe(event, nameOf);
      if (!entry) {
        continue;
      }
      const last = list.lastElementChild;
      if (last instanceof HTMLElement && last.dataset.text === entry.text) {
        // A bug phase is forty identical move lines; collapsing them keeps
        // the fight visible instead of burying it (#525).
        const seen = Number(last.dataset.repeat ?? "1") + 1;
        last.dataset.repeat = String(seen);
        const tail = last.querySelector<HTMLElement>('[data-field="repeat"]');
        if (tail) {
          tail.textContent = ` ×${formatWhole(seen)}`;
        }
        continue;
      }
      const row = doc.createElement("li");
      row.className = `tut-log__row tut-log__row--${entry.tone}`;
      row.dataset.text = entry.text;
      const icon = doc.createElement("span");
      icon.className = "tut-icon tut-icon--sm";
      // `iconUrl` already returns `url(…)`; wrapping it again is invalid CSS
      // and the mask silently falls back to a solid block.
      icon.style.setProperty("--icon", iconUrl(entry.icon));
      const text = doc.createElement("span");
      text.textContent = entry.text;
      const repeat = doc.createElement("span");
      repeat.className = "tut-dim";
      repeat.dataset.field = "repeat";
      row.append(icon, text, repeat);
      list.appendChild(row);
      this.count += 1;
    }
    while (this.count > MAX_ENTRIES && list.firstElementChild) {
      list.firstElementChild.remove();
      this.count -= 1;
    }
    list.scrollTop = list.scrollHeight;
  }

  /** Empties the log, for a new mission. */
  clear(): void {
    if (this.list) {
      this.list.textContent = "";
    }
    this.count = 0;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Collapses to the header handle, or opens it again, and remembers which. */
  private setCollapsed(collapsed: boolean): void {
    collapsedForSession = collapsed;
    if (this.root) {
      this.root.dataset.collapsed = String(collapsed);
    }
    if (this.toggle) {
      this.toggle.textContent = collapsed ? "▴" : "▾";
      this.toggle.setAttribute(
        "aria-label",
        collapsed ? "Expand event log" : "Collapse event log",
      );
      this.toggle.setAttribute("aria-expanded", String(!collapsed));
    }
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Resolves unit ids to the names a player recognises, from the mission's
 * templates. Falls back to the id so a log line never reads as blank.
 *
 * @param mission - Current mission state, if there is one.
 * @returns A name lookup.
 */
function nameResolver(mission: TacticalState | undefined): NameOf {
  if (!mission) {
    return (unitId) => unitId;
  }
  const byId = new Map(mission.units.map((unit) => [unit.id, unit]));
  return (unitId) => {
    const unit = byId.get(unitId);
    const template = unit ? mission.templates[unit.templateId] : undefined;
    return template?.name ?? unitId;
  };
}
