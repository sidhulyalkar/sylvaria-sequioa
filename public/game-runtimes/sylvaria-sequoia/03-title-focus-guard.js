(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.canvas || !S?.state) return;

  const { canvas, state } = S;

  // Desktop clicks are used by the Game Network host to hand keyboard focus into
  // the same-origin runtime. They must not also start a run, otherwise the Space
  // press that follows becomes a hidden gameplay jump. Touch remains tap-to-start.
  function guardDesktopTitleFocus(event) {
    if (event.pointerType === 'touch') return;
    if (state.mode !== 'title' && state.mode !== 'gameover') return;
    canvas.focus();
    event.stopImmediatePropagation();
  }

  canvas.addEventListener('pointerdown', guardDesktopTitleFocus, { capture: true });

  S.titleFocusGuard = {
    version: 'desktop-focus-v1',
    desktopActivation: 'Space-or-Enter',
    touchActivation: 'tap',
  };
})();