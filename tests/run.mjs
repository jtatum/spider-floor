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

test('arrows, WASD, and touch keys all crank — and never stomp each other', (G) => {
  G.run = G.newRun(); G.startShift();
  const e = G.game.elev; e.doorTarget = 0; e.doors = 0;
  for (const key of ['arrowup', 'w', 't-up']) {
    e.y = 0; e.v = 0;
    G.keys.add(key); G.step(20); G.keys.delete(key);
    assert.ok(e.v > 100, `${JSON.stringify(key)} cranks the car (v=${Math.round(e.v)})`);
  }
  // the old bug: touch cleanup deleted the SHARED 'arrowup', killing a held key.
  // Touch now releases only its own synthetic name — the physical arrow survives.
  e.y = 0; e.v = 0;
  G.keys.add('arrowup');         // a physical arrow, held
  G.keys.add('t-up');            // a touch button, also held
  G.keys.delete('t-up');         // touch UI rebinds/releases — its key only
  G.step(20);
  assert.ok(e.v > 100, 'the held arrow key keeps cranking after touch lets go');
  G.keys.delete('arrowup');
});

test('Auto Doors does not soft-lock on a rider that cannot fit', (G) => {
  G.run = G.newRun(); G.run.up.autoDoors = 1; G.startShift();
  G.game.passengers = [];
  for (let i = 0; i < 3; i++) addRider(G, 2, 'normal');     // 3 of 4 slots full
  // a mover waiting at the lobby needs 2 slots — only 1 is free, so it can't board
  G.spawnPassenger(0);
  const mover = G.game.passengers.at(-1);
  mover.kind = 'mover'; mover.size = 2; mover.dest = 2; mover.state = 'waiting'; mover.origin = 0;
  const e = G.game.elev; e.y = 0; e.v = 0; e.doorTarget = 0; e.doors = 0;
  G.step(5);
  assert.equal(e.doorTarget, 0, 'doors are NOT auto-held for a rider that cannot board');
  // but a rider who DOES fit still triggers auto-open (and boards)
  G.spawnPassenger(0);
  const fits = G.game.passengers.at(-1);
  fits.kind = 'normal'; fits.size = 1; fits.dest = 2; fits.state = 'waiting'; fits.origin = 0;
  G.step(50);            // long enough for auto-doors to open fully, then board
  assert.equal(fits.state, 'riding', 'a rider that fits is auto-served and boards');
});

// ── mid-shift leveling ──────────────────────────────────────────────────────

test('deliveries earn XP and a full bar opens a level-up', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.xp = G.run.xpNext - 1;                     // one delivery from leveling
  G.game.passengers = []; addRider(G, 2, 'normal');
  openDoorsAt(G, 2);
  G.step(3);
  assert.equal(G.game.state, 'LEVELUP', 'the game freezes for the pick');
  assert.ok(G.game.levelUp.choices.length >= 3, 'three choices offered');
  assert.equal(G.run.level, 1, 'level counted');
  assert.equal(G.run.levelPending, 0, 'pending level consumed');
});

test('picking a choice installs it and applies mid-shift', (G) => {
  G.run = G.newRun(); G.startShift();
  const before = G.game.m.maxSpeed;
  G.run.levelPending = 1;
  G.step(1);                                        // opens the level-up
  assert.equal(G.game.state, 'LEVELUP');
  const motor = G.UPGRADES.find(u => u.key === 'motor');
  G.game.levelUp.choices = [motor];                 // force a deterministic pick
  G.pickLevel(motor);
  assert.equal(G.run.up.motor, 1, 'installed');
  assert.equal(G.game.state, 'PLAYING', 'back to work');
  assert.ok(G.game.m.maxSpeed > before, 'the new motor works immediately');
});

test('skipping a level-up banks ◆ instead', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.levelPending = 1; G.step(1);
  const before = G.run.parts;
  G.skipLevel();
  assert.equal(G.run.parts, before + 2, 'skip pays +2 ◆');
  assert.equal(G.game.state, 'PLAYING');
});

test('slot caps: a full fitting rack only deepens, never widens', (G) => {
  G.run = G.newRun(); G.startShift();
  const fittings = G.UPGRADES.filter(u => u.kind === 'fitting');
  for (let i = 0; i < G.FITTING_SLOTS; i++) G.run.up[fittings[i].key] = 1;
  const eligible = G.eligibleUpgrades();
  assert.ok(eligible.length > 0, 'still choices (owned levels + habits)');
  for (const u of eligible) {
    assert.ok(u.kind === 'habit' || G.run.up[u.key] > 0,
      `${u.key} is a NEW fitting offered past the cap`);
  }
});

test('a pending level-up resolves before the shift can end', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.levelPending = 1;
  G.game.delivered = G.game.quota;                 // quota met at the same moment
  G.step(1);
  assert.equal(G.game.state, 'LEVELUP', 'the pick comes first');
  G.pickLevel(G.game.levelUp.choices[0]);
  G.step(2);
  assert.equal(G.game.state, 'SHIFT_DONE', 'then the shift closes');
});

