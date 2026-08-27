(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.resetRun || !S?.startRun || !S?.PHASES || !S?.phaseForFloor) return;

  const { state, player, clamp, recordEvent } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;
  const VERSION = 'canopy-director-v1';
  const REVISION = 'living-setpiece-composition-v2';
  const CROWN_CYCLE = 25;
  const CATCH_GRACE_SECONDS = 2.35;

  // Final choreography authority for the pre-Living-Crown curriculum. This is a
  // composition table, not a replacement of Living Canopy: every authored v0.5
  // set piece remains in the lesson/exam sequence where its skill is readable.
  // No route RNG is consumed here, so same-seed generation stays deterministic.
  const ROUTE_CHOREOGRAPHY = {
    ROOTWAYS: ['FLOW', 'RECOVERY', 'GROVE', 'FLOW', 'SAPRUN'],
    'REDWOOD RUN': ['FLOW', 'GROVE', 'CHOIRLINE', 'WINDLINE', 'RECOVERY', 'SLINGSHOT', 'CRUX'],
    SAPWORK: ['SAPRUN', 'BREAKAWAY', 'GROVE', 'HOLLOWRUN', 'WINDLINE', 'RECOVERY', 'AURORARUN', 'SKYHOOK', 'CRUX'],
    'HIGH CANOPY': ['PENDULUM', 'GROVE', 'MIGRATION', 'RECOVERY', 'SKYHOOK', 'ELDERSPAN', 'CRUX', 'CROWNWEAVE', 'WINDLINE'],
    'STORM CANOPY': ['CONEFALL', 'HOLLOWRUN', 'GROVE', 'PENDULUM', 'RECOVERY', 'SKYHOOK', 'CONEFALL', 'CROWNWEAVE', 'WINDLINE'],
    CROWNLINE: ['CONEFALL', 'THUNDERCROWN', 'ELDERSPAN', 'RECOVERY', 'ECHOFLIGHT', 'CROWNWEAVE', 'PENDULUM', 'SKYHOOK', 'THUNDERCROWN', 'CRUX', 'WINDLINE', 'SAPRUN'],
  };

  const REQUIRED_LIVING_SETPIECES = {
    'REDWOOD RUN': ['CHOIRLINE'],
    SAPWORK: ['HOLLOWRUN', 'AURORARUN'],
    'HIGH CANOPY': ['MIGRATION', 'ELDERSPAN'],
    CROWNLINE: ['ELDERSPAN', 'ECHOFLIGHT'],
  };

  const BASE_PRESSURE = {
    ROOTWAYS: 0.72,
    'REDWOOD RUN': 0.90,
    SAPWORK: 1.02,
    'HIGH CANOPY': 1.13,
    'STORM CANOPY': 1.19,
    CROWNLINE: 1.27,
  };

  const STAGES = [
    { id: 'BREATHE', start: 0, end: 5, multiplier: 0.84 },
    { id: 'BUILD', start: 6, end: 14, multiplier: 0.96 },
    { id: 'TEST', start: 15, end: 21, multiplier: 1.06 },
    { id: 'CROWN', start: 22, end: 24, multiplier: 1.13 },
  ];

  // Conefall becomes active at floor 132. Give it a named readable band before
  // Crownline asks the player to combine it with the full expert vocabulary.
  if (!S.PHASES.some((phase) => phase.name === 'STORM CANOPY')) {
    const crownIndex = S.PHASES.findIndex((phase) => phase.name === 'CROWNLINE');
    const storm = {
      name: 'STORM CANOPY',
      floor: 132,
      geometry: 0.88,
      pressure: BASE_PRESSURE['STORM CANOPY'],
      sequence: ROUTE_CHOREOGRAPHY['STORM CANOPY'].slice(),
    };
    if (crownIndex >= 0) S.PHASES.splice(crownIndex, 0, storm);
    else S.PHASES.push(storm);
    S.PHASES.sort((a, b) => a.floor - b.floor);
  }

  function installChoreography() {
    for (const phase of S.PHASES) {
      const authored = ROUTE_CHOREOGRAPHY[phase.name];
      if (authored) phase.sequence = authored.slice();
      if (BASE_PRESSURE[phase.name]) phase.pressure = BASE_PRESSURE[phase.name];
    }
  }

  function verifyLivingSetpieces() {
    for (const [phaseName, grammars] of Object.entries(REQUIRED_LIVING_SETPIECES)) {
      const phase = S.PHASES.find((entry) => entry.name === phaseName);
      if (!phase) return false;
      if (grammars.some((grammar) => !phase.sequence.includes(grammar))) return false;
    }
    return true;
  }

  installChoreography();

  let lastStage = '';
  let lastPhase = '';
  let catchGrace = 0;
  let observedCatches = 0;
  let stageTransitions = 0;
  let graceActivations = 0;

  function stageForFloor(floor = player.highestFloor) {
    const local = ((Math.max(0, Math.floor(floor)) % CROWN_CYCLE) + CROWN_CYCLE) % CROWN_CYCLE;
    return STAGES.find((stage) => local >= stage.start && local <= stage.end) || STAGES[0];
  }

  function basePressureForFloor(floor = player.highestFloor) {
    const phase = S.phaseForFloor(floor);
    return BASE_PRESSURE[phase?.name] || Number(phase?.pressure) || 1;
  }

  function pressureForFloor(floor = player.highestFloor, graceSeconds = 0) {
    const stage = stageForFloor(floor);
    let multiplier = stage.multiplier;
    if (floor < 12) multiplier = Math.min(multiplier, 0.88);
    const graceScale = graceSeconds > 0
      ? 0.72 + 0.28 * (1 - clamp(graceSeconds / CATCH_GRACE_SECONDS, 0, 1))
      : 1;
    return clamp(basePressureForFloor(floor) * multiplier * graceScale, 0.56, 1.48);
  }

  function applyPressure() {
    // Restore canonical base values first so a prior stage multiplier never feeds
    // itself on the next tick. Post-250 Living Crown / Elder Sky retain their own
    // authored base pressures and still receive the same 25-floor heartbeat.
    for (const phase of S.PHASES) {
      if (BASE_PRESSURE[phase.name]) phase.pressure = BASE_PRESSURE[phase.name];
    }
    const phase = S.phaseForFloor(player.highestFloor);
    if (phase) phase.pressure = pressureForFloor(player.highestFloor, catchGrace);
  }

  function enforceAuthoredTrialMeaning() {
    // BREAKAWAY is introduced at SAPWORK. Forced BREAKAWAY branches behave as
    // advertised immediately rather than waiting for a later density threshold.
    for (const branch of state.branches) {
      if (branch.chunkType === 'BREAKAWAY' && branch.floor >= 70 && branch.floor !== 0) {
        branch._trialFragile = true;
      }
    }
  }

  function observeDirectorState(dt) {
    const stage = stageForFloor();
    const phase = S.phaseForFloor(player.highestFloor)?.name || 'ROOTWAYS';
    if (state.mode === 'playing' && (stage.id !== lastStage || phase !== lastPhase)) {
      stageTransitions += 1;
      recordEvent('canopy-director-stage', {
        stage: stage.id,
        phase,
        floor: player.highestFloor,
        pressure: S.round(pressureForFloor(player.highestFloor, catchGrace), 3),
      });
    }
    lastStage = stage.id;
    lastPhase = phase;

    const catches = S.getTelemetry().counters.sapCatches || 0;
    if (catches > observedCatches) {
      catchGrace = CATCH_GRACE_SECONDS;
      graceActivations += catches - observedCatches;
      recordEvent('canopy-director-catch-grace', {
        floor: player.highestFloor,
        seconds: CATCH_GRACE_SECONDS,
      });
    }
    observedCatches = catches;
    catchGrace = Math.max(0, catchGrace - dt);
  }

  function update(dt) {
    applyPressure();
    baseUpdate(dt);
    enforceAuthoredTrialMeaning();
    observeDirectorState(dt);
  }

  function resetDirector() {
    lastStage = '';
    lastPhase = '';
    catchGrace = 0;
    observedCatches = 0;
    stageTransitions = 0;
    graceActivations = 0;
    installChoreography();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetDirector();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetDirector();
    return result;
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.canopyDirector = {
    version: VERSION,
    revision: REVISION,
    crownCycle: CROWN_CYCLE,
    catchGraceSeconds: CATCH_GRACE_SECONDS,
    ownsRouteChoreography: true,
    preservesLivingSetpieces: verifyLivingSetpieces(),
    pressureForFloor: (floor) => pressureForFloor(floor, 0),
    getState: () => {
      const stage = stageForFloor();
      const phase = S.phaseForFloor(player.highestFloor)?.name || 'ROOTWAYS';
      return {
        version: VERSION,
        revision: REVISION,
        phase,
        stage: stage.id,
        stageFloor: player.highestFloor % CROWN_CYCLE,
        stageMultiplier: stage.multiplier,
        pressure: pressureForFloor(player.highestFloor, catchGrace),
        catchGraceRemaining: S.round(catchGrace, 3),
        stageTransitions,
        graceActivations,
        preservesLivingSetpieces: verifyLivingSetpieces(),
        choreography: Object.fromEntries(Object.entries(ROUTE_CHOREOGRAPHY).map(([name, sequence]) => [name, sequence.slice()])),
      };
    },
  };
})();