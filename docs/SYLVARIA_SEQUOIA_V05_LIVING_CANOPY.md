# Sylvaria: Sequoia v0.5 — Living Canopy

## Product thesis

v0.5 changes the reason to climb.

The game should not rely on a high score to manufacture motivation. Height remains the spatial language and personal-best mastery tail, but the player now climbs because the tree contains **destinations, secrets, risky discoveries, and changing movement ecologies**.

The desired feeling is:

> “I know there is something above me, I almost reached it last run, and this run might reveal something I have never seen.”

The movement system remains the game. No combat layer, upgrade shop, permanent stat grind, or inventory treadmill is introduced.

## The motivation ladder

The complete v0.5 progression has five overlapping horizons.

### 1. Crown Marks — immediate appetite

Every 25 floors the existing Crown Trail provides a nearby world-space target. A player who has no knowledge of the larger game always has something attainable just above them.

### 2. Heartseeds — persistent risky detours

Five named Heartseeds remain the first finite quest:

- ROOTLIGHT — floor 22
- REDSTAR — floor 58
- SAPHEART — floor 103
- SKYSEED — floor 153
- CROWNCORE — floor 218

They sit away from the safest route. Collection persists. Each gives a bounded run-local mobility/recovery refill so greed can be strategically useful, but no Heartseed permanently increases movement stats.

### 3. Living Crown — first finite destination

Collecting all five Heartseeds wakes the Living Crown objective at floor 250. Reaching it permanently records Crown awakening.

This gives ordinary players a concrete completion arc without ending the movement game.

### 4. Canopy Wonders — mastery as a key

After the basic Heartwood mystery, the tree contains six persistent Wonders. These are not pickups that merely require collision. Each asks the player to arrive in a specific earned movement state.

| Wonder | Floor | Required mastery | Player fantasy |
| --- | ---: | --- | --- |
| WIND CHOIR | 88 | 3× Flow | carry a live rhythm into a resonant grove |
| LIGHTNING HOLLOW | 132 | Bark Cling | find the crack in the trunk while attached to bark |
| SUNWING MIGRATION | 174 | airborne speed ≥ 450 | intercept a moving flock instead of touching a static collectible |
| RESIN AURORA | 216 | recent Clean Sap | paint a hidden phenomenon by executing a shaped grapple release |
| ELDER BOUGH | 278 | Stride ≥ 600 + 5× Flow | arrive at an ancient limb with a mature high-speed line |
| CROWN ECHO | 326 | CROWNVELOCITY | reveal the echo only while the player is in the game’s highest flow state |

The Wonder Atlas persists via a six-bit mask. Discoveries reward immediate recovery and celebration, not permanent power.

This converts the existing movement vocabulary into exploration verbs. The player learns that mechanics are not just ways to survive. They are keys that make the tree disclose new things.

### 5. Skyheart — second finite destination

Once the Living Crown is awake and all six Wonders are remembered, the **Skyheart** at floor 360 becomes the final finite v0.5 destination.

Ringing it persists across runs. The completion message deliberately says:

> THE SKYHEART RINGS
>
> THE TREE HAS NO FINAL FLOOR

The game then becomes a pure Elder Canopy mastery climb. This preserves an endless arcade tail while still giving the main journey a satisfying completion point.

## Difficulty should change vocabulary

The old failure mode was making the same platform puzzle incrementally narrower. v0.5 instead makes altitude introduce new kinds of decisions.

The broad progression is:

`runways → sparse Sap lines → wind → breakaways → moving anchors → Conefall → resonant routes → elder pulses → Skyheart synthesis`

Existing late systems remain:

- BREAKAWAY: readable branch collapse after landing
- PENDULUM: moving Sap anchors
- CONEFALL: telegraphed falling cones that knock the player off line
- THUNDERCROWN: synthesis of unstable footing, moving anchors, wind and falling hazards
- WINDLINE / SKYHOOK / CROWNWEAVE
- deterministic crosswind

v0.5 adds seven route families.

### CHOIRLINE

A rhythmic Ring / branch / Sap phrase. The geometry encourages maintaining Flow rather than braking for every landing.

### HOLLOWRUN

Alternating real branches and open anchor movement near the trunk. It is suited to Bark recovery and Lightning Hollow discovery.

### MIGRATION

Aerial movement through repeated anchors and Rings. The Sunwing target itself moves laterally, turning interception into a spatial read.

### AURORARUN

Longer open-air Sap phrases intended to make a Clean Sap release tactically useful rather than an isolated scoring trick.

### ELDERSPAN

A long seven-tier traversal phrase with sparse landings, late fragile surfaces and moving-anchor interactions. It is a traversal set piece rather than a single jump check.

### ECHOFLIGHT

Mostly branchless high-canopy traversal with resonant Rings and stronger moving anchors. The player must preserve an aerial line through environmental pressure.

### SKYHEART

The v0.5 capstone grammar. It mixes:

- narrow but readable real branches
- long branchless Sap transfers
- moving anchors
- pulsing Rings
- fragile late footing
- elder-wind pulses
- existing high-canopy pressure

It should feel like a boss encounter made out of movement rather than an enemy health bar.

## New altitude phases

### LIVING CROWN — floor 250+

The player has reached the first finite destination. Route selection shifts toward ELDERSPAN, ECHOFLIGHT, THUNDERCROWN, AURORARUN and MIGRATION while retaining occasional RECOVERY phrases.

