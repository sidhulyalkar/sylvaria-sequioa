(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.render || !S?.ctx) return;

  const { ctx, state } = S;
  const baseRender = S.render;
  // Preserve the browser-qualified public contract identifier. The v2 cleanup is
  // an additive presentation revision: it extends suppression to game over but
  // does not change the gate's core promise that underlying world pixels survive.
  const VERSION = 'reference-hud-suppression-v1';
  const REVISION = 'panel-free-gameover-v2';
  const paintMethods = ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText'];
  const staleTitleCopy = /Shift \+ Space|T telemetry · R retry/;
  const mutedReferenceModes = new Set(['playing', 'gameover']);

  // The reference renderer paints world geometry first and its old HUD last.
  // Rather than repainting a rectangle over gameplay, this gate mutes only the
  // legacy HUD draw scope while it is being issued. The legacy translate(22, 18)
  // gameplay-logo anchor begins that scope; save/restore depth gives us an exact
  // end point. Pixels underneath are therefore never overwritten, so Pip/branches
  // remain fully visible even when they pass through the former HUD footprint.
  //
  // The panel-free-gameover-v2 revision applies the same rule to game over. The
  // mastery recap now owns that state, so the old logo, left rail, Sap cards and
  // large duplicate death card stay out of the final frame instead of stacking
  // multiple panels over the canopy.
  function render(alpha, now) {
    let depth = 0;
    let suppress = false;
    let hudOuterDepth = -1;
    const original = {
      save: ctx.save,
      restore: ctx.restore,
      translate: ctx.translate,
    };
    const paints = Object.fromEntries(paintMethods.map((name) => [name, ctx[name]]));

    ctx.save = function patchedSave(...args) {
      const result = original.save.apply(this, args);
      depth += 1;
      return result;
    };
    ctx.restore = function patchedRestore(...args) {
      const result = original.restore.apply(this, args);
      depth = Math.max(0, depth - 1);
      if (suppress && depth < hudOuterDepth) {
        suppress = false;
        hudOuterDepth = -1;
      }
      return result;
    };
    ctx.translate = function patchedTranslate(x, y, ...rest) {
      // drawReferenceHud -> drawLogo(22, 18, .92) is unique outside title mode.
      if (mutedReferenceModes.has(state.mode) && !suppress && Math.abs(x - 22) < 0.001 && Math.abs(y - 18) < 0.001 && depth >= 2) {
        suppress = true;
        hudOuterDepth = depth - 1;
      }
      return original.translate.call(this, x, y, ...rest);
    };
    for (const name of paintMethods) {
      ctx[name] = function patchedPaint(...args) {
        if (suppress && mutedReferenceModes.has(state.mode)) return undefined;
        if ((name === 'fillText' || name === 'strokeText') && state.mode === 'title' && staleTitleCopy.test(String(args[0] || ''))) {
          return undefined;
        }
        return paints[name].apply(this, args);
      };
    }

    try {
      baseRender(alpha, now);
    } finally {
      ctx.save = original.save;
      ctx.restore = original.restore;
      ctx.translate = original.translate;
      for (const name of paintMethods) ctx[name] = paints[name];
    }
  }

  S.render = render;
  S.minimalHudGate = {
    version: VERSION,
    revision: REVISION,
    target: 'reference gameplay/gameover logo + left rail + old Sap panels + duplicate death card + stale title controls',
    mutedReferenceModes: [...mutedReferenceModes],
    presentationPolicy: 'world-first',
    preservesUnderlyingScene: true,
  };
})();
