// THE SPIDER FLOOR — the webbed office: an isometric cubicle maze
// (loaded as an ordered classic script; all files share one global scope)
//
// You step off the lift; the door seals behind you. Somewhere across a
// generated office — cubicles webbed in the dark — glows a DIFFERENT lift
// door. The swarm flows toward you around the partitions (a BFS flow field);
// your sword swings ITSELF at the nearest spider on a steady rhythm, and the
// arc cleaves everything in the wedge — so the whole game is where you stand.
// Cocoons crack open for loot you must CARRY OUT: every tile deeper is
// escape-distance you owe. Movement is the only verb. Vampire Survivors
// would understand.

// ── generation ────────────────────────────────────────────────────────
// A tile grid: 1 = cubicle partition (low wall you can see over), 0 = floor.
// Backtracker over the odd lattice → perfect maze; BRAID it (~20% of
// separating walls fall — dead ends in a swarm game are death sentences,
// loops are decisions); clear a few open-plan rooms.

function genMaze(cols = 21, rows = 21, rng = Math.random) {
  cols |= 1; rows |= 1;                  // odd dims so the lattice lines up
  const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
  const DIRS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const open = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && grid[ny][nx] === 1;
    });
    if (!open.length) { stack.pop(); continue; }
    const [dx, dy] = open[Math.floor(rng() * open.length)];
    grid[cy + dy / 2][cx + dx / 2] = 0;
    grid[cy + dy][cx + dx] = 0;
    stack.push([cx + dx, cy + dy]);
  }
  // braid: any interior wall with floor on both sides has a 20% chance to fall
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      if (grid[y][x] !== 1 || rng() >= 0.2) continue;
      const horiz = grid[y][x - 1] === 0 && grid[y][x + 1] === 0;
      const vert  = grid[y - 1][x] === 0 && grid[y + 1][x] === 0;
      if (horiz || vert) grid[y][x] = 0;
    }
  }
  // open-plan rooms (clearing only ADDS floor, so connectivity holds — every
  // 3-wide block contains an odd-odd lattice cell the backtracker carved)
  const roomCount = 2 + Math.floor(rng() * 2);
  for (let r = 0; r < roomCount; r++) {
    const rw = 3 + 2 * Math.floor(rng() * 2), rh = 3;
    const rx = 1 + Math.floor(rng() * (cols - rw - 2));
    const ry = 1 + Math.floor(rng() * (rows - rh - 2));
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = 0;
  }
  // you arrive at a corner; the way out is the farthest floor tile from it
  const entry = { x: 1, y: 1 };
  const dist = bfsDistances(grid, entry.x, entry.y);
  let exit = entry, maxDist = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] === 0 && dist[y][x] > maxDist) { maxDist = dist[y][x]; exit = { x, y }; }
    }
  }
  return { cols, rows, grid, entry, exit, maxDist };
}

