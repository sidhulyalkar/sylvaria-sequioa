(() => {
  'use strict';

  const S = window.SylvariaSequoia;
  if (!S?.update || !S?.resetRun || !S?.startRun || !S?.sapRhythm) return;

  const { state, player, TUNE, clamp, announce, recordEvent, tone, burst } = S;
  const baseUpdate = S.update;
  const baseResetRun = S.resetRun;
  const baseStartRun = S.startRun;

  const VERSION = 'canopy-contracts-v1';
  const TOKEN_KEY = 'sylvaria.sequoia.coneTokens';
  const LOADOUT_KEY = 'sylvaria.sequoia.shopLoadout';
  const TOKEN_PICKUP_CHANCE = 0.18;
  const TOKEN_PICKUP_RADIUS = 58;
  const MILESTONE_STEP = 25;
  const MILESTONE_REWARD = 2;

  const SHOP_ITEMS = [
    {
      id: 'extra-life',
      name: 'EXTRA LIFE',
      cost: 18,
      detail: 'Next run: +1 fall rescue',
      apply() { player.saves = Math.min(3, (player.saves || 0) + 1); },
    },
    {
      id: 'stride-seed',
      name: 'STRIDE SEED',
      cost: 12,
      detail: 'Next run: begin with 280 Stride',
      apply() { player.strideMomentum = Math.max(player.strideMomentum || 0, 280); },
    },
    {
      id: 'resin-flask',
      name: 'RESIN FLASK',
      cost: 14,
      detail: 'Next run: 65% toward a rescue',
      apply() { player.resin = Math.max(player.resin || 0, 0.65); },
    },
    {
      id: 'trail-map',
      name: 'TRAIL MAP',
      cost: 10,
      detail: 'Next run: mission rewards ×1.5',
      apply() { runMissionMultiplier = 1.5; },
    },
  ];

  const readNumber = (key, fallback = 0) => {
    try {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
  };

  function readLoadout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOADOUT_KEY) || '{}');
      return Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, parsed?.[item.id] ? 1 : 0]));
    } catch {
      return Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, 0]));
    }
  }

  function saveLoadout() {
    write(LOADOUT_KEY, JSON.stringify(queuedLoadout));
  }

  function hash01(value, salt = 0) {
    let hash = (state.runSeed ^ Math.imul((value | 0) + 37 + salt * 101, 0x9e3779b1)) >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d) >>> 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b) >>> 0;
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  }

  let wallet = Math.max(0, Math.floor(readNumber(TOKEN_KEY, 0)));
  let queuedLoadout = readLoadout();
  let runMissionMultiplier = 1;
  let activeLoadout = [];
  let runTokenIds = new Set();
  let runMilestones = new Set();
  let completedMissions = new Set();
  let activeMissionIds = [];
  let shopOpen = false;
  let lastShopMessage = '';
  let lastShopMessageLife = 0;

  function bumpCounter(name, amount = 1) {
    const counters = S.getTelemetry().counters;
    counters[name] = (counters[name] || 0) + amount;
  }

  function addTokens(amount, source, loud = true) {
    const gain = Math.max(0, Math.floor(amount));
    if (!gain) return 0;
    wallet += gain;
    write(TOKEN_KEY, wallet);
    bumpCounter('coneTokensEarned', gain);
    recordEvent('cone-token-earned', { amount: gain, source, wallet });
    if (loud) {
      announce(`+${gain} CONE TOKEN${gain === 1 ? '' : 'S'} · ${source}`, 0.52, 11);
      tone(620 + Math.min(160, gain * 18), 0.05, 0.022, 'triangle', 1.45);
    }
    return gain;
  }

  function telemetryCounters() {
    return S.getTelemetry().counters || {};
  }

  function missionSnapshot() {
    const rhythm = S.sapRhythm.getState();
    const counters = telemetryCounters();
    return {
      floor: player.highestFloor || 0,
      freshLogs: rhythm.freshLogLandings || 0,
      sapCycles: rhythm.sapCycles || 0,
      sapUses: rhythm.sapUses || 0,
      cleanSap: counters.sapStickCleanVaults || 0,
      rings: counters.ringsThreaded || 0,
      skips: counters.multiFloorSkips || 0,
      catches: counters.sapCatches || 0,
      bestCombo: player.bestCombo || 0,
    };
  }

  const MISSIONS = {
    'two-way-climb': {
      id: 'two-way-climb',
      name: 'TWO-WAY CLIMB',
      reward: 8,
      description: 'Reach 30 · touch 8 new logs · complete 2 Sap→log cycles',
      status(s) {
        return {
          done: s.floor >= 30 && s.freshLogs >= 8 && s.sapCycles >= 2,
          ratio: Math.min(1, s.floor / 30, s.freshLogs / 8, s.sapCycles / 2),
          detail: `F ${Math.min(s.floor, 30)}/30 · LOG ${Math.min(s.freshLogs, 8)}/8 · SAP→LOG ${Math.min(s.sapCycles, 2)}/2`,
        };
      },
    },
    'log-ladder': {
      id: 'log-ladder', name: 'LOG LADDER', reward: 5,
      description: 'Land on 16 new higher logs',
      status: (s) => ({ done: s.freshLogs >= 16, ratio: Math.min(1, s.freshLogs / 16), detail: `${Math.min(s.freshLogs, 16)}/16 HIGHER LOGS` }),
    },
    'clean-craft': {
      id: 'clean-craft', name: 'CLEAN CRAFT', reward: 6,
      description: 'Perform 3 Clean Sap vaults',
      status: (s) => ({ done: s.cleanSap >= 3, ratio: Math.min(1, s.cleanSap / 3), detail: `${Math.min(s.cleanSap, 3)}/3 CLEAN SAP` }),
    },
    'flow-study': {
      id: 'flow-study', name: 'FLOW STUDY', reward: 6,
      description: 'Reach 6× Flow and bank 6 new logs',
      status: (s) => ({ done: s.bestCombo >= 6 && s.freshLogs >= 6, ratio: Math.min(1, s.bestCombo / 6, s.freshLogs / 6), detail: `FLOW ${Math.min(s.bestCombo, 6)}/6 · LOG ${Math.min(s.freshLogs, 6)}/6` }),
    },
    'high-road': {
      id: 'high-road', name: 'HIGH ROAD', reward: 8,
      description: 'Reach 50 · use Sap 4 times · make 3 multi-floor skips',
      status: (s) => ({ done: s.floor >= 50 && s.sapUses >= 4 && s.skips >= 3, ratio: Math.min(1, s.floor / 50, s.sapUses / 4, s.skips / 3), detail: `F ${Math.min(s.floor, 50)}/50 · SAP ${Math.min(s.sapUses, 4)}/4 · SKIP ${Math.min(s.skips, 3)}/3` }),
    },
    'no-panic': {
      id: 'no-panic', name: 'NO PANIC', reward: 7,
      description: 'Reach floor 45 without spending a rescue',
      status: (s) => ({ done: s.floor >= 45 && s.catches === 0, ratio: s.catches ? 0 : Math.min(1, s.floor / 45), detail: s.catches ? 'RESCUE SPENT · TRY NEXT RUN' : `F ${Math.min(s.floor, 45)}/45 · NO RESCUE` }),
    },
    'ring-route': {
      id: 'ring-route', name: 'RING ROUTE', reward: 6,
      description: 'Thread 4 Rings and complete 2 Sap→log cycles',
      status: (s) => ({ done: s.rings >= 4 && s.sapCycles >= 2, ratio: Math.min(1, s.rings / 4, s.sapCycles / 2), detail: `RING ${Math.min(s.rings, 4)}/4 · SAP→LOG ${Math.min(s.sapCycles, 2)}/2` }),
    },
  };

  const missionPool = ['log-ladder', 'clean-craft', 'flow-study', 'high-road', 'no-panic', 'ring-route'];

  function selectMissions() {
    const first = Math.floor(hash01(state.runSeed, 901) * missionPool.length) % missionPool.length;
    let second = Math.floor(hash01(state.runSeed, 1301) * missionPool.length) % missionPool.length;
    if (second === first) second = (second + 1 + (state.runSeed % (missionPool.length - 1))) % missionPool.length;
    activeMissionIds = ['two-way-climb', missionPool[first], missionPool[second]];
  }

  function missionStates() {
    const snapshot = missionSnapshot();
    return activeMissionIds.map((id) => {
      const mission = MISSIONS[id];
      const status = mission.status(snapshot);
      const reward = Math.max(1, Math.round(mission.reward * runMissionMultiplier));
      return {
        id,
        name: mission.name,
        description: mission.description,
        reward,
        completed: completedMissions.has(id),
        ...status,
      };
    });
  }

  function updateMissions() {
    for (const mission of missionStates()) {
      if (!mission.done || completedMissions.has(mission.id)) continue;
      completedMissions.add(mission.id);
      addTokens(mission.reward, mission.name, false);
      bumpCounter('missionsCompleted');
      recordEvent('mission-complete', { id: mission.id, reward: mission.reward });
      announce(`${mission.name} COMPLETE · +${mission.reward} CONES`, 1.15, 15);
      burst(player.x, player.y, 18, 'leaf', 0.78);
      tone(520, 0.08, 0.034, 'triangle', 1.45);
      tone(760, 0.11, 0.024, 'sine', 1.68);
    }
  }

  function tokenForBranch(branch) {
    if (!branch || branch.floor < 4) return null;
    if (hash01(branch.floor, 211) >= TOKEN_PICKUP_CHANCE) return null;
    const id = `${state.runSeed}:${branch.chunkId || 'route'}:${branch.floor}`;
    if (runTokenIds.has(id)) return null;
    const margin = 44;
    const preferred = Number.isFinite(branch.launchX) ? branch.launchX : (branch.x1 + branch.x2) * 0.5;
    const x = clamp(preferred, branch.x1 + margin, branch.x2 - margin);
    const y = S.branchYAt(branch, x) + 28;
    return { id, floor: branch.floor, x, y, branch };
  }

  function visibleTokens() {
    return state.branches.map(tokenForBranch).filter(Boolean);
  }

  function collectLogToken() {
    const branch = player.grounded;
    if (!branch) return;
    const token = tokenForBranch(branch);
    if (!token || Math.abs(player.x - token.x) > TOKEN_PICKUP_RADIUS) return;
    runTokenIds.add(token.id);
    addTokens(1, 'LOG CONE');
    bumpCounter('coneTokenPickups');
    recordEvent('cone-token-pickup', { floor: token.floor, x: S.round(token.x, 1) });
    burst(token.x, token.y, 10, 'resin', 0.50);
  }

  function awardMilestones() {
    const maxStep = Math.floor((player.highestFloor || 0) / MILESTONE_STEP) * MILESTONE_STEP;
    for (let floor = MILESTONE_STEP; floor <= maxStep; floor += MILESTONE_STEP) {
      if (runMilestones.has(floor)) continue;
      runMilestones.add(floor);
      addTokens(MILESTONE_REWARD, `CROWN ${floor}`);
      bumpCounter('coneTokenMilestones');
    }
  }

  function resetEconomyRun() {
    runMissionMultiplier = 1;
    activeLoadout = [];
    runTokenIds = new Set();
    runMilestones = new Set();
    completedMissions = new Set();
    shopOpen = false;
    lastShopMessage = '';
    lastShopMessageLife = 0;
    selectMissions();
  }

  function consumeQueuedLoadout() {
    const purchased = SHOP_ITEMS.filter((item) => queuedLoadout[item.id]);
    if (!purchased.length) return;
    activeLoadout = purchased.map((item) => item.id);
    for (const item of purchased) item.apply();
    queuedLoadout = Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, 0]));
    saveLoadout();
    bumpCounter('shopItemsConsumed', purchased.length);
    recordEvent('shop-loadout-consumed', { items: activeLoadout.slice() });
    announce(`TRAIL KIT · ${purchased.map((item) => item.name).join(' + ')}`, 1.05, 12);
  }

  function purchase(id) {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === id);
    if (!item) return false;
    if (!(state.mode === 'title' || state.mode === 'gameover')) {
      lastShopMessage = 'SHOP OPENS BETWEEN RUNS';
      lastShopMessageLife = 1.4;
      return false;
    }
    if (queuedLoadout[id]) {
      lastShopMessage = `${item.name} ALREADY QUEUED`;
      lastShopMessageLife = 1.4;
      return false;
    }
    if (wallet < item.cost) {
      lastShopMessage = `NEED ${item.cost - wallet} MORE CONES`;
      lastShopMessageLife = 1.4;
      tone(105, 0.04, 0.014, 'square', 0.8);
      return false;
    }

    wallet -= item.cost;
    queuedLoadout[id] = 1;
    write(TOKEN_KEY, wallet);
    saveLoadout();
    bumpCounter('shopPurchases');
    recordEvent('shop-purchase', { id, cost: item.cost, wallet });
    lastShopMessage = `${item.name} QUEUED FOR NEXT RUN`;
    lastShopMessageLife = 1.8;
    tone(430, 0.07, 0.026, 'triangle', 1.35);
    return true;
  }

  function toggleShop(force) {
    if (!(state.mode === 'title' || state.mode === 'gameover')) {
      shopOpen = false;
      return false;
    }
    shopOpen = typeof force === 'boolean' ? force : !shopOpen;
    lastShopMessage = '';
    lastShopMessageLife = 0;
    return shopOpen;
  }

  function update(dt) {
    baseUpdate(dt);
    lastShopMessageLife = Math.max(0, lastShopMessageLife - dt);
    if (state.mode !== 'playing') return;
    collectLogToken();
    awardMilestones();
    updateMissions();
  }

  function resetRun(seed) {
    const result = baseResetRun(seed);
    resetEconomyRun();
    return result;
  }

  function startRun(seed) {
    const result = baseStartRun(seed);
    resetEconomyRun();
    consumeQueuedLoadout();
    return result;
  }

  function getState() {
    return {
      version: VERSION,
      wallet,
      currency: 'CONE TOKENS',
      queuedLoadout: { ...queuedLoadout },
      activeLoadout: activeLoadout.slice(),
      items: SHOP_ITEMS.map(({ id, name, cost, detail }) => ({ id, name, cost, detail, queued: Boolean(queuedLoadout[id]) })),
      missions: missionStates(),
      missionMultiplier: runMissionMultiplier,
      shopOpen,
      lastShopMessage: lastShopMessageLife > 0 ? lastShopMessage : '',
      visibleTokenCount: visibleTokens().length,
      tokenPickupChance: TOKEN_PICKUP_CHANCE,
      milestoneReward: MILESTONE_REWARD,
    };
  }

  S.update = update;
  S.resetRun = resetRun;
  S.startRun = startRun;
  S.canopyEconomy = {
    version: VERSION,
    getState,
    getVisibleTokens: () => visibleTokens().map(({ id, floor, x, y }) => ({ id, floor, x, y })),
    purchase,
    toggleShop,
    setShopOpen: (value) => toggleShop(Boolean(value)),
  };
})();