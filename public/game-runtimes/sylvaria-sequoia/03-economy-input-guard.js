(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.canopyEconomy || !S?.canopyEconomyHud) return;

  const { state, canvas, W, H } = S;
  const PURCHASE_KEYS = new Map([
    ['Digit1', 'extra-life'],
    ['Digit2', 'stride-seed'],
    ['Digit3', 'resin-flask'],
    ['Digit4', 'trail-map'],
  ]);

  function betweenRuns() {
    return state.mode === 'title' || state.mode === 'gameover';
  }

  function swallow(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  window.addEventListener('keydown', (event) => {
    const economy = S.canopyEconomy.getState();
    if (event.repeat) return;

    if (event.code === 'KeyB' && betweenRuns()) {
      swallow(event);
      S.canopyEconomy.toggleShop();
      return;
    }

    if (!economy.shopOpen) return;
    if (event.code === 'Escape') {
      swallow(event);
      S.canopyEconomy.setShopOpen(false);
      return;
    }

    const item = PURCHASE_KEYS.get(event.code);
    if (item) {
      swallow(event);
      S.canopyEconomy.purchase(item);
      return;
    }

    // While the shop owns focus, gameplay activation keys must not leak through
    // to 04-input and accidentally start a run underneath the overlay.
    if (event.code === 'Space' || event.code === 'Enter' || event.code.startsWith('Shift')) swallow(event);
  }, { capture: true, passive: false });

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * W / rect.width,
      y: (event.clientY - rect.top) * H / rect.height,
    };
  }

  function contains(box, point) {
    return point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!betweenRuns()) return;
    const point = canvasPoint(event);
    const economy = S.canopyEconomy.getState();

    if (!economy.shopOpen) {
      if (!contains(S.canopyEconomyHud.shopButton, point)) return;
      swallow(event);
      S.canopyEconomy.setShopOpen(true);
      return;
    }

    swallow(event);
    const row = S.canopyEconomyHud.getShopRows().find((candidate) => contains(candidate, point));
    if (row) {
      S.canopyEconomy.purchase(row.id);
      return;
    }

    // Clicking the dark surround closes the shop; clicking inside the panel does
    // nothing so a near-miss never starts the game.
    if (!contains(S.canopyEconomyHud.shopPanel, point)) S.canopyEconomy.setShopOpen(false);
  }, { capture: true, passive: false });

  S.canopyEconomyInput = {
    version: 'canopy-shop-input-v1',
    controls: 'B shop · 1–4 buy · Esc close',
  };
})();