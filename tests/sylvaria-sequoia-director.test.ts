import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const director = read('public/game-runtimes/sylvaria-sequoia/02-canopy-director.js');
const progression = read('public/game-runtimes/sylvaria-sequoia/02-canopy-progression.js');
const authority = read('public/game-runtimes/sylvaria-sequoia/02-sap-authority-v2.js');
const mastery = read('public/game-runtimes/sylvaria-sequoia/02-mastery-lab.js');
const recap = read('public/game-runtimes/sylvaria-sequoia/03-run-recap-hud.js');
const economyHud = read('public/game-runtimes/sylvaria-sequoia/03-canopy-economy-hud.js');
const objectiveHud = read('public/game-runtimes/sylvaria-sequoia/03-living-objective-hud.js');
const index = read('public/game-runtimes/sylvaria-sequoia/index.html');
const manifest = JSON.parse(read('public/game-runtimes/sylvaria-sequoia/runtime-manifest.json')) as { version: string; bundle: string; modules: string[]; brotliBudgetBytes: number };
const bundleBuild = read('scripts/build-sylvaria-runtime.mjs');
const heartwoodBrowser = read('scripts/playtest-sylvaria-heartwood.mjs');

test('Sylvaria v0.6.2 pacing director creates deterministic mastery arcs without adaptive geometry', () => {
  assert.match(director, /canopy-director-v1/);
  assert.match(director, /living-setpiece-composition-v2/);
  assert.match(director, /const CROWN_CYCLE = 25/);
  assert.match(director, /BREATHE[\s\S]*BUILD[\s\S]*TEST[\s\S]*CROWN/);
  assert.match(director, /STORM CANOPY[\s\S]*floor: 132/);
  assert.match(director, /REDWOOD RUN[\s\S]*CHOIRLINE[\s\S]*WINDLINE[\s\S]*RECOVERY/);
  assert.match(director, /SAPWORK[\s\S]*BREAKAWAY[\s\S]*HOLLOWRUN[\s\S]*RECOVERY[\s\S]*AURORARUN/);
  assert.match(director, /HIGH CANOPY[\s\S]*PENDULUM[\s\S]*MIGRATION[\s\S]*RECOVERY[\s\S]*ELDERSPAN/);
  assert.match(director, /STORM CANOPY[\s\S]*CONEFALL[\s\S]*HOLLOWRUN[\s\S]*RECOVERY/);
  assert.match(director, /CROWNLINE[\s\S]*THUNDERCROWN[\s\S]*ELDERSPAN[\s\S]*RECOVERY[\s\S]*ECHOFLIGHT/);
  for (const setpiece of ['CHOIRLINE', 'HOLLOWRUN', 'AURORARUN', 'MIGRATION', 'ELDERSPAN', 'ECHOFLIGHT']) {
    assert.match(director, new RegExp(setpiece), `director dropped Living Canopy set piece ${setpiece}`);
  }
  assert.match(director, /preservesLivingSetpieces: verifyLivingSetpieces\(\)/);
  assert.match(director, /CATCH_GRACE_SECONDS = 2\.35/);
  assert.match(director, /sapCatches/);
  assert.match(director, /ownsRouteChoreography: true/);
  assert.doesNotMatch(director, /routeRng\.next|Math\.random|localStorage|masteryLab/, 'director must stay deterministic and history-blind');
});

test('Crown cadence and Mastery Lab make retry goals measurable without changing difficulty', () => {
  assert.match(progression, /const CROWN_INTERVAL = 25/);
  assert.match(progression, /crown-splits-v2/);
  assert.match(progression, /sylvaria\.sequoia\.crownSplits\.v1/);
  assert.match(progression, /crown-split/);
  assert.match(progression, /runFloorGain/);
  assert.match(progression, /nextSplitBestSeconds/);

  assert.match(mastery, /mastery-lab-v1/);
  assert.match(mastery, /v0\.6\.2-evidence-loop-v1/);
  assert.match(mastery, /HISTORY_LIMIT = 24/);
  assert.match(mastery, /nearCrownGap/);
  assert.match(mastery, /sameSeedRetry/);
  assert.match(mastery, /restartLatencySeconds/);
  assert.match(mastery, /difficultyCliff/);
  assert.match(mastery, /localOnly: true/);
  assert.match(mastery, /adaptsDifficulty: false/);
  assert.match(mastery, /mutatesTuning: false/);
  assert.match(mastery, /mutatesRouteRng: false/);
  assert.doesNotMatch(mastery, /routeRng\.next|Math\.random|S\.setTuning|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);

  assert.match(recap, /run-recap-v2/);
  assert.match(recap, /S\.masteryLab\?\.getState/);
  assert.match(recap, /masteryLine/);
  assert.match(recap, /TO CROWN/);
  assert.match(recap, /SPACE NEW RUN · 0 SAME SEED · B SHOP/);
});

