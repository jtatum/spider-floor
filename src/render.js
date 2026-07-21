// THE SPIDER FLOOR — rendering
// (loaded as an ordered classic script; all files share one global scope)

// ════════════════════════════════════════════════════════════ RENDER

const SHAFT_LEFT = 230;
const SHAFT_RIGHT = 480;
const ROOM_LEFT = SHAFT_RIGHT;
const ROOM_RIGHT = 870;
const CENTER_Y = H / 2 + 10;

// Landmarks are the building's navigation language. Give every prop a stable
// accent that also appears in its room, so a floor reads as a whole silhouette
// instead of one small object floating in the dark.
const LANDMARK_ACCENTS = {
  lobby: '#d1a94f', red: '#d94a3c', plant: '#70bd4e', fire: '#ed6a3a',
  art: '#b66ee8', blue: '#4d82e8', crack: '#9a7958', clock: '#ded1b5',
  vend: '#ed5a43', green: '#56bd5a', window: '#75b4e8', penthouse: '#e1b84c',
  mirror: '#b9dbe4', neon: '#f064ae', pipes: '#55baa7', cat: '#e59643',
  aquarium: '#41b6d1',
};
function landmarkAccent(f) { return LANDMARK_ACCENTS[f.acc] || '#bfa45f'; }

// Generated landmark masters are optional atmosphere, never game state. Their
// boxes live in drawLandmark's local 190 x 116 exhibit frame; if an image is
// unavailable, the switch below draws its complete procedural counterpart.
const LANDMARK_SPRITE_BOXES = {
  red:       [6, -54, 52, 108],
  window:   [-5, -44, 74, 82],
  crack:    [12, -54, 40, 108],
  clock:    [-2, -36, 68, 68],
  vend:      [7, -54, 50, 108],
  plant:    [-6, -46, 78, 104],
  cat:      [-8, -5, 78, 58],
  aquarium: [-14, -39, 96, 82],
};

function drawLandmarkSprite(key) {
  const box = LANDMARK_SPRITE_BOXES[key];
  const image = box && typeof LandmarkAssets !== 'undefined' ? LandmarkAssets.get(key) : null;
  if (!image) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, box[0], box[1], box[2], box[3]);
  ctx.restore();
  return true;
}

function worldToScreen(wy) { return CENTER_Y - (wy - game.elev.y); }

function render() {
  buttons.length = 0;
  sliders.length = 0;
  const sh = save.shake === false ? 0 : (game && game.shake) || 0;   // settings: shake off
  const sx = (Math.random() - 0.5) * sh;
  const sy = (Math.random() - 0.5) * sh;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = '#0d0a08';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  const st = menu || (game ? game.state : 'TITLE');
  if (st !== lastScreen) { screenFade = 1; lastScreen = st; }   // fade-in on every screen change
  if (st === 'WORKSHOP')   drawWorkshop();
  else if (st === 'ACH')   drawAchievements();
  else if (st === 'OPERATOR') drawOperatorSelect();
  else if (st === 'SETTINGS') drawSettingsMenu();
  else if (st === 'TITLE') drawTitle();
  else if (st === 'SHOP')  drawShop();
  else if (st === 'MAZE') drawMaze();
  else if (st === 'BOSS') drawBoss();
  else if (st === 'VICTORY') drawVictory();
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
    if (st === 'PLAYING') drawCoach();
    if (st === 'LEVELUP') drawLevelUp();
    if (st === 'SHIFT_DONE') drawShiftDone();
    if (st === 'FIRED') drawFired();
  }

  if (paused && (st === 'PLAYING' || st === 'BOSS' || st === 'MAZE')) drawPaused();

  // the party doesn't follow you out of the party screens
  if (st !== 'LEVELUP' && st !== 'SHIFT_DONE' && st !== 'SHOP') cel.screen = null;

  drawToasts();

  if (screenFade > 0) {           // fade-in-from-black on screen changes
    ctx.fillStyle = `rgba(8,6,4,${screenFade})`;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    screenFade = Math.max(0, screenFade - 0.07);
  }
  ctx.restore();
}
let screenFade = 0, lastScreen = null;

// achievement-unlocked toasts, stacked top-right, in every screen
function drawToasts() {
  let ty = 80;
  for (const t of achToasts) {
    const a = Math.min(1, t.t) * Math.min(1, (4.2 - t.t) * 3);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const w = 264, x = W - w - 16;
    ctx.fillStyle = '#1a1408'; ctx.fillRect(x, ty, w, 44);
    ctx.fillStyle = '#ffd44a'; ctx.fillRect(x, ty, 4, 44);
    ctx.strokeStyle = '#ffd44a'; ctx.lineWidth = 1.5; ctx.strokeRect(x, ty, w, 44);
    ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 11px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('★ ACHIEVEMENT', x + 14, ty + 13);
    ctx.fillStyle = '#e8dcc0'; ctx.font = 'bold 14px ui-monospace';
    ctx.fillText(t.name, x + 14, ty + 30);
    ctx.fillStyle = '#7adf9a'; ctx.font = 'bold 14px ui-monospace'; ctx.textAlign = 'right';
    ctx.fillText(`+${t.award} ★`, x + w - 12, ty + 22);
    ctx.restore();
    ty += 52;
  }
}

// ── celebration fx: confetti, fireworks, bouncing emoji, gold motes ──
// Pure dopamine, drawn BEHIND each screen's content. The host screen calls
// celebrate('NAME') at the top of its draw; render() clears the rig whenever
// the player is anywhere else. Display-only — never touched by the sim.
const CEL_COLORS = ['#ffd44a', '#7adf9a', '#6ab8ff', '#ff7a9a', '#d88aff', '#ffaa5a'];
const CEL_EMOJI = ['🎉', '⭐', '💰', '🛗', '💎', '🍀'];
const cel = { screen: null, last: 0, spawn: 0, t: 0, parts: [] };

// Color emoji through ctx.fillText re-rasterizes the glyph EVERY draw — at our
// random fractional sizes the font cache never hits, and the bitmap churn
// (MB/s of garbage) stalls the whole tab when the GC collects it. So: each
// glyph is rasterized exactly ONCE into a small offscreen canvas, and every
// frame after that is a cheap drawImage scale.
const emojiSprites = new Map();
function emojiSprite(char) {
  let c = emojiSprites.get(char);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.font = '52px serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(char, 32, 36);
    emojiSprites.set(char, c);
  }
  return c;
}
function drawEmoji(char, size) {     // call with ctx already translated/rotated
  ctx.drawImage(emojiSprite(char), -size / 2, -size / 2, size, size);
}

function celebrate(screen) {
  const now = performance.now();
  let dt = Math.min(0.05, (now - cel.last) / 1000);
  cel.last = now;
  if (cel.screen !== screen) {                 // fresh screen, fresh party
    cel.screen = screen; cel.parts = []; cel.spawn = 0; cel.t = 0; dt = 0;
    if (screen === 'SHIFT_DONE') celRocket(true);   // the opening salvo
  }
  cel.t += dt;
  cel.spawn -= dt;
  if (cel.parts.length < 320) {
    if (screen === 'LEVELUP' && cel.spawn <= 0) { celConfetti(); cel.spawn = 0.05; }
    if (screen === 'SHIFT_DONE') {
      if (cel.spawn <= 0) { celRocket(); cel.spawn = 0.55 + Math.random() * 0.85; }
      if (Math.random() < dt * 1.6) celEmojiDrop();
    }
    if (screen === 'SHOP' && cel.spawn <= 0) { celMote(); cel.spawn = 0.13; }
  }

  // physics + draw, one pass
  for (const p of cel.parts) {
    p.life += dt;
    if (p.kind === 'confetti') {
      p.x += (p.vx + Math.sin(p.life * p.flut + p.phase) * 34) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > H + 12) p.dead = true;
    } else if (p.kind === 'rocket') {
      p.y += p.vy * dt;
      if (Math.random() < 0.6) cel.parts.push({ kind: 'spark', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20,
        vy: 40, life: 0, max: 0.35, size: 1.5, color: '#d8b24a' });
      if (p.y <= p.targetY) { p.dead = true; celBurst(p.x, p.y); }
    } else if (p.kind === 'spark') {
      p.vy += 150 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life > p.max) p.dead = true;
    } else if (p.kind === 'emoji') {
      p.vy += 460 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > H - 26 && p.vy > 0) {           // the floor — with bounce
        p.y = H - 26;
        p.vy = -p.vy * 0.55;
        p.vx *= 0.8; p.vr *= 0.7;
        if (Math.abs(p.vy) < 40) p.vy = 0;      // settled; fades out below
      }
      if (p.life > 5.5) p.dead = true;
    } else if (p.kind === 'mote') {
      p.y -= p.vy * dt;
      p.x += Math.sin(p.life * 1.4 + p.phase) * 12 * dt;
      if (p.y < -10) p.dead = true;
    }
    // draw
    if (p.dead) continue;
    if (p.kind === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.sin(p.life * 5 + p.phase))));
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'rocket') {
      ctx.fillStyle = '#ffe6a0';
      ctx.fillRect(p.x - 1.5, p.y - 4, 3, 8);
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      ctx.globalAlpha = 1;
    } else if (p.kind === 'emoji') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = p.life > 4.5 ? Math.max(0, 1 - (p.life - 4.5)) : 1;
      drawEmoji(p.char, p.size);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'mote') {
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(p.life * 2 + p.phase));
      ctx.fillStyle = '#d4a050';
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
  cel.parts = cel.parts.filter(p => !p.dead);
}
function celConfetti() {
  cel.parts.push({ kind: 'confetti', x: Math.random() * W, y: -10,
    vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 70,
    rot: Math.random() * 7, vr: (Math.random() - 0.5) * 7,
    w: 5 + Math.random() * 4, h: 7 + Math.random() * 5,
    flut: 2 + Math.random() * 3, phase: Math.random() * 7,
    color: CEL_COLORS[Math.floor(Math.random() * CEL_COLORS.length)], life: 0 });
}
function celRocket(opening) {
  cel.parts.push({ kind: 'rocket', x: 70 + Math.random() * (W - 140), y: H + 8,
    vy: -(380 + Math.random() * 160),
    targetY: (opening ? 140 : 110) + Math.random() * 200, life: 0 });
}
function celBurst(x, y) {
  const color = CEL_COLORS[Math.floor(Math.random() * CEL_COLORS.length)];
  const n = 26 + Math.floor(Math.random() * 16);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const sp = 70 + Math.random() * 170;
    cel.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0, max: 1.1 + Math.random() * 0.7, size: 1.5 + Math.random() * 1.3,
      color: Math.random() < 0.25 ? '#fff2c8' : color });
  }
}
function celEmojiDrop() {
  cel.parts.push({ kind: 'emoji', x: 40 + Math.random() * (W - 80), y: -24,
    vx: (Math.random() - 0.5) * 90, vy: 0,
    rot: 0, vr: (Math.random() - 0.5) * 8,
    char: CEL_EMOJI[Math.floor(Math.random() * CEL_EMOJI.length)],
    size: 20 + Math.random() * 14, life: 0 });
}
function celMote() {
  cel.parts.push({ kind: 'mote', x: Math.random() * W, y: H + 8,
    vy: 18 + Math.random() * 26, size: 1.5 + Math.random() * 1.5,
    phase: Math.random() * 7, life: 0 });
}

// ── the Tetris rule: BIG letters defect to their Cyrillic look-alikes; body
// text stays loyal and legible. Headers only — В ЛИФТЕ ВСЕ РАВНЫ.
function cyr(s) {
  return s.replace(/R/g, 'Я').replace(/N/g, 'И').replace(/E/g, 'Э');
}

// a draggable slider: grab anywhere on the track. Registered into `sliders`
// each frame, the pointer handlers in sim.js do the rest.
function drawSlider(label, x, y, w, value, set) {
  const v = Math.max(0, Math.min(1, value ?? 1));
  ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 13px ui-monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 10);
  const tx = x + 118, tw = w - 118 - 56;
  ctx.fillStyle = '#2a2218'; ctx.fillRect(tx, y + 6, tw, 8);
  ctx.fillStyle = '#caa33a'; ctx.fillRect(tx, y + 6, tw * v, 8);
  ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, y + 5.5, tw, 9);
  ctx.fillStyle = '#ffd44a'; ctx.fillRect(tx + tw * v - 3, y - 1, 6, 22);   // the knob
  ctx.fillStyle = '#9a8a64'; ctx.font = '12px ui-monospace'; ctx.textAlign = 'right';
  ctx.fillText(v === 0 ? 'OFF' : `${Math.round(v * 100)}%`, x + w, y + 10);
  // a generous grab zone for thumbs
  sliders.push({ x: tx - 10, y: y - 10, w: tw + 20, h: 40, tx, tw, set });
}

// the settings rows, shared by the in-run pause modal and the title screen
function drawSettingsRows(inRun) {
  const bw = 360, bx = W / 2 - bw / 2, bh = 42, gap = 12;
  let by = 212;
  drawButton(inRun ? '▸  RESUME' : '◂  BACK', bx, by, bw, bh,
             () => { if (inRun) setPaused(false); else menu = null; }, true);
  by += bh + gap + 6;
  drawSlider('MUSIC', bx + 6, by, bw - 12, save.musicVol ?? 1, f => setVol('musicVol', f));
  by += 44;
  drawSlider('SOUND FX', bx + 6, by, bw - 12, save.sfxVol ?? 1, f => setVol('sfxVol', f));
  by += 50;
  drawButton(`SCREEN SHAKE  ${save.shake === false ? 'OFF' : 'ON'}`, bx, by, bw, bh, toggleShake, false);
  by += bh + gap;
  if (!inRun) {
    // the flight recorder lives here: copy it out, paste it at the mechanic
    drawButton(metCopied > performance.now() ? '✓  COPIED — paste it to Claude' : '⎘  COPY METRICS FOR TUNING',
               bx, by, bw, bh, copyMetrics, false);
    by += bh + 4;
    ctx.fillStyle = '#95866a'; ctx.font = '11px ui-monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`recorded locally: ${metricsSummary()} — never leaves this machine`, W / 2, by + 6);
    by += 22;
  }
  if (inRun) {
    by += 8;
    // abandon wants a deliberate second tap — and reads like it
    if (abandonArm) {
      ctx.fillStyle = '#e0584a'; ctx.font = 'bold 12px ui-monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('the run ends here — sure?', W / 2, by - 6);
    }
    drawButton(abandonArm ? '✕  TAP AGAIN TO ABANDON' : '✕  ABANDON RUN', bx, by, bw, bh, abandonRun, false);
    by += bh + gap;
  }
  ctx.fillStyle = '#a99772'; ctx.font = '13px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(touchEnabled ? (inRun ? 'tap RESUME to keep working' : 'tap BACK when you\'re done')
                            : (inRun ? 'P or ESC to resume  ·  M mute' : 'ESC back  ·  M mute'), W / 2, by + 14);
}

// in-run: the pause modal over the frozen game
function drawPaused() {
  ctx.fillStyle = 'rgba(8,6,4,0.84)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(31,24,16,0.96)'; ctx.fillRect(W / 2 - 210, 118, 420, 414);
  ctx.strokeStyle = '#8d754a'; ctx.lineWidth = 1.5; ctx.strokeRect(W / 2 - 209.5, 118.5, 419, 413);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e2c675'; ctx.font = 'bold 40px ui-monospace';
  ctx.fillText('PAUSED', W / 2, 156);
  drawSettingsRows(true);
}

// from the title: same panel, no run to resume or abandon
function drawSettingsMenu() {
  ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#151216'; ctx.fillRect(W / 2 - 210, 118, 420, 468);
  ctx.strokeStyle = '#514b58'; ctx.lineWidth = 1.5; ctx.strokeRect(W / 2 - 209.5, 118.5, 419, 467);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d9cba8'; ctx.font = 'bold 40px ui-monospace';
  ctx.fillText('SETTINGS', W / 2, 156);
  drawSettingsRows(false);
}

// the on-screen pause chip: touch's only route to the modal (and its sliders
// and ABANDON), so on phones it must be a real target, not a 10-CSS-px dare.
// `anchor: 'up'` grows the bigger touch chip upward from (x, y+26).
function drawPauseChip(x, y, anchor) {
  if (paused) return;                    // the modal draws its own buttons
  const s = touchEnabled ? 44 : 26;
  if (anchor === 'up') y -= s - 26;
  ctx.fillStyle = 'rgba(13,10,8,0.85)'; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  ctx.fillStyle = '#bfa45f';
  const bw = Math.round(s * 0.15), bh = Math.round(s * 0.46), inset = Math.round(s * 0.30), by = y + Math.round(s * 0.27);
  ctx.fillRect(x + inset, by, bw, bh);
  ctx.fillRect(x + s - inset - bw, by, bw, bh);
  const pad = touchEnabled ? 14 : 0;     // generous invisible slop for thumbs
  buttons.push({ x: x - pad, y: y - pad, w: s + pad * 2, h: s + pad * 2, fn: () => setPaused(true) });
}

