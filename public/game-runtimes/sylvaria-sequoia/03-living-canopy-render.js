(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.livingCanopy) return;

  const { ctx, W, H, state, player, clamp, lerp } = S;
  const baseRender = S.render;
  const VERSION = 'living-canopy-render-v1';
  const TAU = Math.PI * 2;

  function sy(worldY) {
    return S.worldToScreenY ? S.worldToScreenY(worldY) : H - (worldY - state.cameraBottom);
  }

  function alphaForBanner(banner) {
    if (!banner) return 0;
    const fadeIn = clamp(banner.age / 0.18, 0, 1);
    const fadeOut = clamp((banner.life - banner.age) / 0.55, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  function glowDot(x, y, radius, hue, time, phase = 0) {
    const pulse = 0.86 + Math.sin(time * 3.2 + phase) * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.70 * pulse;
    ctx.fillStyle = hue;
    ctx.shadowColor = hue;
    ctx.shadowBlur = radius * 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius * pulse, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.32;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hue;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.75, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawWindChoir(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i += 1) {
      const r = 12 + i * 8 + Math.sin(time * 2.6 + i) * 2;
      ctx.globalAlpha = 0.16 + i * 0.07;
      ctx.beginPath();
      ctx.arc(x, y, r, -0.85, 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI - 0.85, Math.PI + 0.85);
      ctx.stroke();
    }
    ctx.restore();
    glowDot(x, y, 5.2, target.hue, time);
  }

  function drawLightningHollow(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = target.hue;
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.74 + Math.sin(time * 8.5) * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 31);
    ctx.lineTo(x + 3, y - 14);
    ctx.lineTo(x - 4, y - 4);
    ctx.lineTo(x + 7, y + 10);
    ctx.lineTo(x - 2, y + 30);
    ctx.stroke();
    ctx.restore();
    glowDot(x, y + 2, 4.4, target.hue, time, 1.2);
  }

  function drawSunwing(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.fillStyle = target.hue;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const angle = time * 0.75 + i * TAU / 8;
      const radius = 19 + (i % 3) * 6;
      const bx = x + Math.cos(angle) * radius;
      const by = y + Math.sin(angle * 1.4) * 12;
      ctx.globalAlpha = 0.28 + (i % 2) * 0.18;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by + 1);
      ctx.quadraticCurveTo(bx - 1, by - 4, bx + 1, by);
      ctx.quadraticCurveTo(bx + 4, by - 4, bx + 7, by + 1);
      ctx.stroke();
    }
    ctx.restore();
    glowDot(x, y, 5.4, target.hue, time, 2.2);
  }

  function drawResinAurora(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.shadowColor = target.hue;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.19 + i * 0.12;
      ctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.08) {
        const px = x - 38 + t * 76;
        const py = y + Math.sin(t * Math.PI * 2 + time * 1.7 + i) * (8 + i * 3) + (i - 1) * 5;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
    glowDot(x, y, 4.8, target.hue, time, 3.1);
  }

  function drawElderBough(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = target.hue;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i += 1) {
      ctx.globalAlpha = 0.22 + i * 0.16;
      ctx.beginPath();
      ctx.ellipse(x, y, 10 + i * 9, 7 + i * 5, -0.24, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x - 29, y + 17);
    ctx.quadraticCurveTo(x, y + 4 + Math.sin(time * 2) * 4, x + 30, y + 16);
    ctx.stroke();
    ctx.restore();
    glowDot(x, y, 4.6, target.hue, time, 4.2);
  }

  function drawCrownEcho(target, x, y, time) {
    ctx.save();
    ctx.strokeStyle = target.hue;
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 4; i += 1) {
      const age = (time * 0.48 + i * 0.25) % 1;
      ctx.globalAlpha = (1 - age) * 0.42;
      ctx.beginPath();
      ctx.arc(x, y, 9 + age * 38, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    glowDot(x, y, 5.2, target.hue, time, 5.2);
  }

  function drawWonder(target, time) {
    if (!target) return;
    const y = sy(target.y);
    if (y < -90 || y > H + 90) return;
    const x = target.x;
    if (target.id === 'windchoir') drawWindChoir(target, x, y, time);
    else if (target.id === 'lightninghollow') drawLightningHollow(target, x, y, time);
    else if (target.id === 'sunwing') drawSunwing(target, x, y, time);
    else if (target.id === 'resinaurora') drawResinAurora(target, x, y, time);
    else if (target.id === 'elderbough') drawElderBough(target, x, y, time);
    else drawCrownEcho(target, x, y, time);

    const floors = target.floor - player.highestFloor;
    if (Math.abs(floors) <= 5) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '900 8px system-ui,sans-serif';
      ctx.fillStyle = target.hue;
      ctx.shadowColor = 'rgba(15,16,12,.84)';
      ctx.shadowBlur = 5;
      ctx.globalAlpha = 0.72;
      ctx.fillText(target.name, x, y - 35);
      ctx.globalAlpha = 0.52;
      ctx.font = '800 7px system-ui,sans-serif';
      ctx.fillText(target.hint, x, y - 24);
      ctx.restore();
    }
  }

  function drawPulse(pulse, time) {
    if (!pulse || state.mode !== 'playing') return;
    const route = S.activeRouteChunk?.();
    if (!route) return;
    const cycle = route.type === 'SKYHEART' ? 1.85 : 2.35;
    const phaseTime = pulse.age % cycle;
    const warning = phaseTime < pulse.warning;
    const progress = clamp(phaseTime / Math.max(0.001, pulse.warning), 0, 1);
    const x = pulse.direction < 0 ? state.RIGHT_WALL - 18 : state.LEFT_WALL + 18;

    ctx.save();
    ctx.beginPath();
    ctx.rect(state.LEFT_WALL, 0, state.RIGHT_WALL - state.LEFT_WALL, H);
    ctx.clip();
    ctx.strokeStyle = route.type === 'SKYHEART' ? '#e8c4ff' : '#d4edf3';
    ctx.lineWidth = warning ? 1.2 : 1.8;
    ctx.globalAlpha = warning ? 0.12 + progress * 0.18 : 0.25;
    const spacing = 54;
    for (let y = 70; y < H; y += spacing) {
      const sway = Math.sin(time * 3 + y * 0.02) * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + pulse.direction * (warning ? 42 + progress * 54 : 118), y + sway);
      ctx.stroke();
    }
    ctx.restore();
  }

  function skyheartWorldY() {
    const floor = S.livingCanopy.skyheartFloor;
    const branch = state.branches.find((item) => item.floor === floor);
    if (branch) return branch.y;
    const knot = state.knots.find((item) => item.floor === floor);
    if (knot) return knot.y;
    const ring = state.rings.find((item) => item.floor === floor);
    return ring?.y ?? null;
  }

  function drawSkyheart(living, time) {
    if (!living.allWonders || living.skyheartRung) return;
    const heartwood = S.heartwoodQuest?.getState?.();
    if (!heartwood?.crownAwakened) return;
    const worldY = skyheartWorldY();
    if (worldY == null) return;
    const y = sy(worldY + 82);
    if (y < -130 || y > H + 130) return;
    const x = W / 2;
    const pulse = 0.82 + Math.sin(time * 2.6) * 0.12;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#f0d6ff';
    ctx.fillStyle = 'rgba(246,226,255,.18)';
    ctx.shadowColor = '#dcb5ff';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, -18);
    ctx.quadraticCurveTo(-18, 16, 0, 24);
    ctx.quadraticCurveTo(18, 16, 22, -18);
    ctx.quadraticCurveTo(0, -31, -22, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(0, 35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 38, 4, 0, TAU);
    ctx.fillStyle = '#fff3bb';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#f2dcff';
    ctx.font = '900 10px Georgia,serif';
    ctx.fillText('SKYHEART', 0, -38);
    ctx.font = '800 7px system-ui,sans-serif';
    ctx.fillStyle = 'rgba(244,226,255,.70)';
    ctx.fillText('RING THE ELDER CANOPY', 0, -27);
    ctx.restore();
  }

  function drawDiscoveryBanner(living) {
    const banner = living.wonderBanner;
    if (banner) {
      const a = alphaForBanner(banner);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(18,12,8,.84)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = banner.hue;
      ctx.font = '900 22px Georgia,serif';
      ctx.fillText(banner.name, W / 2, H * 0.31);
      ctx.fillStyle = 'rgba(255,248,221,.76)';
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText(`CANOPY WONDER ${banner.count}/${living.total} · REMEMBERED`, W / 2, H * 0.31 + 25);
      ctx.restore();
    }

    const sky = living.skyheartBanner;
    if (sky) {
      const a = alphaForBanner(sky);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(29,14,35,.86)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#f1d2ff';
      ctx.font = '900 30px Georgia,serif';
      ctx.fillText('THE SKYHEART RINGS', W / 2, H * 0.34);
      ctx.fillStyle = 'rgba(255,245,220,.78)';
      ctx.font = '800 10px system-ui,sans-serif';
      ctx.fillText('THE TREE HAS NO FINAL FLOOR', W / 2, H * 0.34 + 32);
      ctx.restore();
    }
  }

  function drawTitleAtlas(living) {
    if (state.mode !== 'title') return;
    const heartwood = S.heartwoodQuest?.getState?.();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(15,14,10,.76)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(239,231,196,.62)';
    ctx.font = '800 8px system-ui,sans-serif';
    const heartText = heartwood ? `HEARTSEEDS ${heartwood.count}/${heartwood.total}` : 'HEARTSEEDS';
    const wonderText = `WONDERS ${living.count}/${living.total}`;
    const crownText = living.skyheartRung ? 'SKYHEART RUNG' : heartwood?.crownAwakened ? 'CROWN AWAKE' : 'CROWN SLEEPING';
    ctx.fillText(`${heartText}  ·  ${wonderText}  ·  ${crownText}`, W / 2, H * 0.79);
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    const living = S.livingCanopy.getState();
    const time = now * 0.001;
    drawPulse(living.pulse, time);
    drawWonder(living.activeWonder, time);
    drawSkyheart(living, time);
    drawDiscoveryBanner(living);
    drawTitleAtlas(living);
  }

  S.render = render;
  S.livingCanopyRender = {
    version: VERSION,
    worldSpaceDiscovery: true,
    persistentAtlas: true,
    skyheartDestination: S.livingCanopy.skyheartFloor,
  };
})();