// BFS over floor tiles — connectivity proofs at gen time, the swarm's flow
// field at run time (spiders walk DOWN this gradient toward the player)
function bfsDistances(grid, sx, sy) {
  const rows = grid.length, cols = grid[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const q = [[sx, sy]];
  dist[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (grid[ny][nx] !== 0 || dist[ny][nx] >= 0) continue;
      dist[ny][nx] = dist[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return dist;
}

// ── space: 2:1 isometric projection ──────────────────────────────────
const ISO_TW = 64, ISO_TH = 32, ISO_WH = 26;   // tile width/height px, wall height
function isoToScreen(wx, wy) {
  return { x: (wx - wy) * (ISO_TW / 2), y: (wx + wy) * (ISO_TH / 2) };
}
// movement is SCREEN-relative (nobody thinks in diamonds)
function screenDirToWorld(sx, sy) {
  const wx = sx / (ISO_TW / 2) + sy / (ISO_TH / 2);
  const wy = -sx / (ISO_TW / 2) + sy / (ISO_TH / 2);
  const len = Math.hypot(wx, wy) || 1;
  return { x: wx / len, y: wy / len };
}

// ── movement: circles sliding against wall tiles ──────────────────────
const MAZE_R = 0.30;       // player radius in tile units
const MAZE_SPEED = 3.4;    // tiles per second
function mazeWalkable(mz, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < mz.cols && ty < mz.rows && mz.grid[ty][tx] === 0;
}
// axis-separated: resolve X then Y, so pushing diagonally into a wall slides
// along it. Assumes per-step deltas well under a tile.
function tryMove(mz, p, dx, dy, r = MAZE_R) {
  const can = (x, y) => mazeWalkable(mz, Math.floor(x), Math.floor(y));
  let nx = p.x + dx;
  if (dx > 0 && (!can(nx + r, p.y - r) || !can(nx + r, p.y + r))) {
    nx = Math.floor(nx + r) - r - 0.001;
  } else if (dx < 0 && (!can(nx - r, p.y - r) || !can(nx - r, p.y + r))) {
    nx = Math.floor(nx - r) + 1 + r + 0.001;
  }
  p.x = nx;
  let ny = p.y + dy;
  if (dy > 0 && (!can(p.x - r, ny + r) || !can(p.x + r, ny + r))) {
    ny = Math.floor(ny + r) - r - 0.001;
  } else if (dy < 0 && (!can(p.x - r, ny - r) || !can(p.x + r, ny - r))) {
    ny = Math.floor(ny - r) + 1 + r + 0.001;
  }
  p.y = ny;
}

// ── the visit ─────────────────────────────────────────────────────────
const SWORD_RANGE = 1.55, SWORD_CD = 0.55, SWORD_DOT = -0.25;   // wedge ≈ 195°

function mazeHeat() { return runHeat() >= 5 ? 1.25 : 1; }       // THE WEB REMEMBERS

function enterMaze() {
  const m = genMaze(21, 21);
  run.mazeVisits = (run.mazeVisits || 0) + 1;
  const visits = run.mazeVisits;
  const assoc = save.meta.knownAssociate;
  const dist = bfsDistances(m.grid, m.entry.x, m.entry.y);
  const far = [];
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      if (m.grid[y][x] === 0 && dist[y][x] > 6 && !(x === m.exit.x && y === m.exit.y)) {
        far.push({ x, y, d: dist[y][x] });
      }
    }
  }
  const picks = shuffle(far);
  // cocoons: spatial greed — loot is placed AWAY from where you start
  const cocoons = picks.slice(0, 5 + Math.min(3, visits))
    .map(t => ({ x: t.x + 0.5, y: t.y + 0.5, opened: false, sway: Math.random() * 6 }));
  // spitters arrive on the second visit; they hold ground and web your feet
  const spitters = visits >= 2
    ? picks.slice(8, 8 + Math.min(3, 1 + Math.floor(visits / 2)))
        .map(t => ({ x: t.x + 0.5, y: t.y + 0.5, cool: 2 + Math.random(), sway: Math.random() * 6,
                     dead: false, deadT: 0, size: 14 }))
    : [];
  // the third visit, the ceiling has a hole in it — and a thread going up
  const mid = picks.find(t => t.d > m.maxDist * 0.4 && t.d < m.maxDist * 0.8);
  const thread = visits >= 3 && mid ? { x: mid.x + 0.5, y: mid.y + 0.5 } : null;

  game.maze = {
    ...m,
    player: { x: m.entry.x + 0.5, y: m.entry.y + 0.5, fx: 1, walk: 0,
              hp: 3, maxHp: 3, invuln: 0, rooted: 0 },
    cam: null, t: 0,
    spiders: [], globs: [], cocoons, spitters, thread, threadSeen: false,
    loot: 0, killed: 0, hitTaken: false, hits: 0, rootsTaken: 0, hitFlash: 0, fx: [],
    spawnTimer: 2.2,
    spawnEvery: Math.max(1.2, 2.6 - run.shiftNum * 0.07) / mazeHeat(),
    lootPerKill: 2 + (assoc >= 2 ? 1 : 0),
    swingCool: 0.4, swing: null,
    flow: null, flowTimer: 0,
    result: null, exitT: 0,
  };
  save.stats.spiderVisits++; checkAchievements();
  game.state = 'MAZE';
  sfx.spider();
}

function finishMaze() {
  const mz = game.maze;
  // ── flight recorder: how the visit actually went ──
  metRecord('maze', {
    visit: run.mazeVisits || 0, shift: run.shiftNum, heat: run.heat || 0, op: run.operator,
    dur: Math.round(mz.t),
    result: mz.result,                                   // 'out' | 'caught'
    kills: mz.killed,
    loot: Math.floor(mz.loot),                           // banked if 'out', lost if 'caught'
    cocoons: mz.cocoons.filter(c => c.opened).length,
    cocoonsTotal: mz.cocoons.length,
    hits: mz.hits, roots: mz.rootsTaken,
    walkPace: mz.maxDist ? Math.round((mz.t / mz.maxDist) * 100) / 100 : 0,   // s per tile of the direct route
  });
  if (mz.result === 'caught') {
    game.strikes++;
    game.banner = { text: 'THE OFFICE KEEPS WHAT YOU CARRIED — STRIKE!', t: 2.2, color: '#aa3a32' };
    flash('#5a1a4a', 0.4);
  } else {
    const got = Math.floor(mz.loot);
    run.parts += got;
    game.partsThisShift += got;
    game.banner = { text: got > 0 ? `CARRIED OUT +${got} ◆  (${mz.killed} slain)` : 'OUT — EMPTY-HANDED',
                    t: 2.2, color: '#ffd44a' };
    bumpStat('bestSpiderLoot', got);
    bumpStat('bestRunParts', run.parts);
    if (!mz.hitTaken && mz.killed >= 3) { save.stats.noHitClears++; checkAchievements(); }
  }
  // the webs seal behind you; the lift waits at the lobby
  game.spider.open = false; game.spider.used = true; game.spider.glow = 0;
  const e = game.elev;
  e.y = 0; e.v = 0; e.doors = 1; e.doorTarget = 1; e.wasReady = false;
  game.maze = null;
  game.state = 'PLAYING';
}

function spawnMazeSpider(mz) {
  const P = mz.player;
  let tile = null;
  for (let tries = 0; tries < 40 && !tile; tries++) {
    const x = Math.floor(Math.random() * mz.cols), y = Math.floor(Math.random() * mz.rows);
    if (mz.grid[y][x] === 0 && Math.hypot(x + 0.5 - P.x, y + 0.5 - P.y) > 5.5) tile = { x, y };
  }
  if (!tile) tile = mz.entry;
  mz.spiders.push({
    x: tile.x + 0.5, y: tile.y + 0.5,
    drop: 0.55,                          // it rappels out of the ceiling dark
    speed: Math.min(3.3, (1.75 + mz.t * 0.03 + run.shiftNum * 0.05) * mazeHeat()),
    sway: Math.random() * 6, size: 10 + Math.random() * 4,
    dead: false, deadT: 0,
  });
}

function mazeFxPop(mz, wx, wy, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4;
    mz.fx.push({ wx, wy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.5, color });
  }
}
function mazeFxText(mz, wx, wy, text, color = '#ffd44a') {
  mz.fx.push({ wx, wy, vx: 0, vy: 0, life: 0, max: 1.0, color, text });
}

