(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.startRun || !S?.resetRun || !S?.summarizeTelemetry || !S?.canopyDirector || !S?.canopyProgress) return;

  const { state, player, recordEvent } = S;
  const baseUpdate = S.update;
  const baseStartRun = S.startRun;
  const baseResetRun = S.resetRun;
  const baseSummarizeTelemetry = S.summarizeTelemetry;

  const VERSION = 'mastery-lab-v1';
  const REVISION = 'v0.6.2-evidence-loop-v1';
  const HISTORY_KEY = 'sylvaria.sequoia.masteryRuns.v1';
  const HISTORY_LIMIT = 24;
  const CROWN_INTERVAL = 25;
  const NEAR_CROWN_FLOORS = 4;
  const STAGE_IDS = ['BREATHE', 'BUILD', 'TEST', 'CROWN'];

  const round = (value, digits = 3) => Number(Number(value || 0).toFixed(digits));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value
        .filter((run) => run && Number.isFinite(Number(run.floor)) && Number.isFinite(Number(run.seed)))
        .slice(-HISTORY_LIMIT);
    } catch {
      return [];
    }
  }

  function writeHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT))); } catch { /* private mode / quota */ }
  }

  function emptyStageMap() {
    return Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  }

  function freshCurrent(seed, retry = {}) {
    return {
      seed: Number(seed) || 1,
      peakFloor: 0,
      lastStage: 'BREATHE',
      lastPhase: 'ROOTWAYS',
      lastRoute: null,
      maxPressure: 0,
      stageSeconds: emptyStageMap(),
      stageNearThreatSeconds: emptyStageMap(),
      sameSeedRetry: Boolean(retry.sameSeedRetry),
      restartLatencySeconds: Number.isFinite(retry.restartLatencySeconds) ? round(retry.restartLatencySeconds) : null,
    };
  }

  let history = readHistory();
  let lastRun = history.at(-1) || null;
  let current = freshCurrent(state.runSeed);
  let gameOverWallClock = null;

  function stageState() {
    return S.canopyDirector?.getState?.() || { stage: 'BREATHE', phase: 'ROOTWAYS', pressure: 1 };
  }

  function currentRoute() {
    const chunk = S.activeRouteChunk?.();
    return chunk?.type || null;
  }

  function sampleCurrent(dt) {
    if (state.mode !== 'playing') return;
    const director = stageState();
    const stage = STAGE_IDS.includes(director.stage) ? director.stage : 'BREATHE';
    current.peakFloor = Math.max(current.peakFloor, Number(player.highestFloor) || 0);
    current.lastStage = stage;
    current.lastPhase = director.phase || S.phaseForFloor?.(player.highestFloor)?.name || 'ROOTWAYS';
    current.lastRoute = currentRoute() || current.lastRoute;
    current.maxPressure = Math.max(current.maxPressure, Number(director.pressure) || 0);
    current.stageSeconds[stage] += dt;
    if (player.y - state.threatY < 180) current.stageNearThreatSeconds[stage] += dt;
  }

  function nearCrownForFloor(floor) {
    const next = (Math.floor(Math.max(0, floor) / CROWN_INTERVAL) + 1) * CROWN_INTERVAL;
    const gap = Math.max(0, next - floor);
    return gap > 0 && gap <= NEAR_CROWN_FLOORS ? { floor: next, gap } : null;
  }

  function routeFailureCount(telemetry) {
    return Object.values(telemetry.routeStats || {}).reduce((sum, stat) => sum + (Number(stat.failures) || 0), 0);
  }

  function stageRatios(seconds, nearSeconds) {
    return Object.fromEntries(STAGE_IDS.map((id) => {
      const total = Number(seconds[id]) || 0;
      return [id, total > 0 ? round((Number(nearSeconds[id]) || 0) / total) : 0];
    }));
  }

  function nextLineFor(run) {
    if (run.nearCrownGap != null) return `${run.nearCrownGap}F TO CROWN ${run.nearCrownFloor} · RUN IT BACK`;
    if (run.sapBlockedPresses >= Math.max(2, run.sapUses) && run.sapBlockedPresses > run.sapRecharges + 1) {
      return 'LAND HIGHER BEFORE THE NEXT SHIFT';
    }
    if (run.momentumBurns >= 2 || run.nearThreatRatio >= 0.18) return 'PROTECT THE THREAT GAP THROUGH TEST SECTIONS';
    if (run.lowMomentumRatio >= 0.42 && run.floor >= 25) return 'CARRY SPEED OFF RECOVERY LOGS';
    if (run.routeFailures > 0 && run.route) return `REHEARSE ${run.route} · CLEAN EXIT FIRST`;
    if (run.sapCatches > 0) return 'THE CATCH SAVED IT · CLEANER EXIT NEXT';
    if (run.latestSplitDeltaSeconds != null && run.latestSplitDeltaSeconds > 0.15) return 'RECLAIM THE LAST CROWN SPLIT';
    return 'CHASE THE NEXT CLEAN CROWN SPLIT';
  }

  function compactRunSnapshot() {
    const telemetry = S.getTelemetry();
    const activeTime = Math.max(0.001, Number(telemetry.sums?.sampleTime) || 0);
    const director = stageState();
    const progress = S.canopyProgress?.getState?.() || {};
    const authority = S.sapAuthority?.getState?.() || {};
    const floor = Math.max(current.peakFloor, Number(player.highestFloor) || 0);
    const nearCrown = nearCrownForFloor(floor);
    const seconds = Math.max(0, Number(state.elapsed) || 0);
    const stageSeconds = Object.fromEntries(STAGE_IDS.map((id) => [id, round(current.stageSeconds[id])]));
    const stageNearThreat = stageRatios(current.stageSeconds, current.stageNearThreatSeconds);
    const run = {
      schema: 1,
      seed: Number(state.runSeed) || current.seed,
      floor,
      band: Math.floor(floor / CROWN_INTERVAL) * CROWN_INTERVAL,
      seconds: round(seconds),
      score: Math.floor(player.score || 0),
      bestCombo: Number(player.bestCombo) || 0,
      floorsPerMinute: seconds > 0 ? round((floor / seconds) * 60, 1) : 0,
      phase: director.phase || current.lastPhase,
      stage: director.stage || current.lastStage,
      route: currentRoute() || current.lastRoute,
      pressure: round(director.pressure || current.maxPressure),
      maxPressure: round(current.maxPressure),
      nearCrownFloor: nearCrown?.floor || null,
      nearCrownGap: nearCrown?.gap || null,
      nearThreatRatio: round((Number(telemetry.time?.nearThreat) || 0) / activeTime),
      lowMomentumRatio: round((Number(telemetry.time?.lowMomentum) || 0) / activeTime),
      momentumBurns: Number(telemetry.counters?.momentumBurns) || 0,
      sapCatches: Number(telemetry.counters?.sapCatches) || 0,
      sapBlockedPresses: Number(telemetry.counters?.sapAuthorityBlockedPresses) || 0,
      sapUses: Number(telemetry.counters?.sapAuthorityUses ?? authority.nodeUses) || 0,
      sapRecharges: Number(telemetry.counters?.sapAuthorityRecharges ?? authority.recharges) || 0,
      routeFailures: routeFailureCount(telemetry),
      latestSplitFloor: progress.latestSplit?.floor || null,
      latestSplitDeltaSeconds: Number.isFinite(progress.latestSplit?.deltaSeconds) ? round(progress.latestSplit.deltaSeconds) : null,
      runFloorGain: Number(progress.runFloorGain) || 0,
      sameSeedRetry: current.sameSeedRetry,
      restartLatencySeconds: current.restartLatencySeconds,
      stageSeconds,
      stageNearThreat,
    };
    run.nextLine = nextLineFor(run);
    return run;
  }

  function bandHealth(runs) {
    const maxFloor = runs.reduce((max, run) => Math.max(max, Number(run.floor) || 0), 0);
    const maxBand = Math.floor(maxFloor / CROWN_INTERVAL) * CROWN_INTERVAL;
    const bands = [];
    for (let floor = 0; floor <= maxBand; floor += CROWN_INTERVAL) {
      const reached = runs.filter((run) => run.floor >= floor).length;
      if (!reached) continue;
      const cleared = runs.filter((run) => run.floor >= floor + CROWN_INTERVAL).length;
      const deaths = runs.filter((run) => run.floor >= floor && run.floor < floor + CROWN_INTERVAL).length;
      bands.push({
        floor,
        reached,
        cleared,
        deaths,
        completionRate: round(cleared / reached),
      });
    }
    return bands;
  }

  function difficultyHealth(runs = history) {
    const bounded = runs.slice(-HISTORY_LIMIT);
    const bands = bandHealth(bounded);
    let cliff = null;
    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1];
      const currentBand = bands[index];
      if (
        previous.reached >= 3 && currentBand.reached >= 3
        && previous.completionRate >= 0.55
        && currentBand.completionRate <= 0.35
        && previous.completionRate - currentBand.completionRate >= 0.25
      ) {
        cliff = {
          floor: currentBand.floor,
          completionRate: currentBand.completionRate,
          previousCompletionRate: previous.completionRate,
          deaths: currentBand.deaths,
        };
        break;
      }
    }

    const stageDeaths = Object.fromEntries(STAGE_IDS.map((id) => [id, bounded.filter((run) => run.stage === id).length]));
    const lastFour = bounded.slice(-4).map((run) => run.floor);
    const priorFour = bounded.slice(-8, -4).map((run) => run.floor);
    const recentMedian = median(lastFour);
    const previousMedian = median(priorFour);
    const restartSamples = bounded.map((run) => run.restartLatencySeconds).filter(Number.isFinite);

    return {
      runsAnalyzed: bounded.length,
      recentBestFloor: bounded.reduce((max, run) => Math.max(max, run.floor || 0), 0),
      recentMedianFloor: recentMedian == null ? null : round(recentMedian, 1),
      medianFloorDelta: recentMedian != null && previousMedian != null ? round(recentMedian - previousMedian, 1) : null,
      sameSeedRetryRate: bounded.length ? round(bounded.filter((run) => run.sameSeedRetry).length / bounded.length) : 0,
      medianRestartSeconds: restartSamples.length ? round(median(restartSamples)) : null,
      stageDeaths,
      bands,
      difficultyCliff: cliff,
      interpretation: cliff
        ? `Possible difficulty cliff entering floor ${cliff.floor}`
        : bounded.length >= 6
          ? 'No measured 25-floor cliff in the local sample'
          : 'More completed runs are needed for a stable cliff signal',
    };
  }

  function finalizeRun() {
    const run = compactRunSnapshot();
    history = [...history, run].slice(-HISTORY_LIMIT);
    lastRun = run;
    writeHistory();
    gameOverWallClock = performance.now();
    recordEvent('mastery-run-finalized', {
      floor: run.floor,
      band: run.band,
      stage: run.stage,
      route: run.route,
      nearCrownGap: run.nearCrownGap,
      sameSeedRetry: run.sameSeedRetry,
    });
    return run;
  }

  function resetCurrent(seed, retry = {}) {
    current = freshCurrent(seed, retry);
  }

  function update(dt) {
    const wasPlaying = state.mode === 'playing';
    sampleCurrent(dt);
    baseUpdate(dt);
    if (wasPlaying && state.mode === 'gameover') finalizeRun();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetCurrent(state.runSeed);
    return result;
  }

  function startRun(seed) {
    const priorGameOverAt = gameOverWallClock;
    const priorCompleted = lastRun;
    const result = baseStartRun(seed);
    const latencySeconds = priorGameOverAt == null ? null : Math.max(0, (performance.now() - priorGameOverAt) / 1000);
    resetCurrent(state.runSeed, {
      sameSeedRetry: Boolean(priorGameOverAt != null && priorCompleted && Number(priorCompleted.seed) === Number(state.runSeed)),
      restartLatencySeconds: latencySeconds,
    });
    gameOverWallClock = null;
    return result;
  }

  function summarizeTelemetry() {
    const summary = baseSummarizeTelemetry();
    return {
      ...summary,
      mastery: {
        version: VERSION,
        revision: REVISION,
        localOnly: true,
        adaptsDifficulty: false,
        historyLimit: HISTORY_LIMIT,
        current: compactRunSnapshot(),
        lastCompleted: lastRun ? copy(lastRun) : null,
        rolling: difficultyHealth(),
      },
    };
  }

  function clearHistory() {
    history = [];
    lastRun = null;
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* private mode */ }
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.summarizeTelemetry = summarizeTelemetry;
  S.masteryLab = {
    version: VERSION,
    revision: REVISION,
    storageKey: HISTORY_KEY,
    historyLimit: HISTORY_LIMIT,
    localOnly: true,
    adaptsDifficulty: false,
    mutatesTuning: false,
    mutatesRouteRng: false,
    getState: () => ({
      version: VERSION,
      revision: REVISION,
      localOnly: true,
      adaptsDifficulty: false,
      historyLimit: HISTORY_LIMIT,
      current: compactRunSnapshot(),
      lastRun: lastRun ? copy(lastRun) : null,
      history: history.map(copy),
      health: difficultyHealth(),
    }),
    difficultyHealth: () => difficultyHealth(),
    clearHistory,
  };
})();