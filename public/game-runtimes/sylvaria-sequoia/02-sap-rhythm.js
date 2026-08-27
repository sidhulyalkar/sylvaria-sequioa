(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.resetRun || !S?.startRun || !S?.pressSapStick || !S?.sapStick) return;

  const { state, player, announce, recordEvent, tone, burst } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const basePressSapStick = S.pressSapStick;
  const baseSapState = S.sapStick.getState;
  const baseTargetPreview = S.sapStick.getTargetPreview;

  const VERSION = 'sap-rhythm-v1';
  const MIN_ANCHOR_VERTICAL_SPACING = 205;
  const BLOCKED_NOTICE_SECONDS = 0.42;

  let sapReady = true;
  let spentAtFloor = -1;
  let highestLogFloor = 0;
  let freshLogLandings = 0;
  let sapCycles = 0;
  let sapUses = 0;
  let blockedPresses = 0;
  let removedAnchorCount = 0;
  let lastGroundedBranch = null;
  let blockedNoticeCooldown = 0;

  function bumpCounter(name) {
    const counters = S.getTelemetry().counters;
    counters[name] = (counters[name] || 0) + 1;
  }

  function isExplicitSapAnchor(knot) {
    return knot?.anchorKind === 'sap-stick';
  }

  // v0.5 accumulated both branch knots and authored air anchors into the same
  // target pool. At high altitude this could put four or more orange locks on
  // screen at once and turn Shift into an alternate flight button. v0.6 keeps
  // only authored Sap anchors, then spaces those anchors so each one represents
  // a deliberate bridge between physical log landings.
  function pruneSapAnchors() {
    if (!Array.isArray(state.knots) || state.knots.length === 0) return;
    const activeKnot = player.sap?.knot || null;
    let lastKeptY = -Infinity;
    let removed = 0;
    const next = [];

    for (const knot of state.knots) {
      if (knot === activeKnot) {
        next.push(knot);
        lastKeptY = Math.max(lastKeptY, knot.y);
        continue;
      }
      if (!isExplicitSapAnchor(knot)) {
        removed += 1;
        continue;
      }
      if (knot.y - lastKeptY < MIN_ANCHOR_VERTICAL_SPACING) {
        removed += 1;
        continue;
      }
      next.push(knot);
      lastKeptY = knot.y;
    }

    if (removed > 0) {
      state.knots.splice(0, state.knots.length, ...next);
      removedAnchorCount += removed;
    }
  }

  function spendSap(reason = 'ATTACH') {
    if (!sapReady) return false;
    sapReady = false;
    spentAtFloor = highestLogFloor;
    sapUses += 1;
    bumpCounter('sapRhythmUses');
    recordEvent('sap-rhythm-spent', {
      reason,
      spentAtFloor,
      sapUses,
    });
    return true;
  }

  function rechargeOnFreshLog(branch) {
    if (!branch || branch === lastGroundedBranch) return;
    lastGroundedBranch = branch;
    const floor = Number(branch.floor) || 0;
    if (floor <= highestLogFloor) return;

    highestLogFloor = floor;
    freshLogLandings += 1;
    bumpCounter('freshLogLandings');
    recordEvent('fresh-log-landing', { floor, freshLogLandings });

    if (!sapReady && floor > spentAtFloor) {
      sapReady = true;
      sapCycles += 1;
      bumpCounter('sapRhythmCycles');
      recordEvent('sap-rhythm-recharged', { floor, sapCycles });
      announce('SAP READY · HIGHER LOG BANKED', 0.48, 12);
      burst(player.x, player.y - state.PLAYER_R, 6, 'resin', 0.34);
      tone(470, 0.05, 0.022, 'triangle', 1.35);
    }
  }

  function observeGrounding() {
    if (!player.grounded) {
      lastGroundedBranch = null;
      return;
    }
    rechargeOnFreshLog(player.grounded);
  }

  function blockedSapPress() {
    blockedPresses += 1;
    bumpCounter('sapRhythmBlockedPresses');
    if (blockedNoticeCooldown <= 0) {
      blockedNoticeCooldown = BLOCKED_NOTICE_SECONDS;
      announce('SAP SPENT · LAND ON A HIGHER LOG', 0.34, 11);
      tone(118, 0.03, 0.012, 'square', 0.82);
    }
    recordEvent('sap-rhythm-blocked', {
      spentAtFloor,
      highestLogFloor,
      blockedPresses,
    });
    return false;
  }

  function pressSapStick() {
    if (state.mode !== 'playing') return false;

    // A repress while a queued minimum-hold release is still attached must not
    // call the underlying press function. The old path cleared its queued release
    // reason and was the key reason rapid Shift tapping could keep a tether alive.
    if (player.sap?.stickMode) return true;
    if (!sapReady) return blockedSapPress();

    pruneSapAnchors();
    const attached = Boolean(basePressSapStick());
    if (attached && player.sap?.stickMode) spendSap('PRESS_ATTACH');
    return attached;
  }

  function update(dt) {
    blockedNoticeCooldown = Math.max(0, blockedNoticeCooldown - dt);
    pruneSapAnchors();
    const wasActive = Boolean(player.sap?.stickMode);
    baseUpdate(dt);
    pruneSapAnchors();
    const isActive = Boolean(player.sap?.stickMode);
    if (!wasActive && isActive) spendSap('BUFFERED_ATTACH');
    observeGrounding();
  }

  function resetRhythm() {
    pruneSapAnchors();
    sapReady = true;
    spentAtFloor = -1;
    highestLogFloor = Number(player.grounded?.floor) || 0;
    freshLogLandings = 0;
    sapCycles = 0;
    sapUses = 0;
    blockedPresses = 0;
    removedAnchorCount = 0;
    lastGroundedBranch = player.grounded || null;
    blockedNoticeCooldown = 0;
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetRhythm();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetRhythm();
    return result;
  }

  function getState() {
    return {
      version: VERSION,
      ready: sapReady,
      needsHigherLog: !sapReady,
      spentAtFloor,
      highestLogFloor,
      freshLogLandings,
      sapCycles,
      sapUses,
      blockedPresses,
      removedAnchorCount,
      minAnchorVerticalSpacing: MIN_ANCHOR_VERTICAL_SPACING,
      successfulUseInvariant: sapUses <= sapCycles + 1,
      explicitAnchorCount: state.knots.filter(isExplicitSapAnchor).length,
    };
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.pressSapStick = pressSapStick;
  S.sapRhythm = {
    version: VERSION,
    getState,
    pruneSapAnchors,
  };
  S.sapStick.press = pressSapStick;
  S.sapStick.getTargetPreview = () => sapReady ? baseTargetPreview() : null;
  S.sapStick.getState = () => ({
    ...baseSapState(),
    rhythm: getState(),
    ready: sapReady,
    needsHigherLog: !sapReady,
  });
})();