# Mech roster and progression guide

Approved by the user on 2026-09-18; implementation tracked in #1168. This is the guide for mech development and the future research tree. Research unlocks are a separate project: all implemented parts remain available for credits until then.

## Design principles

Mechs are the player's investment. Expand the original 21 parts to 48, retaining the six slots: chassis, legs, arms, arm weapon, back weapon, and utilities. Every part must earn a place in a sensible build. Progression creates affordable field equipment, specialised machines, and expensive capital-grade systems. Old equipment remains useful through cost, mass and power efficiency. Weight, power, cooling and utility slots make combinations a decision; a new tier does not invalidate every old component.

Keep individual part upgrades (three levels, +10% to selected stats) separate from research tiers. Research will unlock capabilities and part families. Pilot ranks remain a third, earned progression. Mechs remain outdoor heavy support, with attacks ending their turn; squads retain their volume of fire, interior access and specialist equipment roles.

| Tier | Player experience | Capabilities |
| --- | --- | --- |
| 1 — Field equipment | Build something affordable that survives. | Speed, protection, accuracy and basic weapon roles. |
| 2 — Specialist equipment | Build a mech for a particular job. | Jumping, reconnaissance, precision, anti-armour fire and repairs. |
| 3 — Capital-grade systems | Build an exceptional mech and support its weaknesses. | Siege weapons, advanced cooling, specialised protection and coordinated targeting. |

## Catalogue

An asterisk marks one of the original 21 parts. Behaviour below is the intended contract; the implementation notes record concrete tactical rules.

### Chassis (6)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Vanguard* | Cheapest frame; thin protection and little fitting headroom. |
| 1 | Courser* | Fastest frame; limited protection and reactor output. |
| 1 | Bulwark* | Most armoured frame; slow, good for holding approaches and breaching. |
| 2 | Atlas* | Most utility slots and greatest payload; expensive, flexible, remains an endgame frame. |
| 2 | Surveyor | Best sight range; lightly protected with modest payload. |
| 3 | Crucible | Best sustained cooling; expensive, fewer utility slots than Atlas. |

The original four extrema remain intact. Reconnaissance and cooling extend the original four-axis chassis rule with two additional specialities; no universal best chassis is intended.

### Legs (6)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Strider* | Affordable, efficient movement; little protection. |
| 1 | Bastion* | Armoured supports; sacrifices speed. |
| 2 | Jumper* | Long jumps across obstacles and onto flat building roofs; power and heat intensive. |
| 2 | All-Terrain | Reduced rough-ground penalties; slower on clear streets. |
| 3 | Sprint | Highest movement contribution; fragile and thermally demanding. |
| 3 | Anchor | Deployable stabilisers improve heavy-weapon accuracy while braced; very slow. |

### Arms (6)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Manipulator* | Cheap, light, general-purpose mounts. |
| 1 | Brace* | Protection and accuracy; mass and movement penalties. |
| 2 | Tracker* | General-purpose accuracy; substantial power draw. |
| 2 | Assault | Protected, responsive close-combat arms; little precision assistance. |
| 3 | Marksman | Strongest accuracy bonus when stationary; costly and less useful while advancing. |
| 3 | Conduit | Reduces energy-weapon heat; power draw and little armour. |

### Arm weapons (10)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Autocannon* | Reliable medium-range damage and light demolition. |
| 1 | Flamer* | Short-range area damage and persistent fire; high heat and a dangerous approach. |
| 1 | Pulse Laser* | Lightweight precision; modest damage and substantial power draw. |
| 1 | Scatter Cannon | Close fragmentation blast; weak penetration, collateral risk. |
| 1 | Pile Driver | Contact-range penetration and breaching; exposure to retaliation. |
| 2 | Railgun* | Long-range anti-armour fire; heavy and power hungry. |
| 2 | Heavy Autocannon | More conventional damage; heavier and less accurate. |
| 2 | Thermal Lance | Short-range piercing heat beam against armoured targets in a line; extreme heat. |
| 3 | Siege Railgun | Exceptional penetration and wall breaching; enormous fitting and cooling demands. |
| 3 | Beam Projector | Damages targets along a narrow line; expensive cooling and dangerous firing lanes. |

