// ════════════════════════════════════════════════════════════════════
// THE WORST ELEVATOR  —  an elevator roguelike
//
//   You operate a junk lift with no floor display. Scoop passengers from
//   the lobby, REMEMBER the floors they shouted, and drop each one off
//   before they lose their patience. Survive a shift, earn parts, and in
//   the shop turn the death-trap into a dream machine — every upgrade is
//   the relief of not having to do the hard part anymore.
// ════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

// ─────────────────────────────────────────────────────────────── config

const CFG = {
  floorHeight: 170,
  carWidth: 220,
  carHeight: 132,
  capacity: 4,            // cabin holds this many riders (base)
  maxSpeed: 330,
  accel: 480,             // deliberate build-up, not instant
  brakeAccel: 620,        // reverse-crank to slow; not a crisp stop
  coastFriction: 0.994,   // a flywheel — releasing the crank keeps momentum
  settleFriction: 0.82,   // gentle extra drag only at a crawl, so a careful stop is possible
  settleBelow: 9,         // speed under which settleFriction kicks in (px/s)
  doorTime: 0.55,
  patienceTime: 22,       // waiting patience (seconds)
  ridePatience: 18,       // patience once aboard
  alignTolerance: 16,
  stopSpeed: 22,
  rememberTime: 2.8,      // seconds a rider's floor stays "remembered"
  strikesAllowed: 3,
};

// Floor numbers are fixed, but the LANDMARK on each floor is shuffled every
// career — so you re-learn the building each run (and can't lean on muscle
// memory from last time). The landmark is your only wayfinding: there are no
// painted numbers. There are more landmarks than floors, so each run also draws
// a different *subset*.
const FLOOR_LABELS = ['L', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', 'PH'];
const MAX_FLOORS = FLOOR_LABELS.length;
const LANDMARKS = ['red', 'plant', 'fire', 'art', 'blue', 'crack', 'clock', 'vend',
                   'green', 'window', 'penthouse', 'mirror', 'neon', 'pipes', 'cat', 'aquarium'];

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Each career gets a building palette, so runs look distinct at a glance.
// Landmarks keep their own bright colours and pop against whichever theme.
const THEMES = [
  { name: 'sepia', wall: '#2c2016', wallDark: '#241a10', shaft: '#090604', col: '#1c150d', room: '#1f1710', slab: '#40301e', ceil: '#100b07', light: 'rgba(255,205,130,0.13)' },
  { name: 'slate', wall: '#1d2638', wallDark: '#161e2c', shaft: '#06090e', col: '#111724', room: '#161f2e', slab: '#2f3d5c', ceil: '#0a0e16', light: 'rgba(150,200,255,0.12)' },
  { name: 'moss',  wall: '#1f2e1a', wallDark: '#182414', shaft: '#070a05', col: '#131e11', room: '#172310', slab: '#314222', ceil: '#0a1008', light: 'rgba(200,255,150,0.11)' },
  { name: 'rust',  wall: '#341e17', wallDark: '#2a1810', shaft: '#0b0604', col: '#20110d', room: '#28160f', slab: '#48281c', ceil: '#110805', light: 'rgba(255,170,110,0.13)' },
  { name: 'plum',  wall: '#281d30', wallDark: '#201627', shaft: '#0a0613', col: '#191122', room: '#1f152d', slab: '#3a2950', ceil: '#0d0815', light: 'rgba(220,170,255,0.12)' },
  { name: 'teal',  wall: '#142a2a', wallDark: '#0f2121', shaft: '#040d0d', col: '#0c1c1c', room: '#102323', slab: '#1c4040', ceil: '#071111', light: 'rgba(140,255,230,0.11)' },
];
// acc (landmark) per floor index; floor 0 is always the lobby
function generateBuilding() {
  const picks = shuffle(LANDMARKS);
  const b = ['lobby'];
  for (let i = 1; i < MAX_FLOORS; i++) b.push(picks[i - 1]);
  return b;
}

// Upgrades — the relief arc. Each removes a pain point. There are dozens, but
// the shop only ever offers a random HAND of them, so every run you commit to a
// build. `tag` groups them (and colours the card).
const UPGRADES = [
  // ── motion / control ──
  { key: 'motor',     name: 'Rebuilt Motor',  tag: 'move', max: 3, costs: [4, 6, 9],
    blurb: ['More top speed and quicker pickup.', 'Even more top speed.', 'A genuinely fast lift.'] },
  { key: 'brakes',    name: 'Regen Brakes',   tag: 'move', max: 2, costs: [5, 8],
    blurb: ['Far stronger braking — overshoot less.', 'Slam to a halt almost on a dime.'] },
  { key: 'autoLevel', name: 'Auto-Leveling',  tag: 'move', max: 1, costs: [9],
    blurb: ['The car eases itself onto the floor when you stop nearby.'] },
  { key: 'damper',    name: 'Flywheel Damper',tag: 'move', max: 2, costs: [4, 6],
    blurb: ['Bleeds off momentum — the car coasts less.', 'Coasts much less; far easier to stop.'] },
  { key: 'precision', name: 'Precision Crank', tag: 'move', max: 2, costs: [4, 6],
    blurb: ['A wider margin counts as "aligned".', 'A generous margin — sloppy stops still open.'] },
  // ── doors ──
  { key: 'fastDoors', name: 'Quick Doors',    tag: 'door', max: 2, costs: [4, 6],
    blurb: ['Doors cycle 35% faster.', 'Doors cycle 60% faster.'] },
  { key: 'autoDoors', name: 'Auto Doors',     tag: 'door', max: 1, costs: [8],
    blurb: ['Doors open themselves when you stop at a floor that needs you.'] },
  { key: 'interlock', name: 'Door Interlock', tag: 'door', max: 1, costs: [5],
    blurb: ['Fumbling the doors mid-travel no longer jams the car.'] },
  // ── memory / info ──
  { key: 'floorCounter', name: 'Floor Counter', tag: 'info', max: 2, costs: [5, 7],
    blurb: ['A cabin readout shows your floor — when nearly stopped.', 'The readout keeps up even at full speed.'] },
  { key: 'dispatch',  name: 'Dispatch Board', tag: 'info', max: 1, costs: [9],
    blurb: ["Riders' floors stay posted. Stop trying to remember."] },
  { key: 'arrows',    name: 'Guidance Arrows', tag: 'info', max: 1, costs: [6],
    blurb: ['An arrow points the way to your nearest rider\'s floor.'] },
  { key: 'chime',     name: 'Proximity Chime', tag: 'info', max: 1, costs: [5],
    blurb: ['A chime sounds as you near a floor someone aboard wants.'] },
  // ── cabin / cargo ──
  { key: 'capacity',  name: 'Bigger Cabin',   tag: 'cargo', max: 3, costs: [5, 7, 9],
    blurb: ['Carry one more passenger.', 'Carry two more.', 'Carry three more.'] },
  { key: 'tipjar',    name: 'Tip Jar',        tag: 'cargo', max: 2, costs: [5, 8],
    blurb: ['Every fare pays +1 ◆.', 'Every fare pays +2 ◆.'] },
  { key: 'surge',     name: 'Surge Pricing',  tag: 'cargo', max: 2, costs: [5, 7],
    blurb: ['Fares pay extra when the lobby is packed.', 'Even more when it\'s packed.'] },
  // ── patience / calm ──
  { key: 'cushions',  name: 'Plush Cabin',    tag: 'calm', max: 3, costs: [4, 6, 8],
    blurb: ['Everyone is more patient.', 'Markedly more patient.', 'Downright serene.'] },
  { key: 'muzak',     name: 'Cabin Muzak',    tag: 'calm', max: 2, costs: [4, 6],
    blurb: ['Riders fume slower while aboard.', 'Riders barely mind a detour.'] },
  { key: 'coffee',    name: 'Lobby Coffee',   tag: 'calm', max: 2, costs: [4, 6],
    blurb: ['The waiting crowd is more patient.', 'The lobby is downright relaxed.'] },
  { key: 'apology',   name: 'Apology Notes',  tag: 'calm', max: 1, costs: [6],
    blurb: ['Your first walk-off each shift is forgiven.'] },
  // ── luck / power ──
  { key: 'lucky',     name: 'Lucky Cabin',    tag: 'luck', max: 2, costs: [5, 7],
    blurb: ['VIP passengers turn up more often.', 'VIPs turn up much more often.'] },
  { key: 'powercell', name: 'Power Cell',     tag: 'luck', max: 2, costs: [5, 7],
    blurb: ['Power-ups last 40% longer.', 'Power-ups last 80% longer.'] },
  // ── defense ──
  { key: 'fusebox',   name: 'Fuse Box',       tag: 'guard', max: 2, costs: [6, 9],
    blurb: ['Start each shift holding a Spare Fuse.', 'Start each shift holding two.'] },
  { key: 'reinforced',name: 'Reinforced Car', tag: 'guard', max: 1, costs: [10],
    blurb: ['One extra strike before you\'re fired (this run).'] },
];
const UP_TAGS = {
  move:  { name: 'MOTION',   color: '#6ab8ff' },
  door:  { name: 'DOORS',    color: '#7adf9a' },
  info:  { name: 'MEMORY',   color: '#d8b24a' },
  cargo: { name: 'CARGO',    color: '#e0904a' },
  calm:  { name: 'PATIENCE', color: '#9adf7a' },
  luck:  { name: 'FORTUNE',  color: '#d88aff' },
  guard: { name: 'DEFENSE',  color: '#e0584a' },
};

// Shift modifiers — rolled conditions that reshape a shift. The roguelike spice:
// no two shifts (and no two runs) play the same. `tone` colours the banner.
const MODIFIERS = [
  { key: 'rush',     name: 'RUSH HOUR',      tone: 'wild', desc: 'A flood of passengers — but every fare pays more.',
    fx: { spawnMul: 0.6, fareMul: 1.5 } },
  { key: 'slow',     name: 'SLOW MORNING',   tone: 'good', desc: 'Few passengers, and a patient crowd.',
    fx: { spawnMul: 1.7, patMul: 1.3 } },
  { key: 'shortfuse',name: 'SHORT FUSES',    tone: 'bad',  desc: 'Everyone is in a foul mood. Patience runs short.',
    fx: { patMul: 0.62 } },
  { key: 'slippery', name: 'SLIPPERY CABLES',tone: 'bad',  desc: 'The brake is shot. The car barely wants to stop.',
    fx: { coast: 0.7 } },
  { key: 'blackout', name: 'POWER FLICKER',  tone: 'bad',  desc: 'The landmarks keep dropping into shadow.',
    fx: { dark: 0.72 } },
  { key: 'gala',     name: 'VIP GALA',       tone: 'good', desc: 'The building is crawling with VIPs tonight.',
    fx: { vipMul: 3.2 } },
  { key: 'cramped',  name: 'CRAMPED CAR',    tone: 'bad',  desc: 'Half the cabin is roped off. One fewer rider.',
    fx: { capDelta: -1 } },
  { key: 'freight',  name: 'FREIGHT DAY',    tone: 'wild', desc: 'Movers everywhere, hauling luggage that hogs the cabin.',
    fx: { moverMul: 5 } },
  { key: 'night',    name: 'GRAVEYARD SHIFT',tone: 'wild', desc: 'Quiet… and the Spider Floor stirs early and often.',
    fx: { spiderMul: 0.35, forceSpider: true, dark: 0.4, spawnMul: 1.25 } },
  { key: 'express',  name: 'EVERYONE UP',    tone: 'wild', desc: 'The whole crowd is headed for the upper floors.',
    fx: { destHigh: true, fareMul: 1.25 } },
  { key: 'tippers',  name: 'GENEROUS TIPPERS',tone: 'good',desc: 'Big tippers about — and fares run a little richer.',
    fx: { tipperMul: 5, fareMul: 1.15 } },
  { key: 'nervous',  name: 'NERVOUS WRECKS', tone: 'bad',  desc: 'A jittery crowd that fumes the moment you dawdle.',
    fx: { nervousMul: 5, patMul: 0.88 } },
];

function combineFx(mods) {
  const fx = { spawnMul: 1, patMul: 1, fareMul: 1, vipMul: 1, capDelta: 0, coast: 0,
               spiderMul: 1, dark: 0, destHigh: false, moverMul: 1, nervousMul: 1,
               tipperMul: 1, forceSpider: false };
  for (const md of mods) {
    const e = md.fx;
    fx.spawnMul   *= e.spawnMul   ?? 1;
    fx.patMul     *= e.patMul     ?? 1;
    fx.fareMul    *= e.fareMul    ?? 1;
    fx.vipMul     *= e.vipMul     ?? 1;
    fx.capDelta   += e.capDelta   ?? 0;
    fx.coast       = Math.max(fx.coast, e.coast ?? 0);
    fx.spiderMul  *= e.spiderMul  ?? 1;
    fx.dark        = Math.max(fx.dark, e.dark ?? 0);
    fx.destHigh    = fx.destHigh || !!e.destHigh;
    fx.moverMul   *= e.moverMul   ?? 1;
    fx.nervousMul *= e.nervousMul ?? 1;
    fx.tipperMul  *= e.tipperMul  ?? 1;
    fx.forceSpider = fx.forceSpider || !!e.forceSpider;
  }
  return fx;
}
// Shift 1 is clean (onboarding); 1 condition early; up to 2 once you're rolling.
function rollModifiers(n) {
  if (n <= 1) return [];
  const count = n >= 5 && Math.random() < 0.5 ? 2 : 1;
  const avoid = run.seenModifiers.slice(-3);
  const pool = MODIFIERS.filter(m => !avoid.includes(m.key));
  const first = pool[Math.floor(Math.random() * pool.length)];
  const picks = [first];
  if (count === 2) {
    // never pile two "bad" conditions on at once — keep a two-condition shift fair
    let pool2 = pool.filter(m => m.key !== first.key);
    if (first.tone === 'bad') pool2 = pool2.filter(m => m.tone !== 'bad');
    if (pool2.length) picks.push(pool2[Math.floor(Math.random() * pool2.length)]);
  }
  run.seenModifiers.push(...picks.map(m => m.key));
  return picks;
}

// ──────────────────────────────────────────────────────── career / run

let run;     // persists across shifts within one career
let game;    // per-shift state
let shop;    // shop screen state
let menu = null;   // out-of-run overlay screen ('WORKSHOP'); null = follow game.state

// ── persistent profile across ALL runs (the Workshop / meta-progression) ──
// ★ stars are earned every run and spent on permanent perks that make each
// new career start a little less hopeless. This is the long-game replay loop.
const META = [
  { key: 'severance',     name: 'Severance Pay',    max: 4, costs: [3, 5, 8, 12],
    blurb: ['Clock in with ◆5 in pocket.', 'Clock in with ◆10.', 'Clock in with ◆15.', 'Clock in with ◆20.'] },
  { key: 'footInDoor',    name: 'Foot in the Door', max: 3, costs: [4, 7, 11],
    blurb: ['Start each run with a Floor Counter fitted.', '…and Quick Doors.', '…and Auto-Leveling, too.'] },
  { key: 'roomierStart',  name: 'Roomier Cabin',    max: 2, costs: [5, 8],
    blurb: ['Start every run carrying +1 passenger.', 'Start every run carrying +2.'] },
  { key: 'sturdyStart',   name: 'Sturdy Cables',    max: 1, costs: [7],
    blurb: ['Start every run with a Flywheel Damper — stopping is easier.'] },
  { key: 'masterKey',     name: 'Master Key',       max: 1, costs: [10],
    blurb: ['Begin every run with one random upgrade already installed.'] },
  { key: 'unionCard',     name: 'Union Card',       max: 1, costs: [9],
    blurb: ['One extra strike before they fire you.'] },
  { key: 'frequentFlyer', name: 'Frequent Flyer',   max: 1, costs: [8],
    blurb: ['Every fare you complete pays +1 ◆.'] },
  { key: 'greaseMonkey',  name: 'Grease Monkey',    max: 1, costs: [8],
    blurb: ['Every run starts with quicker base doors.'] },
  { key: 'bigShop',       name: 'Connections',      max: 2, costs: [7, 11],
    blurb: ['The shop offers +1 choice each visit.', 'The shop offers +2 choices.'] },
  { key: 'rerollToken',   name: 'Haggler',          max: 2, costs: [6, 9],
    blurb: ['Begin each shop visit with 1 free reroll.', 'Begin each visit with 2 free rerolls.'] },
  { key: 'hazardPay',     name: 'Hazard Pay',       max: 2, costs: [7, 11],
    blurb: ['Earn 25% more ★ per run.', 'Earn 50% more ★ per run.'] },
  { key: 'reputation',    name: 'Reputation',       max: 2, costs: [4, 7],
    blurb: ['VIP passengers turn up more often.', 'VIPs turn up much more often.'] },
  { key: 'knownAssociate',name: 'Known Associate',  max: 2, costs: [5, 8],
    blurb: ['The Spider Floor opens more often.', '…and its web pays out faster.'] },
];

function defaultSave() {
  const meta = {};
  for (const m of META) meta[m.key] = 0;
  return { stars: 0, meta, best: { shifts: 0, delivered: 0 } };
}
function loadSave() {
  const def = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem('worstElevatorSave'));
    if (!s) return def;
    return { ...def, ...s, meta: { ...def.meta, ...(s.meta || {}) }, best: { ...def.best, ...(s.best || {}) } };
  } catch (e) { return def; }
}
function persist() { try { localStorage.setItem('worstElevatorSave', JSON.stringify(save)); } catch (e) {} }
let save = loadSave();

