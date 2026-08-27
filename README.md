# Sylvaria: Sequoia

**A deterministic vertical arcade climber about momentum, readable routes, one carefully bounded Sap bridge, and learning a cleaner line every run.**

Sylvaria: Sequoia is the standalone home of the game originally developed inside `sidhulyalkar/sids-neural-net`. This repository extracts the complete **v0.6.2** game runtime, game-owned validators, browser playtests and design records from a pinned upstream commit and then develops the game independently from the personal website.

The extraction is deliberately provenance-driven. The first standalone source import is accepted only if the 38 authored modules rebuild to the exact runtime fingerprint produced by the website version:

```text
upstream commit   b6b5c89fffbd2429e628de800df40a52ec600ef8
version           0.6.2
runtime modules   38
source bytes      387,792
bundle bytes      389,087
Brotli bytes      73,454
runtime SHA-256   73e89f393e94bf15f1b6393a00ef1a611b0d224b901ab7b5e5654a65511ddf0b
```

That gives the standalone repository a concrete answer to a simple question: **is this actually the same game that was qualified in the website project?**

## The movement sentence

The core game can be described without its progression systems:

```text
log
  ↓
run / jump
  ↓
nearest legal Sap node
  ↓
modest momentum redirect
  ↓
higher physical log
  ↓
Sap recharges
```

Sap is intentionally not a free grappling hook and not a second jump button. The interesting decision is how to use one tether to turn momentum into a better route through authored/procedural canopy geometry.

## Controls

| Input | Action |
| --- | --- |
| `A` / `D` or arrows | Horizontal movement |
| `Space` | Jump / air jump / start / restart context |
| Hold `Shift` | Acquire and hold the nearest eligible Sap Stick anchor |
| Release `Shift` | Release Sap and carry the redirected momentum |
| `0` on game over | Retry the same seed |
| `B` on game over | Open the between-run Canopy shop |
| `Escape` | Release embedded-game focus when hosted in a cabinet |

The exact input authority is tested. Repeated keydown edges, focus transitions and Shift release are not allowed to manufacture jumps or additional Sap leases.

## Sap authority

Sap is the defining traversal mechanic, so its rules are stricter than a visual grapple effect.

### Nearest-node acquisition

A Shift press resolves the nearest currently legal authored Sap anchor at the input edge. Acquisition has **zero timing buffer**. If the requested anchor is no longer legal when authority is checked, attachment fails closed.

### Immutable anchor identity

A used node is identified by authored topology rather than JavaScript object identity:

```text
chunkId + floor + role + anchorKind
```

Moving a knot, reconstructing its object or pruning/recreating world objects cannot make a consumed Sap node reusable.

### One lease per landing cycle

A successful Sap use spends the current traversal cycle. Repeated Shift presses while spent are blocked and measured, not rewarded.

### Physical higher-log recharge

Sap recharges only after Pip lands on a genuinely higher physical log and remains grounded long enough to prove that the collision was a landing rather than a graze.

The authority gate requires at least:

```text
MIN_GROUNDED_REARM_SECONDS = 0.035
```

Only after that held landing may `highestPhysicalFloor` advance and make a recharge legal.

### Bounded energy

Attach and release energy are bounded. Horizontal pumping is useful, but the tether cannot be exploited into an unbounded velocity engine.

## Progression

The long climb is structured as:

```text
HEARTSEEDS
   ↓
LIVING CROWN
   ↓
WONDERS
   ↓
SKYHEART
   ↓
ELDER CANOPY
```

### Heartseeds and the Living Crown

The early game teaches the movement vocabulary while the player collects five Heartseeds. Their completion awakens the Living Crown and opens the later canopy structure.

### Living Canopy

The world then introduces authored setpieces and route grammars at deterministic altitude bands. Important route families include:

- `CHOIRLINE`
- `HOLLOWRUN`
- `AURORARUN`
- `MIGRATION`
- `ELDERSPAN`
- `ECHOFLIGHT`

Higher-canopy route grammars include:

