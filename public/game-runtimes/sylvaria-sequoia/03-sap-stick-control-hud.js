(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render) return;

  const { ctx, W, H, state } = S;
  const baseRender = S.render;
  const HUD_VERSION = 'shift-hold-minimal-v3';

  function cue(y, text, alpha = 0.72, accent = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = accent ? '#ffe2a0' : 'rgba(255,248,228,.72)';
    ctx.font = '800 8px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(5,12,9,.96)';
    ctx.shadowBlur = 7;
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  function drawPlayingCue() {
    if (state.mode !== 'playing') return;
    const stick = S.sapStick?.getState?.() || {};

    if (stick.active) {
      cue(H - 24, 'A/D SWING · RELEASE SHIFT = VAULT', 0.88, true);
      return;
    }

    // Teach once, then disappear. Contextual reminders are a single text line,
    // never a persistent card or bottom bar covering the route.
    const route = S.activeRouteChunk?.();
    const routeNeedsSap = route?.type === 'SAPRUN' || route?.type === 'SLINGSHOT' || route?.type === 'SKYHOOK' || route?.type === 'CROWNWEAVE';
    const early = state.elapsed < 6.0;
    const contextual = routeNeedsSap && (state.elapsed % 9.5) < 1.45;
    if (!early && !contextual) return;

    const fade = early ? Math.min(1, Math.max(0, (6.0 - state.elapsed) / 1.5)) : 0.64;
    cue(H - 24, 'SHIFT SAP · HOLD + A/D · RELEASE VAULT', fade * 0.78, false);
  }

  function drawTitleInstruction() {
    if (state.mode !== 'title') return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(24,13,8,.76)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = 'rgba(255,244,216,.80)';
    ctx.font = '800 9px system-ui,sans-serif';
    ctx.fillText('SPACE jump / Air Kick   ·   SHIFT Sap   ·   hold + A/D swing   ·   release vault', W / 2, H * 0.515);
    ctx.fillStyle = 'rgba(255,244,216,.46)';
    ctx.font = '700 8px system-ui,sans-serif';
    ctx.fillText('0 same seed   ·   N new route   ·   P pause', W / 2, H * 0.55);
    ctx.restore();
  }

  function render(alpha, now) {
    baseRender(alpha, now);
    drawPlayingCue();
    drawTitleInstruction();
  }

  S.render = render;
  S.sapStickControlHud = {
    version: HUD_VERSION,
    control: 'Shift press -> hold with A/D -> release to vault',
    teaching: 'panel-free, transient and contextual',
    panelFree: true,
    resetKey: '0',
  };
})();
