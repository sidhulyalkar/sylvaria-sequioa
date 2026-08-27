# Sylvaria: Sequoia v0.6.2 — Mastery Lab + Deterministic Runtime Delivery

## Release intent

v0.6.2 turns the v0.6.1 movement and Sap authority work into a measurable mastery loop.

The game should earn a replay because the player can see a cleaner line, not because a hidden system makes the next run easier, threatens a streak, withholds a daily reward, or manufactures urgency.

The core sentence remains:

`log → jump/run → nearest Sap bridge → modest redirect → higher log → Sap recharges`

The larger climb remains:

`HEARTSEEDS → LIVING CROWN → WONDERS → SKYHEART → ELDER CANOPY`

v0.6.2 adds evidence around those systems without changing their deterministic authority.

## 1. Deterministic difficulty heartbeat

The Canopy Director keeps the 25-floor mastery rhythm:

- **BREATHE (0–5):** recover, read the route, rebuild speed.
- **BUILD (6–14):** combine the phase's known movement vocabulary.
- **TEST (15–21):** demand cleaner exits and threat-gap management.
- **CROWN (22–24):** short examination before the next Crown split.

Mechanics are taught as `solo lesson → paired exam → remix`, not by continuously increasing random density.

The director is history-blind. Local run history must never alter:

- route RNG,
- route geometry,
- phase pressure,
- movement tuning,
- Sap authority,
- shop/economy outcomes.

Same seed means the same challenge.

## 2. Local Mastery Lab

`02-mastery-lab.js` records a compact summary of completed runs in browser local storage only.

Storage key:

`sylvaria.sequoia.masteryRuns.v1`

The history is capped at **24 completed runs**. No network request, beacon, socket, or remote analytics transport is allowed.

Each summary can include:

- seed and peak floor,
- 25-floor band,
- run duration and floors/minute,
- final phase / mastery stage / route family,
- pressure observed during the run,
- true distance to the next Crown when the run ends within four floors,
- near-threat exposure,
- low-momentum exposure,
- momentum burns,
- Sap Catches,
- Sap authority blocked presses / uses / higher-log recharges,
- route failures,
- latest Crown split delta,
- same-seed retry state,
- restart latency,
- time and near-threat exposure by BREATHE / BUILD / TEST / CROWN stage.

The summary intentionally avoids raw input timelines, personal identifiers, or remote transmission.

## 3. Evidence-backed next-line feedback

The game-over recap can surface one concrete next-run hypothesis.

Priority examples:

1. **True Crown near miss:** `2F TO CROWN 100 · RUN IT BACK` only when the run actually ended within four floors.
2. **Sap authority friction:** `LAND HIGHER BEFORE THE NEXT SHIFT` when blocked Shift presses dominate actual uses/recharges.
3. **Threat management:** `PROTECT THE THREAT GAP THROUGH TEST SECTIONS` when near-threat exposure or burns are excessive.
4. **Momentum:** `CARRY SPEED OFF RECOVERY LOGS` when a mature run spends too much time below the hesitation threshold.
5. **Route rehearsal:** name the route family that actually failed.
6. **Split mastery:** reclaim a Crown split when the latest split lost meaningful time.

This is diagnostic feedback, not a reward schedule.

## 4. Difficulty-health signals

The Mastery Lab may describe local samples, but it may not tune the game.

A 25-floor band is flagged as a possible **difficulty cliff** only when:

- the prior and current bands each have at least 3 reaches,
- prior-band completion is at least 55%,
- current-band completion is at most 35%, and
- the completion-rate drop is at least 25 percentage points.

The thresholds intentionally require repeated evidence. One bad run is not a balance conclusion.

Other useful review signals include:

- death distribution by mastery stage,
- recent median-floor trend,
- route-family completion/failure rates,
- same-seed retry rate,
- restart latency,
- near-threat exposure by stage,
- Crown split deltas.

### Human tuning targets

These are review heuristics, not runtime adaptation rules:

- BREATHE deaths should be uncommon relative to TEST/CROWN deaths.
- No taught 25-floor band should exhibit a persistent >25-point completion collapse without deliberate examination.
- Threat pressure should arrive in memorable bursts, not dominate most of a run.
- A taught route should be neither nearly automatic nor nearly impossible across repeated samples.
- Same-seed retry should feel immediate enough that the player can test the line they just imagined.

## 5. Sap authority remains hard

v0.6.2 preserves the v0.6.1 authority model:

- strict nearest eligible node at the Shift press edge,
- zero acquisition buffer,
- one successful lease per landing cycle,
- one use per authored Sap node per run,
- immutable authored moving-anchor identity,
- bounded attach/release impulse,
- bounded tether energy,
- fail-closed mismatched leases.

A physical-floor landing becomes authoritative only after Pip remains grounded for at least **35 ms**. A collision graze cannot advance `highestPhysicalFloor` and cannot recharge Sap.

## 6. Runtime compression without source compression

Authoring source stays modular and readable.

`runtime-manifest.json` is the canonical executable order. `scripts/build-sylvaria-runtime.mjs` concatenates that order into one generated production asset:

`runtime.bundle.js`

The generator:

- rejects duplicate or missing modules,
- rejects unsafe module paths,
- preserves deterministic source order,
- computes SHA-256,
- measures raw and Brotli sizes,
- enforces explicit size budgets,
- emits deterministic metadata.

Current budgets:

- authoring source: **520,000 bytes**
- Brotli bundle: **180,000 bytes**

The generated bundle and metadata are build artifacts, not hand-edited source. Production therefore gets one game-script request while source remains testable module-by-module.

## 7. Engagement constraints

This release explicitly does **not** add:

- streak-loss penalties,
- daily timers,
- loot/gacha rolls,
- fake near misses,
- limited-time rewards,
- hidden difficulty adaptation,
- permanent movement-stat grinding.

The intended replay loop is:

`fail → understand why → picture a cleaner line → immediate retry → measure mastery`

## 8. Qualification contract

The exact v0.6.2 head must pass:

- complete TypeScript + repository unit suite,
- deterministic runtime-manifest / SHA / Brotli budget validation,
- movement and Flow envelope,
- Heartwood progression,
- Living Canopy setpieces,
- Canopy Contracts economy,
- nearest-node Sap authority and held-landing ordering,
- Mastery Lab privacy / observational-only invariants,
- production build and runtime bundle smoke,
- Chrome Stable / Chromium / Firefox / WebKit movement + Sap tests,
- four-engine Heartwood trials,
- four-engine Living Canopy / Skyheart tests,
- four-engine economy tests,
- four-engine Sap anti-cheese tests,
- four-engine Mastery Lab near-Crown, same-seed, local-history, and no-adaptation tests.

PR #30 remains draft until that exact head is green and a human movement/feel pass confirms the difficulty heartbeat reads correctly in real play.