// ── down-riders & distance patience ──────────────────────────────────────────

test('patience scales with the length of the trip', (G) => {
  G.run = G.newRun(); G.startShift();
  assert.ok(G.waitPat(8) > G.waitPat(1), 'a long haul earns more waiting patience');
  assert.ok(G.ridePatFor(8) > G.ridePatFor(1), 'and more riding patience');
});

test('an upstairs caller boards on their floor and pays a long-haul bonus', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  G.spawnPassenger(3);
  const p = G.game.passengers.at(-1); normalize(p);
  assert.equal(p.origin, 3, 'waits on floor 3');
  assert.equal(p.dest, 0, 'headed down to the lobby');
  openDoorsAt(G, 3); G.step(4);
  assert.equal(p.state, 'riding', 'boards when you stop at their floor');
  openDoorsAt(G, 0);
  const before = G.run.parts;
  G.step(3);
  assert.equal(p.state, 'delivered');
  assert.equal(G.run.parts - before, 1 + G.CFG.downFareBonus, 'base fare + long-haul bonus');
});

test('an ignored upstairs caller takes the stairs — no strike', (G) => {
  G.run = G.newRun(); G.startShift();
  const e = G.game.elev; e.doorTarget = 0; e.doors = 0; e.y = 0;
  G.game.passengers = [];
  G.spawnPassenger(4);
  const p = G.game.passengers.at(-1); p.patience = 0.0001;
  G.step(2);
  assert.equal(p.state, 'left');
  assert.equal(G.game.strikes, 0, 'no strike for an unanswered call');
  assert.equal(G.game.walkoffsThisShift, 0, 'spotless is intact too');
});

test('down spawns wait for shift 3 unless CHECKOUT DAY rings them in', (G) => {
  G.run = G.newRun(); G.startShift();           // shift 1
  G.game.spawnTimer = 999; G.game.downTimer = 0; G.game.introT = 0;
  G.step(60);
  assert.ok(!G.game.passengers.some(p => p.origin > 0), 'no upstairs calls on shift 1');
  const fx = G.combineFx([G.MODIFIERS.find(m => m.key === 'checkout')]);
  assert.ok(fx.downMul > 1, 'CHECKOUT DAY multiplies down-calls');
});

// ── operators ────────────────────────────────────────────────────────────────

test('operators: Dot learns faster, Gus packs a fitting, Lou gambles', (G) => {
  G.run = G.newRun('dot'); G.startShift();
  G.gainXP(10);
  assert.equal(G.run.xp, 12.5, 'Dot banks +25% XP');

  G.run = G.newRun('gus'); G.startShift();
  const fittings = G.UPGRADES.filter(u => u.kind === 'fitting' && G.run.up[u.key] > 0);
  assert.ok(fittings.length >= 1, 'Gus clocks in with a fitting installed');
  assert.equal(G.habitSlotCap(), 3, 'but only 3 habit slots');

  G.run = G.newRun('lou'); G.startShift();
  assert.equal(G.run.banishes, 2, 'Lou gets +1 banish');
  assert.equal(G.game.lvRerolls, 2, 'and 2 free rerolls per shift');
  G.run.levelPending = 1; G.step(1);
  assert.equal(G.game.levelUp.choices.length, 2, 'but one fewer level-up choice');
});

test('operators: Vera charms riders and VIPs but brakes worse', (G) => {
  G.run = G.newRun('sal'); G.startShift();
  const salBrake = G.game.m.brakeAccel, salPat = G.waitPat(3), salVip = G.game.m.vipRate;
  G.run = G.newRun('vera'); G.startShift();
  assert.ok(G.game.m.brakeAccel < salBrake, 'weaker brakes');
  assert.ok(G.waitPat(3) > salPat, 'more patient riders');
  assert.ok(G.game.m.vipRate > salVip, 'more VIPs');
});

test('operator unlocks read lifetime stats; picks are remembered', (G) => {
  const dot = G.OPERATORS.find(o => o.key === 'dot');
  assert.ok(!G.isOpUnlocked(dot), 'Dot starts locked');
  G.save.stats.deliveries = 25;
  assert.ok(G.isOpUnlocked(dot), 'unlocked by lifetime deliveries');
  G.startWithOperator('dot');
  assert.equal(G.save.lastOperator, 'dot', 'remembered for next time');
  assert.equal(G.run.operator, 'dot');
  assert.equal(G.game.state, 'PLAYING', 'and the shift starts');
});

// ── music loop math ──────────────────────────────────────────────────────────

