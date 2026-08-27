(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  const { ctx, W, H, state, player, TUNE, clamp, lerp } = S;
  const BARK_ROW = 74;
  const BARK_COLS = 4;

  const BARK_FACES = ['#80665e', '#946c58', '#765a52', '#a47b64', '#6f625f', '#8b7169'];
  const BARK_CORES = ['#7d4328', '#985733', '#6b3825', '#a25d36'];
  const FIBERS = ['#c18b5a', '#ab7042', '#d09d69', '#87502f'];

  function worldToScreenY(worldY) {
    return H - (worldY - state.cameraBottom);
  }

  function hash3(a, b, c = 0) {
    let x = (Math.imul((a | 0) ^ 0x45d9f3b, 0x27d4eb2d) + Math.imul((b | 0) ^ 0x119de1f3, 0x165667b1) + Math.imul(c | 0, 0x9e3779b1)) | 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    return (x >>> 0) / 4294967295;
  }

  function phaseStyle() {
    const name = S.phaseForFloor(player.highestFloor).name;
    if (name === 'ROOTWAYS') return { sky0: '#8fbfd0', sky1: '#2d5d55', fog: '#d8efd2', tint: '#7c4b31' };
    if (name === 'REDWOOD RUN') return { sky0: '#79afc3', sky1: '#254e4b', fog: '#cce8cf', tint: '#855034' };
    if (name === 'SAPWORK') return { sky0: '#6a98b9', sky1: '#273f4c', fog: '#c9dce8', tint: '#8b5236' };
    if (name === 'HIGH CANOPY') return { sky0: '#6f83ae', sky1: '#31374f', fog: '#d1cce2', tint: '#92593a' };
    return { sky0: '#7f789f', sky1: '#44384d', fog: '#e8c7c3', tint: '#9b5c3b' };
  }

  function drawBackground(time) {
    const palette = phaseStyle();
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, palette.sky0);
    gradient.addColorStop(0.58, palette.sky1);
    gradient.addColorStop(1, '#10241f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Distant sequoia ridges. Each layer is deterministic and moves with a
    // different parallax coefficient, so the open gaps actually feel spacious.
    for (let layer = 0; layer < 3; layer += 1) {
      const parallax = 0.035 + layer * 0.028;
      const base = H * (0.66 + layer * 0.075);
      ctx.fillStyle = layer === 0 ? 'rgba(26,69,57,.22)' : layer === 1 ? 'rgba(20,57,47,.30)' : 'rgba(13,43,35,.42)';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = -30; x <= W + 30; x += 34) {
        const worldShift = state.cameraBottom * parallax;
        const h = 50 + hash3(Math.floor((x + worldShift) / 34), layer, 81) * (80 + layer * 24);
        const sway = Math.sin(x * 0.022 + time * 0.16 + layer) * 7;
        ctx.lineTo(x, base - h + sway);
        ctx.lineTo(x + 8, base - h * 0.35 + sway);
        ctx.lineTo(x + 17, base - h * 0.72 + sway);
        ctx.lineTo(x + 28, base);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i += 1) {
      const x = 220 + i * 180 + Math.sin(time * 0.11 + i * 1.7) * 28;
      const beam = ctx.createLinearGradient(x - 30, 0, x + 110, H);
      beam.addColorStop(0, 'rgba(246,243,194,.14)');
      beam.addColorStop(0.55, 'rgba(228,244,206,.055)');
      beam.addColorStop(1, 'rgba(228,244,206,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 30, 0);
      ctx.lineTo(x + 20, 0);
      ctx.lineTo(x + 145, H);
      ctx.lineTo(x + 58, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const fog = ctx.createRadialGradient(W / 2, H * 0.58, 50, W / 2, H * 0.58, 430);
    fog.addColorStop(0, `${palette.fog}2a`);
    fog.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);
  }

  function barkVertex(side, row, col) {
    const left = side === 'left';
    const edge = left ? state.LEFT_WALL : state.RIGHT_WALL;
    const width = left ? state.LEFT_WALL : W - state.RIGHT_WALL;
    const depth = col / BARK_COLS;
    const outerSign = left ? -1 : 1;
    const baseX = edge + outerSign * width * depth;
    const edgeVertex = col === 0 || col === BARK_COLS;
    const xJitter = edgeVertex ? 0 : (hash3(row, col, left ? 13 : 97) - 0.5) * 16;
    const yJitter = (hash3(row, col, left ? 23 : 107) - 0.5) * 22;
    return {
      x: baseX + xJitter,
      y: row * BARK_ROW + yJitter,
    };
  }

  function traceCell(side, row, col) {
    const a = barkVertex(side, row, col);
    const b = barkVertex(side, row, col + 1);
    const c = barkVertex(side, row + 1, col + 1);
    const d = barkVertex(side, row + 1, col);
    ctx.beginPath();
    ctx.moveTo(a.x, worldToScreenY(a.y));
    ctx.lineTo(b.x, worldToScreenY(b.y));
    ctx.lineTo(c.x, worldToScreenY(c.y));
    ctx.lineTo(d.x, worldToScreenY(d.y));
    ctx.closePath();
    return { a, b, c, d };
  }

  function drawBarkCell(side, row, col) {
    const left = side === 'left';
    const seed = hash3(row, col, left ? 41 : 151);
    const face = BARK_FACES[Math.floor(seed * BARK_FACES.length) % BARK_FACES.length];
    const core = BARK_CORES[Math.floor(hash3(row, col, left ? 43 : 157) * BARK_CORES.length) % BARK_CORES.length];
    const fiber = FIBERS[Math.floor(hash3(row, col, left ? 47 : 163) * FIBERS.length) % FIBERS.length];
    const cell = traceCell(side, row, col);

    ctx.save();
    // Bark depth: a dark fibrous under-layer peeks around every flake.
    ctx.translate(left ? -2.5 : 2.5, 2.5);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();

    traceCell(side, row, col);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.strokeStyle = 'rgba(49,24,17,.72)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // The shared-vertex anisotropic lattice makes adjacent pieces puzzle-fit.
    // Fibers are clipped into each plate and run mostly vertical, matching the
    // stringy longitudinal tear pattern of mature sequoia bark.
    ctx.save();
    traceCell(side, row, col);
    ctx.clip();
    const topY = Math.min(cell.a.y, cell.b.y);
    const bottomY = Math.max(cell.c.y, cell.d.y);
    const leftX = Math.min(cell.a.x, cell.b.x, cell.c.x, cell.d.x);
    const rightX = Math.max(cell.a.x, cell.b.x, cell.c.x, cell.d.x);
    for (let i = 0; i < 4; i += 1) {
      const t = (i + 0.6) / 4.7;
      const x = lerp(leftX, rightX, t) + (hash3(row, col * 7 + i, 211) - 0.5) * 5;
      const startY = lerp(topY, bottomY, hash3(row, i, 223) * 0.24);
      const endY = lerp(topY, bottomY, 0.72 + hash3(col, i, 227) * 0.24);
      ctx.strokeStyle = i % 2 ? `${fiber}90` : 'rgba(222,184,132,.34)';
      ctx.lineWidth = i % 2 ? 1.2 : 0.75;
      ctx.beginPath();
      ctx.moveTo(x, worldToScreenY(startY));
      ctx.bezierCurveTo(
        x + (hash3(row, i, 229) - 0.5) * 7,
        worldToScreenY(lerp(startY, endY, 0.35)),
        x + (hash3(col, i, 233) - 0.5) * 9,
        worldToScreenY(lerp(startY, endY, 0.68)),
        x + (hash3(row + col, i, 239) - 0.5) * 5,
        worldToScreenY(endY)
      );
      ctx.stroke();
    }
    ctx.restore();

    // Some plates curl away from the trunk. The flap uses the same cell seed, so
    // scrolling never causes texture popping or random changes frame-to-frame.
    if (seed > 0.58) {
      const p0 = cell.a;
      const p1 = cell.b;
      const centerX = (p0.x + p1.x) * 0.5;
      const topY = (p0.y + p1.y) * 0.5;
      const inward = left ? 1 : -1;
      const flap = 5 + hash3(row, col, 251) * 11;
      ctx.fillStyle = seed > 0.82 ? '#9b8d86' : '#a57d66';
      ctx.beginPath();
      ctx.moveTo(centerX - inward * 8, worldToScreenY(topY + 2));
      ctx.lineTo(centerX + inward * 10, worldToScreenY(topY + 5));
      ctx.lineTo(centerX + inward * flap, worldToScreenY(topY - 17 - flap * 0.6));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,207,163,.30)';
      ctx.stroke();
    }
  }

  function drawSequoia(side) {
    const left = side === 'left';
    const edge = left ? state.LEFT_WALL : state.RIGHT_WALL;
    const outer = left ? 0 : W;
    const width = left ? state.LEFT_WALL : W - state.RIGHT_WALL;
    const palette = phaseStyle();
    const gradient = ctx.createLinearGradient(edge, 0, outer, 0);
    gradient.addColorStop(0, '#5b2f20');
    gradient.addColorStop(0.35, palette.tint);
    gradient.addColorStop(0.78, '#3b2019');
    gradient.addColorStop(1, '#1b100d');
    ctx.fillStyle = gradient;
    ctx.fillRect(left ? 0 : edge, 0, width, H);

    const firstRow = Math.floor((state.cameraBottom - 110) / BARK_ROW) - 1;
    const lastRow = Math.ceil((state.cameraBottom + H + 110) / BARK_ROW) + 1;
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = 0; col < BARK_COLS; col += 1) drawBarkCell(side, row, col);
    }

    // Collision honesty without the old neon stripe. A dark crease and warm wood
    // rim show the exact playable edge while still reading as natural bark.
    ctx.strokeStyle = 'rgba(22,12,9,.86)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(edge + (left ? -2 : 2), 0);
    ctx.lineTo(edge + (left ? -2 : 2), H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(221,151,94,.34)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(edge, 0);
    ctx.lineTo(edge, H);
    ctx.stroke();

    // Sparse moss/fungi accents keep the trunk alive without competing with the
    // glowing gameplay anchors.
    for (let i = 0; i < 5; i += 1) {
      const worldY = Math.floor((state.cameraBottom - 80) / 132 + i) * 132 + hash3(i, left ? 3 : 7, 301) * 45;
      const y = worldToScreenY(worldY);
      const x = edge + (left ? -1 : 1) * (13 + hash3(i, left ? 11 : 17, 307) * 22);
      ctx.fillStyle = 'rgba(72,112,61,.48)';
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 4, left ? -0.3 : 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (i % 3 === 1) {
        ctx.fillStyle = 'rgba(219,170,104,.58)';
        ctx.beginPath();
        ctx.ellipse(x + (left ? 7 : -7), y + 9, 7, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function routeColor(type) {
    if (type === 'SAPRUN') return '#6f4632';
    if (type === 'GROVE') return '#7d5035';
    if (type === 'CRUX') return '#77452f';
    if (type === 'SLINGSHOT') return '#815137';
    if (type === 'RECOVERY') return '#674737';
    return '#744934';
  }

  function drawLaunchBurl(branch, y) {
    if (!branch.launch) return;
    const pulse = 1 + Math.sin(state.elapsed * 5 + branch.floor) * 0.08;
    ctx.save();
    ctx.translate(branch.launchX, y);
    ctx.shadowColor = '#ffc862';
    ctx.shadowBlur = 11;
    ctx.fillStyle = 'rgba(255,184,70,.20)';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b7743d';
    ctx.beginPath();
    ctx.ellipse(0, -1, 10 * pulse, 5 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,166,.78)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawBranch(branch) {
    const x1 = branch.x1;
    const x2 = branch.x2;
    const y1 = worldToScreenY(S.branchYAt(branch, x1));
    const y2 = worldToScreenY(S.branchYAt(branch, x2));
    if (Math.max(y1, y2) < -55 || Math.min(y1, y2) > H + 55) return;
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5 + Math.sin(branch.floor * 1.9) * 2;
    const leftRooted = branch.side === 'left';
    const rightRooted = branch.side === 'right';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#24140f';
    ctx.lineWidth = branch.thickness + 8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();
    ctx.strokeStyle = routeColor(branch.chunkType);
    ctx.lineWidth = branch.thickness;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(midX, midY, x2, y2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(194,137,88,.40)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x1 + 5, y1 - 2);
    ctx.quadraticCurveTo(midX, midY - 3, x2 - 5, y2 - 2);
    ctx.stroke();

    // Broken twig silhouette at the free end, so branches read as tree limbs and
    // not horizontal platform bars.
    const tipX = leftRooted ? x2 : rightRooted ? x1 : x2;
    const tipY = leftRooted ? y2 : rightRooted ? y1 : y2;
    const dir = leftRooted ? 1 : rightRooted ? -1 : 1;
    ctx.strokeStyle = '#4c2c20';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tipX - dir * 18, tipY);
    ctx.lineTo(tipX + dir * 8, tipY - 8);
    ctx.moveTo(tipX - dir * 10, tipY + 1);
    ctx.lineTo(tipX + dir * 5, tipY + 7);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(91,139,70,.46)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([17, 24]);
    ctx.beginPath();
    ctx.moveTo(x1 + 9, y1 - 5);
    ctx.quadraticCurveTo(midX, midY - 6, x2 - 9, y2 - 5);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLaunchBurl(branch, worldToScreenY(S.branchYAt(branch, branch.launchX)));
    ctx.restore();
  }

  function drawRing(ring, time) {
    if (ring.hit) return;
    const y = worldToScreenY(ring.y);
    if (y < -55 || y > H + 55) return;
    const radius = ring.radius * (1 + Math.sin(time * 4 + ring.pulse) * 0.06);
    ctx.save();
    ctx.translate(ring.x, y);
    ctx.rotate(time * 0.28 + ring.pulse);
    ctx.shadowColor = '#8ff6ba';
    ctx.shadowBlur = 13;
    ctx.strokeStyle = 'rgba(150,242,181,.88)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(244,216,142,.56)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawKnot(knot, time, target = false) {
    const y = worldToScreenY(knot.y);
    if (y < -55 || y > H + 55) return;
    const pulse = 1 + Math.sin(time * 4.2 + knot.pulse) * 0.10;
    const radius = knot.anchorKind === 'sap-stick' ? 27 : 22;
    const glow = ctx.createRadialGradient(knot.x, y, 2, knot.x, y, radius * pulse);
    glow.addColorStop(0, 'rgba(255,251,202,.98)');
    glow.addColorStop(0.24, 'rgba(255,178,53,.86)');
    glow.addColorStop(0.58, 'rgba(227,113,26,.32)');
    glow.addColorStop(1, 'rgba(255,126,25,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(knot.x, y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(knot.x, y);
    ctx.rotate(knot.pulse * 0.22);
    ctx.fillStyle = '#f0a83a';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.quadraticCurveTo(8, -2, 5, 7);
    ctx.quadraticCurveTo(-2, 10, -7, 3);
    ctx.quadraticCurveTo(-7, -5, 0, -8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,241,177,.86)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (knot.anchorKind === 'sap-stick') {
      ctx.strokeStyle = target ? 'rgba(255,248,194,.95)' : 'rgba(255,209,104,.54)';
      ctx.lineWidth = target ? 2.1 : 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, 12 + Math.sin(time * 5 + knot.pulse) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSapTargetPreview(alpha, time) {
    if (!state.keys.has('ShiftLeft') && !state.keys.has('ShiftRight')) return;
    if (player.sap) return;
    const target = S.sapStick?.getTargetPreview?.();
    if (!target) return;
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const ty = worldToScreenY(target.y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,102,.38)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + target.x) * 0.5, Math.min(y, ty) - 24, target.x, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,239,171,.80)';
    ctx.font = '700 7px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOCK', target.x, ty - 21 - Math.sin(time * 5) * 2);
    ctx.restore();
  }

  function drawSapline(alpha) {
    if (!player.sap) return;
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const knotY = worldToScreenY(player.sap.knot.y);
    const midX = (x + player.sap.knot.x) * 0.5 - Math.sign(player.vx || 1) * 18;
    const midY = (y + knotY) * 0.5 - 18;
    ctx.save();
    ctx.shadowColor = '#ffb83f';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = 'rgba(255,172,42,.48)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(midX, midY, player.sap.knot.x, knotY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,239,157,.96)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(midX, midY, player.sap.knot.x, knotY);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(alpha, time) {
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const speed = Math.hypot(player.vx, player.vy);
    const cling = player.state === 'wall-cling' || Boolean(S.flowAssist?.getState?.().clingActive);
    const sap = Boolean(player.sap?.stickMode);
    const falling = player.vy < -170;
    const lean = cling ? 0 : clamp(player.vx / 1150, -0.22, 0.22);
    const runPhase = state.elapsed * 13 + player.x * 0.028;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(player.facing || 1, 1);

    // Velocity scarf: bright enough to be a movement instrument, small enough not
    // to obscure the cute silhouette.
    const scarfLength = 22 + clamp(speed / 20, 0, 32);
    ctx.fillStyle = player.hyper ? '#ffd36f' : '#cf5832';
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.quadraticCurveTo(-18, -14 + Math.sin(time * 8) * 3, -scarfLength, -1);
    ctx.lineTo(-scarfLength + 7, 5);
    ctx.quadraticCurveTo(-17, 4, -4, 0);
    ctx.closePath();
    ctx.fill();

    const stride = cling ? 0 : Math.sin(runPhase) * clamp(speed / 390, 0, 0.9);
    ctx.strokeStyle = '#3b271d';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, 9);
    ctx.lineTo(-8 - stride * 5, 18);
    ctx.moveTo(5, 9);
    ctx.lineTo(8 + stride * 5, 18);
    ctx.stroke();
    ctx.fillStyle = '#2d2018';
    ctx.beginPath();
    ctx.ellipse(-10 - stride * 5, 20, 7, 4, -0.15, 0, Math.PI * 2);
    ctx.ellipse(10 + stride * 5, 20, 7, 4, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b96e3e';
    ctx.fillRect(-14 - stride * 5, 18, 8, 2);
    ctx.fillRect(6 + stride * 5, 18, 8, 2);

    // Tiny leaf tunic and absurdly serious satchel.
    ctx.fillStyle = '#487a50';
    ctx.beginPath();
    ctx.moveTo(-11, -7);
    ctx.quadraticCurveTo(-14, 5, -8, 13);
    ctx.lineTo(8, 13);
    ctx.quadraticCurveTo(14, 5, 11, -7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2d4c35';
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.lineTo(-3, 15);
    ctx.lineTo(0, 9);
    ctx.lineTo(4, 15);
    ctx.lineTo(10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5b3825';
    ctx.fillRect(-11, 5, 22, 3);
    ctx.fillStyle = '#a66a39';
    ctx.beginPath();
    ctx.roundRect?.(8, 2, 8, 9, 2);
    if (ctx.roundRect) ctx.fill();
    else ctx.fillRect(8, 2, 8, 9);
    ctx.shadowColor = '#ffcc64';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffc45d';
    ctx.beginPath();
    ctx.arc(0, 6.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Big mascot head.
    ctx.fillStyle = '#d7a16e';
    ctx.beginPath();
    ctx.ellipse(0, -10, 13.5, 12.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6b17b';
    ctx.beginPath();
    ctx.arc(-12.5, -9, 3.5, 0, Math.PI * 2);
    ctx.arc(12.5, -9, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Leaf hood with a slightly ridiculous sprout.
    ctx.fillStyle = '#315f3c';
    ctx.beginPath();
    ctx.arc(0, -15, 13.8, Math.PI, 0);
    ctx.lineTo(12, -8);
    ctx.quadraticCurveTo(0, -3, -12, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5b944d';
    ctx.beginPath();
    ctx.moveTo(-8, -20);
    ctx.lineTo(-18, -28);
    ctx.lineTo(-14, -15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#315f3c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(2, -25);
    ctx.quadraticCurveTo(3, -32, 8, -34);
    ctx.stroke();
    ctx.fillStyle = '#6aaa53';
    ctx.beginPath();
    ctx.ellipse(10, -34, 5, 2.5, -0.35, 0, Math.PI * 2);
    ctx.fill();

    const eyeY = -11.5;
    ctx.fillStyle = '#fff4dc';
    ctx.beginPath();
    ctx.ellipse(-4.6, eyeY, 3.5, falling ? 4.1 : 3.7, 0, 0, Math.PI * 2);
    ctx.ellipse(4.6, eyeY, 3.5, falling ? 4.1 : 3.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1d16';
    const pupilY = eyeY + (falling ? -1.4 : sap ? 0.4 : 0);
    ctx.beginPath();
    ctx.arc(-4.2, pupilY, 1.5, 0, Math.PI * 2);
    ctx.arc(5.0, pupilY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-3.7, pupilY - 0.6, 0.5, 0, Math.PI * 2);
    ctx.arc(5.5, pupilY - 0.6, 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#5b2f22';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (falling && !sap) {
      ctx.arc(0, -5.8, 2.3, 0, Math.PI * 2);
    } else {
      ctx.arc(0, -7, 5.2, 0.15, Math.PI - 0.12);
    }
    ctx.stroke();
    if (!falling || sap) {
      ctx.fillStyle = '#fff4dc';
      ctx.fillRect(-1.5, -5.8, 3, 1.5);
    }

    // Sap Stick staff and sticky amber bulb.
    ctx.save();
    ctx.translate(12, 2);
    ctx.rotate(sap ? -0.64 : -0.30 + Math.sin(time * 5) * 0.025);
    ctx.strokeStyle = '#5a371f';
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -20);
    ctx.stroke();
    ctx.strokeStyle = '#d7aa55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(3.5, -20, 6.5, Math.PI * 0.55, Math.PI * 1.55);
    ctx.stroke();
    ctx.shadowColor = '#ffbd42';
    ctx.shadowBlur = sap ? 16 : 7;
    ctx.fillStyle = '#ffc44e';
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.quadraticCurveTo(5, -20, 1, -15);
    ctx.quadraticCurveTo(-5, -18, 0, -25);
    ctx.fill();
    ctx.restore();

    if (player.airJumps > 0 && !player.grounded) {
      ctx.strokeStyle = 'rgba(164,255,200,.36)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (cling) {
      ctx.save();
      ctx.scale(player.facing || 1, 1);
      ctx.fillStyle = 'rgba(225,255,219,.78)';
      ctx.font = '700 7px ui-monospace,monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GRIP!', 0, -38);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of state.particles) {
      const y = worldToScreenY(particle.y);
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.kind === 'resin' ? '#ffc25c' : particle.kind === 'ember' ? '#ff6840' : particle.kind === 'bark' ? '#a36b4a' : '#89c97f';
      ctx.beginPath();
      ctx.arc(particle.x, y, Math.max(1, particle.r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawThreat(time) {
    const y = worldToScreenY(state.threatY);
    if (y < -120 || y > H + 160) return;
    const gradient = ctx.createLinearGradient(0, y - 80, 0, H);
    gradient.addColorStop(0, 'rgba(255,115,46,0)');
    gradient.addColorStop(0.42, 'rgba(255,92,35,.17)');
    gradient.addColorStop(1, 'rgba(86,24,13,.82)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - 80, W, H - y + 80);
    ctx.strokeStyle = 'rgba(255,174,66,.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 24) {
      const py = y + Math.sin(x * 0.047 + time * 5) * 7 + Math.sin(x * 0.019 - time * 3) * 4;
      if (x) ctx.lineTo(x, py);
      else ctx.moveTo(x, py);
    }
    ctx.stroke();
  }

  function drawSpeedLines() {
    if (state.reducedMotion) return;
    const speed = Math.hypot(player.vx, player.vy);
    const intensity = clamp((speed - 620) / 500 + (player.hyper ? 0.24 : 0), 0, 1);
    if (!intensity) return;
    ctx.save();
    ctx.globalAlpha = intensity * 0.13;
    ctx.strokeStyle = '#e2ffe8';
    for (let i = 0; i < 16; i += 1) {
      const star = state.stars[i];
      const y = (star.y + state.elapsed * 150 * star.parallax) % H;
      ctx.beginPath();
      ctx.moveTo(star.x, y);
      ctx.lineTo(star.x - player.vx * 0.016, y + 24 + intensity * 28);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKeycap(x, y, w, label) {
    ctx.fillStyle = 'rgba(8,14,11,.70)';
    ctx.strokeStyle = 'rgba(235,225,196,.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(x, y, w, 22, 4);
    if (ctx.roundRect) {
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, w, 22);
      ctx.strokeRect(x, y, w, 22);
    }
    ctx.fillStyle = 'rgba(255,249,229,.92)';
    ctx.font = '700 9px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 11);
  }

  function drawHud() {
    const phase = S.phaseForFloor(player.highestFloor);
    const route = S.activeRouteChunk();
    const assist = S.flowAssist?.getState?.() || {};
    const stick = S.sapStick?.getState?.() || {};
    const stride = clamp((assist.strideMomentum || 0) / TUNE.run.strideMax, 0, 1);

    ctx.save();
    ctx.fillStyle = 'rgba(15,22,17,.63)';
    ctx.strokeStyle = 'rgba(239,220,175,.14)';
    ctx.beginPath();
    ctx.roundRect?.(13, 14, 150, 160, 8);
    if (ctx.roundRect) {
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(13, 14, 150, 160);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#9dcca0';
    ctx.font = '700 9px ui-monospace,monospace';
    ctx.fillText('COMBO!', 25, 25);
    ctx.fillStyle = '#f0dfb0';
    ctx.font = '700 30px ui-monospace,monospace';
    ctx.fillText(`×${player.combo || 0}`, 23, 37);
    ctx.fillStyle = 'rgba(232,249,222,.58)';
    ctx.font = '8px ui-monospace,monospace';
    ctx.fillText(`FLOOR ${player.highestFloor}  ·  ${phase.name}`, 25, 74);
    ctx.fillText(`SCORE ${Math.floor(player.score).toString().padStart(6, '0')}`, 25, 87);

    ctx.fillStyle = '#8ec7bf';
    ctx.font = '700 8px ui-monospace,monospace';
    ctx.fillText('FLOW', 25, 104);
    for (let i = 0; i < 5; i += 1) {
      const active = player.combo >= (i + 1) * 2;
      ctx.fillStyle = active ? (player.hyper ? '#ffe07a' : '#7fc56d') : 'rgba(255,255,255,.10)';
      ctx.fillRect(25 + i * 22, 118, 18, 8);
    }

    ctx.fillStyle = '#8ec7bf';
    ctx.fillText('MOMENTUM', 25, 136);
    for (let i = 0; i < 3; i += 1) {
      const active = stride >= (i + 1) / 3 - 0.07;
      ctx.fillStyle = active ? '#67b8ca' : 'rgba(255,255,255,.10)';
      ctx.beginPath();
      ctx.ellipse(34 + i * 27, 156, 8, 4.5, -0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom-left chord card, mirroring the visual concept while staying compact.
    ctx.fillStyle = 'rgba(10,14,12,.72)';
    ctx.strokeStyle = stick.cooldown > 0 ? 'rgba(255,255,255,.12)' : 'rgba(255,190,74,.35)';
    ctx.beginPath();
    ctx.roundRect?.(18, H - 70, 232, 50, 7);
    if (ctx.roundRect) {
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(18, H - 70, 232, 50);
    }
    drawKeycap(28, H - 60, 54, 'SHIFT');
    ctx.fillStyle = 'rgba(255,244,216,.62)';
    ctx.font = '700 13px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.fillText('+', 91, H - 49);
    drawKeycap(101, H - 60, 58, 'SPACE');
    ctx.textAlign = 'left';
    ctx.fillStyle = stick.active ? '#fff0a8' : '#ffb74e';
    ctx.font = '700 9px ui-monospace,monospace';
    ctx.fillText(stick.active ? 'SAP STICK LOCKED' : 'SAP STICK', 169, H - 58);
    ctx.fillStyle = 'rgba(245,244,224,.44)';
    ctx.font = '7px ui-monospace,monospace';
    ctx.fillText('hold Shift · tap Space', 169, H - 43);

    if ((route?.type === 'SAPRUN' || route?.type === 'GROVE') && player.highestFloor < 55) {
      ctx.fillStyle = 'rgba(13,17,14,.70)';
      ctx.strokeStyle = 'rgba(255,188,66,.25)';
      ctx.beginPath();
      ctx.roundRect?.(W - 213, 22, 194, 100, 7);
      if (ctx.roundRect) {
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(W - 213, 22, 194, 100);
      }
      ctx.fillStyle = '#ffc05b';
      ctx.font = '700 9px ui-monospace,monospace';
      ctx.textAlign = 'left';
      ctx.fillText(route.type === 'SAPRUN' ? 'SAP GAP' : 'GROVE CHAMBER', W - 198, 36);
      ctx.fillStyle = 'rgba(246,245,222,.58)';
      ctx.font = '8px ui-monospace,monospace';
      ctx.fillText('amber knots replace branches', W - 198, 54);
      ctx.fillText('Shift + Space locks the best line', W - 198, 69);
      ctx.fillText('each stick auto-vaults after 0.22s', W - 198, 84);
      ctx.fillText('line up · mash cleanly · keep moving', W - 198, 99);
    }
    ctx.restore();
  }

  function drawTelemetry() {
    if (!state.telemetryVisible) return;
    const summary = S.summarizeTelemetry();
    const assist = S.flowAssist?.getState?.() || {};
    const stick = S.sapStick?.getState?.() || {};
    const lines = [
      `seed ${summary.seed} · ${S.round(summary.runSeconds, 1)}s · floor ${summary.floor}`,
      `speed avg ${summary.movement.avgSpeed} · peak ${summary.movement.peakSpeed} · stride ${Math.round(assist.strideMomentum || 0)}`,
      `air ${Math.round(summary.movement.airborneRatio * 100)}% · kick ${summary.counters.doubleJumps} · bark ${summary.counters.wallBounces}`,
      `sap stick ${summary.counters.sapStickCasts || 0}/${summary.counters.sapStickMisses || 0} · vault ${summary.counters.sapStickVaults || 0} · saves ${summary.counters.sapStickRescues || 0}`,
      `rings ${summary.counters.ringsThreaded} · combo max ${summary.combo.maxCombo} · stick lockouts ${stick.lockedAnchors || 0}`,
      `cling ${summary.counters.barkClings || 0} · bark kicks ${summary.counters.barkKicks || 0} · redirects ${summary.counters.passiveBarkRedirects || 0}`,
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(4,8,6,.84)';
    ctx.fillRect(265, 14, 420, 108);
    ctx.strokeStyle = 'rgba(205,232,202,.18)';
    ctx.strokeRect(265.5, 14.5, 419, 107);
    ctx.font = '8px ui-monospace,monospace';
    lines.forEach((line, index) => {
      ctx.fillStyle = index ? 'rgba(232,245,226,.58)' : 'rgba(221,246,215,.82)';
      ctx.fillText(line, 278, 26 + index * 14);
    });
    ctx.restore();
  }

  function drawMessages() {
    let y = H * 0.22;
    for (const message of state.messages.slice(-3)) {
      const t = message.life / message.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 5 + 0.25);
      ctx.textAlign = 'center';
      ctx.font = `700 ${message.size}px ui-monospace,monospace`;
      ctx.fillStyle = '#fff4d5';
      ctx.shadowColor = '#ffb44a';
      ctx.shadowBlur = 11;
      ctx.fillText(message.text, W / 2, y);
      ctx.restore();
      y += message.size + 8;
    }
  }

  function drawTouchControls() {
    if (!state.touchMode || state.mode !== 'playing') return;
    const items = [
      { x: 68, label: '◀', action: 'left' },
      { x: 142, label: '▶', action: 'right' },
      { x: W - 142, label: 'JUMP', action: 'jump' },
      { x: W - 68, label: 'SAP', action: 'sap' },
    ];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of items) {
      const active = [...state.pointers.values()].includes(item.action);
      ctx.fillStyle = active ? 'rgba(255,194,91,.19)' : 'rgba(10,20,15,.30)';
      ctx.strokeStyle = active ? 'rgba(255,211,123,.65)' : 'rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.arc(item.x, H - 82, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(248,248,224,.78)';
      ctx.font = item.label.length > 2 ? '8px ui-monospace,monospace' : '15px ui-monospace,monospace';
      ctx.fillText(item.label, item.x, H - 82);
    }
    ctx.restore();
  }

  function drawOverlay() {
    if (state.mode === 'playing') return;
    ctx.fillStyle = 'rgba(7,12,9,.54)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.mode === 'title') {
      ctx.fillStyle = '#f4d39b';
      ctx.font = '700 44px ui-monospace,monospace';
      ctx.fillText('SYLVARIA: SEQUOIA', W / 2, H * 0.25);
      ctx.fillStyle = '#9fd4a5';
      ctx.font = '700 11px ui-monospace,monospace';
      ctx.fillText('SAPSTICK CANOPY · v0.4', W / 2, H * 0.33);
      ctx.fillStyle = 'rgba(248,247,223,.72)';
      ctx.font = '10px ui-monospace,monospace';
      ctx.fillText('fewer branches · larger open routes · amber anchors carry the hard lines', W / 2, H * 0.43);
      ctx.fillText('run for height · Space for Air Kick · hold Shift + tap Space for SAP STICK', W / 2, H * 0.48);
      ctx.fillText('Sap Stick never charges: it locks, tethers briefly, then auto-vaults with momentum', W / 2, H * 0.53);
      ctx.fillStyle = '#fff3cf';
      ctx.font = '700 13px ui-monospace,monospace';
      ctx.fillText(state.touchMode ? 'TAP TO CLIMB' : 'SPACE TO CLIMB', W / 2, H * 0.65);
      ctx.fillStyle = 'rgba(245,247,227,.42)';
      ctx.font = '9px ui-monospace,monospace';
      ctx.fillText('T telemetry · R retry · N new route · P pause', W / 2, H * 0.72);
    } else if (state.mode === 'paused') {
      ctx.fillStyle = '#fff0cf';
      ctx.font = '700 28px ui-monospace,monospace';
      ctx.fillText('PAUSED IN THE CANOPY', W / 2, H * 0.45);
      ctx.font = '11px ui-monospace,monospace';
      ctx.fillText('P or Space to resume', W / 2, H * 0.53);
    } else if (state.mode === 'gameover') {
      const summary = S.summarizeTelemetry();
      ctx.fillStyle = '#fff0cf';
      ctx.font = '700 30px ui-monospace,monospace';
      ctx.fillText('THE GROVE KEPT THE MOMENTUM', W / 2, H * 0.34);
      ctx.fillStyle = 'rgba(244,247,224,.74)';
      ctx.font = '13px ui-monospace,monospace';
      ctx.fillText(`floor ${player.highestFloor} · score ${Math.floor(player.score)} · best flow ${player.bestCombo}×`, W / 2, H * 0.44);
      ctx.fillStyle = 'rgba(244,247,224,.50)';
      ctx.font = '10px ui-monospace,monospace';
      ctx.fillText(`sap sticks ${summary.counters.sapStickCasts || 0} · vaults ${summary.counters.sapStickVaults || 0} · saves ${summary.counters.sapStickRescues || 0}`, W / 2, H * 0.50);
      ctx.fillStyle = '#fff3cf';
      ctx.font = '700 13px ui-monospace,monospace';
      ctx.fillText(state.touchMode ? 'TAP TO RUN AGAIN' : 'SPACE TO RUN AGAIN', W / 2, H * 0.61);
    }
  }

  function render(alpha, now) {
    ctx.save();
    const speed = Math.hypot(player.vx, player.vy);
    const speedWide = clamp((speed - 650) / 1000, 0, 1) * TUNE.camera.speedWideView;
    const hyperWide = player.hyper ? TUNE.camera.hyperWideView : 0;
    const sceneScale = state.reducedMotion ? 1 : 1 - speedWide - hyperWide;
    const shakePhase = now * 0.021 + state.elapsed * 7.3;
    const sx = state.shake && !state.reducedMotion ? Math.sin(shakePhase * 1.37) * state.shake * 3.2 : 0;
    const sy = state.shake && !state.reducedMotion ? Math.cos(shakePhase * 1.73) * state.shake * 2.8 : 0;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(sceneScale, sceneScale);
    ctx.translate(-W / 2, -H / 2);

    drawBackground(now * 0.001);
    drawSpeedLines();
    drawSequoia('left');
    drawSequoia('right');
    for (const branch of state.branches) drawBranch(branch);
    for (const ring of state.rings) drawRing(ring, now * 0.001);
    const preview = (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight')) && !player.sap ? S.sapStick?.getTargetPreview?.() : null;
    for (const knot of state.knots) drawKnot(knot, now * 0.001, knot === preview);
    drawThreat(now * 0.001);
    drawSapTargetPreview(alpha, now * 0.001);
    drawSapline(alpha);
    drawParticles();
    drawPlayer(alpha, now * 0.001);
    ctx.restore();

    drawHud();
    drawTelemetry();
    drawMessages();
    drawTouchControls();
    drawOverlay();
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,211,139,${state.flash * 0.16})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  S.worldToScreenY = worldToScreenY;
  S.render = render;
  S.canopyRenderer = {
    version: '0.4.0',
    barkModel: 'shared-vertex anisotropic puzzle lattice',
    barkRows: BARK_ROW,
    barkColumns: BARK_COLS,
  };
})();
