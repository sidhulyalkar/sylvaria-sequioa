import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_HEARTWOOD_BROWSER_DIR || 'artifacts/sylvaria-sequoia-heartwood';
fs.mkdirSync(outputDir, { recursive: true });

const engines = [
  { name: 'chrome-stable', browserType: chromium, launchOptions: { channel: 'chrome' } },
  { name: 'chromium', browserType: chromium, launchOptions: {} },
  { name: 'firefox', browserType: firefox, launchOptions: {} },
  { name: 'webkit', browserType: webkit, launchOptions: {} },
];

const results = [];
let failed = false;

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
        // WebKit can publish the iframe before the canvas is ready for input.
      }
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Sylvaria iframe did not attach within 8s: ${JSON.stringify(observed)}`);
}

async function waitUntil(frame, predicate, label, timeoutMs = 1600, arg = null) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await frame.evaluate(predicate, arg);
      if (last) return last;
    } catch {
      // Reloads can briefly invalidate an execution context. Retry until timeout.
    }
    await frame.page().waitForTimeout(24);
  }
  throw new Error(`${label} did not settle within ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

async function reloadWithStorage(page, values) {
  let frame = await runtimeFrame(page);
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
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);

  let frame = await reloadWithStorage(page, {
    'sylvaria.sequoia.heartseedMask': null,
    'sylvaria.sequoia.crownAwakened': null,
  });
  await start(page, frame);
  await waitUntil(frame, () => Boolean(window.SylvariaSequoia?.heartwoodQuest?.getState?.().activeSeed), 'ROOTLIGHT resolution');

  const initial = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    return {
      quest: S.heartwoodQuest?.getState?.(),
      trials: S.canopyTrials?.getState?.(),
      director: S.canopyDirector?.getState?.() || null,
      render: S.heartwoodTrialsRender || null,
      progressHud: S.canopyProgressHud || null,
      grammars: window.SYLVARIA_SEQUOIA_DEBUG.getRouteGrammars(),
    };
  });

  if (!initial.quest || initial.quest.count !== 0 || initial.quest.total !== 5 || initial.quest.finalCrownFloor !== 250) {
    throw new Error(`Heartwood quest initial state invalid: ${JSON.stringify(initial.quest)}`);
  }
  if (!initial.quest.activeSeed || initial.quest.activeSeed.name !== 'ROOTLIGHT' || initial.quest.activeSeed.floor !== 22) {
    throw new Error(`ROOTLIGHT was not resolved into the authored world: ${JSON.stringify(initial.quest)}`);
  }
  for (const grammar of ['BREAKAWAY', 'PENDULUM', 'CONEFALL', 'THUNDERCROWN']) {
    if (!initial.grammars.includes(grammar)) throw new Error(`Missing canopy trial grammar ${grammar}: ${JSON.stringify(initial.grammars)}`);
  }
  if (initial.render?.version !== 'heartwood-trials-render-v1') {
    throw new Error(`Heartwood renderer unavailable: ${JSON.stringify(initial.render)}`);
  }
  if (initial.progressHud?.version !== 'minimal-crown-hud-v1' || initial.progressHud?.revision !== 'heartwood-objective-v2') {
    throw new Error(`Quest-first HUD contract unavailable: ${JSON.stringify(initial.progressHud)}`);
  }
  if (initial.director?.version !== 'canopy-director-v1' || initial.director?.phase !== 'ROOTWAYS') {
    throw new Error(`Canopy director unavailable at run start: ${JSON.stringify(initial.director)}`);
  }

  await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const seed = S.heartwoodQuest.getState().activeSeed;
    S.player.airJumps = 0;
    S.player.saves = 0;
    S.player.sap = null;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.coyote = 0;
    S.player.x = seed.x;
    S.player.y = seed.y;
    S.player.px = seed.x;
    S.player.py = seed.y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.state.threatY = Math.min(S.state.threatY, seed.y - 650);
  });
  await waitUntil(frame, () => window.SylvariaSequoia.heartwoodQuest.getState().count === 1, 'Heartseed pickup');
  const pickup = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    return {
      quest: S.heartwoodQuest.getState(),
      airJumps: S.player.airJumps,
      saves: S.player.saves,
      storedMask: Number(localStorage.getItem('sylvaria.sequoia.heartseedMask') || 0),
      telemetry: S.getTelemetry().counters,
    };
  });
  if (pickup.quest.count !== 1 || pickup.storedMask !== 1 || pickup.airJumps !== 1 || pickup.saves < 1) {
    throw new Error(`Heartseed pickup did not bank + refill correctly: ${JSON.stringify(pickup)}`);
  }
  if ((pickup.telemetry.heartseeds || 0) < 1) throw new Error(`Heartseed telemetry missing: ${JSON.stringify(pickup.telemetry)}`);

  await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(26000);
    S.player.highestFloor = 155;
    S.state.elapsed = Math.max(S.state.elapsed, 3.05);
  });
  await waitUntil(frame, () => {
    const S = window.SylvariaSequoia;
    const trials = S.canopyTrials.getState();
    return trials.intensity > 0.4 && trials.fragileActive > 0 && trials.swayingKnots > 0;
  }, 'late-canopy trial decoration');
  await waitUntil(frame, () => (window.SylvariaSequoia.getTelemetry().counters.conesSpawned || 0) >= 1, 'Conefall spawn');

  const trialTargets = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const fragile = S.state.branches.find((branch) => branch._trialFragile);
    const swaying = S.state.knots.find((knot) => knot._trialSway);
    return {
      fragileFloor: fragile?.floor ?? null,
      fragileChunk: fragile?.chunkId ?? null,
      swayChunk: swaying?.chunkId ?? null,
      swayFloor: swaying?.floor ?? null,
      swayX: swaying?.x ?? null,
    };
  });
  if (!trialTargets.fragileChunk || !trialTargets.swayChunk) {
    throw new Error(`Trial targets missing after decoration: ${JSON.stringify(trialTargets)}`);
  }

  await frame.evaluate(({ chunkId, floor }) => {
    const S = window.SylvariaSequoia;
    const knot = S.state.knots.find((item) => item.chunkId === chunkId && item.floor === floor);
    if (knot) knot._probeStartX = knot.x;
    S.state.elapsed += 0.55;
  }, { chunkId: trialTargets.swayChunk, floor: trialTargets.swayFloor });
  await waitUntil(frame, ({ chunkId, floor }) => {
    const S = window.SylvariaSequoia;
    const knot = S.state.knots.find((item) => item.chunkId === chunkId && item.floor === floor);
    return Boolean(knot && Number.isFinite(knot._probeStartX) && Math.abs(knot.x - knot._probeStartX) >= 1);
  }, 'Pendulum motion', 1600, { chunkId: trialTargets.swayChunk, floor: trialTargets.swayFloor });

  await frame.evaluate(({ chunkId, floor }) => {
    const S = window.SylvariaSequoia;
    const fragile = S.state.branches.find((branch) => branch.chunkId === chunkId && branch.floor === floor);
    if (!fragile) return;
    const x = (fragile.x1 + fragile.x2) * 0.5;
    S.player.x = x;
    S.player.px = x;
    S.player.y = S.branchYAt(fragile, x) + S.state.PLAYER_R;
    S.player.py = S.player.y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.player.grounded = fragile;
    S.player.groundedTime = 0;
  }, { chunkId: trialTargets.fragileChunk, floor: trialTargets.fragileFloor });
  await waitUntil(frame, () => Boolean(window.SylvariaSequoia.player.grounded?._trialBreaking), 'Breakaway trigger');
  await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const fragile = S.player.grounded;
    if (fragile?._trialBreaking) S.state.elapsed = Math.max(S.state.elapsed, fragile._trialBreakAt + 0.04);
  });
  await waitUntil(frame, ({ chunkId, floor }) => {
    const S = window.SylvariaSequoia;
    return !S.state.branches.some((branch) => branch.chunkId === chunkId && branch.floor === floor);
  }, 'Breakaway removal', 1600, { chunkId: trialTargets.fragileChunk, floor: trialTargets.fragileFloor });

  const trials = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const snapshot = S.canopyTrials.getState();
    return {
      intensity: snapshot.intensity,
      coneIntensity: snapshot.coneIntensity,
      fragileActive: snapshot.fragileActive,
      swayingKnots: snapshot.swayingKnots,
      liveCones: snapshot.cones.length,
      counters: { ...S.getTelemetry().counters },
    };
  });
  if (!(trials.intensity > 0.4 && trials.coneIntensity > 0)) {
    throw new Error(`Late-canopy trial intensity did not activate: ${JSON.stringify(trials)}`);
  }
  if ((trials.counters.conesSpawned || 0) < 1) {
    throw new Error(`Conefall hazard never spawned: ${JSON.stringify(trials)}`);
  }
  if ((trials.counters.fragileBranchesTriggered || 0) < 1 || (trials.counters.fragileBranchesBroken || 0) < 1) {
    throw new Error(`Breakaway lifecycle telemetry missing: ${JSON.stringify(trials)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-heartwood-trials.png`), fullPage: true });

  frame = await reloadWithStorage(page, {
    'sylvaria.sequoia.heartseedMask': 31,
    'sylvaria.sequoia.crownAwakened': 0,
  });
  await start(page, frame);
  const beforeCrown = await frame.evaluate(() => window.SylvariaSequoia.heartwoodQuest.getState());
  if (!beforeCrown.readyForCrown || beforeCrown.count !== 5) {
    throw new Error(`Five Heartseeds did not unlock the Living Crown: ${JSON.stringify(beforeCrown)}`);
  }
  await frame.evaluate(() => { window.SylvariaSequoia.player.highestFloor = 250; });
  await waitUntil(frame, () => window.SylvariaSequoia.heartwoodQuest.getState().crownAwakened, 'Living Crown awakening');
  const crown = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    return {
      after: S.heartwoodQuest.getState(),
      stored: localStorage.getItem('sylvaria.sequoia.crownAwakened'),
      counters: S.getTelemetry().counters,
    };
  });
  if (!crown.after.crownAwakened || crown.stored !== '1' || (crown.counters.crownAwakenings || 0) < 1) {
    throw new Error(`Living Crown completion did not persist: ${JSON.stringify(crown)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-living-crown-awakened.png`), fullPage: true });
  return { engine: engineName, ok: true, initial, pickup, trials, crown };
}

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