test('music resume position wraps correctly through the loop', (G) => {
  const cfg = { loopStart: 10, loopEnd: 130 };   // loopLen 120
  const pos = (sAt, sOff, now) => G.musicPosOf(cfg, sAt, sOff, now);
  assert.equal(pos(0, 0, 5), 5, 'still in the intro before the loop point');
  assert.equal(pos(0, 0, 130), 10, 'at loopEnd it has jumped back to loopStart');
  assert.equal(pos(0, 0, 200), 80, 'one pass + 70s into the loop');
  // resuming mid-loop: started at offset 80, 100s later → 80→130 (50s) then wrap +50 → 60
  assert.equal(pos(0, 80, 100), 60, 'resumed offset advances and wraps');
  assert.equal(pos(0, 0, 0), 0, 'the very start');
});

test('a one-shot track hands off to its follow-up, then replays on return', (G) => {
  const M = { victory: { loop: false, then: 'levelup' }, levelup: {}, title: {} };
  const R = (done, name) => G.musicResolve(done, name, M);
  // not yet finished: the victory request plays victory
  assert.deepEqual(R(null, 'victory'), { play: 'victory', clear: false });
  // finished + screen still asks for victory → keep the follow-up going (no restart)
  assert.deepEqual(R('victory', 'victory'), { play: 'levelup', clear: false });
  // finished + the follow-up is what's asked → stay on it, don't forget
  assert.deepEqual(R('victory', 'levelup'), { play: 'levelup', clear: false });
  // navigated to an unrelated screen → forget, so victory can play fresh next win
  assert.deepEqual(R('victory', 'title'), { play: 'title', clear: true });
  // a one-shot with no follow-up resolves to silence
  assert.deepEqual(G.musicResolve('victory', 'victory', { victory: { loop: false } }), { play: null, clear: false });
});

// ── heat ─────────────────────────────────────────────────────────────────────

test('heat is hidden until the cord is cut, then unlocks rung by rung', (G) => {
  assert.equal(G.maxHeatUnlocked(), 0, 'no heat on a fresh profile');
  G.save.beatBoss = true;
  assert.equal(G.maxHeatUnlocked(), 1, 'first win opens heat 1');
  G.save.stats.heatCleared = 3;
  assert.equal(G.maxHeatUnlocked(), 4, 'clearing h unlocks h+1');
  G.save.stats.heatCleared = 99;
  assert.equal(G.maxHeatUnlocked(), G.HEAT.length, 'capped at the top of the ladder');
});

test('newRun clamps heat to what is actually unlocked', (G) => {
  G.run = G.newRun('sal', 5);
  assert.equal(G.run.heat, 0, 'no heat without a boss win');
  G.save.beatBoss = true; G.save.stats.heatCleared = 1;
  G.run = G.newRun('sal', 5);
  assert.equal(G.run.heat, 2, 'clamped to the unlocked rung');
});

test('heat 1 raises quotas; heat 3 removes a strike; heat 4 squeezes patience', (G) => {
  G.save.beatBoss = true; G.save.stats.heatCleared = 4;
  G.run = G.newRun('sal', 0); G.startShift();
  const q0 = G.game.quota, s0 = G.maxStrikes(), p0 = G.waitPat(3);
  G.run = G.newRun('sal', 4); G.startShift();
  assert.equal(G.game.quota, Math.round(q0 * 1.2), 'WORD GETS AROUND raises the quota');
  assert.equal(G.maxStrikes(), s0 - 1, 'CORPORATE AUDIT removes a strike');
  assert.ok(G.waitPat(3) < p0, 'NO LOITERING squeezes patience');
});

test('heat 2: stairs out of order — an ignored call strikes', (G) => {
  G.save.beatBoss = true; G.save.stats.heatCleared = 1;
  G.run = G.newRun('sal', 2); G.startShift();
  const e = G.game.elev; e.doorTarget = 0; e.doors = 0; e.y = 0;
  G.game.passengers = [];
  G.spawnPassenger(4);
  G.game.passengers.at(-1).patience = 0.0001;
  G.step(2);
  assert.equal(G.game.strikes, 1, 'no more free stairs at heat 2');
});

test('a boss win records the heat and pays the ladder achievements', (G) => {
  G.save.beatBoss = true; G.save.stats.heatCleared = 0;
  G.run = G.newRun('sal', 1); G.startShift();
  G.enterBoss();
  const bg = G.game.bossGame; bg.intro = 0;
  let guard = 0;
  while (!bg.result && guard++ < 4000) {
    bg.sState = 'drop'; bg.sInvuln = 0;
    bg.car.y = G.BOSS.carTop + 60; bg.car.v = -400;
    G.update(1 / 60);
  }
  assert.equal(bg.result, 'win');
  G.step(160);
  assert.equal(G.save.stats.heatCleared, 1, 'the cleared rung is recorded');
  assert.ok(G.save.ach.heat1, '"Hotter Days" unlocked');
  assert.equal(G.maxHeatUnlocked(), 2, 'the next rung is open');
});

// ── the webbed office (Spider Floor v2, session 1) ───────────────────────────

