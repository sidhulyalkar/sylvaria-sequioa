(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  const debug = window.SYLVARIA_SEQUOIA_DEBUG;
  if (!S || !debug) return;

  const baseGetState = debug.getState;
  debug.version = '0.5.0';
  debug.getState = () => ({
    ...baseGetState(),
    heartwood: S.heartwoodQuest?.getState?.() || null,
    canopyTrials: S.canopyTrials?.getState?.() || null,
    livingCanopy: S.livingCanopy?.getState?.() || null,
  });
  debug.getLivingCanopy = () => S.livingCanopy?.getState?.() || null;
  debug.getHeartwood = () => S.heartwoodQuest?.getState?.() || null;
  debug.getCanopyTrials = () => S.canopyTrials?.getState?.() || null;
})();
