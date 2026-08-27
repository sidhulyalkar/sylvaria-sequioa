(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render) return;

  const { ctx, W, H, state, player, TUNE, clamp, lerp } = S;
  const baseRender = S.render;
  const TAU = Math.PI * 2;
  const ART_VERSION = 'reference-production-v1';
  let warned = false;

  const barkTiles = {
    left: null,
    right: null,
  };

  function worldToScreenY(worldY) {
    return S.worldToScreenY ? S.worldToScreenY(worldY) : H - (worldY - state.cameraBottom);
  }

  function hash(a, b = 0, c = 0) {
    let x = Math.imul((a | 0) ^ 0x7f4a7c15, 0x45d9f3b);
    x = (x + Math.imul((b | 0) ^ 0x165667b1, 0x27d4eb2d)) | 0;
    x = (x + Math.imul((c | 0) ^ 0x9e3779b9, 0x85ebca6b)) | 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    return (x >>> 0) / 4294967295;
  }

  function mixHex(a, b, t) {
    const parse = (hex) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const aa = parse(a);
    const bb = parse(b);
    const ch = aa.map((v, i) => Math.round(lerp(v, bb[i], t)).toString(16).padStart(2, '0')).join('');
    return `#${ch}`;
  }

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function makeOffscreen(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function makeBarkTile(side) {
    const canvas = makeOffscreen(180, 1180);
    const g = canvas.getContext('2d');
    const left = side === 'left';
    const palette = ['#5b2c1d', '#754029', '#8d5030', '#a4643b', '#6b3825', '#9a6250', '#736263'];
    const pale = ['#a99b94', '#b3a6a0', '#908783', '#c0aaa0'];
    const core = ['#2a140d', '#3a1d12', '#482416', '#5c2e1b'];

    const base = g.createLinearGradient(0, 0, 180, 0);
    if (left) {
      base.addColorStop(0, '#160b08');
      base.addColorStop(0.45, '#4b2518');
      base.addColorStop(1, '#7f472c');
    } else {
      base.addColorStop(0, '#7f472c');
      base.addColorStop(0.55, '#4b2518');
      base.addColorStop(1, '#160b08');
    }
    g.fillStyle = base;
    g.fillRect(0, 0, canvas.width, canvas.height);

    const cols = 6;
    const rows = 17;
    const points = Array.from({ length: rows + 1 }, (_, row) =>
      Array.from({ length: cols + 1 }, (_, col) => {
        const edge = col === 0 || col === cols;
        const baseX = (col / cols) * canvas.width;
        const baseY = (row / rows) * canvas.height;
        return {
          x: baseX + (edge ? 0 : (hash(row, col, left ? 11 : 19) - 0.5) * 24),
          y: baseY + (hash(row, col, left ? 23 : 31) - 0.5) * 34,
        };
      })
    );

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const p0 = points[row][col];
        const p1 = points[row][col + 1];
        const p2 = points[row + 1][col + 1];
        const p3 = points[row + 1][col];
        const seed = hash(row, col, left ? 41 : 59);
        const face = seed > 0.72
          ? pale[Math.floor(hash(row, col, 67) * pale.length) % pale.length]
          : palette[Math.floor(seed * palette.length) % palette.length];
        const deep = core[Math.floor(hash(row, col, 71) * core.length) % core.length];

        const trace = (dx = 0, dy = 0) => {
          g.beginPath();
          g.moveTo(p0.x + dx, p0.y + dy);
          g.lineTo(p1.x + dx, p1.y + dy);
          g.lineTo(p2.x + dx, p2.y + dy);
          g.lineTo(p3.x + dx, p3.y + dy);
          g.closePath();
        };

        trace(left ? -4 : 4, 5);
        g.fillStyle = deep;
        g.shadowColor = 'rgba(8,3,2,.75)';
        g.shadowBlur = 7;
        g.fill();
        g.shadowBlur = 0;

        trace();
        const cellGradient = g.createLinearGradient((p0.x + p3.x) * 0.5, p0.y, (p1.x + p2.x) * 0.5, p2.y);
        cellGradient.addColorStop(0, mixHex(face, '#e1b38a', 0.16 + seed * 0.12));
        cellGradient.addColorStop(0.44, face);
        cellGradient.addColorStop(1, mixHex(face, '#25130d', 0.28));
        g.fillStyle = cellGradient;
        g.fill();
        g.strokeStyle = 'rgba(31,14,10,.88)';
        g.lineWidth = 2.0;
        g.stroke();

        g.save();
        trace();
        g.clip();
        const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
        const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
        const minY = Math.min(p0.y, p1.y);
        const maxY = Math.max(p2.y, p3.y);
        const fibers = 6 + Math.floor(seed * 7);
        for (let i = 0; i < fibers; i += 1) {
          const tx = (i + 0.4) / (fibers + 0.1);
          const x = lerp(minX, maxX, tx) + (hash(row, col * 13 + i, 83) - 0.5) * 8;
          const y0 = lerp(minY, maxY, hash(row, i, 89) * 0.22);
          const y1 = lerp(minY, maxY, 0.72 + hash(col, i, 97) * 0.25);
          g.strokeStyle = i % 3 === 0 ? 'rgba(238,188,132,.52)' : 'rgba(139,74,37,.48)';
          g.lineWidth = i % 3 === 0 ? 1.1 : 1.6;
          g.beginPath();
          g.moveTo(x, y0);
          g.bezierCurveTo(
            x + (hash(row, i, 101) - 0.5) * 11,
            lerp(y0, y1, 0.32),
            x + (hash(col, i, 103) - 0.5) * 13,
            lerp(y0, y1, 0.68),
            x + (hash(row + col, i, 107) - 0.5) * 7,
            y1
          );
          g.stroke();
        }
        if (seed > 0.5) {
          for (let i = 0; i < 3; i += 1) {
            const y = lerp(minY, maxY, 0.28 + i * 0.19 + hash(row, col, 109 + i) * 0.08);
            g.strokeStyle = 'rgba(255,221,180,.24)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(minX + 4, y);
            g.lineTo(maxX - 3, y + (hash(row, col, 113 + i) - 0.5) * 9);
            g.stroke();
          }
        }
        g.restore();

        if (seed > 0.63) {
          const topX = (p0.x + p1.x) * 0.5;
          const topY = (p0.y + p1.y) * 0.5;
          const curl = 12 + hash(row, col, 131) * 22;
          const dir = left ? 1 : -1;
          g.fillStyle = seed > 0.83 ? '#ada3a0' : '#8f5b46';
          g.shadowColor = 'rgba(11,5,3,.65)';
          g.shadowBlur = 4;
          g.beginPath();
          g.moveTo(topX - dir * 8, topY + 2);
          g.lineTo(topX + dir * 13, topY + 4);
          g.lineTo(topX + dir * curl, topY - 28 - curl * 0.38);
          g.closePath();
          g.fill();
          g.shadowBlur = 0;
        }
      }
    }

    for (let i = 0; i < 90; i += 1) {
      const x = hash(i, left ? 151 : 163) * canvas.width;
      const y = hash(i, left ? 167 : 173) * canvas.height;
      const len = 20 + hash(i, 179) * 90;
      g.strokeStyle = i % 5 === 0 ? 'rgba(231,168,102,.30)' : 'rgba(112,54,27,.32)';
      g.lineWidth = 0.6 + hash(i, 181) * 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x - 6, y + len * 0.28, x + 7, y + len * 0.72, x + (hash(i, 191) - 0.5) * 8, y + len);
      g.stroke();
    }

    return canvas;
  }

  function ensureTextures() {
    if (!barkTiles.left) barkTiles.left = makeBarkTile('left');
    if (!barkTiles.right) barkTiles.right = makeBarkTile('right');
  }

  function drawCloud(x, y, scale, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f8fbf8';
    ctx.shadowColor = 'rgba(255,255,255,.46)';
    ctx.shadowBlur = 16 * scale;
    const lobes = [
      [-35, 8, 28], [-10, -4, 38], [22, 5, 30], [48, 13, 23], [7, 18, 42],
    ];
    for (const [dx, dy, r] of lobes) {
      ctx.beginPath();
      ctx.arc(x + dx * scale, y + dy * scale, r * scale, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPine(x, baseY, height, shade, sway) {
    ctx.save();
    ctx.translate(x, baseY);
    ctx.rotate(sway);
    ctx.fillStyle = shade;
    ctx.fillRect(-2, -height, 4, height);
    const tiers = Math.max(4, Math.floor(height / 26));
    for (let i = 0; i < tiers; i += 1) {
      const t = i / tiers;
      const y = -height + 12 + t * height * 0.86;
      const half = (12 + t * 26) * (height / 120);
      ctx.beginPath();
      ctx.moveTo(0, y - 22);
      ctx.lineTo(-half, y + 14);
      ctx.lineTo(half, y + 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawReferenceBackground(time) {
    const left = state.LEFT_WALL;
    const right = state.RIGHT_WALL;
    const width = right - left;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, width, H);
    ctx.clip();

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4b9fe0');
    sky.addColorStop(0.42, '#83c2ea');
    sky.addColorStop(0.68, '#b7d5dc');
    sky.addColorStop(1, '#5b7e69');
    ctx.fillStyle = sky;
    ctx.fillRect(left, 0, width, H);

    const sun = ctx.createRadialGradient(W * 0.53, H * 0.18, 4, W * 0.53, H * 0.18, 300);
    sun.addColorStop(0, 'rgba(255,247,205,.48)');
    sun.addColorStop(0.35, 'rgba(255,241,191,.16)');
    sun.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(left, 0, width, H);

    drawCloud(left + width * 0.18 + Math.sin(time * 0.07) * 14, 148, 0.82, 0.72);
    drawCloud(left + width * 0.69 + Math.sin(time * 0.05 + 2.4) * 11, 190, 0.68, 0.58);
    drawCloud(left + width * 0.43 + Math.sin(time * 0.06 + 4.1) * 8, 88, 0.52, 0.35);

    const ridge1 = ctx.createLinearGradient(0, H * 0.45, 0, H);
    ridge1.addColorStop(0, 'rgba(90,126,126,.28)');
    ridge1.addColorStop(1, 'rgba(46,87,71,.68)');
    ctx.fillStyle = ridge1;
    ctx.beginPath();
    ctx.moveTo(left, H);
    for (let x = left - 20; x <= right + 20; x += 40) {
      const n = hash(Math.floor(x / 40), 223);
      const y = H * 0.56 + Math.sin(x * 0.012 + state.cameraBottom * 0.0018) * 26 - n * 58;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(right, H);
    ctx.closePath();
    ctx.fill();

    for (let layer = 0; layer < 3; layer += 1) {
      const count = 11 + layer * 5;
      const baseY = H * (0.83 + layer * 0.06);
      const shade = layer === 0 ? 'rgba(31,82,67,.42)' : layer === 1 ? 'rgba(22,65,53,.56)' : 'rgba(14,49,39,.72)';
      for (let i = 0; i < count; i += 1) {
        const x = left + (i + 0.3 + hash(i, layer, 229) * 0.5) * width / count;
        const h = 72 + hash(i, layer, 233) * (80 + layer * 32);
        const sway = Math.sin(time * 0.32 + i) * 0.008 * (layer + 1);
        drawPine(x, baseY, h, shade, sway);
      }
    }

    const haze = ctx.createLinearGradient(0, H * 0.3, 0, H);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.72, 'rgba(208,233,219,.12)');
    haze.addColorStop(1, 'rgba(184,219,198,.26)');
    ctx.fillStyle = haze;
    ctx.fillRect(left, 0, width, H);

    ctx.restore();
  }

  function drawReferenceTrunk(side) {
    ensureTextures();
    const leftSide = side === 'left';
    const edge = leftSide ? state.LEFT_WALL : state.RIGHT_WALL;
    const width = leftSide ? edge : W - edge;
    const tile = barkTiles[side];
    const tileH = tile.height;
    const phase = ((state.cameraBottom * 0.82) % tileH + tileH) % tileH;
    const x = leftSide ? 0 : edge;

    ctx.save();
    ctx.fillStyle = '#2a140d';
    ctx.fillRect(x, 0, width, H);
    const y0 = phase - tileH;
    for (let y = y0; y < H + tileH; y += tileH) {
      ctx.drawImage(tile, 0, 0, tile.width, tile.height, x, y, width, tileH);
    }

    const shade = ctx.createLinearGradient(leftSide ? 0 : edge, 0, leftSide ? edge : W, 0);
    if (leftSide) {
      shade.addColorStop(0, 'rgba(7,3,2,.58)');
      shade.addColorStop(0.52, 'rgba(28,12,7,.04)');
      shade.addColorStop(1, 'rgba(255,176,103,.12)');
    } else {
      shade.addColorStop(0, 'rgba(255,176,103,.12)');
      shade.addColorStop(0.48, 'rgba(28,12,7,.04)');
      shade.addColorStop(1, 'rgba(7,3,2,.58)');
    }
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, width, H);

    ctx.shadowColor = 'rgba(0,0,0,.86)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = '#241108';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(edge, -20);
    ctx.lineTo(edge, H + 20);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,183,111,.46)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(edge + (leftSide ? -1 : 1), 0);
    ctx.lineTo(edge + (leftSide ? -1 : 1), H);
    ctx.stroke();

    const first = Math.floor((state.cameraBottom - 100) / 96) - 1;
    const last = Math.ceil((state.cameraBottom + H + 100) / 96) + 1;
    for (let row = first; row <= last; row += 1) {
      const seed = hash(row, leftSide ? 271 : 277);
      if (seed < 0.34) continue;
      const wy = row * 96 + seed * 28;
      const sy = worldToScreenY(wy);
      const reach = 8 + hash(row, 281) * 16;
      const h = 24 + hash(row, 283) * 42;
      const dir = leftSide ? 1 : -1;
      ctx.fillStyle = seed > 0.78 ? 'rgba(166,151,147,.78)' : 'rgba(126,76,54,.88)';
      ctx.shadowColor = 'rgba(0,0,0,.48)';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.moveTo(edge, sy - h * 0.48);
      ctx.bezierCurveTo(edge + dir * reach * 0.45, sy - h * 0.20, edge + dir * reach, sy + h * 0.12, edge + dir * reach * 0.62, sy + h * 0.48);
      ctx.lineTo(edge, sy + h * 0.33);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function branchScreen(branch) {
    const x1 = branch.x1;
    const x2 = branch.x2;
    const y1 = worldToScreenY(S.branchYAt(branch, x1));
    const y2 = worldToScreenY(S.branchYAt(branch, x2));
    return { x1, x2, y1, y2, mx: (x1 + x2) * 0.5, my: (y1 + y2) * 0.5 };
  }

  function drawLeaf(x, y, angle, scale, color = '#6f9d34') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(39,76,29,.72)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(4, -6, 11, -5, 14, 0);
    ctx.bezierCurveTo(9, 5, 4, 5, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(48,91,32,.82)';
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawReferenceBranch(branch) {
    const p = branchScreen(branch);
    if (Math.max(p.y1, p.y2) < -90 || Math.min(p.y1, p.y2) > H + 90) return;
    const thickness = Math.max(9, branch.thickness * 1.35);
    const bend = Math.sin(branch.floor * 1.31) * 7 - 3;
    const rootLeft = branch.side === 'left';
    const rootRight = branch.side === 'right';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(7,3,2,.66)';
    ctx.shadowBlur = 9;
    ctx.strokeStyle = '#2d170f';
    ctx.lineWidth = thickness + 9;
    ctx.beginPath();
    ctx.moveTo(p.x1, p.y1);
    ctx.quadraticCurveTo(p.mx, p.my + bend, p.x2, p.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const wood = ctx.createLinearGradient(p.x1, p.y1 - thickness, p.x1, p.y1 + thickness);
    wood.addColorStop(0, '#8c5130');
    wood.addColorStop(0.45, '#5a2c1c');
    wood.addColorStop(1, '#2f170f');
    ctx.strokeStyle = wood;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(p.x1, p.y1);
    ctx.quadraticCurveTo(p.mx, p.my + bend, p.x2, p.y2);
    ctx.stroke();

    for (let i = 0; i < 4; i += 1) {
      const off = -thickness * 0.28 + i * thickness * 0.18;
      ctx.strokeStyle = i % 2 ? 'rgba(216,145,83,.35)' : 'rgba(34,16,10,.48)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x1 + 4, p.y1 + off);
      ctx.quadraticCurveTo(p.mx, p.my + bend + off * 0.3, p.x2 - 4, p.y2 + off * 0.2);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(111,139,57,.86)';
    ctx.lineWidth = 2.6;
    ctx.setLineDash([18, 10, 7, 15]);
    ctx.beginPath();
    ctx.moveTo(p.x1 + 5, p.y1 - thickness * 0.48);
    ctx.quadraticCurveTo(p.mx, p.my + bend - thickness * 0.55, p.x2 - 5, p.y2 - thickness * 0.48);
    ctx.stroke();
    ctx.setLineDash([]);

    const tipX = rootLeft ? p.x2 : rootRight ? p.x1 : p.x2;
    const tipY = rootLeft ? p.y2 : rootRight ? p.y1 : p.y2;
    const dir = rootLeft ? 1 : rootRight ? -1 : 1;
    ctx.strokeStyle = '#4e2818';
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 3; i += 1) {
      const a = (i - 1) * 0.48;
      ctx.beginPath();
      ctx.moveTo(tipX - dir * (13 + i * 3), tipY + i * 2);
      ctx.lineTo(tipX + dir * (13 + i * 3), tipY + Math.sin(a) * 16);
      ctx.stroke();
    }

    const leafSeed = hash(branch.floor, 311);
    if (leafSeed > 0.25) {
      for (let i = 0; i < 3; i += 1) {
        drawLeaf(tipX - dir * (7 + i * 11), tipY - 8 - i * 2, dir * (-0.2 + i * 0.24), 0.65 + i * 0.08, i === 1 ? '#86ad3d' : '#648d34');
      }
    }

    if (branch.launch) {
      const y = worldToScreenY(S.branchYAt(branch, branch.launchX));
      ctx.shadowColor = '#ffb130';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(255,159,31,.22)';
      ctx.beginPath();
      ctx.arc(branch.launchX, y, 19 + Math.sin(state.elapsed * 5 + branch.floor) * 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b66527';
      ctx.beginPath();
      ctx.ellipse(branch.launchX, y + 1, 13, 7, -0.12, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawReferenceRing(ring, time) {
    if (ring.hit) return;
    const y = worldToScreenY(ring.y);
    if (y < -70 || y > H + 70) return;
    const r = ring.radius * (1 + Math.sin(time * 4.2 + ring.pulse) * 0.045);
    ctx.save();
    ctx.translate(ring.x, y);
    ctx.rotate(time * 0.22 + ring.pulse);
    ctx.shadowColor = '#93f1b6';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#a8f5c0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,225,144,.75)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, r - 7, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawReferenceKnot(knot, time, target) {
    const y = worldToScreenY(knot.y);
    if (y < -80 || y > H + 80) return;
    const stickAnchor = knot.anchorKind === 'sap-stick';
    const pulse = 1 + Math.sin(time * 4 + knot.pulse) * 0.075;
    const outer = stickAnchor ? 34 : 27;

    ctx.save();
    ctx.shadowColor = target ? '#fff1a5' : '#ff9c20';
    ctx.shadowBlur = target ? 28 : 20;
    const glow = ctx.createRadialGradient(knot.x, y, 1, knot.x, y, outer * 1.7 * pulse);
    glow.addColorStop(0, 'rgba(255,252,207,.98)');
    glow.addColorStop(0.18, 'rgba(255,198,75,.96)');
    glow.addColorStop(0.48, 'rgba(255,129,21,.55)');
    glow.addColorStop(1, 'rgba(255,111,14,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(knot.x, y, outer * 1.7 * pulse, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(42,18,9,.88)';
    ctx.beginPath();
    ctx.ellipse(knot.x, y, outer * 0.62, outer * 0.78, knot.pulse * 0.1, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(138,72,34,.92)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.translate(knot.x, y);
    ctx.rotate(knot.pulse * 0.08);
    ctx.fillStyle = '#ffad29';
    ctx.beginPath();
    ctx.moveTo(0, -12 * pulse);
    ctx.bezierCurveTo(10, -7, 11, 6, 1, 13);
    ctx.bezierCurveTo(-12, 7, -11, -6, 0, -12 * pulse);
    ctx.fill();
    ctx.strokeStyle = '#fff0a6';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,247,186,.68)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -8);
    ctx.quadraticCurveTo(4, -1, 0, 8);
    ctx.stroke();

    if (stickAnchor) {
      ctx.strokeStyle = target ? '#fff6b2' : 'rgba(255,211,102,.72)';
      ctx.lineWidth = target ? 2.7 : 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 19 + Math.sin(time * 5 + knot.pulse) * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawReferenceSapPreview(alpha, time) {
    if (!state.keys.has('ShiftLeft') && !state.keys.has('ShiftRight')) return;
    if (player.sap) return;
    const target = S.sapStick?.getTargetPreview?.();
    if (!target) return;
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const ty = worldToScreenY(target.y);
    const cx = (x + target.x) * 0.5 + Math.sign(target.x - x || 1) * 20;
    const cy = Math.min(y, ty) - 64;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,208,75,.68)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, target.x, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff1a8';
    ctx.font = '800 10px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ff9c27';
    ctx.shadowBlur = 8;
    ctx.fillText('LOCK', target.x, ty - 30 - Math.sin(time * 6) * 2);
    ctx.restore();
  }

  function drawReferenceSapline(alpha, time) {
    if (!player.sap) return;
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const tx = player.sap.knot.x;
    const ty = worldToScreenY(player.sap.knot.y);
    const dir = Math.sign(tx - x || player.facing || 1);
    const cx = (x + tx) * 0.5 - dir * 24;
    const cy = Math.min(y, ty) - 72 - Math.min(38, Math.abs(player.vx) * 0.035);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff9f1e';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(255,138,20,.34)';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    ctx.strokeStyle = '#ffb42e';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();
    ctx.strokeStyle = '#fff4b8';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();

    ctx.globalAlpha = 0.28;
    for (let k = 1; k <= 2; k += 1) {
      ctx.strokeStyle = '#ffc649';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(x - dir * k * 7, y + k * 4);
      ctx.quadraticCurveTo(cx - dir * k * 11, cy + k * 10, tx - dir * k * 3, ty + k * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (!state.reducedMotion) {
      for (let i = 0; i < 7; i += 1) {
        const t = (i + 1) / 8;
        const qx = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * tx;
        const qy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * ty;
        const flicker = 1 + Math.sin(time * 10 + i * 1.8) * 0.6;
        ctx.fillStyle = i % 2 ? '#fff1a4' : '#ffb72f';
        ctx.beginPath();
        ctx.arc(qx + Math.sin(i * 9.3) * 5, qy + Math.cos(i * 5.1) * 4, 1.4 * flicker, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawReferencePlayer(alpha, time) {
    const x = lerp(player.px, player.x, alpha);
    const y = worldToScreenY(lerp(player.py, player.y, alpha));
    const speed = Math.hypot(player.vx, player.vy);
    const facing = player.facing || 1;
    const cling = player.state === 'wall-cling' || Boolean(S.flowAssist?.getState?.().clingActive);
    const sap = Boolean(player.sap?.stickMode);
    const falling = player.vy < -150;
    const run = Math.sin(state.elapsed * 13 + player.x * 0.03) * clamp(Math.abs(player.vx) / 420, 0, 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(cling ? 0 : clamp(player.vx / 1250, -0.18, 0.18));
    ctx.scale(facing, 1);
    ctx.shadowColor = 'rgba(8,4,2,.42)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 5;

    const scarf = 30 + clamp(speed / 17, 0, 44);
    ctx.fillStyle = player.hyper ? '#ffd35a' : '#e85928';
    ctx.beginPath();
    ctx.moveTo(-10, -11);
    ctx.bezierCurveTo(-23, -18 + Math.sin(time * 8) * 4, -scarf * 0.68, -9, -scarf, 1);
    ctx.lineTo(-scarf + 8, 9);
    ctx.bezierCurveTo(-scarf * 0.55, 2, -19, 5, -5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = '#5a3724';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 9);
    ctx.lineTo(-11 - run * 7, 23);
    ctx.moveTo(7, 9);
    ctx.lineTo(12 + run * 7, 23);
    ctx.stroke();
    ctx.fillStyle = '#3a2519';
    ctx.strokeStyle = '#1f140e';
    ctx.lineWidth = 2;
    for (const [bx, by, rot] of [[-14 - run * 7, 25, -0.12], [14 + run * 7, 25, 0.12]]) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c97c3e';
      ctx.fillRect(-7, -1, 13, 2);
      ctx.fillStyle = '#3a2519';
      ctx.restore();
    }

    ctx.fillStyle = '#4b782f';
    ctx.strokeStyle = '#263c1d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -9);
    ctx.quadraticCurveTo(-18, 5, -10, 16);
    ctx.lineTo(-3, 11);
    ctx.lineTo(2, 17);
    ctx.lineTo(7, 10);
    ctx.lineTo(13, 15);
    ctx.quadraticCurveTo(18, 3, 13, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6c3f22';
    ctx.fillRect(-14, 5, 28, 4);
    ctx.fillStyle = '#e6aa3c';
    ctx.beginPath();
    ctx.arc(0, 7, 3, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(-12, 5);
    ctx.rotate(-0.22);
    ctx.fillStyle = '#6b4025';
    ctx.strokeStyle = '#362116';
    ctx.lineWidth = 2;
    roundRectPath(-9, -3, 15, 13, 4);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#bd7a3d';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(3, 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#e2a16a';
    ctx.strokeStyle = '#4c2c1d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, -17, 18, 16.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-17, -16, 5.3, 6, -0.18, 0, TAU);
    ctx.ellipse(17, -16, 5.3, 6, 0.18, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#d26f29';
    ctx.beginPath();
    ctx.moveTo(-7, -31);
    ctx.lineTo(-1, -39);
    ctx.lineTo(3, -31);
    ctx.lineTo(9, -37);
    ctx.lineTo(8, -27);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#315d2d';
    ctx.strokeStyle = '#1f3d20';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -21, 18.8, Math.PI, 0);
    ctx.lineTo(16, -12);
    ctx.quadraticCurveTo(8, -8, 2, -11);
    ctx.quadraticCurveTo(-7, -7, -16, -12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 4; i += 1) {
      const ang = -2.9 + i * 0.33;
      drawLeaf(-7 + i * 4, -27 - (i % 2) * 3, ang, 0.55 + i * 0.04, i % 2 ? '#6f9e3d' : '#4f7d32');
    }
    ctx.strokeStyle = '#355d2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -35);
    ctx.quadraticCurveTo(5, -43, 11, -45);
    ctx.stroke();
    drawLeaf(10, -45, -0.35, 0.55, '#7dac3e');

    const eyeY = -18;
    ctx.fillStyle = '#fff8e7';
    ctx.strokeStyle = '#43291d';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(-6, eyeY, 5.2, falling ? 6.4 : 5.8, -0.08, 0, TAU);
    ctx.ellipse(6, eyeY, 5.2, falling ? 6.4 : 5.8, 0.08, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#302019';
    const pupil = falling ? -1.7 : sap ? 0.8 : 0;
    ctx.beginPath();
    ctx.arc(-5.4, eyeY + pupil, 2.3, 0, TAU);
    ctx.arc(6.6, eyeY + pupil, 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4.6, eyeY + pupil - 0.9, 0.8, 0, TAU);
    ctx.arc(7.4, eyeY + pupil - 0.9, 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c66d43';
    ctx.beginPath();
    ctx.arc(0, -13, 1.4, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#5b241c';
    ctx.strokeStyle = '#482219';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (falling && !sap) {
      ctx.ellipse(0, -8, 3.8, 4.8, 0, 0, TAU);
    } else {
      ctx.arc(0, -9, 7.2, 0.08, Math.PI - 0.08);
      ctx.lineTo(-5.7, -8);
      ctx.quadraticCurveTo(0, -1.7, 5.7, -8);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (!falling || sap) {
      ctx.fillStyle = '#fff1d7';
      ctx.fillRect(-3.2, -7.9, 6.4, 2.1);
    }

    ctx.strokeStyle = '#6e4429';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(18, -13);
    ctx.moveTo(-10, -4);
    ctx.lineTo(-18, 3);
    ctx.stroke();
    ctx.fillStyle = '#8a562f';
    ctx.beginPath();
    ctx.arc(18, -13, 4.4, 0, TAU);
    ctx.arc(-18, 3, 4.4, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(19, -13);
    ctx.rotate(sap ? -0.82 : -0.58 + Math.sin(time * 4.2) * 0.03);
    ctx.strokeStyle = '#4b2d1c';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(0, -30);
    ctx.stroke();
    ctx.strokeStyle = '#c69343';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1, -25);
    ctx.lineTo(5, -33);
    ctx.stroke();
    ctx.shadowColor = '#ff9f1f';
    ctx.shadowBlur = sap ? 24 : 12;
    ctx.fillStyle = '#ffb62f';
    ctx.strokeStyle = '#fff1a0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, -39);
    ctx.quadraticCurveTo(12, -31, 5, -24);
    ctx.quadraticCurveTo(-5, -28, 4, -39);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    if (player.airJumps > 0 && !player.grounded) {
      ctx.save();
      ctx.strokeStyle = 'rgba(112,225,255,.42)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.arc(x, y, 38 + Math.sin(time * 5) * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    if (cling) {
      ctx.save();
      ctx.fillStyle = '#fff5c9';
      ctx.strokeStyle = 'rgba(56,28,16,.75)';
      ctx.lineWidth = 3;
      ctx.font = '900 11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText('GRIP!', x, y - 55);
      ctx.fillText('GRIP!', x, y - 55);
      ctx.restore();
    }
  }

  function drawReferenceThreat(time) {
    const y = worldToScreenY(state.threatY);
    if (y < -140 || y > H + 180) return;
    const gradient = ctx.createLinearGradient(0, y - 90, 0, H);
    gradient.addColorStop(0, 'rgba(255,119,29,0)');
    gradient.addColorStop(0.42, 'rgba(255,97,22,.14)');
    gradient.addColorStop(1, 'rgba(77,21,9,.77)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - 90, W, H - y + 90);
    ctx.strokeStyle = 'rgba(255,182,58,.72)';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = '#ff7c20';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 18) {
      const py = y + Math.sin(x * 0.046 + time * 5.4) * 6 + Math.sin(x * 0.018 - time * 3.3) * 4;
      if (x) ctx.lineTo(x, py);
      else ctx.moveTo(x, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawReferenceParticles() {
    for (const particle of state.particles) {
      const y = worldToScreenY(particle.y);
      const life = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = life;
      const color = particle.kind === 'resin' ? '#ffc43d' : particle.kind === 'ember' ? '#ff7134' : particle.kind === 'bark' ? '#c37b4d' : '#91c95f';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = particle.kind === 'resin' ? 10 : 4;
      ctx.beginPath();
      ctx.arc(particle.x, y, Math.max(1.2, particle.r * 1.15), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLogo(x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.82)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#f1d39b';
    ctx.strokeStyle = '#4b2313';
    ctx.lineWidth = 4;
    ctx.font = '900 15px Georgia,serif';
    ctx.strokeText('SYLVARIA', 14, 0);
    ctx.fillText('SYLVARIA', 14, 0);
    ctx.font = '900 34px Georgia,serif';
    ctx.strokeText('SEQUOIA', 0, 13);
    ctx.fillStyle = '#ffca78';
    ctx.fillText('SEQUOIA', 0, 13);
    ctx.shadowBlur = 0;
    drawLeaf(4, 14, -2.5, 0.52, '#6e9d35');
    drawLeaf(112, 15, -0.5, 0.52, '#6e9d35');
    ctx.restore();
  }

  function drawPanel(x, y, w, h, alpha = 0.72) {
    ctx.save();
    roundRectPath(x, y, w, h, 7);
    ctx.fillStyle = `rgba(9,11,9,${alpha})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,229,177,.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function drawKeycap(x, y, w, label) {
    ctx.save();
    roundRectPath(x, y, w, 24, 4);
    ctx.fillStyle = 'rgba(21,23,21,.94)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,249,230,.54)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#fffaf0';
    ctx.font = '800 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + 12);
    ctx.restore();
  }

  function drawReferenceHud() {
    const assist = S.flowAssist?.getState?.() || {};
    const stride = clamp((assist.strideMomentum || 0) / Math.max(1, TUNE.run.strideMax || TUNE.run.maxSpeed), 0, 1);
    const route = S.activeRouteChunk?.();
    const leftX = 18;

    ctx.save();
    drawLogo(22, 18, 0.92);

    drawPanel(leftX, 108, 170, 184, 0.67);
    ctx.fillStyle = '#7fd370';
    ctx.font = '900 14px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('COMBO!', leftX + 12, 123);
    ctx.fillStyle = '#f5dfad';
    ctx.font = '900 36px system-ui,sans-serif';
    ctx.fillText(`×${Math.max(0, player.combo)}`, leftX + 12, 140);
    ctx.strokeStyle = 'rgba(255,224,164,.20)';
    ctx.beginPath();
    ctx.moveTo(leftX + 12, 181);
    ctx.lineTo(leftX + 154, 181);
    ctx.stroke();
    ctx.fillStyle = '#9dd547';
    ctx.font = '800 13px system-ui,sans-serif';
    ctx.fillText(`+${Math.floor(player.score)}`, leftX + 12, 191);

    ctx.fillStyle = '#6dd3e8';
    ctx.font = '900 12px system-ui,sans-serif';
    ctx.fillText('FLOW', leftX + 12, 220);
    const segments = 5;
    for (let i = 0; i < segments; i += 1) {
      const active = i < Math.min(segments, Math.max(0, player.combo));
      const bx = leftX + 12 + i * 27;
      ctx.fillStyle = active ? (i === 0 ? '#d7b83d' : i < 3 ? '#93c93f' : '#3f8e3f') : 'rgba(42,67,37,.72)';
      ctx.strokeStyle = 'rgba(222,233,159,.30)';
      ctx.fillRect(bx, 236, 23, 11);
      ctx.strokeRect(bx + 0.5, 236.5, 22, 10);
    }

    ctx.fillStyle = '#61bdd8';
    ctx.font = '900 12px system-ui,sans-serif';
    ctx.fillText('MOMENTUM', leftX + 12, 263);
    for (let i = 0; i < 3; i += 1) {
      const active = stride >= (i + 1) / 3 - 0.08;
      ctx.save();
      ctx.translate(leftX + 27 + i * 32, 282);
      ctx.rotate(-0.5);
      ctx.fillStyle = active ? '#58c7e5' : 'rgba(38,90,107,.46)';
      ctx.strokeStyle = active ? '#b2edff' : 'rgba(118,178,193,.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 13, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    drawPanel(18, H - 84, 205, 64, 0.82);
    drawKeycap(31, H - 70, 55, 'SHIFT');
    ctx.fillStyle = '#eee5cf';
    ctx.font = '900 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('+', 96, H - 55);
    drawKeycap(105, H - 70, 62, 'SPACE');
    ctx.fillStyle = '#ffb125';
    ctx.font = '900 13px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SAP STICK', 31, H - 36);
    ctx.strokeStyle = '#c28a42';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(178, H - 31);
    ctx.lineTo(205, H - 60);
    ctx.stroke();
    ctx.shadowColor = '#ffae2d';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffb632';
    ctx.beginPath();
    ctx.arc(207, H - 62, 6, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    const showTutorial = state.mode === 'playing' && (state.elapsed < 16 || route?.type === 'SAPRUN' || route?.type === 'GROVE');
    if (showTutorial) {
      const px = W - 226;
      drawPanel(px, 112, 208, 154, 0.79);
      ctx.fillStyle = '#eab66a';
      ctx.font = '900 11px system-ui,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('USE SAP STICKS TO', px + 14, 129);
      ctx.fillText('ANCHOR TO SAP KNOTS', px + 14, 147);
      ctx.fillText('AND VAULT THROUGH', px + 14, 165);
      ctx.fillText('THE OPEN GAP!', px + 14, 183);
      ctx.strokeStyle = '#b6ad92';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 24, 217);
      ctx.lineTo(px + 64, 226);
      ctx.stroke();
      ctx.fillStyle = '#f7d38b';
      ctx.beginPath();
      ctx.arc(px + 46, 238, 6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#f2b532';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px + 58, 242);
      ctx.quadraticCurveTo(px + 114, 251, px + 153, 212);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowColor = '#ff9f1f';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffb027';
      ctx.beginPath();
      ctx.arc(px + 160, 204, 10, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawReferenceMessages() {
    let y = H * 0.18;
    for (const message of state.messages.slice(-3)) {
      const t = clamp(message.life / message.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2.8) * Math.min(1, (1 - t) * 5 + 0.3);
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.max(12, message.size)}px system-ui,sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(66,31,13,.70)';
      ctx.fillStyle = '#fff2b7';
      ctx.strokeText(message.text, W / 2, y);
      ctx.fillText(message.text, W / 2, y);
      ctx.restore();
      y += message.size + 9;
    }
  }

  function drawReferenceTouchControls() {
    if (!state.touchMode || state.mode !== 'playing') return;
    const items = [
      { x: 73, label: '◀', action: 'left' },
      { x: 145, label: '▶', action: 'right' },
      { x: W - 145, label: 'JUMP', action: 'jump' },
      { x: W - 73, label: 'SAP', action: 'sap' },
    ];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of items) {
      const active = [...state.pointers.values()].includes(item.action);
      ctx.fillStyle = active ? 'rgba(255,181,49,.28)' : 'rgba(12,18,15,.58)';
      ctx.strokeStyle = active ? '#ffd074' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(item.x, H - 110, 30, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff4d5';
      ctx.font = item.label.length > 2 ? '800 9px system-ui,sans-serif' : '900 16px system-ui,sans-serif';
      ctx.fillText(item.label, item.x, H - 110);
    }
    ctx.restore();
  }

  function drawReferenceTelemetry() {
    if (!state.telemetryVisible) return;
    const summary = S.summarizeTelemetry?.();
    if (!summary) return;
    const stick = S.sapStick?.getState?.() || {};
    const assist = S.flowAssist?.getState?.() || {};
    drawPanel(250, 16, 460, 92, 0.88);
    const lines = [
      `seed ${summary.seed} · ${S.round(summary.runSeconds, 1)}s · floor ${summary.floor} · score ${Math.floor(player.score)}`,
      `speed avg ${summary.movement.avgSpeed} · peak ${summary.movement.peakSpeed} · stride ${Math.round(assist.strideMomentum || 0)}`,
      `sap casts ${summary.counters.sapStickCasts || 0} · vaults ${summary.counters.sapStickVaults || 0} · saves ${summary.counters.sapStickRescues || 0}`,
      `flow max ${summary.combo.maxCombo} · air kicks ${summary.counters.doubleJumps || 0} · lockouts ${stick.lockedAnchors || 0}`,
    ];
    ctx.save();
    ctx.font = '700 9px ui-monospace,monospace';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? '#e9f5d8' : 'rgba(232,244,220,.70)';
      ctx.fillText(line, 266, 35 + i * 17);
    });
    ctx.restore();
  }

  function drawReferenceOverlay() {
    if (state.mode === 'playing') return;
    ctx.save();
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(10,11,9,.32)');
    veil.addColorStop(1, 'rgba(4,7,5,.72)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.mode === 'title') {
      drawLogo(W / 2 - 116, H * 0.17, 1.55);
      ctx.fillStyle = '#f9edcf';
      ctx.font = '900 15px system-ui,sans-serif';
      ctx.fillText('RUN · LEAP · SAP-STICK THE OPEN CANOPY', W / 2, H * 0.46);
      ctx.fillStyle = 'rgba(255,249,229,.82)';
      ctx.font = '700 11px system-ui,sans-serif';
      ctx.fillText('Space: jump / Air Kick   ·   Shift + Space: instant Sap Stick', W / 2, H * 0.52);
      ctx.fillText('Hard routes remove branches entirely. Read the amber knots and keep your line.', W / 2, H * 0.56);
      drawPanel(W / 2 - 105, H * 0.63, 210, 52, 0.64);
      ctx.fillStyle = '#ffcc78';
      ctx.font = '900 14px system-ui,sans-serif';
      ctx.fillText(state.touchMode ? 'TAP TO CLIMB' : 'SPACE TO CLIMB', W / 2, H * 0.67);
      ctx.fillStyle = 'rgba(255,248,225,.52)';
      ctx.font = '700 9px system-ui,sans-serif';
      ctx.fillText('T telemetry · R retry · N new route · P pause', W / 2, H * 0.76);
    } else if (state.mode === 'paused') {
      drawPanel(W / 2 - 170, H * 0.38, 340, 100, 0.78);
      ctx.fillStyle = '#fff0cc';
      ctx.font = '900 27px Georgia,serif';
      ctx.fillText('PAUSED IN THE CANOPY', W / 2, H * 0.44);
      ctx.font = '700 11px system-ui,sans-serif';
      ctx.fillText('P or Space to resume', W / 2, H * 0.50);
    } else if (state.mode === 'gameover') {
      drawPanel(W / 2 - 205, H * 0.29, 410, 190, 0.82);
      ctx.fillStyle = '#f7d493';
      ctx.font = '900 30px Georgia,serif';
      ctx.fillText('THE GROVE WON THIS RUN', W / 2, H * 0.35);
      ctx.fillStyle = '#fff4d9';
      ctx.font = '800 13px system-ui,sans-serif';
      ctx.fillText(`floor ${player.highestFloor} · score ${Math.floor(player.score)} · best combo ${player.bestCombo}×`, W / 2, H * 0.44);
      ctx.fillStyle = '#ffcc72';
      ctx.font = '900 14px system-ui,sans-serif';
      ctx.fillText(state.touchMode ? 'TAP TO RUN AGAIN' : 'SPACE TO RUN AGAIN', W / 2, H * 0.53);
    }
    ctx.restore();
  }

  function drawReferenceScene(alpha, now) {
    const time = now * 0.001;
    drawReferenceBackground(time);
    drawReferenceTrunk('left');
    drawReferenceTrunk('right');

    for (const branch of state.branches) drawReferenceBranch(branch);
    for (const ring of state.rings) drawReferenceRing(ring, time);
    const preview = (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight')) && !player.sap ? S.sapStick?.getTargetPreview?.() : null;
    for (const knot of state.knots) drawReferenceKnot(knot, time, knot === preview);

    drawReferenceThreat(time);
    drawReferenceSapPreview(alpha, time);
    drawReferenceSapline(alpha, time);
    drawReferenceParticles();
    drawReferencePlayer(alpha, time);

    drawReferenceHud();
    drawReferenceTelemetry();
    drawReferenceMessages();
    drawReferenceTouchControls();
    drawReferenceOverlay();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,211,129,${state.flash * 0.14})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    try {
      drawReferenceScene(alpha, now);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn('[Sylvaria] reference art pass fell back to canopy renderer', error);
      }
    }
  }

  S.render = render;
  S.referenceRenderer = {
    version: ART_VERSION,
    composition: 'cinematic twin-sequoia reference layout',
    barkModel: 'pre-rendered layered puzzle flakes with longitudinal microfibers',
    pipModel: 'mascot-scale expressive vector climber',
    hudModel: 'reference left rail + sap tutorial card',
    collisionHonest: true,
  };
  S.canopyRenderer = {
    ...(S.canopyRenderer || {}),
    version: '0.4.0',
    barkModel: 'shared-vertex anisotropic puzzle lattice + reference production overlay',
    artPass: ART_VERSION,
  };
})();