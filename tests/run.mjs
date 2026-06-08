// Logic tests for The Worst Elevator. No framework — run with `node tests/run.mjs`.
// Each test gets a freshly-loaded game (clean save), drives the real update loop,
// and asserts on the real state. Rendering is not exercised.
import assert from 'node:assert';
import { makeGame } from './harness.mjs';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(makeGame()); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; }
}
const buyMeta = (G, key) => G.buyMeta(G.META.find(m => m.key === key));
const openDoorsAt = (G, floorIdx) => {
  const e = G.game.elev; e.y = floorIdx * G.CFG.floorHeight; e.v = 0; e.doorTarget = 1; e.doors = 1;
};
// force a deterministic passenger kind/size (spawns are random by design)
const normalize = (p) => { p.kind = 'normal'; p.size = 1; p.vip = false; return p; };
const addRider = (G, dest, kind = 'normal') => {
  G.spawnPassenger(); const p = G.game.passengers.at(-1);
  p.dest = dest; p.kind = kind; p.vip = kind === 'vip'; p.size = kind === 'mover' ? 2 : 1;
  p.state = 'riding'; p.reveal = 0; return p;
};

// ── core loop ───────────────────────────────────────────────────────────────

test('cabin capacity is enforced (no clown car)', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  for (let i = 0; i < 12; i++) { G.spawnPassenger(); normalize(G.game.passengers.at(-1)); }
  openDoorsAt(G, 0);
  G.step(4);
  const riding = G.game.passengers.filter(p => p.state === 'riding').length;
  assert.equal(riding, G.game.m.capacity, `expected ${G.game.m.capacity} aboard, got ${riding}`);
});

test('a mover takes two cabin slots', (G) => {
  G.run = G.newRun(); G.startShift();           // base capacity 4
  G.game.passengers = [];
  G.spawnPassenger(); const mover = G.game.passengers.at(-1); mover.kind = 'mover'; mover.size = 2; mover.vip = false;
  for (let i = 0; i < 6; i++) normalize((G.spawnPassenger(), G.game.passengers.at(-1)));
  openDoorsAt(G, 0);
  G.step(4);
  assert.equal(G.slotsAboard(), G.capacityNow(), 'cabin filled to slot capacity');
  assert.ok(G.slotsAboard() <= G.capacityNow(), 'never over capacity');
  assert.ok(G.game.passengers.filter(p => p.state === 'riding').length < G.capacityNow(),
    'fewer heads than slots because the mover eats two');
});

test('delivering a rider at its floor pays a fare', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  const p = addRider(G, 2, 'normal');
  openDoorsAt(G, 2);
  const before = G.run.parts;
  G.step(3);
  assert.equal(p.state, 'delivered');
  assert.equal(G.run.parts - before, 1, 'base fare is 1 part');
});

test('a tipper pays the fare plus a tip', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  const p = addRider(G, 2, 'tipper');
  openDoorsAt(G, 2);
  const before = G.run.parts;
  G.step(3);
  assert.equal(G.run.parts - before, 3, 'base 1 + tip 2');
});

test('opening at the wrong floor delivers nobody', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  const p = addRider(G, 3, 'normal'); p.patience = 999;
  openDoorsAt(G, 2);              // wrong floor
  G.step(5);
  assert.equal(p.state, 'riding', 'rider should stay aboard');
});

test('a walk-off costs a strike; a Spare Fuse forgives the first', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.fuses = 1;
  // shut the doors and leave the lobby so the waiting passenger can't board
  const e = G.game.elev; e.doorTarget = 0; e.doors = 0; e.y = 2 * G.CFG.floorHeight;
  const impatient = () => { G.spawnPassenger(); const p = G.game.passengers.at(-1); p.state = 'waiting'; p.patience = 0.0001; };
  G.game.passengers = []; impatient(); G.step(2);
  assert.equal(G.game.strikes, 0, 'fuse absorbed it');
  assert.equal(G.run.fuses, 0, 'fuse consumed');
  impatient(); G.step(2);
  assert.equal(G.game.strikes, 1, 'no fuse left → real strike');
});

