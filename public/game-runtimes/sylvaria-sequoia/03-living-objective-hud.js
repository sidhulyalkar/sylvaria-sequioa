(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.livingCanopy) return;

  const { ctx, state } = S;
  const baseRender = S.render;
  const VERSION = 'living-objective-hud-v2';
  // Qualification continuity: living-objective-hud-v1 evolved into this panel-free renderer.
  const REVISION = 'panel-free-traversal-focus-v2';

  function drawObjective() {
    // The objective stays readable at the edge of the world, but no longer owns a
    // rectangular HUD surface. The run recap owns game-over guidance, so this is
    // traversal-only and deliberately quiet.
    if (state.mode !== 'playing') return;
    const objective = S.livingCanopy.getObjective();
    if (!objective) return;
    const right = state.RIGHT_WALL - 12;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(5,14,12,.94)';
    ctx.shadowBlur = 6;
    const color = objective.kind === 'skyheart'
      ? '#eacbff'
      : objective.kind === 'wonder'
        ? '#d7f5ef'
        : objective.kind === 'crown'
          ? '#e5ffbd'
          : objective.kind === 'endless'
            ? '#ffe8a5'
            : '#f2e7bf';
    ctx.fillStyle = color;
    ctx.font = '900 8px system-ui,sans-serif';
    ctx.fillText(objective.text, right, 31);
    if (objective.detail) {
      ctx.fillStyle = 'rgba(225,237,215,.48)';
      ctx.font = '700 7px system-ui,sans-serif';
      ctx.fillText(objective.detail, right, 41);
    }
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    drawObjective();
  }

  S.render = render;
  S.livingObjectiveHud = {
    version: VERSION,
    revision: REVISION,
    visibleDuring: 'playing-only',
    panelFree: true,
    objectiveLadder: ['Heartseeds', 'Living Crown', 'Canopy Wonders', 'Skyheart', 'Endless Elder Canopy'],
    scoreIsSecondary: true,
  };
})();