// contextual nudges for a brand-new operator — only on shift 1 of a fresh profile
function drawCoach() {
  if (run.shiftNum !== 1 || save.stats.shifts > 0 || game.introT > 0) return;
  const waiting = game.passengers.some(p => p.state === 'waiting');
  const riding = game.passengers.some(p => p.state === 'riding');
  let msg = null;
  if (game.delivered === 0) {
    if (riding) msg = 'remember their floor — the tag fades to "?" · crank ↑, reverse-crank to brake';
    else if (waiting) msg = 'stop LEVEL with the lobby (green dot lights up) and press SPACE';
    else msg = 'your first rider is on their way to the lobby…';
  } else if (game.delivered === 1) {
    msg = 'that\'s the job — now keep ahead of their patience bars';
  }
  if (!msg) return;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'italic 14px ui-monospace';
  ctx.fillStyle = 'rgba(13,10,8,0.8)';
  const tw = ctx.measureText(msg).width + 28;
  ctx.fillRect(W / 2 - tw / 2, H - 64, tw, 26);
  ctx.fillStyle = '#9adf7a';
  ctx.fillText(msg, W / 2, H - 51);
  ctx.restore();
}

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
    if (p.emoji) {                       // a celebratory emoji, tumbling
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      drawEmoji(p.emoji, p.size);
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  for (const f of game.floaters) {
    const k = f.life / f.max;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = f.color;
    const base = touchEnabled ? 19 : 15;                 // phone-legible fare pops
    ctx.font = `bold ${base + (1 - k) * 6}px ui-monospace`;
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
  ctx.fillText(cyr(`SHIFT ${run.shiftNum}`), W / 2, H / 2 - 58);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#ad9b74';
  const ms = maxStrikes();
  ctx.fillText(`deliver ${game.quota} before ${['zero','one','two','three','four','five','six'][ms] || ms} walk-offs`, W / 2, H / 2 - 24);

  if (run.heat > 0) {
    ctx.fillStyle = '#ff7a3a'; ctx.font = 'bold 13px ui-monospace';
    ctx.fillText(`HEAT ${run.heat} — ${HEAT.slice(0, run.heat).map(h => h.name).join(' · ')}`, W / 2, H / 2 + 96);
  }
  if (game.modifiers.length === 0) {
    ctx.fillStyle = '#91a879'; ctx.font = 'italic 15px ui-monospace';
    ctx.fillText('a calm, ordinary day, comrade', W / 2, H / 2 + 16);
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

  // Staggered masonry, mortar and grime. The old checkerboard stated "wall"
  // but read as a flat UI pattern; these quieter layers give the building age
  // and keep the cabin/landmarks at the top of the contrast stack.
  ctx.fillStyle = th.wallDark;
  for (let y = 0; y < H; y += 30) {
    const off = (Math.floor(y / 30) % 2) * 30;
    for (let x = 0; x < SHAFT_LEFT; x += 60) ctx.fillRect(x + off, y, 28, 28);
    for (let x = ROOM_RIGHT; x < W; x += 60) ctx.fillRect(x + off, y, 28, 28);
  }
  ctx.strokeStyle = 'rgba(205,180,135,0.055)'; ctx.lineWidth = 1;
  for (let y = 29.5; y < H; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SHAFT_LEFT, y);
    ctx.moveTo(ROOM_RIGHT, y); ctx.lineTo(W, y); ctx.stroke();
  }
  const grime = ctx.createLinearGradient(0, 0, 0, H);
  grime.addColorStop(0, 'rgba(0,0,0,0.02)');
  grime.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  grime.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = grime; ctx.fillRect(0, 0, SHAFT_LEFT, H); ctx.fillRect(ROOM_RIGHT, 0, W - ROOM_RIGHT, H);

  // Old utility conduits and junction boxes frame the play space. Their
  // deterministic placement adds detail without flickering from frame to frame.
  ctx.strokeStyle = 'rgba(172,140,92,0.24)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(42, -10); ctx.lineTo(42, 116); ctx.lineTo(66, 140); ctx.lineTo(66, H + 10);
  ctx.moveTo(W - 34, -10); ctx.lineTo(W - 34, 210); ctx.lineTo(W - 54, 230); ctx.lineTo(W - 54, H + 10); ctx.stroke();
  for (const [x, y] of [[66, 186], [66, 482], [W - 54, 276], [W - 54, 566]]) {
    ctx.fillStyle = 'rgba(18,13,9,0.78)'; ctx.fillRect(x - 10, y - 13, 20, 26);
    ctx.strokeStyle = 'rgba(191,164,95,0.30)'; ctx.lineWidth = 1; ctx.strokeRect(x - 9.5, y - 12.5, 19, 25);
    ctx.fillStyle = 'rgba(220,188,110,0.30)';
    ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
  }

  // shaft
  ctx.fillStyle = th.shaft;
  ctx.fillRect(SHAFT_LEFT, 0, SHAFT_RIGHT - SHAFT_LEFT, H);

  // Dim rear cables and cross-braces create depth behind the moving car.
  ctx.strokeStyle = 'rgba(118,98,72,0.18)'; ctx.lineWidth = 2;
  for (const x of [SHAFT_LEFT + 54, SHAFT_RIGHT - 54]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(124,104,78,0.13)'; ctx.lineWidth = 3;
  for (let y = 28; y < H; y += 116) {
    ctx.beginPath(); ctx.moveTo(SHAFT_LEFT + 18, y); ctx.lineTo(SHAFT_RIGHT - 18, y + 74);
    ctx.moveTo(SHAFT_RIGHT - 18, y); ctx.lineTo(SHAFT_LEFT + 18, y + 74); ctx.stroke();
  }
  ctx.strokeStyle = th.col;
  ctx.lineWidth = 5;
  for (const x of [SHAFT_LEFT + 14, SHAFT_RIGHT - 14]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = 'rgba(210,180,120,0.14)';
    for (let y = 14; y < H; y += 54) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
  }

  // World-anchored rail ties slide past the camera, making speed legible even
  // when no floor is currently on screen.
  const railStep = 86;
  const worldBottom = game.elev.y - CENTER_Y - railStep;
  const firstRail = Math.floor(worldBottom / railStep) * railStep;
  for (let wy = firstRail; wy < worldBottom + H + railStep * 2; wy += railStep) {
    const ry = worldToScreen(wy);
    ctx.fillStyle = 'rgba(121,98,69,0.42)';
    ctx.fillRect(SHAFT_LEFT + 8, ry - 3, 30, 6);
    ctx.fillRect(SHAFT_RIGHT - 38, ry - 3, 30, 6);
    ctx.fillStyle = 'rgba(218,183,112,0.26)';
    ctx.fillRect(SHAFT_LEFT + 12, ry - 1, 4, 2);
    ctx.fillRect(SHAFT_RIGHT - 16, ry - 1, 4, 2);
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

  // off-screen call markers: someone is waiting beyond the view, up or down
  let callsUp = 0, callsDown = 0;
  for (const p of game.passengers) {
    if (p.state !== 'waiting' || p.origin === 0) continue;
    const sy = worldToScreen(p.origin * CFG.floorHeight);
    if (sy < 30) callsUp++;
    else if (sy > H - 30) callsDown++;
  }
  const callX = (SHAFT_LEFT + SHAFT_RIGHT) / 2;
  const pulse = 0.5 + 0.4 * Math.sin(game.t * 6);
  ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (callsUp) {
    ctx.fillStyle = `rgba(255,200,90,${pulse})`;
    ctx.fillText(`▲ ${callsUp} call${callsUp > 1 ? 's' : ''}`, callX, 56);
  }
  if (callsDown) {
    ctx.fillStyle = `rgba(255,200,90,${pulse})`;
    ctx.fillText(`▼ ${callsDown} call${callsDown > 1 ? 's' : ''}`, callX, H - 44);
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

  // Recess the room behind the landing with panel seams and a side-to-side
  // shadow. This makes the doorway and prop feel embedded in architecture.
  const depth = ctx.createLinearGradient(ROOM_LEFT, 0, ROOM_RIGHT, 0);
  depth.addColorStop(0, 'rgba(0,0,0,0.34)');
  depth.addColorStop(0.18, 'rgba(0,0,0,0.05)');
  depth.addColorStop(0.82, 'rgba(0,0,0,0.02)');
  depth.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = depth; ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight);
  ctx.strokeStyle = 'rgba(210,190,155,0.065)'; ctx.lineWidth = 1;
  for (let x = ROOM_LEFT + 92; x < ROOM_RIGHT; x += 96) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, top + 10); ctx.lineTo(x + 0.5, bot - 10); ctx.stroke();
  }

  const accent = landmarkAccent(f);
  ctx.fillStyle = accent; ctx.globalAlpha = 0.22;
  ctx.fillRect(ROOM_RIGHT - 8, top + 12, 4, CFG.floorHeight - 28);
  ctx.globalAlpha = 1;

  // A wider pool and tapered cone make the landmark the room's focal point.
  const lx = ROOM_LEFT + (ROOM_RIGHT - ROOM_LEFT) * 0.62;
  ctx.fillStyle = th.light || 'rgba(255,210,140,0.08)';
  ctx.beginPath(); ctx.moveTo(lx - 12, top + 6); ctx.lineTo(lx + 12, top + 6);
  ctx.lineTo(lx + 112, bot - 10); ctx.lineTo(lx - 112, bot - 10); ctx.closePath(); ctx.fill();
  const lg = ctx.createRadialGradient(lx, top + 4, 4, lx, top + 26, 126);
  lg.addColorStop(0, th.light || 'rgba(255,210,140,0.13)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, CFG.floorHeight * 0.7);
  // the lamp itself
  ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,236,190,0.94)'; ctx.fillRect(lx - 12, top + 3, 24, 4); ctx.restore();
  ctx.fillStyle = th.slab;
  ctx.fillRect(ROOM_LEFT, bot - 8, ROOM_RIGHT - ROOM_LEFT, 8);
  ctx.fillStyle = 'rgba(220,190,140,0.10)'; ctx.fillRect(ROOM_LEFT, bot - 8, ROOM_RIGHT - ROOM_LEFT, 2);
  ctx.fillStyle = th.ceil;
  ctx.fillRect(ROOM_LEFT, top, ROOM_RIGHT - ROOM_LEFT, 6);

  // no painted floor number — you navigate by the landmark alone (the building
  // has no display). The Floor Counter upgrade is the only way to read a number.
  drawLandmark(f, ROOM_RIGHT - 106, sy);

  // Elevator portal, lintel and call plate: the strong vertical on every floor.
  ctx.fillStyle = 'rgba(5,4,3,0.38)'; ctx.fillRect(ROOM_LEFT + 5, top + 10, 62, CFG.floorHeight - 18);
  ctx.strokeStyle = th.slab; ctx.lineWidth = 4;
  ctx.strokeRect(ROOM_LEFT + 4, top + 8, 64, CFG.floorHeight - 16);
  ctx.fillStyle = 'rgba(218,188,132,0.18)'; ctx.fillRect(ROOM_LEFT + 8, top + 12, 56, 3);
  ctx.fillStyle = '#18130e'; ctx.fillRect(ROOM_LEFT + 71, top + 24, 12, 22);
  ctx.strokeStyle = 'rgba(191,164,95,0.38)'; ctx.lineWidth = 1; ctx.strokeRect(ROOM_LEFT + 71.5, top + 24.5, 11, 21);
  ctx.fillStyle = idx > 0 ? '#6e5833' : '#8b7441'; ctx.beginPath(); ctx.arc(ROOM_LEFT + 77, top + 34, 2.5, 0, 7); ctx.fill();

  // whoever is waiting on THIS floor queues by the lift door
  const waiting = game.passengers.filter(p => p.state === 'waiting' && p.origin === idx);
  let px = ROOM_LEFT + 96;
  // The lobby bench/plant is intentionally wide; keep its queue tighter so the
  // landmark remains readable, with the overflow badge carrying the count.
  const maxVisibleWaiting = f.acc === 'lobby' ? 2 : 3;
  const visibleWaiting = waiting.slice(0, maxVisibleWaiting);
  for (const p of visibleWaiting) {
    p.tx = px;
    p.x = p.x ? p.x + (p.tx - p.x) * 0.2 : p.tx;
    drawPassenger(p, p.x, bot - 8, 'waiting', 'all', 0, touchEnabled ? 1.12 : 1);
    px += 44;
  }
  if (waiting.length > visibleWaiting.length) {
    const extra = waiting.length - visibleWaiting.length;
    ctx.fillStyle = 'rgba(12,9,7,0.90)'; ctx.fillRect(ROOM_LEFT + 82, top + 14, 74, 22);
    ctx.strokeStyle = '#d4b86e'; ctx.lineWidth = 1; ctx.strokeRect(ROOM_LEFT + 82.5, top + 14.5, 73, 21);
    ctx.fillStyle = '#f0d896'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`+${extra} WAITING`, ROOM_LEFT + 119, top + 25);
  }

  // Delivery is credited immediately, but the person gets a brief visible
  // walk out of the portal instead of vanishing on the payout frame.
  const departing = game.passengers.filter(p => p.state === 'delivered' && p.dest === idx);
  for (let i = 0; i < departing.length; i++) {
    const p = departing[i];
    const startAt = (p.removeAt || game.t) - CFG.passengerMoveTime;
    const t = passengerMoveProgress(startAt);
    const eased = 1 - Math.pow(1 - t, 2);
    const walkX = ROOM_LEFT + 61 + eased * 72 + i * 8;
    const exitAlpha = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
    drawPassenger(p, walkX, bot - 8, 'departing', 'body', 0, touchEnabled ? 1.12 : 1, exitAlpha);
  }
  // an upstairs call lights the lamp on the door frame — your cue to climb
  if (idx > 0 && waiting.length) {
    const a = 0.45 + 0.45 * Math.sin(game.t * 6);
    ctx.fillStyle = `rgba(255,200,90,${a})`;
    ctx.beginPath(); ctx.arc(ROOM_LEFT + 14, top + 20, 4, 0, 7); ctx.fill();
  }
}

