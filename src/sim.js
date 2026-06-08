// THE SPIDER FLOOR — input, simulation, spider floor
// (loaded as an ordered classic script; all files share one global scope)

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
    if (k === 'a') { menu = 'ACH'; return; }
    if (k >= '1' && k <= '9') { const i = parseInt(k, 10) - 1; if (i < META.length) buyMeta(META[i]); }
    return;
  }
  if (st === 'ACH') {
    if (k === 'enter' || k === 'escape' || k === 'a' || k === 'm') { menu = null; return; }
    return;
  }
  if (st === 'TITLE') {
    if (k === ' ' || k === 'enter') { run = newRun(); startShift(); }
    if (k === 'm') { menu = 'WORKSHOP'; }
    if (k === 'a') { menu = 'ACH'; }
    return;
  }
  if (st === 'FIRED') {
    if (k === ' ' || k === 'enter') { menu = null; game.bossLost = false; game.state = 'TITLE'; }
    if (k === 'm') { menu = 'WORKSHOP'; }
    if (k === 'a') { menu = 'ACH'; }
    return;
  }
  if (st === 'VICTORY') {
    if (k === ' ' || k === 'enter') { menu = null; game.state = 'TITLE'; }
    return;
  }
  if (st === 'SHIFT_DONE') {
    if (k === ' ' || k === 'enter') openShop();
    // once you've seen the Spider Floor, you may climb to the roof and end it
    if (k === 'c' && save.stats.spiderVisits >= 1) enterBoss();
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
  if (achToasts.length) { for (const t of achToasts) t.t -= dt; achToasts = achToasts.filter(t => t.t > 0); }
  if (game && game.flash) { game.flash.t -= dt; if (game.flash.t <= 0) game.flash = null; }
  if (game && game.shake > 0) game.shake = Math.max(0, game.shake - dt * 25);
  if (game && game.elev) game.elev.jamFlash = Math.max(0, game.elev.jamFlash - dt);
  if (game && game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
  if (game && (game.state === 'SHIFT_DONE' || game.state === 'FIRED')) game.doneT += dt;
  if (game) updateFx(dt);   // particles / floating text decay in every state

  if (game && game.state === 'SPIDER') { updateSpider(dt); return; }
  if (game && game.state === 'BOSS') { updateBoss(dt); return; }
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
        // achievement stats
        save.stats.deliveries++;
        if (p.kind === 'vip') save.stats.vips++;
        else if (p.kind === 'tipper') save.stats.tippers++;
        else if (p.kind === 'mover') save.stats.movers++;
        bumpStat('bestRunParts', run.parts);
        bumpStat('bestShiftDeliveries', game.delivered);
        checkAchievements();
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
  game.walkoffsThisShift++;       // any walk-off (even forgiven) breaks a "spotless" shift
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
    spaceWas: false, hitFlash: 0, killed: 0, hitTaken: false,
  };
  save.stats.spiderVisits++; checkAchievements();
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
        P.hp--; P.invuln = 1.2; P.hurtT = 0.4; sg.hitFlash = 0.3; sg.hitTaken = true;
        flash('#7a1030', 0.25); shake(9); sfx.hurt();
        s.x += (s.x < P.x ? -1 : 1) * 34; s.hitCool = 0.6;
      }
    }
    if (swinging && !s.dead && Math.abs(s.x - hx) < reach && Math.abs(s.y - hy) < 44) {
      s.dead = true; s.deadT = 0; s.vyDead = -160; s.vxDead = P.facing * 80;
      sg.loot += sg.lootPerKill; sg.killed++;
      save.stats.spiders++; checkAchievements();
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
    bumpStat('bestSpiderLoot', got);
    bumpStat('bestRunParts', run.parts);
    if (!sg.hitTaken && sg.killed >= 3) { save.stats.noHitClears++; checkAchievements(); }
  }
  // back up to the lobby; the webbed floor seals behind you
  game.spider.open = false; game.spider.used = true; game.spider.glow = 0;
  const e = game.elev;
  e.y = 0; e.v = 0; e.doors = 1; e.doorTarget = 1; e.wasReady = false;
  game.spiderGame = null;
  game.state = 'PLAYING';
}

