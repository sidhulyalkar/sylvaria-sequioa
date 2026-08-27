(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S.renderPipeline?.referenceRender) return;

  const { state } = S;
  const fullRender = S.render;
  const referenceRender = S.renderPipeline.referenceRender;
  const PERF_VERSION = 'feel-first-render-budget-v1';

  // During active play, begin on the production reference scene only. The
  // altitude ecology pass is beautiful but optional; controls are not. Promote
  // to the full post-pass only after sustained evidence that this device has
  // enough frame budget, and immediately demote if rendering starts eating the
  // input/animation budget.
  let quality = 'reference';
  let renderCostEwma = 0;
  let frameMsEwma = 16.67;
  let referenceFrames = 0;
  let fullFrames = 0;
  let slowFullFrames = 0;
  let promotions = 0;
  let demotions = 0;
  let lastNow = 0;
  let cooldownUntil = 0;

  const blend = (current, next, weight) => current === 0 ? next : current + (next - current) * weight;

  function updateQuality(now, cost, frameMs) {
    renderCostEwma = blend(renderCostEwma, cost, 0.08);
    if (Number.isFinite(frameMs) && frameMs > 0 && frameMs < 120) frameMsEwma = blend(frameMsEwma, frameMs, 0.06);

    if (quality === 'reference') {
      referenceFrames += 1;
      fullFrames = 0;
      slowFullFrames = 0;
      if (
        now >= cooldownUntil &&
        referenceFrames >= 240 &&
        renderCostEwma < 6.4 &&
        frameMsEwma < 18.4
      ) {
        quality = 'full';
        promotions += 1;
        referenceFrames = 0;
      }
      return;
    }

    fullFrames += 1;
    const overBudget = renderCostEwma > 10.8 || frameMsEwma > 22.0;
    slowFullFrames = overBudget ? slowFullFrames + 1 : Math.max(0, slowFullFrames - 2);
    if (slowFullFrames >= 12) {
      quality = 'reference';
      demotions += 1;
      referenceFrames = 0;
      fullFrames = 0;
      slowFullFrames = 0;
      cooldownUntil = now + 5000;
    }
  }

  function render(alpha, now) {
    const frameMs = lastNow ? now - lastNow : 16.67;
    lastNow = now;
    const started = performance.now();

    // Keep menus / paused scenes fully dressed because input latency is not
    // critical there. Active gameplay uses the measured quality tier.
    if (state.mode === 'playing' && quality === 'reference') referenceRender(alpha, now);
    else fullRender(alpha, now);

    const cost = performance.now() - started;
    if (state.mode === 'playing') updateQuality(now, cost, frameMs);
  }

  S.render = render;
  S.renderPerformance = {
    version: PERF_VERSION,
    policy: 'reference-first gameplay; altitude pass only inside sustained frame budget',
    setQuality(next) {
      if (next !== 'reference' && next !== 'full') return false;
      quality = next;
      referenceFrames = 0;
      fullFrames = 0;
      slowFullFrames = 0;
      cooldownUntil = 0;
      return true;
    },
    getState: () => ({
      quality,
      renderCostMs: Number(renderCostEwma.toFixed(2)),
      frameMs: Number(frameMsEwma.toFixed(2)),
      estimatedFps: Number((1000 / Math.max(1, frameMsEwma)).toFixed(1)),
      promotions,
      demotions,
      cooldownMs: Math.max(0, cooldownUntil - performance.now()),
      singlePaint: true,
    }),
  };

  S.renderPipeline = {
    ...S.renderPipeline,
    performanceVersion: PERF_VERSION,
    fullRender,
  };
})();
