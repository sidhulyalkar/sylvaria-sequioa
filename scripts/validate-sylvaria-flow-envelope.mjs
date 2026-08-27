import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const feel = readFileSync(join(runtimeRoot, '00-feel-tuning.js'), 'utf8');
const core = readFileSync(join(runtimeRoot, '00-core.js'), 'utf8');
const world = readFileSync(join(runtimeRoot, '01-world.js'), 'utf8');
const assist = readFileSync(join(runtimeRoot, '02-flow-assist.js'), 'utf8');
const control = readFileSync(join(runtimeRoot, '02-control-authority.js'), 'utf8');
const stick = readFileSync(join(runtimeRoot, '02-sap-stick.js'), 'utf8');
const escalation = readFileSync(join(runtimeRoot, '02-canopy-escalation.js'), 'utf8');
const progression = readFileSync(join(runtimeRoot, '02-canopy-progression.js'), 'utf8');

function section(source, name) {
  const marker = `Object.assign(TUNE.${name}, {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing TUNE.${name}`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n  });', bodyStart);
  assert.notEqual(end, -1, `unterminated TUNE.${name}`);
  return source.slice(bodyStart, end);
}
function numberIn(source, key) {
  const match = source.match(new RegExp(`\\b${key}:\\s*(-?\\d+(?:\\.\\d+)?)`));
  assert.ok(match, `missing numeric ${key}`);
  return Number(match[1]);
}
function assignmentNumber(source, expression) {
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  assert.ok(match, `missing assignment ${expression}`);
  return Number(match[1]);
}
function constNumber(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`));
  assert.ok(match, `missing const ${name}`);
  return Number(match[1]);
}
function grammarBody(name) {
  const marker = `${name}: [`;
  const start = world.indexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = start + marker.length;
  let depth = 1;
  let cursor = bodyStart;
  for (; cursor < world.length; cursor += 1) {
    if (world[cursor] === '[') depth += 1;
    else if (world[cursor] === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.equal(depth, 0, `unterminated ${name}`);
  return world.slice(bodyStart, cursor);
}
function steps(name) {
  const body = grammarBody(name);
  return [...body.matchAll(/\{([^{}]+)\}/g)].map((match) => {
    const source = match[1];
    const dy = Number(source.match(/\bdy:\s*(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
    return {
      dy,
      branch: !/branch:\s*false/.test(source),
      anchor: /anchor:\s*'[^']+'/.test(source),
      length: Number(source.match(/\blength:\s*(\d+(?:\.\d+)?)/)?.[1] ?? 0),
    };
  });
}
const sum = (values) => values.reduce((total, value) => total + value, 0);
const run = section(feel, 'run');
const jump = section(feel, 'jump');
const rebound = section(feel, 'rebound');
const sap = section(feel, 'sap');
const combo = section(feel, 'combo');
const threat = section(feel, 'threat');
const gravity = Math.abs(numberIn(core, 'GRAVITY'));
const apex = (vy) => (vy * vy) / (2 * gravity);
const jumpBase = numberIn(jump, 'base');
const momentumGain = numberIn(jump, 'momentumGain');
const momentumCap = numberIn(jump, 'momentumCap');
const comboLift = numberIn(jump, 'comboLift');
const maxSpeed = numberIn(run, 'maxSpeed');
const strideMax = numberIn(run, 'strideMax');
const burstMinSpeed = numberIn(run, 'burstMinSpeed');
const jumpVy = (speed, flow = 0) => jumpBase + Math.min(momentumCap, speed * momentumGain) + Math.min(62, flow * comboLift);

const flow = steps('FLOW');
const recovery = steps('RECOVERY');
const grove = steps('GROVE');
const saprun = steps('SAPRUN');
const slingshot = steps('SLINGSHOT');
const standingTeachingGap = Math.max(flow[0].dy, ...recovery.filter((step) => step.branch).map((step) => step.dy));
const laterFlowGap = Math.max(...flow.slice(1).filter((step) => step.branch).map((step) => step.dy));
const twoFloorTarget = sum(flow.slice(0, 2).map((step) => step.dy));
const threeFloorTarget = sum(flow.slice(0, 3).map((step) => step.dy));
const developedRunFloor = twoFloorTarget * 1.34;
const developedRunCeiling = threeFloorTarget * 1.05;
const samples = [
  { label: 'standing', speed: 0, flow: 0 },
  { label: 'burst-entry', speed: burstMinSpeed, flow: 0 },
  { label: 'developed-run', speed: 480, flow: 1 },
  { label: 'full-stride', speed: strideMax, flow: 4 },
].map((sample) => ({ ...sample, vy: jumpVy(sample.speed, sample.flow), apex: apex(jumpVy(sample.speed, sample.flow)) }));
const by = Object.fromEntries(samples.map((sample) => [sample.label, sample]));

// Rootways remains the friendly laboratory. None of the late-game pressure work
// is allowed to steal the readable early jump envelope that the playtest liked.
assert.ok(by.standing.apex >= standingTeachingGap * 1.10, `standing jump lost teaching margin: ${by.standing.apex.toFixed(1)} vs ${standingTeachingGap}`);
assert.ok(by.standing.apex < laterFlowGap * 1.15, 'standing jump is erasing later FLOW spacing');
assert.ok(by['burst-entry'].apex >= twoFloorTarget * 0.96, `burst entry lost two-floor utility: ${by['burst-entry'].apex.toFixed(1)} vs ${twoFloorTarget}`);
assert.ok(by['developed-run'].apex >= developedRunFloor, `developed run no longer feels substantially stronger: ${by['developed-run'].apex.toFixed(1)} vs ${developedRunFloor.toFixed(1)}`);
assert.ok(by['developed-run'].apex < developedRunCeiling, `developed run is solving too much FLOW geometry: ${by['developed-run'].apex.toFixed(1)} vs ${developedRunCeiling.toFixed(1)}`);
assert.ok(by['full-stride'].apex < threeFloorTarget + 90, 'full Stride is becoming a route solver again');

const passiveWallVy = numberIn(rebound, 'verticalBase') + Math.min(numberIn(rebound, 'verticalCap'), maxSpeed * numberIn(rebound, 'verticalGain'));
assert.ok(apex(passiveWallVy) < Math.min(...recovery.map((step) => step.dy)) * 0.95, 'passive bark redirect climbs too much');
assert.ok(numberIn(rebound, 'retention') >= 0.74, 'passive bark deletes too much earned horizontal speed');
assert.ok(numberIn(rebound, 'comboSpeed') > 10000, 'passive bark must never score');
assert.ok(numberIn(jump, 'wallRefreshSpeed') > 10000, 'passive bark must never refresh Air Kick');
assert.ok(apex(numberIn(rebound, 'kickVertical')) >= twoFloorTarget * 0.85, 'Bark Kick lost meaningful rescue height');

assert.ok(numberIn(run, 'groundAccel') >= 3500, 'ground acceleration no longer feels immediate');
assert.ok(numberIn(run, 'airAccel') >= 1750, 'air steering authority regressed');
assert.ok(numberIn(run, 'reverseAirScale') >= 1.0, 'air reversal is being penalized instead of respecting user input');
assert.ok(numberIn(run, 'maxSpeed') >= 660 && numberIn(run, 'maxSpeed') <= 720, 'base run-speed envelope drifted');
assert.ok(numberIn(run, 'strideLaunchCarry') >= 0.78, 'Stride no longer preserves earned launch height');
assert.ok(numberIn(run, 'comboCarryCap') <= 55, 'combo carry is overpowering direct velocity control');
assert.ok(numberIn(run, 'comboAccelCap') <= 0.18, 'Flow acceleration cap is too high');
assert.ok(numberIn(combo, 'window') >= 3.1 && numberIn(combo, 'window') <= 3.6, 'Flow timing window left the responsive target band');
assert.ok(numberIn(threat, 'baseSpeed') <= 22, 'Rootways pressure is crowding out movement learning');
assert.match(assist, /passiveBarkRedirects/);
assert.match(control, /velocity-authority-v2/);
assert.match(control, /stride-height-carry/);
assert.match(control, /groundReverseAssist: 1120/);
assert.match(control, /airReverseAssist: 920/);
assert.match(control, /vertical energy is restored/);
assert.match(control, /player-owned horizontal velocity; Stride carries vertical opportunity only/);

const branchRatio = (route) => route.filter((step) => step.branch).length / route.length;
assert.equal(grove.filter((step) => step.branch).length, 2, 'GROVE should have exactly two real branch tiers');
assert.equal(saprun.filter((step) => step.branch).length, 2, 'SAPRUN should have exactly two real branch tiers');
assert.equal(slingshot.filter((step) => step.branch).length, 2, 'SLINGSHOT should have exactly two real branch tiers');
assert.ok(branchRatio(saprun) <= 0.4, 'SAPRUN became branch-crowded');
assert.ok(saprun.filter((step) => step.anchor).length >= 3, 'SAPRUN needs three branchless amber anchors');
assert.ok(grove.filter((step) => step.anchor).length >= 2, 'GROVE needs branchless amber traversal');
assert.ok(slingshot.filter((step) => step.anchor).length >= 2, 'SLINGSHOT needs branchless amber traversal');

const leftWall = assignmentNumber(world, 'state.LEFT_WALL');
const rightWall = assignmentNumber(world, 'state.RIGHT_WALL');
assert.equal(leftWall, 100);
assert.equal(rightWall, 860);
assert.equal(rightWall - leftWall, 760);

const stickRange = numberIn(sap, 'stickRange');
const stickAcquire = numberIn(sap, 'stickAcquireBufferSeconds');
const stickMinHold = numberIn(sap, 'stickMinHoldSeconds');
const stickMaxHold = numberIn(sap, 'stickMaxHoldSeconds');
const stickSteer = numberIn(sap, 'stickSteerAccel');
const stickReuse = numberIn(sap, 'stickReuseLockSeconds');
const stickReleaseVy = numberIn(sap, 'stickReleaseMinVy');
const cleanMin = constNumber(stick, 'CLEAN_VAULT_MIN_HOLD');
const cleanMax = constNumber(stick, 'CLEAN_VAULT_MAX_HOLD');
const cleanHorizontal = constNumber(stick, 'CLEAN_VAULT_MIN_HORIZONTAL');
assert.ok(stickRange >= 600 && stickRange <= 680, 'Sap Stick target range drifted');
assert.ok(stickAcquire >= 0.14 && stickAcquire <= 0.24, 'Sap Stick early-press acquisition buffer left the forgiving range');
assert.ok(stickMinHold <= 0.09, 'Sap Stick minimum hold reintroduced a timing tax');
assert.ok(stickMaxHold >= 1.0 && stickMaxHold <= 1.6, 'Sap Stick hold window is too short for swing control or too long for bounded play');
assert.ok(stickSteer >= 2100, 'Sap Stick A/D swing steering lost direct player authority');
assert.ok(stickReuse >= 0.6, 'Sap Stick anchors can be farmed too quickly');
assert.ok(apex(stickReleaseVy) >= 100, 'Sap Stick vault lost meaningful vertical rescue');
assert.ok(numberIn(sap, 'stickAnchorPriority') >= 90, 'authored branchless anchors are not preferred strongly enough');
assert.ok(cleanMin >= 0.12 && cleanMin <= 0.22, 'Clean Sap lower bound became a precision tax');
assert.ok(cleanMax >= 0.65 && cleanMax <= 0.95, 'Clean Sap timing window became too narrow or too automatic');
assert.ok(cleanHorizontal >= 280 && cleanHorizontal <= 390, 'Clean Sap speed floor left the skillful-but-reachable band');
assert.match(stick, /Number\.POSITIVE_INFINITY/);
assert.match(stick, /sapStickFlowCarries/);
assert.match(stick, /sapStickCleanVaults/);
assert.doesNotMatch(stick, /S\.addComboLink\('SAP', 'SAP STICK'/, 'ordinary Sap Stick vaults must not manufacture Flow links');
assert.doesNotMatch(stick, /charge(?:Seconds|Time)|holdToCharge/i);
assert.doesNotMatch(sap, /stickHoldSeconds/);

// Altitude escalation is bounded and delayed. Wind starts only after the teaching
// zone and reaches its strongest values where the route grammar is already expert.
assert.match(escalation, /if \(floor < 46\) return 0/);
assert.match(escalation, /lerp\(72, 520, intensity\)/);
assert.match(escalation, /tethered \? 0\.22/);
assert.match(escalation, /grounded \? \(stall \? 0\.26 : 0\.06\) : 1/);
assert.match(escalation, /high\.geometry = Math\.max\(high\.geometry, 0\.82\)/);
assert.match(escalation, /crown\.geometry = Math\.max\(crown\.geometry, 1\.08\)/);
assert.match(escalation, /crown\.pressure = Math\.max\(crown\.pressure, 1\.34\)/);
for (const grammar of ['WINDLINE', 'SKYHOOK', 'CROWNWEAVE']) assert.match(escalation, new RegExp(`${grammar}: \\[`));
const lateBranchless = [...escalation.matchAll(/branch:\s*false/g)].length;
assert.ok(lateBranchless >= 8, `late canopy lost its open-air density: ${lateBranchless} branchless tiers`);
assert.doesNotMatch(escalation, /routeRng\.next\(/, 'crosswind may not consume route RNG');

const crownInterval = constNumber(progression, 'CROWN_INTERVAL');
assert.equal(crownInterval, 25, 'Crown Trail cadence drifted');
assert.match(progression, /sylvaria\.sequoia\.bestFloor/);
assert.match(progression, /nextCrownFloor/);
assert.match(progression, /route-clear-bonus/);

const branchlessDys = [...grove, ...saprun, ...slingshot].filter((step) => !step.branch).map((step) => step.dy);
assert.ok(Math.max(...branchlessDys) <= 180, 'base branchless anchor spacing exceeds authored Sap Stick rhythm envelope');
assert.deepEqual([...world.matchAll(/\{ name: '[^']+', floor: (\d+)/g)].map((match) => Number(match[1])), [0, 30, 70, 115, 165]);

console.log(JSON.stringify({
  ok: true,
  mode: 'crown-trail-escalating-canopy-player-owned-flow',
  corridor: { left: leftWall, right: rightWall, width: rightWall - leftWall },
  density: {
    grove: { branches: grove.filter((s) => s.branch).length, tiers: grove.length },
    saprun: { branches: saprun.filter((s) => s.branch).length, tiers: saprun.length },
    slingshot: { branches: slingshot.filter((s) => s.branch).length, tiers: slingshot.length },
    lateBranchlessTiers: lateBranchless,
  },
  teaching: { standingGap: standingTeachingGap, laterFlowGap, developedRunFloor, developedRunCeiling, windStartsAfterFloor: 46 },
  jumpEnvelope: samples.map(({ label, speed, flow: flowCount, vy, apex: height }) => ({ label, speed, flow: flowCount, launchVy: Number(vy.toFixed(1)), ballisticApex: Number(height.toFixed(1)) })),
  control: { groundAccel: numberIn(run, 'groundAccel'), airAccel: numberIn(run, 'airAccel'), reverseAirScale: numberIn(run, 'reverseAirScale'), barkRetention: numberIn(rebound, 'retention') },
  sapStick: {
    range: stickRange,
    acquisitionBufferSeconds: stickAcquire,
    minHoldSeconds: stickMinHold,
    maxHoldSeconds: stickMaxHold,
    steerAccel: stickSteer,
    reuseLockSeconds: stickReuse,
    releaseApex: Number(apex(stickReleaseVy).toFixed(1)),
    cleanVaultWindow: [cleanMin, cleanMax],
    cleanVaultMinHorizontal: cleanHorizontal,
  },
  progression: { crownInterval, lateRouteFamilies: ['WINDLINE', 'SKYHOOK', 'CROWNWEAVE'] },
}, null, 2));
