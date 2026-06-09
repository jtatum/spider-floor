// THE SPIDER FLOOR — data, config, state & economy
// (loaded as an ordered classic script; all files share one global scope)

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
    blurb: ['Achievement payouts are 25% bigger.', 'Achievement payouts are 50% bigger.'] },
  { key: 'reputation',    name: 'Reputation',       max: 2, costs: [4, 7],
    blurb: ['VIP passengers turn up more often.', 'VIPs turn up much more often.'] },
  { key: 'knownAssociate',name: 'Known Associate',  max: 2, costs: [5, 8],
    blurb: ['The Spider Floor opens more often.', '…and its web pays out faster.'] },
];

// Achievements are the ONLY source of ★ stars (spent in the Workshop). Total
// awards exceed the total cost of every perk, so a dedicated player can unlock
// the whole Workshop. `test(s)` reads lifetime `save.stats`.
const ACHIEVEMENTS = [
  // ── "participation" — guaranteed in your first run, so worth almost nothing ──
  { key: 'clockIn',   name: 'Clock In',                  desc: 'Start your first shift.',                  award: 1,  test: s => s.runs >= 1 },
  { key: 'firstFare', name: 'First Fare',                desc: 'Deliver a passenger.',                     award: 1,  test: s => s.deliveries >= 1 },
  { key: 'dayOne',    name: 'Day One',                   desc: 'Survive a whole shift.',                   award: 2,  test: s => s.shifts >= 1 },
  { key: 'fired',     name: "You're Fired",              desc: 'Get fired. It happens.',                   award: 1,  test: s => s.fires >= 1 },
  { key: 'brave',     name: 'Into the Web',              desc: 'Step onto the Spider Floor.',              award: 2,  test: s => s.spiderVisits >= 1 },
  // ── early milestones — modest ──
  { key: 'deliver50', name: 'Regular Service',           desc: 'Deliver 50 passengers (lifetime).',        award: 4,  test: s => s.deliveries >= 50 },
  { key: 'shift3',    name: 'Getting the Hang of It',    desc: 'Reach shift 3.',                           award: 3,  test: s => s.maxShift >= 3 },
  { key: 'busy',      name: 'Rush Hour Hero',            desc: 'Deliver 12 in a single shift.',            award: 4,  test: s => s.bestShiftDeliveries >= 12 },
  { key: 'perfect',   name: 'Spotless',                  desc: 'Finish a shift with no walk-offs.',        award: 4,  test: s => s.perfectShifts >= 1 },
  { key: 'rich',      name: 'Deep Pockets',              desc: 'Hold ◆30 at once.',                        award: 4,  test: s => s.bestRunParts >= 30 },
  { key: 'maxOut',    name: 'Dream Machine',             desc: 'Max out an upgrade.',                      award: 4,  test: s => s.everMaxed >= 1 },
  { key: 'vip5',      name: 'Friends in High Places',    desc: 'Deliver 5 VIPs.',                          award: 3,  test: s => s.vips >= 5 },
  { key: 'mover10',   name: 'Heavy Lifting',             desc: 'Deliver 10 movers.',                       award: 4,  test: s => s.movers >= 10 },
  { key: 'tipper10',  name: 'Generous Sort',             desc: 'Deliver 10 tippers.',                      award: 4,  test: s => s.tippers >= 10 },
  { key: 'power10',   name: 'Charged Up',                desc: 'Collect 10 power-ups.',                    award: 4,  test: s => s.powerups >= 10 },
  { key: 'slay10',    name: 'Exterminator',              desc: 'Slay 10 spiders (lifetime).',              award: 3,  test: s => s.spiders >= 10 },
  { key: 'firstPerk', name: 'Home Improvement',          desc: 'Buy a permanent Workshop perk.',           award: 2,  test: s => s.perks >= 1 },
  { key: 'twoMod',    name: 'Bad Day at Work',           desc: 'Work a shift under two conditions.',       award: 3,  test: s => s.twoModShift >= 1 },
  { key: 'night',     name: 'Graveyard',                 desc: 'Work the Graveyard Shift.',                award: 3,  test: s => s.nightShift >= 1 },
  // ── mid milestones ──
  { key: 'deliver250',name: 'Veteran Operator',          desc: 'Deliver 250 passengers (lifetime).',       award: 8,  test: s => s.deliveries >= 250 },
  { key: 'shift6',    name: 'Seasoned',                  desc: 'Reach shift 6.',                           award: 7,  test: s => s.maxShift >= 6 },
  { key: 'perfect5',  name: 'Consummate Professional',   desc: 'Finish 5 spotless shifts.',                award: 9,  test: s => s.perfectShifts >= 5 },
  { key: 'haul',      name: 'Spoils of War',             desc: 'Carry ◆15 out of one Spider Floor visit.', award: 7,  test: s => s.bestSpiderLoot >= 15 },
  { key: 'comeback',  name: 'Comeback Kid',              desc: 'Survive a shift one strike from fired.',   award: 7,  test: s => s.comeback >= 1 },
  { key: 'perks5',    name: 'Renovator',                 desc: 'Own 5 perk levels.',                       award: 6,  test: s => s.perks >= 5 },
  { key: 'flawless',  name: 'Not a Scratch',             desc: 'Clear a Spider Floor visit unhurt (3+ kills).', award: 8, test: s => s.noHitClears >= 1 },
  // ── the hard ones carry the economy ──
  { key: 'deliver1k', name: 'Career Operator',           desc: 'Deliver 1000 passengers (lifetime).',      award: 16, test: s => s.deliveries >= 1000 },
  { key: 'shift10',   name: 'Elevator Whisperer',        desc: 'Reach shift 10.',                          award: 14, test: s => s.maxShift >= 10 },
  { key: 'shift15',   name: 'Untouchable',               desc: 'Reach shift 15.',                          award: 20, test: s => s.maxShift >= 15 },
  { key: 'maxOut3',   name: 'Fully Loaded',              desc: 'Max 3 upgrades in one run.',               award: 12, test: s => s.bestMaxedRun >= 3 },
  { key: 'slay100',   name: "Arachnophobe's Revenge",    desc: 'Slay 100 spiders (lifetime).',             award: 14, test: s => s.spiders >= 100 },
  { key: 'perks12',   name: 'Master of the House',       desc: 'Own 12 perk levels.',                      award: 12, test: s => s.perks >= 12 },
  { key: 'climb',     name: 'The Long Climb',            desc: 'Climb past the penthouse to face the truth.', award: 4, test: s => s.bossTries >= 1 },
  { key: 'cutCord',   name: 'Cut the Cord',              desc: 'Defeat the spider that controls the lift.', award: 30, test: s => s.bossWins >= 1 },
];

