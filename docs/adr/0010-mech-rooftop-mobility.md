# ADR 0010: Jump jets and mech roof occupancy

Status: Accepted — Executive Director playtest feedback, 2026-09-18, #1168.

## Context

The Executive Director requested longer jumps and building-roof landings. ADR 0004's static pass masks reserve building surfaces for infantry, and map generation guarantees that all static mech surfaces form a connected component. Adding the mech bit to every roof would incorrectly require ordinary ground movement to reach every isolated roof and change existing generated maps.

## Decision

Keep generated pass masks and connectors unchanged. `ReachabilityService` accepts an optional occupancy policy, defaulting to the ADR 0004 mask check. Tactical movement supplies a policy that additionally lets mechs occupy an unblocked, infantry-passable surface at a recorded flat, walkable building's roof elevation. The building record and storey-layer constant identify a roof; render geometry and guessed surface names do not participate. A `NONE` tile remains blocked. Interior floors, stairs, ladders, walls and movement costs retain their existing restrictions.

Jump validation, normal movement search, path validation and mission invariants use this policy. Jump jets provide the independent means of reaching a roof: 12 horizontal Manhattan tiles and eight vertical layers, with 1 AP and 5 heat per jump. A living ally must observe the landing, which must be unoccupied. Takeoff and landing require open sky. The flight follows one continuous arc, with forward motion during both ascent and descent. Building heights, pitched roofs, terrain and blocking props or walls can obstruct its permitted corridor. The arc is fitted above the surfaces and wall edges it actually crosses, checking both sides of each edge even when their floor heights differ. The event carries its peak, and simulation and animation share the curve function. Overwatch and fire react once at landing.

## Consequences

Mechs can land and walk on roofs without gaining access to interiors. Map generation and its connectivity guarantees remain byte-compatible; no map version or saved-state migration is needed. Existing active missions retain their frozen part-derived jump ranges until the next deployment, while the new landing policy applies immediately. Normal walking still cannot climb a building without a legal connector; infantry-only connectors do not admit mechs.