function openCocoon(mz, c) {
  c.opened = true;
  const P = mz.player;
  gainXP(4);                             // knowledge can't be stolen on the way out
  const roll = Math.random();
  if (roll < 0.62) {
    const n = 2 + Math.floor(Math.random() * 3);
    mz.loot += n;
    mazeFxText(mz, c.x, c.y, `+${n} ◆`);
  } else if (roll < 0.85 && P.hp < P.maxHp) {
    P.hp++;
    mazeFxText(mz, c.x, c.y, '♥', '#ff6a8a');
  } else {
    run.fuses++;
    mazeFxText(mz, c.x, c.y, 'FUSE', '#d4a050');
  }
  mazeFxPop(mz, c.x, c.y, '#e8e0f0', 10);
  sfx.tip();
}

function updateMaze(dt) {
  const mz = game.maze;
  if (!mz) { game.state = 'PLAYING'; return; }
  mz.t += dt;
  if (mz.hitFlash > 0) mz.hitFlash -= dt;
  for (const f of mz.fx) { f.life += dt; f.wx += f.vx * dt; f.wy += f.vy * dt; }
  mz.fx = mz.fx.filter(f => f.life < f.max);
  if (mz.swing) { mz.swing.t -= dt; if (mz.swing.t <= 0) mz.swing = null; }
  if (mz.result) { mz.exitT += dt; if (mz.exitT > 1.6) finishMaze(); return; }

  const P = mz.player;
  if (P.invuln > 0) P.invuln -= dt;
  if (P.rooted > 0) P.rooted -= dt;

  // ── move: keys or the virtual stick, screen-relative either way ──
  let sx = (heldRight() ? 1 : 0) - (heldLeft() ? 1 : 0);
  let sy = (heldDown() ? 1 : 0) - (heldUp() ? 1 : 0);
  if (!sx && !sy && mazeStick && Math.hypot(mazeStick.dx, mazeStick.dy) > 0.18) {
    sx = mazeStick.dx; sy = mazeStick.dy;
  }
  if ((sx || sy) && P.rooted <= 0) {
    const d = screenDirToWorld(sx, sy);
    const mag = Math.min(1, Math.hypot(sx, sy));
    tryMove(mz, P, d.x * MAZE_SPEED * mag * dt, d.y * MAZE_SPEED * mag * dt);
    if (Math.abs(sx) > 0.2) P.fx = Math.sign(sx);
    P.walk += dt * 10;
  }

  // ── flow field: the swarm's map to you, refreshed as you move ──
  mz.flowTimer -= dt;
  const ptx = Math.floor(P.x), pty = Math.floor(P.y);
  if (!mz.flow || mz.flowTimer <= 0 || mz.flowX !== ptx || mz.flowY !== pty) {
    mz.flow = bfsDistances(mz.grid, ptx, pty);
    mz.flowX = ptx; mz.flowY = pty;
    mz.flowTimer = 0.35;
  }

  // ── the flood: a trickle that becomes a tide the longer you linger ──
  // (escalates with TIME, not per-spawn, so the curve is the same every visit:
  // roomy for the first ~25s of looting, undeniable by the minute mark)
  mz.spawnTimer -= dt;
  if (mz.spawnTimer <= 0) {
    spawnMazeSpider(mz);
    if (mz.t > 22 && Math.random() < 0.5) spawnMazeSpider(mz);
    const rate = Math.max(0.5, mz.spawnEvery - mz.t * 0.03);
    mz.spawnTimer = rate * (0.75 + Math.random() * 0.5);
  }

  // ── spiders: descend the gradient, around the cubicles, toward you ──
  for (const s of mz.spiders) {
    if (s.dead) { s.deadT += dt; continue; }
    s.sway += dt * 9;
    if (s.drop > 0) { s.drop -= dt; continue; }
    const dxp = P.x - s.x, dyp = P.y - s.y;
    const dEu = Math.hypot(dxp, dyp) || 1;
    let vx, vy;
    if (dEu < 1.35) {                    // close enough: straight at you
      vx = dxp / dEu; vy = dyp / dEu;
    } else {
      const stx = Math.floor(s.x), sty = Math.floor(s.y);
      let best = (mz.flow[sty] || [])[stx];
      if (best == null || best < 0) best = Infinity;
      let bx = 0, by = 0, found = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const row = mz.flow[sty + dy];
        const nd = row ? row[stx + dx] : null;
        if (nd != null && nd >= 0 && nd < best) { best = nd; bx = dx; by = dy; found = true; }
      }
      if (found) {
        const cx = stx + bx + 0.5 - s.x, cy = sty + by + 0.5 - s.y;
        const cl = Math.hypot(cx, cy) || 1;
        vx = cx / cl; vy = cy / cl;
      } else { vx = dxp / dEu; vy = dyp / dEu; }
    }
    tryMove(mz, s, vx * s.speed * dt, vy * s.speed * dt, 0.22);
    if (dEu < 0.48 && P.invuln <= 0) {   // it reaches you
      P.hp--; P.invuln = 0.8; mz.hitFlash = 0.3; mz.hitTaken = true; mz.hits++;
      flash('#7a1030', 0.25); shake(9); sfx.hurt();
      tryMove(mz, s, -vx * 0.9, -vy * 0.9, 0.22);   // it recoils to lunge again
    }
  }
  mz.spiders = mz.spiders.filter(s => !(s.dead && s.deadT > 0.8));
  mz.spitters = mz.spitters.filter(s => !(s.dead && s.deadT > 0.8));

  // ── spitters: hold their ground and web your feet ──
  for (const sp of mz.spitters) {
    if (sp.dead) { sp.deadT += dt; continue; }
    sp.sway += dt * 5;
    sp.cool -= dt;
    const d = Math.hypot(P.x - sp.x, P.y - sp.y);
    if (sp.cool <= 0 && d < 7 && d > 1.1) {
      sp.cool = 2.6 + Math.random() * 0.8;
      mz.globs.push({ x: sp.x, y: sp.y, sx: sp.x, sy: sp.y, tx: P.x, ty: P.y, t: 0, dur: d / 3.2 });
      sfx.near();
    }
  }
  for (const g of mz.globs) {
    g.t += dt;
    const k = Math.min(1, g.t / g.dur);
    g.x = g.sx + (g.tx - g.sx) * k;
    g.y = g.sy + (g.ty - g.sy) * k;
    if (k >= 1) {
      if (Math.hypot(P.x - g.tx, P.y - g.ty) < 0.55) {
        P.rooted = Math.max(P.rooted, 0.9);
        mz.rootsTaken++;
        mazeFxText(mz, P.x, P.y, 'WEBBED', '#cdbde0');
        sfx.buzz();
      }
      mazeFxPop(mz, g.tx, g.ty, '#cdbde0', 6);
    }
  }
  mz.globs = mz.globs.filter(g => g.t < g.dur);

  // ── the auto-sword: it keeps its own rhythm; you choose where to stand ──
  mz.swingCool -= dt;
  if (mz.swingCool <= 0) {
    let tgt = null, td = Infinity, isCocoon = false;
    const consider = (e, d, cocoon) => { if (d < td) { tgt = e; td = d; isCocoon = cocoon; } };
    for (const s of mz.spiders) {
      if (s.dead || s.drop > 0) continue;
      const d = Math.hypot(s.x - P.x, s.y - P.y);
      if (d < SWORD_RANGE) consider(s, d, false);
    }
    for (const sp of mz.spitters) {
      if (sp.dead) continue;
      const d = Math.hypot(sp.x - P.x, sp.y - P.y);
      if (d < SWORD_RANGE) consider(sp, d, false);
    }
    if (!tgt) {
      for (const c of mz.cocoons) {
        if (c.opened) continue;
        const d = Math.hypot(c.x - P.x, c.y - P.y);
        if (d < SWORD_RANGE * 0.9) consider(c, d, true);
      }
    }
    if (tgt) {
      mz.swingCool = SWORD_CD;
      const ang = Math.atan2(tgt.y - P.y, tgt.x - P.x);
      mz.swing = { t: 0.18, ang };
      sfx.sword();
      const ux = Math.cos(ang), uy = Math.sin(ang);
      let slain = 0;
      const cleave = (s, isSpitter) => {
        if (s.dead) return;
        const dx = s.x - P.x, dy = s.y - P.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > SWORD_RANGE || (dx / d) * ux + (dy / d) * uy < SWORD_DOT) return;
        s.dead = true; s.deadT = 0;
        slain++;
        const pay = mz.lootPerKill + (isSpitter ? 1 : 0);
        mz.loot += pay;
        mz.killed++;
        gainXP(CFG.xpSpider);
        save.stats.spiders++;
        mazeFxPop(mz, s.x, s.y, '#ff3a5a');
        mazeFxText(mz, s.x, s.y, `+${pay}`);
      };
      for (const s of mz.spiders) cleave(s, false);
      for (const sp of mz.spitters) cleave(sp, true);
      if (isCocoon) openCocoon(mz, tgt);
      else {
        // the wedge also cracks any cocoon it happens to pass through
        for (const c of mz.cocoons) {
          if (c.opened) continue;
          const dx = c.x - P.x, dy = c.y - P.y, d = Math.hypot(dx, dy) || 1;
          if (d < SWORD_RANGE * 0.9 && (dx / d) * ux + (dy / d) * uy > 0.3) openCocoon(mz, c);
        }
      }
      if (slain) { checkAchievements(); sfx.slash(); }
    }
  }

  // ── the thread (visit 3+): the truth, hanging in a hole in the ceiling ──
  if (mz.thread && !mz.threadSeen && Math.hypot(P.x - mz.thread.x, P.y - mz.thread.y) < 1.3) {
    mz.threadSeen = true;
    save.stats.sawThread = 1;
    game.banner = { text: '…the thread goes UP. something is HOLDING your lift.', t: 3.2, color: '#c89aff' };
    sfx.spider();
  }

  // ── leaving (or not) ──
  if (Math.floor(P.x) === mz.exit.x && Math.floor(P.y) === mz.exit.y) {
    mz.result = 'out';
    sfx.chime();
    return;
  }
  if (P.hp <= 0) {
    mz.result = 'caught';
    shake(13); flash('#5a1a4a', 0.5);
    sfx.caught();
  }
}

