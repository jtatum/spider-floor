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

// Every held direction has three dialects — arrows, WASD, and the synthetic
// 't-*' names the touch buttons feed in. The sim only ever asks these.
const heldUp     = () => keys.has('arrowup')    || keys.has('w') || keys.has('t-up');
const heldDown   = () => keys.has('arrowdown')  || keys.has('s') || keys.has('t-down');
const heldLeft   = () => keys.has('arrowleft')  || keys.has('a') || keys.has('t-left');
const heldRight  = () => keys.has('arrowright') || keys.has('d') || keys.has('t-right');
const heldAction = () => keys.has(' ')          || keys.has('t-act');

let paused = false;
let abandonArm = false;   // the pause modal's ABANDON needs a second tap

function setPaused(v) {
  paused = v;
  abandonArm = false;     // a fresh modal never starts armed
}

function toggleMute() {
  save.muted = !save.muted;
  sfx.setMuted(save.muted);
  persist();
  if (game && game.state === 'PLAYING') {
    game.banner = { text: save.muted ? 'SOUND OFF' : 'SOUND ON', t: 1.0, color: '#7a6a4a' };
  }
}

// ── settings: slider volumes, shake toggle, abandon ──
function setVol(key, v) {
  v = Math.max(0, Math.min(1, v));
  if (v < 0.03) v = 0;                 // the bottom of the track means OFF, cleanly
  save[key] = Math.round(v * 100) / 100;
  sfx.setVolumes(save.musicVol ?? 1, save.sfxVol ?? 1);
  persist();
}
function toggleShake() {
  save.shake = save.shake === false;   // false → true, anything else → false
  persist();
  sfx.door();
}
// abandon from the modal: drop the run and walk back to the title. (Hold-R
// remains the keyboard quick-restart; this is the touch-reachable way out.)
function abandonRun() {
  if (!abandonArm) { abandonArm = true; sfx.buzz(); return; }
  setPaused(false);
  menu = null;
  game.state = 'TITLE';
  sfx.door();
}

