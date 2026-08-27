(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.ROUTE_GRAMMARS || !S?.PHASES) return;

  const { state, player, W, clamp, lerp, announce, recordEvent, tone, burst } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const VERSION = 'canopy-trials-v1';

  // Difficulty is introduced as new verbs and reads, not simply smaller ledges.
  // Each family spotlights one mechanic so late runs feel authored even though the
  // route remains seeded and endless.
  Object.assign(S.ROUTE_GRAMMARS, {
    BREAKAWAY: [
      { dy: 72, side: 'center', length: 405, launch: true },
      { dy: 98, side: 'left', length: 250, ring: 'lane' },
      { dy: 104, side: 'right', length: 238, knot: 'cross' },
      { dy: 112, side: 'center', length: 226, ring: 'crown' },
    ],
    PENDULUM: [
      { dy: 76, side: 'center', length: 305, launch: true, knot: 'center' },
      { dy: 158, side: 'left', branch: false, anchor: 'right' },
      { dy: 170, side: 'right', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 166, side: 'left', branch: false, anchor: 'right' },
      { dy: 116, side: 'center', length: 242, knot: 'cross' },
    ],
    CONEFALL: [
      { dy: 70, side: 'center', length: 390, launch: true },
      { dy: 112, side: 'same', length: 270, ring: 'lane' },
      { dy: 124, side: 'swap', length: 252, knot: 'cross' },
      { dy: 128, side: 'same', length: 246, ring: 'lane' },
      { dy: 116, side: 'center', length: 280, knot: 'center' },
    ],
    THUNDERCROWN: [
      { dy: 82, side: 'same', length: 270, knot: 'cross', launch: true },
      { dy: 180, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 184, side: 'same', branch: false, anchor: 'cross' },
      { dy: 174, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 122, side: 'center', length: 218, knot: 'center', ring: 'crown' },
    ],
  });

  const phase = (name) => S.PHASES.find((entry) => entry.name === name);
  const redwood = phase('REDWOOD RUN');
  const sapwork = phase('SAPWORK');
  const high = phase('HIGH CANOPY');
  const crown = phase('CROWNLINE');
  if (redwood) redwood.sequence = ['FLOW', 'BREAKAWAY', 'GROVE', 'SAPRUN', 'WINDLINE', 'RECOVERY', 'SLINGSHOT', 'CRUX'];
  if (sapwork) sapwork.sequence = ['SAPRUN', 'WINDLINE', 'BREAKAWAY', 'GROVE', 'PENDULUM', 'SKYHOOK', 'SLINGSHOT', 'CRUX', 'RECOVERY'];
  if (high) high.sequence = ['WINDLINE', 'CONEFALL', 'SKYHOOK', 'PENDULUM', 'CRUX', 'SAPRUN', 'CROWNWEAVE', 'GROVE', 'SLINGSHOT', 'RECOVERY'];
  if (crown) crown.sequence = ['THUNDERCROWN', 'CROWNWEAVE', 'CONEFALL', 'SKYHOOK', 'PENDULUM', 'CRUX', 'WINDLINE', 'SAPRUN', 'CROWNWEAVE'];

  const fallingFragments = [];
  const cones = [];
  let runSerial = 0;
  let nextConeAt = 0;
  let coneIndex = 0;
  let lastRouteId = '';
  let coneHitCooldown = 0;

  function hash01(floor, salt = 0) {
    let value = (state.runSeed ^ Math.imul(floor + 53 + salt * 29, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function altitudeDifficulty(floor = player.highestFloor) {
    return clamp((floor - 70) / 190, 0, 1);
  }

  function isTrialRoute(type) {
    return type === 'BREAKAWAY' || type === 'PENDULUM' || type === 'CONEFALL' || type === 'THUNDERCROWN';
  }

  function decorateBranch(branch) {
    if (branch._trialSerial === runSerial) return;
    branch._trialSerial = runSerial;
    branch._trialFragile = false;
    branch._trialBreaking = false;
    branch._trialBreakAt = 0;
    branch._trialBreakDuration = 0;

    if (branch.floor < 76 || branch.chunkType === 'RECOVERY' || branch.floor === 0) return;
    const difficulty = altitudeDifficulty(branch.floor);
    const forced = branch.chunkType === 'BREAKAWAY' || branch.chunkType === 'THUNDERCROWN';
    const density = lerp(0.10, 0.46, difficulty);
    branch._trialFragile = forced || (!branch.launch && hash01(branch.floor, 3) < density);
  }

  function decorateKnot(knot) {
    if (knot._trialSerial === runSerial) return;
    knot._trialSerial = runSerial;
    knot._trialSway = false;
    knot._trialBaseX = knot.x;
    knot._trialPhase = hash01(knot.floor, 7) * Math.PI * 2;
    knot._trialAmplitude = 0;
    knot._trialFrequency = 0;

    if (knot.floor < 92 || knot.anchorKind !== 'sap-stick') return;
    const difficulty = altitudeDifficulty(knot.floor);
    const forced = knot.chunkType === 'PENDULUM' || knot.chunkType === 'THUNDERCROWN';
    const density = lerp(0.18, 0.58, difficulty);
    knot._trialSway = forced || hash01(knot.floor, 11) < density;
    if (knot._trialSway) {
      knot._trialAmplitude = forced ? lerp(34, 58, difficulty) : lerp(18, 42, difficulty);
      knot._trialFrequency = lerp(0.78, 1.22, hash01(knot.floor, 13));
    }
  }

  function decorateWorld() {
    for (const branch of state.branches) decorateBranch(branch);
    for (const knot of state.knots) decorateKnot(knot);
  }

  function startBreak(branch) {
    if (!branch?._trialFragile || branch._trialBreaking) return;
    const difficulty = altitudeDifficulty(branch.floor);
    const forced = branch.chunkType === 'BREAKAWAY' || branch.chunkType === 'THUNDERCROWN';
    const duration = forced ? lerp(0.78, 0.48, difficulty) : lerp(1.08, 0.62, difficulty);
    branch._trialBreaking = true;
    branch._trialBreakDuration = duration;
    branch._trialBreakAt = state.elapsed + duration;
    tone(118, 0.08, 0.018, 'triangle', 0.72);
    const telemetry = S.getTelemetry();
    telemetry.counters.fragileBranchesTriggered = (telemetry.counters.fragileBranchesTriggered || 0) + 1;
    recordEvent('fragile-branch-trigger', { floor: branch.floor, route: branch.chunkType, duration: S.round(duration, 3) });
  }

  function breakBranch(branch) {
    const index = state.branches.indexOf(branch);
    if (index < 0) return;
    const fragment = {
      x1: branch.x1,
      x2: branch.x2,
      y: branch.y,
      slope: branch.slope,
      age: 0,
      life: 1.1,
      vy: -40,
      spin: (hash01(branch.floor, 19) - 0.5) * 0.9,
    };
    fallingFragments.push(fragment);
    state.branches.splice(index, 1);
    if (player.grounded === branch) {
      player.grounded = null;
      player.groundedTime = 0;
      player.coyote = Math.max(player.coyote, 0.075);
    }
    state.shake = Math.max(state.shake, 0.20);
    burst((branch.x1 + branch.x2) * 0.5, branch.y, 9, 'bark', 0.55);
    const telemetry = S.getTelemetry();
    telemetry.counters.fragileBranchesBroken = (telemetry.counters.fragileBranchesBroken || 0) + 1;
    recordEvent('fragile-branch-break', { floor: branch.floor, route: branch.chunkType });
  }

  function updateFragileBranches(dt) {
    const grounded = player.grounded;
    if (grounded?._trialFragile) startBreak(grounded);
    for (const branch of [...state.branches]) {
      if (branch._trialBreaking && state.elapsed >= branch._trialBreakAt) breakBranch(branch);
    }
    for (let index = fallingFragments.length - 1; index >= 0; index -= 1) {
      const fragment = fallingFragments[index];
      fragment.age += dt;
      fragment.vy -= 520 * dt;
      fragment.y += fragment.vy * dt;
      if (fragment.age >= fragment.life) fallingFragments.splice(index, 1);
    }
  }

  function updateSwayingKnots() {
    for (const knot of state.knots) {
      if (!knot._trialSway) continue;
      const offset = Math.sin(state.elapsed * knot._trialFrequency + knot._trialPhase) * knot._trialAmplitude;
      knot.x = clamp(knot._trialBaseX + offset, state.LEFT_WALL + 52, state.RIGHT_WALL - 52);
    }
  }

  function coneIntensity() {
    if (player.highestFloor < 132) return 0;
    return clamp((player.highestFloor - 132) / 120, 0.14, 1);
  }

  function scheduleNextCone() {
    const intensity = coneIntensity();
    const base = lerp(2.55, 1.18, intensity);
    const jitter = lerp(0.82, 1.16, hash01(player.highestFloor + coneIndex, 23));
    nextConeAt = state.elapsed + base * jitter;
  }

  function spawnCone() {
    const intensity = coneIntensity();
    if (intensity <= 0) return;
    const safeInset = 62;
    const width = state.RIGHT_WALL - state.LEFT_WALL - safeInset * 2;
    const x = state.LEFT_WALL + safeInset + hash01(player.highestFloor + coneIndex * 3, 31) * width;
    const targetBias = hash01(player.highestFloor + coneIndex, 37);
    const aimedX = targetBias < lerp(0.28, 0.56, intensity)
      ? clamp(player.x + (hash01(coneIndex, 41) - 0.5) * lerp(90, 42, intensity), state.LEFT_WALL + safeInset, state.RIGHT_WALL - safeInset)
      : x;
    cones.push({
      id: `${runSerial}:${coneIndex}`,
      x: aimedX,
      y: state.cameraBottom + S.H + 112,
      age: -lerp(0.72, 0.48, intensity),
      warning: lerp(0.72, 0.48, intensity),
      speed: lerp(560, 760, intensity),
      spin: (hash01(coneIndex, 43) - 0.5) * 4.8,
      rotation: hash01(coneIndex, 47) * Math.PI * 2,
      hit: false,
    });
    coneIndex += 1;
    scheduleNextCone();
    const telemetry = S.getTelemetry();
    telemetry.counters.conesSpawned = (telemetry.counters.conesSpawned || 0) + 1;
  }

  function hitByCone(cone) {
    if (coneHitCooldown > 0 || cone.hit) return;
    cone.hit = true;
    coneHitCooldown = 0.62;
    const direction = player.x >= cone.x ? 1 : -1;
    player.vx += direction * 250;
    player.vy = Math.min(player.vy, -185);
    player.comboTimer *= 0.52;
    state.shake = Math.max(state.shake, 0.52);
    state.flash = Math.max(state.flash, 0.20);
    burst(player.x, player.y, 13, 'bark', 0.72);
    tone(82, 0.11, 0.04, 'sawtooth', 0.58);
    announce('CONE STRIKE', 0.48, 12);
    const telemetry = S.getTelemetry();
    telemetry.counters.coneHits = (telemetry.counters.coneHits || 0) + 1;
    recordEvent('cone-hit', { floor: player.highestFloor, vx: S.round(player.vx, 1), vy: S.round(player.vy, 1) });
  }

  function updateCones(dt) {
    coneHitCooldown = Math.max(0, coneHitCooldown - dt);
    const intensity = coneIntensity();
    if (state.mode === 'playing' && intensity > 0 && state.elapsed >= nextConeAt) spawnCone();

    for (let index = cones.length - 1; index >= 0; index -= 1) {
      const cone = cones[index];
      cone.age += dt;
      if (cone.age >= 0) {
        cone.y -= cone.speed * dt;
        cone.rotation += cone.spin * dt;
        const dx = player.x - cone.x;
        const dy = player.y - cone.y;
        if (!cone.hit && dx * dx + dy * dy <= 30 * 30) hitByCone(cone);
      }
      if (cone.y < state.cameraBottom - 120 || cone.age > 4.2) {
        if (!cone.hit && cone.age > 0) {
          const telemetry = S.getTelemetry();
          telemetry.counters.conesDodged = (telemetry.counters.conesDodged || 0) + 1;
        }
        cones.splice(index, 1);
      }
    }
  }

  function updateScenarioAnnouncement() {
    const route = S.activeRouteChunk?.();
    if (!route || route.id === lastRouteId) return;
    lastRouteId = route.id;
    if (!isTrialRoute(route.type)) return;
    const labels = {
      BREAKAWAY: 'BREAKAWAY · KEEP MOVING',
      PENDULUM: 'PENDULUM · TIME THE SAP',
      CONEFALL: 'CONEFALL · WATCH THE SKY',
      THUNDERCROWN: 'THUNDERCROWN · NO SAFE LINE',
    };
    announce(labels[route.type], 0.82, 12);
    recordEvent('canopy-trial-enter', { route: route.type, floor: player.highestFloor });
  }

  function update(dt) {
    baseUpdate(dt);
    decorateWorld();
    updateSwayingKnots();
    if (state.mode === 'playing') {
      updateFragileBranches(dt);
      updateCones(dt);
      updateScenarioAnnouncement();
    }
  }

  function resetTrials() {
    runSerial += 1;
    fallingFragments.length = 0;
    cones.length = 0;
    coneIndex = 0;
    lastRouteId = '';
    coneHitCooldown = 0;
    nextConeAt = 2.8;
    decorateWorld();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetTrials();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetTrials();
    return result;
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.canopyTrials = {
    version: VERSION,
    routeFamilies: ['BREAKAWAY', 'PENDULUM', 'CONEFALL', 'THUNDERCROWN'],
    getState: () => ({
      intensity: altitudeDifficulty(),
      coneIntensity: coneIntensity(),
      activeRoute: S.activeRouteChunk?.()?.type || null,
      fragileActive: state.branches.filter((branch) => branch._trialFragile).length,
      swayingKnots: state.knots.filter((knot) => knot._trialSway).length,
      cones,
      fallingFragments,
    }),
  };
})();