function maxStrikes() {
  return CFG.strikesAllowed + save.meta.unionCard + ((run && run.up.reinforced) || 0) + ((game && game.extraStrike) || 0);
}

function newRun() {
  const meta = save.meta;
  const up = {};
  for (const u of UPGRADES) up[u.key] = 0;
  // "Foot in the Door" pre-fits relief upgrades so the early grind is shorter
  if (meta.footInDoor >= 1) up.floorCounter = 1;
  if (meta.footInDoor >= 2) up.fastDoors = 1;
  if (meta.footInDoor >= 3) up.autoLevel = 1;
  if (meta.sturdyStart >= 1) up.damper = Math.max(up.damper, 1);
  if (meta.masterKey >= 1) {            // one random upgrade free, every run
    const pool = UPGRADES.filter(u => up[u.key] < u.max);
    if (pool.length) up[pool[Math.floor(Math.random() * pool.length)].key]++;
  }
  return {
    up,
    parts: [0, 5, 10, 15, 20][meta.severance] ?? 0,
    rerolls: 0,
    shiftNum: 0,
    totalDelivered: 0,
    fuses: 0,          // consumable: each forgives one walk-off
    building: generateBuilding(),   // this career's landmark layout
    theme: THEMES[Math.floor(Math.random() * THEMES.length)],
    seenModifiers: [],              // for variety: avoid repeating conditions back-to-back
    nextShift: {},                  // one-shot effects primed by shop "specials"
  };
}

// Effective stats given current upgrades + meta perks. Computed once per shift.
function mods() {
  const u = run.up;
  const L = (k) => u[k] || 0;
  const cushion = [1, 1.25, 1.45, 1.6][L('cushions')];
  return {
    maxSpeed:   CFG.maxSpeed   * [1, 1.22, 1.40, 1.55][L('motor')],
    accel:      CFG.accel      * [1, 1.18, 1.32, 1.45][L('motor')],
    brakeAccel: CFG.brakeAccel * [1, 1.6, 2.1][L('brakes')],
    doorTime:   CFG.doorTime   * [1, 0.65, 0.42][L('fastDoors')] * (save.meta.greaseMonkey ? 0.8 : 1),
    coastFriction: CFG.coastFriction - [0, 0.004, 0.008][L('damper')],
    alignTol:   CFG.alignTolerance + [0, 4, 8][L('precision')],
    patience:   CFG.patienceTime * cushion * [1, 1.25, 1.5][L('coffee')],
    ridePat:    CFG.ridePatience * cushion * [1, 1.25, 1.5][L('muzak')],
    capacity:   CFG.capacity + [0, 1, 2, 3][L('capacity')] + [0, 1, 2][save.meta.roomierStart],
    autoLevel:  L('autoLevel') >= 1,
    autoDoors:  L('autoDoors') >= 1,
    interlock:  L('interlock') >= 1,
    floorCounter: L('floorCounter'),   // 0,1,2
    dispatch:   L('dispatch') >= 1,
    arrows:     L('arrows') >= 1,
    chime:      L('chime') >= 1,
    fareBonus:  [0, 1, 2][L('tipjar')] + save.meta.frequentFlyer,
    surge:      L('surge'),
    apology:    L('apology') >= 1,
    vipRate:    [1, 1.5, 2][L('lucky')] * (1 + 0.6 * save.meta.reputation),
    powerDur:   [1, 1.4, 1.8][L('powercell')],
  };
}

// Shift parameters scale with shift number. Tuned to bite sooner — the draft
// shop also denies the full relief suite, so you can't trivialise late shifts.
function shiftParams(n) {
  const floors = Math.min(MAX_FLOORS, 5 + Math.floor((n + 1) / 2)); // 5 → 12, grows a touch sooner
  const quota  = 6 + Math.floor(n * 2.2);
  const spawn  = Math.max(1.5, 4.6 - n * 0.34);   // seconds between arrivals
  const patMul = Math.max(0.5, 1 - n * 0.06);     // patience squeeze
  return { floors, quota, spawn, patMul };
}

function startShift() {
  menu = null;
  run.shiftNum++;
  const sp = shiftParams(run.shiftNum);
  const active = [];
  for (let i = 0; i < sp.floors; i++) active.push({ label: FLOOR_LABELS[i], acc: run.building[i] });
  const modifiers = rollModifiers(run.shiftNum);
  const fx = combineFx(modifiers);
  const m = mods();
  const introT = modifiers.length ? 3.0 : 1.6;
  game = {
    state: 'PLAYING',
    t: 0,
    floors: active,
    elev: { y: 0, v: 0, doors: 1, doorTarget: 1, jamFlash: 0, wasReady: false },
    passengers: [],
    nextId: 1,
    spawnTimer: introT + 0.3,         // hold the first arrival until the intro clears
    spawnInterval: sp.spawn * fx.spawnMul,
    patMul: sp.patMul * fx.patMul,
    quota: sp.quota,
    delivered: 0,
    partsThisShift: 0,
    strikes: 0,
    shake: 0,
    flash: null,
    shiftTime: 0,
    banner: null,
    introT,
    modifiers,
    fx,
    particles: [],
    floaters: [],
    power: { express: 0, freeze: 0, xray: 0, magnet: 0, double: 0 },
    // the legendary Spider Floor opens below the lobby for a brief window
    spider: { open: false, used: false,
              cooldown: (9 + Math.random() * 9) * (1 - 0.25 * save.meta.knownAssociate) * fx.spiderMul,
              window: 0, glow: 0 },
    spiderGame: null,
    apologyUsed: false,
    m,
  };

  // Fuse Box: top up to the guaranteed number of fuses at the start of each shift
  const guaranteedFuses = [0, 1, 2][run.up.fusebox || 0];
  if (run.fuses < guaranteedFuses) run.fuses = guaranteedFuses;

  // consume one-shot "special" effects primed in the shop last visit
  const ns = run.nextShift || {};
  if (ns.patienceBoost) game.patMul *= ns.patienceBoost;
  if (ns.brakeBoost) game.brakeBoost = ns.brakeBoost;
  if (ns.guaranteedSpider) { game.fx.forceSpider = true; game.spider.cooldown = 3; }
  if (ns.extraStrike) game.extraStrike = ns.extraStrike;
  if (ns.startPower) grantPower();
  run.nextShift = {};
  sfx.intro();
}

function capacityNow() { return Math.max(1, game.m.capacity + game.fx.capDelta); }

const SPIDER_Y = -CFG.floorHeight;   // one floor below the lobby

// Temporary power-ups — tipped by VIP passengers, decay over time.
const POWERS = {
  express: { name: 'EXPRESS',     dur: 12, color: '#5ad0ff' },
  freeze:  { name: 'COOL HEADS',  dur: 14, color: '#9ad4ff' },
  xray:    { name: 'X-RAY MEMORY',dur: 12, color: '#c89aff' },
  magnet:  { name: 'DOOR MAGNET', dur: 12, color: '#7aff9a' },
  double:  { name: 'DOUBLE FARE', dur: 14, color: '#ffd44a' },
};
function grantPower() {
  const keys = Object.keys(POWERS);
  const k = keys[Math.floor(Math.random() * keys.length)];
  game.power[k] = POWERS[k].dur * (game.m.powerDur || 1);   // Power Cell extends duration
  game.banner = { text: `★ ${POWERS[k].name} ★`, t: 1.6, color: POWERS[k].color };
  sfx.power();
}

function endShift(reason) {
  // reason: 'quota' (survived) or 'fired'
  if (reason === 'quota') {
    const bonus = 3 + Math.max(0, maxStrikes() - game.strikes);
    game.bonus = bonus;
    run.parts += bonus;
    game.state = 'SHIFT_DONE';
    game.doneT = 0;
    sfx.fanfare();
  } else {
    // bank the run: earn ★ stars for the Workshop and update the high-water mark
    const survived = run.shiftNum - 1;
    const hazard = 1 + 0.25 * save.meta.hazardPay;          // Hazard Pay boosts earnings
    const earned = Math.floor((survived * 2 + Math.floor(run.totalDelivered / 4)) * hazard);
    game.starsEarned = earned;
    save.stars += earned;
    save.best.shifts = Math.max(save.best.shifts, survived);
    save.best.delivered = Math.max(save.best.delivered, run.totalDelivered);
    persist();
    game.state = 'FIRED';
    game.doneT = 0;
    sfx.fired();
  }
}

// ──────────────────────────────────────────────────────────────── input