function handleKey(k) {
  const st = menu || (game ? game.state : 'TITLE');

  if (k === 'm') { toggleMute(); return; }     // mute works everywhere
  const pausable = !menu && (st === 'PLAYING' || st === 'BOSS' || st === 'MAZE');
  if (paused) {                                 // frozen: only resume gets through
    if (k === 'p' || k === 'escape') setPaused(false);
    return;
  }
  if (pausable && (k === 'p' || k === 'escape')) { setPaused(true); return; }

  if (st === 'WORKSHOP') {
    if (k === 'enter' || k === 'escape' || k === 'w') { menu = null; return; }
    if (k === 'a') { menu = 'ACH'; return; }
    if (k >= '0' && k <= '9') {
      const i = k === '0' ? 9 : parseInt(k, 10) - 1;
      if (i < META.length) buyMeta(META[i]);
    }
    return;
  }
  if (st === 'ACH') {
    if (k === 'enter' || k === 'escape' || k === 'a' || k === 'w') { menu = null; return; }
    return;
  }
  if (st === 'TITLE') {
    if (k === ' ' || k === 'enter') { openOperatorSelect(); }
    if (k === 'w') { menu = 'WORKSHOP'; }
    if (k === 'a') { menu = 'ACH'; }
    if (k === 's') { menu = 'SETTINGS'; }
    // DEV: jump straight into the webbed office (the live Spider Floor) for
    // playtesting, without waiting for a shaft window to roll.
    if (k === 'x') { run = newRun(save.lastOperator || 'sal'); startShift(); enterMaze(); }
    return;
  }
  if (st === 'SETTINGS') {
    if (k === 'enter' || k === 'escape' || k === 's') { menu = null; return; }
    return;
  }
  if (st === 'OPERATOR') {
    if (k === 'escape') { menu = null; return; }
    if (k === 'h' && maxHeatUnlocked() > 0) { cycleHeat(); return; }
    if (k === ' ' || k === 'enter') { startWithOperator(save.lastOperator || 'sal'); return; }
    if (k >= '1' && k <= '9') {
      const o = OPERATORS[parseInt(k, 10) - 1];
      if (o && isOpUnlocked(o)) startWithOperator(o.key);
      else if (o) sfx.buzz();
    }
    return;
  }
  if (st === 'FIRED') {
    if (k === ' ' || k === 'enter') { menu = null; game.bossLost = false; game.state = 'TITLE'; }
    if (k === 'w') { menu = 'WORKSHOP'; }
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
    if (k === 'f') buyFuse();
    if (k === 'z') buySpecial(shop.offers[0]);
    if (k === 'x') buySpecial(shop.offers[1]);
    if (k === 'r') rerollShop();
    return;
  }
  if (st === 'LEVELUP') {
    const lv = game.levelUp;
    if (!lv) return;
    if (k >= '1' && k <= '9') {
      const i = parseInt(k, 10) - 1;
      if (i < lv.choices.length) (lv.banishMode ? banishLevel : pickLevel)(lv.choices[i]);
    }
    if (k === 'r') rerollLevel();
    if (k === 's') skipLevel();
    if (k === 'b') {
      if (run.banishes > 0) { lv.banishMode = !lv.banishMode; sfx.door(); }
      else sfx.buzz();
    }
    return;
  }
  if (st === 'PLAYING') {
    if (k === ' ') toggleDoors();
    // (restarting mid-run is hold-R, handled in update — a tap can't wipe a career)
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

// ── mouse / touch (title / shop / done buttons, settings sliders) ──
const buttons = [];   // {x,y,w,h,fn} rebuilt each render for clickable screens
const sliders = [];   // {x,y,w,h,tx,tw,set} rebuilt each render (settings panel)
function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { mx: (ev.clientX - r.left) * (W / r.width), my: (ev.clientY - r.top) * (H / r.height) };
}
canvas.addEventListener('click', ev => {
  sfx.resume();
  const { mx, my } = canvasPos(ev);
  for (const b of buttons) {
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { b.fn(); return; }
  }
});
// sliders are draggable: grab anywhere on the track, value follows the pointer
let activeSlider = null;
canvas.addEventListener('pointerdown', ev => {
  const { mx, my } = canvasPos(ev);
  for (const s of sliders) {
    if (mx >= s.x && mx <= s.x + s.w && my >= s.y && my <= s.y + s.h) {
      activeSlider = s;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      s.set((mx - s.tx) / s.tw);
      ev.preventDefault();
      return;
    }
  }
});
canvas.addEventListener('pointermove', ev => {
  if (!activeSlider) return;
  activeSlider.set((canvasPos(ev).mx - activeSlider.tx) / activeSlider.tw);
});
const releaseSlider = () => { activeSlider = null; };
canvas.addEventListener('pointerup', releaseSlider);
canvas.addEventListener('pointercancel', releaseSlider);

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

// patience scales with the trip being asked for — a hop is not a haul
function heatPatMul() { return runHeat() >= 4 ? 0.88 : 1; }   // NO LOITERING
function waitPat(dist) {
  return (CFG.patienceTime + CFG.patPerFloor * dist) * game.m.patWaitMul * game.patMul * heatPatMul();
}
function ridePatFor(dist) {
  return (CFG.ridePatience + CFG.ridePatPerFloor * dist) * game.m.patRideMul * game.patMul * heatPatMul();
}

function spawnPassenger(origin = 0) {
  const fx = game.fx;
  const top = activeMaxIdx();
  let dest;
  if (origin > 0) {
    dest = 0;             // an upstairs caller, headed down to the lobby and out
  } else if (fx.destHigh && top >= 2) {
    // destination: uniform, or biased to the upper floors under "EVERYONE UP"
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

  let pat = waitPat(Math.abs(dest - origin));
  if (kind === 'nervous') pat *= 0.6;
  game.passengers.push({
    id: game.nextId++,
    origin,
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
  if (paused) return;                 // P / ESC — the building holds its breath
  if (achToasts.length) { for (const t of achToasts) t.t -= dt; achToasts = achToasts.filter(t => t.t > 0); }
  if (game && game.flash) { game.flash.t -= dt; if (game.flash.t <= 0) game.flash = null; }
  if (game && game.shake > 0) game.shake = Math.max(0, game.shake - dt * 25);
  if (game && game.elev) game.elev.jamFlash = Math.max(0, game.elev.jamFlash - dt);
  if (game && game.banner) { game.banner.t -= dt; if (game.banner.t <= 0) game.banner = null; }
  if (game && (game.state === 'SHIFT_DONE' || game.state === 'FIRED')) game.doneT += dt;
  if (game) updateFx(dt);   // particles / floating text decay in every state

  if (game && game.state === 'MAZE') { updateMaze(dt); return; }
  if (game && game.state === 'BOSS') { updateBoss(dt); return; }
  if (!game || game.state !== 'PLAYING') return;
  game.t += dt;
  game.shiftTime += dt;

  // hold R to abandon the run — a tap does nothing, so no fat-fingered wipes
  if (keys.has('r')) {
    game.abandonT = (game.abandonT || 0) + dt;
    if (game.abandonT >= 1.0) { keys.delete('r'); run = newRun(run.operator); startShift(); return; }
  } else game.abandonT = 0;
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
    if (heldUp()) input += 1;
    if (heldDown()) input -= 1;
  }
  if (!canMove) {
    // doors unlatched: the car seats itself on the landing instead of creeping
    // off-level with the doors open (you can open while drifting < stopSpeed)
    const anchorY = (sp.open && Math.abs(e.y - SPIDER_Y) < CFG.floorHeight * 0.5)
      ? SPIDER_Y : nearestFloorIdx(e.y) * CFG.floorHeight;
    e.v = 0;
    e.y += (anchorY - e.y) * Math.min(1, 12 * dt);
    if (Math.abs(anchorY - e.y) < 0.5) e.y = anchorY;
  } else if (input !== 0) {
    // cranking with the grain accelerates; against it, the reverse-crank brakes
    const braking = Math.sign(input) !== Math.sign(e.v) && Math.abs(e.v) > 1;
    const brakeA = m.brakeAccel * (game.brakeBoost || 1);
    e.v += input * (braking ? brakeA : accelE) * dt;
    // hard reverse-cranking makes the cables complain
    game.creakCool = Math.max(0, (game.creakCool || 0) - dt);
    if (braking && Math.abs(e.v) > 140 && game.creakCool <= 0) {
      sfx.creak();
      game.creakCool = 0.28 + Math.random() * 0.2;
    }
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

  // step off into the Spider Floor: park at the webbed depth and the office takes you
  if (sp.open && Math.abs(e.y - SPIDER_Y) < CFG.alignTolerance && isStopped() && doorsOpen()) {
    enterMaze(); return;
  }

  // ── spawns ──
  game.spawnTimer -= dt;
  const lobbyWaiting = game.passengers.filter(p => p.state === 'waiting' && p.origin === 0).length;
  if (game.spawnTimer <= 0 && lobbyWaiting < 7) {
    spawnPassenger();
    game.spawnTimer = game.spawnInterval * (0.8 + Math.random() * 0.4);
  }
  // upstairs calls: riders on upper floors heading down. They run on their own
  // timer so they're extra revenue, not lobby pressure — and from shift 3 only,
  // unless CHECKOUT DAY rings the whole building at once.
  if (run.shiftNum >= 3 || game.fx.downMul > 1) {
    game.downTimer -= dt;
    const downWaiting = game.passengers.filter(p => p.state === 'waiting' && p.origin > 0).length;
    if (game.downTimer <= 0 && downWaiting < 3 && activeMaxIdx() >= 2) {
      spawnPassenger(1 + Math.floor(Math.random() * activeMaxIdx()));
      game.downTimer = (game.spawnInterval * 2.6 / game.fx.downMul) * (0.8 + Math.random() * 0.4);
    }
  }

  // ── passengers ──
  const ci = nearestFloorIdx(e.y);
  const aligned = isAligned();
  const open = doorsOpen();
  const cap = capacityNow();

  // Auto Doors: open themselves when you stop at a floor that needs you.
  // Only hold for a waiting rider that can ACTUALLY board — otherwise a mover
  // that needs two slots but finds only one free would reopen the doors forever
  // (you'd press to close, auto-doors reopens, repeat: a soft-lock).
  if (m.autoDoors && aligned && isStopped() && e.doorTarget === 0) {
    const wantsHere = game.passengers.some(p => p.state === 'riding' && p.dest === ci);
    const callJob = game.passengers.some(p => p.state === 'waiting' && p.origin === ci &&
                                              slotsAboard() + (p.size || 1) <= cap);
    if (wantsHere || callJob) { e.doorTarget = 1; sfx.door(); }
  }

  // board: anyone waiting at THIS floor, aligned, open, with room — FIFO (movers take 2 slots)
  if (aligned && open) {
    const waiting = game.passengers.filter(p => p.state === 'waiting' && p.origin === ci);
    for (const p of waiting) {
      if (slotsAboard() + p.size > cap) continue;   // won't fit — skip, try the next
      p.state = 'riding';
      p.reveal = CFG.rememberTime;
      // patience resets to the ride pool, scaled by the trip still ahead
      p.patience = ridePatFor(Math.abs(p.dest - ci)) * (p.kind === 'nervous' ? 0.6 : 1);
      p.patienceMax = p.patience;
      p.shoutT = 1.5;       // they SHOUT the floor as they step in — a speech bubble
      sfx.board();
    }
  }

  for (const p of game.passengers) {
    p.bob += dt * 2.2;
    if (p.shoutT > 0) p.shoutT -= dt;
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
        if (p.origin > 0) fare += CFG.downFareBonus;   // long-haul: upstairs callers pay extra
        if (game.m.surge && lobbyWaiting >= 4) fare += game.m.surge;   // Surge Pricing
        fare = Math.max(1, fare);
        run.parts += fare;
        game.partsThisShift += fare;
        gainXP(CFG.xpDeliver + CFG.xpPerFare * fare);   // rich fares teach you more
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
  // an earned level-up interrupts before the shift can close — you always get your pick
  if (run.levelPending > 0) { openLevelUp(); return; }
  if (game.delivered >= game.quota) { endShift('quota'); return; }
}

// ─────────────────────────────────────────── mid-shift level-ups
// The Vampire-Survivors heartbeat: XP from deliveries → the game freezes →
// pick 1 of 3. Slots cap how many DISTINCT parts you can own, so a build is
// a commitment; once a category is full, level-ups only deepen what you have.

function slotsUsed(kind) {
  return UPGRADES.filter(u => u.kind === kind && run.up[u.key] > 0).length;
}
function eligibleUpgrades() {
  return UPGRADES.filter(u => {
    if (run.up[u.key] >= u.max || run.banished.includes(u.key)) return false;
    if (run.up[u.key] > 0) return true;     // deepening what you own is always allowed
    const cap = u.kind === 'habit' ? habitSlotCap() : fittingSlotCap();
    return slotsUsed(u.kind) < cap;
  });
}
// the clock-in screen's heat dial (only shown once the cord has been cut)
let menuHeat = 0;
function openOperatorSelect() {
  menuHeat = Math.max(0, Math.min(maxHeatUnlocked(), save.lastHeat || 0));
  menu = 'OPERATOR';
}
function cycleHeat() {
  menuHeat = (menuHeat + 1) % (maxHeatUnlocked() + 1);
  sfx.door();
}
function startWithOperator(key) {
  save.lastOperator = key;
  save.lastHeat = menuHeat;
  persist();
  menu = null;
  run = newRun(key, menuHeat);
  startShift();
}
function levelChoices(n) { return shuffle(eligibleUpgrades()).slice(0, n); }

function openLevelUp() {
  run.levelPending--;
  const n = Math.max(2, 3 + (save.meta.bigShop || 0) + (OP().choiceDelta || 0));
  const choices = levelChoices(n);
  if (!choices.length) {                    // fully built: the level cashes out
    run.parts += 3;
    floatText('+3 ◆', '#d4a050');
    return;
  }
  game.levelUp = { choices, banishMode: false, paidRerolls: 0 };
  game.state = 'LEVELUP';
  sfx.power();
}
function pickLevel(u) {
  run.up[u.key]++;
  if (run.up[u.key] >= u.max) {
    save.stats.everMaxed++;
    run.maxedThisRun = (run.maxedThisRun || 0) + 1;
    bumpStat('bestMaxedRun', run.maxedThisRun);
    checkAchievements();
  }
  game.m = mods();                          // relief applies NOW, mid-shift
  game.levelUp = null;
  game.state = 'PLAYING';
  const tag = UP_TAGS[u.tag] || { color: '#bfa45f' };
  game.banner = { text: run.up[u.key] > 1 ? `${u.name}  Lv${run.up[u.key]}` : `${u.name} INSTALLED`,
                  t: 1.5, color: tag.color };
  sfx.buy();
}
function skipLevel() {
  run.parts += 2;
  game.levelUp = null;
  game.state = 'PLAYING';
  floatText('+2 ◆', '#d4a050');
  sfx.chime();
}
function rerollLevel() {
  const lv = game.levelUp;
  if (game.lvRerolls > 0) game.lvRerolls--;
  else if (lv.paidRerolls < 1 && run.parts >= REROLL_COST) { run.parts -= REROLL_COST; lv.paidRerolls++; }
  else { sfx.buzz(); return; }
  lv.choices = levelChoices(lv.choices.length);
  sfx.buy();
}
// banish: strike a part from this run's pool forever (1 per run). The card is
// replaced in the current choices, so banishing never costs you the pick.
function banishLevel(u) {
  if (run.banishes <= 0 || run.banished.includes(u.key)) { sfx.buzz(); return; }
  run.banishes--;
  run.banished.push(u.key);
  const lv = game.levelUp;
  lv.banishMode = false;
  const i = lv.choices.indexOf(u);
  const pool = eligibleUpgrades().filter(x => !lv.choices.includes(x));
  if (i >= 0) {
    if (pool.length) lv.choices[i] = pool[Math.floor(Math.random() * pool.length)];
    else lv.choices.splice(i, 1);
  }
  if (!lv.choices.length) { skipLevel(); return; }
  sfx.slash();
}

function losePassenger(p) {
  // an upstairs caller you never picked up just takes the stairs — you lose the
  // fare, not your job. (Once they're ABOARD, they're yours like anyone else.)
  // At heat 2+ the STAIRS ARE OUT OF ORDER: an unanswered call strikes like any walk-off.
  const tookStairs = p.state === 'waiting' && p.origin > 0 && runHeat() < 2;
  p.state = 'left';
  p.removeAt = game.t + 0.7;
  if (tookStairs) return;
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

// (the old 1D "ledge" Spider Floor lived here — replaced wholesale by the
// webbed-office maze in src/maze.js. The shaft entrance above now calls
// enterMaze(); drawWebSpider survives in render.js for the boss brood and
// the maze swarm.)

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
  const hp = 6 + Math.floor((run.shiftNum - 1) / 3)    // scales a little with how far you got
           + (runHeat() >= 5 ? 2 : 0);                 // THE WEB REMEMBERS
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
  if (heldUp()) input -= 1;     // up = toward the spider
  if (heldDown()) input += 1;
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
        const n = 2 + Math.floor(run.shiftNum / 4) + (runHeat() >= 5 ? 1 : 0);
        for (let i = 0; i < Math.min(runHeat() >= 5 ? 5 : 4, n); i++) bossSpawnMini(bg);
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
    bumpStat('heatCleared', run.heat || 0);   // climbing the ladder unlocks the next rung
    checkAchievements();          // Cut the Cord (+30★) and heat achievements fire here
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
    blurb: 'Install +1 level on a random part right now.',
    apply() { const o = eligibleUpgrades();
              if (o.length) run.up[o[Math.floor(Math.random() * o.length)].key]++; } },
  { key: 'training',  name: 'Night Class', cost: 6,
    blurb: 'Clock in tomorrow with a level-up ready to pick.',
    apply() { run.nextShift.bonusLevel = (run.nextShift.bonusLevel || 0) + 1; } },
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

// The shop is the BETWEEN-shift layer now: consumables and one-shot specials.
// Parts (◆) buy preparation; level-ups (XP) build the machine.
function openShop() {
  shop = { offers: shuffle(SPECIALS).slice(0, 2), bought: {}, paidRerolls: 0 };
  game.state = 'SHOP';
}
const REROLL_COST = 3;
const PAID_REROLLS_PER_VISIT = 1;   // scarcity keeps the shelf a real decision
function rerollShop() {
  if (shop.paidRerolls >= PAID_REROLLS_PER_VISIT || run.parts < REROLL_COST) { sfx.buzz(); return; }
  run.parts -= REROLL_COST;
  shop.paidRerolls++;
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