test('maze: every floor tile is reachable; the exit is the farthest door', (G) => {
  for (let i = 0; i < 25; i++) {
    const m = G.genMaze(21, 21);
    assert.equal(m.cols % 2, 1); assert.equal(m.rows % 2, 1);
    assert.equal(m.grid[m.entry.y][m.entry.x], 0, 'entry is floor');
    assert.equal(m.grid[m.exit.y][m.exit.x], 0, 'exit is floor');
    const dist = G.bfsDistances(m.grid, m.entry.x, m.entry.y);
    let floors = 0, unreachable = 0, maxD = 0;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (m.grid[y][x] !== 0) continue;
      floors++;
      if (dist[y][x] < 0) unreachable++;
      maxD = Math.max(maxD, dist[y][x]);
    }
    assert.equal(unreachable, 0, `maze #${i}: every floor tile reachable (${unreachable}/${floors} cut off)`);
    assert.equal(dist[m.exit.y][m.exit.x], maxD, 'exit sits at the far end of the BFS');
    assert.ok(maxD >= 20, `the walk to the exit is a real walk (${maxD} tiles)`);
  }
});

test('maze: braiding leaves loops, not a dead-end tree', (G) => {
  for (let i = 0; i < 10; i++) {
    const m = G.genMaze(21, 21);
    let nodes = 0, edges = 0;
    for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
      if (m.grid[y][x] !== 0) continue;
      nodes++;
      if (x + 1 < m.cols && m.grid[y][x + 1] === 0) edges++;
      if (y + 1 < m.rows && m.grid[y + 1][x] === 0) edges++;
    }
    // a perfect maze is a tree (edges = nodes - 1); braiding must add cycles
    assert.ok(edges > nodes - 1, `maze #${i} has loops (${edges} edges, ${nodes} nodes)`);
  }
});

test('maze movement: walls stop you; diagonals slide along them', (G) => {
  const mz = { cols: 5, rows: 3, grid: [[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]] };
  const p = { x: 1.5, y: 1.5 };
  for (let i = 0; i < 200; i++) G.tryMove(mz, p, 0.05, 0);   // run at the east wall
  assert.ok(p.x < 4 - 0.29 && p.x > 3.5, `stopped at the wall (x=${p.x.toFixed(2)})`);
  assert.equal(p.y, 1.5, 'no vertical drift');
  // diagonal into the corridor wall: the blocked axis clamps, the open one moves
  const q = { x: 1.5, y: 1.5 };
  for (let i = 0; i < 20; i++) G.tryMove(mz, q, 0.05, 0.05);
  assert.ok(q.x > 2.0, 'slid along the wall');
  assert.ok(q.y < 1.75, 'held by the wall');
});

test('maze keys are grid-aligned: one arrow walks one corridor', (G) => {
  G.run = G.newRun(); G.startShift();
  G.enterMaze();
  const mz = G.game.maze;
  mz.spiders = []; mz.spitters = []; mz.spawnTimer = 999;
  const P = mz.player;
  // park in an open room so walls don't interfere
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) mz.grid[y][x] = 0;
  P.x = 4.5; P.y = 4.5;
  // a single → must walk PURELY along world +x (one corridor, no drift)
  G.keys.add('arrowright'); G.step(30); G.keys.delete('arrowright');
  assert.ok(P.x > 5.0, `moved along +x (x=${P.x.toFixed(2)})`);
  assert.ok(Math.abs(P.y - 4.5) < 1e-6, `no drift off the corridor (y=${P.y.toFixed(4)})`);
  // the ↑+→ chord is the screen-right cardinal: +x and −y in equal measure
  // (a short walk, so the room's walls never clamp one axis and skew it)
  P.x = 4.5; P.y = 4.5;
  G.keys.add('arrowup'); G.keys.add('arrowright'); G.step(12);
  G.keys.delete('arrowup'); G.keys.delete('arrowright');
  assert.ok(P.x > 4.6 && P.y < 4.4, 'chord moves diagonally in world terms');
  assert.ok(Math.abs((P.x - 4.5) + (P.y - 4.5)) < 1e-6, 'x gained equals y lost — pure screen-right');
});

test('maze: the analog stick stays screen-relative (iso direction mapping)', (G) => {
  const up = G.screenDirToWorld(0, -1);
  assert.ok(up.x < -0.6 && up.y < -0.6, 'screen-up walks into the far corner');
  const right = G.screenDirToWorld(1, 0);
  assert.ok(right.x > 0.6 && right.y < -0.6, 'screen-right crosses the grid diagonally');
  assert.ok(Math.abs(Math.hypot(right.x, right.y) - 1) < 1e-6, 'normalized');
});

