(() => {
  'use strict';

  if (window.__SIDS_GAME_NETWORK_BRIDGE__) return;
  window.__SIDS_GAME_NETWORK_BRIDGE__ = true;

  const SOURCE = 'sids-game-network-runtime';
  const notify = (kind = 'focus') => {
    if (window.parent === window) return;
    try {
      window.parent.postMessage({ source: SOURCE, kind }, window.location.origin);
    } catch {}
  };

  window.addEventListener('pointerdown', () => notify('focus'), true);
  window.addEventListener('mousedown', () => notify('focus'), true);
  window.addEventListener('touchstart', () => notify('focus'), { capture: true, passive: true });
  window.addEventListener('focusin', () => notify('focus'), true);
  window.addEventListener('keydown', (event) => notify(event.key === 'Escape' ? 'escape' : 'focus'), true);
})();
