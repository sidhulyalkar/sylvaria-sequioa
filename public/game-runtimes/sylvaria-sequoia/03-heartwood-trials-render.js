(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.heartwoodQuest || !S?.canopyTrials) return;

  const { ctx, W, H, state, player, clamp, lerp } = S;
  const baseRender = S.render;
  const VERSION = 'heartwood-trials-render-v1';
  const TAU = Math.PI * 2;

  function worldToScreenY(worldY) {
    return H - (worldY - state.cameraBottom);
  }

  function floorWorldY(floor) {
    const branch = state.branches.find((item) => item.floor === floor);
    if (branch) return branch.y;
    const knot = state.knots.find((item) => item.floor === floor);
    if (knot) return knot.y;
    const ring = state.rings.find((item) => item.floor === floor);
    return ring?.y ?? null;
  }

  function drawFragileBranches(time) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const branch of state.branches) {
      if (!branch._trialFragile) continue;
      const mid = (branch.x1 + branch.x2) * 0.5;
      const y = worldToScreenY(S.branchYAt(branch, mid));
      if (y < -40 || y > H + 40) continue;
      const breaking = branch._trialBreaking;
      const remaining = breaking ? Math.max(0, branch._trialBreakAt - state.elapsed) : 1;
      const progress = breaking ? 1 - remaining / Math.max(0.001, branch._trialBreakDuration) : 0;
      const pulse = 0.45 + Math.sin(time * 7 + branch.floor) * 0.12;
      const span = Math.min(96, (branch.x2 - branch.x1) * 0.34);

      ctx.globalAlpha = breaking ? 0.48 + progress * 0.46 : 0.16 + pulse * 0.12;
      ctx.strokeStyle = breaking ? '#ffe0a0' : '#d8a46e';
      ctx.lineWidth = breaking ? 2.2 : 1.1;
      ctx.shadowColor = breaking ? '#ff9c46' : 'transparent';
      ctx.shadowBlur = breaking ? 7 + progress * 10 : 0;
      ctx.beginPath();
      ctx.moveTo(mid - span * 0.52, y - 2);
      ctx.lineTo(mid - span * 0.24, y + 4);
      ctx.lineTo(mid - span * 0.04, y - 4);
      ctx.lineTo(mid + span * 0.18, y + 5);
      ctx.lineTo(mid + span * 0.48, y - 2);
      ctx.stroke();

      if (breaking) {
        ctx.globalAlpha = 0.30 + progress * 0.52;
        ctx.fillStyle = '#ffd180';
        const chips = 3 + Math.floor(progress * 4);
        for (let i = 0; i < chips; i += 1) {
          const x = mid - span * 0.42 + (span * 0.84 * i) / Math.max(1, chips - 1);
          const drop = 5 + progress * 18 + Math.sin(time * 9 + i) * 2;
          ctx.fillRect(x, y + drop, 2, 3 + (i % 2));
        }
      }
    }
    ctx.restore();
  }

  function drawSwayTrails(time) {
    ctx.save();
    for (const knot of state.knots) {
      if (!knot._trialSway) continue;
      const y = worldToScreenY(knot.y);
      if (y < -50 || y > H + 50) continue;
      const span = knot._trialAmplitude || 0;
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = '#ffc879';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(knot._trialBaseX - span, y);
      ctx.lineTo(knot._trialBaseX + span, y);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 1; i <= 2; i += 1) {
        const ghostX = knot._trialBaseX + Math.sin((state.elapsed - i * 0.09) * knot._trialFrequency + knot._trialPhase) * span;
        ctx.globalAlpha = 0.08 / i;
        ctx.fillStyle = '#ffe3a6';
        ctx.beginPath();
        ctx.arc(ghostX, y, 4 - i * 0.7, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFragments(trials) {
    ctx.save();
    for (const fragment of trials.fallingFragments) {
      const y = worldToScreenY(fragment.y);
      const life = clamp(1 - fragment.age / fragment.life, 0, 1);
      if (y < -90 || y > H + 120 || life <= 0) continue;
      const mid = (fragment.x1 + fragment.x2) * 0.5;
      const width = Math.min(120, Math.max(28, fragment.x2 - fragment.x1));
      ctx.globalAlpha = life * 0.62;
      ctx.translate(mid, y);
      ctx.rotate(fragment.spin * fragment.age);
      ctx.fillStyle = '#7f3f23';
      ctx.fillRect(-width / 2, -4, width, 8);
      ctx.strokeStyle = 'rgba(247,185,105,.42)';
      ctx.beginPath();
      ctx.moveTo(-width / 2 + 4, -2);
      ctx.lineTo(width / 2 - 4, -2);
      ctx.stroke();
      ctx.rotate(-fragment.spin * fragment.age);
      ctx.translate(-mid, -y);
    }
    ctx.restore();
  }

  function drawCones(trials, time) {
    ctx.save();
    for (const cone of trials.cones) {
      if (cone.age < 0) {
        const urgency = clamp(1 + cone.age / Math.max(0.001, cone.warning), 0, 1);
        ctx.globalAlpha = 0.26 + urgency * 0.62;
        ctx.strokeStyle = '#ffd277';
        ctx.lineWidth = 1.5 + urgency * 1.8;
        ctx.shadowColor = '#ff9a3c';
        ctx.shadowBlur = 5 + urgency * 10;
        ctx.beginPath();
        ctx.moveTo(cone.x, 46);
        ctx.lineTo(cone.x, 18 + urgency * 9);
        ctx.stroke();
        ctx.fillStyle = '#ffe2a0';
        ctx.beginPath();
        ctx.moveTo(cone.x, 48);
        ctx.lineTo(cone.x - 5, 38);
        ctx.lineTo(cone.x + 5, 38);
        ctx.closePath();
        ctx.fill();
        continue;
      }

      const y = worldToScreenY(cone.y);
      if (y < -60 || y > H + 80) continue;
      ctx.save();
      ctx.translate(cone.x, y);
      ctx.rotate(cone.rotation);
      ctx.globalAlpha = cone.hit ? 0.28 : 0.95;
      ctx.shadowColor = '#ffb04f';
      ctx.shadowBlur = 8;
      const gradient = ctx.createLinearGradient(0, -17, 0, 18);
      gradient.addColorStop(0, '#d78b43');
      gradient.addColorStop(1, '#5b2d1d');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.quadraticCurveTo(-12, 7, -8, -13);
      ctx.quadraticCurveTo(0, -21, 8, -13);
      ctx.quadraticCurveTo(12, 7, 0, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,219,154,.52)';
      ctx.lineWidth = 1.2;
      for (let band = -8; band <= 8; band += 8) {
        ctx.beginPath();
        ctx.moveTo(-7, band);
        ctx.lineTo(7, band + 3);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHeartseed(quest, time) {
    const seed = quest.activeSeed;
    if (!seed || state.mode !== 'playing') return;
    const y = worldToScreenY(seed.y);
    if (y < -90 || y > H + 90) return;
    const pulse = 1 + Math.sin(time * 4.6 + seed.index) * 0.09;
    const near = Math.abs(seed.floor - player.highestFloor) <= 7;

    ctx.save();
    const glow = ctx.createRadialGradient(seed.x, y, 2, seed.x, y, 36 * pulse);
    glow.addColorStop(0, 'rgba(255,255,225,.98)');
    glow.addColorStop(0.18, `${seed.hue}dd`);
    glow.addColorStop(1, `${seed.hue}00`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(seed.x, y, 36 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.translate(seed.x, y);
    ctx.rotate(Math.sin(time * 1.4 + seed.index) * 0.12);
    ctx.shadowColor = seed.hue;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#fff6c5';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6 * pulse, 10 * pulse, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = seed.hue;
    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI * 0.5 + time * 0.22;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, -14 * pulse, 3.4, 7.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    if (near) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(14,17,13,.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#fff4bf';
      ctx.font = '900 9px system-ui,sans-serif';
      ctx.fillText(seed.name, seed.x, y - 30);
      ctx.fillStyle = 'rgba(235,248,216,.70)';
      ctx.font = '800 7px system-ui,sans-serif';
      ctx.fillText(seed.challenge, seed.x, y - 19);
      ctx.restore();
    }
  }

  function drawLivingCrown(quest, time) {
    if (!quest.readyForCrown || state.mode !== 'playing') return;
    const worldY = floorWorldY(quest.finalCrownFloor);
    if (worldY == null) return;
    const y = worldToScreenY(worldY);
    if (y < -120 || y > H + 120) return;
    const left = state.LEFT_WALL + 90;
    const right = state.RIGHT_WALL - 90;
    const pulse = 0.74 + Math.sin(time * 2.6) * 0.12;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#fff0a8';
    ctx.shadowColor = '#c5ffb8';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, y + 6);
    ctx.quadraticCurveTo(W / 2, y - 54, right, y + 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8ffc8';
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const x = lerp(left, right, t);
      const arch = 4 * t * (1 - t);
      const py = y + 6 - arch * 60;
      ctx.beginPath();
      ctx.arc(x, py, i === 4 ? 3.5 : 2, 0, TAU);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#fff6c5';
    ctx.font = '900 12px Georgia,serif';
    ctx.fillText('THE LIVING CROWN', W / 2, y - 59);
    ctx.fillStyle = 'rgba(232,255,212,.74)';
    ctx.font = '800 8px system-ui,sans-serif';
    ctx.fillText('WAKE IT', W / 2, y - 44);
    ctx.restore();
  }

  function drawQuestBanner(quest) {
    const banner = quest.crownBanner || quest.activeBanner;
    if (!banner) return;
    const life = banner.life || 1;
    const age = banner.age || 0;
    const alpha = Math.min(1, age / 0.16, (life - age) / 0.55);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = quest.crownBanner ? '#7dff9b' : (banner.hue || '#ffdb7b');
    ctx.shadowBlur = quest.crownBanner ? 24 : 16;
    ctx.fillStyle = '#fff8d0';
    ctx.font = quest.crownBanner ? '900 26px Georgia,serif' : '900 18px system-ui,sans-serif';
    ctx.fillText(quest.crownBanner ? 'THE LIVING CROWN AWAKENS' : `${banner.name} · ${banner.count}/${quest.total}`, W / 2, H * 0.31);
    if (!quest.crownBanner) {
      ctx.fillStyle = 'rgba(228,255,218,.76)';
      ctx.font = '800 8px system-ui,sans-serif';
      ctx.fillText('AIR KICK + SAP CATCH RESTORED', W / 2, H * 0.31 + 22);
    }
    ctx.restore();
  }

  function drawTrialChip(trials) {
    if (state.mode !== 'playing') return;
    const labels = {
      BREAKAWAY: 'BREAKAWAY',
      PENDULUM: 'PENDULUM',
      CONEFALL: 'CONEFALL',
      THUNDERCROWN: 'THUNDERCROWN',
    };
    const label = labels[trials.activeRoute];
    if (!label) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = trials.activeRoute === 'THUNDERCROWN' ? 'rgba(255,216,126,.82)' : 'rgba(218,239,225,.55)';
    ctx.font = '900 7px system-ui,sans-serif';
    ctx.fillText(label, W / 2, 66);
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    const time = now * 0.001;
    const trials = S.canopyTrials.getState();
    const quest = S.heartwoodQuest.getState();
    drawFragileBranches(time);
    drawSwayTrails(time);
    drawFragments(trials);
    drawCones(trials, time);
    drawHeartseed(quest, time);
    drawLivingCrown(quest, time);
    drawTrialChip(trials);
    drawQuestBanner(quest);
  }

  S.render = render;
  S.heartwoodTrialsRender = {
    version: VERSION,
    visuals: ['heartseeds', 'living-crown', 'breakaway-cracks', 'pendulum-trails', 'cone-warnings'],
  };
})();