function drawLandmark(f, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.16, 1.16);
  x = 0; y = 0;
  // A faint exhibit frame groups each landmark into one bold, glanceable mass.
  const accent = landmarkAccent(f);
  ctx.fillStyle = accent; ctx.globalAlpha = 0.035; ctx.fillRect(-104, -58, 190, 116);
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.16; ctx.lineWidth = 1;
  ctx.strokeRect(-103.5, -57.5, 189, 115);
  ctx.globalAlpha = 1;
  if (drawLandmarkSprite(f.acc)) { ctx.restore(); return; }
  switch (f.acc) {
    case 'lobby':
      // A small institutional vestibule: enamel wayfinding, a hard bench,
      // coat stand and the inevitable half-neglected ficus. Cyrillic stays on
      // the physical sign; game UI remains English.
      ctx.fillStyle = '#29241c'; ctx.fillRect(x - 48, y - 39, 96, 19);
      ctx.strokeStyle = '#9c8449'; ctx.lineWidth = 1; ctx.strokeRect(x - 47.5, y - 38.5, 95, 18);
      ctx.fillStyle = '#dbc477'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; ctx.fillText('ВЕСТИБЮЛЬ', x, y - 29);

      // Timber-and-tube waiting bench.
      ctx.fillStyle = '#6e4a2b'; ctx.fillRect(x - 50, y + 14, 98, 9);
      ctx.fillStyle = '#47311f'; ctx.fillRect(x - 50, y + 25, 98, 7);
      ctx.fillStyle = '#827157'; ctx.fillRect(x - 47, y + 32, 4, 18); ctx.fillRect(x + 41, y + 32, 4, 18);
      ctx.strokeStyle = '#a69370'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 48, y + 13); ctx.lineTo(x - 48, y - 1);
      ctx.moveTo(x + 46, y + 13); ctx.lineTo(x + 46, y - 1); ctx.stroke();

      // Ficus in a plain ceramic pot.
      ctx.fillStyle = '#6f4b31'; ctx.fillRect(x - 88, y + 31, 18, 18);
      ctx.fillStyle = '#344f2b';
      ctx.beginPath(); ctx.ellipse(x - 79, y + 17, 13, 20, -0.18, 0, 7); ctx.fill();
      ctx.fillStyle = '#52723a';
      ctx.beginPath(); ctx.ellipse(x - 86, y + 10, 7, 12, -0.5, 0, 7); ctx.ellipse(x - 73, y + 8, 7, 13, 0.45, 0, 7); ctx.fill();

      // Bent steel coat stand.
      ctx.strokeStyle = '#87775e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 71, y + 48); ctx.lineTo(x + 71, y - 5);
      ctx.moveTo(x + 60, y + 48); ctx.lineTo(x + 82, y + 48);
      ctx.moveTo(x + 71, y + 1); ctx.lineTo(x + 62, y + 8);
      ctx.moveTo(x + 71, y + 1); ctx.lineTo(x + 80, y + 8); ctx.stroke();
      break;
    case 'red':
      ctx.fillStyle = '#77271f'; ctx.fillRect(x - 3, y - 43, 66, 86);
      ctx.fillStyle = '#b83a2d'; ctx.fillRect(x, y - 40, 60, 80);
      ctx.fillStyle = 'rgba(245,126,92,0.20)'; ctx.fillRect(x + 5, y - 35, 3, 68);
      // Faded diagonal safety stripe and a stamped utility plate.
      ctx.strokeStyle = 'rgba(235,195,135,0.32)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x + 11, y + 30); ctx.lineTo(x + 40, y - 30); ctx.stroke();
      ctx.fillStyle = '#c9b384'; ctx.fillRect(x + 35, y - 29, 16, 10);
      ctx.fillStyle = '#463a2b'; ctx.fillRect(x + 38, y - 26, 10, 1); ctx.fillRect(x + 38, y - 23, 7, 1);
      // Plain black Bakelite latch and exposed hinges.
      ctx.fillStyle = '#211c18'; ctx.fillRect(x + 45, y - 3, 10, 7); ctx.fillRect(x + 42, y - 1, 9, 3);
      ctx.fillStyle = '#52463a'; ctx.fillRect(x + 1, y - 27, 4, 12); ctx.fillRect(x + 1, y + 17, 4, 12);
      break;
    case 'plant':
      ctx.fillStyle = '#6f4b31'; ctx.fillRect(x + 12, y + 22, 32, 32);
      ctx.fillStyle = '#8b6645'; ctx.fillRect(x + 9, y + 18, 38, 7);
      ctx.fillStyle = '#344f2b'; ctx.beginPath(); ctx.ellipse(x + 28, y + 4, 25, 32, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#52723a'; ctx.beginPath(); ctx.ellipse(x + 18, y - 9, 13, 18, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#667f43'; ctx.beginPath(); ctx.ellipse(x + 39, y - 5, 10, 15, -0.4, 0, 7); ctx.fill();
      break;
    case 'fire':
      // Blocky instruction placard and wall bracket make this read as building
      // safety equipment rather than a floating red rectangle.
      ctx.fillStyle = '#ddd0a8'; ctx.fillRect(x + 5, y - 48, 54, 21);
      ctx.strokeStyle = '#8d382c'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y - 48, 54, 21);
      ctx.fillStyle = '#9f2f25'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; ctx.fillText('ПОЖАР', x + 32, y - 37);
      ctx.fillStyle = '#5c493b'; ctx.fillRect(x + 13, y + 11, 42, 5); ctx.fillRect(x + 16, y + 44, 36, 4);
      ctx.fillStyle = '#b52d24'; ctx.fillRect(x + 22, y + 3, 22, 45);
      ctx.beginPath(); ctx.arc(x + 33, y + 4, 11, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#211b17'; ctx.fillRect(x + 26, y - 6, 14, 9);
      ctx.strokeStyle = '#24201d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 39, y - 2); ctx.quadraticCurveTo(x + 57, y + 1, x + 51, y + 29); ctx.stroke();
      ctx.fillStyle = '#e6d39c'; ctx.fillRect(x + 25, y + 19, 16, 7);
      ctx.fillStyle = '#8d382c'; ctx.fillRect(x + 28, y + 21, 10, 2);
      break;
    case 'art':
      // Ceramic public-art relief: tiled ground, orbit, sun and a simplified
      // ascending spacecraft. It keeps the purple identity without resembling
      // a generic framed painting.
      ctx.fillStyle = '#887a69'; ctx.fillRect(x - 15, y - 43, 82, 64);
      ctx.fillStyle = '#514268'; ctx.fillRect(x - 11, y - 39, 74, 56);
      const mosaicCols = ['#59496e', '#665375', '#4b526d', '#73505d'];
      for (let my = 0; my < 4; my++) for (let mx = 0; mx < 6; mx++) {
        ctx.fillStyle = mosaicCols[(mx + my * 2) % mosaicCols.length];
        ctx.fillRect(x - 9 + mx * 12, y - 37 + my * 13, 10, 11);
      }
      ctx.strokeStyle = '#d5b45b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x + 20, y - 11, 29, 15, -0.38, 0, 7); ctx.stroke();
      ctx.fillStyle = '#d5a84c'; ctx.beginPath(); ctx.arc(x + 2, y - 18, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#a9c8c9';
      ctx.beginPath(); ctx.moveTo(x + 37, y + 6); ctx.lineTo(x + 43, y - 24); ctx.lineTo(x + 50, y + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d85e45'; ctx.beginPath(); ctx.moveTo(x + 39, y + 5); ctx.lineTo(x + 43, y + 14); ctx.lineTo(x + 46, y + 4); ctx.fill();
      break;
    case 'blue':
      ctx.fillStyle = '#183f78'; ctx.fillRect(x - 3, y - 43, 66, 86);
      ctx.fillStyle = '#315f9d'; ctx.fillRect(x, y - 40, 60, 80);
      // Wired/frosted glazing, common institutional lever and scuffed kickplate.
      ctx.fillStyle = 'rgba(184,211,218,0.42)'; ctx.fillRect(x + 10, y - 31, 40, 25);
      ctx.strokeStyle = '#253c55'; ctx.lineWidth = 2; ctx.strokeRect(x + 10, y - 31, 40, 25);
      ctx.lineWidth = 0.8;
      for (let bx = 14; bx < 50; bx += 6) { ctx.beginPath(); ctx.moveTo(x + bx, y - 30); ctx.lineTo(x + bx, y - 7); ctx.stroke(); }
      for (let by = -26; by < -7; by += 6) { ctx.beginPath(); ctx.moveTo(x + 11, y + by); ctx.lineTo(x + 49, y + by); ctx.stroke(); }
      ctx.fillStyle = '#25282a'; ctx.fillRect(x + 41, y + 4, 14, 5); ctx.fillRect(x + 49, y + 2, 5, 10);
      ctx.fillStyle = '#67747d'; ctx.fillRect(x + 5, y + 28, 50, 8);
      break;
    case 'crack':
      // Failed plaster exposes aggregate, rebar and an older brick repair—not
      // the timber lath associated with a different architectural vocabulary.
      ctx.fillStyle = '#9a876c'; ctx.fillRect(x + 10, y - 50, 42, 100);
      ctx.fillStyle = '#5d5a51';
      ctx.beginPath(); ctx.moveTo(x + 38, y - 48); ctx.lineTo(x + 52, y - 48); ctx.lineTo(x + 52, y + 7);
      ctx.lineTo(x + 43, y + 2); ctx.lineTo(x + 36, y - 19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#794536';
      for (let by = 12; by < 48; by += 10) for (let bx = 11; bx < 49; bx += 15) {
        ctx.fillRect(x + bx + ((by / 10) % 2) * 5, y + by, 13, 8);
      }
      ctx.strokeStyle = '#793f31'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 43, y - 45); ctx.lineTo(x + 43, y + 4);
      ctx.moveTo(x + 36, y - 24); ctx.lineTo(x + 51, y - 24); ctx.stroke();
      ctx.fillStyle = '#a89575'; ctx.fillRect(x + 14, y - 8, 19, 28);
      ctx.strokeStyle = '#655746'; ctx.lineWidth = 1; ctx.strokeRect(x + 14.5, y - 7.5, 18, 27);
      break;
    case 'clock':
      ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(x + 28, y - 6, 27, 0, 7); ctx.fill();
      ctx.fillStyle = '#e0d1b3'; ctx.beginPath(); ctx.arc(x + 28, y - 6, 22, 0, 7); ctx.fill();
      ctx.fillStyle = '#362c22';
      ctx.fillRect(x + 26, y - 26, 4, 7); ctx.fillRect(x + 26, y + 7, 4, 7);
      ctx.fillRect(x + 8, y - 8, 7, 4); ctx.fillRect(x + 41, y - 8, 7, 4);
      ctx.strokeStyle = '#32291f'; ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(x + 28, y - 6); ctx.lineTo(x + 19, y - 15);
      ctx.moveTo(x + 28, y - 6); ctx.lineTo(x + 42, y - 14); ctx.stroke();
      ctx.strokeStyle = '#a9362d'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(x + 28, y - 6); ctx.lineTo(x + 28, y + 11); ctx.stroke();
      break;
    case 'vend':
      // AT-style soda-water dispenser: controls above, one communal glass and
      // its rinse grate below. No packaged-product display.
      ctx.fillStyle = '#516d76'; ctx.fillRect(x + 5, y - 47, 52, 94);
      ctx.fillStyle = '#d1c6aa'; ctx.fillRect(x + 10, y - 42, 42, 34);
      ctx.strokeStyle = '#27363a'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y - 47, 52, 94);
      ctx.fillStyle = '#2c3130'; ctx.fillRect(x + 15, y - 34, 9, 16);
      ctx.fillStyle = '#9c3b31'; ctx.beginPath(); ctx.arc(x + 42, y - 31, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#a89a78'; ctx.beginPath(); ctx.arc(x + 42, y - 18, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#171d1f'; ctx.fillRect(x + 14, y - 1, 34, 32);
      ctx.strokeStyle = '#7d8a87'; ctx.lineWidth = 1; ctx.strokeRect(x + 14.5, y - 0.5, 33, 31);
      ctx.strokeStyle = '#b7c4c2'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 27, y + 8); ctx.lineTo(x + 29, y + 24); ctx.lineTo(x + 35, y + 24); ctx.lineTo(x + 37, y + 8); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = '#6f716a'; ctx.lineWidth = 1;
      for (let gy = 27; gy <= 29; gy += 2) { ctx.beginPath(); ctx.moveTo(x + 18, y + gy); ctx.lineTo(x + 44, y + gy); ctx.stroke(); }
      break;
    case 'green':
      ctx.fillStyle = '#1d5726'; ctx.fillRect(x - 3, y - 43, 66, 86);
      ctx.fillStyle = '#367c3d'; ctx.fillRect(x, y - 40, 60, 80);
      // Stamped ribs and louvred vents replace the barn-door cross brace.
      ctx.strokeStyle = 'rgba(185,220,168,0.30)'; ctx.lineWidth = 2;
      for (let gx = 12; gx <= 48; gx += 12) {
        ctx.beginPath(); ctx.moveTo(x + gx, y - 34); ctx.lineTo(x + gx, y + 32); ctx.stroke();
      }
      ctx.fillStyle = '#1d4a27'; ctx.fillRect(x + 10, y + 12, 30, 17);
      ctx.strokeStyle = '#76906e'; ctx.lineWidth = 1;
      for (let gy = 16; gy <= 25; gy += 3) { ctx.beginPath(); ctx.moveTo(x + 13, y + gy); ctx.lineTo(x + 37, y + gy); ctx.stroke(); }
      ctx.fillStyle = '#20241f'; ctx.fillRect(x + 45, y - 3, 10, 7); ctx.fillRect(x + 42, y - 1, 8, 3);
      break;
    case 'window':
      ctx.fillStyle = '#24476f'; ctx.fillRect(x, y - 46, 64, 82);
      ctx.fillStyle = 'rgba(128,174,205,0.30)'; ctx.fillRect(x + 4, y - 42, 56, 74);
      ctx.strokeStyle = '#b6aa8c'; ctx.lineWidth = 4;
      ctx.strokeRect(x, y - 46, 64, 92);
      ctx.beginPath(); ctx.moveTo(x + 32, y - 46); ctx.lineTo(x + 32, y + 46);
      ctx.moveTo(x, y); ctx.lineTo(x + 64, y); ctx.stroke();
      ctx.fillStyle = 'rgba(220,230,218,0.22)';
      ctx.beginPath(); ctx.moveTo(x + 5, y - 40); ctx.lineTo(x + 25, y - 40); ctx.lineTo(x + 5, y - 9); ctx.fill();
      ctx.fillStyle = '#66594a'; ctx.fillRect(x - 4, y + 39, 72, 7);
      break;
    case 'penthouse':
      // The old marquee penthouse becomes the executive landing: imposing
      // double doors, sober brass trim and a diegetic directorate sign.
      ctx.fillStyle = '#30281f'; ctx.fillRect(x - 24, y - 43, 108, 89);
      ctx.fillStyle = '#68533a'; ctx.fillRect(x - 20, y - 39, 50, 81); ctx.fillRect(x + 34, y - 39, 46, 81);
      ctx.fillStyle = '#3e3225';
      ctx.fillRect(x - 15, y - 31, 40, 27); ctx.fillRect(x + 39, y - 31, 36, 27);
      ctx.fillRect(x - 15, y + 5, 40, 29); ctx.fillRect(x + 39, y + 5, 36, 29);
      ctx.strokeStyle = '#b79a58'; ctx.lineWidth = 2;
      ctx.strokeRect(x - 20, y - 39, 50, 81); ctx.strokeRect(x + 34, y - 39, 46, 81);
      ctx.fillStyle = '#c5a55a'; ctx.fillRect(x + 25, y - 1, 4, 14); ctx.fillRect(x + 35, y - 1, 4, 14);
      ctx.fillStyle = '#26231d'; ctx.fillRect(x - 13, y - 56, 90, 17);
      ctx.strokeStyle = '#b79a58'; ctx.lineWidth = 1; ctx.strokeRect(x - 12.5, y - 55.5, 89, 16);
      ctx.fillStyle = '#dbc77f'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; ctx.fillText('ДИРЕКЦИЯ', x + 32, y - 47);
      break;
    case 'mirror':
      ctx.fillStyle = '#65777b'; ctx.fillRect(x + 4, y - 46, 48, 92);
      ctx.fillStyle = '#9eb5b9'; ctx.fillRect(x + 8, y - 42, 40, 84);
      ctx.fillStyle = 'rgba(226,239,236,0.25)';
      ctx.beginPath(); ctx.moveTo(x + 11, y - 38); ctx.lineTo(x + 29, y - 38); ctx.lineTo(x + 11, y + 9); ctx.fill();
      // Foxed patches and chips keep the glass uncanny without ornate trim.
      ctx.fillStyle = 'rgba(66,57,48,0.38)';
      ctx.beginPath(); ctx.arc(x + 43, y - 34, 3, 0, 7); ctx.arc(x + 14, y + 32, 4, 0, 7); ctx.arc(x + 39, y + 25, 2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(225,235,230,0.48)'; ctx.fillRect(x + 8, y - 42, 2, 84);
      break;
    case 'neon':
      // Austere single-colour buffet sign; the code-rendered lettering remains
      // crisp while keeping Cyrillic confined to the physical environment.
      ctx.fillStyle = '#281c25'; ctx.fillRect(x - 5, y - 27, 72, 44);
      ctx.strokeStyle = '#8b596f'; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 27, 72, 44);
      ctx.fillStyle = '#f064ae'; ctx.font = 'bold 19px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.textBaseline = 'middle'; ctx.shadowColor = '#f064ae'; ctx.shadowBlur = 12;
      ctx.fillText('БУФЕТ', x + 31, y - 5); ctx.shadowBlur = 0;
      ctx.fillStyle = '#7b4a61'; ctx.fillRect(x + 2, y + 22, 58, 3);
      break;
    case 'pipes':
      // Exposed service risers with proper elbow joints, clamps, a pressure
      // gauge and wheel valve. Oxidation keeps the teal silhouette distinctive.
      ctx.strokeStyle = '#338b7c'; ctx.lineWidth = 8; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 46); ctx.lineTo(x + 8, y + 10); ctx.lineTo(x + 40, y + 10); ctx.lineTo(x + 40, y + 46);
      ctx.moveTo(x + 27, y - 46); ctx.lineTo(x + 27, y - 13); ctx.lineTo(x + 58, y - 13);
      ctx.stroke();
      ctx.strokeStyle = '#8da19a'; ctx.lineWidth = 2;
      for (const clampY of [-28, 30]) { ctx.strokeRect(x + 2, y + clampY, 12, 6); }
      ctx.strokeRect(x + 21, y - 35, 12, 6);
      // Pressure gauge.
      ctx.fillStyle = '#d3ccb5'; ctx.beginPath(); ctx.arc(x + 53, y - 13, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4d4b44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 53, y - 13, 10, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 53, y - 13); ctx.lineTo(x + 58, y - 18); ctx.stroke();
      // Red wheel valve and spokes.
      ctx.strokeStyle = '#b64032'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 8, y + 10, 9, 0, 7); ctx.moveTo(x - 1, y + 10); ctx.lineTo(x + 17, y + 10);
      ctx.moveTo(x + 8, y + 1); ctx.lineTo(x + 8, y + 19); ctx.stroke();
      ctx.fillStyle = '#6d3a2e'; ctx.beginPath(); ctx.arc(x + 8, y + 10, 3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(133,194,171,0.42)'; ctx.fillRect(x + 36, y + 25, 8, 13);
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
      ctx.fillStyle = '#9aae72'; ctx.beginPath(); ctx.arc(x + 10, y + 25, 1.4, 0, 7); ctx.arc(x + 15, y + 25, 1.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#b9a17b'; ctx.beginPath(); ctx.ellipse(x - 4, y + 42, 11, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#554b3e'; ctx.beginPath(); ctx.ellipse(x - 4, y + 42, 7, 2, 0, 0, 7); ctx.fill();
      break;
    case 'aquarium':
      ctx.fillStyle = '#202524'; ctx.fillRect(x - 4, y - 39, 74, 8);
      ctx.fillStyle = '#234f58'; ctx.fillRect(x - 1, y - 28, 68, 58);
      ctx.fillStyle = 'rgba(132,194,198,0.20)'; ctx.fillRect(x + 3, y - 24, 60, 18);
      ctx.strokeStyle = '#303735'; ctx.lineWidth = 4; ctx.strokeRect(x - 1, y - 28, 68, 58);
      ctx.fillStyle = '#a9612d';
      ctx.beginPath(); ctx.ellipse(x + 26, y - 4, 6, 4, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 32, y - 4); ctx.lineTo(x + 38, y - 8); ctx.lineTo(x + 38, y); ctx.fill();
      ctx.fillStyle = '#353d3b';
      ctx.beginPath(); ctx.ellipse(x + 42, y + 10, 5, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4f7049'; ctx.fillRect(x + 14, y + 6, 3, 22); ctx.fillRect(x + 51, y + 2, 3, 26);
      ctx.strokeStyle = '#171b1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 61, y - 38); ctx.lineTo(x + 61, y + 19); ctx.stroke();
      ctx.fillStyle = 'rgba(186,220,218,0.52)';
      for (const [bx, by, br] of [[58, 14, 1.4], [60, 7, 1.2], [58, 0, 1]]) { ctx.beginPath(); ctx.arc(x + bx, y + by, br, 0, 7); ctx.fill(); }
      break;
  }
  ctx.restore();
}

function drawCar() {
  const cx = (SHAFT_LEFT + SHAFT_RIGHT) / 2;
  const cy = CENTER_Y;
  const w = CFG.carWidth, h = CFG.carHeight;
  const left = cx - w / 2, top = cy - h / 2;

  // The lift is the player's avatar: a broad warm halo and heavy silhouette
  // separate it from the shaft before any small HUD cue has to do that work.
  const halo = ctx.createRadialGradient(cx, cy, 18, cx, cy, 176);
  halo.addColorStop(0, 'rgba(255,205,125,0.18)');
  halo.addColorStop(0.45, 'rgba(255,190,100,0.07)');
  halo.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = halo; ctx.fillRect(SHAFT_LEFT, cy - 180, SHAFT_RIGHT - SHAFT_LEFT, 360);

  ctx.strokeStyle = '#66513a'; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, top);
  ctx.moveTo(cx, top + h); ctx.lineTo(cx, H); ctx.stroke();

  // Twin guide shoes make the cabin feel mechanically attached to the rails.
  ctx.fillStyle = '#17100b';
  ctx.fillRect(left - 8, top + 18, 8, h - 36); ctx.fillRect(left + w, top + 18, 8, h - 36);
  ctx.strokeStyle = '#766046'; ctx.lineWidth = 2;
  ctx.strokeRect(left - 7, top + 19, 7, h - 38); ctx.strokeRect(left + w, top + 19, 7, h - 38);

  ctx.fillStyle = 'rgba(0,0,0,0.48)'; ctx.fillRect(left - 4, top - 4, w + 8, h + 8);

  ctx.fillStyle = game.elev.jamFlash > 0 ? '#9a4a32' : '#6a5238';
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#42301e';
  ctx.fillRect(left + 4, top + 4, w - 8, h - 8);
  ctx.save();
  ctx.shadowColor = '#ffdd99'; ctx.shadowBlur = 20;
  ctx.fillStyle = '#fff0bd';
  ctx.fillRect(cx - 25, top + 7, 50, 5);
  ctx.restore();
  const grad = ctx.createLinearGradient(0, top, 0, top + h);
  grad.addColorStop(0, 'rgba(255,222,150,0.16)');
  grad.addColorStop(1, 'rgba(255,222,150,0)');
  ctx.fillStyle = grad; ctx.fillRect(left + 4, top + 4, w - 8, h - 8);

  // Corner plates and rivets sell the battered industrial frame at a glance.
  ctx.fillStyle = '#806a4a';
  for (const px of [left + 7, left + w - 13]) {
    ctx.fillRect(px, top + 7, 6, h - 14);
    ctx.fillStyle = '#c6a66c';
    for (const py of [top + 17, top + h / 2, top + h - 17]) {
      ctx.beginPath(); ctx.arc(px + 3, py, 1.5, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#806a4a';
  }

  const m = game.m;

  // riders stand inside the cutaway cabin (drawn first; the doors frost over
  // them when shut, which is exactly what makes their floor-tags hard to read).
  // Spacing is slot-based so a mover (2 slots) gets room for its luggage.
  const riders = game.passengers.filter(p => p.state === 'riding');
  const cap = capacityNow();
  const usedSlots = riders.reduce((s, p) => s + (p.size || 1), 0);
  const slots = Math.max(usedSlots, cap);
  const stepX = (w - 52) / Math.max(1, slots);
  // Add only as many lanes as the current tag width needs. A nine-slot cabin
  // gets three; ordinary cabins keep the quieter one- or two-lane layout.
  const compactPassengerUI = touchEnabled || (typeof canvasCssScale !== 'undefined' && canvasCssScale < 0.55);
  const tagLaneCount = Math.min(3, Math.max(1, Math.ceil((compactPassengerUI ? 40 : 32) / stepX)));
  const riderDraws = [];
  let slot = 0, riderIndex = 0;
  for (const p of riders) {
    const sz = p.size || 1;
    const px = left + 26 + (slot + sz / 2) * stepX;
    const lane = riderIndex % tagLaneCount;
    const enterT = passengerMoveProgress(p.boardAt);
    const eased = 1 - Math.pow(1 - enterT, 3);
    const doorwayX = left + w + 22;
    const drawX = doorwayX + (px - doorwayX) * eased;
    const envelope = p.kind === 'mover' ? 44 : p.kind === 'tipper' ? 34 : 30;
    const roomyScale = touchEnabled ? 1.08 : 1;
    const bodyScale = Math.min(roomyScale, Math.max(0.76, (stepX * sz - 2) / envelope));
    drawPassenger(p, drawX, top + h - 10, 'riding', 'body', lane, bodyScale);
    riderDraws.push({ p, x: drawX, lane, bodyScale });
    slot += sz;
    riderIndex++;
  }

  // CABIN FULL flag — so it's obvious why this floor keeps piling up
  const here = nearestFloorIdx(game.elev.y);
  const showCabinFull = usedSlots >= cap && game.passengers.some(s => s.state === 'waiting' && s.origin === here);
  if (showCabinFull) {
    ctx.fillStyle = `rgba(220,78,65,${0.68 + 0.26 * Math.sin(game.t * 6)})`;
    ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CABIN FULL', cx, top - (m.floorCounter > 0 ? 62 : 32));
  }

  // sliding doors — translucent "frosted glass" so the interior is always
  // visible (dimmed when shut), but the bright readout still punches through
  const d = game.elev.doors;
  const panelW = (w - 8) / 2;
  const opened = panelW * d;
  ctx.save();
  ctx.globalAlpha = 0.66;
  ctx.fillStyle = '#6b573c';
  ctx.fillRect(left + 4, top + 14, panelW - opened, h - 22);
  ctx.fillRect(left + 4 + panelW + opened, top + 14, panelW - opened, h - 22);
  ctx.fillStyle = 'rgba(255,225,165,0.12)';
  ctx.fillRect(left + 7, top + 17, Math.max(0, panelW - opened - 6), 3);
  ctx.fillRect(left + 7 + panelW + opened, top + 17, Math.max(0, panelW - opened - 6), 3);
  ctx.restore();
  ctx.strokeStyle = '#d0b477'; ctx.lineWidth = 1.5;
  ctx.strokeRect(left + 4.5, top + 14.5, panelW - opened - 1, h - 23);
  ctx.strokeRect(left + 4.5 + panelW + opened, top + 14.5, panelW - opened - 1, h - 23);

  // Destination tags and patience are game UI, not cabin paint. Redraw only
  // that layer above the frosted doors, staggering dense upgraded cabins.
  for (const rd of riderDraws) drawPassenger(rd.p, rd.x, top + h - 10, 'riding', 'ui', rd.lane, rd.bodyScale);

  // Floor Counter lives on the roof fascia. Keeping it out of the cabin leaves
  // both staggered rider-tag lanes unobstructed at high capacities.
  if (m.floorCounter > 0) {
    const show = m.floorCounter >= 2 || Math.abs(game.elev.v) < 60;
    const readoutY = top - 31;
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(cx - 22, readoutY, 44, 22);
    ctx.strokeStyle = '#9b8050'; ctx.lineWidth = 1; ctx.strokeRect(cx - 21.5, readoutY + 0.5, 43, 21);
    ctx.font = 'bold 16px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (show) {
      ctx.fillStyle = '#ff8030';
      ctx.fillText(game.floors[nearestFloorIdx(game.elev.y)].label, cx, readoutY + 11);
    } else {
      ctx.fillStyle = '#6f5637'; ctx.fillText('--', cx, readoutY + 11);
    }
  }

  const stopped = isStopped();
  const aligned = isAligned();
  const ok = aligned && stopped;
  const regularDock = nearestFloorIdx(game.elev.y) * CFG.floorHeight;
  let dockDist = Math.abs(game.elev.y - regularDock);
  if (game.spider && game.spider.open) dockDist = Math.min(dockDist, Math.abs(game.elev.y - SPIDER_Y));
  const nearDock = Math.max(0, 1 - dockDist / 70);
  const dockColor = ok ? '#9be276' : (aligned ? '#f0b64f' : '#987b4a');

  // A large docking bracket replaces the old four-pixel readiness dot as the
  // primary alignment cue. Amber means level but still moving; green means the
  // doors are safe to open.
  if (nearDock > 0.02) {
    ctx.save(); ctx.globalAlpha = 0.22 + nearDock * 0.78;
    ctx.strokeStyle = dockColor; ctx.lineWidth = ok ? 3 : 2;
    if (ok) { ctx.shadowColor = dockColor; ctx.shadowBlur = 12; }
    for (const side of [-1, 1]) {
      const bx = side < 0 ? left - 16 : left + w + 16;
      ctx.beginPath();
      ctx.moveTo(bx, cy - 18); ctx.lineTo(bx, cy + 18);
      ctx.lineTo(bx - side * 12, cy + 18);
      ctx.moveTo(bx, cy - 18); ctx.lineTo(bx - side * 12, cy - 18); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = dockColor;
  ctx.beginPath(); ctx.arc(left + w - 14, top + 13, 5, 0, 7); ctx.fill();
  if (ok) {
    ctx.fillStyle = '#b9ef98'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL', cx, top + h + 13);
  }

  if (ok) { ctx.save(); ctx.shadowColor = dockColor; ctx.shadowBlur = 14; ctx.strokeStyle = dockColor; }
  else ctx.strokeStyle = game.elev.jamFlash > 0 ? '#e36a56' : '#c8aa6c';
  ctx.lineWidth = ok ? 3 : 2;
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  if (ok) ctx.restore();

  // Guidance Arrows: point toward the nearest floor a rider wants
  if (m.arrows) {
    let best = null, bestD = Infinity;
    for (const p of game.passengers) if (p.state === 'riding') {
      const d = p.dest * CFG.floorHeight - game.elev.y;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = d; }
    }
    if (best !== null && bestD > 6) {
      const up = best > 0;
      const upClearance = m.floorCounter > 0 ? (showCabinFull ? 82 : 48) : (showCabinFull ? 50 : 14);
      const ay = up ? top - upClearance : top + h + 34;
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 6);
      ctx.fillStyle = `rgba(106,184,255,${0.5 + 0.5 * pulse})`;
      ctx.beginPath();
      if (up) { ctx.moveTo(cx - 11, ay + 7); ctx.lineTo(cx + 11, ay + 7); ctx.lineTo(cx, ay - 7); }
      else    { ctx.moveTo(cx - 11, ay - 7); ctx.lineTo(cx + 11, ay - 7); ctx.lineTo(cx, ay + 7); }
      ctx.closePath(); ctx.fill();
    }
  }
}

const PASSENGER_SKINS = ['#d4a878', '#a87850', '#7a5838', '#5a3820'];
const PASSENGER_COATS = ['#426f94', '#9b485c', '#3f7850', '#9b6938', '#765294'];
const PASSENGER_COAT_DARK = ['#29475f', '#63303d', '#294f35', '#634526', '#4e3763'];
const PASSENGER_ROLE_COATS = { vip: '#b8952e', tipper: '#467b55', mover: '#8b6037', nervous: '#58759a' };
const PASSENGER_ROLE_DARK = { vip: '#70591d', tipper: '#294b34', mover: '#543a24', nervous: '#35475f' };

function passengerMoveProgress(startAt) {
  if (!Number.isFinite(startAt)) return 1;
  return Math.max(0, Math.min(1, (game.t - startAt) / CFG.passengerMoveTime));
}

function drawPassenger(p, x, footY, mode, layer = 'all', tagLane = 0, bodyScale = 1, bodyOpacity = 1) {
  // Body urgency is animated, but destination tags stay anchored. The tag is
  // the memory game's interface and should never wobble out of alignment.
  const uiX = x, uiFootY = footY;
  const pfrac = p.patienceMax > 0 ? p.patience / p.patienceMax : 1;
  const phase = (p.id || 0) * 1.73;
  const reduceMotion = typeof prefersReducedMotion !== 'undefined' && prefersReducedMotion;
  if (!reduceMotion && pfrac < 0.28) x += Math.sin(game.t * 22 + phase) * (0.28 - pfrac) * 13;
  if (!reduceMotion && p.kind === 'nervous') x += Math.sin(game.t * 13 + phase) * 0.9;

  const moveStart = mode === 'departing'
    ? (p.removeAt || game.t) - CFG.passengerMoveTime : p.boardAt;
  const moving = !reduceMotion && (mode === 'departing' || (mode === 'riding' && passengerMoveProgress(p.boardAt) < 1));
  const strideStart = Number.isFinite(moveStart) ? moveStart : game.t;
  const stride = moving ? Math.sin((game.t - strideStart) * 29 + phase) : 0;
  const bob = reduceMotion ? 0 : moving ? -Math.abs(stride) * 2.2 : Math.sin(p.bob || 0) * 1.15;
  const fy = footY + bob;
  const skin = PASSENGER_SKINS[p.skin] || PASSENGER_SKINS[0];
  const normalCoat = PASSENGER_COATS[p.coat] || PASSENGER_COATS[0];
  const normalDark = PASSENGER_COAT_DARK[p.coat] || PASSENGER_COAT_DARK[0];
  const coat = PASSENGER_ROLE_COATS[p.kind] || normalCoat;
  const coatDark = PASSENGER_ROLE_DARK[p.kind] || normalDark;
  const look = Math.abs(((p.id || 0) * 3 + (p.coat || 0) + (p.skin || 0) * 2)) % 4;
  const bodyW = p.kind === 'mover' ? 21 : p.vip ? 21 : p.kind === 'nervous' ? 15 : 19;
  const headY = fy - 41 + (p.kind === 'nervous' ? 2 : p.kind === 'mover' ? 1 : 0);

  if (layer !== 'ui') {
    ctx.save();
    ctx.globalAlpha = bodyOpacity;
    ctx.translate(x, fy); ctx.scale(bodyScale, bodyScale); ctx.translate(-x, -fy);

    // Feet and a two-frame stride. All motion stays inside the sprite envelope;
    // crowded cabins therefore remain readable instead of horizontally shaking.
    const stridePx = stride * 2.1;
    ctx.fillStyle = 'rgba(5,4,3,0.34)';
    ctx.beginPath(); ctx.ellipse(x, fy + 1, p.kind === 'mover' ? 15 : 10, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#100d0b';
    ctx.fillRect(x - 7 + stridePx, fy - 15, 6, 13);
    ctx.fillRect(x + 1 - stridePx, fy - 15, 6, 13);
    ctx.fillRect(x - 8 + stridePx, fy - 4, 8, 4);
    ctx.fillRect(x + 1 - stridePx, fy - 4, 8, 4);

    const shoulder = bodyW / 2 + 1.5;
    const hem = bodyW / 2 + (p.vip ? 2.5 : look === 1 ? 2 : look === 3 ? 1 : 0);
    const coatBottom = p.vip ? fy - 8 : look === 1 ? fy - 10 : fy - 13;
    const coatTop = fy - 35;

    // Sleeves establish the role pose before color: raised coin, clasped hands,
    // luggage grip, or the ordinary weary arms-at-sides stance.
    const armPath = () => { ctx.beginPath(); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const strokeArms = color => {
      ctx.strokeStyle = color;
      if (p.kind === 'tipper') {
        armPath(); ctx.moveTo(x - shoulder + 1, fy - 30); ctx.lineTo(x - shoulder - 1, fy - 17);
        ctx.moveTo(x + shoulder - 1, fy - 30); ctx.lineTo(x + 7, fy - 43); ctx.stroke();
      } else if (p.kind === 'nervous') {
        armPath(); ctx.moveTo(x - shoulder + 1, fy - 29); ctx.lineTo(x - 4, fy - 23);
        ctx.moveTo(x + shoulder - 1, fy - 29); ctx.lineTo(x + 4, fy - 23); ctx.stroke();
      } else if (p.kind === 'mover') {
        armPath(); ctx.moveTo(x - shoulder + 1, fy - 29); ctx.lineTo(x + 10, fy - 22);
        ctx.moveTo(x + shoulder - 1, fy - 29); ctx.lineTo(x + 14, fy - 22); ctx.stroke();
      } else {
        armPath(); ctx.moveTo(x - shoulder + 1, fy - 30); ctx.lineTo(x - shoulder - 1, fy - 16);
        ctx.moveTo(x + shoulder - 1, fy - 30); ctx.lineTo(x + shoulder + 1, fy - 16); ctx.stroke();
      }
    };
    ctx.lineWidth = 7; strokeArms('#0b0806');
    ctx.lineWidth = 3.5; strokeArms(coat);

    // A flared overcoat silhouette replaces the old rectangle, then a darker
    // side panel and seam suggest worn fabric without becoming pixel noise.
    ctx.fillStyle = '#0b0806';
    ctx.beginPath();
    ctx.moveTo(x - shoulder - 1.5, coatTop - 1); ctx.lineTo(x + shoulder + 1.5, coatTop - 1);
    ctx.lineTo(x + hem + 1.5, coatBottom + 1); ctx.lineTo(x - hem - 1.5, coatBottom + 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(x - shoulder, coatTop + 1); ctx.lineTo(x + shoulder, coatTop + 1);
    ctx.lineTo(x + hem, coatBottom - 1); ctx.lineTo(x - hem, coatBottom - 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = coatDark; ctx.globalAlpha = bodyOpacity * 0.72;
    ctx.beginPath(); ctx.moveTo(x - shoulder, coatTop + 2); ctx.lineTo(x - 2, coatTop + 2);
    ctx.lineTo(x - 3, coatBottom - 1); ctx.lineTo(x - hem, coatBottom - 1); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = bodyOpacity;

    // Collars, seams and practical bags create four ordinary civilian looks.
    ctx.strokeStyle = '#d7bd84'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 5, coatTop + 2); ctx.lineTo(x, coatTop + 9); ctx.lineTo(x + 5, coatTop + 2); ctx.stroke();
    ctx.fillStyle = coatDark;
    if (p.vip) {
      ctx.fillRect(x - 5, fy - 24, 2, 2); ctx.fillRect(x + 3, fy - 24, 2, 2);
      ctx.fillRect(x - 5, fy - 17, 2, 2); ctx.fillRect(x + 3, fy - 17, 2, 2);
    } else {
      ctx.fillRect(x - 1, fy - 25, 2, 2); ctx.fillRect(x - 1, fy - 19, 2, 2);
    }
    if (!PASSENGER_ROLE_COATS[p.kind]) {
      if (look === 0) { // wool scarf
        ctx.fillStyle = '#c4ab72'; ctx.fillRect(x - 4, coatTop + 1, 8, 3); ctx.fillRect(x + 1, coatTop + 4, 3, 9);
      } else if (look === 2) { // shoulder satchel
        ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, coatTop + 2); ctx.lineTo(x + 7, fy - 15); ctx.stroke();
        ctx.fillStyle = '#38281c'; ctx.fillRect(x + 6, fy - 20, 7, 9); ctx.strokeStyle = '#8e6c42'; ctx.lineWidth = 1; ctx.strokeRect(x + 6.5, fy - 19.5, 6, 8);
      } else if (look === 3) { // small shopping bag, distinct from mover luggage
        ctx.strokeStyle = '#8d734b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 11, fy - 17, 4, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = '#665234'; ctx.fillRect(x + 7, fy - 17, 8, 10);
      }
    }

    // The mover's battered case occupies two slots and the whole pose leans
    // toward its handle; the nervous rider's hands form a fixed hunched shape.
    if (p.kind === 'mover') {
      ctx.fillStyle = '#17100b'; ctx.fillRect(x + 8, fy - 26, 22, 26);
      ctx.fillStyle = '#5d4027'; ctx.fillRect(x + 10, fy - 24, 18, 22);
      ctx.strokeStyle = '#a47842'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 10.5, fy - 23.5, 17, 21);
      ctx.strokeStyle = '#21170f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 18, fy - 24, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#c49a57'; ctx.fillRect(x + 17, fy - 14, 3, 3);
    } else if (p.kind === 'nervous') {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(x - 2.5, fy - 23, 2.4, 0, 7); ctx.arc(x + 2.5, fy - 23, 2.4, 0, 7); ctx.fill();
    }

    // Head and warm rim keep every skin tone readable against the keyline.
    ctx.fillStyle = '#100c09'; ctx.beginPath(); ctx.arc(x, headY, 9, 0, 7); ctx.fill();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, headY, 7.3, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,222,170,0.58)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - 0.8, headY - 0.8, 6.1, 0.78 * Math.PI, 1.55 * Math.PI); ctx.stroke();

    // Hair/face stay sparse; posture and accessories do the real recognition.
    ctx.fillStyle = '#24180f';
    ctx.beginPath(); ctx.arc(x, headY - 2.5, 6.7, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.skin === 3 ? '#ead0a0' : '#1a1209';
    ctx.beginPath(); ctx.arc(x - 2.5, headY - 0.2, 1, 0, 7); ctx.arc(x + 2.5, headY - 0.2, 1, 0, 7); ctx.fill();
    ctx.strokeStyle = p.skin === 3 ? '#ead0a0' : '#1a1209'; ctx.lineWidth = 1; ctx.beginPath();
    if (pfrac > 0.55) ctx.arc(x, headY + 3.2, 2.3, 0.15 * Math.PI, 0.85 * Math.PI);
    else if (pfrac > 0.28) { ctx.moveTo(x - 2.3, headY + 3); ctx.lineTo(x + 2.3, headY + 3); }
    else ctx.arc(x, headY + 5.2, 2.3, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();

    if (p.kind === 'nervous') {
      // Large static droplet + hunched hands: readable without blue or jitter.
      ctx.fillStyle = '#b9e6ed';
      ctx.beginPath(); ctx.moveTo(x + 8, headY - 5); ctx.quadraticCurveTo(x + 14, headY + 1, x + 8, headY + 4);
      ctx.quadraticCurveTo(x + 2, headY + 1, x + 8, headY - 5); ctx.fill();
    } else if (p.kind === 'tipper') {
      // A raised hand and solid coin/purse diamond survive monochrome rendering.
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x + 7, fy - 44, 2.5, 0, 7); ctx.fill();
      ctx.save(); ctx.shadowColor = '#ffd44a'; ctx.shadowBlur = 7; ctx.fillStyle = '#ffd44a';
      ctx.beginPath(); ctx.moveTo(x + 7, fy - 54); ctx.lineTo(x + 12, fy - 49); ctx.lineTo(x + 7, fy - 44); ctx.lineTo(x + 2, fy - 49); ctx.closePath(); ctx.fill(); ctx.restore();
    }

    if (p.vip) {
      ctx.fillStyle = '#ffd44a';
      ctx.beginPath();
      ctx.moveTo(x - 8, headY - 5); ctx.lineTo(x - 8, headY - 11); ctx.lineTo(x - 4, headY - 8);
      ctx.lineTo(x, headY - 13); ctx.lineTo(x + 4, headY - 8); ctx.lineTo(x + 8, headY - 11);
      ctx.lineTo(x + 8, headY - 5); ctx.closePath(); ctx.fill();
    } else if (p.hat >= 0 && p.kind !== 'mover' && p.kind !== 'tipper' && p.kind !== 'nervous') {
      const hatColor = ['#24201c', '#8a5548', '#a99462'][p.hat] || '#24201c';
      ctx.fillStyle = hatColor;
      if (p.hat === 0) { // soft worker cap
        ctx.beginPath(); ctx.ellipse(x - 1, headY - 7, 8, 4, -0.15, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 8, headY - 7, 16, 3);
      } else if (p.hat === 1) { // tied headscarf
        ctx.beginPath(); ctx.arc(x, headY - 1, 8.2, Math.PI, Math.PI * 2); ctx.lineTo(x + 7, headY + 4); ctx.lineTo(x - 7, headY + 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 6, headY + 3); ctx.lineTo(x + 11, headY + 8); ctx.lineTo(x + 6, headY + 7); ctx.fill();
      } else { // rounded winter hat
        ctx.beginPath(); ctx.arc(x, headY - 4, 7, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - 8, headY - 5, 16, 4);
      }
    }
    ctx.restore();
  }

  if (layer === 'body') return;

  const m = game.m;
  const destLabel = (game.floors[p.dest] || { label: '?' }).label;
  let txt;
  if (mode === 'waiting') txt = p.origin > 0 ? '↓' + destLabel : destLabel;
  else {
    const remembered = m.dispatch || game.power.xray > 0 || p.reveal > 0;
    txt = remembered ? destLabel : '?';
  }
  const fading = mode === 'riding' && !m.dispatch && game.power.xray <= 0 && p.reveal > 0 && p.reveal < 1;
  const compact = touchEnabled || (typeof canvasCssScale !== 'undefined' && canvasCssScale < 0.55);
  const tw2 = compact ? 20 : 16, th = compact ? 20 : 17;
  const ty = (compact ? uiFootY - 76 : uiFootY - 73) - tagLane * (compact ? 23 : 20);
  ctx.globalAlpha = fading ? Math.max(0.35, p.reveal) : 1;
  ctx.fillStyle = 'rgba(12,9,7,0.94)';
  ctx.fillRect(uiX - tw2, ty, tw2 * 2, th);
  ctx.strokeStyle = txt === '?' ? '#a88953' : '#e2c675';
  ctx.lineWidth = 1.5; ctx.strokeRect(uiX - tw2 + 0.5, ty + 0.5, tw2 * 2 - 1, th - 1);
  ctx.fillStyle = txt === '?' ? '#b69a62' : '#ffe08a';
  ctx.font = compact ? 'bold 16px ui-monospace' : 'bold 12px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, uiX, ty + th / 2);
  ctx.globalAlpha = 1;

  const pct = Math.max(0, p.patience / p.patienceMax);
  if (mode === 'waiting' || mode === 'riding') {
    const bh = compact ? 6 : 5;
    ctx.fillStyle = '#2a201a'; ctx.fillRect(uiX - tw2, ty - bh - 3, tw2 * 2, bh);
    ctx.fillStyle = pct > 0.5 ? '#7aaa55' : pct > 0.25 ? '#d4a050' : '#e05b4f';
    ctx.fillRect(uiX - tw2, ty - bh - 3, tw2 * 2 * pct, bh);
  }

  // The boarding shout is deliberately much larger on compact screens; it is
  // the one piece of text the player must catch before the tag becomes "?".
  if (mode === 'riding' && p.shoutT > 0 && !(p.shoutDelay > 0)) {
    const a = Math.min(1, p.shoutT / 0.35);
    const pop = 1 + Math.max(0, (p.shoutT - 0.74) * 3.2);
    const big = compact ? 2.15 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(uiX, uiFootY - (compact ? 104 : 88));
    ctx.scale(pop * big, pop * big);
    const shout = `${destLabel}!`;
    ctx.font = 'bold 14px ui-monospace';
    const bw = ctx.measureText(shout).width + 16;
    ctx.fillStyle = '#f2e8cf'; ctx.fillRect(-bw / 2, -11, bw, 22);
    ctx.beginPath(); ctx.moveTo(-5, 11); ctx.lineTo(5, 11); ctx.lineTo(-1, 19); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1.5; ctx.strokeRect(-bw / 2, -11, bw, 22);
    ctx.fillStyle = '#1a1410'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(shout, 0, 1);
    ctx.restore();
  }
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(11,8,6,0.93)';
  ctx.fillRect(0, 0, W, 36);
  ctx.fillStyle = 'rgba(224,194,125,0.20)'; ctx.fillRect(0, 35, W, 1);
  ctx.font = 'bold 14px ui-monospace'; ctx.textBaseline = 'middle';

  ctx.textAlign = 'left'; ctx.fillStyle = '#e1c77f';
  ctx.fillText(`SHIFT ${run.shiftNum}`, 16, 18);
  ctx.fillStyle = '#f0c752'; ctx.fillText(`LV ${run.level + 1}`, 100, 18);
  let hudX = 158;
  if (run.heat > 0) { ctx.fillStyle = '#ff7a3a'; ctx.fillText(`H${run.heat}`, hudX, 18); hudX += 42; }
  ctx.fillStyle = '#e1c77f'; ctx.fillText(`◆ ${run.parts}`, hudX, 18);
  if (run.fuses > 0) { ctx.fillStyle = '#d4a050'; ctx.fillText(`FUSE ${run.fuses}`, hudX + 68, 18); }

  // quota progress
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1dfad';
  ctx.fillText(`DELIVERED ${game.delivered} / ${game.quota}`, W / 2, 18);
  const quotaW = 172, quotaX = W / 2 - quotaW / 2;
  ctx.fillStyle = '#302314'; ctx.fillRect(quotaX, 30, quotaW, 2);
  ctx.fillStyle = '#d5ae45'; ctx.fillRect(quotaX, 30, quotaW * Math.min(1, game.delivered / game.quota), 2);

  ctx.textAlign = 'right';
  const remaining = maxStrikes() - game.strikes;
  const dots = '●'.repeat(Math.max(0, remaining)) + '○'.repeat(game.strikes);
  ctx.fillStyle = remaining <= 1 ? '#ef6657' : '#e1c77f';
  ctx.fillText(dots, W - 16, 18);

  // XP strip — the level-up heartbeat, right under the top bar
  ctx.fillStyle = '#241a10'; ctx.fillRect(0, 36, W, 4);
  ctx.fillStyle = '#caa33a'; ctx.fillRect(0, 36, W * Math.min(1, run.xp / run.xpNext), 4);

  // crank gauge
  ctx.fillStyle = 'rgba(11,8,6,0.93)'; ctx.fillRect(0, H - 32, 224, 32);
  const effectiveMax = game.m.maxSpeed * (game.power.express > 0 ? 1.55 : 1);
  const v = Math.max(-1, Math.min(1, game.elev.v / effectiveMax)), half = 66;
  const safeStopped = isStopped();
  const motion = safeStopped ? '■ STOPPED' : v > 0 ? '▲ UP' : '▼ DOWN';
  ctx.fillStyle = safeStopped ? '#9be276' : '#e1c77f'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'left';
  ctx.fillText(motion, 12, H - 16);
  ctx.fillStyle = '#17110b'; ctx.fillRect(74, H - 24, 134, 17);
  const stopFrac = Math.min(1, stopSpeedNow() / effectiveMax);
  ctx.fillStyle = 'rgba(123,178,91,0.28)'; ctx.fillRect(75 + half - half * stopFrac, H - 22, half * stopFrac * 2, 13);
  ctx.strokeStyle = '#d0b477'; ctx.lineWidth = 1; ctx.strokeRect(74.5, H - 23.5, 133, 16);
  ctx.fillStyle = v >= 0 ? '#81c85e' : '#e0a94b';
  if (v >= 0) ctx.fillRect(75 + half, H - 21, half * v, 12);
  else        ctx.fillRect(75 + half + half * v, H - 21, -half * v, 12);
  ctx.strokeStyle = '#f4dda1'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(75 + half + half * v, H - 24); ctx.lineTo(75 + half + half * v, H - 7); ctx.stroke();
  ctx.strokeStyle = '#8f7b56'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(75 + half, H - 23); ctx.lineTo(75 + half, H - 7); ctx.stroke();

  // door status
  ctx.fillStyle = 'rgba(11,8,6,0.93)'; ctx.fillRect(W - 224, H - 32, 224, 32);
  ctx.textAlign = 'right';
  let t, c = '#d8c38b';
  if (game.elev.jamFlash > 0) { t = Math.abs(game.elev.v) > stopSpeedNow() ? 'TOO FAST' : 'NOT LEVEL'; c = '#ef6657'; }
  else if (doorsOpen()) { t = 'DOORS OPEN'; c = '#9be276'; }
  else if (game.elev.doors > 0) { t = game.elev.doorTarget > 0 ? 'OPENING…' : 'CLOSING…'; c = '#f0bd57'; }
  else t = 'DOORS SHUT';
  const cap = capacityNow();
  const full = slotsAboard() >= cap;
  ctx.fillStyle = c; ctx.fillText(t, W - 14, H - 15);
  ctx.fillStyle = full ? '#ef6657' : '#9be276';
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

  // hold-R abandon progress — visible commitment, not a surprise
  if (game.abandonT > 0.06) {
    const k = Math.min(1, game.abandonT / 1.0);
    ctx.fillStyle = 'rgba(13,10,8,0.85)'; ctx.fillRect(W / 2 - 130, 86, 260, 40);
    ctx.strokeStyle = '#aa3a32'; ctx.lineWidth = 1.5; ctx.strokeRect(W / 2 - 130, 86, 260, 40);
    ctx.fillStyle = '#aa3a32'; ctx.font = 'bold 12px ui-monospace'; ctx.textAlign = 'center';
    ctx.fillText('ABANDONING RUN — HOLD R', W / 2, 99);
    ctx.fillStyle = '#3a2018'; ctx.fillRect(W / 2 - 118, 108, 236, 10);
    ctx.fillStyle = '#e0584a'; ctx.fillRect(W / 2 - 118, 108, 236 * k, 10);
  }

  // tucked between the crank and door bars — but drawHUD also serves LEVELUP /
  // SHIFT_DONE / FIRED, where the pause modal can't render; an invisible chip
  // there ate a tap and froze keyboard input until P was pressed twice
  if (game.state === 'PLAYING') drawPauseChip(232, H - 28, 'up');

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
  ctx.font = touchEnabled ? 'bold 26px ui-monospace' : 'bold 20px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(game.banner.text, W / 2, 70);
  ctx.restore();
}

// ── title ──
function drawTitleArt() {
  const t = performance.now() / 1000;
  // warm glow behind the wordmark
  const g = ctx.createRadialGradient(W / 2, 120, 20, W / 2, 120, 380);
  g.addColorStop(0, 'rgba(150,110,50,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 320);

  const cx = W / 2;
  const sway = Math.sin(t * 1.1);

  const sy = 40;                 // spider body
  let threadColor = 'rgba(220,210,230,0.55)';
  if (!save.beatBoss) {
    // ── a giant spider gripping the top, dangling the lift on a silk thread ──
    // a soft glow so the dark silhouette separates from the near-black backdrop
    const halo = ctx.createRadialGradient(cx, sy, 8, cx, sy, 96);
    halo.addColorStop(0, 'rgba(120,40,70,0.34)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(cx - 110, sy - 96, 220, 200);
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass === 0 ? '#0b0610' : '#6a566e';
      ctx.lineWidth = pass === 0 ? 6 : 2.6;
      for (let i = -1; i <= 1; i += 2) {
        for (let l = 0; l < 4; l++) {
          const knee = { x: cx + i * (16 + l * 7), y: sy - 12 - l * 3 };
          const foot = { x: cx + i * (30 + l * 18), y: 9 + l * 2 + Math.sin(t * 2 + l) * 1.5 };
          ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
        }
      }
    }
    ctx.fillStyle = '#2a1a2e';
    ctx.beginPath(); ctx.ellipse(cx, sy + 6, 19, 23, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, sy - 12, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = '#6a4a72'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, sy + 6, 19, 23, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(180,140,200,0.18)';
    ctx.beginPath(); ctx.ellipse(cx - 5, sy - 2, 7, 9, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#b21838';
    ctx.beginPath(); ctx.moveTo(cx - 6, sy - 2); ctx.lineTo(cx + 6, sy - 2);
    ctx.lineTo(cx - 6, sy + 14); ctx.lineTo(cx + 6, sy + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,60,90,0.3)'; ctx.beginPath(); ctx.arc(cx, sy - 12, 18, 0, 7); ctx.fill();
    ctx.save(); ctx.shadowColor = '#ff3a5a'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#ff5a74';
    for (const [dx, dy] of [[-5, -14], [5, -14], [-2, -10], [2, -10]]) { ctx.beginPath(); ctx.arc(cx + dx, sy + dy, 2.2, 0, 7); ctx.fill(); }
    ctx.restore();
  } else {
    // ── you cut the cord: a steel ceiling mount, an honest cable, no spider ──
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(cx - 30, 16, 60, 12);
    ctx.fillStyle = '#5a5a66'; ctx.fillRect(cx - 30, 16, 60, 3);
    ctx.fillStyle = '#2a2a32'; ctx.beginPath(); ctx.arc(cx, 30, 6, 0, 7); ctx.fill();
    threadColor = '#8a8a96';   // a steel cable now
  }

  // thread/cable down to the bobbing elevator
  const ey = 108 + sway * (save.beatBoss ? 2 : 4), ex = cx + sway * (save.beatBoss ? 2 : 6);
  ctx.strokeStyle = threadColor; ctx.lineWidth = save.beatBoss ? 2.4 : 1.4;
  ctx.beginPath(); ctx.moveTo(cx, save.beatBoss ? 28 : sy + 26); ctx.lineTo(ex, ey - 16); ctx.stroke();

  // the dangling elevator car (two riders aboard, ceiling light)
  const cw = 46, ch = 32;
  ctx.fillStyle = '#5a4530'; ctx.fillRect(ex - cw / 2, ey - ch / 2, cw, ch);
  ctx.fillStyle = '#3a2a1c'; ctx.fillRect(ex - cw / 2 + 3, ey - ch / 2 + 3, cw - 6, ch - 6);
  ctx.fillStyle = '#ffdd99'; ctx.fillRect(ex - 7, ey - ch / 2 + 3, 14, 3);
  ctx.fillStyle = '#3a5a78'; ctx.fillRect(ex - 11, ey - 1, 6, 8);
  ctx.fillStyle = '#5a3a4a'; ctx.fillRect(ex + 5, ey - 1, 6, 8);
  ctx.fillStyle = '#d4a878'; ctx.beginPath(); ctx.arc(ex - 8, ey - 4, 3, 0, 7); ctx.arc(ex + 8, ey - 4, 3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1;
  ctx.strokeRect(ex - cw / 2 + 0.5, ey - ch / 2 + 0.5, cw - 1, ch - 1);
  ctx.beginPath(); ctx.moveTo(ex, ey - ch / 2 + 3); ctx.lineTo(ex, ey + ch / 2 - 3); ctx.stroke();
}

// A quiet, mechanical backdrop shared by the career menus. The paired rails
// and stamped seams give the screens depth without competing with the cards.
function drawMenuBackdrop(top, bottom, accent) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, top); bg.addColorStop(1, bottom);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = accent; ctx.lineWidth = 1;
  for (const x of [30, W - 30]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + (x < W / 2 ? 7 : -7), 0);
    ctx.lineTo(x + (x < W / 2 ? 7 : -7), H); ctx.stroke();
  }
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = accent;
  for (let y = 26; y < H; y += 74) {
    for (const x of [30, W - 30]) {
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 0.06;
  for (let y = 116; y < H; y += 92) {
    ctx.fillRect(54, y, W - 108, 1);
  }
  ctx.restore();
}

function drawMenuHeading(title, subtitle, y, color) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.font = 'bold 34px ui-monospace';
  ctx.fillText(title, W / 2, y);

  ctx.save();
  ctx.globalAlpha = 0.55; ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(74, y); ctx.lineTo(244, y);
  ctx.moveTo(W - 244, y); ctx.lineTo(W - 74, y); ctx.stroke();
  ctx.fillStyle = color;
  for (const x of [64, 252, W - 252, W - 64]) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-2, -2, 4, 4); ctx.restore();
  }
  ctx.restore();

  if (subtitle) {
    ctx.fillStyle = '#b6aa90'; ctx.font = '13px ui-monospace';
    ctx.fillText(subtitle, W / 2, y + 29);
  }
}

function drawTitle() {
  drawTitleArt();
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px ui-monospace, Menlo, monospace';
  ctx.fillText(cyr('THE SPIDER FLOOR'), W / 2, 162);
  ctx.save();
  ctx.globalAlpha = 0.42; ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(54, 162); ctx.lineTo(194, 162);
  ctx.moveTo(W - 194, 162); ctx.lineTo(W - 54, 162); ctx.stroke();
  ctx.restore();
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#aa9874';
  ctx.fillText("operating the people's worst elevator", W / 2, 194);

  const titleRule = (label, y) => {
    ctx.fillStyle = '#d4a050'; ctx.font = 'bold 11px ui-monospace';
    ctx.fillText(label, W / 2, y);
    ctx.fillStyle = 'rgba(191,164,95,0.25)';
    ctx.fillRect(W / 2 - 248, y + 13, 496, 1);
  };
  titleRule('CONTROL DESK', 234);
  const controls = [
    [touchEnabled ? '▲ / ▼' : '↑ / ↓', 'CRANK THE CAR UP AND DOWN'],
    [touchEnabled ? 'DOORS' : 'SPACE', 'OPEN / CLOSE WHEN STOPPED'],
  ];
  controls.forEach((row, i) => {
    const y = 264 + i * 27;
    ctx.fillStyle = '#f0d79a'; ctx.font = 'bold 14px ui-monospace'; ctx.textAlign = 'right';
    ctx.fillText(row[0], W / 2 - 116, y);
    ctx.fillStyle = '#c5b89c'; ctx.font = '13px ui-monospace'; ctx.textAlign = 'left';
    ctx.fillText(row[1], W / 2 - 92, y);
  });

  ctx.textAlign = 'center';
  titleRule('SHIFT BRIEFING', 330);
  ctx.fillStyle = '#cfc2a5'; ctx.font = '14px ui-monospace';
  const briefing = [
    'Scoop riders from the LOBBY. They shout a floor — remember it.',
    'Once aboard, the destination fades to "?".',
    'Doors open only when STOPPED and ALIGNED.',
    'Meet quota before three walk-offs, or the bureau fires you.',
  ];
  briefing.forEach((line, i) => ctx.fillText(line, W / 2, 361 + i * 23));

  titleRule('THE LONG GAME', 465);
  ctx.fillStyle = '#aebfa2'; ctx.font = '13px ui-monospace';
  ctx.fillText('Survive shifts, earn ◆ parts, and rebuild the lift', W / 2, 493);
  ctx.fillText('until the machine starts doing the hard part for you.', W / 2, 514);

  if (save.best.shifts > 0 || save.best.delivered > 0) {
    ctx.fillStyle = '#9f8f70'; ctx.font = '13px ui-monospace';
    ctx.fillText(`best run:  ${save.best.shifts} shifts survived  ·  ${save.best.delivered} deliveries`, W / 2, H - 168);
  }

  drawButton('CLOCK IN  ▸', W / 2 - 290, H - 128, 200, 46,
             () => { openOperatorSelect(); }, true);
  drawButton(`WORKSHOP ★${save.stars}`, W / 2 - 78, H - 128, 184, 46,
             () => { menu = 'WORKSHOP'; }, false);
  const got = ACHIEVEMENTS.filter(a => save.ach[a.key]).length;
  drawButton(`ACHIEVEMENTS ${got}/${ACHIEVEMENTS.length}`, W / 2 + 118, H - 128, 184, 46,
             () => { menu = 'ACH'; }, false);
  drawButton('⚙', W / 2 + 310, H - 128, 46, 46, () => { menu = 'SETTINGS'; }, false);
  ctx.fillStyle = '#9d8d6c'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'center';
  ctx.fillText(touchEnabled
    ? `best with the sound on — ⚙ has the sliders    ·    sound ${save.muted ? 'OFF' : 'on'}`
    : `SPACE clock in    ·    W workshop    ·    A achievements    ·    S settings    ·    M sound ${save.muted ? 'OFF' : 'on'}`, W / 2, H - 64);
}

function drawButton(label, x, y, w, h, fn, primary) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(x + 3, y + 4, w, h);
  const face = ctx.createLinearGradient(0, y, 0, y + h);
  if (primary) {
    face.addColorStop(0, '#55431f'); face.addColorStop(1, '#2c2214');
  } else {
    face.addColorStop(0, '#30251b'); face.addColorStop(1, '#1c1612');
  }
  ctx.fillStyle = face; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = primary ? '#e0b94d' : '#806b43'; ctx.fillRect(x, y, primary ? 5 : 3, h);
  ctx.fillStyle = primary ? 'rgba(255,226,154,0.18)' : 'rgba(225,200,144,0.09)';
  ctx.fillRect(x + 3, y + 1, w - 3, 2);
  ctx.strokeStyle = primary ? '#e0bd62' : '#927a4c';
  ctx.lineWidth = primary ? 2 : 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  let size = h < 40 ? 14 : 16;
  ctx.font = `bold ${size}px ui-monospace`;
  while (size > 10 && ctx.measureText(label).width > w - 20) {
    size -= 1; ctx.font = `bold ${size}px ui-monospace`;
  }
  ctx.fillStyle = primary ? '#ffe39b' : '#e6cf9b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2 + 1, y + h / 2);
  ctx.restore();
  buttons.push({ x, y, w, h, fn });
}

