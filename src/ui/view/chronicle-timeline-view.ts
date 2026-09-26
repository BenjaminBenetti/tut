import type { ActId } from "../../content/model/act-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import type {
  ChronicleAct,
  ChronicleStoryWin,
} from "../../overworld/model/outcome-chronicle";
import { ACT_LABELS } from "../data/act-labels";
import { STORY_MISSION_TITLES } from "../data/story-mission-titles";
import { actSpanText, onDayText } from "../service/chronicle-text";

// ===========================================
// Types
// ===========================================

/** What the timeline is drawn from: the frozen summary's acts and story wins. */
export interface ChronicleTimelineInput {
  readonly acts: readonly ChronicleAct[];
  /** Absent on a summary without a chronicle: no milestones are listed. */
  readonly storyWins?: readonly ChronicleStoryWin[];
}

/** The words the timeline needs, injectable for tests. */
export interface ChronicleTimelineLabels {
  readonly acts: Readonly<Record<ActId, string>>;
  readonly stories: Readonly<Record<StoryMissionId, string>>;
}

// ===========================================
// Constants
// ===========================================

/** The shipped labels. */
const SHIPPED_LABELS: ChronicleTimelineLabels = {
  acts: ACT_LABELS,
  stories: STORY_MISSION_TITLES,
};

/** What the act a defeat ended says in place of its ending. */
export const CAMPAIGN_ENDED_HERE = "The campaign ended here.";

// ===========================================
// ChronicleTimelineView
// ===========================================

/**
 * The end screen's chronicle (campaign arc §3, §13): a vertical timeline
 * with one row per act the campaign reached, in order. Each row gives
 * the act's name, its span in days and missions, the story missions won
 * in it and the one that ended it; the act a defeat ended says so
 * instead. The list scrolls inside its own panel, so a long campaign
 * never pushes the page.
 *
 * ```
 *   ■ ACT I · EMERGENCE                 Days 1–14 · Missions 1–12
 *   │   First Skyfall · day 2
 *   │   Ended by Live Specimen · day 14
 *   ■ ACT II · INCUBATION               Days 14–29 · Missions 13–24
 *       The campaign ended here.
 * ```
 */
export class ChronicleTimelineView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly labels: ChronicleTimelineLabels;
  private root: HTMLElement | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param labels - Act and story mission names; the shipped tables by default. */
  constructor(labels: ChronicleTimelineLabels = SHIPPED_LABELS) {
    this.labels = labels;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Draws the timeline for `input` at the end of `parent`. */
  mount(parent: HTMLElement, input: ChronicleTimelineInput): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("section");
    root.className = "tut-chronicle";
    root.dataset.role = "chronicle";
    const heading = doc.createElement("h2");
    heading.className = "tut-label tut-chronicle__heading";
    heading.textContent = "Chronicle";
    const list = doc.createElement("ol");
    list.className = "tut-chronicle__acts";
    list.dataset.role = "chronicle-acts";
    for (const act of input.acts) {
      list.appendChild(this.createAct(doc, act, input.storyWins ?? []));
    }
    root.append(heading, list);
    parent.appendChild(root);
    this.root = root;
  }

  /** Removes the timeline. */
  unmount(): void {
    this.root?.remove();
    this.root = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** One act's row: its head, its milestones and its ending. */
  private createAct(
    doc: Document,
    act: ChronicleAct,
    storyWins: readonly ChronicleStoryWin[],
  ): HTMLElement {
    const row = doc.createElement("li");
    row.className = "tut-chronicle__act";
    row.dataset.act = act.act;
    row.dataset.ended = act.endedBy === undefined ? "defeat" : "won";

    const head = doc.createElement("div");
    head.className = "tut-chronicle__head";
    const name = doc.createElement("span");
    name.className = "tut-chronicle__name";
    name.dataset.field = "act-name";
    name.textContent = this.labels.acts[act.act];
    const span = doc.createElement("span");
    span.className = "tut-chronicle__span tut-mono";
    span.dataset.field = "act-span";
    span.textContent = actSpanText(act);
    head.append(name, span);
    row.appendChild(head);

    const wins = storyWins.filter((win) => win.act === act.act);
    const endingAt =
      act.endedBy === undefined
        ? -1
        : wins.map((win) => win.storyId).lastIndexOf(act.endedBy);
    const milestones = wins.filter((_, n) => n !== endingAt);
    if (milestones.length > 0) {
      const list = doc.createElement("ul");
      list.className = "tut-chronicle__wins";
      for (const win of milestones) {
        const item = doc.createElement("li");
        item.dataset.story = win.storyId;
        item.textContent = `${this.labels.stories[win.storyId]} · ${onDayText(win.day)}`;
        list.appendChild(item);
      }
      row.appendChild(list);
    }

    const ending = doc.createElement("p");
    ending.className = "tut-chronicle__end";
    ending.dataset.field = "act-end";
    ending.textContent = this.endingText(act, wins[endingAt]);
    row.appendChild(ending);
    return row;
  }

  /** `Ended by Live Specimen · day 14`, or that the campaign ended here. */
  private endingText(
    act: ChronicleAct,
    win: ChronicleStoryWin | undefined,
  ): string {
    if (act.endedBy === undefined) {
      return CAMPAIGN_ENDED_HERE;
    }
    const title = this.labels.stories[act.endedBy];
    return win === undefined
      ? `Ended by ${title}`
      : `Ended by ${title} · ${onDayText(win.day)}`;
  }
}
