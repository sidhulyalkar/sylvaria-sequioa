# Sylvaria: Sequoia v0.6.1 Pacing Director

## Goal

Make the climb compelling because the player can read it, learn it, and immediately see a better line for the next run. The design should reward mastery rather than grind, opaque adaptation, or permanent stat inflation.

The central movement sentence remains:

`log → jump/run → nearest Sap bridge → modest redirect → higher log → Sap recharges`

The pacing layer does not change seeded geometry or grant hidden assistance. Same seed remains the same route.

## The 25-floor heartbeat

Every Crown interval is a short tension arc:

- **BREATHE, floors 0–5 of the interval:** lower threat pressure and room to establish rhythm.
- **BUILD, floors 6–14:** normal pressure and route-reading.
- **TEST, floors 15–21:** slightly elevated pressure while the current vocabulary is exercised.
- **CROWN, floors 22–24:** a short peak immediately before the Crown mark.

Crossing the Crown resets the arc instead of letting pressure climb monotonically forever. Late game is still harder because its route vocabulary, wind, geometry, and base pressure are harder. The heartbeat prevents hard sections from becoming one continuous fatigue wall.

## Mechanic vocabulary

Difficulty should come from combinations of understood verbs, not surprise density.

1. **ROOTWAYS:** run, jump, branch landing, basic Sap bridge.
2. **REDWOOD RUN:** horizontal commitment, open-air lines, wind reads. Recovery remains frequent.
3. **SAPWORK:** Sap rhythm plus the first forced BREAKAWAY branches.
4. **HIGH CANOPY:** moving PENDULUM Sap anchors after static Sap is already understood.
5. **STORM CANOPY, floor 132:** CONEFALL receives a dedicated readable band at the same floor where the hazard actually activates.
6. **CROWNLINE:** previously learned verbs are remixed into THUNDERCROWN and other expert routes, but RECOVERY still appears between examinations.

This ordering prevents a named challenge from appearing before its underlying mechanic is actually live.

## Recovery without rubber-banding geometry

A Sap Catch creates a short 2.35-second threat-pressure grace window. It does not regenerate safer geometry, move hazards, choose easier nodes, change RNG, or alter a route. The player sees the same world and still has to execute the recovery.

This targets the frustrating failure pattern where a rescue is technically successful but the threat wall immediately deletes the player before a new decision can be made.

## Crown splits

Every 25-floor Crown stores the player's best elapsed split locally. A new best is compared against the previous time and surfaced as a simple delta.

This creates several healthy replay goals at once:

- reach the next Crown;
- beat the current Crown split;
- improve the run PB;
- finish the closest Contract;
- collect the next Heartseed;
- eventually wake the Living Crown.

None of these goals permanently increase base movement power.

## Death-screen retry loop

The run recap deliberately avoids a wall of statistics. It answers only four useful questions:

1. Did this run gain height?
2. Was the latest Crown split faster?
3. Which Contract is closest to completion?
4. Does the player want a new seed, the same seed, or the shop?

The controls are shown directly: `SPACE NEW RUN · 0 SAME SEED · B SHOP`.

A same-seed retry is particularly important. It converts failure into an immediately testable hypothesis: "I know the line I want to change."

## Sap authority follow-through

A higher physical floor is now acknowledged only after Pip has remained grounded for the minimum hold interval. A one-frame branch graze cannot advance `highestPhysicalFloor`, cannot rearm Sap, and cannot make lower anchors ineligible.

Authority remains:

`one lease → one immutable node → nearest node only → bounded energy → no buffer → held higher-log contact before the next lease`

## Telemetry to use for tuning

The next tuning pass should use run evidence rather than intuition alone. Useful metrics are:

- death-floor histogram, especially just after phase transitions;
- percentage of Sap Catches followed by death within 2.5 seconds;
- route completion rate and mean completion time by family;
- Crown split retry frequency and split improvement magnitude;
- restart delay from game over to the next run;
- percentage of runs reaching the next Heartseed;
- low-momentum ratio by phase;
- near-threat ratio by Crown-cycle stage;
- mission completion distribution, to identify Contracts that are either automatic or effectively unreachable.

The target is not a uniform completion rate. The target is a curve where failure increasingly feels attributable to a readable decision.

## Runtime size and compression strategy

The source runtime is intentionally modular because the individual files are qualification boundaries and are easy to audit. Shipping many authoring modules forever is not the ideal network shape, however.

Do **not** hand-minify these files or collapse them during a gameplay-tuning patch. The safer next optimization is a deterministic runtime manifest that concatenates the exact validated module order into one generated production asset, then minifies that generated artifact while leaving the readable modules as source-of-truth. The generated bundle should have a content hash and a validator that proves its module manifest matches `index.html`.

That separates two concerns cleanly:

- authoring and qualification stay readable and modular;
- production delivery becomes one cacheable, compressed runtime payload.

Vercel/CDN compression can then operate on the bundled asset without turning game logic into an unreviewable compressed source file.