### ELDER SKY — floor 320+

The climb now assumes competence with every major verb. SKYHEART enters the route pool and the safest conventional routes become uncommon.

The player is still protected from invisible difficulty. Hazards are telegraphed and deterministic.

## Resonance Rings

Selected Rings in CHOIRLINE, MIGRATION, ECHOFLIGHT and SKYHEART pulse their radius over time.

This creates a timing read without turning Rings into random moving targets. The center remains fixed. The pulse is visual and deterministic.

A player can choose to wait for a generous phase, but high-canopy pressure makes that delay costly.

## Elder-wind pulses

ELDERSPAN, ECHOFLIGHT and SKYHEART add a periodic directional pulse layered on top of the ordinary altitude wind.

Rules:

- pulse direction is deterministic from run seed + route
- a warning visualization appears before force is applied
- tethered or grounded players are largely protected
- the pulse influences airborne trajectories rather than deleting player control
- direction periodically flips
- SKYHEART is stronger than ordinary Elder routes

The mechanic creates a cadence problem: commit to a jump, grapple to shelter from the pulse, or intentionally use the push.

## Player-owned movement remains non-negotiable

The v0.4 feel baseline is preserved:

- 120 Hz authoritative simulation
- ground acceleration 3720
- air steering 1900
- max base speed 690
- strong reversal authority
- Stride preserves vertical opportunity rather than secretly steering the player
- one renewable Air Kick
- passive bark is low-energy redirection
- deliberate Bark Cling → Bark Kick is the wall skill
- one-button Shift Sap Stick
- 180 ms Sap acquisition buffer
- direct screen-horizontal held steering
- release Shift to vault
- ordinary Sap preserves Flow but does not manufacture a combo link
- Clean Sap earns the SAP link

The new systems are layered on top of this movement contract. They must never make the player feel that a scripted event stole control.

## Discovery UX

The forest remains the interface.

Wonders are primarily world-space phenomena rather than checklist cards:

- Wind Choir: concentric wind arcs
- Lightning Hollow: luminous trunk fissure
- Sunwing Migration: moving flock marks
- Resin Aurora: flowing resin-light ribbons
- Elder Bough: ancient concentric growth geometry
- Crown Echo: expanding resonant rings
- Skyheart: luminous suspended heart/bell structure

When a Wonder is near, the HUD may briefly surface its name. At the object itself, the required mastery condition appears only when useful.

The permanent HUD remains thin. The right-side objective text follows the ladder:

`HEARTSEEDS → LIVING CROWN → WONDERS → SKYHEART → ELDER CANOPY`

Score never occupies the primary objective slot.

## Persistence without grind

Persistent keys:

- `sylvaria.sequoia.heartseedMask`
- `sylvaria.sequoia.crownAwakened`
- `sylvaria.sequoia.wonderMask`
- `sylvaria.sequoia.skyheartRung`
- existing best-floor / best-Flow records

Persistent state unlocks knowledge and completion, not permanent numerical advantage.

This is intentional. The ideal retry thought is “I can reach that thing now that I understand the route,” not “I need to farm enough currency to make the jump possible.”

## Determinism boundary

Living Canopy variation uses hash functions over run seed, floor and stable salts.

It must not consume `state.routeRng`.

Rendering must not consume route RNG. Discovery state must not modify collision geometry unpredictably. Same-seed comparisons remain meaningful.

## Telemetry

v0.5 adds or relies on:

- `canopy-wonder-rumor`
- `canopy-wonder-discovered`
- `skyheart-unlocked`
- `living-setpiece-enter`
- `elder-wind-pulse`
- `skyheart-rung`
- `wondersDiscovered`
- `elderPulses`
- `skyheartRings`

Existing movement, Sap, Crown, Conefall, wind and route telemetry remains authoritative.

Useful playtest questions:

1. Does the first Wonder create curiosity rather than confusion?
2. Does a failed Wonder attempt feel like “I know what to do next time”?
3. Are the conditions readable without a large tutorial panel?
4. Does the player naturally alternate between safe climbing and greed?
5. Does the Living Crown feel like a meaningful first completion rather than merely floor 250?
6. Does the Wonder Atlas provide a reason to revisit lower altitude skills?
7. Does ELDERSPAN feel like a phrase rather than seven disconnected jumps?
8. Are elder pulses readable enough to exploit intentionally?
9. Is SKYHEART difficult because multiple learned verbs are combined, not because controls become unreliable?
10. After ringing Skyheart, does “one more endless run” still feel attractive?

## Qualification boundary

A v0.5 head is not qualified until it passes:

- current-master TypeScript integration
- current repository unit tests
- v0.4 movement / jump / Sap numerical envelope
- Heartwood persistence and Crown transition
- v0.5 static Living Canopy invariants
- production build
- runtime smoke
- Chrome Stable / Chromium / Firefox / WebKit physical-input Sap contract
- four-browser Heartwood contract
- four-browser Living Canopy Wonder persistence contract
- real fragile/swaying/pulsing set-piece state
- persistent 6/6 Wonder Atlas
- persistent Skyheart completion
- screenshots / evidence artifacts

Even after automated qualification, the branch remains a gameplay-tuning candidate until a human playtest confirms the 250–360 difficulty curve is exciting rather than merely dense.
