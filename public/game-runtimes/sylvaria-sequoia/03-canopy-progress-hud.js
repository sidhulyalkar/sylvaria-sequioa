(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.canopyProgress) return;

  const { ctx, W, H, state, player, clamp, lerp } = S;
  const baseRender = S.render;
  const VERSION = 'minimal-crown-hud-v1';
  const REVISION = 'heartwood-objective-v2';
  const TAU = Math.PI * 2;

  function worldToScreenY(worldY) {
    return S.worldToScreenY ? S.worldToScreenY(worldY) : H - (worldY - state.cameraBottom);
  }

  function smoothFade(age, life, fadeIn = 0.16, fadeOut = 0.42) {
    if (life <= 0) return 0;
    const inAlpha = clamp(age / Math.max(0.001, fadeIn), 0, 1);
    const outAlpha = clamp((life - age) / Math.max(0.001, fadeOut), 0, 1);
    return Math.min(inAlpha, outAlpha);
  }

  function drawWind(time) {
    const wind = S.canopyEscalation?.getState?.();
    if (!wind || wind.intensity < 0.08 || state.mode !== 'playing') return;
    const direction = Math.sign(wind.gust || 1) || 1;
    const speed = Math.abs(wind.gust);
    const density = 8 + Math.floor(wind.intensity * 15);
    const left = state.LEFT_WALL + 8;
    const right = state.RIGHT_WALL - 8;
    const width = right - left;

    ctx.save();
    ctx.beginPath();
    ctx.rect(state.LEFT_WALL, 0, state.RIGHT_WALL - state.LEFT_WALL, H);
    ctx.clip();
    ctx.lineCap = 'round';
    for (let i = 0; i < density; i += 1) {
      const seed = ((i * 47 + state.runSeed * 13) % 997) / 997;
      const travel = (time * (36 + speed * 0.18) + seed * (width + 180)) % (width + 180);
      const x = direction > 0 ? left - 90 + travel : right + 90 - travel;
      const y = 52 + ((i * 83 + state.runSeed * 19) % Math.max(120, H - 100));
      const length = 18 + wind.intensity * 38 + (i % 3) * 7;
      ctx.globalAlpha = 0.055 + wind.intensity * 0.10;
      ctx.strokeStyle = i % 4 === 0 ? '#f4e7b0' : '#d7edf0';
      ctx.lineWidth = i % 5 === 0 ? 1.8 : 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - direction * length * 0.5, y + Math.sin(time * 1.8 + i) * 5, x - direction * length, y + direction * 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function floorWorldY(floor) {
    const branch = state.branches.find((item) => item.floor === floor);
    if (branch) return branch.y;
    const knot = state.knots.find((item) => item.floor === floor);
    if (knot) return knot.y;
    const ring = state.rings.find((item) => item.floor === floor);
    return ring?.y ?? null;
  }

  function drawCrownGate(progress, time) {
    if (state.mode !== 'playing') return;
    const yWorld = floorWorldY(progress.nextCrownFloor);
    if (yWorld == null) return;
    const y = worldToScreenY(yWorld);
    if (y < -90 || y > H + 90) return;

    const left = state.LEFT_WALL + 48;
    const right = state.RIGHT_WALL - 48;
    const pulse = 0.66 + Math.sin(time * 3.4) * 0.12;
    ctx.save();
    ctx.globalAlpha = pulse;
    const gradient = ctx.createLinearGradient(left, y, right, y);
    gradient.addColorStop(0, 'rgba(255,195,72,0)');
    gradient.addColorStop(0.24, 'rgba(255,210,100,.62)');
    gradient.addColorStop(0.50, 'rgba(255,241,177,.92)');
    gradient.addColorStop(0.76, 'rgba(255,210,100,.62)');
    gradient.addColorStop(1, 'rgba(255,195,72,0)');
    ctx.strokeStyle = gradient;
    ctx.shadowColor = '#ffc24f';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([12, 14]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.quadraticCurveTo(W / 2, y - 10, right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      const x = lerp(left, right, t);
      const bob = Math.sin(time * 4.1 + i * 1.7) * 5;
      ctx.fillStyle = i === 3 ? '#fff1ae' : '#ffc457';
      ctx.beginPath();
      ctx.ellipse(x, y - 8 + bob, 2.2, 4.8, (i - 3) * 0.18, 0, TAU);
      ctx.fill();
    }

    ctx.globalAlpha = 0.92;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '900 10px system-ui,sans-serif';
    ctx.fillStyle = '#fff0b0';
    ctx.shadowColor = 'rgba(39,18,7,.78)';
    ctx.shadowBlur = 5;
    ctx.fillText(`CROWN ${progress.nextCrownFloor}`, W / 2, y - 15);
    ctx.restore();
  }

  function objectiveText(quest) {
    if (!quest) return null;
    if (quest.crownAwakened) return 'CROWN AWAKE';
    if (quest.readyForCrown) return `LIVING CROWN · ${quest.finalCrownFloor}F`;
    return `HEARTSEEDS ${quest.count}/${quest.total}`;
  }

  function drawMinimalHud(progress, wind, quest) {
    if (state.mode !== 'playing') return;
    const left = state.LEFT_WALL + 12;
    const right = state.RIGHT_WALL - 12;
    const width = right - left;
    const crownProgress = clamp(1 - progress.crownRemaining / Math.max(1, progress.crownInterval), 0, 1);

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = '10px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.shadowColor = 'rgba(13,20,17,.82)';
    ctx.shadowBlur = 5;

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,247,220,.92)';
    ctx.font = '900 11px system-ui,sans-serif';
    ctx.fillText(`FLOOR ${String(player.highestFloor).padStart(3, '0')}`, left, 12);
    ctx.fillStyle = 'rgba(229,239,212,.58)';
    ctx.font = '800 8px system-ui,sans-serif';
    ctx.fillText(progress.phase, left, 29);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,242,206,.86)';
    ctx.font = '900 10px system-ui,sans-serif';
    ctx.fillText(`PB ${progress.bestFloor}`, right, 12);
    ctx.fillStyle = quest?.readyForCrown ? 'rgba(220,255,188,.84)' : 'rgba(225,237,215,.62)';
    ctx.font = '800 8px system-ui,sans-serif';
    ctx.fillText(objectiveText(quest) || `${Math.floor(player.score)} PTS`, right, 29);

    const barW = Math.min(220, width * 0.32);
    const barX = W / 2 - barW / 2;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(18,27,22,.30)';
    ctx.fillRect(barX, 15, barW, 3);
    ctx.fillStyle = 'rgba(255,196,73,.84)';
    ctx.fillRect(barX, 15, barW * crownProgress, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,235,180,.88)';
    ctx.font = '900 8px system-ui,sans-serif';
    ctx.fillText(`CROWN ${progress.nextCrownFloor} · ${progress.crownRemaining}F`, W / 2, 23);

    if (player.combo > 1) {
      ctx.fillStyle = player.hyper ? '#ffe06c' : 'rgba(142,224,201,.92)';
      ctx.font = '900 10px system-ui,sans-serif';
      ctx.fillText(`FLOW ×${player.combo}`, W / 2, 38);
    }

    if (quest?.nextSeed && !quest.crownAwakened) {
      const delta = quest.nextSeed.floor - player.highestFloor;
      if (delta >= 0 && delta <= 12) {
        ctx.fillStyle = 'rgba(255,241,175,.82)';
        ctx.font = '900 8px system-ui,sans-serif';
        ctx.fillText(`${quest.nextSeed.name} · ${delta}F ↑`, W / 2, player.combo > 1 ? 53 : 39);
      }
    }

    if (wind?.intensity > 0.16) {
      const arrow = wind.gust < 0 ? '←' : '→';
      const strength = wind.intensity > 0.72 ? 'HARD WIND' : wind.intensity > 0.42 ? 'GUST' : 'BREEZE';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(226,244,246,${0.42 + wind.intensity * 0.38})`;
      ctx.font = '800 8px system-ui,sans-serif';
      const questNear = Boolean(quest?.nextSeed && quest.nextSeed.floor - player.highestFloor >= 0 && quest.nextSeed.floor - player.highestFloor <= 12);
      const y = player.combo > 1 || questNear ? 54 : 39;
      ctx.fillText(`${arrow} ${strength} ${arrow}`, W / 2, y + (questNear && player.combo > 1 ? 13 : 0));
    }
    ctx.restore();
  }

  function drawStartFade(quest) {
    if (state.mode !== 'playing' || state.elapsed > 1.65) return;
    const alpha = clamp(1 - state.elapsed / 1.65, 0, 1) * clamp(state.elapsed / 0.18, 0, 1);
    const subtitle = quest?.crownAwakened
      ? 'THE CROWN IS AWAKE · HOW HIGH CAN YOU GO?'
      : quest?.readyForCrown
        ? `THE LIVING CROWN WAITS AT ${quest.finalCrownFloor}`
        : `WAKE THE CROWN · HEARTSEEDS ${quest?.count || 0}/${quest?.total || 5}`;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(32,16,9,.82)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#f6dda7';
    ctx.font = '900 12px Georgia,serif';
    ctx.fillText('SYLVARIA · SEQUOIA', W / 2, H * 0.16);
    ctx.fillStyle = 'rgba(255,244,211,.70)';
    ctx.font = '800 8px system-ui,sans-serif';
    ctx.fillText(subtitle, W / 2, H * 0.16 + 18);
    ctx.restore();
  }

  function drawBanner(progress) {
    const banners = [
      progress.phaseBanner && { ...progress.phaseBanner, kind: 'phase', text: progress.phaseBanner.name },
      progress.crownBanner && { ...progress.crownBanner, kind: 'crown', text: `CROWN MARK ${progress.crownBanner.floor}` },
      progress.pbBanner && { ...progress.pbBanner, kind: 'pb', text: `NEW HEIGHT · ${progress.pbBanner.floor}` },
    ].filter(Boolean);
    if (!banners.length) return;
    const banner = banners[banners.length - 1];
    const alpha = smoothFade(banner.age, banner.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(36,17,8,.82)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = banner.kind === 'crown' ? '#ffe08b' : banner.kind === 'pb' ? '#c7f4db' : '#fff0c4';
    ctx.font = banner.kind === 'phase' ? '900 24px Georgia,serif' : '900 20px system-ui,sans-serif';
    ctx.fillText(banner.text, W / 2, H * 0.27);
    if (banner.kind === 'phase') {
      ctx.fillStyle = 'rgba(255,246,220,.64)';
      ctx.font = '800 9px system-ui,sans-serif';
      ctx.fillText('THE CANOPY CHANGES HERE', W / 2, H * 0.27 + 26);
    }
    ctx.restore();
  }

  function drawGameOverProgress(progress, quest) {
    if (state.mode !== 'gameover') return;
    const questLine = quest?.crownAwakened
      ? 'THE LIVING CROWN IS AWAKE · ENDLESS CLIMB UNLOCKED'
      : quest?.readyForCrown
        ? `${Math.max(0, quest.finalCrownFloor - player.highestFloor)} FLOORS TO THE LIVING CROWN`
        : quest?.nextSeed
          ? `HEARTSEEDS ${quest.count}/${quest.total} · NEXT ${quest.nextSeed.name} @ ${quest.nextSeed.floor}`
          : `HEARTSEEDS ${quest?.count || 0}/${quest?.total || 5}`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,240,196,.72)';
    ctx.font = '800 10px system-ui,sans-serif';
    ctx.shadowColor = 'rgba(31,15,8,.8)';
    ctx.shadowBlur = 5;
    ctx.fillText(`PB ${progress.bestFloor} · ${progress.crownRemaining} FLOORS TO CROWN ${progress.nextCrownFloor}`, W / 2, H * 0.58);
    ctx.fillStyle = 'rgba(189,235,204,.72)';
    ctx.font = '800 8px system-ui,sans-serif';
    ctx.fillText(questLine, W / 2, H * 0.61);
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    const progress = S.canopyProgress.getState();
    const wind = S.canopyEscalation?.getState?.() || null;
    const quest = S.heartwoodQuest?.getState?.() || null;
    const time = now * 0.001;
    drawWind(time);
    drawCrownGate(progress, time);
    drawMinimalHud(progress, wind, quest);
    drawStartFade(quest);
    drawBanner(progress);
    drawGameOverProgress(progress, quest);
  }

  S.render = render;
  S.canopyProgressHud = {
    version: VERSION,
    revision: REVISION,
    layout: 'edge-free top ribbon + world-space crown markers',
    primaryObjective: 'wake the crown with five persistent Heartseeds',
    titleBehavior: 'title fades out after play starts',
  };
})();
