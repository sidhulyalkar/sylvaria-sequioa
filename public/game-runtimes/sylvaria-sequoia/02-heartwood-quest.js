(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.resetRun || !S?.startRun) return;

  const { state, player, TUNE, W, clamp, announce, recordEvent, tone, burst, crownDrop } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const VERSION = 'heartwood-quest-v1';
  const FINAL_CROWN_FLOOR = 250;
  const COLLECT_RADIUS = 34;
  const ALL_SEEDS_MASK = 0b11111;

  // These are intentionally sparse, memorable destinations rather than currency.
  // Each one lives in a different movement ecology and permanently advances the
  // player's larger objective: wake the living crown at floor 250.
  const HEARTSEEDS = [
    { id: 'rootlight', name: 'ROOTLIGHT', floor: 22, hue: '#d9ff9b', challenge: 'LEAVE THE SAFE BRANCH' },
    { id: 'redstar', name: 'REDSTAR', floor: 58, hue: '#ffc96b', challenge: 'CATCH THE OUTER LINE' },
    { id: 'sapheart', name: 'SAPHEART', floor: 103, hue: '#8fffd0', challenge: 'RIDE THE OPEN AIR' },
    { id: 'skyseed', name: 'SKYSEED', floor: 153, hue: '#91cfff', challenge: 'TAKE THE STORM SIDE' },
    { id: 'crowncore', name: 'CROWNCORE', floor: 218, hue: '#f1a6ff', challenge: 'CLAIM THE HIGH CANOPY' },
  ];

  const storage = {
    readNumber(key, fallback = 0) {
      try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* private mode / quota */ }
    },
  };

  let seedMask = storage.readNumber('sylvaria.sequoia.heartseedMask', 0) | 0;
  let crownAwakened = storage.readNumber('sylvaria.sequoia.crownAwakened', 0) === 1;
  let runCollected = 0;
  let activeBanner = null;
  let activeSeed = null;
  let crownBanner = null;
  let runSerial = 0;

  const bitCount = (mask) => {
    let count = 0;
    let value = mask >>> 0;
    while (value) {
      count += value & 1;
      value >>>= 1;
    }
    return count;
  };

  function hasSeed(index) {
    return Boolean(seedMask & (1 << index));
  }

  function firstMissingSeed() {
    const index = HEARTSEEDS.findIndex((_, seedIndex) => !hasSeed(seedIndex));
    return index >= 0 ? { ...HEARTSEEDS[index], index } : null;
  }

  function hash01(floor, salt = 0) {
    let value = (state.runSeed ^ Math.imul(floor + 31 + salt * 17, 0x9e3779b1)) >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d) >>> 0;
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b) >>> 0;
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function featureAtFloor(floor) {
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

  function positionSeed(spec, index) {
    const feature = featureAtFloor(spec.floor);
    if (!feature) return null;
    const direction = hash01(spec.floor, index) < 0.5 ? -1 : 1;
    const difficulty = index / Math.max(1, HEARTSEEDS.length - 1);
    const sideInset = 48;
    let x = feature.x;
    let y = feature.y;

    if (feature.kind === 'ring') {
      x += direction * (42 + difficulty * 24);
      y += 22 + difficulty * 10;
    } else if (feature.kind === 'knot') {
      x += direction * (48 + difficulty * 34);
      y += 18 + difficulty * 14;
    } else {
      const branch = feature.branch;
      if (branch.side === 'left') x = branch.x2 + 70 + difficulty * 24;
      else if (branch.side === 'right') x = branch.x1 - 70 - difficulty * 24;
      else x = W / 2 + direction * (Math.min(230, (branch.x2 - branch.x1) * 0.42) + 34);
      y += 78 + difficulty * 32;
    }

    x = clamp(x, state.LEFT_WALL + sideInset, state.RIGHT_WALL - sideInset);
    return { ...spec, index, x, y, resolvedRun: runSerial };
  }

  function refreshActiveSeed() {
    const missing = firstMissingSeed();
    if (!missing) {
      activeSeed = null;
      return;
    }
    if (activeSeed?.index === missing.index && activeSeed.resolvedRun === runSerial) {
      // Swaying knots can move. Re-resolve while the seed is nearby so the risky
      // line stays visually tied to the current traversal feature.
      if (Math.abs(player.highestFloor - missing.floor) < 12) {
        activeSeed = positionSeed(missing, missing.index) || activeSeed;
      }
      return;
    }
    activeSeed = positionSeed(missing, missing.index);
  }

  function rewardHeartseed(spec) {
    // The persistent objective is the real reward. The immediate reward is a
    // small survival/mobility refill so taking the dangerous detour feels good
    // without turning the collectible into mandatory power progression.
    player.airJumps = TUNE.jump.airJumps;
    if (typeof player.strideMomentum === 'number') player.strideMomentum = Math.max(player.strideMomentum, 520);
    if (player.saves < 2) player.saves += 1;
    else player.resin = Math.min(1, player.resin + 0.45);
    player.score += 300 + spec.floor * 3;
  }

  function collectSeed(spec) {
    if (!spec || hasSeed(spec.index)) return;
    seedMask |= 1 << spec.index;
    storage.write('sylvaria.sequoia.heartseedMask', seedMask);
    runCollected += 1;
    rewardHeartseed(spec);
    activeBanner = { age: 0, life: 2.5, name: spec.name, count: bitCount(seedMask), hue: spec.hue };
    state.flash = Math.max(state.flash, 0.46);
    state.shake = Math.max(state.shake, 0.30);
    crownDrop?.();
    burst(player.x, player.y, 22, 'leaf', 0.86);
    tone(520 + spec.index * 72, 0.14, 0.045, 'triangle', 1.35);
    tone(780 + spec.index * 64, 0.09, 0.026, 'sine', 1.6);
    announce(`${spec.name} · HEARTSEED ${bitCount(seedMask)}/${HEARTSEEDS.length}`, 1.25, 16);
    const telemetry = S.getTelemetry();
    telemetry.counters.heartseeds = (telemetry.counters.heartseeds || 0) + 1;
    recordEvent('heartseed-collect', {
      id: spec.id,
      floor: spec.floor,
      collected: bitCount(seedMask),
      total: HEARTSEEDS.length,
    });
    activeSeed = null;

    if ((seedMask & ALL_SEEDS_MASK) === ALL_SEEDS_MASK && !crownAwakened) {
      announce(`THE LIVING CROWN CALLS · FLOOR ${FINAL_CROWN_FLOOR}`, 1.8, 16);
      recordEvent('living-crown-unlocked', { floor: FINAL_CROWN_FLOOR });
    }
  }

  function maybeCollectSeed() {
    if (!activeSeed || state.mode !== 'playing') return;
    const dx = player.x - activeSeed.x;
    const dy = player.y - activeSeed.y;
    const radius = COLLECT_RADIUS + state.PLAYER_R;
    if (dx * dx + dy * dy <= radius * radius) collectSeed(activeSeed);
  }

  function maybeAwakenCrown() {
    if (crownAwakened || state.mode !== 'playing') return;
    if ((seedMask & ALL_SEEDS_MASK) !== ALL_SEEDS_MASK) return;
    if (player.highestFloor < FINAL_CROWN_FLOOR) return;

    crownAwakened = true;
    storage.write('sylvaria.sequoia.crownAwakened', 1);
    crownBanner = { age: 0, life: 4.6 };
    state.flash = 1;
    state.shake = Math.max(state.shake, 0.75);
    player.airJumps = TUNE.jump.airJumps;
    player.saves = 2;
    crownDrop?.();
    burst(player.x, player.y, 58, 'leaf', 1.45);
    tone(392, 0.22, 0.05, 'triangle', 1.5);
    tone(587, 0.28, 0.04, 'sine', 1.72);
    tone(784, 0.34, 0.035, 'triangle', 1.9);
    announce('THE LIVING CROWN AWAKENS', 2.3, 24);
    const telemetry = S.getTelemetry();
    telemetry.counters.crownAwakenings = (telemetry.counters.crownAwakenings || 0) + 1;
    recordEvent('living-crown-awakened', { floor: player.highestFloor, seed: state.runSeed });
  }

  function tickBanners(dt) {
    if (activeBanner) {
      activeBanner.age += dt;
      if (activeBanner.age >= activeBanner.life) activeBanner = null;
    }
    if (crownBanner) {
      crownBanner.age += dt;
      if (crownBanner.age >= crownBanner.life) crownBanner = null;
    }
  }

  function update(dt) {
    baseUpdate(dt);
    if (state.mode === 'playing') {
      refreshActiveSeed();
      maybeCollectSeed();
      maybeAwakenCrown();
    }
    tickBanners(dt);
  }

  function resetQuestRun() {
    runSerial += 1;
    runCollected = 0;
    activeSeed = null;
    activeBanner = null;
    crownBanner = null;
    refreshActiveSeed();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetQuestRun();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetQuestRun();
    return result;
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.heartwoodQuest = {
    version: VERSION,
    finalCrownFloor: FINAL_CROWN_FLOOR,
    heartseeds: HEARTSEEDS.map((seed, index) => ({ ...seed, index })),
    getState: () => ({
      count: bitCount(seedMask),
      total: HEARTSEEDS.length,
      seedMask,
      crownAwakened,
      readyForCrown: (seedMask & ALL_SEEDS_MASK) === ALL_SEEDS_MASK && !crownAwakened,
      finalCrownFloor: FINAL_CROWN_FLOOR,
      runCollected,
      nextSeed: firstMissingSeed(),
      activeSeed: activeSeed ? { ...activeSeed } : null,
      activeBanner: activeBanner ? { ...activeBanner } : null,
      crownBanner: crownBanner ? { ...crownBanner } : null,
    }),
  };
})();
