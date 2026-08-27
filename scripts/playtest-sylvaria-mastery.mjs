import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_MASTERY_BROWSER_DIR || 'artifacts/sylvaria-sequoia-mastery';
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
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes('/game-runtimes/sylvaria-sequoia/'));
    if (frame) {
      try {
        await frame.locator('#c').waitFor({ state: 'visible', timeout: 500 });
        return frame;
      } catch {
        // Keep polling while WebKit finishes attaching the iframe document.
      }
    }
    await page.waitForTimeout(50);
  }
  throw new Error('Sylvaria iframe did not attach');
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);
  const frame = await runtimeFrame(page);

  const initial = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.masteryLab.clearHistory();
    return {
      version: S.masteryLab?.version,
      revision: S.masteryLab?.revision,
      localOnly: S.masteryLab?.localOnly,
      adaptsDifficulty: S.masteryLab?.adaptsDifficulty,
      mutatesTuning: S.masteryLab?.mutatesTuning,
      mutatesRouteRng: S.masteryLab?.mutatesRouteRng,
      pressure: S.canopyDirector.pressureForFloor(40),
    };
  });
  if (initial.version !== 'mastery-lab-v1' || initial.revision !== 'v0.6.2-evidence-loop-v1') {
    throw new Error(`v0.6.2 Mastery Lab unavailable: ${JSON.stringify(initial)}`);
  }
  if (!initial.localOnly || initial.adaptsDifficulty || initial.mutatesTuning || initial.mutatesRouteRng) {
    throw new Error(`Mastery Lab violated observational-only contract: ${JSON.stringify(initial)}`);
  }

  const nearMiss = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(6202);
    S.player.highestFloor = 48;
    S.player.lastFloor = 48;
    S.player.saves = 0;
    S.player.y = 0;
    S.state.threatY = 600;
    S.update(S.state.FIXED_DT);
    return {
      mode: S.state.mode,
      lab: S.masteryLab.getState(),
      recap: S.runRecapHud.getState(),
      summary: S.summarizeTelemetry().mastery,
    };
  });
  if (nearMiss.mode !== 'gameover') throw new Error(`Forced mastery run did not end: ${JSON.stringify(nearMiss)}`);
  if (nearMiss.lab.history.length !== 1 || nearMiss.lab.lastRun?.floor !== 48) {
    throw new Error(`Mastery history did not persist the completed run: ${JSON.stringify(nearMiss.lab)}`);
  }
  if (nearMiss.lab.lastRun?.nearCrownFloor !== 50 || nearMiss.lab.lastRun?.nearCrownGap !== 2) {
    throw new Error(`Real near-Crown miss was not measured correctly: ${JSON.stringify(nearMiss.lab.lastRun)}`);
  }
  if (!/2F TO CROWN 50/.test(nearMiss.lab.lastRun?.nextLine || '') || !/2F TO CROWN 50/.test(nearMiss.recap.masteryLine || '')) {
    throw new Error(`Near-Crown recap was not evidence-backed: ${JSON.stringify(nearMiss)}`);
  }
  if (!nearMiss.summary?.localOnly || nearMiss.summary?.adaptsDifficulty) {
    throw new Error(`Telemetry export lost Mastery Lab privacy/determinism flags: ${JSON.stringify(nearMiss.summary)}`);
  }

  await frame.locator('#c').screenshot({ path: path.join(outputDir, `${engineName}-mastery-near-crown.png`) });

  const sameSeed = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(6202);
    return S.masteryLab.getState().current;
  });
  if (!sameSeed.sameSeedRetry || sameSeed.restartLatencySeconds == null || sameSeed.restartLatencySeconds < 0) {
    throw new Error(`Same-seed retry was not measured: ${JSON.stringify(sameSeed)}`);
  }

  const health = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const pressureBefore = S.canopyDirector.pressureForFloor(40);
    for (const [index, floor] of [26, 27, 28, 29, 30].entries()) {
      S.startRun(7000 + index);
      S.player.highestFloor = floor;
      S.player.lastFloor = floor;
      S.player.saves = 0;
      S.player.y = 0;
      S.state.threatY = 600;
      S.update(S.state.FIXED_DT);
    }
    const state = S.masteryLab.getState();
    return {
      state,
      pressureBefore,
      pressureAfter: S.canopyDirector.pressureForFloor(40),
      storageRows: JSON.parse(localStorage.getItem(S.masteryLab.storageKey) || '[]').length,
    };
  });
  if (health.state.history.length !== 6 || health.storageRows !== 6) {
    throw new Error(`Mastery history is not bounded/persisted coherently: ${JSON.stringify(health)}`);
  }
  if (health.state.health?.difficultyCliff?.floor !== 25) {
    throw new Error(`Measured 25-floor difficulty cliff was not detected: ${JSON.stringify(health.state.health)}`);
  }
  if (Math.abs(health.pressureAfter - health.pressureBefore) > 1e-9) {
    throw new Error(`Local run history changed deterministic difficulty pressure: ${JSON.stringify(health)}`);
  }

  const newSeed = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(9001);
    return S.masteryLab.getState();
  });
  if (newSeed.current.sameSeedRetry) throw new Error(`New seed was mislabeled as a same-seed retry: ${JSON.stringify(newSeed.current)}`);
  if (newSeed.history.length > newSeed.historyLimit) throw new Error(`Mastery history exceeded its hard cap: ${JSON.stringify(newSeed)}`);

  return {
    engine: engineName,
    nearMiss: nearMiss.lab.lastRun,
    health: health.state.health,
    sameSeedRetry: sameSeed,
    newSeed: newSeed.current,
  };
}

for (const engine of engines) {
  let browser;
  try {
    browser = await engine.browserType.launch({ headless: true, ...engine.launchOptions });
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    const result = await runContract(page, engine.name);
    results.push({ ok: true, ...result });
  } catch (error) {
    failed = true;
    results.push({ ok: false, engine: engine.name, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await browser?.close();
  }
}

fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (failed) process.exitCode = 1;