- `WINDLINE`
- `SKYHOOK`
- `CROWNWEAVE`
- `BREAKAWAY`
- `PENDULUM`
- `CONEFALL`
- `THUNDERCROWN`

These are not selected by a hidden player model. The Canopy Director remains deterministic and history-blind.

## The 25-floor mastery rhythm

Each Crown interval is shaped as:

```text
BREATHE → BUILD → TEST → CROWN
```

The goal is to avoid a feature soup where every obstacle appears at once. A mechanic gets space to be learned, then paired with another demand, then remixed before the next Crown split.

This cadence is part of the game design contract and is validated from source.

## Canopy Contracts and Cone Tokens

Sylvaria includes a lightweight run economy built around **Cone Tokens** and three active Canopy Contracts.

The economy is intentionally secondary to traversal:

- mission information is transient rather than a permanent dashboard;
- the shop is an intentional between-run modal;
- persistent mission/Sap side panels are suppressed during the climb;
- tokens and contracts do not permanently increase core movement statistics.

The current HUD hierarchy is:

```text
run objective > traversal > mastery > economy
```

## Mastery Lab

The local Mastery Lab exists to make failure more informative, not to make difficulty secretly adaptive.

It keeps at most 24 completed-run summaries in browser storage under:

```text
sylvaria.sequoia.masteryRuns.v1
```

Run summaries can include:

- seed and peak floor;
- run duration and floors per minute;
- 25-floor band and Crown proximity;
- stage / phase / route family;
- low-momentum and near-threat exposure;
- Sap uses, blocks and recharges;
- route failures;
- Crown split deltas;
- same-seed retry state;
- restart latency;
- stage-level pressure summaries.

The Mastery Lab may surface feedback such as:

```text
2F TO CROWN 50 · RUN IT BACK
```

or identify a repeated difficulty cliff from local run summaries.

It has hard negative capabilities:

```text
localOnly: true
adaptsDifficulty: false
mutatesTuning: false
mutatesRouteRng: false
```

It does not send network telemetry and cannot alter the route RNG, movement tuning or deterministic difficulty pressure.

## Replay philosophy

The intended loop is:

```text
fail
  ↓
understand why
  ↓
picture a cleaner line
  ↓
immediate retry
  ↓
measure mastery
```

The game deliberately avoids retention mechanics that would contaminate that loop:

- no streak-loss penalties;
- no daily timers;
- no gacha or loot boxes;
- no fake near misses;
- no limited-time urgency;
- no hidden adaptive difficulty;
- no permanent movement-stat grind.

Skill should accumulate in the player.

## Minimal presentation

The current v0.6.2 presentation is **world-first**.

During active traversal the game suppresses the old reference HUD rail and redundant Sap panels without painting an opaque replacement rectangle over the world. This matters because UI removal should reveal the canopy underneath, not simply cover it with a cleaner box.

The same suppression applies to game over. One compact mastery recap owns that state rather than stacking a death card, progression card and separate recap.

The shop remains intentionally modal because the player explicitly chooses to open it between runs.

## Runtime architecture

The readable game is authored as 38 ordered browser modules under:

```text
public/game-runtimes/sylvaria-sequoia/
```

`runtime-manifest.json` is the source-order authority. Production builds concatenate those modules into one deterministic `runtime.bundle.js`.

The builder:

1. validates every module path;
2. rejects duplicates and missing files;
3. preserves manifest order;
4. measures readable source bytes;
5. generates one browser bundle;
6. computes SHA-256;
7. measures Brotli size at quality 11;
8. enforces source and compressed budgets;
9. writes machine-readable runtime metadata.

Generated bundle files are ignored by Git. The readable modules remain the review and test boundary.

## Standalone extraction provenance

This repository was intentionally not initialized by copying a random working directory.

The bootstrap process:

