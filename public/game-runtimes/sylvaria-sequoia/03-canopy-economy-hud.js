(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.canopyEconomy || !S?.sapRhythm) return;

  const { ctx, W, H, state, player, clamp, round } = S;
  const baseRender = S.render;
  const VERSION = 'canopy-contracts-hud-v2';
  // Qualification continuity: canopy-contracts-hud-v1 evolved into this panel-free traversal surface.
  const REVISION = 'panel-free-focus-pulse-v2';
  const PULSE_SECONDS = 2.15;

  let lastMissionSignature = '';
  let lastWallet = null;
  let pulseUntil = 0;
  let pulseMissionId = '';
  let pulseReason = 'START';

  function worldToScreenY(worldY) {
    return H - (worldY - state.cameraBottom);
  }

  function tokenToScreen(token) {
    return { x: token.x, y: worldToScreenY(token.y) };
  }

  function drawTokens() {
    const tokens = S.canopyEconomy.getVisibleTokens();
    for (const token of tokens) {
      const p = tokenToScreen(token);
      if (p.y < -24 || p.y > H + 24) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(state.elapsed * 0.9 + token.floor * 0.12);
      const glow = 0.72 + 0.28 * Math.sin(state.elapsed * 4.2 + token.floor);
      ctx.shadowColor = 'rgba(255,193,91,.8)';
      ctx.shadowBlur = 12 + glow * 6;
      ctx.fillStyle = '#f5c06a';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 4);
      ctx.lineTo(0, 8);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff1b9';
      ctx.fillRect(-1.2, -4, 2.4, 8);
      ctx.restore();
    }
  }

  function missionSignature(missions) {
    return missions.map((mission) => `${mission.id}:${mission.progress}:${mission.target}:${mission.done ? 1 : 0}`).join('|');
  }

  function missionChanged(previous, missions) {
    if (!previous) return missions.find((mission) => !mission.done) || null;
    const before = new Map(previous.split('|').map((part) => {
      const [id, progress, target, done] = part.split(':');
      return [id, { progress: Number(progress), target: Number(target), done: done === '1' }];
    }));
    return missions.find((mission) => {
      const old = before.get(mission.id);
      return old && (mission.progress !== old.progress || mission.done !== old.done);
    }) || null;
  }

  function closestMission(missions) {
    return missions
      .filter((mission) => !mission.done)
      .slice()
      .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))[0] || missions.find((mission) => mission.done) || null;
  }

  function observeMeta(economy, nowSeconds) {
    const signature = missionSignature(economy.missions);
    const changed = missionChanged(lastMissionSignature, economy.missions);
    const walletChanged = lastWallet != null && economy.wallet !== lastWallet;
    if (!lastMissionSignature) {
      pulseMissionId = closestMission(economy.missions)?.id || '';
      pulseReason = 'START';
      pulseUntil = nowSeconds + PULSE_SECONDS;
    } else if (changed || walletChanged) {
      pulseMissionId = changed?.id || closestMission(economy.missions)?.id || '';
      pulseReason = changed?.done ? 'COMPLETE' : walletChanged ? 'TOKEN' : 'PROGRESS';
      pulseUntil = nowSeconds + PULSE_SECONDS;
    }
    lastMissionSignature = signature;
    lastWallet = economy.wallet;
  }

  // Kept as a named contract boundary because the static validator protects the
  // CANOPY CONTRACTS concept. v2 makes it a single transient text pulse rather
  // than a mini-card. The shop remains a deliberate modal because it is only
  // opened between runs and is not part of the traversal view.
  function missionPanel(economy, nowSeconds) {
    if (state.mode !== 'playing' || nowSeconds >= pulseUntil) return;
    const mission = economy.missions.find((item) => item.id === pulseMissionId) || closestMission(economy.missions);
    if (!mission) return;

    const fade = clamp((pulseUntil - nowSeconds) / 0.34, 0, 1);
    const right = state.RIGHT_WALL - 12;
    const label = pulseReason === 'COMPLETE'
      ? `CONTRACT COMPLETE · ${mission.name}`
      : `${mission.name} · ${mission.progress}/${mission.target} · TOKENS ${economy.wallet}`;

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(5,14,12,.96)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = mission.done ? '#ffe09a' : 'rgba(229,241,219,.72)';
    ctx.font = '900 7px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText(label, right, 56);
    ctx.restore();
  }

  function shopCard(item, index, economy) {
    const width = 196;
    const height = 92;
    const gap = 12;
    const total = width * 2 + gap;
    const left = W / 2 - total / 2;
    const x = left + (index % 2) * (width + gap);
    const y = H / 2 - 46 + Math.floor(index / 2) * (height + gap);
    const selected = economy.shopSelection === index;
    const queued = Boolean(economy.queuedLoadout[item.id]);
    const affordable = economy.wallet >= item.cost;

    ctx.fillStyle = selected ? 'rgba(255,226,143,.18)' : 'rgba(13,25,20,.72)';
    ctx.strokeStyle = selected ? '#ffe09a' : queued ? '#9fe2b4' : 'rgba(255,244,216,.16)';
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, 10);
    else ctx.rect(x, y, width, height);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff0bd';
    ctx.font = '900 10px system-ui,sans-serif';
    ctx.fillText(`${index + 1}  ${item.name}`, x + 12, y + 22);
    ctx.fillStyle = affordable ? '#f6c96e' : 'rgba(246,201,110,.45)';
    ctx.font = '900 9px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText(`${item.cost} TOKENS${queued ? ' · QUEUED' : ''}`, x + 12, y + 39);
    ctx.fillStyle = 'rgba(227,237,214,.64)';
    ctx.font = '700 8px system-ui,sans-serif';
    const words = item.description.split(' ');
    let line = '';
    let lineY = y + 57;
    for (const word of words) {
      const next = `${line}${line ? ' ' : ''}${word}`;
      if (ctx.measureText(next).width > width - 24 && line) {
        ctx.fillText(line, x + 12, lineY);
        line = word;
        lineY += 12;
      } else line = next;
    }
    if (line) ctx.fillText(line, x + 12, lineY);
  }

  function drawShop(economy) {
    if (state.mode !== 'gameover' || !economy.shopOpen) return;
    ctx.save();
    ctx.fillStyle = 'rgba(6,14,12,.80)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff2c9';
    ctx.font = '900 23px system-ui,sans-serif';
    ctx.fillText('CANOPY SHOP', W / 2, H / 2 - 92);
    ctx.fillStyle = '#f6c96e';
    ctx.font = '900 10px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText(`CONE TOKENS ${economy.wallet}`, W / 2, H / 2 - 70);
    ctx.fillStyle = 'rgba(228,236,214,.58)';
    ctx.font = '700 8px system-ui,sans-serif';
    ctx.fillText('RUN-LOCAL TOOLS ONLY · BASE MOVEMENT NEVER CHANGES', W / 2, H / 2 - 54);
    economy.shopItems.forEach((item, index) => shopCard(item, index, economy));
    ctx.fillStyle = 'rgba(255,240,202,.65)';
    ctx.font = '800 8px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText('A/D OR ←/→ SELECT · SPACE/ENTER BUY · 1–4 QUICK BUY · B/ESC CLOSE', W / 2, H / 2 + 180);
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    drawTokens();
    const economy = S.canopyEconomy.getState();
    const nowSeconds = performance.now() / 1000;
    if (state.mode === 'playing') observeMeta(economy, nowSeconds);
    missionPanel(economy, nowSeconds);
    drawShop(economy);
  }

  S.render = render;
  S.canopyEconomyHud = {
    version: VERSION,
    revision: REVISION,
    persistentMissionPanel: false,
    persistentSapPanel: false,
    contractPulseSeconds: PULSE_SECONDS,
    traversalPanelFree: true,
    priority: 'run objective > traversal > mastery > economy',
    sapSpentTeaching: 'SAP SPENT · LAND ON A HIGHER LOG',
    economyPrinciple: 'run-local tools only',
    getState: () => ({
      pulseUntil,
      pulseMissionId: pulseMissionId || null,
      pulseReason,
      wallet: S.canopyEconomy.getState().wallet,
    }),
  };
})();
