# Sylvaria: Sequoia v0.6.1 - Canopy Contracts + Sap Authority

## Why this version exists

The v0.5 Living Canopy made the long climb more interesting, but a real gameplay recording exposed a structural exploit: at high altitude several Sap targets could be visible simultaneously and repeated Shift taps could dominate traversal. Sap had stopped being a bridge between branches and had become a second flight system.

v0.6.1 changes the governing rule rather than hiding the problem behind a longer cooldown.

> **Land higher → Sap ready → spend one Sap vault → land higher again.**

The physical sequoia branches are the route. Sap is the punctuation between them.

## 1. Branch-gated Sap

Each run begins with one Sap charge ready.

A successful Sap attachment spends that charge. No amount of Shift tapping can create another successful attachment until Pip lands on a **new, strictly higher physical log**. That landing recharges Sap exactly once.

The runtime tracks:

- `nodeUses`
- `recharges`
- `spentAtFloor`
- `highestPhysicalFloor`
- blocked Shift presses
- consumed authored anchor IDs
- tether energy clamps

The central invariant is:

```text
successful Sap uses <= completed higher-log recharges + 1
```

A rapid repress while the previous tether is still resolving does not call the underlying press authority again. This also prevents the old minimum-hold queued release from being cancelled by another press.

### v0.6.1 authority hardening

The runtime now treats every successful Sap connection as a lease with six hard rules:

1. **Nearest eligible node only.** Target choice uses Euclidean distance at the Shift press edge. There is no directional weighting or route-preference substitution.
2. **No acquisition buffer.** `stickAcquireBufferSeconds` is `0`, so a press cannot drift into a different target on a later frame.
3. **One lease per landing cycle.** The charge is spent atomically when attachment succeeds.
4. **Higher physical log required.** Recharging requires a real grounded branch above the floor where the lease was spent.
5. **One use per authored node per run.** Consumed anchors stay consumed for the entire run.
6. **Unexpected attachment fails closed.** A grapple without a matching authority lease, or one whose attached knot no longer matches the leased knot, is forcibly released and its Sap-derived velocity is discarded.

### Immutable moving-anchor identity

Moving Pendulum, Aurora, Echo, and Skyheart anchors change position during play. Position must therefore never participate in consumed-node identity.

The canonical identity is derived only from authored topology:

```text
route chunk + floor + role + anchor kind
```

Specifically:

```text
chunkId : floor : role : anchorKind
```

`x`, `y`, rounded position, visual sway phase, and any other runtime state are forbidden from the identity. A Pendulum can sweep across the canopy all it wants and remains the same physical Sap node.

### Bounded Sap energy

Sap can redirect a strong approach but cannot manufacture one.

The authority records entry speed and creates a bounded tether speed budget. A/D steering can shape the swing, but repeated fixed updates cannot pump the tether beyond roughly `entry speed + 120`.

Direct velocity changes are also bounded:

- attach: at most `95 px/s` horizontal and `120 px/s` vertical delta
- release: at most `105 px/s` horizontal and `145 px/s` vertical delta
- post-release speed: tether budget plus a small bounded allowance

This keeps Sap satisfying as a momentum tool without turning Shift into vertical propulsion.

## 2. Sparse authored Sap anchors

Not every amber-looking knot is a grapple target anymore.

Normal Sap Stick targeting is limited to authored `anchorKind === 'sap-stick'` air anchors. Decorative / branch knots are removed from the live Sap target field.

The rebalanced route set treats Sap as an isolated bridge. Normal Sap-capable route families contain one meaningful anchor. Only the longest ELDERSPAN and SKYHEART examinations may contain two, and those are separated by mandatory physical landing opportunities.

The result should read as a route choice rather than a cloud of grapple handles:

```text
LOG RUNWAY → authored SAP GAP → LOG LANDING → authored SAP GAP
```

This intentionally teaches the player to alternate techniques rather than mash one input.

## 3. Cone Tokens

v0.6 adds a persistent currency called **Cone Tokens**.

They are earned from actions that reinforce the intended movement loop:

1. **Golden log cones** - deterministic pickups positioned on real branch surfaces. The player must physically land on the log and reach the cone.
2. **Altitude milestones** - every new 25-floor milestone in a run awards a small two-token bonus.
3. **Canopy Contracts** - the largest reliable rewards come from completing concrete run missions.

Currency does not come from raw Shift presses or time spent attached to Sap.

Persistent storage key:

```text
sylvaria.sequoia.coneTokens
```

## 4. Canopy Contracts

Every run contains three visible missions.

Slot 1 is always the foundational mixed-movement mission:

### TWO-WAY CLIMB - 8 Cone Tokens

- reach floor 30
- land on 8 new higher logs
- complete 2 Sap → higher-log recharge cycles

This is the game teaching its intended grammar through a goal rather than a tutorial paragraph.

Two additional missions are selected deterministically from the run seed:

### LOG LADDER - 5
Land on 16 new higher logs.

### CLEAN CRAFT - 6
Perform 3 Clean Sap vaults.

### FLOW STUDY - 6
Reach 6× Flow and bank 6 new higher logs.