1. checks out this repository on a dedicated migration branch;
2. fetches exactly `sidhulyalkar/sids-neural-net@b6b5c89fffbd2429e628de800df40a52ec600ef8`;
3. copies only Sylvaria-owned runtime, docs, validators, browser harnesses and source-contract tests;
4. generates a minimal standalone npm lockfile;
5. runs the source tests and validators;
6. rebuilds the runtime;
7. asserts the exact 38-module / 387,792-source-byte / 73,454-Brotli-byte / SHA-256 fingerprint;
8. commits the proven source into this repository;
9. removes the one-shot bootstrap workflow.

After that commit, normal development no longer depends on `sids-neural-net`.

`provenance.json` records the extraction boundary permanently.

## Repository layout

```text
.
├── public/
│   ├── index.html                         # minimal standalone cabinet
│   └── game-runtimes/
│       ├── game-network-bridge.js
│       └── sylvaria-sequoia/
│           ├── 00-core.js
│           ├── ... 36 more authored modules ...
│           ├── 05-debug-canopy-contracts.js
│           ├── index.html
│           └── runtime-manifest.json
├── scripts/
│   ├── build-sylvaria-runtime.mjs
│   ├── serve.mjs
│   ├── validate-sylvaria-*.mjs
│   └── playtest-sylvaria-*.mjs
├── tests/
│   └── sylvaria-sequoia-*.test.ts
├── docs/
│   ├── SYLVARIA_SEQUOIA_V05_LIVING_CANOPY.md
│   ├── SYLVARIA_SEQUOIA_V06_CANOPY_CONTRACTS.md
│   ├── SYLVARIA_SEQUOIA_V061_PACING_DIRECTOR.md
│   └── SYLVARIA_SEQUOIA_V062_MASTERY_LAB.md
├── provenance.json
├── package.json
└── README.md
```

## Local development

Requires Node.js 20 or newer.

```bash
npm ci
npm run check
```

Build the deterministic runtime:

```bash
npm run build:runtime
```

Run the game locally:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:3000/
```

The server also intentionally supports the historical qualification route:

```text
http://127.0.0.1:3000/arcade/sylvaria-sequoia
```

That keeps the proven browser harnesses usable without bringing Next.js into the standalone project.

## Qualification philosophy

Sylvaria tests behavior at several layers rather than asking one end-to-end test to explain every failure.

### Source contracts

Node tests protect important implementation invariants such as:

- fixed-step browser qualification;
- panel-free traversal presentation;
- deterministic director behavior;
- physical Sap-recharge ordering;
- immutable Sap identity;
- Mastery Lab non-adaptation.

### Static validators

Dedicated validators protect:

- movement and Sap envelope;
- Heartwood progression;
- Living Canopy setpieces;
- Canopy Contracts economy;
- nearest-node Sap authority;
- runtime bundle determinism and budgets;
- local Mastery Lab behavior.

### Browser matrices

The retained Playwright harnesses exercise the game in:

- Chrome Stable;
- Chromium;
- Firefox;
- WebKit.

They separately qualify:

1. movement and one-button Sap;
2. Heartwood and canopy trials;
3. Living Canopy / Wonders / Skyheart;
4. Cone Tokens, missions, shop and legacy Sap rhythm;
5. nearest-node Sap authority and Shift-spam resistance;
6. Mastery telemetry and deterministic difficulty.

Synthetic post-debug scenarios advance the authoritative 120 Hz simulation directly. Wall-clock sleeps are not used to manufacture game-physics outcomes.

## Relationship to sidhulyalkar.com

The personal website should eventually become a **consumer** of versioned Sylvaria releases rather than the canonical source of the game.

A future website integration can copy or download a tested `dist`/runtime release from this repository and pin its version. That allows the game to evolve, receive issues and releases, and be used independently without coupling every movement change to the rest of the portfolio site.

## Status

The extracted release line is **v0.6.2**. The first standalone milestone is intentionally conservative: reproduce the approved website game exactly, prove the extraction, then evolve from a clean repository boundary.

Future design work should be driven by player feel — especially the sentence `log → jump/run → Sap → redirect → higher log → recharge` — rather than by adding systems simply because the standalone repository has room for them.
