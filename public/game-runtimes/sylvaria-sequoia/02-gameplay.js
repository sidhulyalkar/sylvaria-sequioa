(() => {
  'use strict';
  const S = window.SylvariaSequoia;
  const { state, player, TUNE, W, clamp, boundedPush, recordEvent, routeStat, tone, crownDrop, announce, burst } = S;

  const COMBO_BITS = { AIR: 1, BARK: 2, SAP: 4, RING: 8, SKIP: 16, BURL: 32 };
  const bitCount = (value) => {
    let count = 0;
    let mask = value >>> 0;
    while (mask) {
      count += mask & 1;
      mask >>>= 1;
    }
    return count;
  };

  function resetRun(seed = state.runSeed) {
    state.runSeed = seed >>> 0 || 1;
    state.particles.length = 0;
    state.messages.length = 0;
    state.elapsed = 0;
    state.cameraBottom = -82;
    state.threatY = -270;
    state.flash = 0;
    state.shake = 0;
    state.scorchCooldown = 0;
    S.replaceTelemetry(state.runSeed);

    Object.assign(player, {
      x: W / 2,
      y: 98,
      px: W / 2,
      py: 98,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: null,
      groundedTime: 0,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      airJumps: TUNE.jump.airJumps,
      sapHeld: false,
      sap: null,
      wallTimer: 0,
      state: 'grounded',
      squash: 0,
      stretch: 0,
      heat: 0,
      score: 0,
      highestFloor: 0,
      lastFloor: 0,
      combo: 0,
      comboFloors: 0,
      comboTimer: 0,
      comboStartedAt: 0,
      comboLastLinkAt: -99,
      comboLastLinkType: '',
      comboKindsMask: 0,
      hyper: false,
      hyperStartedAt: 0,
      resin: 0,
      saves: 0,
      bestCombo: 0,
    });

    player.grounded = S.resetWorld(state.runSeed);
  }

  function startRun(seed) {
    const selectedSeed = Number.isFinite(seed) ? Number(seed) : state.runSeed + 1;
    resetRun(selectedSeed);
    state.mode = 'playing';
    state.wrapPlaying = true;
    S.wrap.dataset.playing = 'true';
    S.canvas.focus();
    recordEvent('run-start', { seed: state.runSeed });
    tone(220, 0.12, 0.045, 'triangle', 1.8);
  }

  function finishActiveRouteAsFailure() {
    const chunk = S.activeRouteChunk();
    if (!chunk || !chunk.attempted || chunk.completed || chunk.failed) return;
    chunk.failed = true;
    routeStat(chunk.type).failures += 1;
    recordEvent('route-fail', { route: chunk.type, phase: chunk.phase, id: chunk.id });
  }

  function endRun() {
    if (state.mode !== 'playing') return;
    finishActiveRouteAsFailure();
    state.mode = 'gameover';
    S.wrap.dataset.playing = 'false';
    player.sap = null;
    const telemetry = S.getTelemetry();
    telemetry.finishedAt = performance.now();
    state.highScore = Math.max(state.highScore, Math.floor(player.score));
    localStorage.setItem('sylvaria.sequoia.highscore', String(state.highScore));
    localStorage.setItem('sylvaria.sequoia.lastTelemetry', JSON.stringify(S.summarizeTelemetry()));
    burst(player.x, player.y, 30, 'ember', 1.2);
    tone(128, 0.34, 0.06, 'sawtooth', 0.35);
    announce('THE CROWN KEEPS CLIMBING', 2.0, 18);
    recordEvent('run-end', { floor: player.highestFloor, score: Math.floor(player.score) });
  }

  function endHyper() {
    if (!player.hyper) return;
    recordEvent('crownvelocity-end', { duration: S.round(state.elapsed - player.hyperStartedAt, 3) });
    player.hyper = false;
  }

  function refreshAirJump(reason, loud = false) {
    if (player.airJumps >= TUNE.jump.airJumps) return false;
    player.airJumps = TUNE.jump.airJumps;
    S.getTelemetry().counters.airJumpRefreshes += 1;
    recordEvent('air-kick-refresh', { reason });
    if (loud) announce('AIR KICK REFRESH', 0.45, 12);
    burst(player.x, player.y, 4, 'resin', 0.32);
    return true;
  }

  function enterHyper() {
    if (player.hyper) return;
    player.hyper = true;
    player.hyperStartedAt = state.elapsed;
    S.getTelemetry().counters.crownvelocityEntries += 1;
    refreshAirJump('CROWNVELOCITY');
    recordEvent('crownvelocity-start', { combo: player.combo, variety: bitCount(player.comboKindsMask) });
    announce('CROWNVELOCITY', 1.05, 28);
    state.shake = Math.max(state.shake, 0.9);
    crownDrop();
  }

  function addComboLink(type, label, value = 1, bonusWindow = 0) {
    const now = state.elapsed;
    if (type === player.comboLastLinkType && now - player.comboLastLinkAt < TUNE.combo.duplicateLinkCooldown) return false;
    const telemetry = S.getTelemetry();
    if (player.combo === 0) player.comboStartedAt = now;
    if (telemetry.lastComboLinkAt != null) boundedPush(telemetry.samples.comboLinkIntervals, now - telemetry.lastComboLinkAt);
    telemetry.lastComboLinkAt = now;
    player.combo += value;
    player.comboTimer = Math.max(player.comboTimer, TUNE.combo.window + bonusWindow);
    player.comboLastLinkAt = now;
    player.comboLastLinkType = type;
    player.comboKindsMask |= COMBO_BITS[type] || 0;
    player.bestCombo = Math.max(player.bestCombo, player.combo);
    telemetry.counters.comboLinks += value;
    telemetry.maxima.combo = Math.max(telemetry.maxima.combo, player.combo);
    player.score += (36 + player.combo * 12) * value;
    recordEvent('combo-link', { link: type, value, combo: player.combo, variety: bitCount(player.comboKindsMask) });
    if (label) announce(`${player.combo}× · ${label}`, 0.48, player.hyper ? 16 : 13);
    if (!player.hyper && player.combo >= TUNE.combo.hyperThreshold && bitCount(player.comboKindsMask) >= TUNE.combo.hyperVariety) enterHyper();
    return true;
  }

  function bankCombo(reason = '') {
    if (player.combo <= 0) return;
    const telemetry = S.getTelemetry();
    const duration = Math.max(0, state.elapsed - player.comboStartedAt);
    boundedPush(telemetry.samples.comboDurations, duration);
    const variety = bitCount(player.comboKindsMask);
    const gain = Math.min(0.92, player.comboFloors * 0.026 + player.combo * 0.040 + variety * 0.035);
    player.resin += gain;
    while (player.resin >= 1 && player.saves < 2) {
      player.resin -= 1;
      player.saves += 1;
      announce('SAP CATCH READY', 1.1, 17);
      tone(520, 0.16, 0.04, 'triangle', 1.4);
    }
    telemetry.counters.comboBanks += 1;
    if (reason === 'TIME') telemetry.counters.comboTimeouts += 1;
    if (reason === 'DROP') telemetry.counters.comboDrops += 1;
    recordEvent('combo-bank', { reason, combo: player.combo, floors: player.comboFloors, variety, resin: S.round(gain, 3) });
    player.bestCombo = Math.max(player.bestCombo, player.combo);
    endHyper();
    player.combo = 0;
    player.comboFloors = 0;
    player.comboTimer = 0;
    player.comboStartedAt = 0;
    player.comboLastLinkAt = -99;
    player.comboLastLinkType = '';
    player.comboKindsMask = 0;
  }

  function onLand(branch) {
    const telemetry = S.getTelemetry();
    const delta = branch.floor - player.lastFloor;
    player.grounded = branch;
    player.groundedTime = 0;
    player.airJumps = TUNE.jump.airJumps;
    player.coyote = TUNE.jump.coyoteSeconds;
    player.y = S.branchYAt(branch, player.x) + state.PLAYER_R;
    player.vy = 0;
    player.squash = 1;
    player.state = 'grounded';
    telemetry.counters.landings += 1;

    if (branch.floor > player.highestFloor) {
      player.highestFloor = branch.floor;
      player.score += 12 + branch.floor * 0.16;
      telemetry.maxima.floor = Math.max(telemetry.maxima.floor, branch.floor);
      S.markRouteProgress(branch.floor);
    }

    if (delta >= 2) {
      player.comboFloors += delta;
      telemetry.counters.multiFloorSkips += 1;
      boundedPush(telemetry.samples.branchSkips, delta);
      player.score += delta * 42 * (1 + player.combo * 0.16);
      addComboLink('SKIP', `+${delta} FLOOR SKIP`, delta >= 4 ? 2 : 1, Math.min(0.34, delta * 0.04));
      tone(278 + player.combo * 28, 0.064, 0.03, 'triangle', 1.15);
      burst(player.x, player.y - state.PLAYER_R, 7 + Math.min(12, player.combo), player.hyper ? 'resin' : 'leaf', 0.55);
      recordEvent('skip', { floors: delta, combo: player.combo, route: branch.chunkType });
    } else if (delta === 1 && player.combo > 0) {
      player.comboTimer = Math.max(player.comboTimer, TUNE.combo.landingGrace);
      recordEvent('combo-touchdown', { route: branch.chunkType, floor: branch.floor });
    } else if (delta < 0) {
      bankCombo('DROP');
    }

    if (branch.floor > player.lastFloor) player.lastFloor = branch.floor;
  }

  function findSapTarget() {
    let best = null;
    let bestScore = Infinity;
    for (const knot of state.knots) {
      const dx = knot.x - player.x;
      const dy = knot.y - player.y;
      if (dy < -36 || dy > 365) continue;
      const distance = Math.hypot(dx, dy);
      if (distance > TUNE.sap.attachMax || distance < 52) continue;
      const aboveBias = dy * 0.32;
      const routeBias = knot.chunkType === 'CRUX' || knot.chunkType === 'SLINGSHOT' ? -18 : 0;
      const score = distance - aboveBias + routeBias;
      if (score < bestScore) {
        best = knot;
        bestScore = score;
      }
    }
    return best;
  }

  function attachSap() {
    if (player.sap || state.mode !== 'playing') return;
    const telemetry = S.getTelemetry();
    telemetry.counters.sapAttempts += 1;
    const knot = findSapTarget();
    if (!knot) {
      telemetry.counters.sapMisses += 1;
      recordEvent('sap-miss');
      tone(92, 0.035, 0.015, 'square', 0.8);
      return;
    }
    const distance = Math.hypot(knot.x - player.x, knot.y - player.y);
    player.sap = {
      knot,
      rest: clamp(distance * TUNE.sap.restRatio, TUNE.sap.restMin, TUNE.sap.restMax),
      maxStretch: 0,
      age: 0,
    };
    player.grounded = null;
    player.groundedTime = 0;
    player.state = 'sapline';
    telemetry.counters.sapAttaches += 1;
    recordEvent('sap-attach', { route: knot.chunkType, role: knot.role, distance: S.round(distance, 1) });
    tone(410, 0.06, 0.028, 'triangle', 1.28);
    burst(player.x, player.y, 5, 'resin', 0.35);
  }

  function releaseSap() {
    const sap = player.sap;
    if (!sap) return;
    const telemetry = S.getTelemetry();
    const dx = sap.knot.x - player.x;
    const dy = sap.knot.y - player.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const tx = -dy / distance;
    const ty = dx / distance;
    const tangentSpeed = player.vx * tx + player.vy * ty;
    const direction = Math.sign(tangentSpeed || player.facing);
    const surge = player.combo >= TUNE.combo.sapSurgeThreshold && sap.maxStretch >= TUNE.sap.surgeStretch;
    let stored = clamp(sap.maxStretch * TUNE.sap.releaseStretchGain, 0, TUNE.sap.releaseCap);
    if (surge) stored *= TUNE.sap.surgeMultiplier;
    if (player.hyper) stored *= TUNE.sap.hyperReleaseMultiplier;
    stored = Math.min(stored, TUNE.sap.releaseCap * 1.58);
    const before = Math.hypot(player.vx, player.vy);
    player.vx += tx * direction * stored;
    player.vy += ty * direction * stored + Math.max(0, stored * TUNE.sap.releaseUpFraction) + (surge ? TUNE.sap.surgeUpBonus : 0);
    const after = Math.hypot(player.vx, player.vy);
    const gain = after - before;
    telemetry.counters.sapReleases += 1;
    boundedPush(telemetry.samples.sapReleaseGain, gain);
    boundedPush(telemetry.samples.sapStretch, sap.maxStretch);
    boundedPush(telemetry.samples.sapDurations, sap.age);
    recordEvent('sap-release', {
      route: sap.knot.chunkType,
      stored: S.round(sap.maxStretch, 1),
      speedGain: S.round(gain, 1),
      seconds: S.round(sap.age, 3),
      surge,
    });
    player.sap = null;
    player.state = 'airborne-up';
    player.stretch = 1;
    if (gain >= TUNE.sap.comboReleaseGain || surge) {
      addComboLink('SAP', surge ? (player.hyper ? 'CROWN SLING' : 'SAP SURGE') : 'SAP SLING', surge ? 2 : 1, surge ? 0.28 : 0.08);
      if (surge) telemetry.counters.sapSurges += 1;
      refreshAirJump('SAP', surge);
    }
    state.shake = Math.max(state.shake, stored / 190);
    tone(300 + Math.min(360, stored), 0.09, 0.035, 'sawtooth', 1.45);
    burst(player.x, player.y, surge ? 16 : 8, 'resin', 0.6 + stored / 350);
  }

  function requestJump() {
    player.jumpBuffer = TUNE.jump.bufferSeconds;
    player.jumpHeld = true;
  }

  function doGroundJump(branch) {
    const telemetry = S.getTelemetry();
    const speed = Math.abs(player.vx);
    const momentumLift = Math.min(TUNE.jump.momentumCap, speed * TUNE.jump.momentumGain);
    const comboLift = Math.min(62, player.combo * TUNE.jump.comboLift);
    const onBurl = Boolean(branch?.launch) && Math.abs(player.x - branch.launchX) <= TUNE.jump.burlRadius;
    const burlLift = onBurl ? TUNE.jump.burlBoost : 0;
    player.vy = TUNE.jump.base + momentumLift + comboLift + burlLift;
    if (onBurl) {
      const direction = Math.sign(player.vx || (branch.side === 'right' ? -1 : 1));
      player.vx += direction * TUNE.jump.burlHorizontalBoost;
      telemetry.counters.launchBurls += 1;
      addComboLink('BURL', 'LAUNCH BURL', 1, 0.08);
      burst(branch.launchX, S.branchYAt(branch, branch.launchX), 10, 'resin', 0.62);
      tone(340, 0.07, 0.03, 'triangle', 1.7);
    }
    player.grounded = null;
    player.groundedTime = 0;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.airJumps = TUNE.jump.airJumps;
    player.state = 'airborne-up';
    player.stretch = 0.9;
    telemetry.counters.jumps += 1;
    boundedPush(telemetry.samples.jumpLaunchSpeeds, player.vy);
    recordEvent('jump', { vx: S.round(player.vx, 1), vy: S.round(player.vy, 1), burl: onBurl });
    tone(220 + speed * 0.13, 0.055, 0.025, 'triangle', 1.18);
    burst(player.x, player.y - state.PLAYER_R, 6, 'leaf', 0.35);
  }

  function doAirJump(input) {
    if (player.airJumps <= 0 || player.sap) return false;
    const telemetry = S.getTelemetry();
    const speed = Math.abs(player.vx);
    const direction = input !== 0 ? input : Math.sign(player.vx || player.facing || 1);
    const sameDirection = Math.sign(player.vx || direction) === direction;
    const horizontalImpulse = TUNE.jump.doubleHorizontalImpulse * (sameDirection ? 1 : 0.64);
    player.vx += direction * horizontalImpulse;
    const lift = TUNE.jump.doubleBase + Math.min(TUNE.jump.doubleMomentumCap, speed * TUNE.jump.doubleMomentumGain);
    player.vy = clamp(Math.max(0, player.vy) * 0.34 + lift, lift, TUNE.jump.doubleMaxVy);
    player.airJumps -= 1;
    player.jumpBuffer = 0;
    player.state = 'airborne-up';
    player.stretch = 1;
    telemetry.counters.doubleJumps += 1;
    boundedPush(telemetry.samples.airKickLaunchSpeeds, player.vy);
    addComboLink('AIR', 'AIR KICK', 1, 0.12);
    recordEvent('double-jump', { vx: S.round(player.vx, 1), vy: S.round(player.vy, 1) });
    tone(390 + speed * 0.08, 0.07, 0.034, 'triangle', 1.34);
    burst(player.x, player.y - 4, 10, 'leaf', 0.62);
    return true;
  }

  function rescueFromThreat() {
    if (player.saves <= 0) return false;
    const telemetry = S.getTelemetry();
    player.saves -= 1;
    player.sap = null;
    player.x = player.x < W / 2 ? state.LEFT_WALL + 48 : state.RIGHT_WALL - 48;
    player.y = state.threatY + 190;
    player.vx = player.x < W / 2 ? 435 : -435;
    player.vy = 655;
    player.airJumps = TUNE.jump.airJumps;
    player.lastFloor = Math.max(0, player.highestFloor - 3);
    bankCombo('CATCH');
    player.heat = 0;
    state.flash = 1;
    state.shake = 1.2;
    telemetry.counters.sapCatches += 1;
    const chunk = S.activeRouteChunk();
    if (chunk) routeStat(chunk.type).catches += 1;
    recordEvent('sap-catch', { route: chunk?.type || null });
    announce('SAP CATCH!', 1.05, 26);
    burst(player.x, player.y, 28, 'resin', 1.1);
    tone(210, 0.22, 0.055, 'sawtooth', 2.4);
    return true;
  }

  function getInputAxis() {
    let axis = 0;
    if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) axis -= 1;
    if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) axis += 1;
    for (const action of state.pointers.values()) {
      if (action === 'left') axis -= 1;
      if (action === 'right') axis += 1;
    }
    return clamp(axis, -1, 1);
  }

  function updateSap(input, dt) {
    const sap = player.sap;
    if (!sap) return { ax: 0, ay: 0 };
    sap.age += dt;
    const dx = sap.knot.x - player.x;
    const dy = sap.knot.y - player.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const tx = -ny;
    const ty = nx;
    const stretch = Math.max(0, distance - sap.rest);
    sap.maxStretch = Math.max(sap.maxStretch, stretch);
    const radialVelocity = player.vx * nx + player.vy * ny;
    const spring = stretch * TUNE.sap.springK;
    const damping = radialVelocity * TUNE.sap.radialDamping;
    const radialForce = Math.max(0, spring - damping);
    const tangentSpeed = player.vx * tx + player.vy * ty;
    const pumpBase = player.hyper ? TUNE.sap.hyperPumpAccel : TUNE.sap.pumpAccel;
    const pumpGain = 1 + clamp(Math.abs(tangentSpeed) / 780, 0, player.hyper ? 0.28 : 0.18);
    const pump = input * pumpBase * pumpGain;
    return {
      ax: nx * radialForce + tx * pump,
      ay: ny * radialForce + ty * pump,
    };
  }

  function collideBranches(previousY) {
    if (player.vy > 42) return;
    const previousBottom = previousY - state.PLAYER_R;
    const nowBottom = player.y - state.PLAYER_R;
    let landed = null;
    let landedY = -Infinity;
    for (const branch of state.branches) {
      if (player.x < branch.x1 - 7 || player.x > branch.x2 + 7) continue;
      const surface = S.branchYAt(branch, player.x);
      if (previousBottom + 2 >= surface && nowBottom <= surface + 3 && surface > landedY) {
        landed = branch;
        landedY = surface;
      }
    }
    if (landed) onLand(landed);
  }

  function bounceFromWall(side) {
    const incoming = Math.abs(player.vx);
    if (incoming < 70) return;
    const telemetry = S.getTelemetry();
    const sweet = S.barkSweetness(player.y, side);
    const horizontal = incoming * TUNE.rebound.retention * sweet + TUNE.rebound.horizontalBonus;
    const verticalLift = TUNE.rebound.verticalBase + Math.min(TUNE.rebound.verticalCap, incoming * TUNE.rebound.verticalGain * sweet);
    player.vx = side === 'left' ? horizontal : -horizontal;
    player.vy = Math.max(player.vy, verticalLift);
    player.facing = side === 'left' ? 1 : -1;
    player.grounded = null;
    player.groundedTime = 0;
    player.wallTimer = 0.12;
    player.state = 'wall-bounce';
    telemetry.counters.wallBounces += 1;
    boundedPush(telemetry.samples.reboundRetention, Math.abs(player.vx) / incoming);
    boundedPush(telemetry.samples.reboundVerticalLift, verticalLift);
    if (incoming >= TUNE.rebound.comboSpeed) addComboLink('BARK', 'BARK REBOUND', 1, 0.06);
    if (incoming >= TUNE.jump.wallRefreshSpeed) refreshAirJump('BARK');
    recordEvent('wall-bounce', {
      side,
      retention: S.round(Math.abs(player.vx) / incoming, 3),
      verticalLift: S.round(verticalLift, 1),
      sweet: S.round(sweet, 3),
    });
    state.shake = Math.max(state.shake, incoming / 850);
    burst(player.x + (side === 'left' ? -state.PLAYER_R : state.PLAYER_R), player.y, 7, 'bark', 0.48);
    tone(150 + incoming * 0.12, 0.055, 0.025, 'square', 1.32);
  }

  function collideWalls() {
    const left = state.LEFT_WALL + state.PLAYER_R;
    const right = state.RIGHT_WALL - state.PLAYER_R;
    if (player.x < left) {
      player.x = left;
      if (player.vx < -70) bounceFromWall('left');
    } else if (player.x > right) {
      player.x = right;
      if (player.vx > 70) bounceFromWall('right');
    }
  }

  function threadRings() {
    for (const ring of state.rings) {
      if (ring.hit) continue;
      const dx = ring.x - player.x;
      const dy = ring.y - player.y;
      if (Math.abs(dy) > ring.radius + 30 || Math.abs(dx) > ring.radius + 30) continue;
      if (Math.hypot(dx, dy) > ring.radius + state.PLAYER_R * 0.72) continue;
      ring.hit = true;
      const telemetry = S.getTelemetry();
      telemetry.counters.ringsThreaded += 1;
      const speed = Math.hypot(player.vx, player.vy);
      const value = speed >= TUNE.ring.speedBonusStart ? 2 : 1;
      addComboLink('RING', value > 1 ? 'FAST RESIN THREAD' : 'RESIN THREAD', value, value > 1 ? 0.18 : 0.08);
      refreshAirJump('RING', value > 1);
      player.score += TUNE.ring.score * value;
      burst(ring.x, ring.y, 14, 'resin', 0.72 + value * 0.15);
      tone(520 + Math.min(280, speed * 0.18), 0.075, 0.032, 'sine', 1.42);
      recordEvent('ring-thread', { floor: ring.floor, route: ring.chunkType, speed: S.round(speed, 1), value });
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      particle.vy -= 380 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.985, dt * 120);
    }
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      state.messages[i].life -= dt;
      if (state.messages[i].life <= 0) state.messages.splice(i, 1);
    }
  }

  function updateTelemetry(dt) {
    const telemetry = S.getTelemetry();
    const grounded = Boolean(player.grounded);
    const speed = Math.hypot(player.vx, player.vy);
    const threatGap = player.y - state.threatY;
    telemetry.sums.sampleTime += dt;
    telemetry.sums.speed += speed * dt;
    telemetry.sums.absVx += Math.abs(player.vx) * dt;
    telemetry.sums.threatGap += threatGap * dt;
    telemetry.maxima.speed = Math.max(telemetry.maxima.speed, speed);
    telemetry.maxima.absVx = Math.max(telemetry.maxima.absVx, Math.abs(player.vx));
    telemetry.maxima.upwardVy = Math.max(telemetry.maxima.upwardVy, player.vy);
    telemetry.minThreatGap = Math.min(telemetry.minThreatGap, threatGap);
    if (grounded) telemetry.time.grounded += dt;
    else telemetry.time.airborne += dt;
    if (player.sap) telemetry.time.sapline += dt;
    if (player.hyper) telemetry.time.hyper += dt;
    if (Math.abs(player.vx) < TUNE.combo.hesitationSpeed) telemetry.time.lowMomentum += dt;
    if (threatGap < 180) telemetry.time.nearThreat += dt;

    if (telemetry.lastGrounded && !grounded) telemetry.airborneStartedAt = state.elapsed;
    if (!telemetry.lastGrounded && grounded && telemetry.airborneStartedAt != null) {
      boundedPush(telemetry.samples.airtimeDurations, Math.max(0, state.elapsed - telemetry.airborneStartedAt));
      telemetry.airborneStartedAt = null;
    }
    telemetry.lastGrounded = grounded;
  }

  function comboDecayScale() {
    if (player.sap) return TUNE.combo.saplineDecayScale;
    if (player.vy > 250) return TUNE.combo.ascentDecayScale;
    if (Math.abs(player.vx) > 360) return TUNE.combo.highMomentumDecayScale;
    if (player.grounded && player.groundedTime < TUNE.combo.landingGrace) return 0.62;
    if (Math.abs(player.vx) < TUNE.combo.hesitationSpeed && player.vy < 180) return TUNE.combo.hesitationDecayScale;
    return 1;
  }

  function threatSpeed() {
    const gap = player.y - state.threatY;
    const rubber = clamp((gap - TUNE.threat.targetGap) / TUNE.threat.targetGap, -0.65, 1.45);
    const baseline = TUNE.threat.baseSpeed
      + Math.min(92, state.elapsed * TUNE.threat.timeGain)
      + Math.min(62, player.highestFloor * TUNE.threat.floorGain);
    const phase = S.phaseForFloor(player.highestFloor);
    return clamp((baseline + rubber * TUNE.threat.rubberGain) * phase.pressure, TUNE.threat.minSpeed, TUNE.threat.maxSpeed);
  }

  function update(dt) {
    if (state.mode !== 'playing') {
      updateParticles(dt);
      return;
    }

    state.elapsed += dt;
    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.shake = Math.max(0, state.shake - dt * 2.8);
    state.scorchCooldown = Math.max(0, state.scorchCooldown - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    player.coyote = Math.max(0, player.coyote - dt);
    player.wallTimer = Math.max(0, player.wallTimer - dt);
    if (player.combo > 0) player.comboTimer = Math.max(0, player.comboTimer - dt * comboDecayScale());
    player.squash = Math.max(0, player.squash - dt * 7);
    player.stretch = Math.max(0, player.stretch - dt * 5);
    player.heat = Math.max(0, player.heat - dt * 0.75);

    if (player.combo > 0 && player.comboTimer <= 0) bankCombo('TIME');

    const input = getInputAxis();
    if (input !== 0) player.facing = input;
    player.px = player.x;
    player.py = player.y;
    const previousY = player.y;
    const wasGrounded = Boolean(player.grounded);
    const groundedBranch = player.grounded;

    if (wasGrounded) {
      player.groundedTime += dt;
      player.coyote = TUNE.jump.coyoteSeconds;
      player.vy = 0;
      if (player.combo > 0 && groundedBranch?.chunkType === 'RECOVERY' && player.groundedTime >= TUNE.combo.recoveryBankDelay) {
        bankCombo('RECOVERY');
      }
    } else {
      player.groundedTime = 0;
    }

    if (player.jumpBuffer > 0) {
      if (wasGrounded || player.coyote > 0) doGroundJump(groundedBranch);
      else if (player.airJumps > 0 && !player.sap) doAirJump(input);
    }

    const maxSpeed = TUNE.run.maxSpeed + Math.min(230, player.combo * 18) + (player.hyper ? 58 : 0);
    const speedRatio = clamp(Math.abs(player.vx) / maxSpeed, 0, 1);
    let accel = player.grounded ? TUNE.run.groundAccel : TUNE.run.airAccel * S.lerp(1, 0.44, speedRatio);
    if (!player.grounded && input !== 0 && Math.sign(input) !== Math.sign(player.vx) && Math.abs(player.vx) > 40) {
      accel *= TUNE.run.reverseAirScale;
    }
    player.vx += input * accel * dt;
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

    if (player.grounded && input === 0) player.vx *= Math.pow(TUNE.run.groundFriction60Hz, dt * 60);
    else if (!player.grounded) player.vx *= Math.pow(TUNE.run.airDrag120Hz, dt * 120);

    const sapForce = updateSap(input, dt);
    player.vx += sapForce.ax * dt;
    if (!player.grounded) player.vy += (state.GRAVITY + sapForce.ay) * dt;
    else player.vy = 0;

    if (!player.jumpHeld && player.vy > 280 && !player.sap) player.vy *= Math.pow(TUNE.jump.cutDrag120Hz, dt * 120);

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.grounded) {
      const branch = player.grounded;
      if (player.x < branch.x1 - 8 || player.x > branch.x2 + 8) {
        player.grounded = null;
        player.groundedTime = 0;
        player.state = 'airborne-down';
      } else {
        player.y = S.branchYAt(branch, player.x) + state.PLAYER_R;
        player.vy = 0;
      }
    }

    collideWalls();
    threadRings();
    if (!player.grounded) collideBranches(previousY);

    if (!player.grounded && !player.sap && player.state !== 'wall-bounce') {
      player.state = player.vy > 20 ? 'airborne-up' : 'airborne-down';
    }
    if (player.sap) player.state = 'sapline';

    const speed = Math.hypot(player.vx, player.vy);
    player.score += dt * (1 + speed * 0.0025) * (player.combo > 0 ? 1 + player.combo * 0.075 : 1);
    state.threatY += threatSpeed() * dt;

    const threatGap = player.y - state.threatY;
    if (threatGap < TUNE.threat.burnGap && state.scorchCooldown <= 0) {
      state.scorchCooldown = TUNE.threat.burnCooldown;
      player.heat = 1;
      player.vx *= 0.42;
      player.vy = Math.max(player.vy, 235);
      bankCombo('SCORCHED');
      const telemetry = S.getTelemetry();
      telemetry.counters.momentumBurns += 1;
      const chunk = S.activeRouteChunk();
      if (chunk) routeStat(chunk.type).burns += 1;
      recordEvent('momentum-burn', { gap: S.round(threatGap, 1), route: chunk?.type || null });
      state.shake = 0.8;
      state.flash = Math.max(state.flash, 0.35);
      announce('MOMENTUM BURN', 0.78, 17);
      tone(110, 0.14, 0.05, 'sawtooth', 0.62);
    }

    if (threatGap < -TUNE.threat.rescueDepth) rescueFromThreat();
    if (player.y - state.threatY < -TUNE.threat.deathDepth && player.saves <= 0) endRun();

    const lookAhead = clamp(
      Math.max(0, player.vy) * TUNE.camera.verticalLookahead + Math.abs(player.vx) * TUNE.camera.horizontalLookahead,
      0,
      TUNE.camera.maxLookahead
    );
    const targetCamera = player.y - TUNE.camera.verticalAnchor - lookAhead;
    const pressureCamera = state.threatY - 18;
    state.cameraBottom = Math.max(
      state.cameraBottom,
      pressureCamera,
      S.lerp(state.cameraBottom, targetCamera, clamp(dt * TUNE.camera.follow, 0, 1))
    );

    S.recycleWorld();
    updateTelemetry(dt);
    updateParticles(dt);
  }

  S.resetRun = resetRun;
  S.startRun = startRun;
  S.endRun = endRun;
  S.bankCombo = bankCombo;
  S.addComboLink = addComboLink;
  S.attachSap = attachSap;
  S.releaseSap = releaseSap;
  S.requestJump = requestJump;
  S.threatSpeed = threatSpeed;
  S.update = update;
})();
