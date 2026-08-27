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

async function runtimeFrame(page) {
  const deadline = Date.now() + 8000;
  let observed = [];
  while (Date.now() < deadline) {
    const frames = page.frames();
    observed = frames.map((candidate) => candidate.url());
    const frame = frames.find((candidate) => candidate.url().includes('/game-runtimes/sylvaria-sequoia/'));
    if (frame) {
      try {
        await frame.locator('#c').waitFor({ state: 'visible', timeout: 750 });
        return frame;
      } catch {
        // WebKit can publish the iframe before its runtime canvas is input-ready.
      }
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Sylvaria iframe did not attach within 8s: ${JSON.stringify(observed)}`);
}

async function waitUntil(frame, predicate, label, timeoutMs = 1800, arg = null) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await frame.evaluate(predicate, arg);
      if (last) return last;
    } catch {
      // A reload can briefly invalidate the frame execution context.
    }
    await frame.page().waitForTimeout(24);
  }
  throw new Error(`${label} did not settle within ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

async function reloadWithStorage(page, values) {
  const frame = await runtimeFrame(page);
  await frame.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(value));
    }
  }, values);
  await page.reload({ waitUntil: 'networkidle' });
  return runtimeFrame(page);
}

async function start(page, frame) {
  await frame.locator('#c').click();
  await frame.locator('#c').focus();
  await page.keyboard.press('Space');
  await waitUntil(frame, () => window.SylvariaSequoia?.state?.mode === 'playing', 'Sylvaria start');
  return frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState());
}

async function initialContract(frame) {
  return frame.evaluate(() => {
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
}

function assertInitial(initial) {
  if (initial.debugVersion !== '0.6.1') throw new Error(`debug contract is stale: ${initial.debugVersion}`);
  if (!initial.living || initial.living.count !== 0 || initial.living.total !== 6 || initial.living.skyheartFloor !== 360) {
    throw new Error(`Living Canopy initial state invalid: ${JSON.stringify(initial.living)}`);
  }
  if (initial.render?.version !== 'living-canopy-render-v1' || initial.hud?.version !== 'living-objective-hud-v1') {
    throw new Error(`Living Canopy render/HUD unavailable: ${JSON.stringify({ render: initial.render, hud: initial.hud })}`);
  }
  for (const grammar of ['CHOIRLINE', 'HOLLOWRUN', 'MIGRATION', 'AURORARUN', 'ELDERSPAN', 'ECHOFLIGHT', 'SKYHEART']) {
    if (!initial.grammars.includes(grammar)) throw new Error(`missing Living Canopy grammar ${grammar}`);
  }
  for (const [name, floor] of [['LIVING CROWN', 250], ['ELDER SKY', 320]]) {
    if (!initial.phases.some((entry) => entry.name === name && entry.floor === floor)) {
      throw new Error(`missing Living Canopy phase ${name}: ${JSON.stringify(initial.phases)}`);
    }
  }
}

async function discoverWonder(frame, wonderId) {
  return frame.evaluate((id) => {
    const S = window.SylvariaSequoia;
    const spec = S.livingCanopy.wonders.find((entry) => entry.id === id);
    if (!spec) throw new Error(`missing wonder spec ${id}`);

    S.player.highestFloor = spec.floor;
    S.player.combo = 0;
    S.player.comboTimer = 0;
    S.player.hyper = false;
    S.player.grounded = null;
    S.player.vx = 0;
    S.player.vy = 0;
    S.player.clingActive = false;
    S.player.clingTimer = 0;
    S.player.clingSide = '';
    S.player.barkGrace = 0;
    S.player.strideMomentum = 0;
    S.state.keys.delete('ArrowLeft');
    S.state.keys.delete('ArrowRight');
    S.state.keys.delete('KeyA');
    S.state.keys.delete('KeyD');

    if (spec.condition === 'flow') {
      S.player.combo = 3;
      S.player.comboTimer = 2.8;
    }
    if (spec.condition === 'flight') S.player.vx = 520;
    if (spec.condition === 'clean-sap') S.recordEvent('sap-stick-release', { cleanVault: true, reason: 'SHIFT_RELEASE' });
    if (spec.condition === 'stride') {
      S.player.strideMomentum = 650;
      S.player.combo = 5;
      S.player.comboTimer = 2.8;
    }
    if (spec.condition === 'hyper') {
      S.player.hyper = true;
      S.player.combo = 8;
      S.player.comboTimer = 2.8;
    }

    const target = S.livingCanopy.getState().activeWonder;
    if (!target || target.id !== id) throw new Error(`wonder target did not resolve ${id}: ${JSON.stringify(target)}`);

    if (spec.condition === 'bark') {
      const side = target.side < 0 ? 'left' : 'right';
      S.player.clingActive = true;
      S.player.clingTimer = 0.24;
      S.player.clingSide = side;
      S.player.barkSide = side;
      S.player.barkGrace = 0.24;
      S.state.keys.add(side === 'left' ? 'ArrowLeft' : 'ArrowRight');
    }

    S.player.x = target.x;
    S.player.y = target.y;
    S.player.px = target.x;
    S.player.py = target.y;
    S.update(S.state.FIXED_DT);
    S.state.keys.delete('ArrowLeft');
    S.state.keys.delete('ArrowRight');

    const after = S.livingCanopy.getState();
    return {
      id,
      count: after.count,
      mask: after.wonderMask,
      stored: Number(localStorage.getItem('sylvaria.sequoia.wonderMask') || 0),
      objective: after.objective,
      counters: S.getTelemetry().counters,
    };
  }, wonderId);
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);

  let frame = await reloadWithStorage(page, {
    'sylvaria.sequoia.heartseedMask': null,
    'sylvaria.sequoia.crownAwakened': null,
    'sylvaria.sequoia.wonderMask': null,
    'sylvaria.sequoia.skyheartRung': null,
  });
  const started = await start(page, frame);
  const initial = await initialContract(frame);
  assertInitial(initial);

  await frame.evaluate(() => window.SylvariaSequoia.generateUntil(54000));

  const wonderResults = [];
  for (const id of ['windchoir', 'lightninghollow', 'sunwing', 'resinaurora', 'elderbough', 'crownecho']) {
    const result = await discoverWonder(frame, id);
    wonderResults.push(result);
    if (result.count !== wonderResults.length || result.stored !== result.mask) {
      throw new Error(`wonder did not persist ${id}: ${JSON.stringify(result)}`);
    }
  }
  const finalWonder = wonderResults.at(-1);
  if (finalWonder?.mask !== 63 || (finalWonder.counters.wondersDiscovered || 0) < 6) {
    throw new Error(`six-wonder Atlas did not complete: ${JSON.stringify(finalWonder)}`);
  }

  const setpiece = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.player.highestFloor = 335;
    S.generateUntil(59000);
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

  frame = await reloadWithStorage(page, {
    'sylvaria.sequoia.heartseedMask': '31',
    'sylvaria.sequoia.crownAwakened': '1',
    'sylvaria.sequoia.wonderMask': '63',
    'sylvaria.sequoia.skyheartRung': '0',
  });
  await start(page, frame);

  const skyheart = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(62000);
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
