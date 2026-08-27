(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.ROUTE_GRAMMARS || !S?.PHASES) return;

  const { state, player, TUNE, W, clamp, lerp, announce, recordEvent, tone, burst, crownDrop } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const VERSION = 'living-canopy-v1';
  const SKYHEART_FLOOR = 360;
  const ALL_WONDERS_MASK = 0b111111;
  const DISCOVERY_RADIUS = 42;

  const WONDERS = [
    { id: 'windchoir', name: 'WIND CHOIR', floor: 88, hue: '#d8f7ff', condition: 'flow', hint: 'BRING 3× FLOW INTO THE SONG' },
    { id: 'lightninghollow', name: 'LIGHTNING HOLLOW', floor: 132, hue: '#fff0a4', condition: 'bark', hint: 'TOUCH BARK · HOLD THE CLING' },
    { id: 'sunwing', name: 'SUNWING MIGRATION', floor: 174, hue: '#ffd98e', condition: 'flight', hint: 'MEET THE FLOCK AT FULL FLIGHT' },
    { id: 'resinaurora', name: 'RESIN AURORA', floor: 216, hue: '#90ffda', condition: 'clean-sap', hint: 'PAINT IT WITH A CLEAN SAP' },
    { id: 'elderbough', name: 'ELDER BOUGH', floor: 278, hue: '#e9c58a', condition: 'stride', hint: 'ARRIVE WITH 600 STRIDE · 5× FLOW' },
    { id: 'crownecho', name: 'CROWN ECHO', floor: 326, hue: '#eab6ff', condition: 'hyper', hint: 'CROSS WHILE CROWNVELOCITY BURNS' },
  ];

  // v0.5 keeps ordinary climbing legible, then progressively introduces route
  // families that feel like set pieces instead of statistically smaller shelves.
  Object.assign(S.ROUTE_GRAMMARS, {
    CHOIRLINE: [
      { dy: 72, side: 'center', length: 420, launch: true, ring: 'crown' },
      { dy: 126, side: 'left', length: 260, ring: 'lane' },
      { dy: 136, side: 'right', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 118, side: 'center', length: 320, ring: 'crown' },
    ],
    HOLLOWRUN: [
      { dy: 78, side: 'left', length: 285, launch: true, knot: 'cross' },
      { dy: 132, side: 'right', length: 245, knot: 'cross' },
      { dy: 144, side: 'left', branch: false, anchor: 'left' },
      { dy: 122, side: 'right', length: 235, ring: 'lane' },
    ],
    MIGRATION: [
      { dy: 74, side: 'center', length: 330, launch: true, ring: 'crown' },
      { dy: 146, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 148, side: 'same', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 154, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 118, side: 'center', length: 270, ring: 'crown' },
    ],
    AURORARUN: [
      { dy: 76, side: 'center', length: 310, launch: true, knot: 'center' },
      { dy: 166, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 174, side: 'right', branch: false, anchor: 'left' },
      { dy: 170, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 124, side: 'center', length: 242, knot: 'cross', ring: 'crown' },
    ],
    ELDERSPAN: [
      { dy: 82, side: 'left', length: 260, launch: true, knot: 'cross' },
      { dy: 132, side: 'right', length: 224, ring: 'lane' },
      { dy: 168, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 146, side: 'right', length: 205, knot: 'cross' },
      { dy: 174, side: 'left', branch: false, anchor: 'right' },
      { dy: 142, side: 'right', length: 198, ring: 'lane' },
      { dy: 120, side: 'center', length: 235, knot: 'center', ring: 'crown' },
    ],
    ECHOFLIGHT: [
      { dy: 86, side: 'center', length: 250, launch: true, ring: 'crown' },
      { dy: 178, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 188, side: 'right', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 184, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 190, side: 'right', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 124, side: 'center', length: 214, ring: 'crown' },
    ],
    SKYHEART: [
      { dy: 92, side: 'same', length: 236, launch: true, knot: 'cross' },
      { dy: 182, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 154, side: 'same', length: 192, ring: 'lane' },
      { dy: 192, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 164, side: 'same', length: 184, knot: 'cross' },
      { dy: 196, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 126, side: 'center', length: 206, ring: 'crown' },
    ],
  });

  function phase(name) { return S.PHASES.find((entry) => entry.name === name); }
  const redwood = phase('REDWOOD RUN');
  const sapwork = phase('SAPWORK');
  const high = phase('HIGH CANOPY');
  const crownline = phase('CROWNLINE');
  if (redwood && !redwood.sequence.includes('CHOIRLINE')) redwood.sequence.splice(3, 0, 'CHOIRLINE');
  if (sapwork && !sapwork.sequence.includes('HOLLOWRUN')) sapwork.sequence.splice(4, 0, 'HOLLOWRUN', 'AURORARUN');
  if (high && !high.sequence.includes('MIGRATION')) high.sequence.splice(2, 0, 'MIGRATION', 'ELDERSPAN');
  if (crownline && !crownline.sequence.includes('ECHOFLIGHT')) crownline.sequence.splice(2, 0, 'ELDERSPAN', 'ECHOFLIGHT');
  if (!phase('LIVING CROWN')) {
    S.PHASES.push({
      name: 'LIVING CROWN',
      floor: 250,
      geometry: 1.08,
      pressure: 1.28,
      sequence: ['ELDERSPAN', 'ECHOFLIGHT', 'THUNDERCROWN', 'AURORARUN', 'CROWNWEAVE', 'MIGRATION', 'RECOVERY'],
    });
  }
  if (!phase('ELDER SKY')) {
    S.PHASES.push({
      name: 'ELDER SKY',
      floor: 320,
      geometry: 1.14,
      pressure: 1.32,
      sequence: ['SKYHEART', 'ECHOFLIGHT', 'THUNDERCROWN', 'ELDERSPAN', 'CROWNWEAVE', 'SKYHOOK'],
    });
  }
  S.PHASES.sort((a, b) => a.floor - b.floor);

  function readNumber(key, fallback = 0) {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch { return fallback; }
  }
  function writeNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
  }
  function popcount(mask) {
    let value = mask >>> 0;
    let count = 0;
    while (value) { count += value & 1; value >>>= 1; }
    return count;
  }
  function hash01(value, salt = 0) {
    let n = (state.runSeed ^ Math.imul(value + 71 + salt * 37, 0x9e3779b1)) >>> 0;
    n ^= n >>> 16;
    n = Math.imul(n, 0x7feb352d) >>> 0;
    n ^= n >>> 15;
    n = Math.imul(n, 0x846ca68b) >>> 0;
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }

  let wonderMask = readNumber('sylvaria.sequoia.wonderMask', 0) | 0;
  let skyheartRung = readNumber('sylvaria.sequoia.skyheartRung', 0) === 1;
  let runSerial = 0;
  let wonderBanner = null;
  let skyheartBanner = null;
  let lastHintId = '';
  let lastRouteId = '';
  let activePulse = null;
  let pulseSerial = 0;
  const resolved = new Map();

  function hasWonder(index) { return Boolean(wonderMask & (1 << index)); }
  function heartwoodState() { return S.heartwoodQuest?.getState?.() || null; }
  function worldFeature(floor) {
    const ring = state.rings.find((item) => item.floor === floor && !item.hit);
    if (ring) return { kind: 'ring', x: ring.x, y: ring.y };
    const knot = state.knots.find((item) => item.floor === floor);
    if (knot) return { kind: 'knot', x: knot.x, y: knot.y };
    const branch = state.branches.find((item) => item.floor === floor);
    if (branch) {
      const mid = (branch.x1 + branch.x2) * 0.5;
      return { kind: 'branch', x: mid, y: S.branchYAt(branch, mid), branch };
    }
    return null;
  }

  function resolveWonder(spec, index) {
    const cached = resolved.get(spec.id);
    const feature = worldFeature(spec.floor);
    if (!feature) return cached || null;
    const side = hash01(spec.floor, index + 5) < 0.5 ? -1 : 1;
    let x = feature.x;
    let y = feature.y + 52;

    if (spec.condition === 'bark') {
      x = side < 0 ? state.LEFT_WALL + 30 : state.RIGHT_WALL - 30;
      y = feature.y + 84;
    } else if (spec.condition === 'flight') {
      const travel = Math.sin(state.elapsed * 0.92 + index * 1.7) * 118;
      x = clamp(W / 2 + travel, state.LEFT_WALL + 76, state.RIGHT_WALL - 76);
      y = feature.y + 106;
    } else if (spec.condition === 'clean-sap') {
      x = clamp(feature.x + side * 104, state.LEFT_WALL + 64, state.RIGHT_WALL - 64);
      y = feature.y + 86;
    } else if (spec.condition === 'stride') {
      x = clamp(feature.x + side * 132, state.LEFT_WALL + 58, state.RIGHT_WALL - 58);
      y = feature.y + 94;
    } else if (spec.condition === 'hyper') {
      x = W / 2 + side * 64;
      y = feature.y + 122;
    } else {
      x = clamp(feature.x + side * 82, state.LEFT_WALL + 64, state.RIGHT_WALL - 64);
      y = feature.y + 76;
    }

    const value = { ...spec, index, x, y, side, resolvedRun: runSerial };
    resolved.set(spec.id, value);
    return value;
  }

  function recentCleanSap() {
    const events = S.getTelemetry()?.events || [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (state.elapsed - event.t > 1.45) break;
      if (event.type === 'sap-stick-release' && event.cleanVault) return true;
    }
    return false;
  }

  function conditionMet(spec) {
    if (spec.condition === 'flow') return player.combo >= 3;
    if (spec.condition === 'bark') return Boolean(player.clingActive);
    if (spec.condition === 'flight') return !player.grounded && Math.abs(player.vx) >= 450;
    if (spec.condition === 'clean-sap') return recentCleanSap();
    if (spec.condition === 'stride') return (player.strideMomentum || 0) >= 600 && player.combo >= 5;
    if (spec.condition === 'hyper') return Boolean(player.hyper);
    return true;
  }

  function rewardDiscovery(index) {
    player.airJumps = TUNE.jump.airJumps;
    if (typeof player.strideMomentum === 'number') player.strideMomentum = Math.max(player.strideMomentum, 560 + index * 16);
    if (player.saves < 2) player.saves += 1;
    else player.resin = Math.min(1, player.resin + 0.32);
    player.score += 420 + index * 130;
  }

  function discoverWonder(target) {
    if (!target || hasWonder(target.index)) return false;
    wonderMask |= 1 << target.index;
    writeNumber('sylvaria.sequoia.wonderMask', wonderMask);
    rewardDiscovery(target.index);
    wonderBanner = { ...target, age: 0, life: 3.0, count: popcount(wonderMask) };
    state.flash = Math.max(state.flash, 0.62);
    state.shake = Math.max(state.shake, 0.34);
    crownDrop?.();
    burst(player.x, player.y, 26, 'resin', 0.96);
    tone(410 + target.index * 58, 0.16, 0.04, 'triangle', 1.52);
    tone(720 + target.index * 40, 0.18, 0.027, 'sine', 1.82);
    announce(`${target.name} · WONDER ${popcount(wonderMask)}/${WONDERS.length}`, 1.4, 16);
    const counters = S.getTelemetry().counters;
    counters.wondersDiscovered = (counters.wondersDiscovered || 0) + 1;
    recordEvent('canopy-wonder-discovered', { id: target.id, floor: target.floor, count: popcount(wonderMask) });
    resolved.delete(target.id);
    if ((wonderMask & ALL_WONDERS_MASK) === ALL_WONDERS_MASK) {
      announce(`THE SKYHEART ANSWERS · FLOOR ${SKYHEART_FLOOR}`, 2.0, 16);
      recordEvent('skyheart-unlocked', { floor: SKYHEART_FLOOR });
    }
    return true;
  }

  function activeWonder() {
    const candidates = WONDERS
      .map((spec, index) => ({ spec, index }))
      .filter(({ index }) => !hasWonder(index))
      .filter(({ spec }) => Math.abs(player.highestFloor - spec.floor) <= 16)
      .sort((a, b) => Math.abs(a.spec.floor - player.highestFloor) - Math.abs(b.spec.floor - player.highestFloor));
    if (!candidates.length) return null;
    return resolveWonder(candidates[0].spec, candidates[0].index);
  }

  function nextWonder() {
    const missing = WONDERS.map((spec, index) => ({ ...spec, index })).filter((spec) => !hasWonder(spec.index));
    if (!missing.length) return null;
    return missing.find((spec) => spec.floor >= player.highestFloor - 3) || missing[0];
  }

  function updateWonderDiscovery() {
    const target = activeWonder();
    if (!target) return;
    const floorsAway = target.floor - player.highestFloor;
    if (floorsAway >= 1 && floorsAway <= 8 && lastHintId !== target.id) {
      lastHintId = target.id;
      announce(`RUMOR · ${target.name}`, 0.72, 11);
      recordEvent('canopy-wonder-rumor', { id: target.id, floor: target.floor });
    }
    const dx = player.x - target.x;
    const dy = player.y - target.y;
    const radius = DISCOVERY_RADIUS + state.PLAYER_R;
    if (dx * dx + dy * dy > radius * radius) return;
    if (conditionMet(target)) discoverWonder(target);
    else announce(target.hint, 0.42, 10);
  }

  function decorateSetpieceWorld() {
    for (const branch of state.branches) {
      if (branch._livingSerial === runSerial) continue;
      branch._livingSerial = runSerial;
      if ((branch.chunkType === 'ELDERSPAN' || branch.chunkType === 'SKYHEART') && branch.floor > 250 && branch.floor % 2 === 0) {
        branch._trialFragile = true;
      }
    }
    for (const knot of state.knots) {
      if (knot._livingSerial === runSerial) continue;
      knot._livingSerial = runSerial;
      if (['AURORARUN', 'ECHOFLIGHT', 'SKYHEART'].includes(knot.chunkType) && knot.anchorKind === 'sap-stick') {
        knot._trialSway = true;
        knot._trialBaseX = knot.x;
        knot._trialPhase = hash01(knot.floor, 23) * Math.PI * 2;
        knot._trialAmplitude = knot.chunkType === 'SKYHEART' ? 64 : knot.chunkType === 'ECHOFLIGHT' ? 54 : 44;
        knot._trialFrequency = lerp(0.86, 1.28, hash01(knot.floor, 27));
      }
    }
    for (const ring of state.rings) {
      if (ring._livingSerial === runSerial) continue;
      ring._livingSerial = runSerial;
      ring._livingBaseRadius = ring.radius;
      ring._livingPulse = ['CHOIRLINE', 'MIGRATION', 'ECHOFLIGHT', 'SKYHEART'].includes(ring.chunkType);
      ring._livingPhase = hash01(ring.floor, 31) * Math.PI * 2;
    }
  }

  function updateResonanceRings() {
    for (const ring of state.rings) {
      if (!ring._livingPulse || ring.hit) continue;
      const base = ring._livingBaseRadius || ring.radius;
      const amplitude = ring.chunkType === 'SKYHEART' ? 0.26 : 0.18;
      ring.radius = Math.max(TUNE.ring.minRadius, base * (1 + Math.sin(state.elapsed * 2.4 + ring._livingPhase) * amplitude));
    }
  }

  function pulseRoute(route) {
    return route && ['ELDERSPAN', 'ECHOFLIGHT', 'SKYHEART'].includes(route.type);
  }

  function updateStormPulse() {
    const route = S.activeRouteChunk?.();
    if (!pulseRoute(route)) {
      activePulse = null;
      return;
    }
    if (route.id !== lastRouteId) {
      lastRouteId = route.id;
      pulseSerial = 0;
      activePulse = { route: route.type, direction: hash01(route.startFloor, 41) < 0.5 ? -1 : 1, warning: 0.52, age: 0, fired: false };
      announce(route.type === 'SKYHEART' ? 'SKYHEART · THE TREE MOVES' : `${route.type} · READ THE PULSE`, 0.82, 12);
      recordEvent('living-setpiece-enter', { route: route.type, floor: player.highestFloor });
    }
    if (!activePulse) return;
    activePulse.age += S.FIXED_DT || (1 / 120);
    const cycle = route.type === 'SKYHEART' ? 1.85 : 2.35;
    const phaseTime = activePulse.age % cycle;
    if (phaseTime < 0.10) activePulse.fired = false;
    if (!activePulse.fired && phaseTime >= activePulse.warning) {
      activePulse.fired = true;
      const strength = route.type === 'SKYHEART' ? 185 : 138;
      if (!player.grounded && !player.sap) {
        player.vx = clamp(player.vx + activePulse.direction * strength, -860, 860);
        player.vy += route.type === 'SKYHEART' ? 52 : 30;
      }
      state.shake = Math.max(state.shake, route.type === 'SKYHEART' ? 0.24 : 0.14);
      tone(92, 0.08, 0.018, 'sawtooth', 1.55);
      const counters = S.getTelemetry().counters;
      counters.elderPulses = (counters.elderPulses || 0) + 1;
      recordEvent('elder-wind-pulse', { route: route.type, direction: activePulse.direction });
      pulseSerial += 1;
      if (pulseSerial % 2 === 0) activePulse.direction *= -1;
    }
  }

  function maybeRingSkyheart() {
    if (skyheartRung || state.mode !== 'playing') return;
    const heart = heartwoodState();
    if (!heart?.crownAwakened) return;
    if ((wonderMask & ALL_WONDERS_MASK) !== ALL_WONDERS_MASK) return;
    if (player.highestFloor < SKYHEART_FLOOR) return;
    skyheartRung = true;
    writeNumber('sylvaria.sequoia.skyheartRung', 1);
    skyheartBanner = { age: 0, life: 5.2 };
    state.flash = 1;
    state.shake = Math.max(state.shake, 0.82);
    player.airJumps = TUNE.jump.airJumps;
    player.saves = 2;
    if (typeof player.strideMomentum === 'number') player.strideMomentum = Math.max(player.strideMomentum, 700);
    crownDrop?.();
    burst(player.x, player.y, 72, 'resin', 1.65);
    tone(330, 0.24, 0.05, 'triangle', 1.50);
    tone(494, 0.34, 0.038, 'sine', 1.66);
    tone(660, 0.48, 0.034, 'triangle', 1.80);
    announce('THE SKYHEART RINGS', 2.6, 26);
    const counters = S.getTelemetry().counters;
    counters.skyheartRings = (counters.skyheartRings || 0) + 1;
    recordEvent('skyheart-rung', { floor: player.highestFloor, seed: state.runSeed });
  }

  function tickBanners(dt) {
    if (wonderBanner) {
      wonderBanner.age += dt;
      if (wonderBanner.age >= wonderBanner.life) wonderBanner = null;
    }
    if (skyheartBanner) {
      skyheartBanner.age += dt;
      if (skyheartBanner.age >= skyheartBanner.life) skyheartBanner = null;
    }
  }

  function objective() {
    const heart = heartwoodState();
    if (heart && heart.count < heart.total) return { kind: 'heartseed', text: `HEARTSEEDS ${heart.count}/${heart.total}`, detail: heart.nextSeed ? `${Math.max(0, heart.nextSeed.floor - player.highestFloor)}F · ${heart.nextSeed.name}` : '' };
    if (heart && !heart.crownAwakened) return { kind: 'crown', text: `WAKE THE CROWN · ${heart.finalCrownFloor}F`, detail: `${Math.max(0, heart.finalCrownFloor - player.highestFloor)} FLOORS` };
    const count = popcount(wonderMask);
    if (count < WONDERS.length) {
      const next = nextWonder();
      return { kind: 'wonder', text: `WONDERS ${count}/${WONDERS.length}`, detail: next ? `${Math.max(0, next.floor - player.highestFloor)}F · ${next.name}` : '' };
    }
    if (!skyheartRung) return { kind: 'skyheart', text: `SKYHEART · ${SKYHEART_FLOOR}F`, detail: `${Math.max(0, SKYHEART_FLOOR - player.highestFloor)} FLOORS` };
    return { kind: 'endless', text: 'ELDER CANOPY', detail: 'THE TREE KEEPS GOING' };
  }

  function update(dt) {
    baseUpdate(dt);
    decorateSetpieceWorld();
    updateResonanceRings();
    if (state.mode === 'playing') {
      updateWonderDiscovery();
      updateStormPulse();
      maybeRingSkyheart();
    }
    tickBanners(dt);
  }

  function resetLivingCanopy() {
    runSerial += 1;
    resolved.clear();
    wonderBanner = null;
    skyheartBanner = null;
    lastHintId = '';
    lastRouteId = '';
    activePulse = null;
    pulseSerial = 0;
    decorateSetpieceWorld();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetLivingCanopy();
    return result;
  }
  function startRun(seed) {
    const result = baseStartRun(seed);
    resetLivingCanopy();
    return result;
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.livingCanopy = {
    version: VERSION,
    skyheartFloor: SKYHEART_FLOOR,
    wonders: WONDERS.map((wonder, index) => ({ ...wonder, index })),
    getObjective: objective,
    getState: () => ({
      wonderMask,
      count: popcount(wonderMask),
      total: WONDERS.length,
      allWonders: (wonderMask & ALL_WONDERS_MASK) === ALL_WONDERS_MASK,
      skyheartRung,
      skyheartFloor: SKYHEART_FLOOR,
      nextWonder: nextWonder(),
      activeWonder: activeWonder(),
      wonderBanner: wonderBanner ? { ...wonderBanner } : null,
      skyheartBanner: skyheartBanner ? { ...skyheartBanner } : null,
      pulse: activePulse ? { ...activePulse } : null,
      objective: objective(),
    }),
  };
})();