const keys = new Set();
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' ||
      k === 'arrowright') e.preventDefault();
  sfx.resume();
  if (!e.repeat) handleKey(k);
  keys.add(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

function handleKey(k) {
  const st = menu || (game ? game.state : 'TITLE');

  if (st === 'WORKSHOP') {
    if (k === 'enter' || k === 'escape' || k === 'm') { menu = null; return; }
    if (k >= '1' && k <= '9') { const i = parseInt(k, 10) - 1; if (i < META.length) buyMeta(META[i]); }
    return;
  }
  if (st === 'TITLE') {
    if (k === ' ' || k === 'enter') { run = newRun(); startShift(); }
    if (k === 'm') { menu = 'WORKSHOP'; }
    return;
  }
  if (st === 'FIRED') {
    if (k === ' ' || k === 'enter') { menu = null; game.state = 'TITLE'; }
    if (k === 'm') { menu = 'WORKSHOP'; }
    return;
  }
  if (st === 'SHIFT_DONE') {
    if (k === ' ' || k === 'enter') openShop();
    return;
  }
  if (st === 'SHOP') {
    if (k === 'enter') { startShift(); return; }
    if (k >= '1' && k <= '9') {
      const i = parseInt(k, 10) - 1;
      if (i < shop.hand.length) buyUpgrade(shop.hand[i]);
    }
    if (k === 'f') buyFuse();
    if (k === 'z') buySpecial(shop.offers[0]);
    if (k === 'x') buySpecial(shop.offers[1]);
    if (k === 'r') rerollShop();
    return;
  }
  if (st === 'PLAYING') {
    if (k === ' ') toggleDoors();
    if (k === 'r') { run = newRun(); startShift(); }
  }
}

function toggleDoors() {
  const e = game.elev;
  // Door Interlock: fumbling mid-travel is simply ignored instead of jamming
  if (Math.abs(e.v) > CFG.stopSpeed) { if (game.m.interlock) return; jam(); return; }
  if (e.doorTarget === 0) {
    if (!isAligned()) { if (game.m.interlock) return; jam(); return; }
    e.doorTarget = 1;
    sfx.door();
  } else {
    e.doorTarget = 0;
    sfx.door();
  }
}
function jam() {
  game.elev.jamFlash = 0.35;
  flash('#aa3a32', 0.18);
  shake(5);
  sfx.buzz();
}

// ── mouse (title / shop / done buttons) ──
const buttons = [];   // {x,y,w,h,fn} rebuilt each render for clickable screens
canvas.addEventListener('click', ev => {
  sfx.resume();
  const r = canvas.getBoundingClientRect();
  const mx = (ev.clientX - r.left) * (W / r.width);
  const my = (ev.clientY - r.top) * (H / r.height);
  for (const b of buttons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { b.fn(); return; }
  }
});

// ────────────────────────────────────────────────────────────── helpers

function activeMaxIdx() { return game.floors.length - 1; }
function nearestFloorIdx(y) {
  return Math.max(0, Math.min(activeMaxIdx(), Math.round(y / CFG.floorHeight)));
}
function isAligned() {
  const tol = (game.m && game.m.alignTol) || CFG.alignTolerance;
  if (game.spider && game.spider.open &&
      Math.abs(game.elev.y - SPIDER_Y) < tol) return true;
  const i = nearestFloorIdx(game.elev.y);
  return Math.abs(game.elev.y - i * CFG.floorHeight) < tol;
}
function isStopped() { return Math.abs(game.elev.v) < CFG.stopSpeed; }
function doorsOpen() { return game.elev.doors > 0.92; }
function flash(color, t = 0.25) { game.flash = { color, t, max: t }; }
function shake(amt) { game.shake = Math.max(game.shake, amt); }
function ridersAboard() { return game.passengers.filter(p => p.state === 'riding').length; }
function slotsAboard() {
  let s = 0;
  for (const p of game.passengers) if (p.state === 'riding') s += p.size || 1;
  return s;
}

// ── juice: particle bursts + floating text (screen space) ──
function cabinScreen() { return { x: (SHAFT_LEFT + SHAFT_RIGHT) / 2, y: CENTER_Y }; }
function burst(e, color, n = 12) {
  const c = cabinScreen();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 130;
    game.particles.push({ x: c.x + (Math.random() - 0.5) * 50, y: c.y + (Math.random() - 0.5) * 36,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, life: 0, max: 0.5 + Math.random() * 0.45,
      color, size: 2 + Math.random() * 2.5 });
  }
}
function floatText(text, color) {
  const c = cabinScreen();
  game.floaters.push({ x: c.x + (Math.random() - 0.5) * 24, y: c.y - 44, vy: -48, life: 0, max: 1.2, text, color });
}
function updateFx(dt) {
  if (game.particles) {
    for (const p of game.particles) { p.life += dt; p.vy += 250 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    game.particles = game.particles.filter(p => p.life < p.max);
  }
  if (game.floaters) {
    for (const f of game.floaters) { f.life += dt; f.y += f.vy * dt; f.vy *= Math.pow(0.5, dt * 60); }
    game.floaters = game.floaters.filter(f => f.life < f.max);
  }
}

function spawnPassenger() {
  const fx = game.fx;
  // destination: uniform, or biased to the upper floors under "EVERYONE UP"
  const top = activeMaxIdx();
  let dest;
  if (fx.destHigh && top >= 2) {
    const lo = Math.max(1, Math.ceil(top * 0.55));
    dest = lo + Math.floor(Math.random() * (top - lo + 1));
  } else {
    dest = 1 + Math.floor(Math.random() * top);
  }

  // pick a kind by weight (modifiers + Lucky Cabin tilt the odds)
  const weights = {
    normal:  10,
    vip:     2.6 * game.m.vipRate * fx.vipMul,
    nervous: 1.4 * fx.nervousMul,
    tipper:  1.2 * fx.tipperMul,
    mover:   1.0 * fx.moverMul,
  };
  let total = 0; for (const k in weights) total += weights[k];
  let r = Math.random() * total, kind = 'normal';
  for (const k in weights) { r -= weights[k]; if (r <= 0) { kind = k; break; } }

  let pat = game.m.patience * game.patMul;
  if (kind === 'nervous') pat *= 0.6;
  game.passengers.push({
    id: game.nextId++,
    dest,
    kind,
    vip: kind === 'vip',
    size: kind === 'mover' ? 2 : 1,    // movers hog two cabin slots
    state: 'waiting',
    patience: pat,
    patienceMax: pat,
    reveal: 0,           // remember-timer once aboard
    bob: Math.random() * Math.PI * 2,
    skin: Math.floor(Math.random() * 4),
    coat: Math.floor(Math.random() * 5),
    hat: Math.random() < 0.4 ? Math.floor(Math.random() * 3) : -1,
    x: 0, tx: 0,         // smoothed screen x for shuffling in line
  });
}

// ────────────────────────────────────────────────────────────── update

function update(dt) {
  if (game && game.flash) { game.flash.t -= dt; if (game.flash.t <= 0) game.flash = null; }
  if (game && game.shake > 0) game.shake = Math.max(0, game.shake - dt * 25);
  if (game && game.elev) game.elev.jamFlash = Math.max(0, game.elev.jamFlash - dt);
  if (game && game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
  if (game && (game.state === 'SHIFT_DONE' || game.state === 'FIRED')) game.doneT += dt;
  if (game) updateFx(dt);   // particles / floating text decay in every state

  if (game && game.state === 'SPIDER') { updateSpider(dt); return; }
  if (!game || game.state !== 'PLAYING') return;
  game.t += dt;
  game.shiftTime += dt;
  if (game.introT > 0) game.introT = Math.max(0, game.introT - dt);
  const e = game.elev;
  const m = game.m;

  // ── Spider Floor: opens for a window, then the webs recede ──
  const sp = game.spider;
  if (sp.glow > 0 && !sp.open) sp.glow = Math.max(0, sp.glow - dt);
  if (!sp.open && !sp.used) {
    sp.cooldown -= dt;
    if (sp.cooldown <= 0 && (run.shiftNum >= 2 || game.fx.forceSpider) && game.delivered < game.quota - 1) {
      sp.open = true; sp.window = 13;
      game.banner = { text: '▓ THE SPIDER FLOOR IS OPEN — CRANK BELOW THE LOBBY ▓', t: 2.4, color: '#b46adc' };
      sfx.spider();
    }
  } else if (sp.open) {
    sp.glow = Math.min(1, sp.glow + dt * 3);
    sp.window -= dt;
    if (sp.window <= 0) { sp.open = false; sp.used = true; }
  }

  // ── active power-ups decay; fold their effects into this frame ──
  for (const k in game.power) if (game.power[k] > 0) game.power[k] = Math.max(0, game.power[k] - dt);
  const expr   = game.power.express > 0;
  const maxS   = m.maxSpeed * (expr ? 1.55 : 1);
  const accelE = m.accel    * (expr ? 1.40 : 1);
  const patDrain = game.power.freeze > 0 ? 0.30 : 1;
  const autoLevelOn = m.autoLevel || game.power.magnet > 0;

  // ── motion ──
  const canMove = e.doors < 0.02 && e.doorTarget === 0;
  let input = 0;
  if (canMove) {
    if (keys.has('arrowup') || keys.has('w')) input += 1;
    if (keys.has('arrowdown') || keys.has('s')) input -= 1;
  }
  if (input !== 0) {
    // cranking with the grain accelerates; against it, the reverse-crank brakes
    const braking = Math.sign(input) !== Math.sign(e.v) && Math.abs(e.v) > 1;
    const brakeA = m.brakeAccel * (game.brakeBoost || 1);
    e.v += input * (braking ? brakeA : accelE) * dt;
  } else {
    // no input: a heavy flywheel. Barely any drag, so momentum carries you —
    // letting go does NOT stop you. "SLIPPERY CABLES" makes it glide even more.
    const baseCoast = game.m.coastFriction;   // Flywheel Damper lowers this (more drag)
    const coastF = baseCoast + (0.9994 - baseCoast) * game.fx.coast;
    e.v *= Math.pow(coastF, dt * 60);
    if (Math.abs(e.v) < CFG.settleBelow) e.v *= Math.pow(CFG.settleFriction, dt * 60);
    if (Math.abs(e.v) < 0.6) e.v = 0;
  }
  e.v = Math.max(-maxS, Math.min(maxS, e.v));

  // auto-leveling: when coasting slowly near a floor, the car finds it
  if (autoLevelOn && input === 0 && Math.abs(e.v) < 140) {
    const i = nearestFloorIdx(e.y);
    const target = i * CFG.floorHeight;
    const d = target - e.y;
    if (Math.abs(d) < CFG.floorHeight * 0.45) {
      e.y += d * Math.min(1, 9 * dt);
      e.v *= Math.pow(0.55, dt * 60);
      if (Math.abs(d) < 0.6 && Math.abs(e.v) < 6) { e.y = target; e.v = 0; }
    }
  }
  e.y += e.v * dt;

  const minY = sp.open ? SPIDER_Y : 0;       // the shaft only opens downward when the webs do
  const maxY = activeMaxIdx() * CFG.floorHeight;
  if (e.y < minY) { if (e.v < -40) { shake(Math.min(8, -e.v / 30)); sfx.thud(); } e.y = minY; e.v = 0; }
  if (e.y > maxY) { if (e.v >  40) { shake(Math.min(8,  e.v / 30)); sfx.thud(); } e.y = maxY; e.v = 0; }

  // doors
  const rate = 1 / m.doorTime;
  if (e.doors < e.doorTarget) e.doors = Math.min(1, e.doors + rate * dt);
  if (e.doors > e.doorTarget) e.doors = Math.max(0, e.doors - rate * dt);

  // "ready" ding on the rising edge of aligned+stopped
  const ready = isAligned() && isStopped();
  if (ready && !e.wasReady) sfx.ding();
  e.wasReady = ready;

  // Proximity Chime: a soft tick as you approach a floor someone aboard wants
  game.chimeCool = Math.max(0, (game.chimeCool || 0) - dt);
  if (m.chime && Math.abs(e.v) > CFG.stopSpeed) {
    let near = Infinity;
    for (const p of game.passengers)
      if (p.state === 'riding') near = Math.min(near, Math.abs(e.y - p.dest * CFG.floorHeight));
    if (near < 34 && game.chimeCool <= 0) { sfx.near(); game.chimeCool = 0.45; }
  }

  // step off into the Spider Floor: park at the webbed depth and open up
  if (sp.open && Math.abs(e.y - SPIDER_Y) < CFG.alignTolerance && isStopped() && doorsOpen()) {
    enterSpider(); return;
  }

  // ── spawns ──
  game.spawnTimer -= dt;
  const lobbyWaiting = game.passengers.filter(p => p.state === 'waiting').length;
  if (game.spawnTimer <= 0 && lobbyWaiting < 7) {
    spawnPassenger();
    game.spawnTimer = game.spawnInterval * (0.8 + Math.random() * 0.4);
  }

  // ── passengers ──
  const ci = nearestFloorIdx(e.y);
  const aligned = isAligned();
  const open = doorsOpen();
  const cap = capacityNow();

  // Auto Doors: open themselves when you stop at a floor that needs you
  if (m.autoDoors && aligned && isStopped() && e.doorTarget === 0) {
    const wantsHere = game.passengers.some(p => p.state === 'riding' && p.dest === ci);
    const lobbyJob = ci === 0 && slotsAboard() < cap && game.passengers.some(p => p.state === 'waiting');
    if (wantsHere || lobbyJob) { e.doorTarget = 1; sfx.door(); }
  }

  // board: at lobby, aligned, open, with room — FIFO by arrival (movers take 2 slots)
  if (ci === 0 && aligned && open) {
    const waiting = game.passengers.filter(p => p.state === 'waiting');
    for (const p of waiting) {
      if (slotsAboard() + p.size > cap) continue;   // won't fit — skip, try the next
      p.state = 'riding';
      p.reveal = CFG.rememberTime;
      // patience resets to the (often kinder) ride pool when they board
      p.patience = game.m.ridePat * game.patMul * (p.kind === 'nervous' ? 0.6 : 1);
      p.patienceMax = p.patience;
      sfx.board();
    }
  }

  for (const p of game.passengers) {
    p.bob += dt * 2.2;
    if (p.state === 'waiting') {
      p.patience -= dt * patDrain;
      if (p.patience <= 0) losePassenger(p);
    } else if (p.state === 'riding') {
      p.patience -= dt * patDrain;
      if (p.reveal > 0) p.reveal -= dt;
      if (open && aligned && ci === p.dest) {
        p.state = 'delivered';
        p.removeAt = game.t + 0.45;
        game.delivered++;
        run.totalDelivered++;
        let fare = Math.round(((game.power.double > 0 ? 2 : 1) + game.m.fareBonus) * game.fx.fareMul);
        if (p.kind === 'tipper') fare += 2;            // big tippers pad the fare
        if (game.m.surge && lobbyWaiting >= 4) fare += game.m.surge;   // Surge Pricing
        fare = Math.max(1, fare);
        run.parts += fare;
        game.partsThisShift += fare;
        const col = p.vip ? '#ffd44a' : p.kind === 'tipper' ? '#7affc0' : '#7aaa55';
        flash(col, 0.18);
        burst(e, col);                                  // particle pop at the cabin
        floatText(`+${fare} ◆`, col);
        if (p.kind === 'tipper') sfx.tip(); else sfx.chime();
        if (p.vip) grantPower();   // VIPs tip a temporary boon
      } else if (p.patience <= 0) {
        losePassenger(p);
      }
    }
  }
  game.passengers = game.passengers.filter(p => {
    if (p.state === 'delivered' || p.state === 'left') return (p.removeAt ?? 0) > game.t;
    return true;
  });

  if (game.strikes >= maxStrikes()) { endShift('fired'); return; }
  if (game.delivered >= game.quota) { endShift('quota'); return; }
}

function losePassenger(p) {
  p.state = 'left';
  p.removeAt = game.t + 0.7;
  if (game.m.apology && !game.apologyUsed) {   // Apology Notes: first walk-off each shift is free
    game.apologyUsed = true;
    flash('#9adf7a', 0.3);
    shake(4);
    floatText('APOLOGISED', '#9adf7a');
    sfx.buzz();
    game.banner = { text: 'WALK-OFF SMOOTHED OVER — APOLOGY NOTE', t: 1.4, color: '#9adf7a' };
    return;
  }
  if (run.fuses > 0) {           // a Spare Fuse eats the strike
    run.fuses--;
    flash('#d4a050', 0.3);
    shake(4);
    floatText('FUSE BLOWN', '#d4a050');
    sfx.buzz();
    game.banner = { text: 'WALK-OFF — SPARE FUSE BLOWN', t: 1.4, color: '#d4a050' };
    return;
  }
  game.strikes++;
  flash('#aa3a32');
  shake(7);
  floatText('WALK-OFF', '#e0584a');
  burst(game.elev, '#aa3a32', 8);
  sfx.buzz();
  game.banner = { text: 'PASSENGER WALKED OFF', t: 1.2, color: '#aa3a32' };
}

// ────────────────────────────────────────────────────────── Spider Floor
// You step off onto a webbed ledge with a sword. Spiders rappel from the dark
// and crawl at you; cut them down for parts. Run out of hearts and they swarm
// you (lose your loot + a strike). Bolt back to the lift door whenever you like
// to carry out what you've earned. Greed vs. your own skin.

const PLAT_Y = H - 150, PLAT_LEFT = 120, PLAT_RIGHT = W - 120, DOOR_X = PLAT_LEFT + 4;

function enterSpider() {
  game.state = 'SPIDER';
  const assoc = save.meta.knownAssociate;
  game.spiderGame = {
    t: 0, result: null, exitT: 0,
    player: { x: W / 2, facing: 1, hp: 3, maxHp: 3, swing: 0, swingCool: 0, invuln: 0, hurtT: 0 },
    spiders: [], fx: [], loot: 0,
    spawnTimer: 1.0,
    spawnEvery: Math.max(1.1, 2.4 - run.shiftNum * 0.07),
    lootPerKill: 2 + (assoc >= 2 ? 1 : 0),
    spaceWas: false, hitFlash: 0, killed: 0,
  };
  sfx.spider();
}

function spawnWebSpider(sg) {
  const x = PLAT_LEFT + 30 + Math.random() * (PLAT_RIGHT - PLAT_LEFT - 60);
  sg.spiders.push({
    x, y: 30 + Math.random() * 30,
    vy: 70 + run.shiftNum * 3 + Math.random() * 40,
    dropAt: PLAT_Y - 70 - Math.random() * 120,
    crawl: 52 + run.shiftNum * 3.5 + Math.random() * 30,
    state: 'descend', sway: Math.random() * 6, dead: false, deadT: 0, vyDead: 0,
    size: 11 + Math.random() * 4, hitCool: 0,
  });
}
function spiderPop(sg, x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 120;
    sg.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: 0.5, color });
  }
}

