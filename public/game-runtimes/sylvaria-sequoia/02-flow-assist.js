(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  const { state, player, TUNE, W, clamp, recordEvent, announce, burst, tone } = S;
  const baseAttachSap = S.attachSap;
  const baseReleaseSap = S.releaseSap;
  const baseRequestJump = S.requestJump;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;

  const bitCount = (value) => {
    let count = 0;
    let mask = value >>> 0;
    while (mask) {
      count += mask & 1;
      mask >>>= 1;
    }
    return count;
  };

  function ensureAssistState() {
    player.barkGrace ||= 0;
    player.barkSide ||= '';
    player.clingTimer ||= 0;
    player.clingSide ||= '';
    player.clingActive ||= false;
    player.runCharge ||= 0;
    player.runChargeDirection ||= 0;
    player.lastBurstBranch ||= null;
    player.strideMomentum ||= 0;
    player.wallRecovery ||= 0;
  }

  function bumpCounter(name) {
    const counters = S.getTelemetry().counters;
    counters[name] = (counters[name] || 0) + 1;
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

  function resetAssist() {
    player.barkGrace = 0;
    player.barkSide = '';
    player.clingTimer = 0;
    player.clingSide = '';
    player.clingActive = false;
    player.runCharge = 0;
    player.runChargeDirection = 0;
    player.lastBurstBranch = null;
    player.strideMomentum = 0;
    player.wallRecovery = 0;
  }

  function skillSpeedCap() {
    const flowBonus = Math.min(TUNE.run.skillSpeedBonusCap, Math.max(0, player.combo - 1) * 4);
    return TUNE.run.maxSpeed + flowBonus + (player.hyper ? 42 : 0);
  }

  function rememberStride(value = Math.abs(player.vx)) {
    player.strideMomentum = Math.min(TUNE.run.strideMax, Math.max(player.strideMomentum || 0, Math.abs(value)));
  }

  function attachSap() {
    ensureAssistState();
    const before = player.sap;
    baseAttachSap();
    const sap = player.sap;
    if (before || !sap) return;

    const dx = sap.knot.x - player.x;
    const dy = sap.knot.y - player.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const above = clamp(ny, 0, 1);

    sap.rest = Math.max(TUNE.sap.restMin, sap.rest * TUNE.sap.snapRestScale);
    sap.snapEligible = dy > 10;
    sap.snapStartedAt = state.elapsed;

    if (sap.snapEligible) {
      player.vx += nx * TUNE.sap.snapTowardImpulse;
      player.vy = Math.max(
        player.vy + Math.max(0, ny * TUNE.sap.snapTowardImpulse),
        TUNE.sap.snapMinVy + above * TUNE.sap.snapLiftBonus
      );
      rememberStride(Math.max(Math.abs(player.vx), 285));
      bumpCounter('sapSnaps');
      recordEvent('sap-snap', { vertical: S.round(player.vy, 1), toward: S.round(nx * TUNE.sap.snapTowardImpulse, 1) });
      announce('SAP SNAP', 0.38, 12);
      burst(player.x, player.y, 9, 'resin', 0.54);
      tone(470, 0.055, 0.028, 'triangle', 1.4);
    }
  }

  function releaseSap() {
    ensureAssistState();
    const sap = player.sap;
    if (!sap) {
      baseReleaseSap();
      return;
    }

    const age = sap.age || 0;
    const dy = sap.knot.y - player.y;
    const quick = Boolean(sap.snapEligible) && age <= TUNE.sap.quickWindow;
    const forward = Math.sign(player.vx || player.facing || 1);

    baseReleaseSap();
    if (dy > 0) player.vy = Math.max(player.vy, TUNE.sap.releaseFloorVy);
    if (!quick) {
      rememberStride();
      return;
    }

    player.vy = Math.max(player.vy, TUNE.sap.quickMinVy);
    player.vx += forward * TUNE.sap.quickForwardImpulse;
    player.vx = clamp(player.vx, -skillSpeedCap(), skillSpeedCap());
    player.airJumps = TUNE.jump.airJumps;
    rememberStride(Math.max(Math.abs(player.vx), 340));
    bumpCounter('quickSlings');
    S.addComboLink('SAP', 'QUICK SLING', 1, 0.12);
    recordEvent('sap-quick-sling', { seconds: S.round(age, 3), vx: S.round(player.vx, 1), vy: S.round(player.vy, 1) });
    announce('QUICK SLING · AIR KICK READY', 0.50, 13);
    burst(player.x, player.y, 12, 'resin', 0.70);
    tone(610, 0.065, 0.03, 'triangle', 1.48);
  }

  function towardWall(axis, side) {
    return (side === 'left' && axis < 0) || (side === 'right' && axis > 0);
  }

  function beginCling(side) {
    if (player.clingActive && player.clingSide === side) return;
    player.clingActive = true;
    player.clingTimer = TUNE.rebound.clingHold;
    player.clingSide = side;
    player.barkSide = side;
    player.barkGrace = Math.max(player.barkGrace, TUNE.rebound.clingGrace);
    bumpCounter('barkClings');
    recordEvent('bark-cling', { side });
    announce('BARK CLING · JUMP TO KICK', 0.34, 10);
    tone(185, 0.04, 0.018, 'triangle', 0.92);
  }

  function maintainCling(dt, axis) {
    if (!player.clingActive) return;
    player.clingTimer = Math.max(0, player.clingTimer - dt);
    if (player.clingTimer <= 0 || !towardWall(axis, player.clingSide) || player.sap || player.grounded) {
      player.clingActive = false;
      player.barkGrace = 0;
      return;
    }

    const edge = player.clingSide === 'left'
      ? state.LEFT_WALL + state.PLAYER_R + 2
      : state.RIGHT_WALL - state.PLAYER_R - 2;
    player.x = edge;
    player.vx = 0;
    player.vy = clamp(player.vy, -TUNE.rebound.clingFallCap, 80);
    player.state = 'wall-cling';
    player.barkGrace = Math.max(player.barkGrace, player.clingTimer);
  }

  function barkKick() {
    if (!player.clingActive || player.barkGrace <= 0 || player.grounded || player.sap) return false;
    const side = player.clingSide;
    const direction = side === 'left' ? 1 : -1;
    player.jumpHeld = true;
    player.vx = direction * TUNE.rebound.kickHorizontal;
    player.vy = Math.max(player.vy, TUNE.rebound.kickVertical);
    player.airJumps = TUNE.jump.airJumps;
    player.barkGrace = 0;
    player.clingTimer = 0;
    player.clingActive = false;
    player.wallRecovery = TUNE.run.wallRecoverySeconds;
    rememberStride(Math.max(Math.abs(player.vx), 410));
    bumpCounter('barkKicks');
    S.addComboLink('BARK', 'BARK KICK', 1, 0.10);
    recordEvent('bark-kick', { side, vx: S.round(player.vx, 1), vy: S.round(player.vy, 1) });
    announce('BARK KICK · AIR KICK READY', 0.48, 13);
    burst(player.x, player.y, 12, 'bark', 0.72);
    tone(330, 0.065, 0.03, 'square', 1.36);
    return true;
  }

  function requestJump() {
    ensureAssistState();
    if (barkKick()) return 0;
    return baseRequestJump();
  }

  function updateMomentumBurst(dt, axis) {
    if (!player.grounded || axis === 0) {
      player.runCharge = 0;
      player.runChargeDirection = axis;
      return;
    }
    if (axis !== player.runChargeDirection) {
      player.runCharge = 0;
      player.runChargeDirection = axis;
    }
    player.runCharge += dt;

    if (
      player.runCharge >= TUNE.run.burstChargeSeconds &&
      Math.abs(player.vx) >= TUNE.run.burstMinSpeed &&
      player.lastBurstBranch !== player.grounded
    ) {
      player.vx += axis * TUNE.run.burstImpulse;
      player.vx = clamp(player.vx, -skillSpeedCap(), skillSpeedCap());
      player.lastBurstBranch = player.grounded;
      rememberStride();
      bumpCounter('momentumBursts');
      recordEvent('momentum-burst', { vx: S.round(player.vx, 1), floor: player.grounded.floor });
      announce('MOMENTUM BURST', 0.30, 10);
      burst(player.x, player.y - state.PLAYER_R, 6, 'leaf', 0.42);
      tone(285, 0.045, 0.021, 'triangle', 1.18);
    }
  }

  function preUpdateStride(dt, axis) {
    rememberStride();
    const comboAccel = Math.min(TUNE.run.comboAccelCap, Math.max(0, player.combo) * TUNE.run.comboAccelPerLink);
    const hyperAccel = player.hyper ? TUNE.run.hyperAccelScale - 1 : 0;
    if (axis !== 0 && player.grounded && comboAccel + hyperAccel > 0) {
      player.vx += axis * TUNE.run.groundAccel * (comboAccel + hyperAccel) * dt;
    }
    if (axis !== 0 && player.wallRecovery > 0) player.vx += axis * TUNE.run.wallRecoveryAccel * dt;

    if (player.grounded && player.jumpBuffer > 0 && player.strideMomentum > Math.abs(player.vx) + 90) {
      const direction = axis || Math.sign(player.vx || player.facing || 1);
      const carried = Math.min(TUNE.run.strideMax, player.strideMomentum * TUNE.run.strideLaunchCarry);
      player.vx = direction * Math.max(Math.abs(player.vx), carried);
      bumpCounter('strideLaunchCarries');
      recordEvent('stride-launch-carry', { speed: S.round(carried, 1), combo: player.combo });
    }
    player.vx = clamp(player.vx, -skillSpeedCap(), skillSpeedCap());
  }

  function applyComboCarry(axis) {
    const telemetry = S.getTelemetry();
    const last = telemetry.events[telemetry.events.length - 1];
    const floors = last?.type === 'skip' ? Number(last.floors || 2) : 2;
    const direction = axis || Math.sign(player.vx || player.facing || 1);
    const impulse = Math.min(TUNE.run.comboCarryCap, TUNE.run.comboCarryBase + Math.max(0, floors - 2) * 5);
    player.vx += direction * impulse;
    player.vx = clamp(player.vx, -skillSpeedCap(), skillSpeedCap());
    rememberStride(Math.abs(player.vx));
    bumpCounter('comboCarries');
    recordEvent('combo-speed-carry', { combo: player.combo, floors, impulse, vx: S.round(player.vx, 1) });
  }

  function maybeEnterCrownvelocity() {
    if (player.hyper || player.combo <= 0) return;
    const variety = bitCount(player.comboKindsMask || 0);
    const pureFlowReady = player.combo >= TUNE.combo.easyHyperThreshold;
    const variedFlowReady = player.combo >= TUNE.combo.hyperVarietyThreshold && variety >= TUNE.combo.hyperVariety;
    if (!pureFlowReady && !variedFlowReady) return;

    player.hyper = true;
    player.hyperStartedAt = state.elapsed;
    player.airJumps = TUNE.jump.airJumps;
    player.strideMomentum = Math.max(player.strideMomentum || 0, 480);
    bumpCounter('crownvelocityEntries');
    recordEvent('crownvelocity-start', { combo: player.combo, variety, route: variedFlowReady && !pureFlowReady ? 'VARIED' : 'PURE_FLOW' });
    announce('CROWNVELOCITY', 0.86, 22);
    state.shake = Math.max(state.shake, 0.66);
    S.crownDrop();
  }

  function updateStrideMemory(dt, axis) {
    const speed = Math.abs(player.vx);
    if (speed >= player.strideMomentum) {
      player.strideMomentum = Math.min(TUNE.run.strideMax, speed);
      return;
    }
    let decay = TUNE.run.strideMemoryDecay;
    if (player.combo > 0) decay *= 0.65;
    if (player.sap) decay *= 0.55;
    if (player.clingActive) decay *= 0.35;
    if (player.grounded && axis === 0) decay *= 1.7;
    player.strideMomentum = Math.max(speed, player.strideMomentum - decay * dt);
  }

  function primeAllRouteGrammars() {
    S.generateUntil(7200);
  }

  function update(dt) {
    ensureAssistState();
    const axis = inputAxis();
    player.barkGrace = Math.max(0, player.barkGrace - dt);
    player.wallRecovery = Math.max(0, player.wallRecovery - dt);

    const telemetry = S.getTelemetry();
    const wallBefore = telemetry.counters.wallBounces;
    const skipsBefore = telemetry.counters.multiFloorSkips;

    preUpdateStride(dt, axis);
    baseUpdate(dt);

    if (telemetry.counters.wallBounces > wallBefore) {
      const side = player.x < W / 2 ? 'left' : 'right';
      player.barkSide = side;
      player.wallRecovery = 0;
      player.strideMomentum = Math.min(player.strideMomentum, Math.abs(player.vx) + 45);
      bumpCounter('passiveBarkRedirects');
      if (towardWall(axis, side)) beginCling(side);
      else player.barkGrace = 0;
    }

    maintainCling(dt, axis);
    if (telemetry.counters.multiFloorSkips > skipsBefore) applyComboCarry(axis);
    maybeEnterCrownvelocity();
    updateMomentumBurst(dt, axis);
    updateStrideMemory(dt, axis);
    player.vx = clamp(player.vx, -skillSpeedCap(), skillSpeedCap());
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetAssist();
    primeAllRouteGrammars();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetAssist();
    primeAllRouteGrammars();
    return result;
  }

  S.attachSap = attachSap;
  S.releaseSap = releaseSap;
  S.requestJump = requestJump;
  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.flowAssist = {
    reset: resetAssist,
    getState: () => ({
      barkGrace: player.barkGrace || 0,
      barkSide: player.barkSide || '',
      clingActive: Boolean(player.clingActive),
      clingTimer: player.clingTimer || 0,
      clingSide: player.clingSide || '',
      runCharge: player.runCharge || 0,
      burstFloor: player.lastBurstBranch?.floor ?? null,
      strideMomentum: player.strideMomentum || 0,
      wallRecovery: player.wallRecovery || 0,
      skillSpeedCap: skillSpeedCap(),
    }),
  };
})();
