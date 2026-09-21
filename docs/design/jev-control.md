# Jev control and development inspector

Jev control is opt-in per tactical unit and uses **shared faction vision**. The entity's prompt describes its role and tactics; the faction commander prompt sets priorities and wins explicit conflicts. Model selection uses `jev-latest`; every raw response records the resolved model. See [ADR 0012](../adr/0012-jev-entity-control.md).

## Run locally

Put the runtime secret in the repository root's ignored `.env`. There is no API-key field in the UI; only the relay reads the key:

```dotenv
JevKey=your-key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
```

Start both services together:

```sh
./run.sh
```

Open `http://localhost:5173`. Ctrl+C stops both services; if either exits, the script stops the other too. Run `pnpm install` first on a fresh checkout.

Restart `./run.sh` after changing the key so the relay reloads it. A hosted relay receives `JevKey` as a container environment variable.

Alternatively, run these in separate terminals:

```sh
pnpm dev:relay
pnpm dev
```

Development defaults to `http://localhost:8080`. To use another relay, set `VITE_JEV_RELAY_URL` in `.env` and restart Vite. Never prefix the API key with `VITE_`.

## Inspect a decision

![Jev development inspector showing a real evaluated request](jev-inspector.png)

1. Launch a tactical mission and select a TDF unit, or select/target a visible bug so its card is shown.
2. Press **Jev** in the bottom bar. Automatic Jev actions pause while the panel is open.
3. Inspect the exact **State** and **Questions** JSON. Entity and faction prompt fields are editable drafts.
4. Press **Evaluate current state**. This sends only the first question, then pauses so you can inspect its answer, probabilities, confidence, raw response, request ID and elapsed time. Preview never executes an action or saves draft prompts.
5. Press **Evaluate next step** to send exactly one follow-up. Use the **Jev evaluation step** selector to review any completed question and its matching response, or inspect the next question before sending it. Large target lists may need an intermediate group selection. Every step retains the original captured state and prompts.
6. Change a prompt and press **Re-run captured state** to start a new evaluation on the same battlefield. It also pauses after the first question. **Refresh state** captures the latest battlefield without making a request.
7. Use **History** for actual automatic decisions or earlier previews. Old snapshots remain labelled as old. Each exchange is labelled `action-type`, `action-group`, or `action`, with its request size in bytes and upstream token usage when supplied.
8. **Copy request & output** or **Export JSON** provides the whole trace, including every exchange and any unsent follow-up, without credentials.
9. To enable autonomous control, check **Jev controls this entity**, press **Save control & prompts**, then close the inspector. Uncheck and save to restore normal control. Saving the commander prompt changes orders for the entire selected faction in this mission.

The actor and observed entities carry both `name` (the roster identity, such as `Alpha` or `Hammerhead`) and `type` (such as `Rifle Squad`, `Mech`, or a bug species). Names match the game's unit labels, so an order such as “follow Alpha” can reference that entity's position and capabilities. Units without a roster identity use their template name. Fog-of-war filtering still applies to every entity.

Jev first chooses a **specific available action** from the entity's current loadout: for example, **Attack with Carbine**, **Attack ground with Autocannon**, **Use Grenade**, **Use Medkit**, move or overwatch. Each weapon, firing mode and usable item has its own top-level choice, with its name and capability. A follow-up selects only targets or tiles for that chosen weapon/mode or item. The menu is rebuilt from currently legal actions, so depleted items and weapons without a legal shot disappear. Large lists narrow through region or target groups first, keeping all legal candidates reachable. Detail pages are bounded by both option count and description size.

There is no `finish` choice. Movement offers only destinations reachable for **one AP**, using the same terrain costs as ordinary movement. After an action, automatic play captures the updated position, vision and remaining AP and asks again while the entity can still act. Other actions retain their normal game costs, including actions that consume all remaining AP.

A Jev-controlled TDF unit has light-blue **Jev** text above its head, visible without holding Shift. Tab skips it. It waits while manual units still have AP, then takes its actions once they are spent. Pressing **End turn** starts Jev's remaining activations immediately and delays the bug phase until they finish; repeated End Turn and manual orders are blocked while that request is pending. Saving and loading during this interval resumes unfinished activations. When manual AP runs out without an explicit End Turn, Jev acts but leaves the player phase open afterward.

Navigation uses **ASCII maps for every elevation layer**, covering the full map width and depth. Each layer starts with `fill: "f"`; `rows` overlays its known terrain and markers. Each row key is the zero-based `z` coordinate; character position plus `row_start_x[z]` (zero if absent) is `x`, and the containing layer supplies `y`. `x_digits` labels global columns. Leading/trailing fog padding and wholly unknown rows are omitted; those cells remain `f`. Completely unknown layers need only the fill. This keeps every known cell while avoiding thousands of redundant fog characters on large multi-floor maps.

The included legend explains every glyph: `f` means no observed or remembered surface (unexplored terrain or air), `.` is passable terrain for this actor, `#` is blocked, `l`/`h` are low/high cover obstacles, and `~` is rough or infested terrain. Remembered terrain uses `,`, `%`, `L`, `H`, and `=` respectively. `@` marks the actor, `a` an ally, `e` a currently spotted enemy, `O` a public objective, `n` a visible nest, and `x` extraction. Marker records connect IDs to named entities/objectives, retain overlapping markers and the underlying anchor terrain, and describe unit footprints. A public objective over `f` does not reveal hidden terrain or nest health.