// ── the virtual stick: touch the floor, drag to walk. No buttons. ─────
let mazeStick = null;   // {id, ox, oy, dx, dy} — dx/dy normalized -1..1
canvas.addEventListener('pointerdown', ev => {
  if (typeof touchEnabled === 'undefined' || !touchEnabled) return;
  if (!game || game.state !== 'MAZE' || paused) return;
  const { mx, my } = canvasPos(ev);
  mazeStick = { id: ev.pointerId, ox: mx, oy: my, dx: 0, dy: 0 };
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  ev.preventDefault();
});
canvas.addEventListener('pointermove', ev => {
  if (!mazeStick || ev.pointerId !== mazeStick.id) return;
  const { mx, my } = canvasPos(ev);
  const R = 56;
  mazeStick.dx = Math.max(-1, Math.min(1, (mx - mazeStick.ox) / R));
  mazeStick.dy = Math.max(-1, Math.min(1, (my - mazeStick.oy) / R));
});
const mazeStickUp = ev => { if (mazeStick && (!ev || ev.pointerId === mazeStick.id)) mazeStick = null; };
canvas.addEventListener('pointerup', mazeStickUp);
canvas.addEventListener('pointercancel', mazeStickUp);

// ── rendering ─────────────────────────────────────────────────────────
function drawMaze() {
  const mz = game.maze;
  if (!mz) return;
  const th = (run && run.theme) || THEMES[0];
  ctx.fillStyle = '#06040a';
  ctx.fillRect(0, 0, W, H);

  // the camera eases toward the player
  const pp = isoToScreen(mz.player.x, mz.player.y);
  if (!mz.cam) mz.cam = { x: pp.x, y: pp.y };
  mz.cam.x += (pp.x - mz.cam.x) * 0.12;
  mz.cam.y += (pp.y - mz.cam.y) * 0.12;
  const ox = W / 2 - mz.cam.x, oy = H / 2 + 24 - mz.cam.y;

  const diamond = (cx, cy, hw, hh) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
    ctx.closePath();
  };

  // floor pass — carpet tiles in the run's palette, webbed here and there
  for (let y = 0; y < mz.rows; y++) {
    for (let x = 0; x < mz.cols; x++) {
      if (mz.grid[y][x] !== 0) continue;
      const c = isoToScreen(x + 0.5, y + 0.5);
      const sx2 = c.x + ox, sy2 = c.y + oy;
      if (sx2 < -ISO_TW || sx2 > W + ISO_TW || sy2 < -ISO_TH * 2 || sy2 > H + ISO_TH * 2) continue;
      const h = (x * 53 + y * 97) % 9;
      ctx.fillStyle = h < 5 ? th.room : th.col;
      diamond(sx2, sy2, ISO_TW / 2, ISO_TH / 2);
      ctx.fill();
      if (h === 7) {
        ctx.strokeStyle = 'rgba(180,160,200,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx2 - 14, sy2); ctx.lineTo(sx2 + 14, sy2);
        ctx.moveTo(sx2, sy2 - 7); ctx.lineTo(sx2, sy2 + 7);
        ctx.moveTo(sx2 - 8, sy2 - 4); ctx.lineTo(sx2 + 8, sy2 + 4);
        ctx.stroke();
      }
    }
  }

  // depth-sorted pass: partitions, doors, cocoons, spiders, the operator
  const items = [];
  for (let y = 0; y < mz.rows; y++) {
    for (let x = 0; x < mz.cols; x++) {
      if (mz.grid[y][x] === 1) items.push({ d: x + y, kind: 'wall', x, y });
    }
  }
  items.push({ d: mz.entry.x + mz.entry.y + 0.01, kind: 'door', x: mz.entry.x, y: mz.entry.y, sealed: true });
  items.push({ d: mz.exit.x + mz.exit.y + 0.01, kind: 'door', x: mz.exit.x, y: mz.exit.y, sealed: false });
  for (const c of mz.cocoons) items.push({ d: c.x + c.y, kind: 'cocoon', c });
  for (const s of mz.spiders) items.push({ d: s.x + s.y, kind: 'spider', s });
  for (const sp of mz.spitters) items.push({ d: sp.x + sp.y, kind: 'spitter', s: sp });
  items.push({ d: mz.player.x + mz.player.y, kind: 'player' });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.kind === 'wall') drawCubicle(mz, it.x, it.y, ox, oy, th, diamond);
    else if (it.kind === 'door') drawMazeDoor(it.x, it.y, ox, oy, it.sealed, mz.t);
    else if (it.kind === 'cocoon') drawCocoon(it.c, ox, oy);
    else if (it.kind === 'spider' || it.kind === 'spitter') drawMazeSpider(it.s, ox, oy, it.kind === 'spitter');
    else drawMazePlayer(mz, ox, oy);
  }

  // globs fly above everything
  for (const g of mz.globs) {
    const k = Math.min(1, g.t / g.dur);
    const c = isoToScreen(g.x, g.y);
    const arc = Math.sin(k * Math.PI) * 20;
    ctx.fillStyle = 'rgba(205,189,224,0.9)';
    ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy - 14 - arc, 4, 0, 7); ctx.fill();
  }

  // world-space fx (pops + floating text)
  for (const f of mz.fx) {
    const c = isoToScreen(f.wx, f.wy);
    const a = Math.max(0, 1 - f.life / f.max);
    ctx.globalAlpha = a;
    if (f.text) {
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px ui-monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.text, c.x + ox, c.y + oy - 30 - f.life * 26);
    } else {
      ctx.fillStyle = f.color;
      ctx.fillRect(c.x + ox - 1.5, c.y + oy - 10 - f.life * 14, 3, 3);
    }
  }
  ctx.globalAlpha = 1;

  // the dark: you see a pool around you — wider with X-RAY MEMORY running
  const xray = game.power && game.power.xray > 0;
  const vis = xray ? 2.1 : 1;
  const px = pp.x + ox, py = pp.y + oy;
  const g = ctx.createRadialGradient(px, py, 130 * vis, px, py, 360 * vis);
  g.addColorStop(0, 'rgba(4,2,8,0)');
  g.addColorStop(1, 'rgba(4,2,8,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // …except the glows that bleed through it
  const ec = isoToScreen(mz.exit.x + 0.5, mz.exit.y + 0.5);
  const ex = ec.x + ox, ey = ec.y + oy - 20;
  if (ex > -80 && ex < W + 80 && ey > -80 && ey < H + 80) {
    const eg = ctx.createRadialGradient(ex, ey, 4, ex, ey, 90);
    eg.addColorStop(0, 'rgba(120,255,160,0.20)');
    eg.addColorStop(1, 'rgba(120,255,160,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(ex - 90, ey - 90, 180, 180);
  }
  if (mz.thread) drawThread(mz, ox, oy);

  // red pulse on hit
  if (mz.hitFlash > 0) {
    ctx.fillStyle = `rgba(122,16,48,${mz.hitFlash})`;
    ctx.fillRect(0, 0, W, H);
  }

  // ── HUD ──
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c89aff'; ctx.font = 'bold 22px ui-monospace';
  ctx.fillText(cyr('THE SPIDER FLOOR'), W / 2, 34);
  ctx.fillStyle = '#7a6a8a'; ctx.font = '12px ui-monospace';
  ctx.fillText('the door sealed behind you — find the other lift', W / 2, 58);
  const P = mz.player;
  ctx.textAlign = 'left';
  for (let i = 0; i < P.maxHp; i++) {
    ctx.fillStyle = i < P.hp ? '#ff4a6a' : '#3a2030';
    ctx.font = 'bold 22px ui-monospace';
    ctx.fillText('♥', 52, 28 + i * 0);   // single row below
  }
  // (hearts in a row)
  for (let i = 0; i < P.maxHp; i++) {
    ctx.fillStyle = i < P.hp ? '#ff4a6a' : '#3a2030';
    ctx.fillText('♥', 52 + i * 24, 29);
  }
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 18px ui-monospace'; ctx.textAlign = 'right';
  ctx.fillText(`◆ ${Math.floor(mz.loot)}  ·  ${mz.killed} slain`, W - 20, 29);
  if (P.rooted > 0) {
    ctx.fillStyle = '#cdbde0'; ctx.font = 'bold 14px ui-monospace'; ctx.textAlign = 'center';
    ctx.fillText('WEBBED — tear free…', W / 2, 84);
  }
  drawPauseChip(16, 16);

  // the virtual stick, while a thumb is down
  if (mazeStick) {
    ctx.strokeStyle = 'rgba(191,164,95,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mazeStick.ox, mazeStick.oy, 44, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(232,220,192,0.6)';
    ctx.beginPath(); ctx.arc(mazeStick.ox + mazeStick.dx * 38, mazeStick.oy + mazeStick.dy * 38, 14, 0, 7); ctx.fill();
  }

  // result overlay
  if (mz.result) {
    ctx.fillStyle = 'rgba(8,4,12,0.8)';
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (mz.result === 'caught') {
      ctx.fillStyle = '#ff3a4a'; ctx.font = 'bold 46px ui-monospace';
      ctx.fillText('OVERWHELMED!', W / 2, H / 2 - 6);
      ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
      ctx.fillText('the loot scatters — and a strike', W / 2, H / 2 + 30);
    } else {
      ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 42px ui-monospace';
      ctx.fillText(`CARRIED OUT ◆ ${Math.floor(mz.loot)}`, W / 2, H / 2 - 6);
      ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
      ctx.fillText(`${mz.killed} spiders slain`, W / 2, H / 2 + 30);
    }
  }
}

function drawCubicle(mz, x, y, ox, oy, th, diamond) {
  // low partition: you see OVER it (the swarm stays legible), you path around it
  const T = isoToScreen(x, y), R = isoToScreen(x + 1, y),
        B = isoToScreen(x + 1, y + 1), L = isoToScreen(x, y + 1);
  const lift = (p) => ({ x: p.x + ox, y: p.y + oy - ISO_WH });
  const flat = (p) => ({ x: p.x + ox, y: p.y + oy });
  const [Rf, Bf, Lf] = [R, B, L].map(flat);
  const [Tr, Rr, Br, Lr] = [T, R, B, L].map(lift);
  if (Bf.y < -ISO_WH || Tr.y > H + ISO_WH || Rf.x < -ISO_TW || Lf.x > W + ISO_TW) return;
  const h = (x * 31 + y * 71) % 11;
  ctx.fillStyle = th.wall;
  ctx.beginPath(); ctx.moveTo(Lf.x, Lf.y); ctx.lineTo(Bf.x, Bf.y); ctx.lineTo(Br.x, Br.y); ctx.lineTo(Lr.x, Lr.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = th.wallDark;
  ctx.beginPath(); ctx.moveTo(Bf.x, Bf.y); ctx.lineTo(Rf.x, Rf.y); ctx.lineTo(Rr.x, Rr.y); ctx.lineTo(Br.x, Br.y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = h < 8 ? th.slab : '#4a4456';
  ctx.beginPath(); ctx.moveTo(Tr.x, Tr.y); ctx.lineTo(Rr.x, Rr.y); ctx.lineTo(Br.x, Br.y); ctx.lineTo(Lr.x, Lr.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = th.ceil; ctx.lineWidth = 1; ctx.stroke();
}

function drawMazeDoor(x, y, ox, oy, sealed, t) {
  const c = isoToScreen(x + 0.5, y + 0.5);
  const cx = c.x + ox, cy = c.y + oy;
  const w = 30, h = 48;
  ctx.fillStyle = sealed ? '#16101c' : '#101c14';
  ctx.fillRect(cx - w / 2, cy - h, w, h);
  if (sealed) {
    ctx.strokeStyle = 'rgba(180,160,200,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - h); ctx.lineTo(cx + w / 2, cy);
    ctx.moveTo(cx + w / 2, cy - h); ctx.lineTo(cx - w / 2, cy);
    ctx.moveTo(cx - w / 2, cy - h / 2); ctx.lineTo(cx + w / 2, cy - h / 2);
    ctx.stroke();
    ctx.strokeStyle = '#3a2e44'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2, cy - h, w, h);
  } else {
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.strokeStyle = `rgba(122,255,154,${pulse})`; ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2, cy - h, w, h);
    ctx.fillStyle = `rgba(120,255,160,${0.10 + 0.06 * pulse})`;
    ctx.fillRect(cx - w / 2 + 3, cy - h + 3, w - 6, h - 6);
    ctx.fillStyle = '#7aff9a'; ctx.font = 'bold 9px ui-monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LIFT', cx, cy - h - 9);
  }
}

function drawCocoon(c, ox, oy) {
  const p = isoToScreen(c.x, c.y);
  const x = p.x + ox, y = p.y + oy;
  if (c.opened) {
    ctx.fillStyle = 'rgba(120,108,130,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y - 4, 9, 5, 0, 0, 7); ctx.fill();
    return;
  }
  const wob = Math.sin(c.sway + performance.now() / 600) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, y, 9, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#cfc6dc';
  ctx.beginPath(); ctx.ellipse(x, y - 12 + wob, 8, 12, 0.2, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(90,76,110,0.7)'; ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath(); ctx.ellipse(x, y - 12 + wob, 8, 12, 0.2 + i * 0.5, 0, 7); ctx.stroke();
  }
}

function drawMazeSpider(s, ox, oy, spitter) {
  const p = isoToScreen(s.x, s.y);
  const x = p.x + ox;
  let y = p.y + oy - 6;
  ctx.save();
  if (s.drop > 0) {                       // rappelling out of the ceiling dark
    const k = s.drop / 0.55;
    y -= k * 90;
    ctx.globalAlpha = 1 - k * 0.4;
    ctx.strokeStyle = 'rgba(220,210,230,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - 120); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x, p.y + oy, 8, 3.5, 0, 0, 7); ctx.fill();
  drawWebSpider({ x, y, size: s.size, sway: s.sway, dead: s.dead, deadT: s.deadT });
  if (spitter && !s.dead) {               // the sac it spits from
    ctx.fillStyle = '#9a6ad8';
    ctx.beginPath(); ctx.arc(x, y + 4, 4, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawMazePlayer(mz, ox, oy) {
  const P = mz.player;
  const c = isoToScreen(P.x, P.y);
  const x = c.x + ox, y = c.y + oy;
  const inv = P.invuln > 0;
  ctx.save();
  if (inv) ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(P.invuln * 12));
  const bob = Math.abs(Math.sin(P.walk)) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, 11, 5, 0, 0, 7); ctx.fill();
  const fy = y - bob;
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(x - 6, fy - 12, 5, 12); ctx.fillRect(x + 1, fy - 12, 5, 12);
  ctx.fillStyle = '#4a6a9a';
  ctx.fillRect(x - 8, fy - 32, 16, 21);
  ctx.fillStyle = '#d4a878';
  ctx.beginPath(); ctx.arc(x, fy - 38, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(x - 7, fy - 43, 14, 4); ctx.fillRect(x - 4, fy - 47, 8, 5);
  // webbed feet
  if (P.rooted > 0) {
    ctx.strokeStyle = 'rgba(205,189,224,0.8)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 10 + i * 7, y + 3);
      ctx.lineTo(x - 6 + i * 5, fy - 10);
      ctx.stroke();
    }
  }
  // the sword: held at rest, a cleaving arc when it swings
  ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  if (mz.swing) {
    const k = 1 - mz.swing.t / 0.18;
    // world angle → screen angle through the projection
    const ux = Math.cos(mz.swing.ang), uy = Math.sin(mz.swing.ang);
    const sAng = Math.atan2((ux + uy) * 16, (ux - uy) * 32);
    const a0 = sAng - 1.15 + k * 2.3;
    ctx.strokeStyle = `rgba(200,230,255,${0.6 - k * 0.5})`;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.ellipse(x, fy - 18, 46, 24, 0, sAng - 1.15, a0); ctx.stroke();
    ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, fy - 22);
    ctx.lineTo(x + Math.cos(a0) * 44, fy - 18 + Math.sin(a0) * 22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x + P.fx * 6, fy - 22);
    ctx.lineTo(x + P.fx * 26, fy - 28);
    ctx.stroke();
  }
  ctx.restore();
}

function drawThread(mz, ox, oy) {
  const c = isoToScreen(mz.thread.x, mz.thread.y);
  const x = c.x + ox, y = c.y + oy;
  if (x < -120 || x > W + 120) return;
  // a shaft of wrong, pale light from a hole in the ceiling — and the thread
  const g = ctx.createLinearGradient(x, 0, x, y);
  g.addColorStop(0, 'rgba(200,154,255,0.16)');
  g.addColorStop(1, 'rgba(200,154,255,0.02)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 34, 0); ctx.lineTo(x + 34, 0); ctx.lineTo(x + 14, y); ctx.lineTo(x - 14, y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(230,220,240,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 6); ctx.stroke();
  ctx.fillStyle = 'rgba(220,200,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x, y, 16, 7, 0, 0, 7); ctx.fill();
}