test('maze visit: the world freezes, and the far door walks you out', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.passengers = [];
  G.spawnPassenger();
  const rider = G.game.passengers.at(-1);
  const patBefore = rider.patience;
  G.enterMaze();
  assert.equal(G.game.state, 'MAZE');
  const mz = G.game.maze;
  assert.equal(Math.floor(mz.player.x), mz.entry.x, 'you arrive at the entry');
  mz.spiders = []; mz.spawnTimer = 999;             // a quiet visit, for the clock check
  G.step(60);                                       // a second in the office
  assert.equal(rider.patience, patBefore, 'upstairs, nobody ages while you are below');
  mz.player.x = mz.exit.x + 0.5; mz.player.y = mz.exit.y + 0.5;
  G.step(2);
  assert.equal(mz.result, 'out', 'stepping into the other lift starts the exit');
  G.step(140);                                      // the moment plays out
  assert.equal(G.game.state, 'PLAYING', 'and brings you home');
  assert.equal(G.game.maze, null, 'the office is gone behind you');
  assert.ok(G.doorsOpen(), 'the lift opens at the lobby');
});

// ── Spider Floor (the webbed office) ─────────────────────────────────────────

// park below the lobby with the doors open — the office takes you
const enterOffice = (G) => {
  G.game.spider.open = true; G.game.spider.window = 13;
  const e = G.game.elev; e.y = G.SPIDER_Y; e.v = 0; e.doorTarget = 1; e.doors = 1;
  G.step(3);
  return G.game.maze;
};
// quiet the office so a test can stage exactly what it wants
const calm = (mz) => { mz.spiders = []; mz.spitters = []; mz.cocoons = []; mz.spawnTimer = 999; };

test('the shaft below the lobby opens into the webbed office', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G);
  assert.equal(G.game.state, 'MAZE', 'stepped off into the office');
  assert.ok(mz && mz.grid, 'a maze was generated');
  assert.equal(G.save.stats.spiderVisits, 1, 'the visit counts');
  assert.equal(G.run.mazeVisits, 1, 'and the run remembers it');
});

test('auto-sword: no button — it cleaves whatever bunches into the wedge', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G); calm(mz);
  const P = mz.player;
  mz.spiders.push(
    { x: P.x + 0.7, y: P.y, drop: 0, speed: 0, sway: 0, size: 12, dead: false, deadT: 0 },
    { x: P.x + 0.5, y: P.y + 0.4, drop: 0, speed: 0, sway: 0, size: 12, dead: false, deadT: 0 },
  );
  mz.swingCool = 0;
  const xpBefore = G.run.xp;
  G.step(4);
  assert.ok(mz.spiders.every(s => s.dead), 'one swing took both');
  assert.equal(mz.killed, 2);
  assert.equal(mz.loot, 2 * mz.lootPerKill, 'loot per kill, twice');
  assert.equal(G.save.stats.spiders, 2, 'lifetime kills recorded');
  assert.ok(G.run.xp > xpBefore || G.run.level > 0, 'the web is a classroom');
});

test('carrying out through the far door banks the loot', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G); calm(mz);
  mz.loot = 7;
  mz.player.x = mz.exit.x + 0.5; mz.player.y = mz.exit.y + 0.5;
  const before = G.run.parts;
  G.step(3);
  assert.equal(mz.result, 'out', 'stepping into the lift starts the exit');
  G.step(140);
  assert.equal(G.game.state, 'PLAYING');
  assert.equal(G.run.parts, before + 7, 'banked the loot');
  assert.ok(G.doorsOpen(), 'home at the lobby, doors open');
});

test('overwhelmed in the office: a strike, and the loot stays behind', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G); calm(mz);
  const before = G.run.parts, strikesBefore = G.game.strikes;
  const P = mz.player;
  P.hp = 1; P.invuln = 0;
  mz.loot = 9;
  mz.spiders.push({ x: P.x + 0.2, y: P.y, drop: 0, speed: 2, sway: 0, size: 12, dead: false, deadT: 0 });
  mz.swingCool = 999;                      // the sword is busy being dramatic
  let f = 0;
  while (G.game.state === 'MAZE' && !G.game.maze.result && f < 400) { G.update(1 / 60); f++; }
  assert.equal(G.game.maze.result, 'caught');
  G.step(140);
  assert.equal(G.game.state, 'PLAYING');
  assert.equal(G.run.parts, before, 'no loot banked');
  assert.equal(G.game.strikes, strikesBefore + 1, 'took a strike');
});

test('cocoons crack open under the sword for loot, hearts, or fuses', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G); calm(mz);
  const P = mz.player;
  P.hp = 2;                                 // leave room for a heart roll
  mz.cocoons.push({ x: P.x + 0.6, y: P.y, opened: false, sway: 0 });
  mz.swingCool = 0;
  const xpBefore = G.run.xp, fusesBefore = G.run.fuses, lootBefore = mz.loot;
  G.step(4);
  assert.ok(mz.cocoons[0].opened, 'the sword opens it when nothing breathes nearby');
  assert.ok(G.run.xp > xpBefore || G.run.level > 0, 'always pays XP');
  assert.ok(mz.loot > lootBefore || G.run.fuses > fusesBefore || P.hp === 3,
    'and one of: carried loot, a fuse, a heart');
});

