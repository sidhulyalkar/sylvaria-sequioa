(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.pressSapStick || !S?.releaseSapStick || !S?.sapStick || !S?.update) return;

  const { state, player, TUNE, clamp, announce, recordEvent, tone } = S;
  const basePress = S.pressSapStick;
  const baseRelease = S.releaseSapStick;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const baseSapState = S.sapStick.getState;

  const VERSION = 'nearest-sap-authority-v3';
  const MIN_GROUNDED_REARM_SECONDS = 0.035;
  const MAX_ATTACH_VX_GAIN = 95;
  const MAX_ATTACH_VY_GAIN = 120;
  const MAX_RELEASE_VX_GAIN = 105;
  const MAX_RELEASE_VY_GAIN = 145;
  const MAX_TETHER_SPEED_GAIN = 120;
  const MIN_TETHER_SPEED_CAP = 220;
  const POST_RELEASE_SPEED_ALLOWANCE = 65;
  const BLOCK_NOTICE_SECONDS = 0.36;

  // Sap is a redirect/bridge, not a rocket. The exact target is selected at the
  // press edge, and the tether is allowed to reshape player-authored velocity but
  // not mint an unbounded amount of new kinetic energy.
  Object.assign(TUNE.sap, {
    stickAcquireBufferSeconds: 0,
    stickRange: Math.min(TUNE.sap.stickRange, 525),
    stickMaxBelow: Math.min(TUNE.sap.stickMaxBelow, 28),
    stickMaxAbove: Math.min(TUNE.sap.stickMaxAbove, 340),
    stickPullImpulse: 72,
    stickTangentBoost: 78,
    stickMinVy: 95,
    stickReleaseMinVy: 125,
    stickReleaseForward: 58,
    stickReleaseSpeedCap: Math.min(TUNE.sap.stickReleaseSpeedCap, 735),
    stickRescueBonus: 54,
    stickAnchorPriority: 0,
    releaseStretchGain: Math.min(TUNE.sap.releaseStretchGain, 0.72),
    releaseCap: Math.min(TUNE.sap.releaseCap, 118),
    releaseUpFraction: Math.min(TUNE.sap.releaseUpFraction, 0.18),
  });

  let armed = true;
  let spentAtFloor = -1;
  let highestPhysicalFloor = 0;
  let lastGroundedBranch = null;
  let activeLeaseId = '';
  let activeLeaseKnot = null;
  let blockedPresses = 0;
  let nearestSelections = 0;
  let nodeUses = 0;
  let recharges = 0;
  let noticeCooldown = 0;
  let releaseBaseline = null;
  let leaseEntrySpeed = 0;
  let leaseSpeedCap = 0;
  let energyClamps = 0;
  const usedAnchorIds = new Set();

  function bumpCounter(name) {
    const counters = S.getTelemetry().counters;
    counters[name] = (counters[name] || 0) + 1;
  }

  // Identity is authored topology, never presentation/physics state. Moving
  // Pendulum/Skyheart anchors can change x/y every frame without becoming a new
  // authority node. These four fields are assigned when the route step is born
  // and remain stable for that knot's lifetime.
  function anchorId(knot) {
    return [
      String(knot?.chunkId || 'route'),
      String(Number(knot?.floor) || 0),
      String(knot?.role || 'anchor'),
      String(knot?.anchorKind || 'unknown'),
    ].join(':');
  }

  function isAuthoredAnchor(knot) {
    return knot?.anchorKind === 'sap-stick';
  }

  function eligibleAnchor(knot) {
    if (!isAuthoredAnchor(knot)) return false;
    const id = anchorId(knot);
    if (usedAnchorIds.has(id)) return false;
    if ((Number(knot.floor) || 0) <= highestPhysicalFloor) return false;

    const dx = knot.x - player.x;
    const dy = knot.y - player.y;
    if (dy < -TUNE.sap.stickMaxBelow || dy > TUNE.sap.stickMaxAbove) return false;
    const distance = Math.hypot(dx, dy);
    return distance >= TUNE.sap.stickMinDistance && distance <= TUNE.sap.stickRange;
  }

  function nearestEligibleAnchor() {
    if (!armed || state.mode !== 'playing') return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const knot of state.knots) {
      if (!eligibleAnchor(knot)) continue;
      const distance = Math.hypot(knot.x - player.x, knot.y - player.y);
      if (distance < nearestDistance - 0.0001) {
        nearest = knot;
        nearestDistance = distance;
      } else if (nearest && Math.abs(distance - nearestDistance) <= 0.0001 && knot.floor < nearest.floor) {
        nearest = knot;
      }
    }
    return nearest;
  }

  function withOnlyTarget(target, fn) {
    const original = state.knots.slice();
    state.knots.splice(0, state.knots.length, target);
    try {
      return fn();
    } finally {
      state.knots.splice(0, state.knots.length, ...original);
    }
  }

  function capAttachImpulse(before) {
    player.vx = before.vx + clamp(player.vx - before.vx, -MAX_ATTACH_VX_GAIN, MAX_ATTACH_VX_GAIN);
    player.vy = before.vy + clamp(player.vy - before.vy, -MAX_ATTACH_VY_GAIN, MAX_ATTACH_VY_GAIN);
  }

  function capReleaseImpulse(before) {
    if (!before) return;
    player.vx = before.vx + clamp(player.vx - before.vx, -MAX_RELEASE_VX_GAIN, MAX_RELEASE_VX_GAIN);
    player.vy = before.vy + clamp(player.vy - before.vy, -MAX_RELEASE_VY_GAIN, MAX_RELEASE_VY_GAIN);
  }

  function capSpeed(limit) {
    if (!(limit > 0)) return false;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed <= limit || speed <= 0.001) return false;
    const scale = limit / speed;
    player.vx *= scale;
    player.vy *= scale;
    energyClamps += 1;
    bumpCounter('sapAuthorityEnergyClamps');
    return true;
  }

  function block(reason) {
    blockedPresses += 1;
    bumpCounter('sapAuthorityBlockedPresses');
    if (noticeCooldown <= 0) {
      noticeCooldown = BLOCK_NOTICE_SECONDS;
      announce(reason === 'SPENT' ? 'SAP SPENT · LAND HIGHER' : 'NO SAP NODE IN RANGE', 0.30, 10);
      tone(112, 0.025, 0.01, 'square', 0.8);
    }
    recordEvent('sap-authority-blocked', {
      reason,
      spentAtFloor,
      highestPhysicalFloor,
      blockedPresses,
    });
    return false;
  }

  function rejectUnexpectedAttach(reason, restoreVelocity = null) {
    baseRelease('AUTHORITY_REJECT');
    player.sap = null;
    if (restoreVelocity) {
      player.vx = restoreVelocity.vx;
      player.vy = restoreVelocity.vy;
    }
    activeLeaseId = '';
    activeLeaseKnot = null;
    releaseBaseline = null;
    bumpCounter('sapAuthorityRejectedAttaches');
    recordEvent('sap-authority-rejected-attach', { reason });
  }

  function pressSapStick() {
    if (state.mode !== 'playing') return false;
    if (player.sap?.stickMode) return true;
    if (!armed) return block('SPENT');

    const target = nearestEligibleAnchor();
    if (!target) return block('NO_TARGET');

    const before = { vx: player.vx, vy: player.vy };
    const attached = Boolean(withOnlyTarget(target, () => basePress()));
    if (!attached || !player.sap?.stickMode) return false;

    capAttachImpulse(before);
    leaseEntrySpeed = Math.hypot(before.vx, before.vy);
    leaseSpeedCap = Math.min(TUNE.sap.stickReleaseSpeedCap, Math.max(MIN_TETHER_SPEED_CAP, leaseEntrySpeed + MAX_TETHER_SPEED_GAIN));
    capSpeed(leaseSpeedCap);

    const id = anchorId(target);
    usedAnchorIds.add(id);
    activeLeaseId = id;
    activeLeaseKnot = target;
    armed = false;
    spentAtFloor = highestPhysicalFloor;
    nodeUses += 1;
    nearestSelections += 1;
    bumpCounter('nearestSapSelections');
    bumpCounter('sapAuthorityUses');
    recordEvent('sap-authority-acquired', {
      id,
      floor: target.floor,
      distance: S.round(Math.hypot(target.x - player.x, target.y - player.y), 1),
      spentAtFloor,
      entrySpeed: S.round(leaseEntrySpeed, 1),
      speedCap: S.round(leaseSpeedCap, 1),
      vx: S.round(player.vx, 1),
      vy: S.round(player.vy, 1),
    });
    return true;
  }

  function finishLeaseRelease(before) {
    capReleaseImpulse(before);
    capSpeed(leaseSpeedCap + POST_RELEASE_SPEED_ALLOWANCE);
    releaseBaseline = null;
    activeLeaseId = '';
    activeLeaseKnot = null;
  }

  function releaseSapStick(reason = 'SHIFT_RELEASE') {
    if (!player.sap?.stickMode) return false;
    releaseBaseline = { vx: player.vx, vy: player.vy };
    const released = Boolean(baseRelease(reason));
    if (!player.sap?.stickMode) finishLeaseRelease(releaseBaseline);
    return released;
  }

  function observeGrounding() {
    const branch = player.grounded;
    if (!branch) {
      lastGroundedBranch = null;
      return;
    }

    // A collision graze is not a physical landing. Do not advance either the
    // eligibility floor or the recharge floor until the branch has actually held
    // Pip for the minimum grounded interval. Keeping lastGroundedBranch unset here
    // lets the same branch become authoritative once the hold matures.
    if (player.groundedTime < MIN_GROUNDED_REARM_SECONDS) return;
    if (branch === lastGroundedBranch) return;
    lastGroundedBranch = branch;

    const floor = Number(branch.floor) || 0;
    if (floor > highestPhysicalFloor) highestPhysicalFloor = floor;
    if (armed || floor <= spentAtFloor) return;

    armed = true;
    recharges += 1;
    bumpCounter('sapAuthorityRecharges');
    recordEvent('sap-authority-recharged', {
      floor,
      recharges,
      groundedSeconds: S.round(player.groundedTime, 3),
    });
    announce('SAP READY', 0.34, 10);
  }

  function update(dt) {
    noticeCooldown = Math.max(0, noticeCooldown - dt);
    const wasActive = Boolean(player.sap?.stickMode);
    const leaseBefore = activeLeaseId;
    const velocityBeforeUpdate = { vx: player.vx, vy: player.vy };
    let leaseRejected = false;
    baseUpdate(dt);
    const isActive = Boolean(player.sap?.stickMode);

    if (!wasActive && isActive && !activeLeaseId) {
      rejectUnexpectedAttach('NO_LEASE', velocityBeforeUpdate);
      leaseRejected = true;
    } else if (isActive && activeLeaseId) {
      const attachedKnot = player.sap?.knot || null;
      if (!attachedKnot || attachedKnot !== activeLeaseKnot || anchorId(attachedKnot) !== activeLeaseId) {
        rejectUnexpectedAttach('LEASE_NODE_MISMATCH', velocityBeforeUpdate);
        leaseRejected = true;
      } else {
        // Steering can rotate/shape the swing, but repeated fixed updates cannot
        // pump the tether above the bounded energy budget granted on acquisition.
        capSpeed(leaseSpeedCap);
      }
    }

    if (!leaseRejected && wasActive && !player.sap?.stickMode && leaseBefore) {
      finishLeaseRelease(releaseBaseline || velocityBeforeUpdate);
    }

    observeGrounding();
  }

  function resetAuthority() {
    armed = true;
    spentAtFloor = -1;
    highestPhysicalFloor = Number(player.grounded?.floor) || 0;
    lastGroundedBranch = player.grounded || null;
    activeLeaseId = '';
    activeLeaseKnot = null;
    blockedPresses = 0;
    nearestSelections = 0;
    nodeUses = 0;
    recharges = 0;
    noticeCooldown = 0;
    releaseBaseline = null;
    leaseEntrySpeed = 0;
    leaseSpeedCap = 0;
    energyClamps = 0;
    usedAnchorIds.clear();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetAuthority();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetAuthority();
    return result;
  }

  function getState() {
    const nearest = nearestEligibleAnchor();
    return {
      version: VERSION,
      armed,
      needsHigherLog: !armed,
      spentAtFloor,
      highestPhysicalFloor,
      activeLeaseId: activeLeaseId || null,
      usedAnchors: usedAnchorIds.size,
      blockedPresses,
      nearestSelections,
      nodeUses,
      recharges,
      energyClamps,
      leaseEntrySpeed: S.round(leaseEntrySpeed, 1),
      leaseSpeedCap: S.round(leaseSpeedCap, 1),
      nearestTarget: nearest ? {
        id: anchorId(nearest),
        floor: nearest.floor,
        x: nearest.x,
        y: nearest.y,
        distance: S.round(Math.hypot(nearest.x - player.x, nearest.y - player.y), 1),
      } : null,
      pressTimeAcquisition: true,
      immutableAnchorIdentity: true,
      anchorIdentityFields: ['chunkId', 'floor', 'role', 'anchorKind'],
      bufferedAcquisitionSeconds: TUNE.sap.stickAcquireBufferSeconds,
      minimumGroundedRearmSeconds: MIN_GROUNDED_REARM_SECONDS,
      maxAttachVelocityGain: { x: MAX_ATTACH_VX_GAIN, y: MAX_ATTACH_VY_GAIN },
      maxReleaseVelocityGain: { x: MAX_RELEASE_VX_GAIN, y: MAX_RELEASE_VY_GAIN },
      maxTetherSpeedGain: MAX_TETHER_SPEED_GAIN,
      useInvariant: nodeUses <= recharges + 1,
    };
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.pressSapStick = pressSapStick;
  S.castSapStick = pressSapStick;
  S.releaseSapStick = releaseSapStick;
  S.sapAuthority = { version: VERSION, getState, getTargetPreview: nearestEligibleAnchor };
  S.sapStick.cast = pressSapStick;
  S.sapStick.press = pressSapStick;
  S.sapStick.release = releaseSapStick;
  S.sapStick.getTargetPreview = nearestEligibleAnchor;
  S.sapStick.getState = () => ({
    ...baseSapState(),
    authority: getState(),
    ready: armed,
    needsHigherLog: !armed,
  });
})();