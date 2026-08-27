(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render) return;

  const { ctx, W, H, state, player, clamp, lerp } = S;
  const baseRender = S.render;
  const ART_VERSION = 'altitude-realism-v1';
  const TAU = Math.PI * 2;
  const BLEND_FLOORS = 8;
  let warned = false;
  let lastZone = null;
  let zoneEnteredAt = 0;

  const ZONES = [
    {
      name: 'ROOTWAYS',
      subtitle: 'humid understory',
      start: 0,
      tint: [106, 139, 91],
      haze: 0.44,
      sun: 0.28,
      wind: 0.10,
      moisture: 0.94,
      moss: 0.94,
      resin: 0.10,
      lichen: 0.18,
      needles: 0.18,
      exposed: 0.05,
      birds: 0.00,
    },
    {
      name: 'REDWOOD RUN',
      subtitle: 'sunlit trunk corridor',
      start: 36,
      tint: [132, 158, 108],
      haze: 0.31,
      sun: 0.45,
      wind: 0.24,
      moisture: 0.72,
      moss: 0.78,
      resin: 0.18,
      lichen: 0.28,
      needles: 0.34,
      exposed: 0.16,
      birds: 0.06,
    },
    {
      name: 'SAPWORK',
      subtitle: 'amber resin belt',
      start: 75,
      tint: [170, 154, 102],
      haze: 0.23,
      sun: 0.62,
      wind: 0.40,
      moisture: 0.48,
      moss: 0.58,
      resin: 0.82,
      lichen: 0.40,
      needles: 0.50,
      exposed: 0.34,
      birds: 0.12,
    },
    {
      name: 'HIGH CANOPY',
      subtitle: 'cold blue windline',
      start: 120,
      tint: [125, 165, 183],
      haze: 0.14,
      sun: 0.76,
      wind: 0.70,
      moisture: 0.26,
      moss: 0.38,
      resin: 0.36,
      lichen: 0.66,
      needles: 0.78,
      exposed: 0.70,
      birds: 0.42,
    },
    {
      name: 'CROWNLINE',
      subtitle: 'open crown and cloud sea',
      start: 170,
      tint: [161, 184, 199],
      haze: 0.08,
      sun: 0.92,
      wind: 0.96,
      moisture: 0.14,
      moss: 0.18,
      resin: 0.20,
      lichen: 0.78,
      needles: 0.92,
      exposed: 1.00,
      birds: 0.78,
    },
  ];

  function hash(a, b = 0, c = 0) {
    let x = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x = (x + Math.imul((b | 0) ^ 0x165667b1, 0x27d4eb2d)) | 0;
    x = (x + Math.imul((c | 0) ^ 0x7f4a7c15, 0x45d9f3b)) | 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    return (x >>> 0) / 4294967295;
  }

  function smoothstep(a, b, value) {
    const t = clamp((value - a) / Math.max(0.0001, b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function mixRgb(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function zoneIndexForFloor(floor) {
    let index = 0;
    for (let i = 1; i < ZONES.length; i += 1) {
      if (floor >= ZONES[i].start) index = i;
      else break;
    }
    return index;
  }

  function blendZone(a, b, t) {
    const keys = ['haze', 'sun', 'wind', 'moisture', 'moss', 'resin', 'lichen', 'needles', 'exposed', 'birds'];
    const profile = {
      name: t < 0.5 ? a.name : b.name,
      subtitle: t < 0.5 ? a.subtitle : b.subtitle,
      start: t < 0.5 ? a.start : b.start,
      tint: mixRgb(a.tint, b.tint, t),
      blend: t,
    };
    for (const key of keys) profile[key] = lerp(a[key], b[key], t);
    return profile;
  }

  function profileForFloor(floor) {
    for (let i = 0; i < ZONES.length - 1; i += 1) {
      const boundary = ZONES[i + 1].start;
      if (floor >= boundary - BLEND_FLOORS && floor <= boundary + BLEND_FLOORS) {
        const t = smoothstep(boundary - BLEND_FLOORS, boundary + BLEND_FLOORS, floor);
        return blendZone(ZONES[i], ZONES[i + 1], t);
      }
    }
    const zone = ZONES[zoneIndexForFloor(floor)];
    return { ...zone, tint: [...zone.tint], blend: 0 };
  }

  function worldToScreenY(worldY) {
    return S.worldToScreenY ? S.worldToScreenY(worldY) : H - (worldY - state.cameraBottom);
  }

  function clipCorridor() {
    ctx.beginPath();
    ctx.rect(state.LEFT_WALL, 0, state.RIGHT_WALL - state.LEFT_WALL, H);
    ctx.clip();
  }

  function drawSoftOrb(x, y, rx, ry, color, alpha) {
    const radius = Math.max(rx, ry);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color.replace('ALPHA', String(alpha)));
    gradient.addColorStop(0.56, color.replace('ALPHA', String(alpha * 0.42)));
    gradient.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx / radius, ry / radius);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawAtmosphericGrade(profile, time) {
    const left = state.LEFT_WALL;
    const right = state.RIGHT_WALL;
    const width = right - left;

    ctx.save();
    clipCorridor();

    const humidity = ctx.createLinearGradient(0, 0, 0, H);
    humidity.addColorStop(0, rgba(profile.tint, 0.018 + profile.exposed * 0.015));
    humidity.addColorStop(0.46, rgba(profile.tint, 0.025 + profile.haze * 0.045));
    humidity.addColorStop(1, rgba(profile.tint, 0.07 + profile.haze * 0.18));
    ctx.fillStyle = humidity;
    ctx.fillRect(left, 0, width, H);

    const horizonY = lerp(H * 0.78, H * 0.58, profile.exposed);
    const fog = ctx.createLinearGradient(0, horizonY - 90, 0, H);
    fog.addColorStop(0, rgba(profile.tint, 0));
    fog.addColorStop(0.55, rgba(profile.tint, profile.haze * 0.055));
    fog.addColorStop(1, rgba(profile.tint, profile.haze * 0.16));
    ctx.fillStyle = fog;
    ctx.fillRect(left, horizonY - 90, width, H - horizonY + 90);

    const sunlight = [255, 230, 174];
    const sunX = left + width * (0.58 + Math.sin(time * 0.035) * 0.03);
    drawSoftOrb(sunX, H * 0.08, 270, 235, 'rgba(255,236,189,ALPHA)', 0.045 + profile.sun * 0.07);

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i += 1) {
      const seed = hash(i, Math.floor(player.highestFloor / 12), 401);
      const topX = sunX + (seed - 0.5) * 210;
      const spread = 52 + seed * 84;
      const drift = (state.reducedMotion ? 0 : Math.sin(time * (0.09 + i * 0.012) + i) * 22) + profile.wind * 35;
      const ray = ctx.createLinearGradient(0, 0, 0, H);
      ray.addColorStop(0, rgba(sunlight, 0.05 + profile.sun * 0.035));
      ray.addColorStop(0.58, rgba(sunlight, 0.018 + profile.sun * 0.02));
      ray.addColorStop(1, rgba(sunlight, 0));
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(topX - 12, -10);
      ctx.lineTo(topX + 18, -10);
      ctx.lineTo(topX + spread + drift, H + 40);
      ctx.lineTo(topX - spread + drift, H + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (profile.exposed > 0.42) {
      const cloudAlpha = (profile.exposed - 0.42) * 0.10;
      const cloudY = H * (0.74 - profile.exposed * 0.13);
      for (let i = 0; i < 3; i += 1) {
        const x = left + width * (0.18 + i * 0.34) + (state.reducedMotion ? 0 : Math.sin(time * 0.06 + i * 2.3) * 20);
        drawSoftOrb(x, cloudY + i * 23, 150 + i * 24, 42 + i * 8, 'rgba(242,248,244,ALPHA)', cloudAlpha * (0.8 + i * 0.12));
      }
    }

    ctx.restore();
  }

  function drawNeedle(x, y, angle, length, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = `rgba(78,105,59,${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, 0);
    ctx.lineTo(length * 0.5, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawMote(x, y, profile, seed, time) {
    if (profile.resin > 0.62 && seed > 0.56) {
      ctx.fillStyle = `rgba(255,181,52,${0.22 + profile.resin * 0.24})`;
      ctx.shadowColor = '#ffb52e';
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(x, y, 1.1 + seed * 1.7, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      return;
    }
    if (profile.needles > 0.62 && seed > 0.42) {
      drawNeedle(x, y, time * 0.2 + seed * 4, 8 + seed * 8, 0.18 + profile.needles * 0.24);
      return;
    }
    if (profile.moisture > 0.62 && seed > 0.38) {
      ctx.fillStyle = `rgba(214,236,182,${0.14 + profile.moisture * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + seed * 1.6, 0, TAU);
      ctx.fill();
      return;
    }
    ctx.fillStyle = `rgba(226,209,163,${0.12 + profile.exposed * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.4 + seed * 1.8, 0.8 + seed, seed * Math.PI, 0, TAU);
    ctx.fill();
  }

  function drawAirborneMaterial(profile, time) {
    if (state.reducedMotion) return;
    const left = state.LEFT_WALL;
    const width = state.RIGHT_WALL - left;
    const band = Math.floor(state.cameraBottom / 180);
    const windPx = 18 + profile.wind * 92;
    const fallPx = lerp(7, 34, profile.needles);

    ctx.save();
    clipCorridor();
    for (let i = 0; i < 34; i += 1) {
      const seed = hash(i, band, 457);
      const seed2 = hash(i, band, 463);
      const span = width + 80;
      const rawX = seed * span + time * windPx * (0.45 + seed2 * 0.72) + band * 23;
      const x = left - 40 + ((rawX % span) + span) % span;
      const rawY = seed2 * (H + 100) + time * fallPx * (0.2 + seed * 0.8) + state.cameraBottom * (0.018 + seed2 * 0.018);
      const y = -50 + ((rawY % (H + 100)) + H + 100) % (H + 100);
      drawMote(x, y, profile, seed, time);
    }
    ctx.restore();
  }

  function drawMossTuft(x, y, inward, amount, seed) {
    const count = 3 + Math.floor(amount * 5);
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < count; i += 1) {
      const s = hash(i, Math.floor(seed * 1000), 509);
      const dx = inward * (2 + s * 12);
      const dy = (i - count * 0.5) * 4 + (s - 0.5) * 5;
      ctx.fillStyle = i % 2 ? `rgba(87,124,54,${0.22 + amount * 0.34})` : `rgba(118,145,62,${0.18 + amount * 0.28})`;
      ctx.beginPath();
      ctx.ellipse(dx, dy, 5 + s * 5, 2.2 + s * 2.4, inward * (0.2 + s * 0.4), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLichenPatch(x, y, inward, amount, seed) {
    const count = 3 + Math.floor(amount * 4);
    for (let i = 0; i < count; i += 1) {
      const s = hash(i, Math.floor(seed * 2000), 521);
      ctx.fillStyle = `rgba(190,194,169,${0.08 + amount * 0.22})`;
      ctx.beginPath();
      ctx.ellipse(x + inward * (4 + s * 13), y + (s - 0.5) * 18, 2 + s * 5, 1.5 + s * 3, s * 2.2, 0, TAU);
      ctx.fill();
    }
  }

  function drawResinRivulet(x, y, inward, amount, seed) {
    const length = 18 + seed * 42;
    ctx.save();
    ctx.strokeStyle = `rgba(245,155,42,${0.12 + amount * 0.30})`;
    ctx.lineWidth = 1.4 + amount * 1.6;
    ctx.shadowColor = '#ff9e28';
    ctx.shadowBlur = 4 + amount * 5;
    ctx.beginPath();
    ctx.moveTo(x + inward * 3, y - length * 0.45);
    ctx.bezierCurveTo(x + inward * 9, y - length * 0.12, x + inward * 4, y + length * 0.18, x + inward * (7 + seed * 8), y + length * 0.48);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,191,65,${0.18 + amount * 0.32})`;
    ctx.beginPath();
    ctx.ellipse(x + inward * (7 + seed * 8), y + length * 0.5, 2.2 + seed * 2.4, 3.4 + seed * 3.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawTrunkEcology(profile) {
    const rowH = 118;
    const first = Math.floor((state.cameraBottom - 120) / rowH) - 1;
    const last = Math.ceil((state.cameraBottom + H + 120) / rowH) + 1;

    ctx.save();
    for (const side of ['left', 'right']) {
      const leftSide = side === 'left';
      const edge = leftSide ? state.LEFT_WALL : state.RIGHT_WALL;
      const inward = leftSide ? -1 : 1;

      const ao = ctx.createLinearGradient(
        edge + inward * 52,
        0,
        edge,
        0
      );
      ao.addColorStop(0, 'rgba(5,2,1,0)');
      ao.addColorStop(0.74, 'rgba(9,4,2,.16)');
      ao.addColorStop(1, 'rgba(4,2,1,.46)');
      ctx.fillStyle = ao;
      ctx.fillRect(leftSide ? edge - 56 : edge, 0, 56, H);

      ctx.strokeStyle = `rgba(255,195,125,${0.08 + profile.sun * 0.10})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(edge + inward * 2, 0);
      ctx.lineTo(edge + inward * 2, H);
      ctx.stroke();

      for (let row = first; row <= last; row += 1) {
        const seed = hash(row, leftSide ? 541 : 547);
        const worldY = row * rowH + seed * 54;
        const y = worldToScreenY(worldY);
        if (y < -60 || y > H + 60) continue;

        if (seed < profile.moss * 0.88) drawMossTuft(edge + inward * 2, y, inward, profile.moss, seed);
        if (hash(row, 557) < profile.lichen * 0.72) drawLichenPatch(edge + inward * 3, y + 24, inward, profile.lichen, seed);
        if (hash(row, 563) < profile.resin * 0.44) drawResinRivulet(edge + inward * 4, y - 12, inward, profile.resin, seed);
      }
    }
    ctx.restore();
  }

  function drawBranchEcology(profile, time) {
    if (!S.branchYAt) return;
    ctx.save();
    for (const branch of state.branches) {
      const midX = (branch.x1 + branch.x2) * 0.5;
      const midY = worldToScreenY(S.branchYAt(branch, midX));
      if (midY < -50 || midY > H + 50) continue;
      const length = Math.max(1, branch.x2 - branch.x1);
      const samples = Math.min(7, Math.max(3, Math.floor(length / 80)));
      for (let i = 0; i < samples; i += 1) {
        const t = (i + 0.5) / samples;
        const x = lerp(branch.x1, branch.x2, t);
        const y = worldToScreenY(S.branchYAt(branch, x));
        const seed = hash(branch.floor, i, 587);

        if (seed < profile.moss * 0.66) {
          ctx.fillStyle = `rgba(105,139,62,${0.10 + profile.moss * 0.20})`;
          ctx.beginPath();
          ctx.ellipse(x, y - Math.max(4, branch.thickness * 0.45), 5 + seed * 7, 1.8 + seed * 2.3, (seed - 0.5) * 0.8, 0, TAU);
          ctx.fill();
        }
        if (hash(branch.floor, i, 593) < profile.lichen * 0.40) {
          ctx.fillStyle = `rgba(204,202,165,${0.08 + profile.lichen * 0.15})`;
          ctx.beginPath();
          ctx.arc(x + (seed - 0.5) * 9, y - 2, 1.5 + seed * 2.2, 0, TAU);
          ctx.fill();
        }
        if (hash(branch.floor, i, 599) < profile.resin * 0.24) {
          ctx.fillStyle = `rgba(255,181,47,${0.16 + profile.resin * 0.22})`;
          ctx.shadowColor = '#ff9f22';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.arc(x, y + 1, 1.3 + seed * 1.8, 0, TAU);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (profile.needles > 0.50 && seed > 0.54) {
          const wind = state.reducedMotion ? 0 : Math.sin(time * 1.6 + branch.floor + i) * profile.wind * 0.24;
          drawNeedle(x + 4, y - 7, -0.25 + wind, 7 + seed * 7, 0.12 + profile.needles * 0.20);
          drawNeedle(x + 8, y - 9, 0.12 + wind, 6 + seed * 6, 0.10 + profile.needles * 0.18);
        }
      }
    }
    ctx.restore();
  }

  function drawBird(x, y, scale, flap, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = `rgba(31,43,39,${alpha})`;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-11, 1);
    ctx.quadraticCurveTo(-5, -5 - flap, 0, 0);
    ctx.quadraticCurveTo(5, -5 + flap, 11, 1);
    ctx.stroke();
    ctx.restore();
  }

  function drawUpperCanopyLife(profile, time) {
    if (profile.birds < 0.08) return;
    const left = state.LEFT_WALL;
    const width = state.RIGHT_WALL - left;
    ctx.save();
    clipCorridor();
    for (let i = 0; i < 3; i += 1) {
      const seed = hash(i, 631);
      if (seed > profile.birds + 0.18) continue;
      const direction = i % 2 ? -1 : 1;
      const speed = 8 + profile.wind * 18 + i * 4;
      const span = width + 160;
      const travel = state.reducedMotion ? seed * span : (time * speed + seed * span) % span;
      const x = direction > 0 ? left - 80 + travel : state.RIGHT_WALL + 80 - travel;
      const y = 72 + i * 46 + Math.sin(time * 0.7 + i * 2.1) * 8;
      drawBird(x, y, 0.7 + seed * 0.65, Math.sin(time * 3.2 + i) * 1.4, 0.10 + profile.birds * 0.22);
    }
    ctx.restore();
  }

  function drawEdgeVignette(profile) {
    const vignette = ctx.createRadialGradient(W * 0.5, H * 0.43, H * 0.18, W * 0.5, H * 0.43, H * 0.82);
    vignette.addColorStop(0, 'rgba(9,11,8,0)');
    vignette.addColorStop(0.72, 'rgba(9,8,6,.015)');
    vignette.addColorStop(1, `rgba(5,4,3,${0.11 - profile.exposed * 0.035})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawZoneArrival(profile, now) {
    if (state.mode !== 'playing') return;
    const zone = ZONES[zoneIndexForFloor(player.highestFloor)];
    if (zone.name !== lastZone) {
      lastZone = zone.name;
      zoneEnteredAt = now;
    }
    const age = (now - zoneEnteredAt) / 1000;
    if (age > 3.2) return;
    const fadeIn = smoothstep(0, 0.38, age);
    const fadeOut = 1 - smoothstep(2.25, 3.2, age);
    const alpha = fadeIn * fadeOut;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff0c9';
    ctx.strokeStyle = 'rgba(39,24,15,.72)';
    ctx.lineWidth = 4;
    ctx.font = '900 17px Georgia,serif';
    ctx.strokeText(zone.name, W * 0.5, 66);
    ctx.fillText(zone.name, W * 0.5, 66);
    ctx.fillStyle = 'rgba(255,244,216,.74)';
    ctx.font = '800 9px system-ui,sans-serif';
    ctx.fillText(zone.subtitle.toUpperCase(), W * 0.5, 85);
    ctx.restore();
  }

  function drawRealismPass(now) {
    const floor = Math.max(0, player.highestFloor || 0);
    const profile = profileForFloor(floor);
    const time = now * 0.001;

    drawAtmosphericGrade(profile, time);
    drawTrunkEcology(profile);
    drawBranchEcology(profile, time);
    drawAirborneMaterial(profile, time);
    drawUpperCanopyLife(profile, time);
    drawEdgeVignette(profile);
    drawZoneArrival(profile, now);
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    try {
      drawRealismPass(now);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn('[Sylvaria] altitude realism pass fell back to reference renderer', error);
      }
    }
  }

  S.render = render;
  S.altitudeRenderer = {
    version: ART_VERSION,
    zones: ZONES.map((zone) => ({ name: zone.name, start: zone.start, subtitle: zone.subtitle })),
    continuousBlendFloors: BLEND_FLOORS,
    physicallyMotivated: [
      'humidity haze falls with altitude',
      'direct sunlight rises with exposure',
      'wind rises with altitude',
      'moss yields to lichen and needles',
      'sap belt receives resin sheen',
      'upper canopy opens into cloud and bird layers',
    ],
    deterministic: true,
    collisionHonest: true,
  };
  S.referenceRenderer = {
    ...(S.referenceRenderer || {}),
    altitudePass: ART_VERSION,
  };
  S.canopyRenderer = {
    ...(S.canopyRenderer || {}),
    altitudePass: ART_VERSION,
    altitudeZones: ZONES.map((zone) => zone.name),
  };
})();