// (drawSpider/drawSwordPlayer — the old ledge renderer — are gone; the maze
// renderer lives in src/maze.js. drawWebSpider stays: boss brood + maze swarm.)

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

// ── the rooftop boss fight ──
function drawBoss() {
  const bg = game.bossGame;
  // night sky / rooftop backdrop
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0a0818'); sky.addColorStop(0.5, '#0a0510'); sky.addColorStop(1, '#08040a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // a few stars
  for (let i = 0; i < 40; i++) {
    const x = (i * 97.3) % W, y = (i * 53.7) % (H * 0.5);
    ctx.fillStyle = `rgba(200,200,255,${0.1 + 0.15 * (i % 3)})`; ctx.fillRect(x, y, 1.5, 1.5);
  }
  // shaft walls
  const SL = W / 2 - 110, SR = W / 2 + 110;
  ctx.fillStyle = 'rgba(20,14,24,0.7)'; ctx.fillRect(SL, 60, SR - SL, H - 60);
  ctx.strokeStyle = '#2a1c30'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(SL, 60); ctx.lineTo(SL, H); ctx.moveTo(SR, 60); ctx.lineTo(SR, H); ctx.stroke();

  const cx = W / 2;
  // silk cable from the spider to the car
  ctx.strokeStyle = 'rgba(220,210,235,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, bg.sY + 6); ctx.lineTo(cx, bg.car.y - BOSS.carH / 2); ctx.stroke();

  // danger band (leg sweep) — telegraph then solid
  if (bg.danger) {
    const d = bg.danger;
    ctx.fillStyle = d.active ? 'rgba(255,40,70,0.4)' : `rgba(255,60,90,${0.10 + 0.08 * Math.sin(bg.t * 14)})`;
    ctx.fillRect(SL, d.y - d.h / 2, SR - SL, d.h);
    ctx.strokeStyle = d.active ? '#ff3a5a' : 'rgba(255,90,120,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(SL, d.y - d.h / 2, SR - SL, d.h);
  }
  // falling brood
  for (const m of bg.minis) drawWebSpider({ x: m.x, y: m.y, size: m.r, sway: m.sway, dead: false });

  // the giant spider
  drawBigSpider(cx, bg.sY, BOSS.spiderR, bg);

  // the elevator car
  drawBossCar(cx, bg.car);

  // boss particles + floaters
  for (const f of bg.fx) {
    ctx.globalAlpha = Math.max(0, 1 - f.life / f.max);
    if (f.text) { ctx.fillStyle = f.color; ctx.font = 'bold 18px ui-monospace'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y); }
    else { ctx.fillStyle = f.color; ctx.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); }
  }
  ctx.globalAlpha = 1;

  // ── HUD: spider HP bar (top) + car hearts ──
  const bw = 360, bx = cx - bw / 2;
  ctx.fillStyle = '#1a0a14'; ctx.fillRect(bx, 30, bw, 12);
  ctx.fillStyle = '#c83050'; ctx.fillRect(bx, 30, bw * Math.max(0, bg.sHp / bg.sMaxHp), 12);
  ctx.strokeStyle = '#6a3a4a'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, 30.5, bw - 1, 11);
  ctx.fillStyle = '#e0a0b0'; ctx.font = 'bold 12px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(cyr('THE SPIDER THAT HOLDS YOUR LIFT'), cx, 26);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < bg.car.maxHp; i++) {
    ctx.fillStyle = i < bg.car.hp ? '#ff4a6a' : '#3a2030'; ctx.font = 'bold 20px ui-monospace';
    ctx.fillText('♥', 18 + i * 24, H - 26);
  }
  ctx.fillStyle = '#9a8aa2'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(bg.car.webbed > 0 ? 'WEBBED — crank sluggish' : '↑ ram it when it drops · ↓ retreat · dodge the red', W - 16, H - 26);
  drawPauseChip(16, 16);

  // intro reveal / result overlay
  if (bg.intro > 0) {
    const a = Math.min(1, bg.intro) * Math.min(1, (3.2 - bg.intro) * 2);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = 'rgba(6,3,10,0.82)'; ctx.fillRect(0, H / 2 - 96, W, 192);
    ctx.fillStyle = '#c89aff'; ctx.font = 'bold 30px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('THE ROOF', cx, H / 2 - 44);
    ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
    ctx.fillText('your lift was never broken. it hangs from a thread —', cx, H / 2 - 8);
    ctx.fillText('and something up here has been holding it all along.', cx, H / 2 + 16);
    ctx.fillStyle = '#ff5a74'; ctx.font = 'bold 16px ui-monospace';
    ctx.fillText('RAM IT WITH THE CAR. CUT THE CORD.', cx, H / 2 + 52);
    ctx.globalAlpha = 1;
  } else if (bg.result) {
    ctx.fillStyle = 'rgba(6,3,10,0.78)'; ctx.fillRect(0, H / 2 - 50, W, 100);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg.result === 'win') { ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 44px ui-monospace'; ctx.fillText('THE CORD SNAPS', cx, H / 2); }
    else { ctx.fillStyle = '#ff3a4a'; ctx.font = 'bold 44px ui-monospace'; ctx.fillText('PULLED INTO THE WEB', cx, H / 2); }
  }
}