function updateSpider(dt) {
  const sg = game.spiderGame;
  if (!sg) { game.state = 'PLAYING'; return; }
  sg.t += dt;
  if (sg.hitFlash > 0) sg.hitFlash -= dt;
  for (const f of sg.fx) { f.life += dt; f.vy += 240 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
  sg.fx = sg.fx.filter(f => f.life < f.max);

  if (sg.result) { sg.exitT += dt; if (sg.exitT > 1.6) exitSpider(); return; }
  const P = sg.player;

  // ── move ──
  let mx = 0;
  if (keys.has('arrowleft') || keys.has('a')) { mx -= 1; P.facing = -1; }
  if (keys.has('arrowright') || keys.has('d')) { mx += 1; P.facing = 1; }
  P.x = Math.max(PLAT_LEFT + 14, Math.min(PLAT_RIGHT - 14, P.x + mx * 250 * dt));

  // ── swing (edge-triggered) ──
  const space = keys.has(' ');
  P.swingCool = Math.max(0, P.swingCool - dt);
  if (space && !sg.spaceWas && P.swingCool <= 0) { P.swing = 0.22; P.swingCool = 0.30; sfx.sword(); }
  sg.spaceWas = space;
  if (P.swing > 0) P.swing -= dt;
  if (P.invuln > 0) P.invuln -= dt;
  if (P.hurtT > 0) P.hurtT -= dt;

  // ── bail out the lift door ──
  if ((keys.has('arrowup') || keys.has('w')) && P.x < DOOR_X + 50) { sg.result = 'bailed'; sfx.chime(); return; }

  // ── spawn waves, ramping the longer you linger ──
  sg.spawnTimer -= dt;
  if (sg.spawnTimer <= 0) {
    spawnWebSpider(sg);
    if (sg.t > 8 && Math.random() < 0.35) spawnWebSpider(sg);   // doubles up late
    sg.spawnTimer = sg.spawnEvery * (0.7 + Math.random() * 0.6);
    sg.spawnEvery = Math.max(0.5, sg.spawnEvery * 0.97);
  }

  // ── sword hitbox ──
  const swinging = P.swing > 0.05;
  const hx = P.x + P.facing * 30, hy = PLAT_Y - 22, reach = 48;

  for (const s of sg.spiders) {
    if (s.hitCool > 0) s.hitCool -= dt;
    if (s.dead) { s.deadT += dt; s.vyDead += 480 * dt; s.y += s.vyDead * dt; s.x += s.vxDead * dt; continue; }
    if (s.state === 'descend') {
      s.y += s.vy * dt; s.sway += dt * 4;
      if (s.y >= s.dropAt) s.state = 'drop';
    } else if (s.state === 'drop') {
      s.y += 300 * dt;
      if (s.y >= PLAT_Y - 12) { s.y = PLAT_Y - 12; s.state = 'crawl'; }
    } else if (s.state === 'crawl') {
      s.x += (Math.sign(P.x - s.x) || 1) * s.crawl * dt;
      s.sway += dt * 12;
      if (Math.abs(s.x - P.x) < 17 && P.invuln <= 0) {     // it reaches you
        P.hp--; P.invuln = 1.2; P.hurtT = 0.4; sg.hitFlash = 0.3;
        flash('#7a1030', 0.25); shake(9); sfx.hurt();
        s.x += (s.x < P.x ? -1 : 1) * 34; s.hitCool = 0.6;
      }
    }
    if (swinging && !s.dead && Math.abs(s.x - hx) < reach && Math.abs(s.y - hy) < 44) {
      s.dead = true; s.deadT = 0; s.vyDead = -160; s.vxDead = P.facing * 80;
      sg.loot += sg.lootPerKill; sg.killed++;
      spiderPop(sg, s.x, s.y, '#ff3a5a'); floatSpiderText(sg, s.x, s.y - 20, `+${sg.lootPerKill}`);
      sfx.slash();
    }
  }
  sg.spiders = sg.spiders.filter(s => !(s.dead && (s.deadT > 0.9 || s.y > H + 40)));

  if (P.hp <= 0 && !sg.result) { sg.result = 'caught'; shake(13); flash('#5a1a4a', 0.5); sfx.caught(); }
}
function floatSpiderText(sg, x, y, text) {
  sg.fx.push({ x, y, vx: 0, vy: -40, life: 0, max: 0.9, color: '#ffd44a', text });
}

function exitSpider() {
  const sg = game.spiderGame;
  if (sg.result === 'caught') {
    game.strikes++;
    game.banner = { text: 'THE SPIDERS GOT YOU — STRIKE!', t: 2.2, color: '#aa3a32' };
    flash('#5a1a4a', 0.4);
  } else { // bailed with whatever you carried out
    const got = Math.floor(sg.loot);
    run.parts += got; game.partsThisShift += got;
    game.banner = { text: got > 0 ? `CARRIED OUT +${got} ◆ (${sg.killed} slain)` : 'ESCAPED EMPTY-HANDED',
                    t: 2.2, color: '#ffd44a' };
  }
  // back up to the lobby; the webbed floor seals behind you
  game.spider.open = false; game.spider.used = true; game.spider.glow = 0;
  const e = game.elev;
  e.y = 0; e.v = 0; e.doors = 1; e.doorTarget = 1; e.wasReady = false;
  game.spiderGame = null;
  game.state = 'PLAYING';
}

// ──────────────────────────────────────────────────────────────── shop

// Rotating "specials" — a couple are offered each shop visit (shuffled), so the
// one-shot options you get differ run to run. Most prime the NEXT shift.
const SPECIALS = [
  { key: 'blueprint', name: 'Spare Blueprint', cost: 7,
    blurb: 'Install +1 level on a random fitting right now.',
    apply() { const o = UPGRADES.filter(u => run.up[u.key] < u.max);
              if (o.length) run.up[o[Math.floor(Math.random() * o.length)].key]++; } },
  { key: 'espresso',  name: 'Crate of Espresso', cost: 4,
    blurb: 'Next shift, the whole crowd starts more patient.',
    apply() { run.nextShift.patienceBoost = 1.4; } },
  { key: 'tipoff',    name: 'Spider Tip-Off', cost: 5,
    blurb: 'Next shift, the Spider Floor opens early for sure.',
    apply() { run.nextShift.guaranteedSpider = true; } },
  { key: 'charm',     name: 'Lucky Charm', cost: 5,
    blurb: 'Begin next shift with a random power-up running.',
    apply() { run.nextShift.startPower = true; } },
  { key: 'overtime',  name: 'Overtime Waiver', cost: 6,
    blurb: 'One extra strike — for the next shift only.',
    apply() { run.nextShift.extraStrike = 1; } },
  { key: 'grease',    name: 'Cable Grease', cost: 5,
    blurb: 'Next shift, a rebuilt brake — far easier stops.',
    apply() { run.nextShift.brakeBoost = 1.7; } },
];

// deal a fresh hand of upgrade choices (non-maxed only)
function dealHand() {
  const avail = UPGRADES.filter(u => run.up[u.key] < u.max);
  const size = Math.min(avail.length, 4 + (save.meta.bigShop || 0));
  return shuffle(avail).slice(0, size);
}
function openShop() {
  run.rerolls = save.meta.rerollToken || 0;   // free rerolls granted by the Workshop
  shop = { hand: dealHand(), offers: shuffle(SPECIALS).slice(0, 2), bought: {} };
  game.state = 'SHOP';
}
const REROLL_COST = 3;
function rerollShop() {
  if (run.rerolls > 0) run.rerolls--;
  else if (run.parts >= REROLL_COST) run.parts -= REROLL_COST;
  else { sfx.buzz(); return; }
  shop.hand = dealHand();
  shop.offers = shuffle(SPECIALS).slice(0, 2);
  shop.bought = {};
  sfx.buy();
}
function buySpecial(s) {
  if (!s || (shop.bought && shop.bought[s.key])) { sfx.buzz(); return; }
  if (run.parts < s.cost) { sfx.buzz(); return; }
  run.parts -= s.cost;
  s.apply();
  shop.bought[s.key] = true;
  sfx.buy();
}
function buyUpgrade(u) {
  const lvl = run.up[u.key];
  if (lvl >= u.max) { sfx.buzz(); return; }
  const cost = u.costs[lvl];
  if (run.parts < cost) { sfx.buzz(); return; }
  run.parts -= cost;
  run.up[u.key]++;
  sfx.buy();
}
const FUSE_COST = 6;
function buyFuse() {
  if (run.parts < FUSE_COST) { sfx.buzz(); return; }
  run.parts -= FUSE_COST;
  run.fuses++;
  sfx.buy();
}
// permanent Workshop perks, bought with ★ stars; saved to disk immediately
function buyMeta(m) {
  const lvl = save.meta[m.key];
  if (lvl >= m.max) { sfx.buzz(); return; }
  const cost = m.costs[lvl];
  if (save.stars < cost) { sfx.buzz(); return; }
  save.stars -= cost;
  save.meta[m.key]++;
  persist();
  sfx.buy();
}

// ════════════════════════════════════════════════════════════ RENDER

const SHAFT_LEFT = 230;
const SHAFT_RIGHT = 480;
const ROOM_LEFT = SHAFT_RIGHT;
const ROOM_RIGHT = 870;
const CENTER_Y = H / 2 + 10;

function worldToScreen(wy) { return CENTER_Y - (wy - game.elev.y); }

function render() {
  buttons.length = 0;
  const sh = (game && game.shake) || 0;
  const sx = (Math.random() - 0.5) * sh;
  const sy = (Math.random() - 0.5) * sh;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = '#0d0a08';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  const st = menu || (game ? game.state : 'TITLE');
  if (st !== lastScreen) { screenFade = 1; lastScreen = st; }   // fade-in on every screen change
  if (st === 'WORKSHOP')   drawWorkshop();
  else if (st === 'TITLE') drawTitle();
  else if (st === 'SHOP')  drawShop();
  else if (st === 'SPIDER') drawSpider();
  else {
    drawBuilding();
    drawCar();
    drawDarkness();          // POWER FLICKER / GRAVEYARD shadow over the shaft
    drawFx();                // particles + floating text
    drawHUD();
    drawVignette();
    if (game.flash) {
      ctx.fillStyle = game.flash.color;
      ctx.globalAlpha = (game.flash.t / game.flash.max) * 0.5;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (game.banner) drawBanner();
    if (game.introT > 0 && st === 'PLAYING') drawIntro();
    if (st === 'SHIFT_DONE') drawShiftDone();
    if (st === 'FIRED') drawFired();
  }

  if (screenFade > 0) {           // fade-in-from-black on screen changes
    ctx.fillStyle = `rgba(8,6,4,${screenFade})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    screenFade = Math.max(0, screenFade - 0.07);
  }
  ctx.restore();
}
let screenFade = 0, lastScreen = null;

// soft darkened edges for depth/mood
function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(24,10,0,0.36)');   // warm amber-tinted edges, not flat black
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// "POWER FLICKER" / "GRAVEYARD SHIFT" — the floors drop into shadow, on a flicker
function drawDarkness() {
  const d = game.fx.dark;
  if (d <= 0) return;
  const flicker = 0.78 + 0.22 * Math.sin(game.t * 13) * Math.sin(game.t * 4.3);
  ctx.fillStyle = `rgba(2,1,4,${d * flicker})`;
  ctx.fillRect(ROOM_LEFT, 0, W - ROOM_LEFT, H);
  // the cabin keeps a small pool of light around it
  const c = cabinScreen();
  const g = ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 260);
  g.addColorStop(0, `rgba(255,225,160,${0.10 * d})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawFx() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const f of game.floaters) {
    const k = f.life / f.max;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${15 + (1 - k) * 5}px ui-monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// the shift-start card: SHIFT N + any rolled conditions
function drawIntro() {
  const t = game.introT;
  const a = Math.min(1, t) * Math.min(1, (3.0 - t) * 2 + 0.4);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  ctx.fillStyle = 'rgba(10,8,6,0.82)';
  ctx.fillRect(0, H / 2 - 120, W, 240);
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px ui-monospace';
  ctx.fillText(`SHIFT ${run.shiftNum}`, W / 2, H / 2 - 58);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  ctx.fillText(`deliver ${game.quota} before three walk-offs`, W / 2, H / 2 - 24);

  if (game.modifiers.length === 0) {
    ctx.fillStyle = '#6a7a5a'; ctx.font = 'italic 15px ui-monospace';
    ctx.fillText('a calm, ordinary day', W / 2, H / 2 + 16);
  } else {
    let yy = H / 2 + 8;
    for (const md of game.modifiers) {
      const col = md.tone === 'good' ? '#7acf7a' : md.tone === 'bad' ? '#e0584a' : '#d8b24a';
      ctx.fillStyle = col; ctx.font = 'bold 19px ui-monospace';
      ctx.fillText(`◇ ${md.name} ◇`, W / 2, yy);
      ctx.fillStyle = '#9a8a6a'; ctx.font = '12px ui-monospace';
      ctx.fillText(md.desc, W / 2, yy + 18);
      yy += 46;
    }
  }
  ctx.restore();
}

function drawBuilding() {
  const th = run.theme;
  ctx.fillStyle = th.wall;
  ctx.fillRect(0, 0, SHAFT_LEFT, H);
  ctx.fillRect(ROOM_RIGHT, 0, W - ROOM_RIGHT, H);
  ctx.fillStyle = th.wallDark;
  for (let y = 0; y < H; y += 30) {
    const off = (Math.floor(y / 30) % 2) * 30;
    for (let x = 0; x < SHAFT_LEFT; x += 60) ctx.fillRect(x + off, y, 28, 28);
    for (let x = ROOM_RIGHT; x < W; x += 60) ctx.fillRect(x + off, y, 28, 28);
  }
  // shaft
  ctx.fillStyle = th.shaft;
  ctx.fillRect(SHAFT_LEFT, 0, SHAFT_RIGHT - SHAFT_LEFT, H);
  ctx.strokeStyle = th.col;
  ctx.lineWidth = 2;
  for (const x of [SHAFT_LEFT + 14, SHAFT_RIGHT - 14]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // motes of dust drifting down the shaft — quiet atmosphere
  const span = SHAFT_RIGHT - SHAFT_LEFT - 24;
  for (let i = 0; i < 22; i++) {
    const x = SHAFT_LEFT + 12 + (i * 67.3) % span + Math.sin(game.t * 0.5 + i) * 3;
    const y = (game.t * 7 + i * 41) % (H + 20) - 10;
    ctx.fillStyle = `rgba(200,180,130,${0.05 + 0.04 * (i % 3)})`;
    ctx.fillRect(x, y, 2, 2);
  }

  for (const f of game.floors) drawFloor(f, worldToScreen(game.floors.indexOf(f) * CFG.floorHeight));

  // the Spider Floor landing, glowing below the lobby when the webs are open
  if (game.spider.glow > 0) drawSpiderLanding(worldToScreen(SPIDER_Y));

  ctx.strokeStyle = '#15100c';
  ctx.lineWidth = 1;
  for (let i = 0; i < game.floors.length; i++) {
    const sy = worldToScreen(i * CFG.floorHeight - CFG.floorHeight / 2);
    ctx.beginPath(); ctx.moveTo(SHAFT_LEFT, sy); ctx.lineTo(SHAFT_RIGHT, sy); ctx.stroke();
  }

  // downward "go here" arrow when the floor is open and you're above it
  if (game.spider.open) {
    const a = 0.4 + 0.4 * Math.sin(game.t * 5);
    const ax = (SHAFT_LEFT + SHAFT_RIGHT) / 2;
    const ay = Math.min(H - 70, worldToScreen(SPIDER_Y) - 90);
    ctx.fillStyle = `rgba(180,106,220,${a})`;
    ctx.beginPath();
    ctx.moveTo(ax - 12, ay); ctx.lineTo(ax + 12, ay); ctx.lineTo(ax, ay + 16);
    ctx.closePath(); ctx.fill();
  }
}

function drawSpiderLanding(sy) {
  const g = game.spider.glow;
  const top = sy - CFG.floorHeight / 2, bot = sy + CFG.floorHeight / 2;
  // dark webbed room on the lobby side
  ctx.fillStyle = '#140c14';
  ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight);
  ctx.fillStyle = `rgba(90,30,90,${0.18 * g})`;
  ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight);
  ctx.fillStyle = '#241018';
  ctx.fillRect(ROOM_LEFT, bot - 8, ROOM_RIGHT - ROOM_LEFT, 8);

  // cobwebs in the corners
  ctx.strokeStyle = `rgba(180,160,190,${0.4 * g})`;
  ctx.lineWidth = 1;
  for (const [ox, dir] of [[ROOM_LEFT + 6, 1], [ROOM_RIGHT - 6, -1]]) {
    for (let r = 12; r < 80; r += 14) {
      ctx.beginPath(); ctx.moveTo(ox, top + 6); ctx.lineTo(ox + dir * r, top + 6 + r); ctx.stroke();
    }
    for (let k = 1; k <= 4; k++) {
      ctx.beginPath();
      ctx.moveTo(ox + dir * (k * 16), top + 6);
      ctx.lineTo(ox, top + 6 + k * 16); ctx.stroke();
    }
  }
  // a couple of glowing eyes in the dark
  const ex = (ROOM_LEFT + ROOM_RIGHT) / 2 + 30;
  ctx.fillStyle = `rgba(220,60,120,${0.7 * g})`;
  ctx.beginPath(); ctx.arc(ex - 6, sy, 3, 0, 7); ctx.arc(ex + 6, sy, 3, 0, 7); ctx.fill();
  ctx.fillStyle = `rgba(180,106,220,${g})`;
  ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('? ? ?', ROOM_LEFT + 90, sy - 44);

  // glowing shaft opening
  ctx.fillStyle = `rgba(90,20,80,${0.5 * g})`;
  ctx.fillRect(SHAFT_LEFT, top, SHAFT_RIGHT - SHAFT_LEFT, CFG.floorHeight);
}

function drawFloor(f, sy) {
  const idx = game.floors.indexOf(f);
  const top = sy - CFG.floorHeight / 2;
  const bot = sy + CFG.floorHeight / 2;
  if (bot < -40 || top > H + 40) return;

  const th = run.theme;
  ctx.fillStyle = th.room;
  ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight);
  // a small warm pool of light under each ceiling lamp — depth, not a flood
  const lx = ROOM_LEFT + (ROOM_RIGHT - ROOM_LEFT) * 0.62;
  const lg = ctx.createRadialGradient(lx, top + 4, 4, lx, top + 4, 96);
  lg.addColorStop(0, th.light || 'rgba(255,210,140,0.13)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight * 0.7);
  // the lamp itself
  ctx.fillStyle = 'rgba(255,228,170,0.85)'; ctx.fillRect(lx - 9, top + 3, 18, 3);
  ctx.fillStyle = th.slab;
  ctx.fillRect(ROOM_LEFT, bot - 8, ROOM_RIGHT - ROOM_LEFT, 8);
  ctx.fillStyle = th.ceil;
  ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, 6);

  // no painted floor number — you navigate by the landmark alone (the building
  // has no display). The Floor Counter upgrade is the only way to read a number.
  drawLandmark(f, (ROOM_LEFT + ROOM_RIGHT) / 2 + 40, sy);

  ctx.strokeStyle = th.slab;
  ctx.lineWidth = 2;
  ctx.strokeRect(ROOM_LEFT + 4, top + 8, 60, CFG.floorHeight - 16);

  if (idx === 0) {
    const waiting = game.passengers.filter(p => p.state === 'waiting');
    let px = ROOM_LEFT + 96;
    for (const p of waiting) {
      p.tx = px;
      p.x = p.x ? p.x + (p.tx - p.x) * 0.2 : p.tx;
      drawPassenger(p, p.x, bot - 8, 'waiting');
      px += 52;
      if (px > ROOM_RIGHT - 24) break;
    }
  }
}

function drawLandmark(f, x, y) {
  ctx.save();
  switch (f.acc) {
    case 'lobby':
      ctx.fillStyle = '#5a4530'; ctx.fillRect(x - 80, y + 48, 160, 6);
      ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 14px ui-monospace'; ctx.textAlign = 'center';
      ctx.fillText('★ LOBBY ★', x, y + 30);
      ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 92, y + 30, 14, 18);
      ctx.fillStyle = '#3a5a28'; ctx.beginPath(); ctx.arc(x - 85, y + 22, 11, 0, 7); ctx.fill();
      break;
    case 'red':
      ctx.fillStyle = '#d23f2c'; ctx.fillRect(x, y - 40, 60, 80);
      ctx.fillStyle = '#8a2418'; ctx.fillRect(x, y - 40, 6, 80);
      ctx.fillStyle = '#ffd44a'; ctx.beginPath(); ctx.arc(x + 50, y, 3, 0, 7); ctx.fill();
      break;
    case 'plant':
      ctx.fillStyle = '#9a5e2e'; ctx.fillRect(x + 10, y + 20, 36, 36);
      ctx.fillStyle = '#46a634'; ctx.beginPath(); ctx.ellipse(x + 28, y + 5, 26, 32, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#62c84a'; ctx.beginPath(); ctx.ellipse(x + 18, y - 8, 14, 18, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#8ae060'; ctx.beginPath(); ctx.ellipse(x + 38, y - 4, 10, 14, -0.4, 0, 7); ctx.fill();
      break;
    case 'fire':
      ctx.fillStyle = '#e2402c'; ctx.fillRect(x + 20, y + 5, 22, 50);
      ctx.fillStyle = '#1a1410'; ctx.fillRect(x + 24, y - 4, 14, 10);
      ctx.fillStyle = '#ffe07a'; ctx.fillRect(x + 22, y + 18, 18, 4);
      break;
    case 'art':
      ctx.fillStyle = '#caa33a'; ctx.fillRect(x - 10, y - 40, 70, 56);
      ctx.fillStyle = '#9a58da'; ctx.fillRect(x - 5, y - 35, 60, 46);
      ctx.fillStyle = '#ff9a40'; ctx.beginPath(); ctx.arc(x + 14, y - 6, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#40c0d0'; ctx.fillRect(x + 30, y - 28, 18, 30);
      break;
    case 'blue':
      ctx.fillStyle = '#2f6ae0'; ctx.fillRect(x, y - 40, 60, 80);
      ctx.fillStyle = '#1a3a8a'; ctx.fillRect(x, y - 40, 6, 80);
      ctx.fillStyle = '#ffd44a'; ctx.beginPath(); ctx.arc(x + 50, y, 3, 0, 7); ctx.fill();
      break;
    case 'crack':
      ctx.fillStyle = '#5a4632'; ctx.fillRect(x + 10, y - 50, 40, 100);
      ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x + 30, y - 50); ctx.lineTo(x + 42, y - 28); ctx.lineTo(x + 22, y - 8);
      ctx.lineTo(x + 38, y + 18); ctx.lineTo(x + 24, y + 42); ctx.stroke();
      break;
    case 'clock':
      ctx.fillStyle = '#f0e0c0'; ctx.beginPath(); ctx.arc(x + 28, y - 6, 24, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 28, y - 6, 24, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#b23030'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x + 28, y - 6); ctx.lineTo(x + 28, y - 24);
      ctx.moveTo(x + 28, y - 6); ctx.lineTo(x + 42, y - 6); ctx.stroke();
      break;
    case 'vend':
      ctx.fillStyle = '#d23f2c'; ctx.fillRect(x + 6, y - 44, 44, 88);
      ctx.fillStyle = '#101418'; ctx.fillRect(x + 12, y - 38, 22, 50);
      ctx.fillStyle = '#ffd44a'; ctx.fillRect(x + 38, y - 30, 8, 30);
      const vcol = ['#ff6a4a', '#4ad0ff', '#8ae060'];
      for (let i = 0; i < 3; i++) { ctx.fillStyle = vcol[i]; ctx.fillRect(x + 15, y - 34 + i * 14, 16, 8); }
      break;
    case 'green':
      ctx.fillStyle = '#37a83a'; ctx.fillRect(x, y - 40, 60, 80);
      ctx.fillStyle = '#1f6a24'; ctx.fillRect(x, y - 40, 6, 80);
      ctx.fillStyle = '#ffd44a'; ctx.beginPath(); ctx.arc(x + 50, y, 3, 0, 7); ctx.fill();
      break;
    case 'window':
      ctx.fillStyle = '#3f74c0'; ctx.fillRect(x, y - 46, 64, 92);
      ctx.fillStyle = '#9ad0ff'; ctx.fillRect(x, y - 46, 64, 30);   // bright sky band
      ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 3;
      ctx.strokeRect(x, y - 46, 64, 92);
      ctx.beginPath(); ctx.moveTo(x + 32, y - 46); ctx.lineTo(x + 32, y + 46);
      ctx.moveTo(x, y); ctx.lineTo(x + 64, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,245,210,0.35)';
      ctx.beginPath(); ctx.moveTo(x + 4, y - 42); ctx.lineTo(x + 28, y - 42); ctx.lineTo(x + 4, y - 8); ctx.fill();
      break;
    case 'penthouse':
      ctx.fillStyle = '#b23a4a'; ctx.fillRect(x - 20, y + 22, 100, 8);   // red carpet
      ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 22px ui-monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ffd44a'; ctx.shadowBlur = 10;
      ctx.fillText('✦ PH ✦', x + 30, y); ctx.shadowBlur = 0;
      const pcol = ['#ff6a6a', '#ffd44a', '#7affc0', '#6ab8ff', '#d88aff'];
      for (let i = -2; i <= 2; i++) { ctx.fillStyle = pcol[i + 2]; ctx.beginPath(); ctx.arc(x + 30 + i * 12, y - 36, 2.4, 0, 7); ctx.fill(); }
      break;
    case 'mirror':
      ctx.fillStyle = '#b6d2da'; ctx.fillRect(x + 6, y - 44, 44, 88);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.moveTo(x + 10, y - 40); ctx.lineTo(x + 30, y - 40); ctx.lineTo(x + 10, y + 8); ctx.fill();
      ctx.strokeStyle = '#caa33a'; ctx.lineWidth = 3; ctx.strokeRect(x + 6, y - 44, 44, 88);
      break;
    case 'neon':
      ctx.fillStyle = '#ff5aa0'; ctx.font = 'bold 22px ui-monospace'; ctx.textAlign = 'center';
      ctx.shadowColor = '#ff5aa0'; ctx.shadowBlur = 14;
      ctx.fillText('OPEN', x + 30, y - 4);
      ctx.strokeStyle = '#5af0ff'; ctx.lineWidth = 2; ctx.shadowColor = '#5af0ff';
      ctx.strokeRect(x + 4, y - 22, 56, 36); ctx.shadowBlur = 0;
      break;
    case 'pipes':
      ctx.strokeStyle = '#3aa890'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 46); ctx.lineTo(x + 8, y + 10); ctx.lineTo(x + 40, y + 10); ctx.lineTo(x + 40, y + 46);
      ctx.moveTo(x + 24, y - 46); ctx.lineTo(x + 24, y - 12); ctx.lineTo(x + 52, y - 12);
      ctx.stroke();
      ctx.fillStyle = '#e2402c'; ctx.beginPath(); ctx.arc(x + 8, y + 10, 5, 0, 7); ctx.fill();   // red valve
      break;
    case 'cat':
      ctx.fillStyle = '#e08a3a'; // a ginger cat curled on the floor
      ctx.beginPath(); ctx.ellipse(x + 28, y + 30, 20, 11, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 12, y + 26, 8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 7, y + 20); ctx.lineTo(x + 9, y + 14); ctx.lineTo(x + 13, y + 20);
      ctx.moveTo(x + 13, y + 20); ctx.lineTo(x + 16, y + 14); ctx.lineTo(x + 19, y + 20); ctx.fill();
      ctx.fillStyle = '#c4762e'; ctx.fillRect(x + 30, y + 24, 4, 12); ctx.fillRect(x + 38, y + 22, 4, 14); // stripes
      ctx.strokeStyle = '#e08a3a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 46, y + 30); ctx.quadraticCurveTo(x + 58, y + 24, x + 52, y + 14); ctx.stroke();
      ctx.fillStyle = '#c83a5a'; ctx.fillRect(x + 5, y + 30, 14, 2);   // collar
      ctx.fillStyle = '#6cd84a'; ctx.beginPath(); ctx.arc(x + 10, y + 25, 1.6, 0, 7); ctx.arc(x + 15, y + 25, 1.6, 0, 7); ctx.fill();
      break;
    case 'aquarium':
      ctx.fillStyle = '#1a7aaa'; ctx.fillRect(x + 4, y - 30, 56, 60);
      ctx.fillStyle = 'rgba(150,225,245,0.35)'; ctx.fillRect(x + 4, y - 30, 56, 18);
      ctx.strokeStyle = '#caa33a'; ctx.lineWidth = 3; ctx.strokeRect(x + 4, y - 30, 56, 60);
      ctx.fillStyle = '#ff8030';
      ctx.beginPath(); ctx.ellipse(x + 26, y - 4, 6, 4, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 32, y - 4); ctx.lineTo(x + 38, y - 8); ctx.lineTo(x + 38, y); ctx.fill();
      ctx.fillStyle = '#ffd44a';
      ctx.beginPath(); ctx.ellipse(x + 42, y + 10, 5, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4ae0a0'; ctx.fillRect(x + 14, y + 6, 4, 22); ctx.fillRect(x + 48, y + 2, 4, 26);
      break;
  }
  ctx.restore();
}

function drawCar() {
  const cx = (SHAFT_LEFT + SHAFT_RIGHT) / 2;
  const cy = CENTER_Y;
  const w = CFG.carWidth, h = CFG.carHeight;
  const left = cx - w / 2, top = cy - h / 2;

  // a soft warm glow the cabin casts into the shaft — the lift is the warmest thing here
  const halo = ctx.createRadialGradient(cx, cy, 24, cx, cy, 150);
  halo.addColorStop(0, 'rgba(255,200,120,0.10)');
  halo.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = halo; ctx.fillRect(SHAFT_LEFT, cy - 150, SHAFT_RIGHT - SHAFT_LEFT, 300);

  ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, top);
  ctx.moveTo(cx, top + h); ctx.lineTo(cx, H); ctx.stroke();

  ctx.fillStyle = game.elev.jamFlash > 0 ? '#9a4a32' : '#6a5238';
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#42301e';
  ctx.fillRect(left + 4, top + 4, w - 8, h - 8);
  ctx.save();
  ctx.shadowColor = '#ffdd99'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffe6b0';
  ctx.fillRect(cx - 18, top + 6, 36, 4);
  ctx.restore();
  const grad = ctx.createLinearGradient(0, top, 0, top + h);
  grad.addColorStop(0, 'rgba(255,222,150,0.16)');
  grad.addColorStop(1, 'rgba(255,222,150,0)');
  ctx.fillStyle = grad; ctx.fillRect(left + 4, top + 4, w - 8, h - 8);

  const m = game.m;

  // riders stand inside the cutaway cabin (drawn first; the doors frost over
  // them when shut, which is exactly what makes their floor-tags hard to read).
  // Spacing is slot-based so a mover (2 slots) gets room for its luggage.
  const riders = game.passengers.filter(p => p.state === 'riding');
  const cap = capacityNow();
  const usedSlots = riders.reduce((s, p) => s + (p.size || 1), 0);
  const slots = Math.max(usedSlots, cap);
  const stepX = (w - 52) / Math.max(1, slots);
  let slot = 0;
  for (const p of riders) {
    const sz = p.size || 1;
    drawPassenger(p, left + 26 + (slot + sz / 2) * stepX, top + h - 10, 'riding');
    slot += sz;
  }

  // CABIN FULL flag — so it's obvious why the lobby keeps piling up
  if (usedSlots >= cap) {
    const waiting = game.passengers.some(s => s.state === 'waiting');
    if (waiting && nearestFloorIdx(game.elev.y) === 0) {
      ctx.fillStyle = `rgba(170,58,50,${0.55 + 0.25 * Math.sin(game.t * 6)})`;
      ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CABIN FULL', cx, top - 12);
    }
  }

  // sliding doors — translucent "frosted glass" so the interior is always
  // visible (dimmed when shut), but the bright readout still punches through
  const d = game.elev.doors;
  const panelW = (w - 8) / 2;
  const opened = panelW * d;
  ctx.save();
  ctx.globalAlpha = 0.74;
  ctx.fillStyle = '#6a5436';
  ctx.fillRect(left + 4, top + 14, panelW - opened, h - 22);
  ctx.fillRect(left + 4 + panelW + opened, top + 14, panelW - opened, h - 22);
  ctx.restore();
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1;
  ctx.strokeRect(left + 4.5, top + 14.5, panelW - opened - 1, h - 23);
  ctx.strokeRect(left + 4.5 + panelW + opened, top + 14.5, panelW - opened - 1, h - 23);

  // floor-counter readout (an upgrade) — an LED that reads through the glass
  if (m.floorCounter > 0) {
    const show = m.floorCounter >= 2 || Math.abs(game.elev.v) < 60;
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(cx - 22, top + 11, 44, 22);
    ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 1; ctx.strokeRect(cx - 22, top + 11, 44, 22);
    ctx.font = 'bold 16px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (show) {
      ctx.fillStyle = '#ff8030';
      ctx.fillText(game.floors[nearestFloorIdx(game.elev.y)].label, cx, top + 22);
    } else {
      ctx.fillStyle = '#3a2a1c'; ctx.fillText('--', cx, top + 22);
    }
  }

  const ok = isAligned() && isStopped();
  ctx.fillStyle = ok ? '#7aaa55' : '#aa3a32';
  ctx.beginPath(); ctx.arc(left + w - 12, top + 12, 4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 2;
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);

  // Guidance Arrows: point toward the nearest floor a rider wants
  if (m.arrows) {
    let best = null, bestD = Infinity;
    for (const p of game.passengers) if (p.state === 'riding') {
      const d = p.dest * CFG.floorHeight - game.elev.y;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = d; }
    }
    if (best !== null && bestD > 6) {
      const up = best > 0;
      const ay = up ? top - 14 : top + h + 14;
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 6);
      ctx.fillStyle = `rgba(106,184,255,${0.5 + 0.5 * pulse})`;
      ctx.beginPath();
      if (up) { ctx.moveTo(cx - 11, ay + 7); ctx.lineTo(cx + 11, ay + 7); ctx.lineTo(cx, ay - 7); }
      else    { ctx.moveTo(cx - 11, ay - 7); ctx.lineTo(cx + 11, ay - 7); ctx.lineTo(cx, ay + 7); }
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawPassenger(p, x, footY, mode) {
  // panic jitter as patience runs out — you feel the urgency before the bar dies.
  // the nervous type trembles a little the whole time.
  const pfrac = p.patience / p.patienceMax;
  if (pfrac < 0.28) x += (Math.random() - 0.5) * (0.28 - pfrac) * 26;
  if (p.kind === 'nervous') x += (Math.random() - 0.5) * 1.6;
  const bob = Math.sin(p.bob) * 1.5;
  const fy = footY + bob;
  const skin = ['#d4a878', '#a87850', '#7a5838', '#5a3820'][p.skin];
  const coatByKind = { vip: '#e8c040', tipper: '#3aae6a', mover: '#a87a44', nervous: '#6a8ac8' };
  const coat = coatByKind[p.kind] || ['#4a82c0', '#b8506e', '#46985a', '#c08440', '#9560d8'][p.coat];

  // a mover hauls a suitcase
  if (p.kind === 'mover') {
    ctx.fillStyle = '#4a3420'; ctx.fillRect(x + 8, fy - 22, 14, 18);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1; ctx.strokeRect(x + 8.5, fy - 21.5, 13, 17);
    ctx.fillStyle = '#2a1c10'; ctx.fillRect(x + 12, fy - 26, 6, 4);
  }

  ctx.fillStyle = '#1a1410';
  ctx.fillRect(x - 6, fy - 12, 5, 12);
  ctx.fillRect(x + 1, fy - 12, 5, 12);
  ctx.fillStyle = coat;
  ctx.fillRect(x - 9, fy - 30, 18, 20);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(x, fy - 37, 7, 0, 7); ctx.fill();

  // a little face that emotes with patience: smile → worried → grimace
  ctx.fillStyle = '#1a1209';
  ctx.beginPath(); ctx.arc(x - 2.6, fy - 38, 1.1, 0, 7); ctx.arc(x + 2.6, fy - 38, 1.1, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1a1209'; ctx.lineWidth = 1; ctx.beginPath();
  if (pfrac > 0.55)      ctx.arc(x, fy - 35, 2.4, 0.15 * Math.PI, 0.85 * Math.PI);          // smile
  else if (pfrac > 0.28) { ctx.moveTo(x - 2.4, fy - 33.5); ctx.lineTo(x + 2.4, fy - 33.5); } // flat
  else                   ctx.arc(x, fy - 31.5, 2.4, 1.15 * Math.PI, 1.85 * Math.PI);        // frown
  ctx.stroke();

  if (p.kind === 'nervous') {                 // sweat bead
    ctx.fillStyle = 'rgba(150,200,230,0.8)';
    ctx.beginPath(); ctx.arc(x + 7, fy - 39 + (p.bob % 1) * 3, 1.6, 0, 7); ctx.fill();
  }
  if (p.kind === 'tipper') {                  // flashing a coin
    ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 9px ui-monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('◆', x + 11, fy - 20);
  }
  if (p.vip) {
    // little gold crown so you know who's worth chasing
    ctx.fillStyle = '#ffd44a';
    ctx.beginPath();
    ctx.moveTo(x - 7, fy - 44); ctx.lineTo(x - 7, fy - 50); ctx.lineTo(x - 3, fy - 46);
    ctx.lineTo(x, fy - 51); ctx.lineTo(x + 3, fy - 46); ctx.lineTo(x + 7, fy - 50);
    ctx.lineTo(x + 7, fy - 44); ctx.closePath(); ctx.fill();
  } else if (p.hat >= 0 && p.kind !== 'mover' && p.kind !== 'tipper' && p.kind !== 'nervous') {
    ctx.fillStyle = ['#1a1410', '#882018', '#bfa45f'][p.hat];
    ctx.fillRect(x - 8, fy - 44, 16, 3);
    ctx.fillRect(x - 5, fy - 49, 10, 6);
  }

  // floor tag
  const m = game.m;
  const destLabel = (game.floors[p.dest] || { label: '?' }).label;
  let txt;
  if (mode === 'waiting') { txt = destLabel; }
  else { // riding — fades to "?" from memory unless the Dispatch Board (or X-Ray) helps
    const remembered = m.dispatch || game.power.xray > 0 || p.reveal > 0;
    txt = remembered ? destLabel : '?';
  }
  const fading = mode === 'riding' && !m.dispatch && game.power.xray <= 0 && p.reveal > 0 && p.reveal < 1;
  ctx.globalAlpha = fading ? Math.max(0.35, p.reveal) : 1;
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(x - 13, fy - 64, 26, 14);
  ctx.strokeStyle = txt === '?' ? '#6a5030' : '#bfa45f';
  ctx.lineWidth = 1; ctx.strokeRect(x - 12.5, fy - 63.5, 25, 13);
  ctx.fillStyle = txt === '?' ? '#6a5030' : '#bfa45f';
  ctx.font = 'bold 11px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, fy - 57);
  ctx.globalAlpha = 1;

  // patience bar
  const pct = Math.max(0, p.patience / p.patienceMax);
  if (mode === 'waiting' || mode === 'riding') {
    ctx.fillStyle = '#2a201a';
    ctx.fillRect(x - 13, fy - 71, 26, 4);
    ctx.fillStyle = pct > 0.5 ? '#7aaa55' : pct > 0.25 ? '#d4a050' : '#aa3a32';
    ctx.fillRect(x - 13, fy - 71, 26 * pct, 4);
  }
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(13,10,8,0.85)';
  ctx.fillRect(0, 0, W, 36);
  ctx.font = 'bold 14px ui-monospace'; ctx.textBaseline = 'middle';

  ctx.textAlign = 'left'; ctx.fillStyle = '#bfa45f';
  ctx.fillText(`SHIFT ${run.shiftNum}`, 16, 18);
  ctx.fillText(`◆ ${run.parts}`, 110, 18);
  if (run.fuses > 0) { ctx.fillStyle = '#d4a050'; ctx.fillText(`FUSE ${run.fuses}`, 180, 18); }

  // quota progress
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bfa45f';
  ctx.fillText(`DELIVERED ${game.delivered} / ${game.quota}`, W / 2, 18);

  ctx.textAlign = 'right';
  const remaining = maxStrikes() - game.strikes;
  const dots = '●'.repeat(Math.max(0, remaining)) + '○'.repeat(game.strikes);
  ctx.fillStyle = remaining <= 1 ? '#aa3a32' : '#bfa45f';
  ctx.fillText(dots, W - 16, 18);

  // crank gauge
  ctx.fillStyle = 'rgba(13,10,8,0.85)'; ctx.fillRect(0, H - 30, 224, 30);
  ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 12px ui-monospace'; ctx.textAlign = 'left';
  ctx.fillText('CRANK', 14, H - 15);
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1; ctx.strokeRect(74, H - 23, 134, 16);
  const v = game.elev.v / game.m.maxSpeed, half = 66;
  ctx.fillStyle = v >= 0 ? '#7aaa55' : '#d4a050';
  if (v >= 0) ctx.fillRect(75 + half, H - 21, half * v, 12);
  else        ctx.fillRect(75 + half + half * v, H - 21, -half * v, 12);
  ctx.strokeStyle = '#7a6a4a'; ctx.beginPath();
  ctx.moveTo(75 + half, H - 23); ctx.lineTo(75 + half, H - 7); ctx.stroke();

  // door status
  ctx.fillStyle = 'rgba(13,10,8,0.85)'; ctx.fillRect(W - 224, H - 30, 224, 30);
  ctx.textAlign = 'right';
  let t, c = '#bfa45f';
  if (game.elev.jamFlash > 0) { t = 'JAMMED'; c = '#aa3a32'; }
  else if (doorsOpen()) t = 'DOORS OPEN';
  else if (game.elev.doors > 0) t = 'MOVING…';
  else t = 'DOORS SHUT';
  const cap = capacityNow();
  const full = slotsAboard() >= cap;
  ctx.fillStyle = c; ctx.fillText(t, W - 14, H - 15);
  ctx.fillStyle = full ? '#aa3a32' : '#7a6a4a';
  ctx.textAlign = 'left'; ctx.fillText(`${slotsAboard()}/${cap}`, W - 218, H - 15);

  // active power-up chips, just under the top bar
  const active = Object.keys(game.power).filter(k => game.power[k] > 0);
  let chipX = W / 2 - (active.length * 116) / 2;
  for (const k of active) {
    const pw = POWERS[k];
    const frac = game.power[k] / pw.dur;
    ctx.fillStyle = 'rgba(13,10,8,0.9)'; ctx.fillRect(chipX, 42, 108, 22);
    ctx.fillStyle = pw.color; ctx.globalAlpha = 0.25;
    ctx.fillRect(chipX, 42, 108 * frac, 22); ctx.globalAlpha = 1;
    ctx.strokeStyle = pw.color; ctx.lineWidth = 1; ctx.strokeRect(chipX + 0.5, 42.5, 107, 21);
    ctx.fillStyle = pw.color; ctx.font = 'bold 10px ui-monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pw.name, chipX + 54, 53);
    chipX += 116;
  }

  // active shift conditions — small tags top-left, so you remember what's in play
  let my = 46;
  for (const md of game.modifiers) {
    const col = md.tone === 'good' ? '#7acf7a' : md.tone === 'bad' ? '#e0584a' : '#d8b24a';
    ctx.font = 'bold 11px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const wlab = ctx.measureText(md.name).width + 16;
    ctx.fillStyle = 'rgba(13,10,8,0.8)'; ctx.fillRect(12, my - 9, wlab, 18);
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(12.5, my - 8.5, wlab - 1, 17);
    ctx.fillStyle = col; ctx.fillText(md.name, 20, my);
    my += 22;
  }
  ctx.restore();
}

function drawBanner() {
  const a = Math.min(1, game.banner.t);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = game.banner.color;
  ctx.font = 'bold 20px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(game.banner.text, W / 2, 70);
  ctx.restore();
}

// ── title ──
function drawTitleArt() {
  // warm glow behind the wordmark
  const g = ctx.createRadialGradient(W / 2, 150, 20, W / 2, 150, 380);
  g.addColorStop(0, 'rgba(150,110,50,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 320);

  // a little elevator, bobbing on its cable, as a logo
  const t = performance.now() / 1000;
  const cx = W / 2, cy = 74 + Math.sin(t * 1.5) * 4, cw = 52, ch = 38;
  ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, 18); ctx.lineTo(cx, cy - ch / 2); ctx.stroke();
  ctx.fillStyle = '#5a4530'; ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);
  ctx.fillStyle = '#3a2a1c'; ctx.fillRect(cx - cw / 2 + 3, cy - ch / 2 + 3, cw - 6, ch - 6);
  ctx.fillStyle = '#ffdd99'; ctx.fillRect(cx - 7, cy - ch / 2 + 4, 14, 3);
  // two tiny passengers aboard
  ctx.fillStyle = '#3a5a78'; ctx.fillRect(cx - 12, cy - 2, 6, 9);
  ctx.fillStyle = '#5a3a4a'; ctx.fillRect(cx + 5, cy - 2, 6, 9);
  ctx.fillStyle = '#d4a878';
  ctx.beginPath(); ctx.arc(cx - 9, cy - 5, 3, 0, 7); ctx.arc(cx + 8, cy - 5, 3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1;
  ctx.strokeRect(cx - cw / 2 + 0.5, cy - ch / 2 + 0.5, cw - 1, ch - 1);
  ctx.beginPath(); ctx.moveTo(cx, cy - ch / 2 + 3); ctx.lineTo(cx, cy + ch / 2 - 3); ctx.stroke();
}

function drawTitle() {
  drawTitleArt();
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 44px ui-monospace, Menlo, monospace';
  ctx.fillText('THE WORST ELEVATOR', W / 2, 150);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  ctx.fillText('in the tallest building in town', W / 2, 184);

  ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
  const lines = [
    '↑ / ↓     crank the car up and down',
    'SPACE     open / close the doors',
    '',
    'Scoop riders from the LOBBY. They shout a floor —',
    'remember it, because once aboard it fades to "?".',
    'Doors open only when STOPPED and ALIGNED.',
    'Hit your quota to survive; three walk-offs and you\'re fired.',
    '',
    'Survive a shift, earn ◆ parts, and rebuild the lift',
    'into something that does the hard part for you.',
  ];
  let y = 260;
  for (const l of lines) { ctx.fillText(l, W / 2, y); y += 26; }

  if (save.best.shifts > 0 || save.best.delivered > 0) {
    ctx.fillStyle = '#7a6a4a'; ctx.font = '13px ui-monospace';
    ctx.fillText(`best run:  ${save.best.shifts} shifts survived  ·  ${save.best.delivered} deliveries`, W / 2, H - 168);
  }

  drawButton('CLOCK IN  ▸', W / 2 - 238, H - 128, 250, 46,
             () => { run = newRun(); startShift(); }, true);
  drawButton(`WORKSHOP  ★ ${save.stars}`, W / 2 + 28, H - 128, 210, 46,
             () => { menu = 'WORKSHOP'; }, false);
  ctx.fillStyle = '#7a6a4a'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'center';
  ctx.fillText('SPACE: clock in       M: workshop (spend ★ on permanent perks)', W / 2, H - 64);
}

function drawButton(label, x, y, w, h, fn, primary) {
  const blink = primary ? (Math.floor(performance.now() / 450) % 2 === 0) : true;
  ctx.fillStyle = primary ? (blink ? '#3a2e1a' : '#2a2014') : '#241a13';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#d4a050'; ctx.font = 'bold 16px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);
  buttons.push({ x, y, w, h, fn });
}

// ── the Spider Floor: a webbed-ledge sword fight ──
function drawSpider() {
  const sg = game.spiderGame;
  const P = sg.player;

  // backdrop + red pulse when hurt
  ctx.fillStyle = '#0a0510'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(60,8,40,${0.22 + (sg.hitFlash > 0 ? 0.35 : 0)})`;
  ctx.fillRect(0, 0, W, H);

  // faint radial web behind everything
  ctx.strokeStyle = 'rgba(150,130,170,0.08)'; ctx.lineWidth = 1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    ctx.beginPath(); ctx.moveTo(W / 2, -40); ctx.lineTo(W / 2 + Math.cos(a) * 760, -40 + Math.sin(a) * 760); ctx.stroke();
  }
  for (let r = 90; r < 760; r += 90) {
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += Math.PI / 9) {
      const px = W / 2 + Math.cos(a) * r, py = -40 + Math.sin(a) * r;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.fillStyle = '#c89aff'; ctx.font = 'bold 24px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('THE SPIDER FLOOR', W / 2, 40);

  // the ledge
  ctx.fillStyle = '#241620'; ctx.fillRect(PLAT_LEFT - 30, PLAT_Y, PLAT_RIGHT - PLAT_LEFT + 60, H - PLAT_Y);
  ctx.fillStyle = '#3a2436'; ctx.fillRect(PLAT_LEFT - 30, PLAT_Y, PLAT_RIGHT - PLAT_LEFT + 60, 6);
  // web strands draping under the ledge
  ctx.strokeStyle = 'rgba(180,160,200,0.18)'; ctx.lineWidth = 1;
  for (let x = PLAT_LEFT; x < PLAT_RIGHT; x += 46) {
    ctx.beginPath(); ctx.moveTo(x, PLAT_Y + 6); ctx.quadraticCurveTo(x + 23, PLAT_Y + 40, x + 46, PLAT_Y + 6); ctx.stroke();
  }

  // the lift door (your way out) at the left
  ctx.fillStyle = '#1a1018'; ctx.fillRect(DOOR_X - 6, PLAT_Y - 76, 54, 76);
  ctx.strokeStyle = '#7aff9a'; ctx.lineWidth = 2; ctx.strokeRect(DOOR_X - 6, PLAT_Y - 76, 54, 76);
  ctx.fillStyle = 'rgba(120,255,160,0.12)'; ctx.fillRect(DOOR_X - 2, PLAT_Y - 72, 46, 70);
  ctx.fillStyle = '#7aff9a'; ctx.font = '9px ui-monospace'; ctx.fillText('LIFT', DOOR_X + 21, PLAT_Y - 84);

  // spiders + their threads
  for (const s of sg.spiders) {
    if (!s.dead && s.state === 'descend') {
      ctx.strokeStyle = 'rgba(220,210,230,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.x, -10); ctx.lineTo(s.x, s.y); ctx.stroke();
    }
    drawWebSpider(s);
  }

  // the operator with a sword
  drawSwordPlayer(P, sg);

  // particles / floating text
  for (const f of sg.fx) {
    ctx.globalAlpha = Math.max(0, 1 - f.life / f.max);
    if (f.text) {
      ctx.fillStyle = f.color; ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
    } else {
      ctx.fillStyle = f.color; ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
    }
  }
  ctx.globalAlpha = 1;

  // ── HUD: hearts + loot ──
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < P.maxHp; i++) {
    ctx.fillStyle = i < P.hp ? '#ff4a6a' : '#3a2030';
    ctx.font = 'bold 22px ui-monospace'; ctx.fillText('♥', 24 + i * 26, 40);
  }
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 20px ui-monospace'; ctx.textAlign = 'right';
  ctx.fillText(`◆ ${Math.floor(sg.loot)}  ·  ${sg.killed} slain`, W - 24, 40);

  // prompts
  if (!sg.result) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c89aff'; ctx.font = 'bold 14px ui-monospace';
    ctx.fillText('← →  move      SPACE  swing sword', W / 2, H - 30);
    ctx.fillStyle = P.x < DOOR_X + 50 ? '#7aff9a' : '#4a6a52';
    ctx.fillText('reach the LIFT and press ↑ to carry out your loot', W / 2, H - 12);
  } else {
    ctx.fillStyle = 'rgba(8,4,12,0.8)'; ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.textAlign = 'center';
    if (sg.result === 'caught') {
      ctx.fillStyle = '#ff3a4a'; ctx.font = 'bold 46px ui-monospace';
      ctx.fillText('OVERWHELMED!', W / 2, H / 2 - 6);
      ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
      ctx.fillText('the loot scatters — and a strike', W / 2, H / 2 + 30);
    } else {
      ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 42px ui-monospace';
      ctx.fillText(`CARRIED OUT ◆ ${Math.floor(sg.loot)}`, W / 2, H / 2 - 6);
      ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
      ctx.fillText(`${sg.killed} spiders slain`, W / 2, H / 2 + 30);
    }
  }
}

function drawSwordPlayer(P, sg) {
  const x = P.x, y = PLAT_Y;          // feet on the ledge
  const flicker = P.invuln > 0 && Math.floor(P.invuln * 18) % 2 === 0;
  ctx.save();
  if (flicker) ctx.globalAlpha = 0.4;
  // legs
  ctx.fillStyle = '#1a1410'; ctx.fillRect(x - 7, y - 14, 5, 14); ctx.fillRect(x + 2, y - 14, 5, 14);
  // body + head (lean when hurt)
  const lean = P.hurtT > 0 ? -P.facing * 4 : 0;
  ctx.fillStyle = '#4a6a9a'; ctx.fillRect(x - 9 + lean, y - 36, 18, 23);
  ctx.fillStyle = '#d4a878'; ctx.beginPath(); ctx.arc(x + lean, y - 44, 8, 0, 7); ctx.fill();
  // a little cap
  ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 8 + lean, y - 50, 16, 4); ctx.fillRect(x - 5 + lean, y - 54, 10, 5);

  // sword
  const swingP = P.swing > 0 ? Math.min(1, (0.22 - P.swing) / 0.22) : -1;
  ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (swingP >= 0) {
    // an arc sweep in front
    const a0 = -1.1, a1 = 0.9, ang = a0 + (a1 - a0) * swingP;
    const bx = x + P.facing * 8, by = y - 26;
    ctx.strokeStyle = `rgba(200,230,255,${0.5 - swingP * 0.4})`;
    ctx.lineWidth = 10; ctx.beginPath();
    ctx.arc(bx, by, 34, P.facing > 0 ? a0 : Math.PI - a0, P.facing > 0 ? ang : Math.PI - ang, P.facing < 0);
    ctx.stroke();
    ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx, by);
    ctx.lineTo(bx + P.facing * Math.cos(ang) * 38, by + Math.sin(ang) * 38); ctx.stroke();
  } else {
    // resting: sword held out
    ctx.beginPath(); ctx.moveTo(x + P.facing * 6, y - 28); ctx.lineTo(x + P.facing * 34, y - 34); ctx.stroke();
  }
  ctx.restore();
}

function drawWebSpider(s) {
  const x = s.x, y = s.y;
  const wig = Math.sin(s.sway) * 4, wig2 = Math.cos(s.sway) * 4;
  ctx.save();
  if (s.dead) ctx.globalAlpha = Math.max(0, 1 - s.deadT / 0.9);
  ctx.strokeStyle = '#120810'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const sz = s.size;
  for (let i = -1; i <= 1; i += 2) {
    for (let l = 0; l < 4; l++) {
      const knee = { x: x + i * (sz * 0.9 + l * 4), y: y - sz * 0.5 + l * sz * 0.5 + (l % 2 ? wig : wig2) };
      const foot = { x: knee.x + i * sz, y: knee.y + sz + (l % 2 ? wig2 : wig) };
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
    }
  }
  ctx.fillStyle = s.dead ? '#3a1018' : '#160a12';
  ctx.beginPath(); ctx.ellipse(x, y + sz * 0.2, sz, sz * 1.15, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - sz * 0.8, sz * 0.62, 0, 7); ctx.fill();
  ctx.fillStyle = s.dead ? '#7a2030' : '#ff2a4a';
  for (const [dx, dy] of [[-sz * 0.3, -sz], [sz * 0.3, -sz]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.8, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ── shift done overlay ──
function drawShiftDone() {
  ctx.fillStyle = 'rgba(13,10,8,0.86)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7aaa55'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px ui-monospace';
  ctx.fillText(`SHIFT ${run.shiftNum} SURVIVED`, W / 2, H / 2 - 90);
  ctx.fillStyle = '#bfa45f'; ctx.font = '18px ui-monospace';
  ctx.fillText(`${game.delivered} delivered  ·  +${game.partsThisShift} ◆ from fares`, W / 2, H / 2 - 36);
  ctx.fillText(`shift bonus  +${game.bonus} ◆`, W / 2, H / 2 - 8);
  ctx.fillStyle = '#d4a050'; ctx.font = 'bold 22px ui-monospace';
  ctx.fillText(`◆ ${run.parts} parts in pocket`, W / 2, H / 2 + 36);
  drawButton('VISIT THE PARTS SHOP  ▸', W / 2 - 150, H / 2 + 80, 300, 46, openShop, true);
}

function drawFired() {
  ctx.fillStyle = 'rgba(13,10,8,0.9)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#aa3a32'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px ui-monospace';
  ctx.fillText("YOU'RE FIRED", W / 2, H / 2 - 70);
  ctx.fillStyle = '#bfa45f'; ctx.font = '18px ui-monospace';
  const survived = run.shiftNum - 1;
  ctx.fillText(`survived ${survived} shift${survived === 1 ? '' : 's'}  ·  ${run.totalDelivered} total deliveries`, W / 2, H / 2 - 24);
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 22px ui-monospace';
  ctx.fillText(`★ +${game.starsEarned ?? 0} stars earned   (★ ${save.stars} banked)`, W / 2, H / 2 + 12);
  ctx.fillStyle = '#7a6a4a'; ctx.font = '14px ui-monospace';
  ctx.fillText(`best: ${save.best.shifts} shifts  ·  ${save.best.delivered} deliveries`, W / 2, H / 2 + 44);
  drawButton('SPEND ★ IN WORKSHOP', W / 2 - 240, H / 2 + 80, 226, 46, () => { menu = 'WORKSHOP'; }, false);
  drawButton('CLOCK IN AGAIN', W / 2 + 14, H / 2 + 80, 226, 46, () => { menu = null; game.state = 'TITLE'; }, true);
}

// ── the Workshop: permanent cross-run perks bought with ★ stars ──
function drawWorkshop() {
  ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b9c4e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px ui-monospace';
  ctx.fillText('THE WORKSHOP', W / 2, 54);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#6a6a82';
  ctx.fillText('permanent perks you keep between jobs — earned by surviving', W / 2, 82);
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 20px ui-monospace';
  ctx.fillText(`★ ${save.stars} stars`, W / 2, 114);

  const cols = 3, cardW = 250, cardH = 76, gapX = 14, gapY = 11;
  const totalW = cols * cardW + (cols - 1) * gapX;
  const x0 = (W - totalW) / 2, y0 = 138;
  META.forEach((m, i) => {
    const cx = x0 + (i % cols) * (cardW + gapX);
    const cy = y0 + Math.floor(i / cols) * (cardH + gapY);
    const lvl = save.meta[m.key];
    const maxed = lvl >= m.max;
    const cost = maxed ? null : m.costs[lvl];
    const afford = !maxed && save.stars >= cost;

    ctx.fillStyle = '#12131a'; ctx.fillRect(cx, cy, cardW, cardH);
    ctx.strokeStyle = maxed ? '#3a5a4a' : afford ? '#b9c4e0' : '#2a2c38';
    ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cardW, cardH);

    ctx.fillStyle = afford ? '#ffd44a' : '#4a4a5a';
    ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (i < 9) ctx.fillText(`${i + 1}`, cx + 9, cy + 9);
    ctx.fillStyle = '#b9c4e0'; ctx.font = 'bold 14px ui-monospace';
    ctx.fillText(m.name, cx + (i < 9 ? 24 : 9), cy + 8);

    for (let l = 0; l < m.max; l++) {
      ctx.fillStyle = l < lvl ? '#7aaa55' : '#2a2c38';
      ctx.fillRect(cx + cardW - 12 - (m.max - l) * 11, cy + 9, 8, 6);
    }

    ctx.fillStyle = '#8a8aa2'; ctx.font = '10.5px ui-monospace';
    wrapText(m.blurb[Math.min(lvl, m.blurb.length - 1)], cx + 10, cy + 28, cardW - 20, 12);

    ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    if (maxed) { ctx.fillStyle = '#7aaa55'; ctx.fillText('MAXED', cx + cardW - 10, cy + cardH - 8); }
    else { ctx.fillStyle = afford ? '#ffd44a' : '#6a6a4a'; ctx.fillText(`★ ${cost}`, cx + cardW - 10, cy + cardH - 8); }

    if (!maxed) buttons.push({ x: cx, y: cy, w: cardW, h: cardH, fn: () => buyMeta(m) });
  });

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6a6a82'; ctx.font = '12px ui-monospace';
  ctx.fillText('click a perk (or press 1–9)  ·  perks apply to your NEXT run', W / 2, H - 88);
  drawButton('◂  BACK', W / 2 - 110, H - 68, 220, 44, () => { menu = null; }, true);
}

// ── shop ──
function drawShop() {
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 32px ui-monospace';
  ctx.fillText('THE PARTS SHOP', W / 2, 46);
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  ctx.fillText('pick your build — only these parts are in stock today', W / 2, 72);
  ctx.fillStyle = '#d4a050'; ctx.font = 'bold 20px ui-monospace';
  ctx.fillText(`◆ ${run.parts} parts`, W / 2, 100);

  // ── the drafted hand of upgrade choices ──
  const cols = 2, cardW = 380, cardH = 80, gapX = 24, gapY = 12;
  const totalW = cols * cardW + (cols - 1) * gapX;
  const x0 = (W - totalW) / 2, y0 = 128;
  const rows = Math.ceil(shop.hand.length / cols);
  shop.hand.forEach((u, i) => {
    const cx = x0 + (i % cols) * (cardW + gapX);
    const cy = y0 + Math.floor(i / cols) * (cardH + gapY);
    const lvl = run.up[u.key];
    const maxed = lvl >= u.max;
    const cost = maxed ? null : u.costs[lvl];
    const afford = !maxed && run.parts >= cost;
    const tag = UP_TAGS[u.tag] || { name: '', color: '#bfa45f' };

    ctx.fillStyle = '#1a130d'; ctx.fillRect(cx, cy, cardW, cardH);
    ctx.fillStyle = tag.color; ctx.globalAlpha = 0.10; ctx.fillRect(cx, cy, 5, cardH); ctx.globalAlpha = 1;
    ctx.fillStyle = tag.color; ctx.fillRect(cx, cy, 5, cardH);
    ctx.strokeStyle = maxed ? '#3a5a2a' : afford ? '#bfa45f' : '#3a2e22';
    ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cardW, cardH);

    ctx.fillStyle = afford ? '#d4a050' : '#5a4a32';
    ctx.font = 'bold 15px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${i + 1}`, cx + 14, cy + 11);
    ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 16px ui-monospace';
    ctx.fillText(u.name, cx + 34, cy + 10);
    ctx.fillStyle = tag.color; ctx.font = '9px ui-monospace';
    ctx.fillText(tag.name, cx + 34, cy + 28);

    for (let l = 0; l < u.max; l++) {
      ctx.fillStyle = l < lvl ? '#7aaa55' : '#3a2e22';
      ctx.fillRect(cx + cardW - 16 - (u.max - l) * 14, cy + 11, 10, 7);
    }
    ctx.fillStyle = '#9a8a64'; ctx.font = '12px ui-monospace';
    wrapText(u.blurb[Math.min(lvl, u.blurb.length - 1)], cx + 34, cy + 42, cardW - 48, 14);

    ctx.font = 'bold 14px ui-monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    if (maxed) { ctx.fillStyle = '#7aaa55'; ctx.fillText('MAXED', cx + cardW - 12, cy + cardH - 10); }
    else { ctx.fillStyle = afford ? '#d4a050' : '#7a5a3a'; ctx.fillText(`◆ ${cost}`, cx + cardW - 12, cy + cardH - 10); }
    if (!maxed) buttons.push({ x: cx, y: cy, w: cardW, h: cardH, fn: () => buyUpgrade(u) });
  });

  // reroll the hand
  const rrY = y0 + rows * (cardH + gapY) - 2;
  const rrFree = run.rerolls > 0;
  ctx.textAlign = 'center';
  drawButton(rrFree ? `↻ REROLL  (free ×${run.rerolls})` : `↻ REROLL  (◆${REROLL_COST})`,
             W / 2 - 130, rrY, 260, 34, rerollShop, false);

  // ── the rotating shelf: Spare Fuse + two one-shot specials ──
  const shelfY = rrY + 46;
  const itemGap = 12, itemW = (totalW - 2 * itemGap) / 3, itemH = 58;
  ctx.fillStyle = '#6a6a4a'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText("ONE-SHOT EXTRAS", x0, shelfY - 4);
  const shelf = [
    { key: 'F', name: 'Spare Fuse', cost: FUSE_COST, blurb: `Forgive one walk-off. Carrying ${run.fuses}.`, fn: buyFuse, bought: false },
    ...shop.offers.map((s, i) => ({ key: i === 0 ? 'Z' : 'X', name: s.name, cost: s.cost, blurb: s.blurb,
                                    fn: () => buySpecial(s), bought: !!(shop.bought && shop.bought[s.key]) })),
  ];
  shelf.forEach((it, i) => {
    const ix = x0 + i * (itemW + itemGap);
    const afford = !it.bought && run.parts >= it.cost;
    ctx.fillStyle = '#170f14'; ctx.fillRect(ix, shelfY, itemW, itemH);
    ctx.strokeStyle = it.bought ? '#3a5a2a' : afford ? '#d4a050' : '#3a2e22'; ctx.lineWidth = 2;
    ctx.strokeRect(ix, shelfY, itemW, itemH);
    ctx.fillStyle = afford ? '#d4a050' : '#5a4a32'; ctx.font = 'bold 12px ui-monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(it.key, ix + 10, shelfY + 8);
    ctx.fillStyle = '#d4a050'; ctx.font = 'bold 14px ui-monospace'; ctx.fillText(it.name, ix + 26, shelfY + 7);
    ctx.fillStyle = '#9a8a64'; ctx.font = '11px ui-monospace'; wrapText(it.blurb, ix + 10, shelfY + 26, itemW - 20, 13);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 13px ui-monospace';
    if (it.bought) { ctx.fillStyle = '#7aaa55'; ctx.fillText('SOLD', ix + itemW - 10, shelfY + itemH - 8); }
    else { ctx.fillStyle = afford ? '#d4a050' : '#7a5a3a'; ctx.fillText(`◆ ${it.cost}`, ix + itemW - 10, shelfY + itemH - 8); }
    if (!it.bought) buttons.push({ x: ix, y: shelfY, w: itemW, h: itemH, fn: it.fn });
  });

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7a6a4a'; ctx.font = '12px ui-monospace';
  ctx.fillText('click or press the key  ·  R reroll  ·  F fuse  ·  Z / X specials', W / 2, H - 92);
  const nextQ = shiftParams(run.shiftNum + 1).quota;
  drawButton(`START SHIFT ${run.shiftNum + 1}  (quota ${nextQ})  ▸`,
             W / 2 - 170, H - 72, 340, 44, () => startShift(), true);
}

