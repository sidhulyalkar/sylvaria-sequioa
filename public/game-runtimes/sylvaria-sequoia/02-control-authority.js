(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update) return;

  const { state, player, TUNE, clamp } = S;
  const baseUpdate = S.update;
  const CONTROL_VERSION = 'velocity-authority-v2';

  const CONTROL = {
    groundReverseAssist: 1120,
    airReverseAssist: 920,
    reverseDeadzone: 38,
    strideTriggerMargin: 90,
  };

  let strideHeightCarries = 0;
  let preventedDirectionSnaps = 0;
  let groundReverseSeconds = 0;
  let airReverseSeconds = 0;
  let maxAddedLaunchVy = 0;

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

  function velocityCap() {
    const flowBonus = Math.min(TUNE.run.skillSpeedBonusCap || 0, Math.max(0, player.combo - 1) * 4);
    return TUNE.run.maxSpeed + flowBonus + (player.hyper ? 42 : 0);
  }

  function sign(value) {
    return Math.abs(value) < 0.0001 ? 0 : Math.sign(value);
  }

  function prepareStrideHeightCarry(before) {
    if (!before.grounded || !before.jumpBuffered) return null;
    if (before.stride <= Math.abs(before.vx) + CONTROL.strideTriggerMargin) return null;

    const rememberedSpeed = Math.min(TUNE.run.strideMax, before.stride) * TUNE.run.strideLaunchCarry;
    const currentSpeed = Math.abs(before.vx);
    const currentMomentum = Math.min(TUNE.jump.momentumCap, currentSpeed * TUNE.jump.momentumGain);
    const rememberedMomentum = Math.min(TUNE.jump.momentumCap, rememberedSpeed * TUNE.jump.momentumGain);
    const addedVy = Math.max(0, rememberedMomentum - currentMomentum);
    if (addedVy <= 0) return null;

    // 02-flow-assist historically preserved Stride by rewriting vx before the
    // ground jump. Suppress that branch for this one simulation step. The
    // vertical energy is restored after the authoritative update below, so
    // Stride still rewards a successful run without owning left/right movement.
    player.strideMomentum = currentSpeed + CONTROL.strideTriggerMargin - 1;
    return {
      addedVy,
      rememberedStride: before.stride,
      beforeVx: before.vx,
    };
  }

  function restoreStrideHeightCarry(plan, dt) {
    if (!plan) return;

    const launched = !player.grounded && player.vy > 0;
    const naturalDecay = Math.max(0, plan.rememberedStride - TUNE.run.strideMemoryDecay * dt);
    player.strideMomentum = Math.max(player.strideMomentum || 0, naturalDecay);
    if (!launched) return;

    player.vy += plan.addedVy;
    strideHeightCarries += 1;
    maxAddedLaunchVy = Math.max(maxAddedLaunchVy, plan.addedVy);

    const flippedAcrossZero = sign(plan.beforeVx) !== 0 && sign(player.vx) !== 0 && sign(plan.beforeVx) !== sign(player.vx);
    if (flippedAcrossZero) preventedDirectionSnaps += 1;

    S.recordEvent?.('stride-height-carry', {
      rememberedStride: S.round?.(plan.rememberedStride, 1) ?? plan.rememberedStride,
      addedVy: S.round?.(plan.addedVy, 1) ?? plan.addedVy,
      vx: S.round?.(player.vx, 1) ?? player.vx,
    });
  }

  function applyReverseAuthority(axis, dt) {
    if (axis === 0 || Math.abs(player.vx) < CONTROL.reverseDeadzone) return;
    if (sign(player.vx) === axis) return;

    // Opposite input is a deliberate brake. It gets extra authority only while
    // velocity still points the other way, which makes corrections crisp without
    // inflating ordinary forward acceleration or changing the base speed cap.
    const grounded = Boolean(player.grounded);
    const assist = grounded ? CONTROL.groundReverseAssist : CONTROL.airReverseAssist;
    player.vx += axis * assist * dt;
    player.vx = clamp(player.vx, -velocityCap(), velocityCap());
    if (grounded) groundReverseSeconds += dt;
    else airReverseSeconds += dt;
  }

  function update(dt) {
    const axis = inputAxis();
    const before = {
      vx: player.vx,
      grounded: Boolean(player.grounded),
      jumpBuffered: player.jumpBuffer > 0,
      stride: player.strideMomentum || 0,
    };
    const stridePlan = prepareStrideHeightCarry(before);

    baseUpdate(dt);
    if (state.mode !== 'playing') return;

    restoreStrideHeightCarry(stridePlan, dt);
    applyReverseAuthority(axis, dt);
  }

  S.update = update;
  S.controlAuthority = {
    version: CONTROL_VERSION,
    model: 'player-owned horizontal velocity; Stride carries vertical opportunity only',
    getState: () => ({
      strideHeightCarries,
      preventedDirectionSnaps,
      groundReverseSeconds,
      airReverseSeconds,
      maxAddedLaunchVy,
      reverseDeadzone: CONTROL.reverseDeadzone,
      groundReverseAssist: CONTROL.groundReverseAssist,
      airReverseAssist: CONTROL.airReverseAssist,
    }),
  };
})();
