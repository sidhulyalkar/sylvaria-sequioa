(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.ROUTE_GRAMMARS) return;

  const VERSION = 'sap-route-balance-v2';

  // Sap is punctuation between physical movement phrases. Most route families
  // contain exactly one authored air anchor; only the longest Elder/Skyheart
  // examinations contain two. Every anchor is separated from the next by a real
  // landing opportunity, so the route itself cannot form a grapple ladder.
  const balanced = {
    GROVE: [
      { dy: 72, side: 'center', length: 610, launch: true },
      { dy: 142, side: 'left', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 112, side: 'right', length: 315, ring: 'lane' },
      { dy: 108, side: 'center', length: 470, ring: 'crown' },
    ],
    SAPRUN: [
      { dy: 66, side: 'center', length: 540, launch: true },
      { dy: 150, side: 'left', branch: false, anchor: 'left', ring: 'anchor' },
      { dy: 122, side: 'right', length: 300, ring: 'lane' },
      { dy: 116, side: 'left', length: 278, ring: 'lane' },
      { dy: 114, side: 'center', length: 410, ring: 'crown' },
    ],
    SLINGSHOT: [
      { dy: 74, side: 'same', length: 370, launch: true },
      { dy: 154, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 118, side: 'same', length: 300, ring: 'lane' },
      { dy: 118, side: 'center', length: 335, ring: 'crown' },
    ],
    WINDLINE: [
      { dy: 78, side: 'same', length: 340, launch: true },
      { dy: 160, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 114, side: 'same', length: 275, ring: 'lane' },
      { dy: 112, side: 'swap', length: 260, ring: 'crown' },
    ],
    SKYHOOK: [
      { dy: 80, side: 'center', length: 315, launch: true },
      { dy: 166, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 120, side: 'right', length: 255, ring: 'lane' },
      { dy: 118, side: 'left', length: 238, ring: 'lane' },
      { dy: 116, side: 'center', length: 248, ring: 'crown' },
    ],
    CROWNWEAVE: [
      { dy: 84, side: 'same', length: 290, launch: true },
      { dy: 170, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 118, side: 'same', length: 245, ring: 'lane' },
      { dy: 122, side: 'swap', length: 228, ring: 'lane' },
      { dy: 112, side: 'center', length: 238, ring: 'crown' },
    ],
    PENDULUM: [
      { dy: 78, side: 'center', length: 310, launch: true },
      { dy: 160, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 118, side: 'right', length: 258, ring: 'lane' },
      { dy: 120, side: 'left', length: 238, ring: 'lane' },
      { dy: 116, side: 'center', length: 242, ring: 'crown' },
    ],
    THUNDERCROWN: [
      { dy: 84, side: 'same', length: 274, launch: true },
      { dy: 176, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 120, side: 'same', length: 230, ring: 'lane' },
      { dy: 124, side: 'swap', length: 214, ring: 'lane' },
      { dy: 116, side: 'center', length: 220, ring: 'crown' },
    ],
    MIGRATION: [
      { dy: 76, side: 'center', length: 330, launch: true, ring: 'crown' },
      { dy: 150, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 118, side: 'same', length: 250, ring: 'lane' },
      { dy: 122, side: 'swap', length: 232, ring: 'lane' },
      { dy: 118, side: 'center', length: 270, ring: 'crown' },
    ],
    AURORARUN: [
      { dy: 78, side: 'center', length: 315, launch: true },
      { dy: 164, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 120, side: 'right', length: 240, ring: 'lane' },
      { dy: 124, side: 'left', length: 226, ring: 'lane' },
      { dy: 122, side: 'center', length: 245, ring: 'crown' },
    ],
    ELDERSPAN: [
      { dy: 84, side: 'left', length: 265, launch: true },
      { dy: 132, side: 'right', length: 226, ring: 'lane' },
      { dy: 168, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 142, side: 'right', length: 212, ring: 'lane' },
      { dy: 174, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 138, side: 'right', length: 202, ring: 'lane' },
      { dy: 118, side: 'center', length: 238, ring: 'crown' },
    ],
    ECHOFLIGHT: [
      { dy: 88, side: 'center', length: 252, launch: true, ring: 'crown' },
      { dy: 178, side: 'left', branch: false, anchor: 'right', ring: 'anchor' },
      { dy: 122, side: 'right', length: 218, ring: 'lane' },
      { dy: 126, side: 'left', length: 204, ring: 'lane' },
      { dy: 120, side: 'center', length: 216, ring: 'crown' },
    ],
    SKYHEART: [
      { dy: 92, side: 'same', length: 238, launch: true },
      { dy: 180, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 154, side: 'same', length: 200, ring: 'lane' },
      { dy: 188, side: 'swap', branch: false, anchor: 'cross', ring: 'anchor' },
      { dy: 160, side: 'same', length: 190, ring: 'lane' },
      { dy: 142, side: 'swap', length: 182, ring: 'lane' },
      { dy: 126, side: 'center', length: 210, ring: 'crown' },
    ],
  };

  Object.assign(S.ROUTE_GRAMMARS, balanced);

  const anchorCounts = Object.fromEntries(Object.entries(balanced).map(([name, steps]) => [
    name,
    steps.filter((step) => step.branch === false && step.anchor).length,
  ]));

  S.sapRouteBalance = {
    version: VERSION,
    densityProfile: 'sparse-one-anchor-v3',
    rule: 'Sap is an isolated bridge: physical landing opportunity before every additional Sap anchor',
    balancedRoutes: Object.keys(balanced),
    anchorCounts,
    hasConsecutiveAirAnchors: Object.fromEntries(Object.entries(balanced).map(([name, steps]) => [
      name,
      steps.some((step, index) => step.branch === false && steps[index + 1]?.branch === false),
    ])),
  };
})();