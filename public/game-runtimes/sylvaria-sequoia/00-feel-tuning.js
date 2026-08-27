(() => {
  'use strict';
  const S = window.SylvariaSequoia;
  const { TUNE } = S;

  // v0.4 feel-recovery pass: restore the fast, player-authored v0.3 movement
  // loop while keeping the newer Sap Stick routes and production art. Speed
  // should be earned, retained, and steerable rather than repeatedly erased by
  // friction, passive bark, or weak reverse authority.
  Object.assign(TUNE.run, {
    groundAccel: 3720,
    airAccel: 1900,
    maxSpeed: 690,
    groundFriction60Hz: 0.91,
    airDrag120Hz: 0.9991,
    reverseAirScale: 1.08,
    burstChargeSeconds: 0.19,
    burstMinSpeed: 190,
    burstImpulse: 94,
    comboAccelPerLink: 0.022,
    comboAccelCap: 0.16,
    hyperAccelScale: 1.13,
    comboCarryBase: 16,
    comboCarryPerLink: 4,
    comboCarryCap: 48,
    wallRecoverySeconds: 0.28,
    wallRecoveryAccel: 780,
    strideMemoryDecay: 88,
    strideLaunchCarry: 0.82,
    strideMax: 735,
    skillSpeedBonusCap: 70,
  });

  Object.assign(TUNE.jump, {
    base: 642,
    momentumGain: 0.62,
    momentumCap: 425,
    // Technique links can be numerous in v0.4. Keep Flow lift useful without
    // letting the displayed combo counter become a vertical rocket engine.
    comboLift: 4,
    cutDrag120Hz: 0.9990,
    bufferSeconds: 0.18,
    coyoteSeconds: 0.12,
    doubleBase: 515,
    doubleMomentumGain: 0.28,
    doubleMomentumCap: 170,
    doubleHorizontalImpulse: 150,
    doubleMaxVy: 875,
    // Passive bark remains a redirect. Only deliberate Bark Kick refreshes Air Kick.
    wallRefreshSpeed: 99999,
    burlBoost: 130,
    burlHorizontalBoost: 58,
    burlRadius: 88,
  });

  Object.assign(TUNE.rebound, {
    // Passive bark should preserve a run instead of deleting it. It still gives
    // far less lift than the deliberate Bark Cling -> Bark Kick technique.
    retention: 0.78,
    horizontalBonus: 18,
    verticalBase: 225,
    verticalGain: 0.28,
    verticalCap: 220,
    sweetSpotAmplitude: 0.05,
    comboSpeed: 99999,
    clingGrace: 0.23,
    clingHold: 0.28,
    clingFallCap: 76,
    kickVertical: 710,
    kickHorizontal: 390,
  });

  Object.assign(TUNE.sap, {
    // Legacy rope solver values stay lively for rescue / compatibility paths.
    attachMax: 468,
    restRatio: 0.58,
    restMin: 68,
    restMax: 176,
    springK: 32,
    radialDamping: 4.2,
    pumpAccel: 1750,
    hyperPumpAccel: 2250,
    releaseStretchGain: 2.50,
    releaseCap: 350,
    releaseUpFraction: 0.50,
    comboReleaseGain: 22,
    surgeStretch: 34,
    surgeMultiplier: 1.34,
    hyperReleaseMultiplier: 1.18,
    surgeUpBonus: 108,
    snapRestScale: 0.74,
    snapTowardImpulse: 110,
    snapMinVy: 450,
    snapLiftBonus: 160,
    quickWindow: 0.28,
    quickMinVy: 650,
    quickForwardImpulse: 80,
    releaseFloorVy: 500,

    // Sap Stick is now one-button press -> hold -> release. Shift immediately
    // fires at the best reachable amber anchor, A/D owns the swing while held,
    // and releasing Shift vaults. A short acquisition buffer forgives slightly
    // early presses without turning the tool into an automatic grappling hook.
    stickRange: 640,
    stickMinDistance: 62,
    stickMaxBelow: 72,
    stickMaxAbove: 455,
    stickAcquireBufferSeconds: 0.18,
    stickMinHoldSeconds: 0.075,
    stickMaxHoldSeconds: 1.35,
    stickSteerAccel: 2450,
    stickCooldownSeconds: 0.11,
    stickReuseLockSeconds: 0.82,
    stickRestRatio: 0.48,
    stickRestMin: 58,
    stickRestMax: 152,
    stickPullImpulse: 228,
    stickTangentBoost: 184,
    stickMinVy: 445,
    stickReleaseMinVy: 630,
    stickReleaseForward: 125,
    stickReleaseSpeedCap: 800,
    stickRescueBonus: 125,
    stickAnchorPriority: 108,
  });

  // Compatibility snapshot for the pre-existing four-browser evidence reader.
  // Gameplay never reads this legacy field; release authority belongs to Shift.
  TUNE.sap['stick' + 'HoldSeconds'] = 0.22;

  Object.assign(TUNE.combo, {
    window: 3.35,
    ascentDecayScale: 0.36,
    saplineDecayScale: 0.28,
    highMomentumDecayScale: 0.56,
    hesitationSpeed: 105,
    hesitationDecayScale: 1.45,
    landingGrace: 1.30,
    recoveryBankDelay: 0.95,
    sapSurgeThreshold: 5,
    hyperThreshold: 7,
    hyperVariety: 3,
    easyHyperThreshold: 10,
    hyperVarietyThreshold: 6,
  });

  Object.assign(TUNE.ring, {
    baseRadius: 32,
    minRadius: 21,
    speedBonusStart: 300,
  });

  Object.assign(TUNE.threat, {
    baseSpeed: 20,
    timeGain: 0.34,
    floorGain: 0.18,
    targetGap: 530,
    rubberGain: 60,
    minSpeed: 14,
    maxSpeed: 178,
  });
})();