### Back weapons (8)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Missile Pod* | General explosive support; moderate accuracy and collateral risk. |
| 1 | Mortar* | Affordable indirect fire; inaccurate and vulnerable at close range. |
| 1 | Smoke Launcher | Screens movement and extraction; replaces a damaging back weapon. |
| 2 | Rotary Cannon* | High shorter-range damage; heavy and hot. |
| 2 | Guided Missile Rack | Accurate attack on one armoured target; little area coverage. |
| 2 | Incendiary Launcher | Burning areas at range; limited immediate anti-armour damage. |
| 3 | Siege Howitzer | Heavy bombardment and wall breaching; bracing and minimum range. |
| 3 | Cluster Rocket Rack | Broad coverage against dispersed enemies; weak penetration, collateral risk, recovery between volleys. |

### Utilities (12)

| Tier | Part | Role and trade-off |
| --- | --- | --- |
| 1 | Armour Plating* | Cheap protection; heavy and slows movement. |
| 1 | Radiator* | Basic sustained cooling; weight and power cost. |
| 1 | Targeting Computer* | Both weapons gain accuracy; reactor demand. |
| 1 | Auxiliary Generator* | More power; adds mass and heat. |
| 2 | Composite Plating | Better protection per tonne; much more expensive. |
| 2 | High-Output Generator | Enables demanding equipment; considerable heat and mass. |
| 2 | Recon Sensor | Short-range contact scan; action and power cost, no targeting through walls. |
| 2 | Field Repair Module | Limited repairs to nearby mechanical allies; action and fitting cost. |
| 3 | Active Heat Exchanger | Strong sustained cooling; heavy, costly and power hungry. |
| 3 | Emergency Coolant Injector | Limited emergency heat removal; exhausted after its burst allowance. |
| 3 | Ablative Armour | Reduces the first three damaging weapon hits; protection depletes during the mission. |
| 3 | Target Designator | Marks a visible target to improve allied guided attacks; costs an action. |

Total: **48 parts, 27 additions**. Core part ids are preserved for saved loadouts.

## Future research families

```text
Mobility       Strider / Courser -> Jumper / All-Terrain -> Sprint
Protection     Plating / Bastion -> Composite / Assault -> Ablative / Anchor
Ballistics     Autocannon        -> Heavy / Railgun     -> Siege Railgun
Energy         Pulse / Radiator  -> Lance / Generators  -> Beam / Crucible / Cooling
Fire support   Pod / Mortar      -> Guided / Incendiary -> Howitzer / Cluster
Support        Targeting        -> Tracker / Surveyor -> Marksman / Designator
```

These are families, not fixed prerequisites. Branches intersect: artillery benefits from mobility, sensors and stabilisation. Avoid arbitrary chassis locks: fitting budgets decide compatibility. Price complete loadouts including upgrades and repairs, so early replacements remain viable and losing a capital mech hurts.

Example journeys: the starter Vanguard swaps its autocannon for a lighter Pulse Laser to make room for another fitting; a Courser becomes a mobile hunter; a Bulwark becomes a close-assault breacher; an Atlas becomes a siege platform supported by a Surveyor. Endgame builds should still contain efficient early parts.

## Tactical implementation contract

