import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_ECONOMY_BROWSER_DIR || 'artifacts/sylvaria-sequoia-canopy-contracts';
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
        // Some engines publish the iframe before its runtime canvas is input-ready.
      }
    }
    await page.waitForTimeout(80);
  }
  throw new Error(`Sylvaria iframe did not attach within 8s: ${JSON.stringify(observed)}`);
}

async function focus(page, frame) {
  await frame.locator('#c').click();
  await frame.locator('#c').focus();
  await page.waitForFunction(() => document.documentElement.classList.contains('game-runtime-focused'));
}

async function waitForSnapshot(page, snapshot, predicate, label, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await snapshot();
    if (predicate(last)) return last;
    await page.waitForTimeout(24);
  }
  throw new Error(`${label} did not settle within ${timeoutMs}ms: ${JSON.stringify(last)}`);
}

async function advanceSimulation(frame, steps = 1) {
  return frame.evaluate((count) => {
    const S = window.SylvariaSequoia;
    for (let index = 0; index < count; index += 1) S.update(S.state.FIXED_DT);
    return window.SYLVARIA_SEQUOIA_DEBUG.getState();
  }, steps);
}

async function advanceUntil(frame, snapshot, predicate, label, maxSteps = 240) {
  let last = await snapshot();
  if (predicate(last)) return last;
  for (let index = 0; index < maxSteps; index += 1) {
    await advanceSimulation(frame, 1);
    last = await snapshot();
    if (predicate(last)) return last;
  }
  throw new Error(`${label} did not settle within ${maxSteps} fixed steps: ${JSON.stringify(last)}`);
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);
  let frame = await runtimeFrame(page);

  await frame.evaluate(() => {
    localStorage.setItem('sylvaria.sequoia.coneTokens', '40');
    localStorage.removeItem('sylvaria.sequoia.shopLoadout');
  });
  await page.reload({ waitUntil: 'networkidle' });
  frame = await runtimeFrame(page);
  await focus(page, frame);
  await page.keyboard.press('Space');
  await waitForSnapshot(
    page,
    () => frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState()),
    (snapshot) => snapshot.mode === 'playing',
    'Sylvaria start',
  );

  const initial = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(9000);
    S.sapRhythm.pruneSapAnchors();
    const nonExplicit = S.state.knots.filter((knot) => knot.anchorKind !== 'sap-stick').length;
    return {
      debugVersion: window.SYLVARIA_SEQUOIA_DEBUG.version,
      rhythm: S.sapRhythm.getState(),
      authority: S.sapAuthority?.getState?.() || null,
      economy: S.canopyEconomy.getState(),
      routeBalance: S.sapRouteBalance || null,
      nonExplicit,
    };
  });

  if (initial.debugVersion !== '0.6.1') throw new Error(`v0.6.1 debug contract unavailable: ${JSON.stringify(initial)}`);
  if (!initial.rhythm.ready || initial.rhythm.minAnchorVerticalSpacing !== 205 || initial.nonExplicit !== 0) {
    throw new Error(`Sparse authored Sap rhythm unavailable: ${JSON.stringify(initial)}`);
  }
  if (
    initial.authority?.version !== 'nearest-sap-authority-v3' ||
    !initial.authority.armed ||
    initial.authority.bufferedAcquisitionSeconds !== 0 ||
    !initial.authority.immutableAnchorIdentity ||
    JSON.stringify(initial.authority.anchorIdentityFields) !== JSON.stringify(['chunkId', 'floor', 'role', 'anchorKind'])
  ) {
    throw new Error(`Hard Sap authority unavailable: ${JSON.stringify(initial.authority)}`);
  }
  if (Object.values(initial.routeBalance?.hasConsecutiveAirAnchors || {}).some(Boolean)) {
    throw new Error(`Sap route still contains consecutive air anchors: ${JSON.stringify(initial.routeBalance)}`);
  }
  if (initial.economy.wallet !== 40 || initial.economy.missions.length !== 3 || initial.economy.missions[0].id !== 'two-way-climb') {
    throw new Error(`Canopy Contracts economy did not initialize: ${JSON.stringify(initial.economy)}`);
  }

  const primed = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const knot = S.state.knots.find((item) => item.anchorKind === 'sap-stick' && item.floor > 0);
    if (!knot) return null;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.x = knot.x - 82;
    S.player.px = S.player.x;
    S.player.y = knot.y - 146;
    S.player.py = S.player.y;
    S.player.vx = 235;
    S.player.vy = 40;
    S.player.highestFloor = Math.max(0, knot.floor - 2);
    S.player.lastFloor = Math.max(0, knot.floor - 3);
    S.state.threatY = Math.min(S.state.threatY, S.player.y - 650);
    return { knot: { floor: knot.floor, x: knot.x, y: knot.y }, target: S.sapStick.getTargetPreview?.() || null };
  });
  if (!primed?.target) throw new Error(`Could not prime an authored Sap anchor: ${JSON.stringify(primed)}`);

  await page.keyboard.down('Shift');
  await waitForSnapshot(
    page,
    () => frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState()),
    (snapshot) => Boolean(snapshot.sapStick?.active && snapshot.sapStick?.held),
    'authored Sap acquisition',
    1000,
  );
  await advanceSimulation(frame, 12);
  await page.keyboard.up('Shift');
  const afterFirstSap = await advanceUntil(
    frame,
    () => frame.evaluate(() => ({
      state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
      counters: window.SylvariaSequoia.getTelemetry().counters,
    })),
    (snapshot) =>
      !snapshot.state.sapStick?.active &&
      !snapshot.state.sapStick?.held &&
      snapshot.state.sapAuthority?.nodeUses === 1,
    'first Sap release',
  );
  if (afterFirstSap.state.sapRhythm.ready || afterFirstSap.state.sapRhythm.sapUses !== 1 || afterFirstSap.state.sapStick?.active) {
    throw new Error(`First Sap did not spend exactly one branch-gated charge: ${JSON.stringify(afterFirstSap)}`);
  }
  if (afterFirstSap.state.sapAuthority.armed || afterFirstSap.state.sapAuthority.nodeUses !== 1 || !afterFirstSap.state.sapAuthority.useInvariant) {
    throw new Error(`First Sap did not atomically spend hard authority: ${JSON.stringify(afterFirstSap.state.sapAuthority)}`);
  }

  // The spam contract is authority-local. Do not advance world physics here: a
  // legitimate higher-log landing is exactly what is allowed to rearm Sap, so a
  // wall-clock spam loop can accidentally test the post-recharge state instead.
  const afterSpam = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    for (let index = 0; index < 16; index += 1) S.pressSapStick();
    return {
      state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
      counters: S.getTelemetry().counters,
    };
  });
  if (afterSpam.state.mode !== 'playing' || afterSpam.state.sapAuthority.nodeUses !== 1 || afterSpam.state.sapAuthority.armed || !afterSpam.state.sapAuthority.useInvariant) {
    throw new Error(`Sap spam bypassed the hard higher-log authority contract: ${JSON.stringify(afterSpam)}`);
  }
  if ((afterSpam.counters.sapAuthorityBlockedPresses || 0) < 16) {
    throw new Error(`Rapid blocked Sap presses were not rejected at authority: ${JSON.stringify(afterSpam.counters)}`);
  }

  const rechargeTarget = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const authority = S.sapAuthority.getState();
    const branch = S.state.branches.find((item) => item.floor > authority.spentAtFloor + 1);
    if (!branch) return null;
    const x = (branch.x1 + branch.x2) * 0.5;
    S.player.grounded = branch;
    S.player.groundedTime = 0;
    S.player.x = x;
    S.player.px = x;
    S.player.y = S.branchYAt(branch, x) + S.state.PLAYER_R;
    S.player.py = S.player.y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.state.threatY = Math.min(S.state.threatY, S.player.y - 650);
    return { floor: branch.floor, spentAtFloor: authority.spentAtFloor };
  });
  if (!rechargeTarget) throw new Error('Could not locate a higher physical log for Sap recharge');
  const afterRecharge = await advanceUntil(
    frame,
    () => frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState()),
    (snapshot) => Boolean(
      snapshot.sapRhythm?.ready &&
      snapshot.sapRhythm?.sapCycles >= 1 &&
      snapshot.sapAuthority?.armed &&
      snapshot.sapAuthority?.recharges >= 1
    ),
    'held higher-log Sap recharge',
    60,
  );
  if (!afterRecharge.sapRhythm.ready || afterRecharge.sapRhythm.sapCycles < 1 || afterRecharge.sapRhythm.highestLogFloor <= rechargeTarget.spentAtFloor) {
    throw new Error(`Higher log did not recharge legacy rhythm observation: ${JSON.stringify({ rechargeTarget, afterRecharge })}`);
  }
  if (!afterRecharge.sapAuthority.armed || afterRecharge.sapAuthority.recharges !== 1 || afterRecharge.sapAuthority.highestPhysicalFloor <= rechargeTarget.spentAtFloor) {
    throw new Error(`Higher physical log did not rearm hard Sap authority exactly once: ${JSON.stringify({ rechargeTarget, afterRecharge: afterRecharge.sapAuthority })}`);
  }

  const pickup = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(12000);
    const token = S.canopyEconomy.getVisibleTokens()[0];
    if (!token) return null;
    const branch = S.state.branches.find((item) => item.floor === token.floor);
    if (!branch) return null;
    S.player.grounded = branch;
    S.player.groundedTime = 0;
    S.player.x = token.x;
    S.player.px = token.x;
    S.player.y = S.branchYAt(branch, token.x) + S.state.PLAYER_R;
    S.player.py = S.player.y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.state.threatY = Math.min(S.state.threatY, S.player.y - 650);
    return { token, walletBefore: S.canopyEconomy.getState().wallet };
  });
  if (!pickup) throw new Error('No deterministic log token was available for collection test');
  const afterPickup = await advanceUntil(
    frame,
    () => frame.evaluate(() => window.SylvariaSequoia.canopyEconomy.getState()),
    (economy) => economy.wallet >= pickup.walletBefore + 1,
    'Cone Token collection',
    60,
  );
  if (afterPickup.wallet < pickup.walletBefore + 1) {
    throw new Error(`Log token did not enter the persistent wallet: ${JSON.stringify({ pickup, afterPickup })}`);
  }

  const purchased = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.state.mode = 'gameover';
    S.wrap.dataset.playing = 'false';
    const before = S.canopyEconomy.getState();
    const ok = S.canopyEconomy.purchase('extra-life');
    const after = S.canopyEconomy.getState();
    return { ok, before, after };
  });
  if (!purchased.ok || !purchased.after.queuedLoadout['extra-life'] || purchased.after.wallet !== purchased.before.wallet - 18) {
    throw new Error(`Extra Life purchase failed: ${JSON.stringify(purchased)}`);
  }

  const consumed = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(S.state.runSeed + 1);
    return {
      saves: S.player.saves,
      economy: S.canopyEconomy.getState(),
      rhythm: S.sapRhythm.getState(),
      authority: S.sapAuthority.getState(),
    };
  });
  if (consumed.saves < 1 || !consumed.economy.activeLoadout.includes('extra-life') || consumed.economy.queuedLoadout['extra-life']) {
    throw new Error(`Extra Life was not consumed into the next run: ${JSON.stringify(consumed)}`);
  }
  if (!consumed.rhythm.ready || consumed.rhythm.sapUses !== 0 || !consumed.authority.armed || consumed.authority.nodeUses !== 0) {
    throw new Error(`New run did not reset Sap authority cleanly: ${JSON.stringify(consumed)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-canopy-contracts.png`), fullPage: true });
  return { engine: engineName, ok: true, initial, primed, afterFirstSap, afterSpam, rechargeTarget, afterRecharge, pickup, afterPickup, purchased, consumed };
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
