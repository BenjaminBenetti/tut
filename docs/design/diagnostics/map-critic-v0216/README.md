# v0.2.16: release repairs and Earth-location variety

**Map Critic** · TUT agent

Reference: published **v0.2.16**, `1131c9019f6dad4abf0a1b46dbfd78334daa9254`.
This pass extends the earlier broad surveys with actual mission location claims
and one-parameter Map Lab comparisons. It does not assert every combination on
this release. Each published scene has an individually opened native PNG and an
exact recipe/camera/hash sidecar. The inspection JSON files distinguish looked-at
frames from scratch work still in progress.

## Preserve

The maps now have a credible foundation: supported roofed buildings, legible
streets, different storey heights, homes and shops distinguishable by their
frontages, meaningful fence runs, and purposeful waterfront endings. Rural lanes
and natural surface contours retain their improved read. City, town and rural
settings make materially different layouts; the variety gap is local identity,
not an absence of all variation.

The [21 release repair crops](repairs/README.md) confirm that city fence fragments
(#1006), invisible coastal tracks (#1043), and the water grid (#1005) improved in
the shipped picture. Contours (#945), other trails (#959), roofs and waterfronts
remain useful controls. Earlier radius-four units-only cutaway and layer checks
are separately recorded in the prior release/merged checks; Map Lab full roofs
are not a substitute for those tactical tests.

## Ranked defect list

1. **Outdoor plots still need ordinary uses, #960.** Loose crate/sandbag/barrier
   combinations remain in the release. The merged frontage work helps recognise
   homes and shops; preserve it. The subsequent #1075 author arrangement preview
   improves the yards, but is absent from this release and still needs integration
   and a fresh merged check. Do not create another yard-context issue.
2. **Arrival/extraction still lacks its physical anchor in this release, #911.**
   Known Director-owned gap. #1042 is excluded from v0.2.16; it merged after the release as `6967394` (#1042), and its fresh merged
   check remains separate from this release assessment. Do not re-file the bare marked deploy rectangle.

No third distinct defect is established by the published frames so far. Open
fence ends are credible where they mark a plot or trail extent. The stone lanes
are plausible built access to substantial rural buildings. Neither is a blanket
new defect. #813/#876/N1 deliberate terrain rulings still apply. This list does
not certify all seeds, movement, LOS, mech access or cover balance.

## Ranked variety list — epic #1068

1. **Lagos: humid coastal-lowland identity. Biggest dimension: biome/vegetation.**
   The mission's surrounding plots repeat pointy conifers, small round trees,
   green lawn and brown bare earth, like the Johannesburg sample. The wider
   neighborhood keeps that generic temperate read. [Lagos close](focus/lagos-0.png),
   [reverse](focus/lagos-1.png), [whole](locations/lagos/whole.png).
   Changing **only biome** to coastal gives [a warmer shore setting](survey/V01-coastal-city/near.png)
   / [reverse](survey/V01-coastal-city/rotated.png), but leaves sparse generic
   planting and the same building family. It is useful comparison evidence, not
   a prescription that a biome switch alone finishes Lagos. The missing thing
   is a locally plausible combination; an individual lawn or imported tree is
   not prohibited, and every Lagos mission need not touch water.
2. **Perth: a recognisable south-west Australian coastal landscape. Biggest
   dimension: biome/vegetation, supported by ground materials.** Thin palms and
   small round trees over green/sandy/brown patches read as a generic palmy coast.
   [Perth near](locations/perth/near.png), [reverse](locations/perth/rotated.png),
   [whole](locations/perth/whole.png), [close](focus/perth-0.png) / [close reverse](focus/perth-1.png). The same broad read persists on the different
   seed in [coastal town](survey/V02-coastal-town/near.png) / [reverse](survey/V02-coastal-town/rotated.png).
   Preserve a coastal settlement's water, sandy ground and real hills. Regional
   woodland/heath character would give those spaces local identity; planted
   palms and lawns remain possible in real Perth.
3. **Johannesburg and the comparison cities: more local building forms and
   material combinations. Biggest dimension: buildings, supported by materials.**
   [Johannesburg](locations/johannesburg/near.png) / [reverse](locations/johannesburg/rotated.png)
   and the [close pair](focus/johannesburg-0.png) / [reverse](focus/johannesburg-1.png)
   have different heights but largely the same gray-upper/red-brick-lower flat
   boxes seen in Lagos and Perth. The new domestic and shop details communicate
   use without yet changing that repeated silhouette. An ordinary local
   neighborhood should have visibly distinct building types and street faces,
   beyond stretching the same block. This is separate from #960's use cues and
   outdoor arrangements. Individual brick apartments are plausible; the narrow
   repeated vocabulary is the variety finding.

Props matter, but the strongest evidenced prop problem remains #960. This pass
does not invent a fourth standalone local-prop requirement just to fill all four
dimensions. Ground and wall materials are supporting parts of the ranked gaps,
not a request for unrelated palette swaps. The top findings go into the Critic's
five-ticket queue; any later ranking change must cite new frames.

## What the campaign actually claimed

Ordinary campaign **seed 4242**; advance days, taking the first event choice,
until each mission is offered. No mission/map/state substitution. The three
briefing PNGs were individually opened; their metadata retains the selected
mission/city/region from the observed campaign record, with PNG bytes unchanged.
These are claim evidence, not mapgen population measurements.

| Location | Campaign day / mission | Exact Map Lab recipe | Near / reverse / whole |
| --- | --- | --- | --- |
| [Johannesburg briefing](claims/Johannesburg-briefing.png) | day 2, mission-1 | `730982385`, temperate/city/small48 | [near](locations/johannesburg/near.png) / [reverse](locations/johannesburg/rotated.png) / [whole](locations/johannesburg/whole.png) |
| [Lagos briefing](claims/Lagos-briefing.png) | day 28, mission-14 | `1892582247`, temperate/city/medium72 | [near](locations/lagos/near.png) / [reverse](locations/lagos/rotated.png) / [whole](locations/lagos/whole.png) |
| [Perth briefing](claims/Perth-briefing.png) | day 56, mission-115 | `215428772`, coastal/town/medium72 | [near](locations/perth/near.png) / [reverse](locations/perth/rotated.png) / [whole](locations/perth/whole.png) |

The scenes are Map Lab reproductions of those mission parameters, not tactical
arrival frames with campaign fog. Native scene crops are 2020×1500 from viewport
2400×1500, x380/y0. Models/units on, slope100, levels all, pointer (0,0).
Near uses default camera zoom40, target map centre (24,0,24) or (36,0,36);
reverse uses one settled E rotation; whole returns with Q and zooms out to bounds.
Focus crops instead use the sidecar's explicit tile anchor, yaw and ground-axis
pitch; an anchor is not a claim that a prop occupies that tile.

Same-server readiness plus twenty animation frames settled the named-location
and focus frames. The supplementary survey uses the release's `drawnFrame`
helper (fonts plus two animation frames), `tapCameraKey`, and an asset-fallback
guard installed before navigation and checked before the shutter. Sidecars name
their protocol. All error lists are empty. The production camera accessor only
sets/records framing; it does not modify generation or scene contents.

The isolated tag server is recorded in [runtime.json](runtime.json), SwiftShader,
watch/HMR disabled and freshly started after checkout. Diagnostic commands in
`.scratch/map-critic-v0216/`: `campaign-claims.mjs`, `campaign-perth.mjs`,
`locations.mjs`, `focus.mjs`, and `survey-case.mjs INDEX`. The latter renders one
recipe then stops so it can be inspected before changing one parameter again.
No later main frame is relabelled as release evidence; accepted PNGs remain dated
records, not automatically updated executable baselines.

## Local references and the defect control

[Lagos State's Resilience Strategy, printed pp18–19](https://lasbca.lagosstate.gov.ng/wp-content/uploads/2021/05/Lagos_Resilience_Strategy.pdf)
describes a tropical coastal plain, islands, creeks and lagoons alongside the
extensive built city. It supports the landscape identity, not a requirement
that every urban block become mangrove or face a lagoon.

[The Western Australian park authority's Bold Park description](https://www.bgpa.wa.gov.au/bold-park/attraction/bold-park-bushland)
provides a local vegetation reference: tuart and Banksia woodland and limestone
heath in an urban bushland remnant. A park is not all of Perth.
[Perth's character-area descriptions](https://yoursay.perth.wa.gov.au/character-area-local-planning-policies)
also document different local street and building characters, including narrow
shopfront streets, masonry/tower mixtures and leafy residential areas on real
hills. There is no single building that represents the whole city.

[Johannesburg's own Region B description](https://joburg.org.za/about_/regions/Pages/Region%20B%20-%20Northcliff%20Randurg/Region-B---Northcliff-Randurg.aspx)
records houses, townhouse complexes, apartment blocks and local retail/office
areas within the city's diverse neighborhoods. That supports a broader local
building vocabulary, not one compulsory mixture or a landmark replica.

Every variety change must retain the earlier defect controls: no implausible
settlement plinths (#910/#936); supported complete roofs and access (#906/#916);
soft natural-material contacts and visible tracks (#945/#959/#1043); continuous
water and purposeful waterfronts (#1005/#915); contextual fences/props
(#1006/#960); the accepted units-only radius4/.175 reveal. Do not reverse
#813/#876/N1 rulings. Supply same-runtime before/after, a second angle/seed and a
known-good distinct-place control, with a frame in which the target place reads
as itself. MapGen and Art own how to achieve that; Director judges before merge.
