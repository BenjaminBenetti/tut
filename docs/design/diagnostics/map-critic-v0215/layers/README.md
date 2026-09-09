# Map Critic: the top-floor roof repair holds on v0.2.15

**Picture improved.** The reported tower keeps its roof after a clamped
up press at 5 / 5. Both camera sides preserve the complete top view. The
useful 1 / 5 and 2 / 5 cuts still expose rooms off a corridor, furniture
and stairs while streets remain visible. All eight fresh native frames
were individually opened. Interiors remain dim; this is not lighting or
movement certification.

This checks merged #1013 on main
`9d9ea012e97292ae3f96e2500f1609a1cfdbf412`, captured 9 September 2026 UTC.
The earlier [Critic record](../../map-critic-v0213/layers/README.md) on
`d0837c6` showed the precise failure: **initial roof intact**, then absent
after applying top focus while the readout remained 5 / 5. Those dated
images remain unchanged. This check does not claim every roof was absent
by default, or replace eng-3's separately accepted #996/#1019 proof work.

## Exact reproduction

Ordinary campaign entry, seed **4242**, advance one day, choose the first
mission **Johannesburg**, select all available starter units and deploy.
Mission `mission-1`, seed **1127010053**, 48×48, 14 engine layers, five storeys.
No save, map, camera policy, unit or rendering rule was substituted.

Viewport 1800×1200. Pan with settled ordinary keyboard taps to frame the
reported tower at **(3,2,26)**; roof reference **(3,12,26)**. The second
browser starts the same mission and turns E once. Keep the pointer at
(0,1199), outside the scene. Wait for tactical readiness, the phase banner
to close and completed drawn frames before each capture. The sidecars
record the actual camera projection, input history, displayed floor,
page/body state, runtime baseline and trees, error list and PNG SHA-256.

| State | Initial camera side | One E turn | Readout / picture |
| --- | --- | --- | --- |
| Initial top | [R0 initial](R0-initial.png) | [R1 initial](R1-initial.png) | 5 / 5, roof intact |
| One clamped `]` | [R0 top up](R0-top-up.png) | [R1 top up](R1-top-up.png) | 5 / 5, roof still intact |
| Five PageDown taps | [R0 ground](R0-ground.png) | [R1 ground](R1-ground.png) | 1 / 5, ground-floor rooms/corridor/stairs |
| One `]` | [R0 floor 2](R0-floor2.png) | [R1 floor 2](R1-floor2.png) | 2 / 5, next furnished floor |

Within each current run, initial and clamped-top PNGs are byte-identical.
This is a declared **same-run** preservation comparison, not equality to
an earlier runtime's historical frames. Both sides were also visually
inspected, and the lower-floor views visibly change as intended. No page
or console errors were reported.

The fresh port4175 server's identity is recorded in every sidecar and in
[the capture provenance](../repairs/runtime.json). The stable configuration
disables watching; the server was restarted after checkout. No inherited
cached-server pilots are used. These PNGs are unretouched full screenshots.
Pointer retirement under #1023 is a later accepted change awaiting merge;
this control keeps the pointer offscene and does not request hover retention.
