import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const runtimeRoot = join(root, 'public/game-runtimes/sylvaria-sequoia');
const readRuntime = (name: string) => readFileSync(join(runtimeRoot, name), 'utf8');
const readScript = (name: string) => readFileSync(join(root, 'scripts', name), 'utf8');

test('Cone Token HUD uses the canonical camera projection without hidden renderer globals', () => {
  const hud = readRuntime('03-canopy-economy-hud.js');
  assert.match(hud, /function worldToScreenY\(worldY\)/);
  assert.match(hud, /return H - \(worldY - state\.cameraBottom\);/);
  assert.match(hud, /y: worldToScreenY\(token\.y\)/);
  assert.doesNotMatch(hud, /S\.sy\(/, 'economy HUD must not depend on a renderer-private helper');
});

test('Shift browser qualification advances authoritative fixed-step physics after synthetic resets', () => {
  const harness = readScript('playtest-sylvaria-shift-hold.mjs');
  assert.match(harness, /async function advanceSimulation/);
  assert.match(harness, /S\.update\(S\.state\.FIXED_DT\)/);
  assert.match(harness, /async function advanceUntil/);
  assert.match(harness, /advanceUntil\([\s\S]*'plain Sap release\/vault'/);
  assert.match(harness, /advanceUntil\([\s\S]*'held Shift release\/vault'/);
  assert.doesNotMatch(
    harness,
    /keyboard\.up\('Shift'\);\s*await page\.waitForTimeout\((?:80|110|125)\)/,
    'Sap release completion must not be inferred from a browser wall-clock sleep',
  );
});

test('Sap anti-inflation gate distinguishes Sap-awarded Flow from legitimate traversal combos', () => {
  const harness = readScript('playtest-sylvaria-shift-hold.mjs');
  assert.match(harness, /plainSapComboLinks/);
  assert.match(harness, /event\.type === 'combo-link' && event\.link === 'SAP'/);
  assert.match(harness, /sapStickCleanVaults/);
  assert.match(harness, /S\.player\.sap\.age = 0\.100/);
  assert.match(harness, /plainHold\.holdSeconds >= 0\.16/);
  assert.doesNotMatch(
    harness,
    /plainVault\.state\.combo !== 0/,
    'a normal floor-skip or route combo must not be misclassified as Sap-created Flow',
  );
  assert.doesNotMatch(
    harness,
    /plain Sap acquisition'[\s\S]{0,200}advanceSimulation\(frame, 12\)/,
    'the ordinary-vault reward test must not let concurrent RAF move its hold duration into the Clean Sap window',
  );
});

test('Living Canopy browser qualification preserves authored progression across reloads', () => {
  const harness = readScript('playtest-sylvaria-living-canopy-v2.mjs');
  assert.match(harness, /async function runtimeFrame/);
  assert.match(harness, /async function reloadWithStorage/);
  assert.match(harness, /await page\.reload\(\{ waitUntil: 'networkidle' \}\)/);
  assert.match(harness, /'sylvaria\.sequoia\.wonderMask': '63'/);
  assert.match(harness, /'sylvaria\.sequoia\.heartseedMask': '31'/);
  assert.doesNotMatch(
    harness,
    /page\.addInitScript\([\s\S]*sylvaria\.sequoia\.wonderMask/,
    'a permanent init script must not erase the persisted Wonder state being tested on reload',
  );
  assert.doesNotMatch(
    harness,
    /keyboard\.press\('Space'\);\s*await page\.waitForTimeout\(120\)/,
    'Living Canopy start authority must be behavior-based rather than a fixed browser delay',
  );
});

test('Canopy Contracts qualification separates blocked Sap spam from a legal higher-log recharge', () => {
  const harness = readScript('playtest-sylvaria-economy.mjs');
  assert.match(harness, /async function runtimeFrame/);
  assert.match(harness, /async function advanceSimulation/);
  assert.match(harness, /async function advanceUntil/);
  assert.match(harness, /for \(let index = 0; index < 16; index \+= 1\) S\.pressSapStick\(\)/);
  assert.match(harness, /sapAuthorityBlockedPresses \|\| 0\) < 16/);
  assert.match(harness, /'held higher-log Sap recharge'/);
  assert.match(harness, /afterRecharge\.sapAuthority\.recharges !== 1/);
  assert.match(harness, /'Cone Token collection'/);
  assert.doesNotMatch(
    harness,
    /for \(let index = 0; index < 16; index \+= 1\)[\s\S]*page\.waitForTimeout\(14\)/,
    'blocked Sap spam must be observed before world time can create a legitimate recharge',
  );
  assert.doesNotMatch(
    harness,
    /rechargeTarget[\s\S]{0,500}page\.waitForTimeout\(110\)/,
    'higher-log recharge must be proven by fixed simulation state, not a browser sleep',
  );
});

test('nearest Sap authority qualification isolates spent spam and authored identity from browser time', () => {
  const harness = readScript('playtest-sylvaria-sap-authority.mjs');
  assert.match(harness, /async function runtimeFrame/);
  assert.match(harness, /async function advanceSimulation/);
  assert.match(harness, /async function advanceUntil/);
  assert.match(harness, /for \(let index = 0; index < 24; index \+= 1\) S\.pressSapStick\(\)/);
  assert.match(harness, /'held higher-log Sap rearm'/);
  assert.match(harness, /S\.state\.keys\.add\('ArrowRight'\)/);
  assert.match(harness, /chunkId: 'test-near'/);
  assert.match(harness, /floor: 3/);
  assert.match(harness, /role: 'right'/);
  assert.match(harness, /anchorKind: 'sap-stick'/);
  assert.match(harness, /Consumed Sap identity became reusable after object replacement\/motion/);
  assert.doesNotMatch(
    harness,
    /state\.knots\.find\(\(knot\) => knot\.chunkId === 'test-near'\)/,
    'immutable identity qualification must not depend on the original synthetic knot object surviving world pruning',
  );
  assert.doesNotMatch(
    harness,
    /for \(let index = 0; index < 24; index \+= 1\) await shiftTap\(page\)/,
    'spent-state spam authority must not advance world time into a legal recharge',
  );
  assert.doesNotMatch(
    harness,
    /landing[\s\S]{0,500}page\.waitForTimeout\(120\)/,
    'held-log authority must be proven on fixed simulation time rather than a renderer delay',
  );
  assert.doesNotMatch(
    harness,
    /page\.waitForTimeout\(520\)/,
    'tether-energy authority must not depend on browser RAF cadence',
  );
});
