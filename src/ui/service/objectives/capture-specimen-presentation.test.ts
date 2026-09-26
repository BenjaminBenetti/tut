import { describe, expect, it } from "vitest";

import { CAPTURE_NET } from "../../../tactical/data/equipment";
import type { CarriedSpecimen } from "../../../tactical/model/carried-specimen";
import type {
  CaptureSpecimenObjective,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type { Unit } from "../../../tactical/model/unit";
import {
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
} from "../../../tactical/service/tactical-fixtures.test-helper";
import { CAPTURE_SPECIMEN_PRESENTATION } from "./capture-specimen-presentation";

// ===========================================
// Fixtures
// ===========================================

const CAPTURE: CaptureSpecimenObjective = {
  id: "objective-c",
  kind: "capture-specimen",
  species: "lurker",
  complete: false,
  failed: false,
};

const LURKER: CarriedSpecimen = {
  unitId: "bug-9",
  species: "lurker",
  templateId: FIXTURE_TEMPLATES.bug,
  movePenalty: 1,
};

/** The open field with `units` and `extracted`, every fixture squad carrying a net when `nets`. */
function mission(
  units: readonly Unit[],
  extracted: readonly Unit[] = [],
  nets = true,
): TacticalState {
  const base = missionWith(openField().build(), units, {
    objectives: [CAPTURE],
    extracted,
  });
  return nets
    ? {
        ...base,
        templates: {
          ...base.templates,
          [FIXTURE_TEMPLATES.infantry]: {
            ...base.templates[FIXTURE_TEMPLATES.infantry]!,
            equipment: [CAPTURE_NET.id],
          },
        },
      }
    : base;
}

const squad = unitAt("s1", "infantry", { x: 1, y: 0, z: 1 });
const carrier: Unit = { ...squad, carrying: LURKER };

/** The row the tracker draws for the capture in `state`, with its live reading. */
function rowIn(state: TacticalState) {
  return CAPTURE_SPECIMEN_PRESENTATION.row(CAPTURE, {
    ordinal: 1,
    spawners: [],
    progress: CAPTURE_SPECIMEN_PRESENTATION.progress?.(CAPTURE, state),
  });
}

// ===========================================
// Tests
// ===========================================

describe("CAPTURE_SPECIMEN_PRESENTATION (#1179)", () => {
  it("names what it wants", () => {
    expect(CAPTURE_SPECIMEN_PRESENTATION.name(CAPTURE, 1)).toBe(
      "a live lurker",
    );
  });

  it("says what to do next while the capture is open: net one, carry it out, or fetch the dropped one", () => {
    expect(rowIn(mission([squad]))).toEqual({
      icon: "bug",
      label: "Capture a live lurker",
      data: {
        species: "lurker",
        status: "open",
        failed: "false",
        whereabouts: "wild",
      },
      layout: "stacked",
      detail: {
        text: "net it at half health or less",
        role: "capture-progress",
      },
    });
    expect(rowIn(mission([carrier])).detail?.text).toBe(
      "carried · extract with it",
    );
    const fallen: Unit = { ...carrier, id: "s2", hp: 0 };
    expect(rowIn(mission([squad, fallen])).detail?.text).toBe(
      "dropped · pick it up",
    );
  });

  it("reads captured once the carrier is home, and failed once nobody can bring one", () => {
    const home = rowIn(mission([], [carrier]));
    expect(home).toMatchObject({
      icon: "check",
      label: "Captured a live lurker",
      data: { status: "complete", whereabouts: "home" },
    });
    expect(home.detail).toBeUndefined();
    const lost = rowIn(mission([squad], [], false));
    expect(lost).toMatchObject({
      icon: "warning",
      label: "Failed to capture a live lurker",
      data: { status: "failed", failed: "true" },
    });
  });

  it("falls back to the stored flags without a reading", () => {
    const row = CAPTURE_SPECIMEN_PRESENTATION.row(
      { ...CAPTURE, complete: true },
      { ordinal: 1, spawners: [], progress: undefined },
    );
    expect(row.label).toBe("Captured a live lurker");
    expect(row.detail).toBeUndefined();
  });
});