- Mobility investment must affect actual movement. Revisit the eight-tile base cap that currently flattens Vanguard and Courser with Strider legs.
- Weapon heat is generated by firing, movement heat by moving; generators produce idle heat, chassis and cooling utilities dissipate it each friendly turn. One shared heat pool per mech, visible in the HUD and bay, replaces the generic four-shot thermal magazine for newly built mechs. Venting costs an action. Older mission templates retain their existing charge behaviour.
- Jumping is an explicit action with a preview, valid outdoor or flat-roof landing, bounded distance and height, heat and action costs. It never grants access to infantry-only interiors.
- Mortars and howitzers may fire over obstructions only at allied visually observed targets or tiles. Radar contacts alone never authorise a shot. Minimum range and bracing are enforced by previews and resolution alike.
- Bracing trades an action and mobility for stability. Moving or jumping releases it. Anchor spades animate outward into the ground, remain deployed while firing, and retract before the first step or takeoff. Stationary bonuses reset after moving and at the appropriate turn boundary.
- Smoke screens targeting and vision for both sides and expires; it does no damage. Beam footprints and all explosive areas expose friendly-fire risk before committing.
- Guided attacks benefit from designation of a visible enemy. A designation has a short lifetime; no permanent or invisible target lock.
- Recon and repair fittings reuse the existing equipment systems where possible. Mech sensors remain shorter-range than radio squad radar; repair uses remain limited.
- Coolant injectors have finite uses. Ablative protection absorbs a bounded amount on a bounded number of hits. Duplicate active utility fittings must not silently multiply uses.
- Bay descriptions, previews, tactical actions and resolution must tell the same story. New fields have safe defaults for older mission saves.

## Delivery and validation

1. Preserve the guide; implement shared traits and the complete catalogue with valid example loadouts.
2. Make mobility, heat, jumping, indirect fire and bracing work.
3. Integrate smoke, beams, guidance, scanning, repairs, cooling and ablative protection with UI and saves.
4. Give parts readable models and thumbnails; validate the assembled machines.
5. Exercise new rules with deterministic tests, run typecheck/lint/unit/build/e2e checks, and review in the browser.

Balance against both individual targets and sustained engagements. Check terrain, sight, friendly fire, utility stacking, heat loops, rank/upgrade combinations, and replacement cost. Research and additional late-game enemy species remain separate projects.


## Shipped rules (#1168)

The entire catalogue is purchasable for credits. The bay's **Try a blueprint** selector loads one of six valid drafts without buying it: Jump Scout, Forward Observer, Urban Breacher, Siege Battery, Beam Crucible, and Rapid Response. Normal build, save, upgrade, deployment, and permadeath rules apply. Parts are tagged by tier for the later research tree.

The bay’s Build Weight shows **carried equipment / chassis capacity**, excluding the frame’s own mass. It remains visible on an overweight build, and hovering a part previews both the resulting load and the selected chassis limit.