test('spitters (visit 2+) web your feet to the carpet', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.mazeVisits = 1;                     // so this entry is visit #2
  G.enterMaze();
  const mz = G.game.maze;
  assert.ok(mz.spitters.length >= 1, 'the second visit has spitters');
  const P = mz.player;
  mz.spiders = []; mz.cocoons = []; mz.spawnTimer = 999;
  mz.globs.push({ x: P.x, y: P.y, sx: P.x, sy: P.y, tx: P.x, ty: P.y, t: 0, dur: 0.01 });
  G.step(3);
  assert.ok(P.rooted > 0, 'webbed in place');
  G.keys.add('arrowdown'); const yBefore = P.y; G.step(5); G.keys.delete('arrowdown');
  assert.equal(P.y, yBefore, 'rooted feet do not move');
});

test('the flow field walks a far spider around the cubicles toward you', (G) => {
  G.run = G.newRun(); G.startShift();
  const mz = enterOffice(G); calm(mz);
  G.spawnMazeSpider(mz);
  const s = mz.spiders[0];
  s.drop = 0;
  const d0 = G.bfsDistances(mz.grid, Math.floor(mz.player.x), Math.floor(mz.player.y))[Math.floor(s.y)][Math.floor(s.x)];
  G.step(120);                              // two seconds of pursuit
  const d1 = G.bfsDistances(mz.grid, Math.floor(mz.player.x), Math.floor(mz.player.y))[Math.floor(s.y)][Math.floor(s.x)];
  assert.ok(d1 < d0, `it closed the maze distance (${d0} → ${d1})`);
});

test('the third visit hangs THE THREAD from a hole in the ceiling', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.mazeVisits = 2;                     // so this entry is visit #3
  G.enterMaze();
  const mz = G.game.maze;
  assert.ok(mz.thread, 'the thread room exists');
  calm(mz);
  mz.player.x = mz.thread.x; mz.player.y = mz.thread.y;
  G.step(2);
  assert.ok(mz.threadSeen, 'you saw it');
  assert.equal(G.save.stats.sawThread, 1, 'and it is remembered');
  assert.ok(G.game.banner && /UP/.test(G.game.banner.text), 'the truth, in so many words');
});

test('the cabin speaker: level-ups always; gameplay only with Cabin Muzak', (G) => {
  assert.equal(G.wantsTinny('LEVELUP', null), true, 'you pick from inside the lift');
  assert.equal(G.wantsTinny('PLAYING', { up: { muzak: 0 } }), false, 'no muzak, full fidelity');
  assert.equal(G.wantsTinny('PLAYING', { up: { muzak: 1 } }), true, 'muzak makes the bed diegetic');
  assert.equal(G.wantsTinny('SHOP', { up: { muzak: 2 } }), false, 'the depot has real speakers');
  assert.equal(G.wantsTinny('TITLE', null), false);
});

test('the Tetris rule: headers defect to Cyrillic, body text stays loyal', (G) => {
  assert.equal(G.cyr('THE SPIDER FLOOR'), 'THЭ SPIDЭЯ FLOOЯ');
  assert.equal(G.cyr('SHIFT 3 SURVIVED'), 'SHIFT 3 SUЯVIVЭD');
  assert.equal(G.cyr('the people\'s worst elevator'), 'the people\'s worst elevator',
    'lowercase passes through untouched');
});

// ── metrics: the local flight recorder ───────────────────────────────────────

test('a survived shift writes a flight-recorder entry with the tuning signals', (G) => {
  G.run = G.newRun('sal'); G.startShift();
  G.game.passengers = [];
  const p = addRider(G, 2, 'normal');
  p.patience = 1.5;                                // a squeaker
  openDoorsAt(G, 2);
  G.step(3);
  G.game.delivered = G.game.quota;
  G.step(2);
  const recs = G.metricsAll().filter(r => r.type === 'shift');
  assert.equal(recs.length, 1, 'one shift record');
  const r = recs[0];
  assert.equal(r.outcome, 'survived');
  assert.equal(r.quota, G.game.quota);
  assert.equal(r.fareCount, 1, 'the delivery was counted');
  assert.ok(r.fares >= 1, 'and its fare');
  assert.equal(r.closeCalls, 1, 'the squeaker registered');
  assert.equal(r.partsEnd, G.run.parts);
  assert.ok('levelsGained' in r && 'dur' in r && 'walkoffs' in r);
});