Separate ASCII edge maps describe known walls: `vertical` rows use tile `z` and boundary `x`; `horizontal` rows use boundary `z` and tile `x`. Their legend distinguishes solid walls, doors, windows and half walls, including remembered boundaries. Missing rows and blank/trailing characters mean no known wall. Connectors group known elevation links by whether the actor can use them and by kind, with explicit `x,y,z -> x,y,z` endpoints. Sparse `features` groups `x,z` coordinates by exceptional cover/sight values. All geometry comes from shared faction observations and memory; unseen changes do not refresh remembered terrain. Known terrain anywhere on the map is included, beyond the actor's immediate movement range.

The `gameplay` block explains turns, AP/HP, movement, combat, knowledge and objectives. Every top-level option has contextual `instructions` and actual `ap_costs`; every follow-up repeats the selected ability's rules and weapon/item capability. Movement explains that a short move still costs one AP and wastes unused range, and supplies `movement_points` and `path_steps` for each destination. This allowance is taken from the actor's actual movement stat; terrain-weighted costs come from the ordinary path search. Other instructions distinguish healing, immediate and delayed explosives, radar, turrets, overwatch and mech abilities, including actions that end the activation. The inspector shows these exact inputs at every step.

An entity outside its faction's phase, out of AP or dead cannot act; the captured state offers no actions and no request is sent. Evaluation is also skipped when there are no available actions. History still shows the entity's last real decision. To evaluate a bug's decision while it can act, enable it and inspect its automatic trace, or pause at its phase through development tools. Turrets and other passive equipment retain their existing automatic abilities; attaching instructions does not grant them new AP or movement.

The inspector is absent from production UI. The runtime remains wired for explicitly configured mission state. No URL or no key leaves ordinary gameplay usable, and service failures produce visible traces and bounded fallback behavior.

## Container and release

The repository's release workflow publishes both architectures (`linux/amd64`, `linux/arm64`) after checks pass:

```text
ghcr.io/benjaminbenetti/tut-jev-relay:vX.Y.Z
ghcr.io/benjaminbenetti/tut-jev-relay:sha-<commit>
```

Build or run the relay:

```sh
docker build -f relay/Dockerfile -t tut-jev-relay .
docker run --rm -p 8080:8080 --env-file .env tut-jev-relay
```

The runtime exposes `GET /health` and `POST /v1/systemone`. Supply `JevKey` and comma-separated `ALLOWED_ORIGINS`; the default origin is localhost:5173. Origin values contain no URL path. For the published game include `https://benjaminbenetti.github.io`. Publish the service behind HTTPS, then set repository Actions variable `JEV_RELAY_URL` to that public base URL. The next frontend release bakes it in; it appends `/v1/systemone` itself.

The default port is 8080 (`PORT` overrides it). The relay allows at most 512 KiB per request, eight requests in flight and 120 requests per minute per process. Its upstream timeout is 15 seconds; the browser's is 20 seconds. It forwards only the fixed TypeSafe endpoint and never forwards browser authentication headers. CORS is browser access policy, not authentication: this deployment has no login, so keep the request budget appropriate to the host. A publicly distributed client cannot keep a shared relay password secret.

If the GHCR package is private, the host needs a package-read credential to pull it. No TypeSafe credential is needed to build or publish the image.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:relay
pnpm build
pnpm test:e2e
```

Focused coverage lives in `jev-map.test.ts` (ASCII coordinates, fog/memory, footprints, walls and elevation links), `jev-request.test.ts` (knowledge boundaries, contextual action instructions, weapon/item choices and one-AP movement), `jev-controller.test.ts` (stepped previews, fresh decisions after movement, zero-AP suppression, opt-in, mixed turns, stale responses, fallback and resume), `jev-client.test.ts` (wire validation), `relay/server.test.mjs` (real HTTP relay), and `e2e/jev-inspector.spec.ts` (the development workflow through Chromium, with a deterministic mocked upstream).

A live Chromium → local relay → TypeSafe check with the ASCII format used campaign seed `4242`, city map seed `730982385`, and selected mech `unit-1`. With `entity_prompt: "Reach objective-1 as quickly as possible."`, Jev `jev-1.13.0` chose movement, a region and then a six-tile move toward the objective for one AP. The requests used 7,670 / 7,231 / 7,535 input tokens and took 260 / 145 / 171 ms. Preview left the saved mission unchanged.

A synthetic fully revealed 96×96 city map exercised all 14 elevation layers, including six with known surfaces. Its largest generated request used 28,651 input tokens and succeeded. Detail pages now allow at most 32 choices and 8,000 criteria characters. These are measured cases, not a guarantee for every future battlefield or model. The small production-format movement check chose the efficient two-tile destination in all three trials; see the [validation record](../experiments/jev-ascii-production-smoke.md) and exact request/responses. Use inspector reruns to assess tactical quality beyond that fixture.
