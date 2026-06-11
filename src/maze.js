// THE SPIDER FLOOR v2 — the webbed office: an isometric cubicle maze
// (loaded as an ordered classic script; all files share one global scope)
//
// Session 1 of 3: generation + connectivity, iso renderer, camera, movement.
// You step off the lift, the door seals behind you, and the way out is a
// DIFFERENT lift door somewhere in the dark. No spiders yet — they're session 2.
// Reach it from the title screen with X (dev preview) until the maze replaces
// the old ledge wholesale.

// ── generation ────────────────────────────────────────────────────────
// A tile grid: 1 = cubicle partition (low wall you can see over), 0 = floor.
// Recursive backtracker over the odd-coordinate lattice gives a perfect maze;
// then we BRAID it (knock ~20% of separating walls) because dead ends in a
// swarm game are death sentences and loops are decisions; then a few cubicle
// clusters get cleared into open-plan "rooms".

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
  // open-plan rooms (clearing only ever ADDS floor, so connectivity holds —
  // every 3-wide block contains an odd-odd lattice cell the backtracker carved)
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

// BFS over floor tiles — connectivity proofs now, the swarm's flow field later
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
// movement is SCREEN-relative (nobody thinks in diamonds): a screen-space
// direction becomes a normalized world-space one
function screenDirToWorld(sx, sy) {
  const wx = sx / (ISO_TW / 2) + sy / (ISO_TH / 2);
  const wy = -sx / (ISO_TW / 2) + sy / (ISO_TH / 2);
  const len = Math.hypot(wx, wy) || 1;
  return { x: wx / len, y: wy / len };
}

// ── movement: a circle sliding against wall tiles ─────────────────────
const MAZE_R = 0.30;       // player radius in tile units
const MAZE_SPEED = 3.4;    // tiles per second
function mazeWalkable(mz, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < mz.cols && ty < mz.rows && mz.grid[ty][tx] === 0;
}
// axis-separated: resolve X then Y, so pushing diagonally into a wall slides
// along it instead of sticking. Assumes per-step deltas well under a tile.
function tryMove(mz, p, dx, dy) {
  const can = (x, y) => mazeWalkable(mz, Math.floor(x), Math.floor(y));
  let nx = p.x + dx;
  if (dx > 0 && (!can(nx + MAZE_R, p.y - MAZE_R) || !can(nx + MAZE_R, p.y + MAZE_R))) {
    nx = Math.floor(nx + MAZE_R) - MAZE_R - 0.001;
  } else if (dx < 0 && (!can(nx - MAZE_R, p.y - MAZE_R) || !can(nx - MAZE_R, p.y + MAZE_R))) {
    nx = Math.floor(nx - MAZE_R) + 1 + MAZE_R + 0.001;
  }
  p.x = nx;
  let ny = p.y + dy;
  if (dy > 0 && (!can(p.x - MAZE_R, ny + MAZE_R) || !can(p.x + MAZE_R, ny + MAZE_R))) {
    ny = Math.floor(ny + MAZE_R) - MAZE_R - 0.001;
  } else if (dy < 0 && (!can(p.x - MAZE_R, ny - MAZE_R) || !can(p.x + MAZE_R, ny - MAZE_R))) {
    ny = Math.floor(ny - MAZE_R) + 1 + MAZE_R + 0.001;
  }
  p.y = ny;
}

