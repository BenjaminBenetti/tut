# ADR 0007: In-world UI is DOM anchored to projected world points

- **Status:** Accepted (Tech Lead). Shipped and in `v0.2.3`: the radial menu (#528, implemented in #583) and the right-click context menu (#529, implemented in #621, dismissal fixed in #633) are DOM anchored to projected world points.
- **Date:** 2026-09-04
- **Author:** Tech Lead
- **Requested by:** Executive Director (#514, band 3 items 9 and 10): the attack panel should be *"a radial menu centered on the enemy clicked"*, right-click should open a context menu at the cursor, and *"don't just use a raw html menu however, game integrated would be best"*. His verdict on the current side panels: they *"feel like a spread sheet"*.
- **Scope:** Architecture §3 (layering), §5 (contracts); `ui/view/*`, `ui/controller/tactical-input-controller.ts`, `graphics/controller/picking-controller.ts`

## 1. Context

Band 3 needs two pieces of UI that belong to a point in the world rather than
to a corner of the screen: a radial attack menu centred on a target, and a
context menu at the cursor. Three approaches are possible, and the point of
deciding now is that items 9 and 10 will otherwise be built twice, by different
seats, in different technologies.

Two facts about this codebase constrain the choice more than general taste
does.

**`ui/` contains no three.js and `graphics/` contains no DOM.** That is
architecture §3, lint-enforced (ADR 0002). Verified at the time of writing:
`grep -rn 'from "three"' src/ui --include=*.ts` returns nothing.

**The world → screen bridge already exists and already lives in `ui/`.**
`TacticalInputController.unitScreenPosition(unitId)` and `.tileScreenPosition(tile)`
project a world point to client pixels through `PickingController.screenPositionOf`,
which is how `tactical-input-controller` already turns clicks into tile
intents. Anchoring UI to a world point therefore needs no new machinery — only
a subscription to camera changes.

The Executive Director's objection is worth reading precisely. He does not say
"do not use HTML". He says do not use a *raw* HTML menu, and names the failure
he means: panels parked at the side that read like a spreadsheet. The
complaint is about **placement and presentation**, not about the technology
underneath.

## 2. Decision

### 2.1 In-world UI is DOM, positioned from a projected world anchor

A new `ui/view/world-anchored-layer.ts` owns an absolutely-positioned layer
over the map canvas. A widget declares an anchor — a unit id, a tile, or a
client point — and the layer positions it every time the camera changes:

```
   world point ──► PickingController.screenPositionOf ──► {x, y} px
        │                                                    │
   camera moved / zoomed / unit died ───────────────────────┘
        └──► layer repositions or dismisses the widget
```

The radial attack menu and the right-click context menu are both widgets on
this layer. Radial layout is CSS transforms on a ring of buttons; there is no
canvas and no three.js object.

### 2.2 Anchored widgets are dismissed by the world, not only by the user

A widget anchored to a unit closes when that unit dies, is deselected, leaves
the map, or stops being visible under ADR 0006. This is the rule that separates
"in-world UI" from "a div that happens to start near a unit", and it is why the
anchor is a **world reference** rather than the pixel coordinates of the click.

### 2.3 Why not three.js-drawn UI

Drawing the menu as three.js geometry is the most literally "game integrated"
option and it is the wrong trade here:

- It puts UI in `graphics/`, inverting architecture §3. The menu needs mission
  state, hit chances and command dispatch — everything `ui/` owns and
  `graphics/` deliberately does not.
- Text in three.js is either a rasterised texture (the path `CanvasTextTextureSource`
  already takes for city labels, and it is blurry at small sizes and needs a
  cache per string) or an SDF font library we do not have.
- It gives up every accessibility affordance for free text: no focus, no
  keyboard traversal, no screen reader, no browser hit testing.
- Hover, focus rings, transitions and disabled states all have to be rebuilt by
  hand.

### 2.4 Why not a 2D canvas overlay

A canvas overlay avoids the layering problem and draws crisp text. Rejected for
the same accessibility and interaction reasons as §2.3 — every button becomes a
manual hit test — with the extra cost of a second renderer to keep in sync with
DPR and resize. It buys nothing over DOM that we need.

### 2.5 What actually answers the "spreadsheet" objection

The technology was never the problem. These are, and they are the acceptance
criteria for band 3:

1. **Position.** The menu appears at the thing it is about, and moves with it.
2. **Shape.** Radial, sized to the content, no rectangular chrome around it.
3. **Weight.** No borders and headers that read as a form; the battlefield
   stays visible behind it.
4. **Transience.** It appears on the action and leaves when the action resolves
   — §2.2 — rather than sitting there being a panel.
5. **Locality.** The information at the target is what the decision needs — hit
   chance, damage, the weapon — not the unit's full stat sheet.

A DOM widget that satisfies these reads as game UI. A three.js widget that
fails them reads as a spreadsheet drawn in triangles.

## 3. Consequences

- One layer serves both band 3 items, and item 12 (one action per weapon) drops
  into the same radial menu as more entries rather than needing new UI.
- The layer must reposition on camera change. Panning with a menu open is
  cheap — one projection per open widget per frame — but it is a per-frame cost
  that did not exist before, so widgets are dismissed rather than tracked when
  the camera moves far.
- `ui/` stays three-free and the lint rule stands.
- The side panels do not disappear. Unit card and objectives stay where they
  are; this ADR is about the decision-making UI, and the Executive Director's
  complaint was about *declaring an attack*, not about knowing a unit's HP.
- e2e keeps working: DOM menus are queryable by role and `data-action`, so band
  3 does not cost us the ability to test the flows QA already covers.

## 4. Alternatives considered

**Three.js-drawn UI.** §2.3.

**Canvas overlay.** §2.4.

**Keep side panels, move them nearer the unit.** Cheapest, and it is what a
literal reading of "it feels like a spreadsheet" might suggest. Rejected: it
fails criteria 2, 4 and 5 of §2.5 — it is still a panel, it just moved.
