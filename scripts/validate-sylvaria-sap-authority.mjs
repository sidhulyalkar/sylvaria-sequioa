import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const runtime = join(root, 'public/game-runtimes/sylvaria-sequoia');
const read = (name) => readFileSync(join(runtime, name), 'utf8');

for (const name of ['02-sap-route-balance.js', '02-sap-authority-v2.js']) {
  execFileSync(process.execPath, ['--check', join(runtime, name)], { stdio: 'pipe' });
}

const index = read('index.html');
const routes = read('02-sap-route-balance.js');
const authority = read('02-sap-authority-v2.js');

assert.match(index, /Sylvaria: Sequoia v0\.6\.2/);
assert.match(index, /02-living-canopy\.js[\s\S]*02-sap-route-balance\.js[\s\S]*02-sap-rhythm\.js[\s\S]*02-canopy-economy\.js[\s\S]*02-canopy-director\.js[\s\S]*02-mastery-lab\.js[\s\S]*02-sap-authority-v2\.js[\s\S]*04-input\.js/);
assert.match(index, /nearest unused amber node/i);

for (const pattern of [
  /nearest-sap-authority-v3/,
  /stickAcquireBufferSeconds: 0/,
  /nearestEligibleAnchor/,
  /Math\.hypot\(knot\.x - player\.x, knot\.y - player\.y\)/,
  /usedAnchorIds/,
  /withOnlyTarget/,
  /if \(!armed\) return block\('SPENT'\)/,
  /MIN_GROUNDED_REARM_SECONDS = 0\.035/,
  /MAX_ATTACH_VX_GAIN = 95/,
  /MAX_ATTACH_VY_GAIN = 120/,
  /MAX_RELEASE_VX_GAIN = 105/,
  /MAX_RELEASE_VY_GAIN = 145/,
  /MAX_TETHER_SPEED_GAIN = 120/,
  /leaseSpeedCap/,
  /capSpeed\(leaseSpeedCap\)/,
  /sapAuthorityEnergyClamps/,
  /activeLeaseKnot/,
  /LEASE_NODE_MISMATCH/,
  /immutableAnchorIdentity: true/,
  /anchorIdentityFields: \['chunkId', 'floor', 'role', 'anchorKind'\]/,
  /S\.castSapStick = pressSapStick/,
  /S\.sapStick\.cast = pressSapStick/,
  /useInvariant: nodeUses <= recharges \+ 1/,
  /AUTHORITY_REJECT/,
]) assert.match(authority, pattern);

const holdGate = authority.indexOf('if (player.groundedTime < MIN_GROUNDED_REARM_SECONDS) return;');
const floorAdvance = authority.indexOf('if (floor > highestPhysicalFloor) highestPhysicalFloor = floor;');
const rechargeGate = authority.indexOf('if (armed || floor <= spentAtFloor) return;');
assert.ok(holdGate >= 0, 'missing held-landing Sap authority gate');
assert.ok(floorAdvance > holdGate, 'physical-floor authority advanced before held landing matured');
assert.ok(rechargeGate > floorAdvance, 'Sap recharge eligibility was evaluated before physical-floor authority advanced');

const anchorIdBody = authority.match(/function anchorId\(knot\) \{([\s\S]*?)\n  \}/)?.[1] || '';
assert.match(anchorIdBody, /chunkId/);
assert.match(anchorIdBody, /floor/);
assert.match(anchorIdBody, /role/);
assert.match(anchorIdBody, /anchorKind/);
assert.doesNotMatch(anchorIdBody, /knot\?\.x|knot\?\.y|Math\.round/);

assert.match(authority, /stickPullImpulse: 72/);
assert.match(authority, /stickTangentBoost: 78/);
assert.match(authority, /stickReleaseForward: 58/);
assert.match(authority, /releaseCap: Math\.min\(TUNE\.sap\.releaseCap, 118\)/);
assert.doesNotMatch(authority, /stickReleaseMinVy: 630/);
assert.match(routes, /densityProfile: 'sparse-one-anchor-v3'/);

const sandbox = { window: { SylvariaSequoia: { ROUTE_GRAMMARS: {} } } };
vm.runInNewContext(routes, sandbox, { filename: '02-sap-route-balance.js' });
const grammars = sandbox.window.SylvariaSequoia.ROUTE_GRAMMARS;
const expected = ['GROVE', 'SAPRUN', 'SLINGSHOT', 'WINDLINE', 'SKYHOOK', 'CROWNWEAVE', 'PENDULUM', 'THUNDERCROWN', 'MIGRATION', 'AURORARUN', 'ELDERSPAN', 'ECHOFLIGHT', 'SKYHEART'];
for (const name of expected) {
  const steps = grammars[name];
  assert.ok(Array.isArray(steps), `missing balanced Sap route ${name}`);
  const anchors = steps.filter((step) => step.branch === false && step.anchor).length;
  const maxAnchors = name === 'ELDERSPAN' || name === 'SKYHEART' ? 2 : 1;
  assert.ok(anchors <= maxAnchors, `${name} still contains too many Sap nodes: ${anchors}`);
  for (let index = 0; index < steps.length - 1; index += 1) {
    assert.ok(!(steps[index].branch === false && steps[index + 1].branch === false), `${name} contains consecutive air anchors at ${index}`);
  }
}

const totalSteps = expected.flatMap((name) => grammars[name]);
const totalAnchors = totalSteps.filter((step) => step.branch === false && step.anchor).length;
const totalBranches = totalSteps.filter((step) => step.branch !== false).length;
assert.ok(totalAnchors / totalBranches < 0.36, `Sap density is still too high: ${totalAnchors}/${totalBranches}`);

console.log(JSON.stringify({
  ok: true,
  version: '0.6.2-nearest-sap-authority-v3',
  targetRule: 'strict nearest eligible authored node at press time',
  identityRule: 'route chunk + floor + role + anchor kind; position never participates',
  rechargeRule: 'one Sap use, then a physically held higher-log landing; geometry grazes do not advance authority',
  nodeReuse: 'forbidden within a run, including moving anchors',
  directBoostCaps: {
    attach: { vx: 95, vy: 120 },
    release: { vx: 105, vy: 145 },
    tetherSpeedGain: 120,
  },
  routeDensity: { totalAnchors, totalBranches, ratio: Number((totalAnchors / totalBranches).toFixed(3)) },
}, null, 2));
