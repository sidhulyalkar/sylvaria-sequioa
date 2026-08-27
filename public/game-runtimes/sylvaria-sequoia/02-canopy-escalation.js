(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.ROUTE_GRAMMARS || !S?.PHASES) return;

  const { state, player, TUNE, clamp, lerp, recordEvent } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const VERSION = 'canopy-escalation-v1';

  // Difficulty should become richer, not merely faster. Later altitude introduces
  // wider open-air reads, more alternating Sap lines and a visible deterministic
  // crosswind. The first phase remains deliberately calm so the player learns the
  // movement grammar before the forest starts pushing back.
  Object.assign(S.ROUTE_GRAMMARS, {
    WINDLINE: [
      { dy: 76, side: 'same', length: 340, knot: 'center', launch: true },
      { dy: 166, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 174, side: 'same', branch: false, anchor: 'cross' },
      { dy: 112, side: 'swap', length: 260, knot: 'cross', ring: 'lane' },
    ],
    SKYHOOK: [
      { dy: 78, side: 'center', length: 310, launch: true },
      { dy: 172, side: 'left', branch: false, anchor: 'right' },
      { dy: 178, side: 'right', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 168, side: 'center', branch: false, anchor: 'center' },
      { dy: 118, side: 'swap', length: 248, knot: 'cross' },
    ],
    CROWNWEAVE: [
      { dy: 84, side: 'same', length: 285, knot: 'cross' },
      { dy: 176, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 170, side: 'same', branch: false, anchor: 'cross' },
      { dy: 178, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 110, side: 'center', length: 236, knot: 'center', ring: 'crown' },
    ],
  });

  const phase = (name) => S.PHASES.find((entry) => entry.name === name);
  const redwood = phase('REDWOOD RUN');
  const sapwork = phase('SAPWORK');
  const high = phase('HIGH CANOPY');
  const crown = phase('CROWNLINE');

  if (redwood) {
    redwood.geometry = Math.max(redwood.geometry, 0.26);
    redwood.sequence = ['FLOW', 'GROVE', 'SAPRUN', 'WINDLINE', 'RECOVERY', 'SLINGSHOT', 'CRUX'];
  }
  if (sapwork) {
    sapwork.geometry = Math.max(sapwork.geometry, 0.52);
    sapwork.pressure = Math.max(sapwork.pressure, 1.04);
    sapwork.sequence = ['SAPRUN', 'WINDLINE', 'GROVE', 'SKYHOOK', 'SLINGSHOT', 'CRUX', 'RECOVERY'];
  }
  if (high) {
    high.geometry = Math.max(high.geometry, 0.82);
    high.pressure = Math.max(high.pressure, 1.17);
    high.sequence = ['WINDLINE', 'SKYHOOK', 'CRUX', 'SAPRUN', 'CROWNWEAVE', 'GROVE', 'SLINGSHOT', 'RECOVERY'];
  }
  if (crown) {
    crown.geometry = Math.max(crown.geometry, 1.08);
    crown.pressure = Math.max(crown.pressure, 1.34);
    crown.sequence = ['CROWNWEAVE', 'SKYHOOK', 'CRUX', 'WINDLINE', 'SAPRUN', 'CROWNWEAVE', 'SLINGSHOT'];
  }

  let gust = 0;
  let previousGustSign = 0;
  let exposureSeconds = 0;
  let reversalCount = 0;

  function windIntensityForFloor(floor) {
    if (floor < 46) return 0;
    if (floor < 70) return lerp(0, 0.16, (floor - 46) / 24);
    if (floor < 115) return lerp(0.16, 0.38, (floor - 70) / 45);
    if (floor < 165) return lerp(0.38, 0.68, (floor - 115) / 50);
    return clamp(lerp(0.68, 1, (floor - 165) / 100), 0.68, 1);
  }

  function windAcceleration(time, floor) {
    const intensity = windIntensityForFloor(floor);
    if (intensity <= 0) return 0;
    const seedPhase = (state.runSeed % 997) * 0.01317;
    const altitudePhase = floor * 0.021;
    const broad = Math.sin(time * (0.41 + intensity * 0.09) + seedPhase + altitudePhase);
    const pulse = Math.sin(time * 1.17 + seedPhase * 0.47 - altitudePhase * 1.8);
    const flutter = Math.sin(time * 2.43 + seedPhase * 0.23 + floor * 0.071);
    const shape = broad * 0.64 + pulse * 0.27 + flutter * 0.09;
    return shape * lerp(72, 520, intensity);
  }

  function inputAxis() {
    let axis = 0;
    if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) axis -= 1;
    if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) axis += 1;
    return clamp(axis, -1, 1);
  }

  function applyWind(dt) {
    const intensity = windIntensityForFloor(player.highestFloor);
    gust = windAcceleration(state.elapsed, player.highestFloor);
    state.canopyWind = {
      version: VERSION,
      gust,
      intensity,
      direction: Math.sign(gust),
    };
    if (intensity <= 0 || state.mode !== 'playing') return;

    const tethered = Boolean(player.sap?.stickMode);
    const grounded = Boolean(player.grounded);
    const stall = grounded && player.groundedTime > lerp(0.95, 0.52, intensity);
    const authority = tethered ? 0.22 : grounded ? (stall ? 0.26 : 0.06) : 1;
    const correction = inputAxis() && Math.sign(inputAxis()) === -Math.sign(gust) ? 0.84 : 1;
    player.vx += gust * authority * correction * dt;

    const earnedCap = TUNE.run.maxSpeed + 135 + Math.min(145, Math.max(0, player.combo) * 7);
    player.vx = clamp(player.vx, -earnedCap, earnedCap);

    if (!grounded) exposureSeconds += dt;
    const sign = Math.abs(gust) > 48 ? Math.sign(gust) : 0;
    if (sign && previousGustSign && sign !== previousGustSign) {
      reversalCount += 1;
      const telemetry = S.getTelemetry();
      telemetry.counters.windReversals = (telemetry.counters.windReversals || 0) + 1;
      recordEvent('canopy-wind-reversal', {
        floor: player.highestFloor,
        gust: S.round(gust, 1),
        intensity: S.round(intensity, 3),
      });
    }
    if (sign) previousGustSign = sign;

    const telemetry = S.getTelemetry();
    telemetry.time.windExposure = (telemetry.time.windExposure || 0) + (!grounded ? dt : 0);
    telemetry.maxima.wind = Math.max(telemetry.maxima.wind || 0, Math.abs(gust));
  }

  function resetEscalation() {
    gust = 0;
    previousGustSign = 0;
    exposureSeconds = 0;
    reversalCount = 0;
    state.canopyWind = { version: VERSION, gust: 0, intensity: 0, direction: 0 };
  }

  function update(dt) {
    baseUpdate(dt);
    applyWind(dt);
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetEscalation();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetEscalation();
    return result;
  }

  resetEscalation();
  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.canopyEscalation = {
    version: VERSION,
    getState: () => ({
      gust,
      intensity: windIntensityForFloor(player.highestFloor),
      exposureSeconds,
      reversalCount,
      phase: S.phaseForFloor(player.highestFloor).name,
      lateRouteFamilies: ['WINDLINE', 'SKYHOOK', 'CROWNWEAVE'],
    }),
  };
})();
