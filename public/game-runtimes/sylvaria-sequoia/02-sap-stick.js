(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  const { state, player, TUNE, clamp, recordEvent, announce, burst, tone } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const baseReleaseSap = S.releaseSap;

  let castCooldown = 0;
  let lastTarget = null;
  let stickHeld = false;
  let acquireBuffer = 0;
  let releaseQueuedReason = '';
  let missReportedForHold = false;
  const anchorLockouts = new Map();
  const CLEAN_VAULT_MIN_HOLD = 0.16;
  const CLEAN_VAULT_MAX_HOLD = 0.82;
  const CLEAN_VAULT_MIN_HORIZONTAL = 330;

  function bumpCounter(name) {
    const counters = S.getTelemetry().counters;
    counters[name] = (counters[name] || 0) + 1;
  }

  function anchorId(knot) {
    return `${knot.chunkId || 'route'}:${knot.floor}:${Math.round(knot.x)}:${Math.round(knot.y)}`;
  }

  function inputAxis() {
    let axis = 0;
    if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) axis -= 1;
    if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) axis += 1;
    for (const action of state.pointers.values()) {
      if (action === 'left') axis -= 1;
      if (action === 'right') axis += 1;
    }
    return clamp(axis, -1, 1);
  }

  function isRescueState() {
    const threatGap = player.y - state.threatY;
    return player.vy < -170 || threatGap < 245;
  }

  function findTarget({ includeLocked = false } = {}) {
    if (state.mode !== 'playing') return null;
    const axis = inputAxis();
    const direction = axis || Math.sign(player.vx || player.facing || 1);
    const rescue = isRescueState();
    let best = null;
    let bestScore = Infinity;

    for (const knot of state.knots) {
      const id = anchorId(knot);
      if (!includeLocked && (anchorLockouts.get(id) || 0) > 0) continue;
      const dx = knot.x - player.x;
      const dy = knot.y - player.y;
      if (dy < -TUNE.sap.stickMaxBelow || dy > TUNE.sap.stickMaxAbove) continue;
      const distance = Math.hypot(dx, dy);
      if (distance < TUNE.sap.stickMinDistance || distance > TUNE.sap.stickRange) continue;

      const forward = dx * direction;
      const behindPenalty = !rescue && forward < -70 ? Math.abs(forward + 70) * 0.58 : 0;
      const belowPenalty = dy < 0 ? Math.abs(dy) * (rescue ? 0.36 : 1.15) : 0;
      const verticalReward = Math.max(0, dy) * (rescue ? 0.42 : 0.29);
      const routeReward = knot.anchorKind === 'sap-stick' ? TUNE.sap.stickAnchorPriority : 0;
      const forwardReward = Math.max(0, forward) * 0.10;
      const score = distance + behindPenalty + belowPenalty - verticalReward - routeReward - forwardReward;

      if (score < bestScore) {
        bestScore = score;
        best = knot;
      }
    }

    return best;
  }

  function updateAnchorLockouts(dt) {
    for (const [id, remaining] of anchorLockouts.entries()) {
      const next = remaining - dt;
      if (next <= 0) anchorLockouts.delete(id);
      else anchorLockouts.set(id, next);
    }
  }

  function attachTarget(knot, buffered = false) {
    if (!knot || state.mode !== 'playing') return false;
    const telemetry = S.getTelemetry();
    const dx = knot.x - player.x;
    const dy = knot.y - player.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const tx = -ny;
    const ty = nx;
    const axis = inputAxis();
    const forward = axis || Math.sign(player.vx || player.facing || dx || 1);
    const tangentVelocity = player.vx * tx + player.vy * ty;
    const tangentSign = Math.sign(tangentVelocity || forward * tx || 1);
    const speed = Math.hypot(player.vx, player.vy);
    const rescue = isRescueState();

    telemetry.counters.sapAttempts += 1;
    telemetry.counters.sapAttaches += 1;
    bumpCounter('sapStickCasts');
    if (buffered) bumpCounter('sapStickBufferedLocks');
    if (rescue) bumpCounter('sapStickRescues');

    player.sap = {
      knot,
      rest: clamp(distance * TUNE.sap.stickRestRatio, TUNE.sap.stickRestMin, TUNE.sap.stickRestMax),
      maxStretch: 0,
      age: 0,
      snapEligible: false,
      stickMode: true,
      stickStartedAt: state.elapsed,
    };
    player.grounded = null;
    player.groundedTime = 0;
    player.coyote = 0;
    player.state = 'sap-stick';

    const tangentBoost = TUNE.sap.stickTangentBoost + Math.min(92, speed * 0.12);
    player.vx = clamp(
      player.vx * 0.58 + nx * TUNE.sap.stickPullImpulse + tx * tangentBoost * tangentSign,
      -TUNE.sap.stickReleaseSpeedCap,
      TUNE.sap.stickReleaseSpeedCap
    );
    player.vy = Math.max(
      player.vy * 0.28
        + Math.max(0, ny) * TUNE.sap.stickPullImpulse
        + ty * tangentBoost * tangentSign
        + (rescue ? TUNE.sap.stickRescueBonus : 0),
      TUNE.sap.stickMinVy + Math.max(0, dy) * 0.10
    );
    player.airJumps = TUNE.jump.airJumps;
    player.strideMomentum = Math.max(player.strideMomentum || 0, Math.min(TUNE.run.strideMax, Math.abs(player.vx) + 55));

    anchorLockouts.set(anchorId(knot), TUNE.sap.stickReuseLockSeconds);
    castCooldown = TUNE.sap.stickCooldownSeconds;
    acquireBuffer = 0;
    missReportedForHold = false;
    lastTarget = knot;
    recordEvent('sap-stick-cast', {
      floor: knot.floor,
      route: knot.chunkType,
      anchorKind: knot.anchorKind || 'branch',
      distance: S.round(distance, 1),
      rescue,
      buffered,
      vx: S.round(player.vx, 1),
      vy: S.round(player.vy, 1),
    });
    announce(rescue ? 'SAP STICK SAVE · HOLD!' : 'SAP STICK · HOLD TO SWING', 0.38, rescue ? 15 : 12);
    burst(knot.x, knot.y, rescue ? 14 : 10, 'resin', 0.66);
    tone(rescue ? 610 : 520, 0.06, 0.03, 'triangle', 1.45);
    return true;
  }

  function reportMiss() {
    if (missReportedForHold) return false;
    const telemetry = S.getTelemetry();
    telemetry.counters.sapAttempts += 1;
    telemetry.counters.sapMisses += 1;
    bumpCounter('sapStickMisses');
    missReportedForHold = true;
    lastTarget = null;
    recordEvent('sap-stick-miss', { vx: S.round(player.vx, 1), vy: S.round(player.vy, 1) });
    announce('NO AMBER LOCK', 0.26, 10);
    tone(105, 0.035, 0.014, 'square', 0.78);
    return false;
  }

  function castSapStick({ quietMiss = false, buffered = false } = {}) {
    if (state.mode !== 'playing') return false;
    if (player.sap?.stickMode) return true;
    if (castCooldown > 0) return false;
    if (player.sap) baseReleaseSap();

    const target = findTarget();
    if (!target) return quietMiss ? false : reportMiss();
    return attachTarget(target, buffered);
  }

  function releaseStick(reason = 'INPUT_RELEASE') {
    const sap = player.sap;
    if (!sap?.stickMode) return false;

    const age = sap.age || 0;
    const forceRelease = reason === 'BLUR' || reason === 'SAFETY_MAX' || reason === 'RUN_END';
    if (!forceRelease && age < TUNE.sap.stickMinHoldSeconds) {
      releaseQueuedReason = reason;
      return true;
    }

    const knot = sap.knot;
    const rescue = isRescueState();
    const away = Math.sign(player.x - knot.x || player.vx || player.facing || 1);

    // The legacy rope release awards SAP Flow whenever its spring gain exceeds a
    // low threshold. With one-button Sap Stick that turned ordinary locomotion
    // into 100x+ combos. A normal stick vault should preserve a chain, not mint a
    // combo link for free. Only a deliberately shaped, fast release earns CLEAN SAP.
    const legacyComboReleaseGain = TUNE.sap.comboReleaseGain;
    const legacySurgeThreshold = TUNE.combo.sapSurgeThreshold;
    TUNE.sap.comboReleaseGain = Number.POSITIVE_INFINITY;
    TUNE.combo.sapSurgeThreshold = Number.POSITIVE_INFINITY;
    try {
      baseReleaseSap();
    } finally {
      TUNE.sap.comboReleaseGain = legacyComboReleaseGain;
      TUNE.combo.sapSurgeThreshold = legacySurgeThreshold;
    }

    player.vx = clamp(
      player.vx + away * TUNE.sap.stickReleaseForward,
      -TUNE.sap.stickReleaseSpeedCap,
      TUNE.sap.stickReleaseSpeedCap
    );
    player.vy = Math.max(
      player.vy,
      TUNE.sap.stickReleaseMinVy + (rescue ? TUNE.sap.stickRescueBonus * 0.42 : 0)
    );
    player.airJumps = TUNE.jump.airJumps;
    player.state = 'airborne-up';
    player.stretch = 1;
    player.strideMomentum = Math.max(player.strideMomentum || 0, Math.min(TUNE.run.strideMax, Math.abs(player.vx) + 70));

    const cleanVault = !forceRelease
      && age >= CLEAN_VAULT_MIN_HOLD
      && age <= CLEAN_VAULT_MAX_HOLD
      && Math.abs(player.vx) >= CLEAN_VAULT_MIN_HORIZONTAL;
    if (cleanVault) {
      S.addComboLink('SAP', 'CLEAN SAP', 1, 0.10);
      bumpCounter('sapStickCleanVaults');
    } else if (player.combo > 0) {
      // Ordinary grapples are connective tissue. They give the player enough
      // breathing room to reach the next scoring verb without inflating Flow.
      player.comboTimer = Math.max(player.comboTimer, 0.42);
      bumpCounter('sapStickFlowCarries');
    }

    bumpCounter('sapStickVaults');
    if (reason === 'SHIFT_RELEASE' || reason === 'POINTER_RELEASE') bumpCounter('sapStickHoldReleases');
    if (reason === 'SAFETY_MAX') bumpCounter('sapStickSafetyReleases');
    releaseQueuedReason = '';
    recordEvent('sap-stick-release', {
      reason,
      floor: knot.floor,
      holdSeconds: S.round(age, 3),
      cleanVault,
      vx: S.round(player.vx, 1),
      vy: S.round(player.vy, 1),
    });
    announce(cleanVault ? 'CLEAN SAP · AIR KICK READY' : 'SAP VAULT · AIR KICK READY', 0.42, cleanVault ? 14 : 12);
    burst(player.x, player.y, cleanVault ? 16 : 10, 'resin', cleanVault ? 0.86 : 0.66);
    tone(cleanVault ? 720 : 660, 0.07, 0.032, 'triangle', 1.5);
    return true;
  }

  function pressSapStick() {
    if (state.mode !== 'playing') return false;
    if (stickHeld) return Boolean(player.sap?.stickMode);
    stickHeld = true;
    acquireBuffer = TUNE.sap.stickAcquireBufferSeconds;
    releaseQueuedReason = '';
    missReportedForHold = false;
    bumpCounter('sapStickPresses');
    recordEvent('sap-stick-press', { acquireBuffer: TUNE.sap.stickAcquireBufferSeconds });
    const attached = castSapStick({ quietMiss: true, buffered: false });
    if (!attached && acquireBuffer <= 0) reportMiss();
    return attached;
  }

  function releaseSapStickInput(reason = 'SHIFT_RELEASE') {
    stickHeld = false;
    acquireBuffer = 0;
    if (player.sap?.stickMode) return releaseStick(reason);
    releaseQueuedReason = '';
    return false;
  }

  function applyHeldScreenSteering(dt) {
    if (!stickHeld || !player.sap?.stickMode) return;
    const axis = inputAxis();
    if (axis === 0) return;

    // A/D always means screen-left / screen-right while tethered. The legacy rope
    // pump uses a tangent basis whose sign flips around the anchor, which made the
    // same key sometimes feel reversed. Sap Stick suppresses that hidden pump and
    // uses direct horizontal authority; the spring constraint turns it into swing.
    player.vx += axis * TUNE.sap.stickSteerAccel * dt;
    player.vx = clamp(player.vx, -TUNE.sap.stickReleaseSpeedCap, TUNE.sap.stickReleaseSpeedCap);
  }

  function update(dt) {
    castCooldown = Math.max(0, castCooldown - dt);
    updateAnchorLockouts(dt);

    if (stickHeld && !player.sap?.stickMode && acquireBuffer > 0 && state.mode === 'playing') {
      const before = acquireBuffer;
      acquireBuffer = Math.max(0, acquireBuffer - dt);
      if (castCooldown <= 0) {
        const buffered = before < TUNE.sap.stickAcquireBufferSeconds - 0.001;
        castSapStick({ quietMiss: true, buffered });
      }
      if (!player.sap?.stickMode && acquireBuffer <= 0) reportMiss();
    }

    applyHeldScreenSteering(dt);

    // The old rope pump remains available to legacy sap movement, but Sap Stick
    // uses screen-horizontal steering so control never inverts as Pip crosses the
    // anchor. Temporarily zeroing the pump is synchronous and confined to one
    // fixed simulation update.
    const suppressLegacyPump = Boolean(player.sap?.stickMode);
    const pumpAccel = TUNE.sap.pumpAccel;
    const hyperPumpAccel = TUNE.sap.hyperPumpAccel;
    if (suppressLegacyPump) {
      TUNE.sap.pumpAccel = 0;
      TUNE.sap.hyperPumpAccel = 0;
    }
    try {
      baseUpdate(dt);
    } finally {
      if (suppressLegacyPump) {
        TUNE.sap.pumpAccel = pumpAccel;
        TUNE.sap.hyperPumpAccel = hyperPumpAccel;
      }
    }

    const sap = player.sap;
    if (sap?.stickMode) {
      if (releaseQueuedReason && sap.age >= TUNE.sap.stickMinHoldSeconds) {
        releaseStick(releaseQueuedReason);
      } else if (sap.age >= TUNE.sap.stickMaxHoldSeconds) {
        stickHeld = false;
        releaseStick('SAFETY_MAX');
      }
    }

    if (state.mode !== 'playing') {
      lastTarget = null;
      stickHeld = false;
      acquireBuffer = 0;
      releaseQueuedReason = '';
    }
  }

  function resetSapStick() {
    castCooldown = 0;
    lastTarget = null;
    stickHeld = false;
    acquireBuffer = 0;
    releaseQueuedReason = '';
    missReportedForHold = false;
    anchorLockouts.clear();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetSapStick();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetSapStick();
    return result;
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.castSapStick = castSapStick;
  S.pressSapStick = pressSapStick;
  S.releaseSapStick = releaseSapStickInput;
  S.sapStick = {
    cast: castSapStick,
    press: pressSapStick,
    release: releaseSapStickInput,
    getTargetPreview: () => findTarget(),
    getState: () => ({
      active: Boolean(player.sap?.stickMode),
      held: stickHeld,
      cooldown: castCooldown,
      range: TUNE.sap.stickRange,
      acquireBufferRemaining: acquireBuffer,
      minHoldSeconds: TUNE.sap.stickMinHoldSeconds,
      maxHoldSeconds: TUNE.sap.stickMaxHoldSeconds,
      cleanVaultWindow: [CLEAN_VAULT_MIN_HOLD, CLEAN_VAULT_MAX_HOLD],
      cleanVaultMinHorizontal: CLEAN_VAULT_MIN_HORIZONTAL,
      holdSeconds: player.sap?.stickMode ? player.sap.age || 0 : 0,
      maxHoldRemaining: player.sap?.stickMode ? Math.max(0, TUNE.sap.stickMaxHoldSeconds - (player.sap.age || 0)) : 0,
      releaseQueued: Boolean(releaseQueuedReason),
      targetFloor: player.sap?.stickMode ? player.sap.knot.floor : lastTarget?.floor ?? null,
      targetKind: player.sap?.stickMode ? player.sap.knot.anchorKind || 'branch' : lastTarget?.anchorKind || null,
      lockedAnchors: anchorLockouts.size,
    }),
  };
})();
