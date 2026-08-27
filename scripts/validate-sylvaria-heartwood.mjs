import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const indexPath = join(runtimeRoot, 'index.html');
const questPath = join(runtimeRoot, '02-heartwood-quest.js');
const trialsPath = join(runtimeRoot, '02-canopy-trials.js');
const renderPath = join(runtimeRoot, '03-heartwood-trials-render.js');
const progressHudPath = join(runtimeRoot, '03-canopy-progress-hud.js');

for (const path of [indexPath, questPath, trialsPath, renderPath, progressHudPath]) {
  assert.ok(existsSync(path), `missing Heartwood progression artifact: ${path}`);
}
for (const path of [questPath, trialsPath, renderPath, progressHudPath]) {
  execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
}

const index = readFileSync(indexPath, 'utf8');
const quest = readFileSync(questPath, 'utf8');
const trials = readFileSync(trialsPath, 'utf8');
const render = readFileSync(renderPath, 'utf8');
const progressHud = readFileSync(progressHudPath, 'utf8');

assert.match(index, /Sylvaria: Sequoia v0\.6\.2/);
assert.match(index, /02-canopy-progression\.js[\s\S]*02-heartwood-quest\.js[\s\S]*02-canopy-trials\.js/);
assert.match(index, /03-sap-stick-control-hud\.js[\s\S]*03-heartwood-trials-render\.js[\s\S]*03-living-canopy-render\.js[\s\S]*03-canopy-progress-hud\.js/);

for (const pattern of [
  /heartwood-quest-v1/,
  /FINAL_CROWN_FLOOR = 250/,
  /COLLECT_RADIUS = 34/,
  /ROOTLIGHT[\s\S]*floor: 22/,
  /REDSTAR[\s\S]*floor: 58/,
  /SAPHEART[\s\S]*floor: 103/,
  /SKYSEED[\s\S]*floor: 153/,
  /CROWNCORE[\s\S]*floor: 218/,
  /sylvaria\.sequoia\.heartseedMask/,
  /sylvaria\.sequoia\.crownAwakened/,
  /function positionSeed\(/,
  /function collectSeed\(/,
  /player\.airJumps = TUNE\.jump\.airJumps/,
  /player\.saves < 2/,
  /living-crown-unlocked/,
  /living-crown-awakened/,
  /HEARTSEED/,
  /S\.heartwoodQuest =/,
]) assert.match(quest, pattern);
assert.doesNotMatch(quest, /state\.routeRng\.next\(/, 'Heartseed placement must not consume route RNG');

for (const grammar of ['BREAKAWAY', 'PENDULUM', 'CONEFALL', 'THUNDERCROWN']) {
  assert.match(trials, new RegExp(`${grammar}: \\[`), `missing ${grammar} trial grammar`);
}
for (const pattern of [
  /canopy-trials-v1/,
  /branch\.floor < 76/,
  /knot\.floor < 92/,
  /player\.highestFloor < 132/,
  /fragile-branch-trigger/,
  /fragile-branch-break/,
  /_trialSway/,
  /function spawnCone\(/,
  /cone-hit/,
  /conesDodged/,
  /BREAKAWAY · KEEP MOVING/,
  /PENDULUM · TIME THE SAP/,
  /CONEFALL · WATCH THE SKY/,
  /THUNDERCROWN · NO SAFE LINE/,
  /S\.canopyTrials =/,
]) assert.match(trials, pattern);
assert.doesNotMatch(trials, /state\.routeRng\.next\(/, 'trial variation must remain deterministic without consuming route RNG');

for (const pattern of [
  /heartwood-trials-render-v1/,
  /function drawFragileBranches\(/,
  /function drawSwayTrails\(/,
  /function drawCones\(/,
  /function drawHeartseed\(/,
  /function drawLivingCrown\(/,
  /THE LIVING CROWN/,
  /cone-warnings/,
  /S\.render = render/,
]) assert.match(render, pattern);
assert.doesNotMatch(render, /routeRng\.next\(/, 'quest/trial rendering must never consume route RNG');

for (const pattern of [
  /minimal-crown-hud-v1/,
  /heartwood-objective-v2/,
  /function objectiveText\(/,
  /HEARTSEEDS/,
  /LIVING CROWN/,
  /WAKE THE CROWN/,
  /primaryObjective: 'wake the crown with five persistent Heartseeds'/,
]) assert.match(progressHud, pattern);
assert.doesNotMatch(progressHud, /fillText\(`\$\{Math\.floor\(player\.score\)\} PTS`/, 'score must no longer own the primary objective slot');

console.log('Sylvaria Heartwood quest + canopy trial gate passed inside v0.6.2');
console.log('  persistent objective: 5 Heartseeds -> Living Crown @ 250');
console.log('  optional risk: off-line Heartseed positions with immediate mobility/survival refill');
console.log('  escalation: BREAKAWAY -> PENDULUM -> CONEFALL -> THUNDERCROWN');
console.log('  continuation: Living Canopy + Canopy Contracts + nearest-node Sap authority + observational Mastery Lab');
