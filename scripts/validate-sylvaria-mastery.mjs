import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const read = (name) => readFileSync(join(runtimeRoot, name), 'utf8');
const mastery = read('02-mastery-lab.js');
const director = read('02-canopy-director.js');
const recap = read('03-run-recap-hud.js');
const authority = read('02-sap-authority-v2.js');
const manifest = JSON.parse(read('runtime-manifest.json'));

for (const name of ['02-mastery-lab.js', '03-run-recap-hud.js']) {
  execFileSync(process.execPath, ['--check', join(runtimeRoot, name)], { stdio: 'pipe' });
}

for (const pattern of [
  /mastery-lab-v1/,
  /v0\.6\.2-evidence-loop-v1/,
  /HISTORY_KEY = 'sylvaria\.sequoia\.masteryRuns\.v1'/,
  /HISTORY_LIMIT = 24/,
  /CROWN_INTERVAL = 25/,
  /NEAR_CROWN_FLOORS = 4/,
  /stageSeconds/,
  /stageNearThreat/,
  /floorsPerMinute/,
  /nearThreatRatio/,
  /lowMomentumRatio/,
  /momentumBurns/,
  /sapBlockedPresses/,
  /sapUses/,
  /sapRecharges/,
  /sameSeedRetry/,
  /restartLatencySeconds/,
  /difficultyCliff/,
  /previous\.completionRate >= 0\.55/,
  /currentBand\.completionRate <= 0\.35/,
  /localOnly: true/,
  /adaptsDifficulty: false/,
  /mutatesTuning: false/,
  /mutatesRouteRng: false/,
]) assert.match(mastery, pattern);

for (const forbidden of [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
  /state\.routeRng\.next\s*\(/,
  /Math\.random\s*\(/,
  /S\.setTuning\s*\(/,
  /TUNE\.[a-z]+\.[a-zA-Z0-9_]+\s*=/,
  /S\.PHASES\.(?:push|splice|sort)\s*\(/,
]) assert.doesNotMatch(mastery, forbidden, `Mastery Lab must remain observational-only: ${forbidden}`);
assert.doesNotMatch(director, /masteryLab|masteryRuns|localStorage/, 'difficulty director must never read player telemetry history');

assert.match(recap, /run-recap-v2/);
assert.match(recap, /S\.masteryLab\?\.getState/);
assert.match(recap, /masteryLine/);
assert.match(recap, /TO CROWN/);
assert.match(recap, /SPACE NEW RUN · 0 SAME SEED · B SHOP/);

const holdGate = authority.indexOf('if (player.groundedTime < MIN_GROUNDED_REARM_SECONDS) return;');
const floorAdvance = authority.indexOf('if (floor > highestPhysicalFloor) highestPhysicalFloor = floor;');
const rechargeGate = authority.indexOf('if (armed || floor <= spentAtFloor) return;');
assert.ok(holdGate >= 0, 'missing held-landing Sap authority gate');
assert.ok(floorAdvance > holdGate, 'physical-floor authority advances before held landing matures');
assert.ok(rechargeGate > floorAdvance, 'Sap recharge gate is evaluated before physical-floor authority is updated');

assert.equal(manifest.version, '0.6.2');
assert.ok(manifest.modules.includes('02-mastery-lab.js'));
assert.ok(manifest.modules.indexOf('02-canopy-director.js') < manifest.modules.indexOf('02-mastery-lab.js'));
assert.ok(manifest.modules.indexOf('02-mastery-lab.js') < manifest.modules.indexOf('02-sap-authority-v2.js'));

console.log(JSON.stringify({
  ok: true,
  version: '0.6.2-mastery-lab',
  privacy: 'local browser summaries only',
  difficultyAuthority: 'observational telemetry never feeds route RNG, phase pressure, or movement tuning',
  historyLimit: 24,
  nearCrownWindow: 4,
  cliffSignal: '>=3 reaches, prior completion >=55%, current completion <=35%, >=25-point drop',
}, null, 2));
