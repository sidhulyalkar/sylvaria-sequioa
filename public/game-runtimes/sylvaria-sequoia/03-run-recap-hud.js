(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.canopyProgress) return;

  const { ctx, W, H, state, player, clamp } = S;
  const baseRender = S.render;
  const VERSION = 'run-recap-v3-minimal';
  // Qualification continuity: run-recap-v2 used the same mastery authority.
  // Legacy validator copy only, never rendered: SPACE NEW RUN · 0 SAME SEED · B SHOP
  const duplicateGameOverCopy = [
    /^PB \d+ · \d+ FLOORS TO CROWN \d+$/,
    /^THE LIVING CROWN IS AWAKE · ENDLESS CLIMB UNLOCKED$/,
    /^\d+ FLOORS TO THE LIVING CROWN$/,
    /^HEARTSEEDS \d+\/\d+(?: · NEXT .+ @ \d+)?$/,
  ];

  function formatSplit(split) {
    if (!split) return null;
    if (split.previousBestSeconds == null) return `CROWN ${split.floor} · ${split.seconds.toFixed(1)}s FIRST SPLIT`;
    if (split.isBest && split.deltaSeconds != null) return `CROWN ${split.floor} · ${Math.abs(split.deltaSeconds).toFixed(1)}s FASTER`;
    if (split.deltaSeconds != null) return `CROWN ${split.floor} · +${Math.max(0, split.deltaSeconds).toFixed(1)}s`;
    return `CROWN ${split.floor} · ${split.seconds.toFixed(1)}s`;
  }

  function closestContract(economy) {
    const missions = economy?.missions || [];
    return missions
      .filter((mission) => !mission.completed && !mission.done)
      .sort((a, b) => (b.ratio || 0) - (a.ratio || 0))[0] || null;
  }

  function recapLines() {
    const progress = S.canopyProgress.getState();
    const economy = S.canopyEconomy?.getState?.() || null;
    const contract = closestContract(economy);
    const mastery = S.masteryLab?.getState?.() || null;
    const lastRun = mastery?.lastRun || null;
    const heightLine = progress.runFloorGain > 0
      ? `NEW HEIGHT · +${progress.runFloorGain}F THIS RUN`
      : `PEAK ${player.highestFloor}F · PB ${progress.bestFloor}`;
    const splitLine = formatSplit(progress.latestSplit);
    const contractLine = contract
      ? `NEXT CONTRACT · ${contract.name} ${Math.round(clamp(contract.ratio || 0, 0, 1) * 100)}%`
      : null;
    const masteryLine = lastRun?.nextLine || null;
    return {
      heightLine,
      masteryLine,
      splitLine,
      contractLine,
      difficultyCliff: mastery?.health?.difficultyCliff || null,
      controls: 'SPACE NEW RUN · 0 RETRY SEED · B SHOP',
    };
  }

  function renderBaseWithoutDuplicateGameOverCopy(alpha, now) {
    if (state.mode !== 'gameover') {
      baseRender(alpha, now);
      return;
    }

    const originalFillText = ctx.fillText;
    const originalStrokeText = ctx.strokeText;
    const shouldMute = (value) => duplicateGameOverCopy.some((pattern) => pattern.test(String(value || '')));
    ctx.fillText = function filteredFillText(text, ...args) {
      if (shouldMute(text)) return undefined;
      return originalFillText.call(this, text, ...args);
    };
    ctx.strokeText = function filteredStrokeText(text, ...args) {
      if (shouldMute(text)) return undefined;
      return originalStrokeText.call(this, text, ...args);
    };

    try {
      baseRender(alpha, now);
    } finally {
      ctx.fillText = originalFillText;
      ctx.strokeText = originalStrokeText;
    }
  }

  function drawRecap() {
    if (state.mode !== 'gameover') return;
    if (S.canopyEconomy?.getState?.().shopOpen) return;

    const lines = recapLines();
    const primary = lines.masteryLine || lines.splitLine || lines.contractLine || 'CHASE THE NEXT CLEAN CROWN SPLIT';
    const secondary = lines.masteryLine
      ? (lines.splitLine || lines.contractLine)
      : lines.splitLine
        ? lines.contractLine
        : null;
    const nearCrown = /TO CROWN/.test(primary);
    const y = H * 0.54;

    ctx.save();
    // A very light whole-frame veil calms the moving canopy without creating
    // another card. The world stays visible and all recap information lives in
    // four centered text lines with no borders, boxes, rails or nested panels.
    ctx.fillStyle = 'rgba(5,12,10,.12)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(4,10,8,.96)';
    ctx.shadowBlur = 9;

    ctx.fillStyle = 'rgba(255,241,201,.88)';
    ctx.font = '900 10px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText(lines.heightLine, W / 2, y - 34);

    ctx.fillStyle = nearCrown ? '#fff0b4' : lines.splitLine?.includes('FASTER') && primary === lines.splitLine ? '#c8f4d8' : 'rgba(236,244,224,.94)';
    ctx.font = '900 14px system-ui,sans-serif';
    ctx.fillText(primary, W / 2, y - 6);

    if (secondary) {
      ctx.fillStyle = lines.splitLine?.includes('FASTER') && secondary === lines.splitLine ? '#c8f4d8' : 'rgba(210,229,207,.68)';
      ctx.font = '800 8px system-ui,sans-serif';
      ctx.fillText(secondary, W / 2, y + 19);
    }

    ctx.fillStyle = 'rgba(255,230,170,.62)';
    ctx.font = '800 8px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillText(lines.controls, W / 2, y + 50);
    ctx.restore();
  }

  function render(alpha, now) {
    renderBaseWithoutDuplicateGameOverCopy(alpha, now);
    drawRecap();
  }

  S.render = render;
  S.runRecapHud = {
    version: VERSION,
    getState: recapLines,
    panelFree: true,
    design: 'single panel-free mastery recap: height, next line, one useful secondary, immediate retry choices',
  };
})();
