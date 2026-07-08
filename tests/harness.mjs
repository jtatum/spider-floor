// Headless harness: loads the REAL game.js into a Node vm context with stubbed
// browser globals, then exposes its internals so we can drive the simulation
// without a browser. Rendering is never called, so the canvas/ctx are no-ops.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The game is split into ordered classic scripts that share one global scope;
// concatenating them in load order reproduces the exact browser environment.
const SRC_FILES = ['data.js', 'sim.js', 'maze.js', 'render.js', 'audio.js', 'main.js'];
const SRC = SRC_FILES
  .map(f => fs.readFileSync(path.join(here, '..', 'src', f), 'utf8'))
  .join('\n');

// A shim appended to the source. Because it runs in the same scope as game.js,
// it closes over the module's let/const bindings (which a vm context does NOT
// otherwise expose) and republishes them for the tests.
const SHIM = `
;globalThis.__GAME__ = {
  get run(){return run}, set run(v){run=v},
  get game(){return game}, set game(v){game=v},
  get save(){return save}, set save(v){save=v},
  get menu(){return menu}, set menu(v){menu=v},
  get shop(){return shop}, set shop(v){shop=v},
  get paused(){return paused}, set paused(v){paused=v},
  CFG, META, UPGRADES, MODIFIERS, SPECIALS, ACHIEVEMENTS, ACH_TOTAL, SPIDER_Y, FUSE_COST, keys,
  checkAchievements,
  newRun, startShift, endShift, update, mods, maxStrikes, combineFx,
  spawnPassenger, buyFuse, buyMeta, buySpecial, openShop, rerollShop, loadSave, persist,
  gainXP, xpCost, eligibleUpgrades, levelChoices, openLevelUp, pickLevel, skipLevel, rerollLevel, banishLevel,
  slotsUsed, isHouse, FITTING_SLOTS, HABIT_SLOTS, fittingSlotCap, habitSlotCap, fuseCost, restockCost,
  OPERATORS, isOpUnlocked, startWithOperator, waitPat, ridePatFor,
  HEAT, maxHeatUnlocked, openOperatorSelect, cycleHeat,
  setPaused, setVol, toggleShake, abandonRun,
  get menuHeat(){return menuHeat}, set menuHeat(v){menuHeat=v}, musicPosOf, musicResolve,
  nearestFloorIdx, isAligned, doorsOpen, ridersAboard, slotsAboard, capacityNow,
  enterBoss, updateBoss, exitBoss, BOSS,
  genMaze, bfsDistances, tryMove, screenDirToWorld, enterMaze, finishMaze, updateMaze, mazeWalkable,
  spawnMazeSpider, openCocoon, MAZE_SPEED,
  get mazeStick(){return mazeStick}, set mazeStick(v){mazeStick=v},
  get touchEnabled(){return touchEnabled}, set touchEnabled(v){touchEnabled=v},
  stopSpeedNow,
  metRecord, metricsAll, metricsSummary, cyr, wantsTinny,
};
`;

export function makeGame() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  // a ctx mock: every draw call is a no-op; the few methods with return values
  // are special-cased. We never call render() in tests, so this is belt-and-braces.
  const ctx = new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set() { return true; },
  });
  const canvas = {
    width: 900, height: 700, style: {},
    getContext: () => ctx,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 700 }),
  };
  const win = {
    addEventListener: () => {}, removeEventListener: () => {},
    innerWidth: 1200, innerHeight: 900,
    AudioContext: undefined, webkitAudioContext: undefined,
    matchMedia: () => ({ matches: false }),
  };
  // a no-op DOM element so the touch-control setup runs harmlessly headless
  const fakeEl = () => ({
    className: '', id: '', textContent: '', dataset: {}, style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {}, appendChild() {},
  });
  const sandbox = {
    document: { getElementById: () => canvas, createElement: fakeEl, body: { appendChild() {} } },
    window: win,
    performance: { now: () => 0 },
    localStorage,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    console,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(SRC + SHIM, context, { filename: 'game.js' });
  const G = context.__GAME__;
  G._localStorage = localStorage;
  G.step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) G.update(dt); };
  return G;
}