test('hitting quota completes the shift with a bonus', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.delivered = G.game.quota - 1;
  G.game.passengers = []; addRider(G, 2, 'normal');
  openDoorsAt(G, 2);
  G.step(3);
  assert.equal(G.game.state, 'SHIFT_DONE');
  assert.ok(G.game.bonus > 0, 'a survival bonus is awarded');
});

test('crank has momentum — releasing does not auto-stop', (G) => {
  G.run = G.newRun(); G.startShift();
  const e = G.game.elev; e.y = 0; e.v = 0; e.doorTarget = 0; e.doors = 0;
  G.keys.add('arrowup'); G.step(40); G.keys.delete('arrowup');
  const vRelease = Math.abs(e.v);
  G.step(90);                      // coast 1.5s with no input
  const vCoast = Math.abs(e.v);
  assert.ok(vRelease > 200, `should build speed (got ${Math.round(vRelease)})`);
  assert.ok(vCoast > vRelease * 0.4, `should still be coasting (got ${Math.round(vCoast)} of ${Math.round(vRelease)})`);
});

// ── in-run shop ──────────────────────────────────────────────────────────────

test('buying an upgrade charges parts and caps at max level', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.parts = 100;
  const u = G.UPGRADES.find(x => x.key === 'dispatch');   // max 1
  const cost = u.costs[0];
  G.buyUpgrade(u);
  assert.equal(G.run.up.dispatch, 1);
  assert.equal(G.run.parts, 100 - cost);
  G.buyUpgrade(u);                                          // already maxed
  assert.equal(G.run.up.dispatch, 1, 'cannot exceed max');
  assert.equal(G.run.parts, 100 - cost, 'no charge when maxed');
});

// ── Spider Floor ─────────────────────────────────────────────────────────────

// step off the lift onto the Spider Floor ledge
const enterWeb = (G) => {
  G.game.spider.open = true; G.game.spider.window = 13;
  const e = G.game.elev; e.y = G.SPIDER_Y; e.v = 0; e.doorTarget = 1; e.doors = 1;
  G.step(3);
  return G.game.spiderGame;
};

test('Spider Floor: a sword swing slays a spider for loot', (G) => {
  G.run = G.newRun(); G.startShift();
  const sg = enterWeb(G);
  assert.equal(G.game.state, 'SPIDER', 'stepped onto the ledge with a sword');
  sg.spiders = [];
  const P = sg.player; P.facing = 1;
  G.spawnWebSpider(sg); const s = sg.spiders.at(-1);
  s.state = 'crawl'; s.y = G.PLAT_Y - 12; s.x = P.x + 26; s.dead = false;
  const lootBefore = sg.loot;
  G.keys.add(' '); G.step(3); G.keys.delete(' ');
  assert.ok(s.dead, 'the spider was cut down');
  assert.ok(sg.loot > lootBefore, 'killing it paid loot');
});

test('Spider Floor: bailing at the lift door carries out your loot', (G) => {
  G.run = G.newRun(); G.startShift();
  const sg = enterWeb(G);
  sg.loot = 7; sg.player.x = G.DOOR_X + 8;
  const before = G.run.parts;
  G.keys.add('arrowup'); G.step(3); G.keys.delete('arrowup');
  G.step(140);     // let the exit resolve
  assert.equal(G.game.state, 'PLAYING');
  assert.equal(G.run.parts, before + 7, 'banked the loot');
});

test('Spider Floor: getting overwhelmed costs a strike and banks nothing', (G) => {
  G.run = G.newRun(); G.startShift();
  const sg = enterWeb(G);
  const before = G.run.parts, strikesBefore = G.game.strikes;
  const P = sg.player; P.hp = 1; P.invuln = 0;
  sg.spiders = [];
  G.spawnWebSpider(sg); const s = sg.spiders.at(-1);
  s.state = 'crawl'; s.y = G.PLAT_Y - 12; s.x = P.x + 4; s.dead = false;   // right on top
  let f = 0;
  while (G.game.state === 'SPIDER' && G.game.spiderGame && !G.game.spiderGame.result && f < 400) { G.update(1 / 60); f++; }
  assert.equal(G.game.spiderGame.result, 'caught');
  G.step(140);
  assert.equal(G.run.parts, before, 'no loot banked');
  assert.equal(G.game.strikes, strikesBefore + 1, 'took a strike');
});