### HIGH ROAD - 8
Reach floor 50, use Sap 4 times, and make 3 multi-floor skips.

### NO PANIC - 7
Reach floor 45 without spending a rescue.

### RING ROUTE - 6
Thread 4 Rings and complete 2 Sap → higher-log cycles.

The mission panel is deliberately small: name, live progress, reward. It should feel like a trail card, not a quest log.

## 5. Canopy Shop

The shop opens **between runs** with `B` or the on-canvas Shop button.

Purchases are persistent only until the next climb begins. They are then consumed. There are no permanent movement-stat upgrades.

### Extra Life - 18 Cone Tokens

Next run starts with one additional fall rescue by reusing the existing `player.saves` / Sap Catch survival mechanism.

### Stride Seed - 12

Next run starts with 280 stored Stride. It does not inject hidden horizontal velocity and does not change base acceleration or maximum speed.

### Resin Flask - 14

Next run starts with 0.65 Resin toward a rescue.

### Trail Map - 10

Next-run Canopy Contract rewards are multiplied by 1.5×.

Queued purchases are stored in:

```text
sylvaria.sequoia.shopLoadout
```

The shop supports one queued copy of each item. A player may build a multi-item trail kit, but every item is consumed when that next run starts.

## 6. What remains untouched

The economy and Sap authority are not allowed to rewrite the core movement model.

Protected values include:

- 120 Hz fixed simulation
- base gravity
- ground / air acceleration
- base maximum speed
- jump base and momentum gain
- Stride launch carry
- Air Kick
- Bark Cling / Bark Kick
- authored route RNG
- Living Canopy Heartseed / Wonder / Skyheart persistence

The shop can alter bounded run state such as `player.saves`, `player.resin`, or stored Stride. It cannot permanently alter `TUNE.run`, `TUNE.jump`, gravity, or route generation.

Sap authority may clamp Sap-created momentum and target eligibility, but it does not inject hidden ground or air steering.

## 7. UI hierarchy

During a climb:

1. world and route remain dominant
2. Sap state is binary and explicit: `SAP READY` or `SAP SPENT · LAND ON A HIGHER LOG`
3. three Contracts live in a compact right-side panel
4. Cone Token wallet is a small corner pill
5. golden cones are world-space objects on logs

Between runs:

- `B · SHOP · <wallet>` is visible
- the shop shows four purchases with costs and queued state
- `1-4` buys on keyboard
- pointer / touch can buy directly
- `B` or `Esc` closes
- gameplay start keys are captured while the shop is open so a purchase cannot accidentally begin a run underneath the overlay

## 8. Qualification contract

v0.6.1 adds a dedicated static validator and four-browser anti-cheese regression.

The Sap authority browser test must demonstrate, in Chrome Stable, Chromium, Firefox, and WebKit:

1. only sparse authored Sap anchors remain
2. two eligible nodes at different distances always choose the nearer node
3. moving the chosen node's coordinates does not change its authored identity
4. attach momentum remains inside the direct velocity caps
5. holding the tether and aggressively steering for more than half a second cannot pump above the lease energy budget
6. release momentum remains inside the release caps
7. 24 rapid physical Shift taps after the first use leave successful Sap uses exactly at `1`
8. all subsequent presses are rejected until a real higher-log landing occurs
9. landing on a genuinely higher physical branch rearms Sap exactly once
10. moving the already consumed anchor after recharge cannot make it reusable
11. a new near/far pair in the second cycle again chooses the nearest node
12. unexpected or mismatched attachments fail closed
13. the runtime remains in `playing` mode and `nodeUses <= recharges + 1` remains true

The broader v0.6.1 workflow additionally requires:

- current-master TypeScript integration
- complete repository unit suite
- preserved movement / Flow numerical envelope
- Heartwood and Crown invariants
- Living Canopy static invariants
- Canopy Contracts economy invariants
- production build and runtime smoke
- four-engine Shift-hold input tests
- four-engine Heartwood persistence / canopy-trial tests
- four-engine Wonder Atlas / Elder set-piece / Skyheart tests
- four-engine economy tests
- browser screenshots and JSON evidence artifacts

The older Heartwood browser test also clears stale `grounded` authority before its synthetic Heartseed teleport. The prior failure was a test-harness bug: the fixed-step simulation correctly snapped the teleported player back to the branch that the harness had forgotten to release.

## Design thesis

Sylvaria should not ask the player to choose between logs and Sap.

It should make each mechanic create the opportunity for the other:

```text
RUN LOG
  ↓
BUILD STRIDE
  ↓
JUMP / SKIP
  ↓
LAND HIGHER → SAP READY
  ↓
SAP VAULT THROUGH OPEN AIR
  ↓
FIND THE NEXT LOG
  ↓
TOKEN / CONTRACT PROGRESS
  ↓
SHOP TOOL FOR THE NEXT ATTEMPT
```

The intended movement sentence is now explicit:

```text
log → jump/run → nearest Sap bridge → modest redirect → higher log → Sap recharges
```

That loop gives the climb rhythm, decisions, short-term objectives, and a small arcade economy without turning it into a grind or erasing the movement system that makes it fun.
