import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_FOCUS_BROWSER_DIR || 'artifacts/sylvaria-sequoia-focus-safety';
fs.mkdirSync(outputDir, { recursive: true });

const engines = [
  { name: 'chrome-stable', browserType: chromium, launchOptions: { channel: 'chrome' } },
  { name: 'chromium', browserType: chromium, launchOptions: {} },
  { name: 'firefox', browserType: firefox, launchOptions: {} },
  { name: 'webkit', browserType: webkit, launchOptions: {} },
];

async function runtimeFrame(page) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().includes('/game-runtimes/sylvaria-sequoia/'));
    if (frame) {
      try {
        await frame.locator('#c').waitFor({ state: 'visible', timeout: 750 });
        return frame;
      } catch {}
    }
    await page.waitForTimeout(80);
  }
  throw new Error('Sylvaria runtime iframe did not become input-ready');
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);
  const frame = await runtimeFrame(page);

  const result = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(0xF0C05);
    const authorityBefore = S.sapAuthority.getState();
    const floorBase = authorityBefore.highestPhysicalFloor;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.x = 480;
    S.player.y = 260;
    S.player.vx = 280;
    S.player.vy = 35;
    S.state.knots.splice(0, S.state.knots.length, {
      x: 565,
      y: 355,
      floor: floorBase + 2,
      chunkId: 'focus-contract',
      chunkType: 'TEST',
      role: 'focus',
      anchorKind: 'sap-stick',
      pulse: 0,
    });
    const attached = S.pressSapStick();
    if (!attached || !S.player.sap?.stickMode) return { attached, authority: S.sapAuthority.getState() };

    S.player.vx = 321;
    S.player.vy = -117;
    S.player.score = 1234;
    S.player.combo = 3;
    S.player.comboTimer = 1.125;
    S.player.airJumps = 1;
    const before = {
      vx: S.player.vx,
      vy: S.player.vy,
      score: S.player.score,
      combo: S.player.combo,
      comboTimer: S.player.comboTimer,
      airJumps: S.player.airJumps,
      sap: Boolean(S.player.sap?.stickMode),
    };
    window.dispatchEvent(new Event('blur'));
    const after = {
      vx: S.player.vx,
      vy: S.player.vy,
      score: S.player.score,
      combo: S.player.combo,
      comboTimer: S.player.comboTimer,
      airJumps: S.player.airJumps,
      sap: Boolean(S.player.sap?.stickMode),
      playerState: S.player.state,
    };
    return { attached, before, after, authority: S.sapAuthority.getState(), telemetry: S.summarizeTelemetry() };
  });

  if (!result.attached) throw new Error(`focus contract could not acquire Sap: ${JSON.stringify(result)}`);
  if (!result.before.sap || result.after.sap) throw new Error(`focus loss did not cancel the live Sap lease: ${JSON.stringify(result)}`);
  for (const field of ['vx', 'vy', 'score', 'combo', 'comboTimer', 'airJumps']) {
    if (result.after[field] !== result.before[field]) throw new Error(`focus loss mutated ${field}: ${JSON.stringify(result)}`);
  }
  if (!result.authority.focusLossIsNeutral || result.authority.focusCancellations !== 1) {
    throw new Error(`focus cancellation authority contract unavailable: ${JSON.stringify(result.authority)}`);
  }
  if (result.authority.armed || result.authority.activeLeaseId) {
    throw new Error(`focus cancellation refunded or leaked a Sap lease: ${JSON.stringify(result.authority)}`);
  }
  await page.screenshot({ path: path.join(outputDir, `${engineName}-focus-safe.png`), fullPage: true });
  return { engine: engineName, ok: true, ...result };
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
