import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwrightRoot = process.env.PLAYWRIGHT_MODULE_ROOT;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_MODULE_ROOT is required');
const requireFromPlaywright = createRequire(path.join(playwrightRoot, 'package.json'));
const { chromium, firefox, webkit } = requireFromPlaywright('playwright');

const baseUrl = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:3000';
const outputDir = process.env.SYLVARIA_SHIFT_BROWSER_DIR || 'artifacts/sylvaria-sequoia-shift-hold';
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
  let lastFrameUrls = [];
  while (Date.now() < deadline) {
    const frames = page.frames();
    lastFrameUrls = frames.map((candidate) => candidate.url());
    const frame = frames.find((candidate) => candidate.url().includes('/game-runtimes/sylvaria-sequoia/'));
    if (frame) {
      try {
        await frame.locator('#c').waitFor({ state: 'visible', timeout: 750 });
        return frame;
      } catch {
        // The runtime frame can exist before its canvas is painted, especially in WebKit.
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Sylvaria iframe did not attach within 8s: ${JSON.stringify(lastFrameUrls)}`);
}

async function focusRuntime(page, frame) {
  await frame.locator('#c').click();
  await frame.locator('#c').focus();
  await page.waitForFunction(() => document.documentElement.classList.contains('game-runtime-focused'));
  const focused = await frame.evaluate(() => document.hasFocus() && document.activeElement?.id === 'c');
  if (!focused) throw new Error('Sylvaria canvas did not receive keyboard focus');
}

async function state(frame) {
  return frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.getState());
}

async function waitForSnapshot(page, read, ready, label, timeout = 2500) {
  const deadline = Date.now() + timeout;
  let last = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (ready(last)) return last;
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await page.waitForTimeout(16);
  }
  throw new Error(`${label} did not settle within ${timeout}ms: ${JSON.stringify({ last, lastError })}`);
}

async function advanceSimulation(frame, steps = 1) {
  return frame.evaluate((count) => {
    const S = window.SylvariaSequoia;
    if (!S?.update || !S?.state?.FIXED_DT) throw new Error('Sylvaria fixed-step update is unavailable');
    for (let index = 0; index < count; index += 1) S.update(S.state.FIXED_DT);
    return window.SYLVARIA_SEQUOIA_DEBUG.getState();
  }, steps);
}

async function advanceUntil(frame, read, ready, label, maxSteps = 360) {
  let last = null;
  for (let step = 0; step <= maxSteps; step += 1) {
    last = await read();
    if (ready(last)) return last;
    await advanceSimulation(frame, 1);
  }
  throw new Error(`${label} did not settle within ${maxSteps} fixed steps: ${JSON.stringify(last)}`);
}

async function resetSameSeed(page, frame) {
  const seed = (await state(frame)).seed;
  await frame.evaluate(() => window.SYLVARIA_SEQUOIA_DEBUG.retry());
  return waitForSnapshot(
    page,
    () => state(frame),
    (snapshot) =>
      snapshot.mode === 'playing' &&
      snapshot.seed === seed &&
      snapshot.sapAuthority?.armed &&
      snapshot.sapAuthority?.nodeUses === 0 &&
      Math.abs(snapshot.player.x - 480) <= 45,
    'same-seed retry reset',
  );
}

async function primeAuthoredSapTarget(frame) {
  return frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    S.generateUntil(9000);
    S.sapRhythm?.pruneSapAnchors?.();
    const knot = S.state.knots.find((item) => item.anchorKind === 'sap-stick');
    if (!knot) return null;
    S.player.sap = null;
    S.player.grounded = null;
    S.player.groundedTime = 0;
    S.player.coyote = 0;
    S.player.x = knot.x - 84;
    S.player.px = S.player.x;
    S.player.y = knot.y - 146;
    S.player.py = S.player.y;
    S.player.vx = 230;
    S.player.vy = 35;
    S.player.highestFloor = Math.max(0, knot.floor - 2);
    S.player.lastFloor = Math.max(0, knot.floor - 3);
    S.state.threatY = Math.min(S.state.threatY, S.player.y - 650);
    return {
      knot: { floor: knot.floor, x: knot.x, y: knot.y },
      target: S.sapStick.getTargetPreview?.() || null,
      rhythm: S.sapRhythm?.getState?.() || null,
      authority: S.sapAuthority?.getState?.() || null,
    };
  });
}

async function runtimeContracts(frame) {
  return frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    const originalFloor = S.player.highestFloor;
    const intensities = {};
    for (const floor of [0, 45, 80, 130, 190]) {
      S.player.highestFloor = floor;
      intensities[floor] = S.canopyEscalation?.getState?.().intensity ?? null;
    }
    S.player.highestFloor = originalFloor;
    return {
      minimalHudGate: S.minimalHudGate || null,
      progressHud: S.canopyProgressHud || null,
      sapHud: S.sapStickControlHud || null,
      progress: S.canopyProgress?.getState?.() || null,
      heartwood: S.heartwoodQuest?.getState?.() || null,
      trials: S.canopyTrials?.getState?.() || null,
      escalation: S.canopyEscalation?.getState?.() || null,
      grammars: window.SYLVARIA_SEQUOIA_DEBUG.getRouteGrammars(),
      sap: S.sapStick?.getState?.() || null,
      sapRhythm: S.sapRhythm?.getState?.() || null,
      sapAuthority: S.sapAuthority?.getState?.() || null,
      economy: S.canopyEconomy?.getState?.() || null,
      intensities,
    };
  });
}

function assertCrownTrailContracts(contract) {
  if (contract.minimalHudGate?.version !== 'reference-hud-suppression-v1' || !contract.minimalHudGate?.preservesUnderlyingScene) {
    throw new Error(`Minimal HUD gate contract unavailable: ${JSON.stringify(contract.minimalHudGate)}`);
  }
  if (contract.progressHud?.version !== 'minimal-crown-hud-v1' || !/fades out/.test(contract.progressHud?.titleBehavior || '')) {
    throw new Error(`Crown HUD/title-fade contract unavailable: ${JSON.stringify(contract.progressHud)}`);
  }
  if (contract.progressHud?.revision !== 'heartwood-objective-v2' || !/Heartseeds/.test(contract.progressHud?.primaryObjective || '')) {
    throw new Error(`Heartwood HUD objective unavailable: ${JSON.stringify(contract.progressHud)}`);
  }
  if (contract.sapHud?.version !== 'shift-hold-minimal-v2' || !/no persistent side panels/.test(contract.sapHud?.teaching || '')) {
    throw new Error(`Transient Sap HUD contract unavailable: ${JSON.stringify(contract.sapHud)}`);
  }
  if (!contract.progress || contract.progress.nextCrownFloor !== 25 || contract.progress.crownRemaining !== 25) {
    throw new Error(`Initial Crown Trail target is stale: ${JSON.stringify(contract.progress)}`);
  }
  if (!contract.heartwood || contract.heartwood.total !== 5 || contract.heartwood.finalCrownFloor !== 250) {
    throw new Error(`Heartwood objective is unavailable: ${JSON.stringify(contract.heartwood)}`);
  }
  for (const grammar of ['WINDLINE', 'SKYHOOK', 'CROWNWEAVE', 'BREAKAWAY', 'PENDULUM', 'CONEFALL', 'THUNDERCROWN']) {
    if (!contract.grammars.includes(grammar)) throw new Error(`Missing escalating canopy grammar ${grammar}: ${JSON.stringify(contract.grammars)}`);
  }
  const wind = contract.intensities;
  if (wind[0] !== 0 || wind[45] !== 0) throw new Error(`Wind invaded the teaching zone: ${JSON.stringify(wind)}`);
  if (!(wind[80] > 0.16 && wind[130] > wind[80] && wind[190] > wind[130])) {
    throw new Error(`Altitude wind does not escalate monotonically enough: ${JSON.stringify(wind)}`);
  }
  if (JSON.stringify(contract.sap?.cleanVaultWindow) !== JSON.stringify([0.16, 0.82]) || contract.sap?.cleanVaultMinHorizontal !== 330) {
    throw new Error(`Clean Sap mastery window is stale: ${JSON.stringify(contract.sap)}`);
  }
  if (!contract.sapRhythm?.ready || contract.sapRhythm?.minAnchorVerticalSpacing !== 205 || !contract.sapRhythm?.successfulUseInvariant) {
    throw new Error(`Branch-gated Sap rhythm unavailable: ${JSON.stringify(contract.sapRhythm)}`);
  }
  if (
    contract.sapAuthority?.version !== 'nearest-sap-authority-v3' ||
    !contract.sapAuthority?.armed ||
    !contract.sapAuthority?.immutableAnchorIdentity ||
    contract.sapAuthority?.bufferedAcquisitionSeconds !== 0 ||
    !contract.sapAuthority?.useInvariant
  ) {
    throw new Error(`Hard Sap authority unavailable: ${JSON.stringify(contract.sapAuthority)}`);
  }
  if (contract.economy?.currency !== 'CONE TOKENS' || contract.economy?.missions?.length !== 3) {
    throw new Error(`Canopy Contracts economy unavailable: ${JSON.stringify(contract.economy)}`);
  }
}

function assertPostReleaseAuthority(vaulted, requestsBefore) {
  const { state: snapshot } = vaulted;
  const authority = snapshot.sapAuthority;
  const rhythm = snapshot.sapRhythm;

  if ((snapshot.jumpInput?.nextRequestId ?? -1) !== requestsBefore || snapshot.airJumps !== 1) {
    throw new Error(`Shift release leaked into jump authority: ${JSON.stringify(snapshot.jumpInput)}`);
  }
  if (!authority?.useInvariant || authority.nodeUses !== 1 || authority.usedAnchors !== 1) {
    throw new Error(`Shift release violated Sap lease accounting: ${JSON.stringify(authority)}`);
  }
  if (rhythm?.sapUses !== 1 || !rhythm?.successfulUseInvariant) {
    throw new Error(`Shift release violated Sap rhythm accounting: ${JSON.stringify(rhythm)}`);
  }

  // With v0.6.1's bounded-energy Sap, Pip is allowed to reach a real higher log
  // before this observation point. If that happens, Sap should already be armed
  // again. If it has not happened, Sap must remain spent. Never infer correctness
  // from vertical velocity at an arbitrary wall-clock delay.
  if (authority.armed) {
    if (authority.recharges !== 1 || authority.highestPhysicalFloor <= authority.spentAtFloor) {
      throw new Error(`Sap rearmed without a genuine higher-log landing: ${JSON.stringify(authority)}`);
    }
    if (!rhythm.ready || rhythm.sapCycles < 1 || rhythm.highestLogFloor <= rhythm.spentAtFloor) {
      throw new Error(`Hard authority rearmed but rhythm observation did not see the higher log: ${JSON.stringify(rhythm)}`);
    }
  } else {
    if (authority.recharges !== 0 || rhythm.ready) {
      throw new Error(`Sap spent/ready state diverged before a higher-log landing: ${JSON.stringify({ authority, rhythm })}`);
    }
  }
}

async function runShiftHoldContract(page, engineName) {
  const response = await page.goto(`${baseUrl}/arcade/sylvaria-sequoia`, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`Sylvaria route returned ${response?.status() ?? 'no response'}`);

  const frame = await runtimeFrame(page);
  await focusRuntime(page, frame);

  await page.keyboard.press('Space');
  const started = await waitForSnapshot(page, () => state(frame), (snapshot) => snapshot.mode === 'playing', 'Space start');

  const contracts = await runtimeContracts(frame);
  assertCrownTrailContracts(contracts);

  await page.waitForTimeout(1750);
  await page.screenshot({ path: path.join(outputDir, `${engineName}-minimal-crown-playfield.png`), fullPage: true });

  await resetSameSeed(page, frame);
  await focusRuntime(page, frame);
  const plainPrime = await primeAuthoredSapTarget(frame);
  if (!plainPrime?.target) throw new Error(`No sparse authored Sap target for anti-inflation test: ${JSON.stringify(plainPrime)}`);
  const plainBefore = await frame.evaluate(() => ({
    state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
    telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry(),
    target: window.SylvariaSequoia.sapStick.getTargetPreview?.() || null,
  }));
  await page.keyboard.down('Shift');
  await waitForSnapshot(
    page,
    () => state(frame),
    (snapshot) => Boolean(snapshot.sapStick?.active && snapshot.sapStick?.held),
    'plain Sap acquisition',
    1000,
  );
  const plainHold = await frame.evaluate(() => {
    const S = window.SylvariaSequoia;
    if (!S.player.sap?.stickMode) throw new Error('Plain Sap tether disappeared before controlled release');
    S.player.sap.age = 0.100;
    return { holdSeconds: S.player.sap.age, minHoldSeconds: S.TUNE.sap.stickMinHoldSeconds };
  });
  await page.keyboard.up('Shift');
  const plainVault = await advanceUntil(
    frame,
    () => frame.evaluate(() => ({
      state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
      telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry(),
    })),
    (snapshot) =>
      !snapshot.state.sapStick?.active &&
      !snapshot.state.sapStick?.held &&
      (snapshot.telemetry.counters.sapStickVaults || 0) >= 1,
    'plain Sap release/vault',
  );
  const plainSapComboLinks = (plainVault.telemetry.events || []).filter(
    (event) => event.type === 'combo-link' && event.link === 'SAP',
  );
  if (plainHold.holdSeconds < plainHold.minHoldSeconds || plainHold.holdSeconds >= 0.16) {
    throw new Error(`Ordinary Sap hold escaped the non-clean window: ${JSON.stringify(plainHold)}`);
  }
  if ((plainVault.telemetry.counters.sapStickCleanVaults || 0) !== 0 || plainSapComboLinks.length !== 0) {
    throw new Error(`Ordinary Sap vault minted Sap Flow: ${JSON.stringify({ plainHold, plainSapComboLinks, plainVault })}`);
  }
  if (plainVault.state.sapAuthority?.nodeUses !== 1 || !plainVault.state.sapAuthority?.useInvariant) {
    throw new Error(`Plain Sap vault did not consume exactly one authority lease: ${JSON.stringify(plainVault.state.sapAuthority)}`);
  }

  await resetSameSeed(page, frame);
  await focusRuntime(page, frame);
  const primed = await primeAuthoredSapTarget(frame);
  if (!primed?.target) throw new Error(`No sparse authored amber target: ${JSON.stringify(primed)}`);

  const before = await frame.evaluate(() => ({
    state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
    target: window.SylvariaSequoia.sapStick.getTargetPreview?.() || null,
    telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry(),
  }));

  const requestsBefore = before.state.jumpInput?.nextRequestId ?? -1;
  const pressesBefore = before.state.inputGate?.sapPressCount ?? 0;
  const castsBefore = before.telemetry.counters.sapStickCasts || 0;

  await page.keyboard.down('Shift');
  const locked = await waitForSnapshot(
    page,
    () => state(frame),
    (snapshot) => Boolean(snapshot.sapStick?.active && snapshot.sapStick?.held),
    'held Shift Sap acquisition',
    1000,
  );
  if ((locked.inputGate?.sapPressCount ?? 0) !== pressesBefore + 1) {
    throw new Error(`Shift press was not counted exactly once: ${JSON.stringify(locked.inputGate)}`);
  }
  if ((locked.jumpInput?.nextRequestId ?? -1) !== requestsBefore) {
    throw new Error(`Shift-only Sap Stick leaked into jump authority: ${JSON.stringify(locked.jumpInput)}`);
  }

  await page.keyboard.press('Space');
  const afterSpace = await state(frame);
  if (!afterSpace.sapStick?.active || (afterSpace.jumpInput?.nextRequestId ?? -1) !== requestsBefore) {
    throw new Error(`Space leaked through active Sap Stick: ${JSON.stringify(afterSpace)}`);
  }

  await page.keyboard.down('ArrowRight');
  const steeredRight = await waitForSnapshot(
    page,
    () => state(frame),
    (snapshot) => Boolean(snapshot.sapStick?.active && snapshot.inputGate?.physicalDown?.includes('ArrowRight')),
    'right tether steering',
    1000,
  );
  await advanceSimulation(frame, 13);
  const steeredRightSettled = await state(frame);
  await page.keyboard.up('ArrowRight');

  await page.keyboard.down('ArrowLeft');
  await waitForSnapshot(
    page,
    () => state(frame),
    (snapshot) => Boolean(snapshot.sapStick?.active && snapshot.inputGate?.physicalDown?.includes('ArrowLeft')),
    'left tether steering',
    1000,
  );
  await advanceSimulation(frame, 17);
  const steeredLeft = await state(frame);
  await page.keyboard.up('ArrowLeft');
  if (steeredLeft.player.vx >= steeredRightSettled.player.vx - 70) {
    throw new Error(`Opposite A/D steering lacked meaningful swing authority: right=${steeredRightSettled.player.vx}, left=${steeredLeft.player.vx}`);
  }

  await page.keyboard.up('Shift');
  const vaulted = await advanceUntil(
    frame,
    () => frame.evaluate(() => ({
      state: window.SYLVARIA_SEQUOIA_DEBUG.getState(),
      telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry(),
    })),
    (snapshot) =>
      !snapshot.state.sapStick?.active &&
      !snapshot.state.sapStick?.held &&
      (snapshot.telemetry.counters.sapStickCasts || 0) >= castsBefore + 1 &&
      (snapshot.telemetry.counters.sapStickVaults || 0) >= 1,
    'held Shift release/vault',
  );
  assertPostReleaseAuthority(vaulted, requestsBefore);

  await page.keyboard.down('ArrowRight');
  await advanceSimulation(frame, 18);
  await page.keyboard.up('ArrowRight');
  const beforeZero = await frame.evaluate(() => ({ state: window.SYLVARIA_SEQUOIA_DEBUG.getState(), telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry() }));
  await page.keyboard.press('0');
  const afterZero = await waitForSnapshot(
    page,
    () => frame.evaluate(() => ({ state: window.SYLVARIA_SEQUOIA_DEBUG.getState(), telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry() })),
    (snapshot) =>
      snapshot.state.seed === beforeZero.state.seed &&
      snapshot.state.mode === 'playing' &&
      snapshot.state.combo === 0 &&
      Math.abs(snapshot.state.player.x - 480) <= 45 &&
      snapshot.state.sapRhythm.ready &&
      snapshot.state.sapAuthority?.armed &&
      snapshot.state.sapAuthority?.nodeUses === 0,
    '0 same-seed retry',
  );
  if (afterZero.telemetry.runSeconds > 0.35) {
    throw new Error(`0 reset did not restore a fresh run quickly enough: ${JSON.stringify(afterZero)}`);
  }

  await page.keyboard.down('ArrowRight');
  await advanceSimulation(frame, 18);
  await page.keyboard.up('ArrowRight');
  const beforeR = await frame.evaluate(() => ({ state: window.SYLVARIA_SEQUOIA_DEBUG.getState(), telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry() }));
  await page.keyboard.press('r');
  await advanceSimulation(frame, 8);
  const afterR = await frame.evaluate(() => ({ state: window.SYLVARIA_SEQUOIA_DEBUG.getState(), telemetry: window.SYLVARIA_SEQUOIA_DEBUG.getTelemetry() }));
  if (afterR.state.seed !== beforeR.state.seed || afterR.telemetry.runSeconds <= beforeR.telemetry.runSeconds) {
    throw new Error(`R still behaves like a reset: before=${JSON.stringify(beforeR)}, after=${JSON.stringify(afterR)}`);
  }
  if (Math.abs(afterR.state.player.x - 480) + 12 < Math.abs(beforeR.state.player.x - 480)) {
    throw new Error(`R pulled Pip back toward the reset spawn: beforeX=${beforeR.state.player.x}, afterX=${afterR.state.player.x}`);
  }

  await page.screenshot({ path: path.join(outputDir, `${engineName}-shift-hold-sap-stick.png`), fullPage: true });
  return {
    engine: engineName,
    ok: true,
    contracts,
    plainPrime,
    plainBefore,
    plainHold,
    plainVault,
    primed,
    target: before.target,
    locked,
    afterSpace,
    steeredRight,
    steeredRightSettled,
    steeredLeft,
    vaulted,
    afterZero,
    afterR,
  };
}

for (const { name, browserType, launchOptions } of engines) {
  let browser;
  try {
    browser = await browserType.launch({ headless: true, ...launchOptions });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    const result = await runShiftHoldContract(page, name);
    if (errors.length) throw new Error(errors.join('\n'));
    results.push(result);
  } catch (error) {
    failed = true;
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    await browser?.close();
  }
}

fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
if (failed) process.exit(1);
