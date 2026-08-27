import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const runtimeRoot = join(process.cwd(), 'public/game-runtimes/sylvaria-sequoia');
const readRuntime = (name: string) => readFileSync(join(runtimeRoot, name), 'utf8');

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test('Sylvaria traversal HUD stays panel-free while preserving intentional shop UI', () => {
  const gate = readRuntime('03-minimal-hud-gate.js');
  const objective = readRuntime('03-living-objective-hud.js');
  const economy = readRuntime('03-canopy-economy-hud.js');
  const sap = readRuntime('03-sap-stick-control-hud.js');
  const recap = readRuntime('03-run-recap-hud.js');
  const index = readRuntime('index.html');

  assert.match(gate, /const VERSION = 'reference-hud-suppression-v1'/);
  assert.match(gate, /const REVISION = 'panel-free-gameover-v2'/);
  assert.match(gate, /revision: REVISION/);
  assert.match(gate, /new Set\(\['playing', 'gameover'\]\)/);
  assert.match(gate, /duplicate death card/);
  assert.match(gate, /presentationPolicy: 'world-first'/);
  assert.match(gate, /preservesUnderlyingScene: true/);

  assert.doesNotMatch(objective, /fillRect\(right - 205/);
  assert.match(objective, /panelFree: true/);

  const missionPulse = between(economy, 'function missionPanel', 'function shopCard');
  assert.doesNotMatch(missionPulse, /roundRect|ctx\.rect\(|ctx\.fill\(\)|ctx\.stroke\(\)|fillRect/);
  assert.match(economy, /traversalPanelFree: true/);
  assert.match(economy, /function shopCard/, 'the deliberate between-run shop remains available');

  assert.doesNotMatch(sap, /roundRect|fillRect|strokeRect/);
  assert.match(sap, /panel-free, transient and contextual/);

  const recapDraw = between(recap, 'function drawRecap', 'function render(alpha');
  assert.doesNotMatch(recapDraw, /roundRect|strokeRect/);
  assert.match(recap, /run-recap-v3-minimal/);
  assert.match(recap, /duplicateGameOverCopy/);
  assert.match(recap, /panelFree: true/);

  assert.match(index, /#wrap\[data-playing="true"\] #hint\{opacity:0\}/);
  assert.match(index, /A\/D run · Space jump · Shift Sap/);
  assert.match(index, /Cone Tokens/);
});
