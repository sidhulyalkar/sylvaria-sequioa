(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render) return;

  // The production reference renderer completely repaints the scene. v0.4 had
  // been calling the full canopy renderer first and then painting the complete
  // reference scene over it every RAF, effectively paying for two games per
  // frame. Preserve the canopy renderer as an explicit emergency fallback, but
  // make the normal underpaint intentionally empty.
  const canopyFallback = S.render;
  let forceCanopyFallback = false;

  S.renderPipeline = {
    ...(S.renderPipeline || {}),
    version: 'single-paint-pipeline-v1',
    canopyFallback,
    setCanopyFallback(enabled) {
      forceCanopyFallback = Boolean(enabled);
    },
    getCanopyFallback: () => forceCanopyFallback,
  };

  S.render = (alpha, now) => {
    if (forceCanopyFallback) canopyFallback(alpha, now);
  };
})();
