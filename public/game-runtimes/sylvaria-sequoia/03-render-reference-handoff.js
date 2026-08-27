(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render) return;

  S.renderPipeline = {
    ...(S.renderPipeline || {}),
    referenceRender: S.render,
    referenceVersion: S.referenceRenderer?.version || 'reference-production-v1',
  };
})();