// ──────────────────────────────────────────── the rooftop boss
// The truth: the lift hangs from a giant spider's thread. You climb above the
// penthouse and fight it — by ramming it with your own elevator. Momentum (the
// thing the whole game taught you) is the weapon. Dodge its telegraphed leg
// sweeps and falling brood; slam it when it drops down exposed. Win → the cord
// is cut and the lift runs free; lose → the run ends in the web.
const BOSS = {
  carW: 150, carH: 86, carTop: 188, carBot: H - 70,
  accel: 760, brake: 1100, maxV: 440, coast: 0.95,
  spiderR: 34, restY: 110, lowY: 168,
};

function enterBoss() {
  save.stats.bossTries++; checkAchievements();
  game.state = 'BOSS';
  const hp = 6 + Math.floor((run.shiftNum - 1) / 3);   // scales a little with how far you got
  game.bossGame = {
    t: 0, intro: 3.2, result: null, exitT: 0,
    sHp: hp, sMaxHp: hp, sY: BOSS.restY, sState: 'wind', sTimer: 1.6, sInvuln: 0, sShake: 0,
    attackKind: null, danger: null, sway: 0,
    car: { y: (BOSS.carTop + BOSS.carBot) / 2, v: 0, hp: 4, maxHp: 4, invuln: 0, hitFlash: 0, webbed: 0 },
    minis: [], fx: [], spaceWas: false,
  };
  sfx.spider();
}

function bossSpawnMini(bg, x) {
  bg.minis.push({ x: x ?? (W / 2 + (Math.random() - 0.5) * 200), y: bg.sY + 30, vy: 90 + Math.random() * 70, r: 9 + Math.random() * 3, sway: Math.random() * 6 });
}
function bossPop(bg, x, y, color, n = 8) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 7, s = 40 + Math.random() * 130; bg.fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0, max: 0.5, color }); }
}

