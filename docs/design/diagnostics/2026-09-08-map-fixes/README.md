# 2026-09-08 — the merged map fixes, verified in play

Two things the Director asked for: a re-measure of the #813 slope and ramp catalogue
against current `main`, and verification of the merged map fixes **in play** rather
than from stills.

Measured and captured at **`54463bf`**. One commit landed while this ran — `54cdb1c`,
a UI label fix — which touches neither mapgen nor graphics, so the numbers hold at
`d85ecd9`. Gate on `54463bf`: typecheck, lint, build pass; unit **2173**; sim **7**;
e2e **59**. **Zero console errors** across every play run below.

Every frame here is the running game — campaign start, day advance, mission launch,
real clicks — not Map Lab.

---

## 1. What actually moved in the catalogue: **nothing**

The whole one-layer-step table is **identical to the tile** against the closing pass,
re-run with the same sweep on both trees:

| | closing `055c1d5` | now | delta |
|---|---:|---:|---:|
| one-layer step tiles | 74,627 | 74,627 | 0 |
| carries a wedge | 71,372 (95.6 %) | 71,372 (95.6 %) | 0 |
| every bucket A–I | — | — | **0** |
| diagonal chain histogram | 1694/38/4/1 | 1694/38/4/1 | 0 |
| canonical masks | 55 | 55 | 0 |

I expected the plinth removal to move this and said so; it did not. The reason is that
the three mapgen changes act on **multi-layer paved** geometry, and the catalogue counts
**one-layer** steps.

### What did move, measured old tree vs new over the same 108 maps

| | `055c1d5` | now | delta |
|---|---:|---:|---:|
| **ramp connectors** | 3,779 | **1,733** | **−2,046 (−54 %)** |
| **paved tiles facing a 2+ layer drop** | 7,700 | **2,625** | **−66 %** |
| raised paved tiles | 123,587 | 115,839 | −7,748 |
| sidewalk tiles | 63,786 | 56,519 | −11 % |
| rock tiles | 54,187 | 52,669 | −1,518 |
| raised grass/dirt | 121,976 | 122,319 | +343 |
| stairs / ladders / water | — | — | **0** |

**36 of 108 maps changed.** Three of four sampled maps hash byte-identical; only the
city seed differs. The changes are narrow and land on city maps, which is where routine
paved platforms and plinths lived.

### A side effect worth naming

**#869 item 2 is gone.** Ramps crossing a parapet: **2,046 → 0.** The −2,046 ramp
connectors are exactly that population — removing the routine paved platforms removed
the ramps that served them, and those were the ones passing through plat parapets.

---

## 2. The five fixes, in play

| fix | verdict | frame |
|---|---|---|
| **foundations under raised buildings** (#906) | **holds** | `shots/A-foundations-*.png` |
| **ordinary lots where railed platforms were** (#910) | **holds** | `shots/B-cutaway-and-ordinary-lot.png` |
| **pitched roofs** (#916) | **holds** | `shots/C-pitched-roofs.png` |
| **coastal quaysides** (#915) | **holds** | `shots/D-coastal-quayside.png` |
| **cutaway reveal, `uGhostStrength` bound** (#937) | **holds** | `shots/B-cutaway-detail.png` |

**Foundations.** Campaign seed `4242`, Almaty (town), `building-4`, whose ground level
stands **4 layers** above the road beside it. The raised plot is a solid mass with drawn
side faces — no void beneath, no floating. Getting here took a detour worth recording:
**city maps have zero buildings standing proud of their neighbouring ground; town maps
have 197 of 368 (54 %) and rural 40 of 75.** My first seven campaign samples were all
city, so they showed nothing. The Earth map has **no rural cities**, so this fix is only
ever exercised in the five town cities — Novosibirsk, Almaty, Ulaanbaatar, Perth,
Auckland.

**Cutaway.** Campaign seed `4242`, Johannesburg, turn 5, mech and squad against a
five-storey block. The stipple is wide and soft-edged and it genuinely reveals: through
it you can read a bug, the interior floor and a prop behind the wall. It is bound and it
works.

**Ordinary lots.** Same frame: the lot beside the building is ground-level grass with
fences and props, no railed platform, and the move overlay sits flat on it.

**Pitched roofs.** Campaign seed `4242`, Seoul. Houses carry hipped roofs with real
ridges; taller blocks keep flat roofs with parapets. A mix, and it reads as a town.

**Quaysides.** Campaign seed `harbour`, Vancouver. Streets stop at a railed paved quay
and the waterline is a clean edge; nothing runs into the sea.

Also confirmed incidentally: the tactical banner names the **city** (#753) —
`shots/E-banner-names-the-city.png`.

---

## 3. Regressions

**None found.**

Two observations that are not regressions but are worth having on record:

- **The foundation case is unreachable in city missions**, and the Earth map has no
  rural cities, so #906 can only be seen in five towns. Anyone re-testing it from a
  campaign start will find nothing unless they pick a town.
- **No end-to-end test selects a unit by a real click on the tactical screen.** Every
  game-screen spec uses the `selectUnit` hook; the one real-click test runs in Map Lab.
  Clicking a mech's *feet* selects the ground under it and leaves the action bar
  disabled — you must click its body. That is defensible behaviour, and a player would
  simply click again, but it is the game's only selection path and nothing covers it.

## 4. Method

`pnpm dev` on 4173, Playwright headless Chromium with SwiftShader. Each run starts a new
campaign from the main menu, advances days until a mission is offered, launches it, and
drives the tactical screen with real pointer input; `__tutTactical__` is used only to
find a tile or unit on screen, never to perform an action. The catalogue re-measure uses
the bounds-checked sweep from `docs/design/diagnostics/813/method.md`, run in a worktree
at `055c1d5` and on current `main` so both columns come from the same code.
