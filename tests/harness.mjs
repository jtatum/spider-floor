// Headless harness: loads the real ordered scripts into a Node vm context with
// stubbed browser globals, then exposes selected internals so tests can drive
// the game without a browser. Canvas calls are recorded but remain no-ops.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The game is split into ordered classic scripts that share one global scope;
// concatenating them in load order reproduces the exact browser environment.
const SRC_FILES = ['assets.js', 'data.js', 'sim.js', 'maze.js', 'render.js', 'audio.js', 'main.js'];
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
  W, H, canvas, canvasPos, fit, desiredCanvasPixelRatio,
  get canvasPixelRatio(){return canvasPixelRatio},
  metRecord, metricsAll, metricsSummary, cyr, wantsTinny,
  LandmarkAssets, drawLandmark, drawPassenger,
};
`;

export function makeGame(options = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
  // A ctx mock: every draw call is recorded and otherwise a no-op; the few
  // methods with return values are special-cased for targeted renderer tests.
  const transforms = [];
  const ctxCalls = [];
  const ctx = new Proxy({}, {
    get(_, p) {
      if (p === 'measureText') return (...args) => {
        ctxCalls.push({ method: p, args });
        return { width: 0 };
      };
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return (...args) => {
        ctxCalls.push({ method: p, args });
        return { addColorStop() {} };
      };
      if (p === 'setTransform') return (...args) => {
        ctxCalls.push({ method: p, args });
        transforms.push(args);
      };
      return (...args) => ctxCalls.push({ method: p, args });
    },
    set() { return true; },
  });
  const canvas = {
    width: 900, height: 700, style: {},
    clientLeft: 2, clientTop: 2,
    getContext: () => ctx,
    addEventListener: () => {},
    getBoundingClientRect() {
      return { left: 11, top: 17,
        width: (Number.parseFloat(this.style.width) || 900) + 4,
        height: (Number.parseFloat(this.style.height) || 700) + 4 };
    },
  };
  const win = {
    addEventListener: () => {}, removeEventListener: () => {},
    innerWidth: 1200, innerHeight: 900,
    devicePixelRatio: 2,
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
  if (typeof options.Image === 'function') sandbox.Image = options.Image;
  const context = vm.createContext(sandbox);
  vm.runInContext(SRC + SHIM, context, { filename: 'game.js' });
  const G = context.__GAME__;
  G._localStorage = localStorage;
  G._ctxTransforms = transforms;
  G._ctxCalls = ctxCalls;
  G._resetCtxCalls = () => { ctxCalls.length = 0; };
  G.step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) G.update(dt); };
  return G;
}