// ── cross-run meta-progression ───────────────────────────────────────────────

test('firing records the run, updates best, and persists', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.shiftNum = 4; G.run.totalDelivered = 30;
  G.endShift('fired');
  assert.equal(G.game.state, 'FIRED');
  assert.equal(G.save.stats.fires, 1, 'a firing is recorded');
  assert.equal(G.save.best.shifts, 3, 'survived 3 full shifts');
  assert.equal(G.save.best.delivered, 30);
  const reloaded = G.loadSave();
  assert.equal(reloaded.best.shifts, 3, 'persisted to storage');
});

test('Workshop perks apply to the next run', (G) => {
  G.save.stars = 100;
  ['severance', 'severance', 'severance', 'footInDoor', 'footInDoor', 'footInDoor',
   'roomierStart', 'unionCard', 'frequentFlyer'].forEach(k => buyMeta(G, k));
  G.run = G.newRun(); G.startShift();
  assert.equal(G.run.parts, 15, 'Severance 3 → start with 15 parts');
  assert.equal(G.run.up.floorCounter, 1, 'Foot in the Door fits Floor Counter');
  assert.equal(G.run.up.fastDoors, 1, '…and Quick Doors');
  assert.equal(G.run.up.autoLevel, 1, '…and Auto-Leveling');
  assert.equal(G.game.m.capacity, 5, 'base 4 + Roomier 1');
  assert.equal(G.maxStrikes(), 4, 'Union Card adds a strike');
});

test('Master Key installs one random upgrade each run; Sturdy Cables fits a damper', (G) => {
  G.save.meta.masterKey = 1; G.save.meta.sturdyStart = 1;
  G.run = G.newRun();
  assert.ok(G.run.up.damper >= 1, 'Sturdy Cables fits a Flywheel Damper');
  const total = Object.values(G.run.up).reduce((a, b) => a + b, 0);
  assert.ok(total >= 2, 'damper + a master-key upgrade are installed');
});

test('Hazard Pay multiplies achievement payouts', (G) => {
  G.save.meta.hazardPay = 2;          // +50% to achievement awards
  const before = G.save.stars;
  G.save.stats.shifts = 1;            // only "Day One" (award 4) becomes true
  G.checkAchievements();
  assert.ok(G.save.ach.dayOne, 'Day One unlocked');
  assert.equal(G.save.stars - before, 6, '4 ★ ×1.5 = 6');
});

test('Workshop: a perk caps at max and refuses when you cannot afford it', (G) => {
  G.save.ach.firstPerk = true; G.save.ach.perks5 = true;   // avoid bonus ★ from buying
  const m = G.META.find(x => x.key === 'unionCard'); // max 1, cost 9
  G.save.stars = 5; buyMeta(G, 'unionCard');
  assert.equal(G.save.meta.unionCard, 0, 'too poor to buy');
  G.save.stars = 20; buyMeta(G, 'unionCard');
  assert.equal(G.save.meta.unionCard, 1);
  assert.equal(G.save.stars, 11, 'charged exactly the cost');
  buyMeta(G, 'unionCard');
  assert.equal(G.save.meta.unionCard, 1, 'cannot exceed max');
  assert.equal(G.save.stars, 11, 'no charge when maxed');
});

test('Frequent Flyer raises every fare by +1', (G) => {
  G.save.stars = 100; buyMeta(G, 'frequentFlyer');
  G.run = G.newRun(); G.startShift();
  G.game.passengers = []; addRider(G, 2, 'normal');
  openDoorsAt(G, 2);
  const before = G.run.parts;
  G.step(3);
  assert.equal(G.run.parts - before, 2, 'base 1 + Frequent Flyer 1');
});