function drawBigSpider(x, y, r, bg) {
  const wig = Math.sin(bg.sway) * 5, wig2 = Math.cos(bg.sway) * 5;
  const hurt = bg.sInvuln > 0 && Math.floor(bg.sInvuln * 14) % 2 === 0;
  const shk = bg.sShake > 0 ? (Math.random() - 0.5) * 6 : 0;
  ctx.save(); ctx.translate(shk, 0);
  // backglow
  const halo = ctx.createRadialGradient(x, y, 10, x, y, r * 4);
  halo.addColorStop(0, 'rgba(120,40,70,0.4)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  // legs gripping the top of the shaft
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? '#0b0610' : '#6a566e'; ctx.lineWidth = pass === 0 ? 8 : 3.5; ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 2) {
      for (let l = 0; l < 4; l++) {
        const knee = { x: x + i * (r * 0.9 + l * 9), y: y - r * 0.6 - l * 4 + (l % 2 ? wig : wig2) };
        const foot = { x: x + i * (r * 1.8 + l * 26), y: 64 + l * 3 };
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = hurt ? 0.5 : 1;
  ctx.fillStyle = '#2a1a2e';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r, r * 1.25, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - r * 0.7, r * 0.65, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6a4a72'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r, r * 1.25, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = hurt ? '#ff8090' : '#b21838';   // hourglass
  ctx.beginPath(); ctx.moveTo(x - r * 0.32, y); ctx.lineTo(x + r * 0.32, y);
  ctx.lineTo(x - r * 0.32, y + r * 0.8); ctx.lineTo(x + r * 0.32, y + r * 0.8); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.shadowColor = '#ff3a5a'; ctx.shadowBlur = 8; ctx.fillStyle = '#ff5a74';
  for (const [dx, dy] of [[-7, -r * 0.85], [7, -r * 0.85], [-3, -r * 0.6], [3, -r * 0.6]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.6, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBossCar(x, C) {
  const w = BOSS.carW, h = BOSS.carH, top = C.y - h / 2, left = x - w / 2;
  const hurt = C.invuln > 0 && Math.floor(C.invuln * 12) % 2 === 0;
  ctx.save(); if (hurt) ctx.globalAlpha = 0.6;
  // warm glow
  const halo = ctx.createRadialGradient(x, C.y, 20, x, C.y, 130);
  halo.addColorStop(0, 'rgba(255,200,120,0.14)'); halo.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = halo; ctx.fillRect(x - 130, C.y - 130, 260, 260);
  ctx.fillStyle = C.webbed > 0 ? '#8a8470' : '#6a5238'; ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#42301e'; ctx.fillRect(left + 4, top + 4, w - 8, h - 8);
  ctx.fillStyle = '#ffe6b0'; ctx.fillRect(x - 20, top + 6, 40, 4);
  // two riders bracing
  ctx.fillStyle = '#3a5a78'; ctx.fillRect(x - 24, C.y - 4, 12, 20);
  ctx.fillStyle = '#5a3a4a'; ctx.fillRect(x + 12, C.y - 4, 12, 20);
  ctx.fillStyle = '#d4a878'; ctx.beginPath(); ctx.arc(x - 18, C.y - 9, 6, 0, 7); ctx.arc(x + 18, C.y - 9, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = C.webbed > 0 ? '#d8d0b0' : '#bfa45f'; ctx.lineWidth = 2; ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  if (C.webbed > 0) {     // webbing strands across the car
    ctx.strokeStyle = 'rgba(230,225,240,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(left, top + i * h / 5); ctx.lineTo(left + w, top + ((i + 2) % 5) * h / 5); ctx.stroke(); }
  }
  ctx.restore();
}

function drawVictory() {
  ctx.fillStyle = '#0a0812'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd44a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 46px ui-monospace';
  ctx.fillText(cyr('THE CORD IS CUT'), W / 2, 130);
  // the freed elevator on a steel cable, no spider
  const cx = W / 2, t = performance.now() / 1000, ey = 250 + Math.sin(t) * 3;
  ctx.strokeStyle = '#8a8a96'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, 170); ctx.lineTo(cx, ey - 24); ctx.stroke();
  ctx.fillStyle = '#5a4530'; ctx.fillRect(cx - 34, ey - 24, 68, 48);
  ctx.fillStyle = '#3a2a1c'; ctx.fillRect(cx - 30, ey - 20, 60, 40);
  ctx.fillStyle = '#ffdd99'; ctx.fillRect(cx - 10, ey - 18, 20, 4);
  ctx.fillStyle = '#3a5a78'; ctx.fillRect(cx - 13, ey - 2, 8, 12); ctx.fillStyle = '#5a3a4a'; ctx.fillRect(cx + 5, ey - 2, 8, 12);
  ctx.strokeStyle = '#bfa45f'; ctx.lineWidth = 1; ctx.strokeRect(cx - 34, ey - 24, 68, 48);

  ctx.fillStyle = '#bfa45f'; ctx.font = '17px ui-monospace';
  ctx.fillText('the spider falls. the thread snaps. for the first time,', W / 2, 330);
  ctx.fillText('your lift runs on honest steel — just an elevator.', W / 2, 356);
  ctx.fillStyle = '#7adf9a'; ctx.font = 'bold 18px ui-monospace';
  ctx.fillText('★ CUT THE CORD  +30 unlocked', W / 2, 404);
  ctx.fillStyle = '#a99772'; ctx.font = '13px ui-monospace';
  ctx.fillText('the title remembers what you did here.', W / 2, 432);
  // the heat ladder: what you cleared, and the rung that just unlocked
  if (run.heat > 0) {
    ctx.fillStyle = '#ff7a3a'; ctx.font = 'bold 15px ui-monospace';
    ctx.fillText(`cleared at HEAT ${run.heat}`, W / 2, 466);
  }
  if (save.stats.heatCleared < HEAT.length) {
    const next = save.stats.heatCleared + 1;
    ctx.fillStyle = '#9a7a5a'; ctx.font = '13px ui-monospace';
    ctx.fillText(`HEAT ${next} unlocked — ${HEAT[next - 1].name.toLowerCase()}. the building remembers.`, W / 2, run.heat > 0 ? 490 : 466);
  } else {
    ctx.fillStyle = '#9a7a5a'; ctx.font = '13px ui-monospace';
    ctx.fillText('heat 5 cleared. the building has nothing left to throw at you.', W / 2, run.heat > 0 ? 490 : 466);
  }
  drawButton('▸  CLOCK OUT A HERO', W / 2 - 140, H - 130, 280, 48, () => { menu = null; game.state = 'TITLE'; }, true);
}

// ── shift done overlay ──
function drawShiftDone() {
  ctx.fillStyle = 'rgba(13,10,8,0.86)'; ctx.fillRect(0, 0, W, H);
  celebrate('SHIFT_DONE');               // fireworks + emoji raining on the floor
  ctx.fillStyle = '#7aaa55'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px ui-monospace';
  ctx.fillText(cyr(`SHIFT ${run.shiftNum} SURVIVED`), W / 2, H / 2 - 90);
  ctx.fillStyle = '#bfa45f'; ctx.font = '18px ui-monospace';
  ctx.fillText(`${game.delivered} delivered  ·  +${game.partsThisShift} ◆ from fares`, W / 2, H / 2 - 36);
  ctx.fillText(`shift bonus  +${game.bonus} ◆`, W / 2, H / 2 - 8);
  ctx.fillStyle = '#d4a050'; ctx.font = 'bold 22px ui-monospace';
  ctx.fillText(`◆ ${run.parts} parts in pocket`, W / 2, H / 2 + 36);
  // once you've seen the Spider Floor, the way up is open — a one-way climb
  if (save.stats.spiderVisits >= 1) {
    drawButton('VISIT THE PARTS SHOP  ▸', W / 2 - 320, H / 2 + 80, 300, 46, openShop, true);
    drawButton('▲  CLIMB TO THE ROOF', W / 2 + 20, H / 2 + 80, 300, 46, enterBoss, false);
    ctx.fillStyle = '#9a5a6a'; ctx.font = 'italic 12px ui-monospace';
    ctx.fillText(touchEnabled
      ? 'face the spider that holds your lift — win or lose, the run ends'
      : 'press C to face the spider that holds your lift — win or lose, the run ends', W / 2, H / 2 + 150);
  } else {
    drawButton('VISIT THE PARTS SHOP  ▸', W / 2 - 150, H / 2 + 80, 300, 46, openShop, true);
  }
}

function drawFired() {
  ctx.fillStyle = 'rgba(13,10,8,0.9)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#aa3a32'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px ui-monospace';
  ctx.fillText(cyr(game.bossLost ? 'THE WEB WINS' : "YOU'RE FIRED"), W / 2, H / 2 - 88);
  ctx.fillStyle = '#bfa45f'; ctx.font = '18px ui-monospace';
  const survived = run.shiftNum - 1;
  if (game.bossLost) ctx.fillText('the spider reels you back in. the lift still isn\'t yours.', W / 2, H / 2 - 44);
  else ctx.fillText(`survived ${survived} shift${survived === 1 ? '' : 's'}  ·  ${run.totalDelivered} total deliveries`, W / 2, H / 2 - 44);
  // what actually did it — a death should be legible, not just scored
  if (!game.bossLost) {
    const met = game.met || {};
    const bits = [`${game.walkoffsThisShift} walk-off${game.walkoffsThisShift === 1 ? '' : 's'} on shift ${run.shiftNum}`];
    if (met.fusesBurned) bits.push(`${met.fusesBurned} fuse${met.fusesBurned === 1 ? '' : 's'} blown first`);
    if (met.closeCalls) bits.push(`${met.closeCalls} near-miss${met.closeCalls === 1 ? '' : 'es'}`);
    ctx.fillStyle = '#9a6a5a'; ctx.font = 'italic 13px ui-monospace';
    ctx.fillText(`what did it: ${bits.join('  ·  ')}`, W / 2, H / 2 - 18);
  }
  const got = ACHIEVEMENTS.filter(a => save.ach[a.key]).length;
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 20px ui-monospace';
  ctx.fillText(`★ ${save.stars} banked  ·  ${got}/${ACHIEVEMENTS.length} achievements`, W / 2, H / 2 + 12);
  ctx.fillStyle = '#a99772'; ctx.font = '14px ui-monospace';
  ctx.fillText(`best: ${save.best.shifts} shifts  ·  ${save.best.delivered} deliveries`, W / 2, H / 2 + 44);
  // the machine you died in, so next career starts with a plan instead of vibes
  const owned = UPGRADES.filter(u => run.up[u.key] > 0)
    .map(u => run.up[u.key] > 1 ? `${u.name} ${run.up[u.key]}` : u.name);
  ctx.fillStyle = '#95866a'; ctx.font = '12px ui-monospace';
  ctx.fillText(owned.length ? `the machine: ${owned.join(' · ')}` : 'the machine: bone stock — maybe that was the problem',
               W / 2, H / 2 + 150);
  drawButton('SPEND ★ IN WORKSHOP', W / 2 - 240, H / 2 + 80, 226, 46, () => { menu = 'WORKSHOP'; }, false);
  drawButton('CLOCK IN AGAIN', W / 2 + 14, H / 2 + 80, 226, 46, () => { menu = null; game.state = 'TITLE'; }, true);
}

// ── operator select: who's on the crank this run ──
function drawOperatorPortrait(key, x, y, color, locked) {
  ctx.save();
  ctx.translate(x, y); ctx.globalAlpha = locked ? 0.34 : 1;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;

  // shoulders and head form the common bureau-ID silhouette.
  ctx.beginPath(); ctx.arc(0, -8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-17, 19); ctx.quadraticCurveTo(-14, 4, 0, 4);
  ctx.quadraticCurveTo(14, 4, 17, 19); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#17120e';
  ctx.beginPath(); ctx.arc(-3, -9, 1.4, 0, Math.PI * 2); ctx.arc(3, -9, 1.4, 0, Math.PI * 2); ctx.fill();

  // One strong prop per operator reads at a glance even at menu scale.
  ctx.strokeStyle = color; ctx.fillStyle = color;
  if (key === 'sal') {
    ctx.fillRect(-11, -19, 22, 4); ctx.fillRect(-7, -23, 14, 5);
  } else if (key === 'dot') {
    ctx.beginPath(); ctx.arc(-4, -9, 4, 0, Math.PI * 2); ctx.arc(4, -9, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(1, -9); ctx.stroke();
  } else if (key === 'gus') {
    ctx.beginPath(); ctx.arc(0, -13, 11, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(-13, -14, 26, 4);
  } else if (key === 'vera') {
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -8, 13, Math.PI * 0.72, Math.PI * 2.28); ctx.stroke();
  } else if (key === 'lou') {
    ctx.beginPath(); ctx.moveTo(-12, -17); ctx.lineTo(12, -17); ctx.lineTo(7, -24); ctx.lineTo(-7, -24); ctx.closePath(); ctx.fill();
    ctx.fillRect(-15, -18, 30, 3);
  }
  ctx.restore();

  if (locked) {
    ctx.save(); ctx.translate(x + 13, y + 12);
    ctx.fillStyle = '#6f624b'; ctx.fillRect(-7, -2, 14, 12);
    ctx.strokeStyle = '#6f624b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -2, 5, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#17120e'; ctx.fillRect(-1, 2, 2, 5);
    ctx.restore();
  }
}

function drawOperatorSelect() {
  drawMenuBackdrop('#18120d', '#090807', '#b79252');
  drawMenuHeading("WHO'S ON THE CRANK?",
    'every operator works the same lift — the bureau merely files the complaints', 48, '#d6b56f');

  const cardW = 560, cardH = 84, gapY = 11;
  const x0 = (W - cardW) / 2, y0 = 100;
  OPERATORS.forEach((o, i) => {
    const cy = y0 + i * (cardH + gapY);
    const unlocked = isOpUnlocked(o);
    const isLast = o.key === (save.lastOperator || 'sal');

    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x0 + 3, cy + 4, cardW, cardH);
    const card = ctx.createLinearGradient(x0, 0, x0 + cardW, 0);
    card.addColorStop(0, unlocked ? '#241b12' : '#12100d');
    card.addColorStop(1, unlocked ? '#15110d' : '#0d0c0b');
    ctx.fillStyle = card; ctx.fillRect(x0, cy, cardW, cardH);
    const stateColor = !unlocked ? '#40382d' : isLast ? '#ffd44a' : '#a88950';
    ctx.fillStyle = stateColor; ctx.fillRect(x0, cy, unlocked && isLast ? 5 : 3, cardH);
    ctx.strokeStyle = !unlocked ? '#29251f' : isLast ? '#a98a3a' : '#423725';
    ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, cy + 0.5, cardW - 1, cardH - 1);
    drawOperatorPortrait(o.key, x0 + 32, cy + 43, unlocked ? (isLast ? '#f0c95c' : '#a99368') : '#746957', !unlocked);

    if (unlocked) {
      ctx.fillStyle = '#d8b75f'; ctx.font = 'bold 11px ui-monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${i + 1}`, x0 + 8, cy + 7);
      const tx = x0 + 66;
      ctx.fillStyle = '#f2e6cc'; ctx.font = 'bold 16px ui-monospace';
      ctx.fillText(o.name, tx, cy + 9);
      const nameW = ctx.measureText(o.name).width;
      ctx.fillStyle = '#b8a98d'; ctx.font = '13px ui-monospace';
      ctx.fillText(` / ${o.epithet}`, tx + nameW, cy + 11);
      ctx.fillStyle = '#a99a7e'; ctx.font = 'italic 11px ui-monospace';
      ctx.fillText(o.blurb, tx, cy + 31);
      ctx.fillStyle = '#91e8aa'; ctx.font = touchEnabled ? '12.5px ui-monospace' : '11.5px ui-monospace';
      ctx.fillText(`+ ${o.buff}`, tx, cy + 49);
      ctx.fillStyle = '#ff8d84';
      ctx.fillText(`− ${o.penalty}`, tx, cy + 66);
      if (isLast) {
        ctx.fillStyle = '#f2ca60'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'right';
        ctx.fillText('LAST USED  ·  SPACE', x0 + cardW - 12, cy + 11);
      }
      buttons.push({ x: x0, y: cy, w: cardW, h: cardH, fn: () => startWithOperator(o.key) });
    } else {
      const tx = x0 + 66;
      ctx.fillStyle = '#81755f'; ctx.font = 'bold 15px ui-monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${o.name} / ${o.epithet}`, tx, cy + 12);
      ctx.fillStyle = '#625a4b'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'right';
      ctx.fillText('LOCKED', x0 + cardW - 12, cy + 12);
      ctx.fillStyle = '#8f8065'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'left';
      ctx.fillText('BUREAU REQUIREMENT', tx, cy + 42);
      ctx.fillStyle = '#b3a17e'; ctx.font = '12px ui-monospace';
      ctx.fillText(o.unlockHint, tx, cy + 59);
    }
  });

  // ── the heat dial — only once the cord has been cut ──
  if (maxHeatUnlocked() > 0) {
    const hy = 592;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let hx = x0;
    ctx.font = 'bold 13px ui-monospace';
    ctx.fillStyle = menuHeat > 0 ? '#ff8a4a' : '#9a8466';
    ctx.fillText(`HEAT ${menuHeat}`, hx, hy); hx += 64;
    for (let i = 0; i < HEAT.length; i++) {              // flame pips
      const lit = i < menuHeat, reachable = i < maxHeatUnlocked();
      ctx.fillStyle = lit ? '#ff7a3a' : reachable ? '#4a3a30' : '#2a2218';
      ctx.beginPath();
      ctx.moveTo(hx + 5, hy - 6); ctx.quadraticCurveTo(hx + 11, hy, hx + 5, hy + 6);
      ctx.quadraticCurveTo(hx - 1, hy, hx + 5, hy - 6);
      ctx.fill();
      hx += 16;
    }
    hx += 10;
    ctx.font = '11px ui-monospace'; ctx.fillStyle = '#b29c7b';
    const desc = menuHeat === 0 ? 'a normal career — press H to turn up the heat'
      : HEAT.slice(0, menuHeat).map(h => h.name).join(' · ');
    ctx.fillText(desc, hx, hy);
    // a generous hit strip: the old 24px row was ~10 CSS px on a phone — the
    // whole post-victory ladder was effectively locked for touch players
    buttons.push({ x: x0 - 4, y: hy - 24, w: cardW + 8, h: 48, fn: cycleHeat });
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a89778'; ctx.font = '12px ui-monospace';
  ctx.fillText(touchEnabled
    ? `tap an operator to clock in${maxHeatUnlocked() > 0 ? ' · tap the flames for heat' : ''}`
    : `1-5 pick · SPACE clock in with your last crew${maxHeatUnlocked() > 0 ? ' · H heat' : ''} · ESC back`, W / 2, H - 70);
  drawButton('◂  BACK', W / 2 - 110, H - 54, 220, 36, () => { menu = null; }, false);
}

// ── the Workshop: permanent cross-run perks bought with ★ stars ──
function drawWorkshopIcon(key, x, y, size, color) {
  const s = size / 2;
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (key === 'severance') {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.66, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
    ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45); ctx.stroke();
  } else if (key === 'footInDoor') {
    ctx.strokeRect(-s * 0.56, -s * 0.76, s * 1.12, s * 1.52);
    ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.7); ctx.lineTo(-s * 0.05, s * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.25, 0, 1.4, 0, Math.PI * 2); ctx.fill();
  } else if (key === 'roomierStart') {
    ctx.strokeRect(-s * 0.48, -s * 0.58, s * 0.96, s * 1.16);
    ctx.beginPath(); ctx.moveTo(-s * 0.65, 0); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.82, -s * 0.18);
    ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.82, s * 0.18);
    ctx.moveTo(s * 0.65, 0); ctx.lineTo(s, 0); ctx.lineTo(s * 0.82, -s * 0.18);
    ctx.moveTo(s, 0); ctx.lineTo(s * 0.82, s * 0.18); ctx.stroke();
  } else if (key === 'sturdyStart') {
    for (const dx of [-s * 0.34, s * 0.34]) {
      ctx.beginPath(); ctx.moveTo(dx, -s * 0.8); ctx.bezierCurveTo(dx - 4, -3, dx + 4, 3, dx, s * 0.8); ctx.stroke();
    }
  } else if (key === 'masterKey') {
    ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.2, s * 0.35, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.08, s * 0.02); ctx.lineTo(s * 0.75, s * 0.75);
    ctx.moveTo(s * 0.45, s * 0.48); ctx.lineTo(s * 0.68, s * 0.25); ctx.stroke();
  } else if (key === 'unionCard') {
    ctx.strokeRect(-s * 0.78, -s * 0.55, s * 1.56, s * 1.1);
    ctx.beginPath(); ctx.moveTo(-s * 0.48, -s * 0.18); ctx.lineTo(s * 0.48, -s * 0.18);
    ctx.moveTo(-s * 0.48, s * 0.2); ctx.lineTo(s * 0.16, s * 0.2); ctx.stroke();
  } else if (key === 'frequentFlyer') {
    ctx.beginPath(); ctx.arc(-s * 0.35, s * 0.15, s * 0.42, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.25, s * 0.55); ctx.lineTo(s * 0.25, -s * 0.55);
    ctx.moveTo(s * 0.25, -s * 0.55); ctx.lineTo(0, -s * 0.28);
    ctx.moveTo(s * 0.25, -s * 0.55); ctx.lineTo(s * 0.5, -s * 0.28); ctx.stroke();
  } else if (key === 'greaseMonkey') {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.58);
      ctx.lineTo(Math.cos(a) * s * 0.84, Math.sin(a) * s * 0.84); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2); ctx.fill();
  } else if (key === 'bigShop') {
    for (const [dx, dy] of [[0, -s * 0.58], [-s * 0.62, s * 0.48], [s * 0.62, s * 0.48]]) {
      ctx.beginPath(); ctx.arc(dx, dy, s * 0.18, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, -s * 0.38); ctx.lineTo(-s * 0.48, s * 0.34);
    ctx.moveTo(0, -s * 0.38); ctx.lineTo(s * 0.48, s * 0.34);
    ctx.moveTo(-s * 0.42, s * 0.48); ctx.lineTo(s * 0.42, s * 0.48); ctx.stroke();
  } else if (key === 'rerollToken') {
    ctx.beginPath(); ctx.arc(0, 0, s * 0.62, -Math.PI * 0.2, Math.PI * 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.56, -s * 0.28); ctx.lineTo(-s * 0.78, s * 0.02); ctx.lineTo(-s * 0.38, s * 0.04); ctx.fill();
  } else if (key === 'hazardPay') {
    ctx.beginPath(); ctx.moveTo(0, -s * 0.82); ctx.lineTo(s * 0.72, s * 0.62);
    ctx.lineTo(-s * 0.72, s * 0.62); ctx.closePath(); ctx.stroke();
    ctx.fillRect(-1, -s * 0.38, 2, s * 0.55); ctx.fillRect(-1, s * 0.36, 2, 2);
  } else if (key === 'reputation') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.36 : s * 0.8;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  } else {
    // Known Associate: a small web, deliberately echoing the Spider Floor.
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(-Math.cos(a) * s * 0.78, -Math.sin(a) * s * 0.78);
      ctx.lineTo(Math.cos(a) * s * 0.78, Math.sin(a) * s * 0.78); ctx.stroke();
    }
    for (const r of [s * 0.32, s * 0.62]) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWorkshop() {
  drawMenuBackdrop('#11131b', '#08090e', '#7180a6');
  drawMenuHeading('THE WORKSHOP',
    'permanent perks between jobs — sanctioned by the housing committee', 50, '#d3dcf3');
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 20px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`★ ${save.stars} stars available`, W / 2, 112);

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

    const stateColor = maxed ? '#79d69b' : afford ? '#f0c85a' : '#596077';
    ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fillRect(cx + 3, cy + 3, cardW, cardH);
    const card = ctx.createLinearGradient(cx, cy, cx + cardW, cy + cardH);
    card.addColorStop(0, maxed ? '#13201b' : afford ? '#211d12' : '#151720');
    card.addColorStop(1, '#0e1017');
    ctx.fillStyle = card; ctx.fillRect(cx, cy, cardW, cardH);
    ctx.fillStyle = stateColor; ctx.fillRect(cx, cy, maxed || afford ? 4 : 2, cardH);
    ctx.strokeStyle = maxed ? '#315847' : afford ? '#685925' : '#292d3b';
    ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, cardW - 1, cardH - 1);

    const hotkey = i < 9 ? `${i + 1}` : i === 9 ? '0' : null;
    drawWorkshopIcon(m.key, cx + 27, cy + 15, 18, stateColor);
    if (hotkey) {
      ctx.fillStyle = stateColor; ctx.font = 'bold 9px ui-monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(hotkey, cx + 8, cy + 8);
    }
    ctx.fillStyle = maxed ? '#d8f1e1' : afford ? '#fff0bb' : '#c1c6d7';
    ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(m.name, cx + 47, cy + 8);

    for (let l = 0; l < m.max; l++) {
      ctx.fillStyle = l < lvl ? '#79d69b' : '#343849';
      ctx.fillRect(cx + cardW - 12 - (m.max - l) * 11, cy + 9, 8, 6);
    }

    ctx.fillStyle = maxed ? '#a8c7b4' : '#aeb3c6'; ctx.font = touchEnabled ? '11px ui-monospace' : '10.5px ui-monospace';
    wrapText(m.blurb[Math.min(lvl, m.blurb.length - 1)], cx + 10, cy + 29, cardW - 20, touchEnabled ? 12.5 : 12);

    ctx.font = 'bold 10px ui-monospace'; ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left'; ctx.fillStyle = lvl ? '#8fd8a5' : '#747b91';
    ctx.fillText(lvl ? `OWNED ${lvl}/${m.max}` : 'NOT OWNED', cx + 10, cy + cardH - 8);
    ctx.textAlign = 'right';
    if (maxed) { ctx.fillStyle = '#8fe0aa'; ctx.fillText('MAXED', cx + cardW - 10, cy + cardH - 8); }
    else if (afford) { ctx.fillStyle = '#ffd963'; ctx.fillText(`BUY  ★${cost}`, cx + cardW - 10, cy + cardH - 8); }
    else { ctx.fillStyle = '#747b91'; ctx.fillText(`LOCKED  ★${cost}`, cx + cardW - 10, cy + cardH - 8); }

    if (!maxed) buttons.push({ x: cx, y: cy, w: cardW, h: cardH, fn: () => buyMeta(m) });
  });

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9ba3bd'; ctx.font = '12px ui-monospace';
  ctx.fillText(touchEnabled
    ? 'tap a perk to buy it  ·  perks apply NEXT run'
    : 'click a perk (or press 1–9, 0)  ·  A: achievements  ·  perks apply NEXT run', W / 2, H - 88);
  drawButton('★  ACHIEVEMENTS', W / 2 - 230, H - 68, 220, 44, () => { menu = 'ACH'; }, false);
  drawButton('◂  BACK', W / 2 + 10, H - 68, 220, 44, () => { menu = null; }, true);
}

