import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const required = [
  'index.html',
  '02-sap-route-balance.js',
  '02-sap-rhythm.js',
  '02-canopy-economy.js',
  '02-sap-authority-v2.js',
  '03-canopy-economy-hud.js',
  '03-economy-input-guard.js',
  '05-debug-canopy-contracts.js',
];

for (const name of required) {
  const path = join(runtimeRoot, name);
  assert.ok(existsSync(path), `missing Canopy Contracts artifact: ${name}`);
  if (name.endsWith('.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
}

const read = (name) => readFileSync(join(runtimeRoot, name), 'utf8');
const index = read('index.html');
const routes = read('02-sap-route-balance.js');
const rhythm = read('02-sap-rhythm.js');
const economy = read('02-canopy-economy.js');
const authority = read('02-sap-authority-v2.js');
const hud = read('03-canopy-economy-hud.js');
const input = read('03-economy-input-guard.js');
const debug = read('05-debug-canopy-contracts.js');

assert.match(index, /Sylvaria: Sequoia v0\.6\.1/);
assert.match(index, /02-living-canopy\.js[\s\S]*02-sap-route-balance\.js[\s\S]*02-sap-rhythm\.js[\s\S]*02-canopy-economy\.js[\s\S]*02-sap-authority-v2\.js/);
assert.match(index, /03-canopy-economy-hud\.js[\s\S]*03-economy-input-guard\.js[\s\S]*04-input\.js/);
assert.match(index, /05-debug-living-canopy\.js[\s\S]*05-debug-canopy-contracts\.js/);
assert.match(index, /Land higher logs to recharge Sap/i);
assert.match(index, /Cone Tokens/i);
assert.match(index, /nearest unused amber node/i);

for (const pattern of [
  /sap-rhythm-v1/,
  /MIN_ANCHOR_VERTICAL_SPACING = 205/,
  /knot\?\.anchorKind === 'sap-stick'/,
  /if \(player\.sap\?\.stickMode\) return true/,
  /if \(!sapReady\) return blockedSapPress\(\)/,
  /floor > spentAtFloor/,
  /sapUses <= sapCycles \+ 1/,
  /SAP SPENT · LAND ON A HIGHER LOG/,
  /SAP READY · HIGHER LOG BANKED/,
]) assert.match(rhythm, pattern);
assert.doesNotMatch(rhythm, /TUNE\.run\.|TUNE\.jump\./, 'Sap rhythm must not rewrite core movement tuning');

assert.match(routes, /sap-route-balance-v2/);
assert.match(routes, /physical landing opportunity before every additional Sap anchor/);
assert.match(authority, /nearest-sap-authority-v3/);
assert.match(authority, /stickAcquireBufferSeconds: 0/);
assert.match(authority, /nearestEligibleAnchor/);
assert.match(authority, /usedAnchorIds/);
assert.match(authority, /immutableAnchorIdentity: true/);
assert.match(authority, /anchorIdentityFields: \['chunkId', 'floor', 'role', 'anchorKind'\]/);
assert.match(authority, /useInvariant: nodeUses <= recharges \+ 1/);

for (const pattern of [
  /canopy-contracts-v1/,
  /sylvaria\.sequoia\.coneTokens/,
  /sylvaria\.sequoia\.shopLoadout/,
  /TOKEN_PICKUP_CHANCE = 0\.18/,
  /MILESTONE_STEP = 25/,
  /MILESTONE_REWARD = 2/,
  /id: 'extra-life'[\s\S]*cost: 18/,
  /id: 'stride-seed'[\s\S]*cost: 12/,
  /id: 'resin-flask'[\s\S]*cost: 14/,
  /id: 'trail-map'[\s\S]*cost: 10/,
  /player\.saves = Math\.min\(3/,
  /player\.strideMomentum = Math\.max\(player\.strideMomentum \|\| 0, 280\)/,
  /player\.resin = Math\.max\(player\.resin \|\| 0, 0\.65\)/,
  /runMissionMultiplier = 1\.5/,
  /'two-way-climb'/,
  /'log-ladder'/,
  /'clean-craft'/,
  /'flow-study'/,
  /'high-road'/,
  /'no-panic'/,
  /'ring-route'/,
  /freshLogs >= 8 && s\.sapCycles >= 2/,
  /collectLogToken/,
  /missionsCompleted/,
]) assert.match(economy, pattern);

assert.match(hud, /canopy-contracts-hud-v1/);
assert.match(hud, /CANOPY CONTRACTS/);
assert.match(hud, /CANOPY SHOP/);
assert.match(hud, /SAP SPENT · LAND ON A HIGHER LOG/);
assert.match(hud, /run-local tools/i);
assert.match(input, /KeyB/);
assert.match(input, /Digit1/);
assert.match(input, /Digit4/);
assert.match(input, /stopImmediatePropagation/);
assert.match(debug, /debug\.version = '0\.6\.1'/);
assert.match(debug, /getSapRhythm/);
assert.match(debug, /getSapAuthority/);
assert.match(debug, /getEconomy/);

// Shop purchases are intentionally consumable next-run aids. The economy must
// never mutate authoritative base acceleration, jump constants, gravity, or route
// RNG, so currency cannot become permanent movement-stat grinding.
for (const source of [economy, hud, input]) {
  assert.doesNotMatch(source, /state\.routeRng\.next\(/);
  assert.doesNotMatch(source, /TUNE\.run\.(?:groundAccel|airAccel|maxSpeed)\s*=/);
  assert.doesNotMatch(source, /TUNE\.jump\.(?:base|momentumGain)\s*=/);
  assert.doesNotMatch(source, /state\.GRAVITY\s*=/);
}

console.log(JSON.stringify({
  ok: true,
  runtime: 'sylvaria-sequoia',
  version: '0.6.1-canopy-contracts',
  sapLoop: 'higher log -> nearest unused Sap node -> bounded nudge -> higher log recharge',
  sapIdentity: 'immutable authored route identity, independent of moving anchor coordinates',
  currency: 'Cone Tokens',
  shop: ['Extra Life', 'Stride Seed', 'Resin Flask', 'Trail Map'],
  missions: ['Two-Way Climb', 'Log Ladder', 'Clean Craft', 'Flow Study', 'High Road', 'No Panic', 'Ring Route'],
}, null, 2));