function updateBoss(dt) {
  const bg = game.bossGame;
  if (!bg) { game.state = 'PLAYING'; return; }
  bg.t += dt; bg.sway += dt * 2;
  if (bg.sShake > 0) bg.sShake -= dt;
  for (const f of bg.fx) { f.life += dt; f.vy += 240 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
  bg.fx = bg.fx.filter(f => f.life < f.max);

  if (bg.intro > 0) { bg.intro -= dt; return; }            // hold during the reveal card
  if (bg.result) { bg.exitT += dt; if (bg.exitT > 2.2) exitBoss(); return; }

  const C = bg.car;
  if (C.invuln > 0) C.invuln -= dt;
  if (C.webbed > 0) C.webbed -= dt;
  if (bg.sInvuln > 0) bg.sInvuln -= dt;

  // ── crank the car (momentum, snappier than the day job) ──
  let input = 0;
  if (keys.has('arrowup') || keys.has('w')) input -= 1;     // up = toward the spider
  if (keys.has('arrowdown') || keys.has('s')) input += 1;
  const grip = C.webbed > 0 ? 0.45 : 1;                     // web slows the crank
  if (input !== 0) {
    const braking = Math.sign(input) !== Math.sign(C.v) && Math.abs(C.v) > 1;
    C.v += input * (braking ? BOSS.brake : BOSS.accel) * grip * dt;
  } else { C.v *= Math.pow(BOSS.coast, dt * 60); if (Math.abs(C.v) < 3) C.v = 0; }
  C.v = Math.max(-BOSS.maxV, Math.min(BOSS.maxV, C.v));
  C.y += C.v * dt;
  if (C.y < BOSS.carTop) { C.y = BOSS.carTop; if (C.v < 0) C.v = 0; }
  if (C.y > BOSS.carBot) { C.y = BOSS.carBot; C.v = 0; }

  // ── spider behaviour: wind-up → strike → drop-down (exposed) → recoil ──
  bg.sTimer -= dt;
  const targetY = bg.sState === 'drop' ? BOSS.lowY : bg.sState === 'recoil' ? BOSS.restY - 24 : BOSS.restY;
  bg.sY += (targetY - bg.sY) * Math.min(1, 8 * dt);
  if (bg.sTimer <= 0) {
    if (bg.sState === 'wind') {
      // commit the telegraphed attack
      if (bg.attackKind === 'sweep') {
        bg.danger.active = true; sfx.hurt();
      } else if (bg.attackKind === 'brood') {
        const n = 2 + Math.floor(run.shiftNum / 4);
        for (let i = 0; i < Math.min(4, n); i++) bossSpawnMini(bg);
        bg.danger = null;
      }
      bg.sState = 'strike'; bg.sTimer = 0.45;
    } else if (bg.sState === 'strike') {
      bg.danger = null; bg.sState = 'drop'; bg.sTimer = 1.7;     // exposed
    } else { // drop or recoil → wind up the next attack
      bg.attackKind = Math.random() < 0.55 ? 'sweep' : 'brood';
      if (bg.attackKind === 'sweep') {
        const y = BOSS.carTop + 80 + Math.random() * (BOSS.carBot - BOSS.carTop - 120);
        bg.danger = { y, h: 64, active: false };
      }
      bg.sState = 'wind'; bg.sTimer = 1.15;
    }
  }

  // ── leg-sweep danger band ──
  if (bg.danger && bg.danger.active) {
    if (Math.abs(C.y - bg.danger.y) < BOSS.carH / 2 + bg.danger.h / 2 && C.invuln <= 0) bossHurt(bg);
  }
  // ── falling brood ──
  for (const m of bg.minis) {
    m.y += m.vy * dt; m.sway += dt * 8; m.x += Math.sin(m.sway) * 0.4;
    if (Math.abs(m.x - W / 2) < BOSS.carW / 2 && Math.abs(m.y - C.y) < BOSS.carH / 2 + m.r && C.invuln <= 0) {
      bossHurt(bg); m.y = H + 99;
    }
  }
  bg.minis = bg.minis.filter(m => m.y < H + 40);

  // ── ram the spider with the car ──
  const carTopEdge = C.y - BOSS.carH / 2;
  const spiderBottom = bg.sY + BOSS.spiderR;
  if (carTopEdge <= spiderBottom + 4) {
    if (bg.sState === 'drop' && bg.sInvuln <= 0 && C.v < -40) {
      const dmg = C.v < -250 ? 2 : 1;
      bg.sHp -= dmg; bg.sInvuln = 1.0; bg.sShake = 0.4;
      bg.sState = 'recoil'; bg.sTimer = 0.8;
      C.v = 240; bossPop(bg, W / 2, spiderBottom, '#ff3a5a', 14);
      floatBoss(bg, `-${dmg}`, '#ff5a74'); shake(8); sfx.slash();
      if (bg.sHp <= 0) { bg.sHp = 0; bg.result = 'win'; shake(14); sfx.fanfare(); }
    } else {
      C.v = Math.max(C.v, 150);          // armoured — bounce off
    }
    C.y = Math.max(C.y, spiderBottom + BOSS.carH / 2 + 2);
  }

  if (C.hp <= 0 && !bg.result) { bg.result = 'lose'; shake(12); sfx.caught(); }
}
function bossHurt(bg) {
  const C = bg.car;
  C.hp--; C.invuln = 1.2; C.hitFlash = 0.3;
  if (bg.attackKind === 'sweep' && Math.random() < 0.5) C.webbed = 2.0;
  flash('#7a1030', 0.3); shake(9); sfx.hurt();
}
function floatBoss(bg, text, color) { bg.fx.push({ x: W / 2, y: bg.sY + 40, vx: 0, vy: -45, life: 0, max: 1.0, color, text }); }

function exitBoss() {
  const bg = game.bossGame;
  if (bg.result === 'win') {
    save.stats.bossWins++;
    save.beatBoss = true;
    checkAchievements();          // Cut the Cord (+30★) fires here
    persist();
    game.state = 'VICTORY';
    game.doneT = 0;
  } else {
    save.best.shifts = Math.max(save.best.shifts, run.shiftNum - 1);
    save.best.delivered = Math.max(save.best.delivered, run.totalDelivered);
    persist();
    game.bossLost = true;
    game.state = 'FIRED';
    game.doneT = 0;
  }
  game.bossGame = null;
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
  if (run.up[u.key] >= u.max) {       // hit max → achievement stats
    save.stats.everMaxed++;
    run.maxedThisRun = (run.maxedThisRun || 0) + 1;
    bumpStat('bestMaxedRun', run.maxedThisRun);
    checkAchievements();
  }
  bumpStat('bestRunParts', run.parts);
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
  recomputePerks(); checkAchievements();
  persist();
  sfx.buy();
}