// ── the achievements screen (the source of all ★) ──
function drawAchievementMark(index, x, y, got) {
  const color = got ? '#ffdc63' : '#555a6b';
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = got ? '#493c13' : '#171923'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = color;
  if (got) {
    ctx.beginPath(); ctx.moveTo(-3.5, 0); ctx.lineTo(-0.8, 3); ctx.lineTo(4, -3.5); ctx.stroke();
  } else {
    const variant = index % 3;
    ctx.beginPath();
    if (variant === 0) { ctx.moveTo(-3, 0); ctx.lineTo(3, 0); }
    else if (variant === 1) { ctx.arc(0, 0, 2.8, 0, Math.PI * 2); }
    else { ctx.moveTo(0, -3); ctx.lineTo(3, 3); ctx.lineTo(-3, 3); ctx.closePath(); }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAchievements() {
  drawMenuBackdrop('#15140f', '#09090c', '#9d8439');
  drawMenuHeading('ACHIEVEMENTS', null, 36, '#ffdb61');
  const unlocked = ACHIEVEMENTS.filter(a => save.ach[a.key]).length;
  const earned = ACHIEVEMENTS.filter(a => save.ach[a.key]).reduce((s, a) => s + a.award, 0);
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#b9b29d';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${unlocked} / ${ACHIEVEMENTS.length} unlocked  ·  ★ ${earned} of ${ACH_TOTAL} earned  ·  spend in the Workshop`, W / 2, 62);
  const progressW = 360, progressX = W / 2 - progressW / 2;
  ctx.fillStyle = '#27251d'; ctx.fillRect(progressX, 76, progressW, 5);
  ctx.fillStyle = '#d6b747'; ctx.fillRect(progressX, 76, progressW * (unlocked / ACHIEVEMENTS.length), 5);

  const cols = 5, cardW = 170, cardH = 56, gapX = 6, gapY = 7;   // 5 columns: 37 cards must fit above the BACK button
  const totalW = cols * cardW + (cols - 1) * gapX;
  const x0 = (W - totalW) / 2, y0 = 91;
  ACHIEVEMENTS.forEach((a, i) => {
    const cx = x0 + (i % cols) * (cardW + gapX);
    const cy = y0 + Math.floor(i / cols) * (cardH + gapY);
    const got = !!save.ach[a.key];
    ctx.fillStyle = got ? '#211c0e' : (i % 2 ? '#12131a' : '#101118'); ctx.fillRect(cx, cy, cardW, cardH);
    ctx.fillStyle = got ? '#e3c24c' : '#303440'; ctx.fillRect(cx, cy, got ? 3 : 1, cardH);
    ctx.strokeStyle = got ? '#715e21' : '#242733'; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, cardW - 1, cardH - 1);
    drawAchievementMark(i, cx + 13, cy + 13, got);
    ctx.fillStyle = got ? '#ffe487' : '#888d9e';
    let nameSize = 11.5;
    ctx.font = `bold ${nameSize}px ui-monospace`;
    while (nameSize > 9 && ctx.measureText(a.name).width > cardW - 38) {
      nameSize -= 0.5; ctx.font = `bold ${nameSize}px ui-monospace`;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(a.name, cx + 27, cy + 7);
    ctx.fillStyle = got ? '#b6a77e' : '#74798b'; ctx.font = '9.5px ui-monospace';
    wrapText(a.desc, cx + 9, cy + 24, cardW - 40, 11);
    ctx.fillStyle = got ? '#91e2a9' : '#7b7d6a'; ctx.font = 'bold 11px ui-monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`★${a.award}`, cx + cardW - 8, cy + cardH - 7);
  });

  drawButton('◂  BACK', W / 2 - 110, H - 56, 220, 40, () => { menu = null; }, true);
}

// ── shop: the between-shift layer — consumables, specials, and your build ──
function drawShop() {
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
  celebrate('SHOP');                     // calm gold motes — payday ambience
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 32px ui-monospace';
  ctx.fillText(cyr('THE PARTS SHOP'), W / 2, 46);
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#a99772';
  ctx.fillText("today's allocation, comrade — the depot provides what the depot provides", W / 2, 72);
  ctx.fillStyle = '#d4a050'; ctx.font = 'bold 20px ui-monospace';
  ctx.fillText(`◆ ${run.parts} parts`, W / 2, 100);

  // ── tomorrow's forecast, posted on the depot wall — buy accordingly ──
  // (conditions are pre-rolled at shift end, so the shelf becomes counterplay:
  // espresso vs SHORT FUSES, a tip-off vs GRAVEYARD, a waiver vs a bad day)
  const fc = run.nextMods;
  if (fc && fc.length) {
    const names = fc.map(md => {
      const col = md.tone === 'good' ? '#7acf7a' : md.tone === 'bad' ? '#e0584a' : '#d8b24a';
      return { text: md.name, col, desc: md.desc };
    });
    ctx.font = 'bold 14px ui-monospace';
    ctx.fillStyle = '#8a7a5a';
    const label = 'TOMORROW: ';
    const joined = names.map(n => n.text).join('  +  ');
    const lw = ctx.measureText(label).width, jw = ctx.measureText(joined).width;
    let fx = W / 2 - (lw + jw) / 2;
    ctx.textAlign = 'left';
    ctx.fillText(label, fx, 126); fx += lw;
    for (let i = 0; i < names.length; i++) {
      const part = names[i].text + (i < names.length - 1 ? '  +  ' : '');
      ctx.fillStyle = names[i].col;
      ctx.fillText(part, fx, 126);
      fx += ctx.measureText(part).width;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a08f70'; ctx.font = '11px ui-monospace';
    ctx.fillText(names.map(n => n.desc).join('  ·  '), W / 2, 146);
  } else {
    ctx.fillStyle = '#6a7a5a'; ctx.font = 'italic 13px ui-monospace';
    ctx.fillText('TOMORROW: a calm, ordinary day — probably', W / 2, 130);
  }

  const totalW = 784, x0 = (W - totalW) / 2;

  // ── the rotating shelf: Spare Fuse + two one-shot specials ──
  const shelfY = 176;
  const itemGap = 12, itemW = (totalW - 2 * itemGap) / 3, itemH = 64;
  ctx.fillStyle = '#6a6a4a'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText("TODAY'S SHELF", x0, shelfY - 6);
  const shelf = [
    { key: 'F', name: 'Spare Fuse', cost: fuseCost(), blurb: `Forgive one walk-off. Carrying ${run.fuses}.`, fn: buyFuse, bought: false },
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
    ctx.fillStyle = '#9a8a64'; ctx.font = touchEnabled ? '12.5px ui-monospace' : '11px ui-monospace';
    wrapText(it.blurb, ix + 10, shelfY + 26, itemW - 20, touchEnabled ? 14 : 13);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 13px ui-monospace';
    if (it.bought) { ctx.fillStyle = '#7aaa55'; ctx.fillText('SOLD', ix + itemW - 10, shelfY + itemH - 8); }
    else { ctx.fillStyle = afford ? '#d4a050' : '#7a5a3a'; ctx.fillText(`◆ ${it.cost}`, ix + itemW - 10, shelfY + itemH - 8); }
    if (!it.bought) buttons.push({ x: ix, y: shelfY, w: itemW, h: itemH, fn: it.fn });
  });
  drawButton(`↻ RESTOCK SHELF  (◆${restockCost()})`,
             W / 2 - 130, shelfY + itemH + 12, 260, 32, rerollShop, false);

  // ── your build so far: fittings and habits, with levels ──
  const by = shelfY + itemH + 64;
  drawBuildPanel(x0, by, totalW);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a99772'; ctx.font = '12px ui-monospace';
  ctx.fillText(touchEnabled
    ? 'tap an item to buy it'
    : 'click or press the key  ·  F fuse  ·  Z / X specials  ·  R restock', W / 2, H - 92);
  const nextQ = shiftParams(run.shiftNum + 1).quota;
  drawButton(`START SHIFT ${run.shiftNum + 1}  (quota ${nextQ})  ▸`,
             W / 2 - 170, H - 72, 340, 44, () => startShift(), true);
}

// one rack of the build — owned parts as chips, open slots as hollow boxes.
// Used side by side in the shop and at the screen edges during a level-up.
function drawBuildColumn(kind, x, y, colW, nameFont = 'bold 13px ui-monospace') {
  const cap = kind === 'habit' ? habitSlotCap() : fittingSlotCap();
  ctx.fillStyle = '#6a6a4a'; ctx.font = '11px ui-monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${kind === 'habit' ? 'HABITS' : 'FITTINGS'}  ${slotsUsed(kind)}/${cap}`, x, y - 4);
  const owned = UPGRADES.filter(u => u.kind === kind && run.up[u.key] > 0 && !isHouse(u.key));
  let cy = y + 2;
  // house fittings first: the Workshop bolted these to the BUILDING — they
  // never occupy a rack slot (and the ⚙ says so)
  for (const u of UPGRADES) {
    if (u.kind !== kind || !(run.up[u.key] > 0) || !isHouse(u.key)) continue;
    ctx.fillStyle = '#14110d'; ctx.fillRect(x, cy, colW, 26);
    ctx.fillStyle = '#6a6a82'; ctx.fillRect(x, cy, 4, 26);
    ctx.strokeStyle = '#26242c'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, cy + 0.5, colW - 1, 25);
    ctx.fillStyle = '#8a8aa2'; ctx.font = nameFont;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`⚙ ${u.name}`, x + 8, cy + 13);
    for (let l = 0; l < u.max; l++) {
      ctx.fillStyle = l < run.up[u.key] ? '#5a6a82' : '#26242c';
      ctx.fillRect(x + colW - 10 - (u.max - l) * 11, cy + 10, 8, 6);
    }
    cy += 31;
  }
  for (let i = 0; i < cap; i++) {
    const u = owned[i];
    if (u) {
      const tag = UP_TAGS[u.tag] || { color: '#bfa45f' };
      ctx.fillStyle = '#1a130d'; ctx.fillRect(x, cy, colW, 26);
      ctx.fillStyle = tag.color; ctx.fillRect(x, cy, 4, 26);
      ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, cy + 0.5, colW - 1, 25);
      ctx.fillStyle = '#bfa45f'; ctx.font = nameFont;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(u.name, x + 10, cy + 13);
      for (let l = 0; l < u.max; l++) {
        ctx.fillStyle = l < run.up[u.key] ? '#7aaa55' : '#3a2e22';
        ctx.fillRect(x + colW - 10 - (u.max - l) * 11, cy + 10, 8, 6);
      }
    } else {
      ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, cy + 0.5, colW - 1, 25);
      ctx.fillStyle = '#4a3e2c'; ctx.font = 'italic 11px ui-monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('open slot', x + colW / 2, cy + 13);
    }
    cy += 31;
  }
}
function drawBuildPanel(x0, y, totalW) {
  const colW = (totalW - 20) / 2;
  drawBuildColumn('fitting', x0, y, colW);
  drawBuildColumn('habit', x0 + colW + 20, y, colW);
}