function defaultStats() {
  return { runs: 0, deliveries: 0, shifts: 0, maxShift: 0, spiders: 0, fires: 0,
           vips: 0, tippers: 0, movers: 0, powerups: 0, perks: 0, everMaxed: 0,
           bestMaxedRun: 0, bestShiftDeliveries: 0, bestRunParts: 0, perfectShifts: 0,
           spiderVisits: 0, bestSpiderLoot: 0, noHitClears: 0, twoModShift: 0,
           nightShift: 0, comeback: 0, bossTries: 0, bossWins: 0 };
}
function defaultSave() {
  const meta = {};
  for (const m of META) meta[m.key] = 0;
  return { stars: 0, meta, best: { shifts: 0, delivered: 0 }, stats: defaultStats(), ach: {}, beatBoss: false };
}
function loadSave() {
  const def = defaultSave();
  try {
    const s = JSON.parse(localStorage.getItem('worstElevatorSave'));
    if (!s) return def;
    return { ...def, ...s, meta: { ...def.meta, ...(s.meta || {}) }, best: { ...def.best, ...(s.best || {}) },
             stats: { ...def.stats, ...(s.stats || {}) }, ach: { ...(s.ach || {}) } };
  } catch (e) { return def; }
}
function persist() { try { localStorage.setItem('worstElevatorSave', JSON.stringify(save)); } catch (e) {} }
let save = loadSave();

// ── achievements: the sole source of ★, with on-screen toasts ──
let achToasts = [];
function recomputePerks() { save.stats.perks = Object.values(save.meta).reduce((a, b) => a + b, 0); }
function bumpStat(key, value) {       // set a "best" / max stat then re-check
  if (value > save.stats[key]) { save.stats[key] = value; checkAchievements(); }
}
function checkAchievements() {
  const s = save.stats;
  let any = false;
  for (const a of ACHIEVEMENTS) {
    if (!save.ach[a.key] && a.test(s)) {
      save.ach[a.key] = true;
      const award = Math.round(a.award * (1 + 0.25 * (save.meta.hazardPay || 0)));
      save.stars += award;
      achToasts.push({ name: a.name, award, t: 4.2 });
      any = true;
      if (typeof sfx !== 'undefined' && sfx.achieve) sfx.achieve();
    }
  }
  if (any) persist();
}
const ACH_TOTAL = ACHIEVEMENTS.reduce((a, b) => a + b.award, 0);   // total ★ obtainable

function maxStrikes() {
  return CFG.strikesAllowed + save.meta.unionCard + ((run && run.up.reinforced) || 0) + ((game && game.extraStrike) || 0);
}

function newRun() {
  save.stats.runs++;
  checkAchievements();
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
    maxedThisRun: 0,                // upgrades brought to max this run (for achievements)
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
    walkoffsThisShift: 0,
    m,
  };

  // achievement stats from the shift's conditions
  if (modifiers.length >= 2) save.stats.twoModShift = 1;
  if (modifiers.some(md => md.key === 'night')) save.stats.nightShift = 1;
  checkAchievements();

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
  save.stats.powerups++; checkAchievements();
  sfx.power();
}

function endShift(reason) {
  // reason: 'quota' (survived) or 'fired'
  if (reason === 'quota') {
    const bonus = 3 + Math.max(0, maxStrikes() - game.strikes);
    game.bonus = bonus;
    run.parts += bonus;
    // ── achievement stats for a survived shift ──
    const s = save.stats;
    s.shifts++;
    if (game.walkoffsThisShift === 0) s.perfectShifts++;
    if (game.strikes >= maxStrikes() - 1) s.comeback = 1;   // survived on the brink
    bumpStat('maxShift', run.shiftNum);
    bumpStat('bestShiftDeliveries', game.delivered);
    bumpStat('bestRunParts', run.parts);
    checkAchievements();
    game.state = 'SHIFT_DONE';
    game.doneT = 0;
    sfx.fanfare();
  } else {
    save.stats.fires++;
    bumpStat('maxShift', run.shiftNum);
    save.best.shifts = Math.max(save.best.shifts, run.shiftNum - 1);
    save.best.delivered = Math.max(save.best.delivered, run.totalDelivered);
    checkAchievements();
    persist();
    game.state = 'FIRED';
    game.doneT = 0;
    sfx.fired();
  }
}