test('Sap recharge requires a held physical landing and no branch graze can advance anchor authority', () => {
  assert.match(authority, /MIN_GROUNDED_REARM_SECONDS = 0\.035/);
  assert.match(authority, /if \(player\.groundedTime < MIN_GROUNDED_REARM_SECONDS\) return;/);
  const holdGate = authority.indexOf('if (player.groundedTime < MIN_GROUNDED_REARM_SECONDS) return;');
  const floorAdvance = authority.indexOf('if (floor > highestPhysicalFloor) highestPhysicalFloor = floor;');
  const rechargeGate = authority.indexOf('if (armed || floor <= spentAtFloor) return;');
  assert.ok(holdGate >= 0 && floorAdvance > holdGate, 'physical-floor authority advanced before the held-landing gate');
  assert.ok(rechargeGate > floorAdvance, 'recharge gate moved ahead of physical-floor authority');
  assert.match(authority, /minimumGroundedRearmSeconds: MIN_GROUNDED_REARM_SECONDS/);
});

test('runtime manifest preserves source-order authority while production loads one bundle', () => {
  assert.equal(manifest.version, '0.6.2');
  assert.equal(manifest.bundle, 'runtime.bundle.js');
  assert.equal(new Set(manifest.modules).size, manifest.modules.length);
  const pos = (name: string) => manifest.modules.indexOf(name);
  assert.ok(pos('02-canopy-economy.js') < pos('02-canopy-director.js'));
  assert.ok(pos('02-canopy-director.js') < pos('02-mastery-lab.js'));
  assert.ok(pos('02-mastery-lab.js') < pos('02-sap-authority-v2.js'));
  assert.ok(pos('03-economy-input-guard.js') < pos('03-run-recap-hud.js'));
  assert.ok(pos('03-run-recap-hud.js') < pos('04-input.js'));
  assert.match(index, /runtime\.bundle\.js\?v=062-mastery/);
  assert.equal((index.match(/<script src="\.\/runtime\.bundle\.js/g) || []).length, 1);
  assert.match(bundleBuild, /brotliCompressSync/);
  assert.match(bundleBuild, /createHash\('sha256'\)/);
  assert.match(bundleBuild, /sourceBudgetBytes/);
  assert.match(bundleBuild, /brotliBudgetBytes/);
});

test('HUD attention hierarchy keeps traversal primary and meta economy transient', () => {
  assert.match(economyHud, /focus-pulse-v2/);
  assert.match(economyHud, /persistentMissionPanel: false/);
  assert.match(economyHud, /persistentSapPanel: false/);
  assert.match(economyHud, /run objective > traversal > mastery > economy/);
  assert.match(economyHud, /const PULSE_SECONDS = 2\.15/);
  assert.match(objectiveHud, /traversal-focus-v2/);
  assert.match(objectiveHud, /if \(state\.mode !== 'playing'\) return;/);
  assert.doesNotMatch(objectiveHud, /drawGameOverObjective/);
  assert.match(recap, /if \(state\.mode !== 'gameover'\) return;/);
});

test('Heartwood browser qualification waits for behavior rather than fixed browser timing', () => {
  assert.match(heartwoodBrowser, /async function runtimeFrame/);
  assert.match(heartwoodBrowser, /async function waitUntil/);
  assert.match(heartwoodBrowser, /Heartseed pickup/);
  assert.match(heartwoodBrowser, /Conefall spawn/);
  assert.match(heartwoodBrowser, /counters\.conesSpawned/);
  assert.match(heartwoodBrowser, /Pendulum motion/);
  assert.match(heartwoodBrowser, /Breakaway removal/);
  assert.match(heartwoodBrowser, /Living Crown awakening/);
  assert.doesNotMatch(heartwoodBrowser, /setTimeout\(resolve,\s*55\)|setTimeout\(resolve,\s*40\)|setTimeout\(resolve,\s*45\)/);
});
