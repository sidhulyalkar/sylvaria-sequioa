(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  const debug = window.SYLVARIA_SEQUOIA_DEBUG;
  if (!S || !debug) return;

  const baseGetState = debug.getState;
  debug.version = '0.6.1';
  debug.getState = () => ({
    ...baseGetState(),
    sapRhythm: S.sapRhythm?.getState?.() || null,
    sapAuthority: S.sapAuthority?.getState?.() || null,
    sapRouteBalance: S.sapRouteBalance || null,
    economy: S.canopyEconomy?.getState?.() || null,
  });
  debug.getSapRhythm = () => S.sapRhythm?.getState?.() || null;
  debug.getSapAuthority = () => S.sapAuthority?.getState?.() || null;
  debug.getEconomy = () => S.canopyEconomy?.getState?.() || null;
})();