// ── mid-shift level-up: the game holds its breath while you pick 1 of 3 ──
function drawLevelUp() {
  const lv = game.levelUp;
  if (!lv) return;
  ctx.fillStyle = 'rgba(8,6,4,0.80)'; ctx.fillRect(0, 0, W, H);
  celebrate('LEVELUP');                  // confetti behind the choices
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 34px ui-monospace';
  ctx.fillText(cyr(`LEVEL ${run.level + 1}`), W / 2, 86);
  ctx.fillStyle = '#9a8a64'; ctx.font = '13px ui-monospace';
  ctx.fillText(lv.banishMode ? '' : 'requisition one — installed immediately, no paperwork', W / 2, 114);
  if (lv.banishMode) {
    ctx.fillStyle = '#e0584a'; ctx.font = 'bold 14px ui-monospace';
    ctx.fillText('✕ BANISH: pick a part you never want offered again this run', W / 2, 114);
  }

  // your racks flank the choices — you can see what you own while deepening it
  drawBuildColumn('fitting', 16, 148, 192, 'bold 12px ui-monospace');
  drawBuildColumn('habit', W - 16 - 192, 148, 192, 'bold 12px ui-monospace');

  const cardW = 460, cardH = 78, gapY = 12;
  const x0 = (W - cardW) / 2, y0 = 148;
  lv.choices.forEach((u, i) => {
    const cy = y0 + i * (cardH + gapY);
    const lvl = run.up[u.key];
    const isNew = lvl === 0;
    const tag = UP_TAGS[u.tag] || { name: '', color: '#bfa45f' };

    ctx.fillStyle = '#1a130d'; ctx.fillRect(x0, cy, cardW, cardH);
    ctx.fillStyle = tag.color; ctx.fillRect(x0, cy, 5, cardH);
    ctx.strokeStyle = lv.banishMode ? '#e0584a' : '#bfa45f';
    ctx.lineWidth = 2; ctx.strokeRect(x0, cy, cardW, cardH);

    ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 16px ui-monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${i + 1}`, x0 + 14, cy + 11);
    ctx.fillStyle = '#e8dcc0'; ctx.font = 'bold 16px ui-monospace';
    ctx.fillText(u.name, x0 + 36, cy + 10);
    ctx.fillStyle = tag.color; ctx.font = '9px ui-monospace';
    ctx.fillText(`${tag.name} · ${u.kind === 'habit' ? 'HABIT' : 'FITTING'}`, x0 + 36, cy + 29);
    // NEW vs next-level chip
    ctx.font = 'bold 11px ui-monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = isNew ? '#7adf9a' : '#d8b24a';
    ctx.fillText(isNew ? 'NEW' : `Lv${lvl} → Lv${lvl + 1}`, x0 + cardW - 12, cy + 11);
    for (let l = 0; l < u.max; l++) {
      ctx.fillStyle = l < lvl ? '#7aaa55' : '#3a2e22';
      ctx.fillRect(x0 + cardW - 14 - (u.max - l) * 13, cy + 26, 9, 6);
    }
    // phones read this at ~0.4x scale — the pick of the run deserves legible type
    ctx.fillStyle = '#9a8a64'; ctx.font = touchEnabled ? '14px ui-monospace' : '12px ui-monospace';
    wrapText(u.blurb[Math.min(lvl, u.blurb.length - 1)], x0 + 36, cy + 46, cardW - 56, touchEnabled ? 15 : 14);
    buttons.push({ x: x0, y: cy, w: cardW, h: cardH,
                   fn: () => lv.banishMode ? banishLevel(u) : pickLevel(u) });
  });

  const rowY = y0 + lv.choices.length * (cardH + gapY) + 6;
  const rrFree = game.lvRerolls > 0;
  const rrSpent = !rrFree && lv.paidRerolls >= 1;
  drawButton(rrFree ? `↻ REROLL (free ×${game.lvRerolls})` : rrSpent ? '↻ REROLL (used)' : `↻ REROLL (◆${REROLL_COST})`,
             W / 2 - 268, rowY, 168, 32, rerollLevel, false);
  drawButton(run.banishes > 0 ? (lv.banishMode ? '✕ BANISH — cancel' : `✕ BANISH (×${run.banishes})`) : '✕ BANISH (used)',
             W / 2 - 88, rowY, 176, 32,
             () => { if (run.banishes > 0) { lv.banishMode = !lv.banishMode; sfx.door(); } else sfx.buzz(); }, false);
  drawButton('SKIP  (+2 ◆)', W / 2 + 100, rowY, 168, 32, skipLevel, false);

  ctx.fillStyle = '#a99772'; ctx.font = '12px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(touchEnabled ? 'tap a card to install it' : '1-9 pick · R reroll · B banish · S skip', W / 2, rowY + 52);
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
