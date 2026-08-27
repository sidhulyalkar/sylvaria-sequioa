(() => {
  'use strict';

  const canvas = document.querySelector('#c');
  const wrap = document.querySelector('#wrap');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = canvas.width;
  const H = canvas.height;

  const TUNE = {
    run: {
      groundAccel: 2740,
      airAccel: 1240,
      maxSpeed: 585,
      groundFriction60Hz: 0.82,
      airDrag120Hz: 0.9975,
      reverseAirScale: 0.74,
    },
    jump: {
      base: 548,
      momentumGain: 0.48,
      momentumCap: 310,
      comboLift: 6,
      cutDrag120Hz: 0.989,
      bufferSeconds: 0.11,
      coyoteSeconds: 0.095,
      airJumps: 1,
      doubleBase: 438,
      doubleMomentumGain: 0.22,
      doubleMomentumCap: 125,
      doubleHorizontalImpulse: 112,
      doubleMaxVy: 775,
      wallRefreshSpeed: 245,
      sapRefreshGain: 26,
      burlBoost: 108,
      burlHorizontalBoost: 42,
      burlRadius: 68,
    },
    rebound: {
      retention: 0.92,
      horizontalBonus: 38,
      verticalBase: 188,
      verticalGain: 0.39,
      verticalCap: 318,
      sweetSpotAmplitude: 0.085,
      comboSpeed: 225,
    },
    sap: {
      attachMax: 382,
      restRatio: 0.72,
      restMin: 88,
      restMax: 205,
      springK: 24.5,
      radialDamping: 5.0,
      pumpAccel: 1510,
      hyperPumpAccel: 1940,
      releaseStretchGain: 2.20,
      releaseCap: 302,
      releaseUpFraction: 0.31,
      comboReleaseGain: 25,
      surgeStretch: 46,
      surgeMultiplier: 1.30,
      hyperReleaseMultiplier: 1.17,
      surgeUpBonus: 78,
    },
    combo: {
      window: 2.95,
      ascentDecayScale: 0.42,
      saplineDecayScale: 0.36,
      highMomentumDecayScale: 0.72,
      hesitationSpeed: 132,
      hesitationDecayScale: 2.0,
      landingGrace: 1.12,
      recoveryBankDelay: 0.72,
      duplicateLinkCooldown: 0.11,
      sapSurgeThreshold: 5,
      hyperThreshold: 7,
      hyperVariety: 3,
    },
    ring: {
      baseRadius: 27,
      minRadius: 19,
      speedBonusStart: 300,
      score: 72,
    },
    threat: {
      baseSpeed: 35,
      timeGain: 0.46,
      floorGain: 0.23,
      targetGap: 470,
      rubberGain: 72,
      minSpeed: 24,
      maxSpeed: 184,
      burnGap: 47,
      rescueDepth: 74,
      deathDepth: 104,
      burnCooldown: 0.72,
    },
    camera: {
      verticalAnchor: 184,
      verticalLookahead: 0.092,
      horizontalLookahead: 0.022,
      maxLookahead: 108,
      follow: 4.9,
      hyperWideView: 0.032,
      speedWideView: 0.024,
    },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const round = (value, digits = 2) => Number(value.toFixed(digits));

  function makeRng(seed) {
    let value = seed >>> 0 || 1;
    return {
      next() {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 4294967296;
      },
      get seed() {
        return value >>> 0;
      },
    };
  }

  const visualRng = makeRng(0x7193bd1);
  const stars = Array.from({ length: 118 }, () => ({
    x: visualRng.next() * W,
    y: visualRng.next() * H,
    r: 0.35 + visualRng.next() * 1.45,
    alpha: 0.10 + visualRng.next() * 0.58,
    parallax: 0.10 + visualRng.next() * 0.45,
  }));

  const state = {
    FIXED_DT: 1 / 120,
    MAX_STEPS: 8,
    GRAVITY: -1900,
    LEFT_WALL: 154,
    RIGHT_WALL: 806,
    PLAYER_R: 15,
    touchMode: matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    routeRng: makeRng(0x51a7f00d),
    fxRng: makeRng(0xa51ce55),
    runSeed: 1,
    mode: 'title',
    pausedFrom: 'playing',
    accumulator: 0,
    lastTime: performance.now(),
    elapsed: 0,
    cameraBottom: -82,
    threatY: -270,
    generatedY: 70,
    generatedFloor: 0,
    routeChunkIndex: 0,
    lastSide: 'left',
    flash: 0,
    shake: 0,
    scorchCooldown: 0,
    telemetryVisible: false,
    highScore: Number(localStorage.getItem('sylvaria.sequoia.highscore') || 0),
    audio: null,
    keys: new Set(),
    pointers: new Map(),
    branches: [],
    knots: [],
    rings: [],
    particles: [],
    messages: [],
    branchPool: [],
    knotPool: [],
    ringPool: [],
    chunks: [],
    stars,
  };

  const player = {
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
  };

  function freshTelemetry(seed) {
    return {
      seed,
      version: '0.3.0',
      startedAt: performance.now(),
      finishedAt: null,
      counters: {
        jumps: 0,
        doubleJumps: 0,
        airJumpRefreshes: 0,
        landings: 0,
        multiFloorSkips: 0,
        wallBounces: 0,
        launchBurls: 0,
        ringsThreaded: 0,
        sapAttempts: 0,
        sapAttaches: 0,
        sapReleases: 0,
        sapMisses: 0,
        sapSurges: 0,
        comboLinks: 0,
        comboBanks: 0,
        comboTimeouts: 0,
        comboDrops: 0,
        crownvelocityEntries: 0,
        momentumBurns: 0,
        sapCatches: 0,
      },
      time: {
        airborne: 0,
        grounded: 0,
        sapline: 0,
        hyper: 0,
        lowMomentum: 0,
        nearThreat: 0,
      },
      sums: {
        speed: 0,
        absVx: 0,
        threatGap: 0,
        sampleTime: 0,
      },
      maxima: {
        speed: 0,
        absVx: 0,
        upwardVy: 0,
        combo: 0,
        floor: 0,
      },
      samples: {
        airtimeDurations: [],
        jumpLaunchSpeeds: [],
        airKickLaunchSpeeds: [],
        reboundRetention: [],
        reboundVerticalLift: [],
        sapReleaseGain: [],
        sapStretch: [],
        sapDurations: [],
        branchSkips: [],
        comboDurations: [],
        comboLinkIntervals: [],
      },
      routeStats: {},
      events: [],
      lastGrounded: true,
      airborneStartedAt: null,
      lastComboLinkAt: null,
      minThreatGap: Infinity,
    };
  }

  let telemetry = freshTelemetry(state.runSeed);

  function boundedPush(array, value, max = 96) {
    array.push(value);
    if (array.length > max) array.shift();
  }

  function recordEvent(type, data = {}) {
    telemetry.events.push({ t: round(state.elapsed, 3), type, ...data });
    if (telemetry.events.length > 360) telemetry.events.shift();
  }

  function routeStat(type) {
    telemetry.routeStats[type] ||= {
      generated: 0,
      attempts: 0,
      completions: 0,
      failures: 0,
      burns: 0,
      catches: 0,
      durationTotal: 0,
    };
    return telemetry.routeStats[type];
  }

  function summarizeTelemetry() {
    const activeTime = Math.max(0.001, telemetry.sums.sampleTime);
    const routeStats = Object.fromEntries(Object.entries(telemetry.routeStats).map(([name, stat]) => [name, {
      ...stat,
      completionRate: stat.attempts ? round(stat.completions / stat.attempts, 3) : 0,
      avgCompletionSeconds: stat.completions ? round(stat.durationTotal / stat.completions, 3) : 0,
    }]));
    return {
      version: telemetry.version,
      seed: telemetry.seed,
      runSeconds: round(state.elapsed, 3),
      floor: player.highestFloor,
      score: Math.floor(player.score),
      bestCombo: player.bestCombo,
      counters: { ...telemetry.counters },
      movement: {
        airborneRatio: round(telemetry.time.airborne / activeTime, 3),
        groundedRatio: round(telemetry.time.grounded / activeTime, 3),
        saplineRatio: round(telemetry.time.sapline / activeTime, 3),
        crownvelocityRatio: round(telemetry.time.hyper / activeTime, 3),
        lowMomentumRatio: round(telemetry.time.lowMomentum / activeTime, 3),
        nearThreatRatio: round(telemetry.time.nearThreat / activeTime, 3),
        avgSpeed: round(telemetry.sums.speed / activeTime, 1),
        avgAbsVx: round(telemetry.sums.absVx / activeTime, 1),
        peakSpeed: round(telemetry.maxima.speed, 1),
        peakAbsVx: round(telemetry.maxima.absVx, 1),
        peakUpwardVy: round(telemetry.maxima.upwardVy, 1),
        avgAirtimeSeconds: round(mean(telemetry.samples.airtimeDurations), 3),
        minThreatGap: Number.isFinite(telemetry.minThreatGap) ? round(telemetry.minThreatGap, 1) : null,
        avgThreatGap: round(telemetry.sums.threatGap / activeTime, 1),
      },
      rebound: {
        avgRetention: round(mean(telemetry.samples.reboundRetention), 3),
        avgVerticalLift: round(mean(telemetry.samples.reboundVerticalLift), 1),
      },
      sapline: {
        attachRate: telemetry.counters.sapAttempts ? round(telemetry.counters.sapAttaches / telemetry.counters.sapAttempts, 3) : 0,
        avgReleaseSpeedGain: round(mean(telemetry.samples.sapReleaseGain), 1),
        avgMaxStretch: round(mean(telemetry.samples.sapStretch), 1),
        avgAttachedSeconds: round(mean(telemetry.samples.sapDurations), 3),
      },
      combo: {
        avgSkipFloors: round(mean(telemetry.samples.branchSkips), 2),
        avgComboSeconds: round(mean(telemetry.samples.comboDurations), 3),
        avgLinkInterval: round(mean(telemetry.samples.comboLinkIntervals), 3),
        maxCombo: telemetry.maxima.combo,
      },
      routeStats,
      tuning: JSON.parse(JSON.stringify(TUNE)),
      events: [...telemetry.events],
    };
  }

  function replaceTelemetry(seed) {
    telemetry = freshTelemetry(seed);
  }

  function tone(freq, duration = 0.07, gain = 0.035, type = 'sine', slide = 1) {
    try {
      if (!state.audio) state.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (state.audio.state === 'suspended') state.audio.resume();
      const oscillator = state.audio.createOscillator();
      const amp = state.audio.createGain();
      const now = state.audio.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(38, freq * slide), now + duration);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(amp).connect(state.audio.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.025);
    } catch {}
  }

  function crownDrop() {
    tone(72, 0.26, 0.07, 'sine', 0.60);
    setTimeout(() => tone(144, 0.14, 0.047, 'triangle', 1.38), 34);
    setTimeout(() => tone(288, 0.11, 0.03, 'sine', 1.18), 78);
    setTimeout(() => tone(432, 0.08, 0.022, 'triangle', 1.10), 118);
  }

  function announce(text, life = 1.0, size = 18) {
    state.messages.push({ text, life, maxLife: life, size });
    if (state.messages.length > 8) state.messages.shift();
  }

  function burst(x, y, count, kind = 'leaf', power = 1) {
    for (let i = 0; i < count; i += 1) {
      const angle = state.fxRng.next() * Math.PI * 2;
      const speed = (65 + state.fxRng.next() * 245) * power;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 70,
        life: 0.32 + state.fxRng.next() * 0.58,
        maxLife: 0.9,
        r: 1.4 + state.fxRng.next() * 4,
        kind,
      });
    }
    if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
  }

  function setTuning(section, key, value) {
    if (!Object.prototype.hasOwnProperty.call(TUNE, section)) return false;
    if (!Object.prototype.hasOwnProperty.call(TUNE[section], key)) return false;
    if (typeof TUNE[section][key] !== 'number' || !Number.isFinite(value)) return false;
    TUNE[section][key] = Number(value);
    recordEvent('tuning-change', { section, key, value: Number(value) });
    return true;
  }

  window.SylvariaSequoia = {
    canvas,
    wrap,
    ctx,
    W,
    H,
    TUNE,
    state,
    player,
    clamp,
    lerp,
    mean,
    round,
    makeRng,
    boundedPush,
    recordEvent,
    routeStat,
    summarizeTelemetry,
    replaceTelemetry,
    getTelemetry: () => telemetry,
    tone,
    crownDrop,
    announce,
    burst,
    setTuning,
  };
})();