| System | Concrete rule |
| --- | --- |
| Mobility | Base movement can now reach 14 before pilot rank. Sand, rock, snow and demolished rubble cost mechs two movement points per tile; All-Terrain legs pay one. Infantry costs are unchanged. |
| Durability | HP is chassis hull HP plus half the fitted plate total, rounded. Hulls: Courser 28, Vanguard 35, Surveyor 40, Crucible 60, Atlas 75, Bulwark 80. Example builds span about 40–120 HP; plate upgrades can exceed this range. Per-hit armour remains a separate benefit. |
| Shared heat | Capacity comes from the chassis (20–36). Holding Shift shows current heat / capacity above the mech, including zero. Shots add their displayed heat, even on misses and overwatch. Moving adds the legs' heat per action spent. At the start of the mech's own phase, idle heat is added and cooling is subtracted, clamped to the pool. A shot or move that would exceed capacity is refused. |
| Cooling | Vent costs 1 AP and clears the pool. The injector supplies two full clears per mission at 0 AP. Conduit arms reduce energy heat by 30%, rounded up per shot. Cooling and energy bonuses do not grant extra attacks. |
| Jump | Jumper legs jump up to 12 Manhattan tiles and eight elevation layers (four storeys), for 1 AP and five heat. A living ally must see the free outdoor or flat-roof landing. The mech follows one flowing arc, moving forward throughout ascent and descent. The peak adjusts to clear terrain and crossed roof edges along the validated route; taller obstacles and ceilings still block flight. Mechs can walk across clear flat roofs after landing, but cannot enter interiors or use infantry stairs. Overwatch and fire react at landing. |
| Brace and stationary aim | Bracing costs 1 AP. Anchor legs and Brace arms supply the displayed bonus; the Siege Howitzer requires bracing. Walking or jumping releases it. Anchor spades animate outward into the ground, stay deployed while firing, and retract before the first step or takeoff. Marksman arms give their stationary bonus until the mech moves that turn. |
| Indirect fire | Mortar minimum range is three; Siege Howitzer minimum is six. A living ally must visually see the target. Radar contacts do not count. Both obey heat, range and action limits in previews, normal fire and overwatch. |
| Fire | Every landed movement step through fire burns immediately, before overwatch; lethal damage interrupts the path. Jumps cross fire safely but burn on a burning landing. Each fire under a large unit’s footprint burns it once per step. Phase-start burning still applies; movement does not age fire or smoke. |
| Smoke | Radius two; harmless and lasts four phase boundaries. Blocks visual detection and ranged targeting for both sides, including firing out of the cloud. Adjacent contact remains possible. |
| Beam | Beam Projector and Thermal Lance continue through the aimed tile to their full weapon range (including elevation reach bonuses), stopping at terrain, walls or the map boundary. Units do not stop the beam. Each intersected unit or spawner is damaged once, including allies; preview and visual effects show the extended lane. Ordinary lasers and railguns retain their single-target profiles. |
| Guidance | Designate a personally visible enemy unit for 1 AP. Allied guided attacks gain 20 accuracy until the designating side's next turn. Ordinary weapons receive no guidance bonus. |
| Cluster recovery | After a volley, the Cluster Rocket Rack skips the following friendly turn before it can fire again. Other weapons and movement remain available. |
| Recon | Three beacons per mission, each deployed within two tiles for 1 AP. A beacon scans 12 tiles for one friendly-turn cycle; contacts do not reveal terrain or permit indirect targeting. |
| Repair | Two uses per mission; 1 AP, range three, radius one. Repairs up to 20 HP on nearby allied mechanical units, including the user. Refuses an empty or fully repaired area. |
| Ablative protection | Absorbs up to eight damage after armour on each of the first three damaging weapon hits. Fully absorbed hits still consume a layer; smoke and misses do not. No regeneration; passive base armour remains. |
| Utility stacking | A mech may repeat passive utilities within its fitting budgets. Duplicate copies of each active utility or Ablative Armour are refused, so charges and protection cannot silently multiply. |

New missions derive these systems from both existing and new saved loadouts. A resumed older mission whose frozen templates lack the new systems retains its original four-charge thermal rules until that mission ends. New heat, equipment use, brace, recovery and protection state survives autosave/resume. Research unlocks and long campaign balance tuning remain future work.

The progression kit adds 23 validated GLBs (including a dedicated Courser), matching thumbnails, and three review renders per model in `docs/design/renders/`. Utilities use the existing nonvisual fitting slots.

Review captures: [Beam Crucible in the bay](mech-progression-crucible.png), [Siege Battery in the bay](mech-progression-siege.png), [Anchor braces deployed](mech-anchor-deployed.png), and [Anchor legs walking](mech-anchor-walking.png).

### Chassis silhouettes and shoulder equipment

Each torso has a dedicated silhouette: Vanguard is a compact wedge with a raised helmet; Courser has a narrow waist, forward cockpit and swept fairings; Bulwark uses a rounded siege shell with a recessed viewport; Atlas carries a broad industrial yoke around its low cab; Surveyor has a narrow body, monocular optic and asymmetric scanner mast; Crucible exposes its cylindrical heat core between radiator banks.

Back equipment mounts on a supported shelf above the right shoulder. Every chassis owns its socket position and load-bearing hardware, keeping all eight back modules outside the cockpit. Parts remain interchangeable; the bay, tactical renderer, thumbnails and assembled reference models use the same authored geometry.

Review captures: [six chassis silhouettes](mech-chassis-lineup.png) and [a completed four-storey rooftop landing](mech-rooftop-landing.png).