test('modifiers combine (RUSH HOUR speeds spawns and boosts fares)', (G) => {
  const fx = G.combineFx([G.MODIFIERS.find(m => m.key === 'rush')]);
  assert.ok(fx.spawnMul < 1, 'spawns come faster');
  assert.ok(fx.fareMul > 1, 'fares pay more');
  // two modifiers stack
  const both = G.combineFx([G.MODIFIERS.find(m => m.key === 'cramped'), G.MODIFIERS.find(m => m.key === 'gala')]);
  assert.equal(both.capDelta, -1, 'cramped removes a slot');
  assert.ok(both.vipMul > 1, 'gala raises VIP odds');
});

test('shift 1 is clean; later shifts roll modifiers', (G) => {
  G.run = G.newRun(); G.startShift();
  assert.equal(G.game.modifiers.length, 0, 'onboarding shift has no conditions');
  G.run.shiftNum = 5; // next startShift → shift 6
  G.startShift();
  assert.ok(G.game.modifiers.length >= 1, 'later shifts always have at least one condition');
});

test('the shop offers two rotating specials', (G) => {
  G.run = G.newRun(); G.startShift();
  G.openShop();
  assert.equal(G.shop.offers.length, 2);
  assert.notEqual(G.shop.offers[0].key, G.shop.offers[1].key, 'two distinct specials');
});

test('the shop deals a drafted hand of non-maxed upgrades', (G) => {
  G.run = G.newRun(); G.startShift(); G.openShop();
  assert.ok(G.shop.hand.length >= 3 && G.shop.hand.length <= 5, `hand size ${G.shop.hand.length}`);
  assert.ok(G.shop.hand.every(u => G.run.up[u.key] < u.max), 'only offers improvable upgrades');
});

test('reroll deals a new hand and costs parts', (G) => {
  G.run = G.newRun(); G.startShift(); G.run.parts = 20; G.run.rerolls = 0; G.openShop();
  const before = G.run.parts;
  G.rerollShop();
  assert.equal(G.run.parts, before - 3, 'reroll costs 3 parts when no free rerolls');
});

test('Tip Jar adds to every fare; Reinforced adds a strike', (G) => {
  G.run = G.newRun(); G.run.up.tipjar = 1; G.run.up.reinforced = 1; G.startShift();
  assert.equal(G.maxStrikes(), G.CFG.strikesAllowed + 1, 'reinforced grants a strike');
  G.game.passengers = []; const p = addRider(G, 2, 'normal');
  openDoorsAt(G, 2); const before = G.run.parts; G.step(3);
  assert.equal(G.run.parts - before, 2, 'base 1 + Tip Jar 1');
});

test('Apology Notes forgives the first walk-off, then strikes resume', (G) => {
  G.run = G.newRun(); G.run.up.apology = 1; G.startShift();
  const e = G.game.elev; e.doorTarget = 0; e.doors = 0; e.y = 2 * G.CFG.floorHeight;
  const impatient = () => { G.spawnPassenger(); const p = G.game.passengers.at(-1); p.state = 'waiting'; p.patience = 0.0001; };
  G.game.passengers = []; impatient(); G.step(2);
  assert.equal(G.game.strikes, 0, 'first walk-off apologised away');
  assert.ok(G.game.apologyUsed, 'apology spent');
  impatient(); G.step(2);
  assert.equal(G.game.strikes, 1, 'second walk-off strikes');
});

test('a special primes a one-shot effect for the next shift', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.parts = 50; G.openShop();
  const overtime = G.SPECIALS.find(s => s.key === 'overtime');
  G.buySpecial(overtime);
  assert.equal(G.run.nextShift.extraStrike, 1, 'primed');
  assert.ok(G.shop.bought.overtime, 'marked sold');
  const before = G.maxStrikes();
  G.startShift();                              // next shift consumes it
  assert.equal(G.maxStrikes(), before + 1, 'extra strike applies this shift only');
  G.startShift();                              // and is gone after
  assert.equal(G.maxStrikes(), before, 'one-shot effect cleared');
});

test('each run gets a building colour theme', (G) => {
  G.run = G.newRun();
  assert.ok(G.run.theme && G.run.theme.wall && G.run.theme.room, 'theme assigned');
});

