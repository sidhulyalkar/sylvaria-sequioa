(() => {
  'use strict';
  const S = window.SylvariaSequoia;
  const { state, player, TUNE, W, H, clamp, lerp, routeStat, recordEvent } = S;

  // v0.4 gives the climb genuine negative space. These are honest collision
  // surfaces; the sparse route grammars below decide when branches exist at all.
  state.LEFT_WALL = 100;
  state.RIGHT_WALL = 860;

  const ROUTE_GRAMMARS = {
    FLOW: [
      { dy: 60, side: 'center', length: 540, launch: true, knot: 'center' },
      { dy: 86, side: 'same', length: 365, ring: 'lane' },
      { dy: 98, side: 'swap', length: 330 },
    ],
    RECOVERY: [
      { dy: 56, side: 'center', length: 620, launch: true, knot: 'center' },
      { dy: 72, side: 'center', length: 560, ring: 'lane' },
    ],
    GROVE: [
      { dy: 72, side: 'center', length: 630, launch: true, knot: 'center' },
      { dy: 138, side: 'left', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 148, side: 'right', branch: false, anchor: 'right' },
      { dy: 124, side: 'center', length: 500, knot: 'center', ring: 'crown' },
    ],
    SAPRUN: [
      { dy: 64, side: 'center', length: 555, launch: true, knot: 'center' },
      { dy: 148, side: 'left', branch: false, anchor: 'left' },
      { dy: 156, side: 'right', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 164, side: 'left', branch: false, anchor: 'left' },
      { dy: 132, side: 'center', length: 430, knot: 'center', ring: 'crown' },
    ],
    SLINGSHOT: [
      { dy: 72, side: 'same', length: 370, knot: 'center', launch: true },
      { dy: 150, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 160, side: 'same', branch: false, anchor: 'cross' },
      { dy: 124, side: 'center', length: 335, knot: 'center' },
    ],
    CRUX: [
      { dy: 90, side: 'same', length: 325, ring: 'lane' },
      { dy: 118, side: 'swap', length: 285, knot: 'cross', launch: true },
      { dy: 126, side: 'center', length: 300, knot: 'center', ring: 'crown' },
    ],
  };

  const PHASES = [
    { name: 'ROOTWAYS', floor: 0, geometry: 0.04, pressure: 0.72, sequence: ['FLOW', 'RECOVERY', 'GROVE', 'FLOW', 'SAPRUN'] },
    { name: 'REDWOOD RUN', floor: 30, geometry: 0.22, pressure: 0.90, sequence: ['FLOW', 'GROVE', 'SAPRUN', 'RECOVERY', 'SLINGSHOT', 'CRUX'] },
    { name: 'SAPWORK', floor: 70, geometry: 0.44, pressure: 1.00, sequence: ['SAPRUN', 'GROVE', 'SLINGSHOT', 'FLOW', 'CRUX', 'RECOVERY'] },
    { name: 'HIGH CANOPY', floor: 115, geometry: 0.70, pressure: 1.12, sequence: ['CRUX', 'SAPRUN', 'GROVE', 'SLINGSHOT', 'CRUX', 'RECOVERY'] },
    { name: 'CROWNLINE', floor: 165, geometry: 1.00, pressure: 1.24, sequence: ['SAPRUN', 'CRUX', 'SLINGSHOT', 'GROVE', 'CRUX', 'SAPRUN'] },
  ];

  function phaseForFloor(floor) {
    let phase = PHASES[0];
    for (const candidate of PHASES) {
      if (floor >= candidate.floor) phase = candidate;
      else break;
    }
    return phase;
  }

  function takeBranch() { return state.branchPool.pop() || {}; }
  function takeKnot() { return state.knotPool.pop() || {}; }
  function takeRing() { return state.ringPool.pop() || {}; }

  function addBranch(floor, y, side, length, slope, chunk, launch = false) {
    const branch = takeBranch();
    branch.floor = floor;
    branch.y = y;
    branch.side = side;
    branch.slope = slope;
    branch.chunkId = chunk.id;
    branch.chunkType = chunk.type;
    branch.thickness = 10 + state.routeRng.next() * 5.2;
    branch.burl = state.routeRng.next();
    branch.launch = Boolean(launch);
    if (side === 'left') {
      branch.x1 = state.LEFT_WALL - 3;
      branch.x2 = Math.min(state.RIGHT_WALL - 70, state.LEFT_WALL + length);
      branch.launchX = branch.x2 - 40;
    } else if (side === 'right') {
      branch.x2 = state.RIGHT_WALL + 3;
      branch.x1 = Math.max(state.LEFT_WALL + 70, state.RIGHT_WALL - length);
      branch.launchX = branch.x1 + 40;
    } else {
      const half = Math.min(length, state.RIGHT_WALL - state.LEFT_WALL - 30) * 0.5;
      branch.x1 = W / 2 - half;
      branch.x2 = W / 2 + half;
      branch.launchX = W / 2 + (state.routeRng.next() - 0.5) * Math.min(130, half * 0.45);
    }
    state.branches.push(branch);
    return branch;
  }

  function addKnot(x, y, floor, chunk, role, anchorKind = 'branch') {
    const knot = takeKnot();
    Object.assign(knot, {
      x,
      y,
      floor,
      chunkId: chunk.id,
      chunkType: chunk.type,
      role,
      anchorKind,
      pulse: state.routeRng.next() * Math.PI * 2,
    });
    state.knots.push(knot);
    return knot;
  }

  function addRing(x, y, floor, chunk, role, difficulty) {
    const ring = takeRing();
    Object.assign(ring, {
      x,
      y,
      floor,
      chunkId: chunk.id,
      chunkType: chunk.type,
      role,
      hit: false,
      pulse: state.routeRng.next() * Math.PI * 2,
      radius: lerp(TUNE.ring.baseRadius, TUNE.ring.minRadius, difficulty),
    });
    state.rings.push(ring);
    return ring;
  }

  function knotPosition(role, side, branch) {
    const jitter = (state.routeRng.next() - 0.5) * 28;
    if (role === 'cross') {
      return {
        x: side === 'left' ? state.RIGHT_WALL - 94 + jitter : state.LEFT_WALL + 94 + jitter,
        y: branch.y + 104 + state.routeRng.next() * 24,
      };
    }
    if (role === 'center') {
      return { x: W / 2 + jitter * 1.45, y: branch.y + 92 + state.routeRng.next() * 24 };
    }
    return { x: side === 'right' ? branch.x2 - 48 : branch.x1 + 48, y: branch.y + 88 };
  }

  function airAnchorPosition(role, side, y) {
    const jitter = (state.routeRng.next() - 0.5) * 34;
    const inset = 98;
    if (role === 'left') return { x: state.LEFT_WALL + inset + jitter, y };
    if (role === 'right') return { x: state.RIGHT_WALL - inset + jitter, y };
    if (role === 'center') return { x: W / 2 + jitter * 1.3, y };
    if (role === 'cross') {
      return {
        x: side === 'left' ? state.RIGHT_WALL - inset + jitter : state.LEFT_WALL + inset + jitter,
        y,
      };
    }
    return { x: W / 2 + jitter, y };
  }

  function ringPosition(role, side, branch) {
    const jitter = (state.routeRng.next() - 0.5) * 28;
    if (role === 'cross') {
      return {
        x: side === 'left' ? state.RIGHT_WALL - 145 + jitter : state.LEFT_WALL + 145 + jitter,
        y: branch.y + 62 + state.routeRng.next() * 16,
      };
    }
    if (role === 'crown') {
      return { x: W / 2 + jitter * 1.5, y: branch.y + 74 + state.routeRng.next() * 18 };
    }
    const freeX = side === 'left' ? branch.x2 - 78 : side === 'right' ? branch.x1 + 78 : W / 2;
    return { x: freeX + jitter, y: branch.y + 54 + state.routeRng.next() * 12 };
  }

  function resolveSide(token) {
    if (token === 'center') return 'center';
    if (token === 'same') return state.lastSide;
    if (token === 'swap') {
      state.lastSide = state.lastSide === 'left' ? 'right' : 'left';
      return state.lastSide;
    }
    if (token === 'left' || token === 'right') {
      state.lastSide = token;
      return token;
    }
    return token;
  }

  function routeTypeForChunk() {
    const phase = phaseForFloor(state.generatedFloor);
    return phase.sequence[state.routeChunkIndex % phase.sequence.length];
  }

  function generateChunk() {
    const type = routeTypeForChunk();
    state.routeChunkIndex += 1;
    const grammar = ROUTE_GRAMMARS[type];
    const startFloor = state.generatedFloor + 1;
    const chunk = {
      id: `${state.routeChunkIndex}-${type}`,
      type,
      phase: phaseForFloor(startFloor).name,
      startFloor,
      endFloor: startFloor + grammar.length - 1,
      startY: state.generatedY,
      endY: state.generatedY,
      attempted: false,
      completed: false,
      failed: false,
      attemptStartedAt: 0,
    };
    state.chunks.push(chunk);
    routeStat(type).generated += 1;

    for (const step of grammar) {
      state.generatedFloor += 1;
      const phase = phaseForFloor(state.generatedFloor);
      const difficulty = clamp(Math.max(0, state.generatedFloor - 24) / 160, 0, 1);
      const geometry = Math.max(difficulty, phase.geometry * 0.82);
      const dyScale = 1 + geometry * 0.10;
      const lengthScale = 1 - geometry * 0.14;
      const yJitter = (state.routeRng.next() - 0.5) * lerp(2, 10, geometry);
      const lengthJitter = (state.routeRng.next() - 0.5) * lerp(8, 22, geometry);
      state.generatedY += step.dy * dyScale + yJitter;
      const side = resolveSide(step.side);
      const slope = (state.routeRng.next() - 0.5) * lerp(0.018, 0.085, geometry);
      let branch = null;

      if (step.branch !== false) {
        const minLength = side === 'center' ? lerp(400, 280, geometry) : lerp(260, 185, geometry);
        const length = Math.max(minLength, step.length * lengthScale + lengthJitter);
        branch = addBranch(state.generatedFloor, state.generatedY, side, length, slope, chunk, step.launch);
      }

      let airAnchor = null;
      if (step.anchor) {
        const pos = airAnchorPosition(step.anchor, side, state.generatedY + 12);
        airAnchor = addKnot(pos.x, pos.y, state.generatedFloor, chunk, step.anchor, 'sap-stick');
      } else if (step.knot && branch) {
        const pos = knotPosition(step.knot, side, branch);
        addKnot(pos.x, pos.y, state.generatedFloor, chunk, step.knot, 'branch');
      }

      if (step.ring) {
        if (step.ring === 'anchor' && airAnchor) {
          addRing(airAnchor.x + (side === 'left' ? 64 : side === 'right' ? -64 : 0), airAnchor.y - 14, state.generatedFloor, chunk, 'anchor', geometry);
        } else if (branch) {
          const pos = ringPosition(step.ring, side, branch);
          addRing(pos.x, pos.y, state.generatedFloor, chunk, step.ring, geometry);
        }
      }
    }
    chunk.endY = state.generatedY;
  }

  function generateUntil(worldY) {
    while (state.generatedY < worldY) generateChunk();
  }

  function recycleWorld() {
    const kill = state.cameraBottom - 420;
    while (state.branches.length && state.branches[0].y < kill) state.branchPool.push(state.branches.shift());
    while (state.knots.length && state.knots[0].y < kill) state.knotPool.push(state.knots.shift());
    while (state.rings.length && state.rings[0].y < kill) state.ringPool.push(state.rings.shift());
    while (state.chunks.length > 5 && state.chunks[0].endY < kill) state.chunks.shift();
    generateUntil(state.cameraBottom + H + 1180);
  }

  function branchYAt(branch, x) {
    const mid = (branch.x1 + branch.x2) * 0.5;
    return branch.y + (x - mid) * branch.slope;
  }

  function markRouteProgress(floor) {
    for (const chunk of state.chunks) {
      if (!chunk.attempted && floor >= chunk.startFloor) {
        chunk.attempted = true;
        chunk.attemptStartedAt = state.elapsed;
        routeStat(chunk.type).attempts += 1;
        recordEvent('route-enter', { route: chunk.type, phase: chunk.phase, id: chunk.id });
      }
      if (chunk.attempted && !chunk.completed && floor >= chunk.endFloor) {
        chunk.completed = true;
        const duration = Math.max(0, state.elapsed - chunk.attemptStartedAt);
        const stat = routeStat(chunk.type);
        stat.completions += 1;
        stat.durationTotal += duration;
        recordEvent('route-complete', { route: chunk.type, phase: chunk.phase, id: chunk.id, seconds: S.round(duration, 3) });
      }
    }
  }

  function activeRouteChunk() {
    return state.chunks.find((chunk) => player.highestFloor >= chunk.startFloor && player.highestFloor <= chunk.endFloor) || null;
  }

  function barkSweetness(y, side) {
    const phase = y * 0.033 + (side === 'left' ? 0.7 : 2.1);
    return 1 + Math.sin(phase) * TUNE.rebound.sweetSpotAmplitude;
  }

  function resetWorld(seed) {
    state.routeRng = S.makeRng((0x51a7f00d ^ Math.imul(seed, 2654435761)) >>> 0);
    state.fxRng = S.makeRng((0xa51ce55 ^ Math.imul(seed + 19, 2246822519)) >>> 0);
    state.branches.splice(0).forEach((item) => state.branchPool.push(item));
    state.knots.splice(0).forEach((item) => state.knotPool.push(item));
    state.rings.splice(0).forEach((item) => state.ringPool.push(item));
    state.chunks.length = 0;
    state.generatedY = 70;
    state.generatedFloor = 0;
    state.routeChunkIndex = 0;
    state.lastSide = 'left';
    const startChunk = { id: 'start', type: 'RECOVERY', phase: 'ROOTWAYS', startFloor: 0, endFloor: 0 };
    const start = addBranch(0, 70, 'center', 620, 0, startChunk, true);
    generateUntil(H + 3600);
    return start;
  }

  S.ROUTE_GRAMMARS = ROUTE_GRAMMARS;
  S.PHASES = PHASES;
  S.phaseForFloor = phaseForFloor;
  S.addBranch = addBranch;
  S.generateUntil = generateUntil;
  S.recycleWorld = recycleWorld;
  S.branchYAt = branchYAt;
  S.markRouteProgress = markRouteProgress;
  S.activeRouteChunk = activeRouteChunk;
  S.barkSweetness = barkSweetness;
  S.resetWorld = resetWorld;
})();