function wrapText(text, x, y, maxW, lh) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ════════════════════════════════════════════════════════════ AUDIO
// Tiny procedural synth — no asset files. Created lazily on first input.

const sfx = (() => {
  let ac = null, master = null;
  function ensure() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function resume() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); }
  function tone(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    resume,
    ding()  { tone(880, 0.12, 'sine', 0.5); tone(1320, 0.16, 'sine', 0.3); },
    near()  { tone(1040, 0.05, 'sine', 0.25); },
    board() { tone(440, 0.07, 'square', 0.35, 560); },
    chime() { tone(660, 0.09, 'sine', 0.5); tone(990, 0.14, 'sine', 0.4, 1180); },
    door()  { tone(160, 0.18, 'sawtooth', 0.25, 120); },
    thud()  { tone(90, 0.14, 'sine', 0.6, 60); },
    buzz()  { tone(140, 0.22, 'sawtooth', 0.45, 80); },
    buy()   { tone(523, 0.08, 'square', 0.4); tone(784, 0.12, 'square', 0.4); },
    power() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.4), i * 55)); },
    spider(){ tone(120, 0.6, 'sawtooth', 0.3, 88); tone(123.5, 0.6, 'sawtooth', 0.22, 90); },
    sword() { tone(640, 0.09, 'triangle', 0.3, 1100); },
    slash() { tone(900, 0.07, 'square', 0.4, 300); tone(300, 0.08, 'sawtooth', 0.3, 160); },
    hurt()  { tone(200, 0.16, 'sawtooth', 0.5, 90); },
    caught(){ [600, 480, 360, 250, 170].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sawtooth', 0.45), i * 70)); },
    fanfare(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.4), i * 90)); },
    fired() { [330, 294, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.4), i * 160)); },
    intro() { tone(392, 0.16, 'sine', 0.3); setTimeout(() => tone(587, 0.2, 'sine', 0.3), 130); },
    tip()   { tone(784, 0.07, 'sine', 0.5); tone(1175, 0.12, 'sine', 0.4, 1320); },
  };
})();

// ════════════════════════════════════════════════════════════ LOOP

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// fit canvas to viewport while keeping internal resolution
function fit() {
  const pad = 24;
  const sw = (window.innerWidth - pad) / W;
  const shh = (window.innerHeight - pad) / H;
  const s = Math.min(sw, shh, 1.4);
  canvas.style.width = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
}
window.addEventListener('resize', fit);
fit();