test('a maze visit writes its record; a fired run writes a run record', (G) => {
  G.run = G.newRun('sal'); G.startShift();
  G.enterMaze();
  const mz = G.game.maze;
  mz.spiders = []; mz.spitters = []; mz.spawnTimer = 999;
  mz.loot = 5; mz.killed = 2;
  mz.player.x = mz.exit.x + 0.5; mz.player.y = mz.exit.y + 0.5;
  G.step(2); G.step(120);
  const mrec = G.metricsAll().filter(r => r.type === 'maze');
  assert.equal(mrec.length, 1);
  assert.equal(mrec[0].result, 'out');
  assert.equal(mrec[0].loot, 5);
  assert.equal(mrec[0].kills, 2);
  G.run.up.motor = 2;
  G.game.strikes = G.maxStrikes();
  G.step(2);                                       // fired
  const rrec = G.metricsAll().filter(r => r.type === 'run');
  assert.equal(rrec.length, 1);
  assert.equal(rrec[0].outcome, 'fired');
  assert.ok(rrec[0].build.includes('motor:2'), 'the build rides along');
  assert.equal(rrec[0].mazeVisits, 1);
});

test('the recorder is a ring buffer and stays out of the save', (G) => {
  for (let i = 0; i < 450; i++) G.metRecord('shift', { i });
  const all = G.metricsAll();
  assert.equal(all.length, 400, 'capped');
  assert.equal(all[0].i, 50, 'oldest records fell off the front');
  assert.equal(G._localStorage.getItem('worstElevatorSave'), null, 'the save key is untouched');
  assert.ok(G.metricsSummary().includes('400 shifts'), 'the summary counts what it holds');
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
  G.save.stats.shifts = 1;            // only "Day One" becomes true (runs still 0)
  G.checkAchievements();
  assert.ok(G.save.ach.dayOne, 'Day One unlocked');
  const dayOne = G.ACHIEVEMENTS.find(a => a.key === 'dayOne');
  assert.equal(G.save.stars - before, Math.round(dayOne.award * 1.5), 'award scaled by Hazard Pay');
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

test('restocking the shelf costs parts, once per visit', (G) => {
  G.run = G.newRun(); G.startShift(); G.run.parts = 20; G.openShop();
  G.rerollShop();                                  // paid restock
  assert.equal(G.run.parts, 17, 'restock costs 3');
  G.rerollShop();                                  // refused — already used
  assert.equal(G.run.parts, 17, 'no second charge');
  G.openShop();                                    // a fresh visit resets the allowance
  G.rerollShop();
  assert.equal(G.run.parts, 14, 'next visit may pay again');
});

test('banish strikes a part from the run and refills the choices', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.levelPending = 1; G.step(1);
  assert.equal(G.game.state, 'LEVELUP');
  assert.equal(G.run.banishes, 1, 'one banish per run');
  const lv = G.game.levelUp;
  const victim = lv.choices[0];
  const n = lv.choices.length;
  G.banishLevel(victim);
  assert.ok(G.run.banished.includes(victim.key), 'gone from the pool');
  assert.equal(G.run.banishes, 0, 'banish spent');
  assert.equal(lv.choices.length, n, 'the card was replaced, not removed');
  assert.ok(!lv.choices.some(u => u.key === victim.key), 'replacement is a different part');
  for (let i = 0; i < 30; i++) assert.ok(!G.levelChoices(4).some(u => u.key === victim.key),
    'never offered again this run');
  const other = lv.choices[0];
  G.banishLevel(other);
  assert.ok(!G.run.banished.includes(other.key), 'a second banish is refused');
});

test('settings persist: slider volumes clamp, shake toggles, all saved to disk', (G) => {
  G.setVol('musicVol', 0.6);
  assert.equal(G.save.musicVol, 0.6, 'slider value lands');
  G.setVol('musicVol', 1.7);
  assert.equal(G.save.musicVol, 1, 'clamped at full');
  G.setVol('sfxVol', 0.01);
  assert.equal(G.save.sfxVol, 0, 'the bottom of the track means OFF');
  G.setVol('musicVol', 0.337);
  assert.equal(G.save.musicVol, 0.34, 'rounded to clean steps');
  G.toggleShake();
  assert.equal(G.save.shake, false, 'shake off');
  const reloaded = G.loadSave();
  assert.equal(reloaded.musicVol, 0.34, 'music volume persisted');
  assert.equal(reloaded.sfxVol, 0, 'sfx volume persisted');
  assert.equal(reloaded.shake, false, 'shake persisted');
});

test('abandoning from the pause modal needs a second tap, then exits to title', (G) => {
  G.run = G.newRun(); G.startShift();
  G.setPaused(true);
  G.abandonRun();                               // first tap only arms it
  assert.equal(G.game.state, 'PLAYING', 'one tap does not abandon');
  G.abandonRun();                               // the deliberate second tap
  assert.equal(G.game.state, 'TITLE', 'two taps walk you out');
  assert.equal(G.paused, false, 'unpaused on the way');
  // arming must NOT survive closing and reopening the modal
  G.run = G.newRun(); G.startShift();
  G.setPaused(true);
  G.abandonRun();                               // armed…
  G.setPaused(false);                           // …but the player resumed instead
  G.setPaused(true);
  G.abandonRun();                               // fresh modal: this is a FIRST tap again
  assert.equal(G.game.state, 'PLAYING', 'arming resets when the modal reopens');
});

test('pause freezes the simulation', (G) => {
  G.run = G.newRun(); G.startShift();
  G.step(10);
  const t = G.game.t, y = G.game.elev.y;
  G.paused = true;
  G.keys.add('arrowup'); G.step(60); G.keys.delete('arrowup');
  assert.equal(G.game.t, t, 'time stands still');
  assert.equal(G.game.elev.y, y, 'the car does not move');
  G.paused = false;
  G.step(10);
  assert.ok(G.game.t > t, 'resumes cleanly');
});

test('holding R abandons the run; a tap does not', (G) => {
  G.run = G.newRun(); G.startShift();
  G.run.parts = 42;
  G.keys.add('r'); G.step(3); G.keys.delete('r');   // a tap (~50ms)
  assert.equal(G.run.parts, 42, 'tap does nothing');
  G.keys.add('r'); G.step(70); G.keys.delete('r');  // held > 1s
  assert.notEqual(G.run.parts, 42, 'held R starts a fresh career');
  assert.equal(G.run.shiftNum, 1, 'back on shift 1');
});

test('opening the doors seats the car level with the floor', (G) => {
  G.run = G.newRun(); G.startShift();
  const e = G.game.elev;
  e.y = 2 * G.CFG.floorHeight + 10;   // misaligned but within tolerance
  e.v = 18;                            // under stopSpeed: doors may open
  e.doorTarget = 1; e.doors = 1;
  G.step(60);
  assert.ok(Math.abs(e.y - 2 * G.CFG.floorHeight) < 1, `car settles level (y off by ${(e.y - 340).toFixed(1)})`);
  assert.equal(e.v, 0, 'no creeping with the doors open');
});

test('surviving a shift persists lifetime stats immediately', (G) => {
  G.run = G.newRun(); G.startShift();
  G.game.delivered = G.game.quota;
  G.update(1 / 60);                    // endShift('quota') fires
  assert.equal(G.game.state, 'SHIFT_DONE');
  const reloaded = G.loadSave();
  assert.equal(reloaded.stats.shifts, 1, 'shift recorded on disk before the run ends');
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
      else if (waiting.length) { goOpen(waiting[0].origin); shut(); }
      else { shut(); G.step(20); }
    } else if (st === 'LEVELUP') {
      G.pickLevel(G.game.levelUp.choices[0]);     // take whatever's on top
    } else if (st === 'SHIFT_DONE') {
      G.openShop();
      G.startShift();
    } else if (st === 'MAZE') {
      const mz = G.game.maze;
      mz.player.x = mz.exit.x + 0.5; mz.player.y = mz.exit.y + 0.5;
      G.step(2); G.step(120);                       // step into the lift, ride the exit out
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

test('the rooftop boss is reachable once the Spider Floor is discovered', (G) => {
  G.run = G.newRun(); G.startShift();
  G.save.stats.spiderVisits = 1;        // discovered
  G.enterBoss();
  assert.equal(G.game.state, 'BOSS');
  assert.ok(G.game.bossGame.sHp > 0 && G.game.bossGame.car.hp === 4);
  assert.equal(G.save.stats.bossTries, 1, 'attempt recorded');
  assert.ok(G.save.ach.climb, 'The Long Climb unlocked on attempt');
});

test('ramming the exposed spider damages it; beating it wins + cuts the cord', (G) => {
  G.run = G.newRun(); G.startShift();
  G.enterBoss();
  const bg = G.game.bossGame; bg.intro = 0;
  const before = G.save.stars;
  // force a kill: park the spider exposed and slam the car up into it repeatedly
  let guard = 0;
  while (!bg.result && guard++ < 4000) {
    bg.sState = 'drop'; bg.sInvuln = 0;                 // keep it exposed/vulnerable
    bg.car.y = G.BOSS.carTop + 60; bg.car.v = -400;     // fast upward ram
    G.update(1 / 60);
  }
  assert.equal(bg.result, 'win', 'spider defeated');
  G.step(160);                                          // resolve the exit
  assert.equal(G.game.state, 'VICTORY');
  assert.equal(G.save.beatBoss, true, 'the cord is cut (persisted flag)');
  assert.ok(G.save.ach.cutCord, 'Cut the Cord unlocked');
  assert.ok(G.save.stars >= before + 30, 'the +30 ★ achievement paid out');
});

test('losing the boss ends the run in the web', (G) => {
  G.run = G.newRun(); G.startShift();
  G.enterBoss();
  const bg = G.game.bossGame; bg.intro = 0;
  bg.car.hp = 0;                 // overwhelmed
  G.update(1 / 60);
  assert.equal(bg.result, 'lose');
  G.step(160);
  assert.equal(G.game.state, 'FIRED');
  assert.equal(G.game.bossLost, true);
  assert.equal(G.save.beatBoss, false, 'the cord is not cut on a loss');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
