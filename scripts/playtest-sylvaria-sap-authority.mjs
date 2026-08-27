import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_SAP_AUTHORITY_BROWSER_DIR || 'artifacts/sylvaria-sequoia-sap-authority';
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
        // Browser engines can publish the iframe before its canvas is input-ready.
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

async function waitForSnapshot(page, read, predicate, label, timeoutMs = 1800) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await read();
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

async function advanceUntil(frame, read, predicate, label, maxSteps = 120) {
  let last = await read();
  if (predicate(last)) return last;
  for (let index = 0; index < maxSteps; index += 1) {
    await advanceSimulation(frame, 1);
    last = await read();
    if (predicate(last)) return last;
  }
  throw new Error(`${label} did not settle within ${maxSteps} fixed steps: ${JSON.stringify(last)}`);
}

async function runContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);
  const frame = await runtimeFrame(page);
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
    S.generateUntil(18000);
    S.sapRhythm?.pruneSapAnchors?.();
    const authority = S.sapAuthority?.getState?.() || null;
    const routeBalance = S.sapRouteBalance || null;
    const anchors = S.state.knots.filter((knot) => knot.anchorKind === 'sap-stick').length;
    const branches = S.state.branches.length;
    return {
      debugVersion: window.SYLVARIA_SEQUOIA_DEBUG.version,
      authority,
      routeBalance,
      anchors,
      branches,
      density: branches ? anchors / branches : 99,
    };
  });

  if (initial.debugVersion !== '0.6.1') throw new Error(`v0.6.1 debug contract unavailable: ${JSON.stringify(initial)}`);
  if (initial.authority?.version !== 'nearest-sap-authority-v3' || !initial.authority.pressTimeAcquisition || initial.authority.bufferedAcquisitionSeconds !== 0) {
    throw new Error(`Nearest Sap authority unavailable: ${JSON.stringify(initial.authority)}`);
  }
  if (!initial.authority.immutableAnchorIdentity || JSON.stringify(initial.authority.anchorIdentityFields) !== JSON.stringify(['chunkId', 'floor', 'role', 'anchorKind'])) {
    throw new Error(`Immutable Sap anchor identity unavailable: ${JSON.stringify(initial.authority)}`);
  }
  if (initial.authority.maxTetherSpeedGain !== 120) throw new Error(`Sap tether energy budget unavailable: ${JSON.stringify(initial.authority)}`);
  if (initial.density >= 0.36) throw new Error(`Generated Sap density is still too high: ${JSON.stringify(initial)}`);
  if (!initial.routeBalance || initial.routeBalance.densityProfile !== 'sparse-one-anchor-v3' || Object.values(initial.routeBalance.hasConsecutiveAirAnchors || {}).some(Boolean)) {
    throw new Error(`Production Sap route balance is stale: ${JSON.stringify(initial.routeBalance)}`);
  }

  const nearest = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.startRun(9173);
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.x = 480;
    S.player.px = 480;
    S.player.y = 210;
    S.player.py = 210;
    S.player.vx = 180;
    S.player.vy = 35;
    S.state.threatY = -10000;

    const far = { x: 292, y: 360, floor: 4, chunkId: 'test-far', chunkType: 'TEST', role: 'left', anchorKind: 'sap-stick', pulse: 0 };
    const near = { x: 560, y: 320, floor: 3, chunkId: 'test-near', chunkType: 'TEST', role: 'right', anchorKind: 'sap-stick', pulse: 0 };
    S.state.knots.splice(0, S.state.knots.length, far, near);

    const preview = S.sapStick.getTargetPreview?.();
    const idBeforeMotion = S.sapAuthority.getState().nearestTarget?.id || null;
    near.x += 18;
    near.y += 4;
    const idAfterMotion = S.sapAuthority.getState().nearestTarget?.id || null;
    const before = { vx: S.player.vx, vy: S.player.vy };
    const attached = S.pressSapStick();
    const after = { vx: S.player.vx, vy: S.player.vy };
    const attachedKnot = S.player.sap?.knot || null;
    return {
      attached,
      preview: preview ? { chunkId: preview.chunkId, floor: preview.floor, x: preview.x, y: preview.y } : null,
      attachedKnot: attachedKnot ? { chunkId: attachedKnot.chunkId, floor: attachedKnot.floor, x: attachedKnot.x, y: attachedKnot.y } : null,
      idBeforeMotion,
      idAfterMotion,
      before,
      after,
      authority: S.sapAuthority.getState(),
    };
  });

  if (!nearest.attached || nearest.preview?.chunkId !== 'test-near' || nearest.attachedKnot?.chunkId !== 'test-near') {
    throw new Error(`Sap did not choose the strict nearest eligible node: ${JSON.stringify(nearest)}`);
  }
  if (!nearest.idBeforeMotion || nearest.idBeforeMotion !== nearest.idAfterMotion || nearest.idAfterMotion !== nearest.authority.activeLeaseId) {
    throw new Error(`Moving Sap anchor changed authority identity: ${JSON.stringify(nearest)}`);
  }
  if (Math.abs(nearest.after.vx - nearest.before.vx) > 95.5 || Math.abs(nearest.after.vy - nearest.before.vy) > 120.5) {
    throw new Error(`Sap attach injected more than the bounded momentum nudge: ${JSON.stringify(nearest)}`);
  }
  if (nearest.authority.nodeUses !== 1 || nearest.authority.armed || nearest.authority.usedAnchors !== 1) {
    throw new Error(`First Sap use was not atomically spent: ${JSON.stringify(nearest.authority)}`);
  }

  // This matrix tests simulation authority, not browser key delivery. The prior
  // Shift-hold matrix already verifies physical Arrow input in all four engines.
  // Here direct state-key steering keeps the energy proof on the fixed 120 Hz clock.
  const tethered = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.state.keys.add('ArrowRight');
    try {
      for (let index = 0; index < 60; index += 1) S.update(S.state.FIXED_DT);
    } finally {
      S.state.keys.delete('ArrowRight');
    }
    const authority = S.sapAuthority.getState();
    return {
      active: Boolean(S.player.sap?.stickMode),
      speed: Math.hypot(S.player.vx, S.player.vy),
      vx: S.player.vx,
      vy: S.player.vy,
      authority,
      counters: S.getTelemetry().counters,
    };
  });
  if (!tethered.active) throw new Error(`Sap released before held-energy test completed: ${JSON.stringify(tethered)}`);
  if (tethered.speed > tethered.authority.leaseSpeedCap + 2) {
    throw new Error(`Held Sap steering pumped past the kinetic-energy budget: ${JSON.stringify(tethered)}`);
  }
  if (tethered.authority.leaseSpeedCap > tethered.authority.leaseEntrySpeed + 120.5 && tethered.authority.leaseSpeedCap > 221) {
    throw new Error(`Tether speed cap exceeds the promised slight boost: ${JSON.stringify(tethered.authority)}`);
  }

  const release = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const before = { vx: S.player.vx, vy: S.player.vy };
    const released = S.releaseSapStick('TEST_RELEASE');
    const after = { vx: S.player.vx, vy: S.player.vy };
    return { released, before, after, active: Boolean(S.player.sap?.stickMode), authority: S.sapAuthority.getState() };
  });
  if (!release.released || release.active) throw new Error(`Sap did not release cleanly: ${JSON.stringify(release)}`);
  if (Math.abs(release.after.vx - release.before.vx) > 105.5 || Math.abs(release.after.vy - release.before.vy) > 145.5) {
    throw new Error(`Sap release injected more than the bounded momentum nudge: ${JSON.stringify(release)}`);
  }
  if (Math.hypot(release.after.vx, release.after.vy) > release.authority.leaseSpeedCap + 67) {
    throw new Error(`Sap release exceeded the post-tether speed budget: ${JSON.stringify(release)}`);
  }

  // Blocked spam is a spent-authority property. No world time advances here,
  // because a real higher-log landing is intentionally allowed to rearm Sap.
  const afterSpam = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    for (let index = 0; index < 24; index += 1) S.pressSapStick();
    return {
      mode: S.state.mode,
      authority: S.sapAuthority.getState(),
      counters: S.getTelemetry().counters,
    };
  });
  if (afterSpam.mode !== 'playing' || afterSpam.authority.nodeUses !== 1 || afterSpam.authority.armed || !afterSpam.authority.useInvariant) {
    throw new Error(`Rapid Sap presses bypassed the single-use lease before landing: ${JSON.stringify(afterSpam)}`);
  }
  if (afterSpam.authority.blockedPresses < 24 || (afterSpam.counters.sapAuthorityBlockedPresses || 0) < 24) {
    throw new Error(`Spent-state Sap spam was not safely rejected at authority: ${JSON.stringify(afterSpam)}`);
  }

  const landing = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const spent = S.sapAuthority.getState().spentAtFloor;
    const branch = {
      x1: 330, x2: 630, y: S.player.y - 20, slope: 0, floor: Math.max(1, spent + 1),
      chunkId: 'test-log', chunkType: 'TEST', side: 'center', launch: false,
    };
    S.state.branches.push(branch);
    S.player.grounded = branch;
    S.player.groundedTime = 0;
    S.player.x = 480;
    S.player.px = 480;
    S.player.y = branch.y + S.state.PLAYER_R;
    S.player.py = S.player.y;
    S.player.vx = 0;
    S.player.vy = 0;
    S.state.threatY = Math.min(S.state.threatY, S.player.y - 650);
    return { floor: branch.floor, spent };
  });
  const rearmed = await advanceUntil(
    frame,
    () => frame.evaluate(() => window.SylvariaSequoia.sapAuthority.getState()),
    (authority) => Boolean(authority.armed && authority.recharges === 1 && authority.highestPhysicalFloor >= landing.floor),
    'held higher-log Sap rearm',
    60,
  );
  if (!rearmed.armed || rearmed.recharges !== 1 || rearmed.highestPhysicalFloor < landing.floor) {
    throw new Error(`A physically held higher log did not rearm Sap exactly once: ${JSON.stringify({ landing, rearmed })}`);
  }

  // Reconstruct the consumed node as a fresh object with the exact same authored
  // topology identity but different coordinates. Used-node authority must survive
  // object replacement and motion; x/y are presentation/physics state only.
  const movedConsumedNode = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.x = 480;
    S.player.px = 480;
    S.player.y = 210;
    S.player.py = 210;
    S.player.vx = 160;
    S.player.vy = 30;
    const consumed = {
      x: S.player.x + 70,
      y: S.player.y + 105,
      floor: 3,
      chunkId: 'test-near',
      chunkType: 'TEST',
      role: 'right',
      anchorKind: 'sap-stick',
      pulse: 0,
    };
    S.state.knots.splice(0, S.state.knots.length, consumed);
    const before = S.sapAuthority.getState();
    const preview = S.sapStick.getTargetPreview?.();
    const attached = S.pressSapStick();
    const after = S.sapAuthority.getState();
    return {
      preview: preview ? { chunkId: preview.chunkId, x: preview.x, y: preview.y } : null,
      attached,
      before,
      after,
    };
  });
  if (movedConsumedNode.preview || movedConsumedNode.attached) {
    throw new Error(`Consumed Sap identity became reusable after object replacement/motion: ${JSON.stringify(movedConsumedNode)}`);
  }
  if (!movedConsumedNode.after.armed || movedConsumedNode.after.nodeUses !== 1 || movedConsumedNode.after.usedAnchors !== 1) {
    throw new Error(`Rejecting the reconstructed consumed anchor corrupted Sap authority state: ${JSON.stringify(movedConsumedNode)}`);
  }

  const second = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.vx = 210;
    S.player.vy = 40;
    const floorBase = S.sapAuthority.getState().highestPhysicalFloor;
    const far = { x: 300, y: S.player.y + 150, floor: floorBase + 3, chunkId: 'test-far-2', chunkType: 'TEST', role: 'left', anchorKind: 'sap-stick', pulse: 0 };
    const near = { x: S.player.x + 72, y: S.player.y + 105, floor: floorBase + 2, chunkId: 'test-near-2', chunkType: 'TEST', role: 'right', anchorKind: 'sap-stick', pulse: 0 };
    S.state.knots.splice(0, S.state.knots.length, far, near);
    const preview = S.sapStick.getTargetPreview?.();
    const attached = S.pressSapStick();
    return {
      attached,
      preview: preview?.chunkId || null,
      attachedId: S.player.sap?.knot?.chunkId || null,
      authority: S.sapAuthority.getState(),
    };
  });
  if (!second.attached || second.preview !== 'test-near-2' || second.attachedId !== 'test-near-2' || second.authority.nodeUses !== 2) {
    throw new Error(`Second cycle did not acquire the new nearest node: ${JSON.stringify(second)}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-nearest-sap-authority.png`), fullPage: true });
  return { engine: engineName, ok: true, initial, nearest, tethered, release, afterSpam, landing, rearmed, movedConsumedNode, second };
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
