import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_LIVING_BROWSER_DIR || 'artifacts/sylvaria-sequoia-living-canopy';
fs.mkdirSync(outputDir, { recursive: true });

const engines = [
  { name: 'chrome-stable', browserType: chromium, launchOptions: { channel: 'chrome' } },
  { name: 'chromium', browserType: chromium, launchOptions: {} },
  { name: 'firefox', browserType: firefox, launchOptions: {} },
  { name: 'webkit', browserType: webkit, launchOptions: {} },
];

async function getFrame(page) {
  const frame = page.frames().find((candidate) => candidate.url().includes('/game-runtimes/sylvaria-sequoia/'));
  if (!frame) throw new Error('Sylvaria iframe did not attach');
  await frame.locator('#c').waitFor({ state: 'visible' });
  return frame;
}

async function start(page, frame) {
  await frame.locator('#c').click();
  await frame.locator('#c').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const state = await frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState());
  if (state.mode !== 'playing') throw new Error(`Sylvaria failed to start: ${JSON.stringify(state)}`);
  if (window?.__never__) throw new Error('unreachable');
  return state;
}

async function runContract(page, engineName) {
  await page.addInitScript(() => {
    for (const key of [
      'sylvaria.sequoia.heartseedMask',
      'sylvaria.sequoia.crownAwakened',
      'sylvaria.sequoia.wonderMask',
      'sylvaria.sequoia.skyheartRung',
    ]) localStorage.removeItem(key);
  });

  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);
  let frame = await getFrame(page);
  const started = await start(page, frame);
  if (window?.__never__) throw new Error('unreachable');

  const initial = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    return {
      debugVersion: window.SYLVARIA_SEQUOIA_DEBUG.version,
      living: S.livingCanopy?.getState?.(),
      render: S.livingCanopyRender || null,
      hud: S.livingObjectiveHud || null,
      phases: window.SYLVARIA_SEQUOIA_DEBUG.getPhases(),
      grammars: window.SYLVARIA_SEQUOIA_DEBUG.getRouteGrammars(),
    };
  });

  if (initial.debugVersion !== '0.5.0') throw new Error(`debug contract is stale: ${initial.debugVersion}`);
  if (!initial.living || initial.living.count !== 0 || initial.living.total !== 6 || initial.living.skyheartFloor !== 360) {
    throw new Error(`Living Canopy initial state invalid: ${JSON.stringify(initial.living)}`);
  }
  if (initial.render?.version !== 'living-canopy-render-v1' || initial.hud?.version !== 'living-objective-hud-v1') {
    throw new Error(`Living Canopy render/HUD unavailable: ${JSON.stringify({ render: initial.render, hud: initial.hud })}`);
  }
  for (const grammar of ['CHOIRLINE', 'HOLLOWRUN', 'MIGRATION', 'AURORARUN', 'ELDERSPAN', 'ECHOFLIGHT', 'SKYHEART']) {
    if (!initial.grammars.includes(grammar)) throw new Error(`missing v0.5 grammar ${grammar}`);
  }
  for (const phase of [['LIVING CROWN', 250], ['ELDER SKY', 320]]) {
    if (!initial.phases.some((entry) => entry.name === phase[0] && entry.floor === phase[1])) {
      throw new Error(`missing v0.5 phase ${phase[0]}: ${JSON.stringify(initial.phases)}`);
    }
  }

  // Generate enough deterministic terrain to resolve every one-time discovery.
  await frame.evaluate(() => window.SylvariaSequoia.generateUntil(52000));

  const wonderResults = [];
  const wonderIds = ['windchoir', 'lightninghollow', 'sunwing', 'resinaurora', 'elderbough', 'crownecho'];
  for (const id of wonderIds) {
    const result = await frame.evaluate((wonderId) => {
      const S = window.SylvariaSequoia;
      const spec = S.livingCanopy.wonders.find((entry) => entry.id === wonderId);
      if (!spec) throw new Error(`missing wonder spec ${wonderId}`);
      S.player.highestFloor = spec.floor;
      S.player.combo = 0;
      S.player.hyper = false;
      S.player.grounded = null;
      S.player.vx = 0;
      S.player.vy = 0;
      S.player.clingActive = false;
      S.player.barkGrace = 0;
      S.player.strideMomentum = 0;

      if (spec.condition === 'flow') S.player.combo = 3;
      if (spec.condition === 'bark') S.player.barkGrace = 0.20;
      if (spec.condition === 'flight') S.player.vx = 520;
      if (spec.condition === 'clean-sap') S.recordEvent('sap-stick-release', { cleanVault: true, reason: 'SHIFT_RELEASE' });
      if (spec.condition === 'stride') { S.player.strideMomentum = 650; S.player.combo = 5; }
      if (spec.condition === 'hyper') S.player.hyper = true;

      const target = S.livingCanopy.getState().activeWonder;
      if (!target || target.id !== wonderId) throw new Error(`wonder target did not resolve ${wonderId}: ${JSON.stringify(target)}`);
      S.player.x = target.x;
      S.player.y = target.y;
      S.player.px = target.x;
      S.player.py = target.y;
      S.update(S.state.FIXED_DT);
      const after = S.livingCanopy.getState();
      return {
        id: wonderId,
        count: after.count,
        mask: after.wonderMask,
        stored: Number(localStorage.getItem('sylvaria.sequoia.wonderMask') || 0),
        objective: after.objective,
        counters: S.getTelemetry().counters,
      };
    }, id);
    wonderResults.push(result);
    if (result.count !== wonderResults.length || result.stored !== result.mask) {
      throw new Error(`wonder did not persist ${id}: ${JSON.stringify(result)}`);
    }
  }
  const finalWonder = wonderResults.at(-1);
  if (finalWonder?.mask !== 63 || (finalWonder.counters.wondersDiscovered || 0) < 6) {
    throw new Error(`six-wonder Atlas did not complete: ${JSON.stringify(finalWonder)}`);
  }

  // Prove late mechanics are real stateful systems, not catalog copy.
  const setpiece = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.player.highestFloor = 335;
    S.generateUntil(56000);
    for (const branch of S.state.branches) branch._livingSerial = -1;
    for (const knot of S.state.knots) knot._livingSerial = -1;
    for (const ring of S.state.rings) ring._livingSerial = -1;
    S.update(S.state.FIXED_DT);
    const swaying = S.state.knots.filter((knot) => knot._trialSway && ['AURORARUN', 'ECHOFLIGHT', 'SKYHEART'].includes(knot.chunkType));
    const fragile = S.state.branches.filter((branch) => branch._trialFragile && ['ELDERSPAN', 'SKYHEART'].includes(branch.chunkType));
    const pulsing = S.state.rings.filter((ring) => ring._livingPulse);
    const beforeRadius = pulsing[0]?.radius ?? null;
    S.state.elapsed += 0.6;
    S.update(S.state.FIXED_DT);
    const afterRadius = pulsing[0]?.radius ?? null;
    return {
      swaying: swaying.length,
      fragile: fragile.length,
      pulsing: pulsing.length,
      beforeRadius,
      afterRadius,
      living: S.livingCanopy.getState(),
    };
  });
  if (setpiece.swaying < 1 || setpiece.fragile < 1 || setpiece.pulsing < 1) {
    throw new Error(`elder setpiece decoration unavailable: ${JSON.stringify(setpiece)}`);
  }
  if (setpiece.beforeRadius === null || setpiece.afterRadius === null || Math.abs(setpiece.afterRadius - setpiece.beforeRadius) < 0.05) {
    throw new Error(`resonance ring did not pulse: ${JSON.stringify(setpiece)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-living-canopy-wonders.png`), fullPage: true });

  // Reload into the completed Heartwood + Wonder Atlas state, then verify the
  // ultimate finite objective transitions to a persistent Skyheart completion.
  await frame.evaluate(() => {
    localStorage.setItem('sylvaria.sequoia.heartseedMask', '31');
    localStorage.setItem('sylvaria.sequoia.crownAwakened', '1');
    localStorage.setItem('sylvaria.sequoia.wonderMask', '63');
    localStorage.setItem('sylvaria.sequoia.skyheartRung', '0');
  });
  await page.reload({ waitUntil: 'networkidle' });
  frame = await getFrame(page);
  await start(page, frame);
  const skyheart = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(60000);
    const before = S.livingCanopy.getState();
    S.player.highestFloor = 360;
    S.update(S.state.FIXED_DT);
    const after = S.livingCanopy.getState();
    return {
      before,
      after,
      stored: localStorage.getItem('sylvaria.sequoia.skyheartRung'),
      counters: S.getTelemetry().counters,
    };
  });
  if (!skyheart.before.allWonders || skyheart.before.skyheartRung) {
    throw new Error(`Skyheart precondition invalid: ${JSON.stringify(skyheart.before)}`);
  }
  if (!skyheart.after.skyheartRung || skyheart.stored !== '1' || (skyheart.counters.skyheartRings || 0) < 1) {
    throw new Error(`Skyheart did not ring persistently: ${JSON.stringify(skyheart)}`);
  }
  if (skyheart.after.objective?.kind !== 'endless') {
    throw new Error(`post-Skyheart objective did not become endless mastery: ${JSON.stringify(skyheart.after.objective)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-skyheart-complete.png`), fullPage: true });
  return { engine: engineName, ok: true, started, initial, wonderResults, setpiece, skyheart };
}

const results = [];
let failed = false;
for (const { name, browserType, launchOptions } of engines) {
  let browser;
  try {
    browser = await browserType.launch({ headless: true, ...launchOptions });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    const result = await runContract(page, name);
    if (errors.length) throw new Error(errors.join('\n'));
    results.push(result);
  } catch (error) {
    failed = true;
    results.push({ engine: name, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await browser?.close();
  }
}

fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (failed) process.exit(1);