test('a two-condition shift never stacks two bad ones', (G) => {
  G.run = G.newRun();
  let sawTwo = false;
  for (let i = 0; i < 200; i++) {
    G.run.shiftNum = 5 + (i % 6);
    G.startShift();
    const mods = G.game.modifiers;
    if (mods.length === 2) {
      sawTwo = true;
      const bad = mods.filter(m => m.tone === 'bad').length;
      assert.ok(bad < 2, `two bad conditions stacked: ${mods.map(m => m.name)}`);
    }
  }
  assert.ok(sawTwo, 'exercised the two-condition path at least once');
});

test('a Spare Blueprint installs a random upgrade level', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.parts = 50; G.openShop();
  const levelsBefore = Object.values(G.run.up).reduce((a, b) => a + b, 0);
  G.buySpecial(G.SPECIALS.find(s => s.key === 'blueprint'));
  const levelsAfter = Object.values(G.run.up).reduce((a, b) => a + b, 0);
  assert.equal(levelsAfter, levelsBefore + 1, 'one upgrade level installed');
});

test('a full career plays many shifts through the live loop without breaking', (G) => {
  G.run = G.newRun(); G.startShift();
  const goOpen = (idx) => { const e = G.game.elev; e.y = idx * G.CFG.floorHeight; e.v = 0; e.doorTarget = 1; e.doors = 1; G.step(2); };
  const shut = () => { const e = G.game.elev; e.doorTarget = 0; e.doors = 0; G.step(2); };
  let guard = 0;
  while (G.run.shiftNum < 8 && guard++ < 30000) {
    const st = G.game.state;
    if (st === 'PLAYING') {
      const riders = G.game.passengers.filter(p => p.state === 'riding');
      const waiting = G.game.passengers.filter(p => p.state === 'waiting');
      if (riders.length) { goOpen(riders[0].dest); shut(); }
      else if (waiting.length) { goOpen(0); shut(); }
      else { shut(); G.step(20); }
    } else if (st === 'SHIFT_DONE') {
      G.openShop();
      for (const u of G.UPGRADES)
        if (G.run.up[u.key] < u.max && G.run.parts >= u.costs[G.run.up[u.key]]) G.buyUpgrade(u);
      G.startShift();
    } else if (st === 'SPIDER') {
      G.keys.add('arrowup'); G.step(3); G.keys.delete('arrowup'); G.step(100);
    } else if (st === 'FIRED') break;
  }
  assert.ok(G.run.shiftNum >= 2, `played multiple shifts (reached ${G.run.shiftNum})`);
  assert.ok(G.run.totalDelivered > 0, 'delivered passengers across the career');
});

test('achievements can fund the entire Workshop', (G) => {
  const totalPerkCost = G.META.reduce((sum, m) => sum + m.costs.reduce((a, b) => a + b, 0), 0);
  assert.ok(G.ACH_TOTAL >= totalPerkCost,
    `total achievement ★ (${G.ACH_TOTAL}) must cover all perks (${totalPerkCost})`);
});

test('★ comes only from achievements (none earned at a clean start)', (G) => {
  assert.equal(G.save.stars, 0, 'fresh profile has no stars');
  assert.equal(G.save.stats.deliveries, 0);
});

test('delivering unlocks "First Fare" and awards its ★', (G) => {
  G.run = G.newRun(); G.startShift();
  assert.ok(G.save.ach.clockIn, 'starting a run unlocks Clock In');
  const before = G.save.stars;
  G.game.passengers = []; addRider(G, 2, 'normal');
  openDoorsAt(G, 2); G.step(3);
  assert.ok(G.save.ach.firstFare, 'First Fare unlocked on first delivery');
  assert.ok(G.save.stars > before, 'the achievement paid ★');
});

test('a spotless shift unlocks "Spotless"', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.delivered = G.game.quota - 1;
  G.game.passengers = []; addRider(G, 2, 'normal');
  openDoorsAt(G, 2); G.step(3);
  assert.equal(G.game.state, 'SHIFT_DONE');
  assert.ok(G.save.ach.perfect, 'no walk-offs → Spotless');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