// ── the visit ─────────────────────────────────────────────────────────
function enterMaze() {
  const m = genMaze(21, 21);
  game.maze = {
    ...m,
    player: { x: m.entry.x + 0.5, y: m.entry.y + 0.5, fx: 1, walk: 0 },
    cam: null,
    t: 0,
  };
  game.state = 'MAZE';
  sfx.spider();
}
function exitMaze() {
  game.maze = null;
  game.state = 'PLAYING';
  const e = game.elev;
  e.y = 0; e.v = 0; e.doors = 1; e.doorTarget = 1; e.wasReady = false;
  game.banner = { text: 'YOU FOUND THE OTHER DOOR', t: 2.0, color: '#7aff9a' };
  sfx.chime();
}
function updateMaze(dt) {
  const mz = game.maze;
  if (!mz) { game.state = 'PLAYING'; return; }
  mz.t += dt;
  const sx = (heldRight() ? 1 : 0) - (heldLeft() ? 1 : 0);
  const sy = (heldDown() ? 1 : 0) - (heldUp() ? 1 : 0);
  const P = mz.player;
  if (sx || sy) {
    const d = screenDirToWorld(sx, sy);
    tryMove(mz, P, d.x * MAZE_SPEED * dt, d.y * MAZE_SPEED * dt);
    if (sx) P.fx = sx;
    P.walk += dt * 10;
  }
  if (Math.floor(P.x) === mz.exit.x && Math.floor(P.y) === mz.exit.y) exitMaze();
}

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
      if (h === 7) {        // a faint web across this carpet tile
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

  // depth-sorted pass: cubicle partitions, the two lift doors, the operator
  const items = [];
  for (let y = 0; y < mz.rows; y++) {
    for (let x = 0; x < mz.cols; x++) {
      if (mz.grid[y][x] === 1) items.push({ d: x + y, kind: 'wall', x, y });
    }
  }
  items.push({ d: mz.entry.x + mz.entry.y + 0.01, kind: 'door', x: mz.entry.x, y: mz.entry.y, sealed: true });
  items.push({ d: mz.exit.x + mz.exit.y + 0.01, kind: 'door', x: mz.exit.x, y: mz.exit.y, sealed: false });
  items.push({ d: mz.player.x + mz.player.y, kind: 'player' });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.kind === 'wall') drawCubicle(mz, it.x, it.y, ox, oy, th, diamond);
    else if (it.kind === 'door') drawMazeDoor(it.x, it.y, ox, oy, it.sealed, mz.t);
    else drawMazePlayer(mz, ox, oy);
  }

  // the dark: you see a pool around you, and not much else
  const px = pp.x + ox, py = pp.y + oy;
  const g = ctx.createRadialGradient(px, py, 130, px, py, 360);
  g.addColorStop(0, 'rgba(4,2,8,0)');
  g.addColorStop(1, 'rgba(4,2,8,0.88)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // …except the other door's glow, which bleeds through the dark
  const ec = isoToScreen(mz.exit.x + 0.5, mz.exit.y + 0.5);
  const ex = ec.x + ox, ey = ec.y + oy - 20;
  if (ex > -80 && ex < W + 80 && ey > -80 && ey < H + 80) {
    const eg = ctx.createRadialGradient(ex, ey, 4, ex, ey, 90);
    eg.addColorStop(0, 'rgba(120,255,160,0.20)');
    eg.addColorStop(1, 'rgba(120,255,160,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(ex - 90, ey - 90, 180, 180);
  }

  // HUD
  ctx.fillStyle = '#c89aff'; ctx.font = 'bold 22px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('THE SPIDER FLOOR', W / 2, 34);
  ctx.fillStyle = '#7a6a8a'; ctx.font = '12px ui-monospace';
  ctx.fillText('the door sealed behind you — find the other lift', W / 2, 58);
  drawPauseChip(16, 16);
}

function drawCubicle(mz, x, y, ox, oy, th, diamond) {
  // low partition: you see OVER it (the swarm stays legible), you path around it
  const T = isoToScreen(x, y), R = isoToScreen(x + 1, y),
        B = isoToScreen(x + 1, y + 1), L = isoToScreen(x, y + 1);
  const lift = (p) => ({ x: p.x + ox, y: p.y + oy - ISO_WH });
  const flat = (p) => ({ x: p.x + ox, y: p.y + oy });
  const [Tf, Rf, Bf, Lf] = [T, R, B, L].map(flat);
  const [Tr, Rr, Br, Lr] = [T, R, B, L].map(lift);
  const h = (x * 31 + y * 71) % 11;     // subtle per-tile variance
  // left face (toward screen lower-left)
  ctx.fillStyle = th.wall;
  ctx.beginPath(); ctx.moveTo(Lf.x, Lf.y); ctx.lineTo(Bf.x, Bf.y); ctx.lineTo(Br.x, Br.y); ctx.lineTo(Lr.x, Lr.y); ctx.closePath(); ctx.fill();
  // right face (toward screen lower-right)
  ctx.fillStyle = th.wallDark;
  ctx.beginPath(); ctx.moveTo(Bf.x, Bf.y); ctx.lineTo(Rf.x, Rf.y); ctx.lineTo(Rr.x, Rr.y); ctx.lineTo(Br.x, Br.y); ctx.closePath(); ctx.fill();
  // top face — the cubicle's felt rim
  ctx.fillStyle = h < 8 ? th.slab : '#4a4456';   // the odd one is a filing cabinet
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
    // the way you came in — webbed shut, no handle, no hope
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

function drawMazePlayer(mz, ox, oy) {
  const P = mz.player;
  const c = isoToScreen(P.x, P.y);
  const x = c.x + ox, y = c.y + oy;
  const bob = Math.abs(Math.sin(P.walk)) * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y, 11, 5, 0, 0, 7); ctx.fill();
  const fy = y - bob;
  ctx.fillStyle = '#1a1410';                       // legs
  ctx.fillRect(x - 6, fy - 12, 5, 12); ctx.fillRect(x + 1, fy - 12, 5, 12);
  ctx.fillStyle = '#4a6a9a';                       // the operator's coat
  ctx.fillRect(x - 8, fy - 32, 16, 21);
  ctx.fillStyle = '#d4a878';                       // head
  ctx.beginPath(); ctx.arc(x, fy - 38, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a2018';                       // the cap
  ctx.fillRect(x - 7, fy - 43, 14, 4); ctx.fillRect(x - 4, fy - 47, 8, 5);
}
