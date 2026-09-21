# ADR 0012: Optional Jev entity control and an observable relay

- Status: Accepted — architecture and development inspector approved by the project owner in the implementation request.
- Scope: Architecture §1–3 and §5; tactical control, application orchestration, development UI, optional external service.

## Context

An individual bug or TDF unit can opt into Jev decisions using its own instructions and its faction commander's instructions. Existing control remains the default. The owner requested shared faction vision, a small container published to GHCR, a build-time frontend relay address, and an inspector exposing actual inputs and outputs before enabling autonomy.

Direct calls to `https://api.typesafe.ai/v1/systemone` from localhost and the game's Pages origin were rejected by CORS during the planning probe. An authenticated Node request succeeded. The browser cannot keep a shared API key private.

## Decision

The game remains a static browser application. An optional, stateless Node relay is a separate runtime deployed by the owner. No simulation code calls the network, reads the environment, or uses a clock. Existing deterministic handlers execute the selected commands.

```text
                         +--> inspector: captured JSON, answers, history/export
                         |
mission --> observation + action catalogue --> Choice request --> relay --> Jev
   ^                                                               |
   +-- validated command <-- selected candidate <-- typed answer ---+
```

- The relay is a fixed-upstream JSON endpoint. `JevKey` is supplied at runtime; the image, build and browser never contain it. Allowed browser origins, body limits, request limits, concurrency limits and timeouts bound its operation. Origin filtering is not user authentication; the current single-player deployment has no user login. Logs contain only request ID, status and duration.
- `VITE_JEV_RELAY_URL` is public build configuration, read at the composition root. The release workflow takes it from the `JEV_RELAY_URL` repository variable. An absent production URL leaves Jev unavailable; local development defaults to port 8080.
- Entity configuration and faction prompts live in optional mission `jev` state. Old saves without that field use the original behavior. JSON saves contain configuration, known terrain, activation progress and the last 128 selected commands, but never promises, network credentials or inspector history. Schema v27 records the optional fields with an identity migration for v26; old builds refuse newer saves instead of misplaying a partially completed external phase.
- Knowledge is built explicitly. The existing `MissionView` is not serialized: it retains full terrain and other hidden mission data. Jev gets faction-visible entities, observed/remembered terrain, historical enemy locations, permitted objective locations and position-only radar contacts. Unknown enemy resources, spawn timers, event logs, seeds and the other faction's knowledge are excluded. Remembered terrain refreshes only where currently visible.
- Paths, previews and options are computed on the perceived map. Execution uses the real map and may refuse an option whose remembered geometry is stale or whose route encounters an unseen occupant. A refusal ends the activation instead of repeatedly probing hidden obstacles.
- All ordinary action families use existing rules. Large catalogues use family/region groups, followed by another Choice on the same captured observation; every candidate remains reachable and no question exceeds 255 options. The model chooses an existing candidate, never executable code or invented coordinates.
- The application awaits decisions sequentially outside the pure simulation. A bug phase with no enabled Jev bug keeps its original synchronous runner. A mixed phase leaves a saved cursor for the app: ordinary bugs run their existing species behavior; Jev bugs choose actions until finished. TDF entities may opt in during the player phase without forcing the manual units to end their turn.
- An external decision is conditional on its mission snapshot and command sequence. State changes, configuration changes, phase changes, navigation and disposal cannot apply an old response. No automatic retry hides additional requests: a failed bug decision uses existing behavior, and a failed TDF decision holds position. Low confidence by itself does not invalidate a legal choice.
- The inspector exists only through the existing development-tools composition flag. Opening it pauses automatic play. Evaluate and re-run never execute actions; Save explicitly persists prompt/control changes. Inspector and automatic play use the same builder and transport, with exact request/response records and no model-generated explanations invented by the UI.

## Consequences

Simulation remains deterministic for recorded commands, but fresh Jev decisions are external inputs and are not reproducible from the game seed alone. The inspector makes model version, probabilities, request size, latency, errors and grouped requests reviewable. A relay deployment and frontend rebuild are needed when the public address is first supplied or changed.

Current tactical actors are units. Existing commandable bugs, squads and mechs expose their available actions. Passive entities and autonomous equipment retain their existing lifecycle rules; adding a new controllable ability still requires a real game command and a corresponding candidate provider. Enemy health and weapon descriptions are treated as observable in the same way as the game's unit cards. History stores last-seen positions without inventing sighting timestamps the existing vision state does not record.

The integration follows TypeSafe's live [HTTP API](https://docs.typesafe.ai/api), [Choice primitive](https://docs.typesafe.ai/primitives/choice) and [hierarchical classification guidance](https://docs.typesafe.ai/cookbooks/hierarchical_classification). The transport validates the documented complete probability distribution; grouping keeps every action available within the 255-option question limit.
