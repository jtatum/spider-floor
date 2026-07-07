// THE SPIDER FLOOR — rendering
// (loaded as an ordered classic script; all files share one global scope)

// ════════════════════════════════════════════════════════════ RENDER

const SHAFT_LEFT = 230;
const SHAFT_RIGHT = 480;
const ROOM_LEFT = SHAFT_RIGHT;
const ROOM_RIGHT = 870;
const CENTER_Y = H / 2 + 10;

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
    ctx.fillStyle = '#5a523e'; ctx.font = '11px ui-monospace';
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
  ctx.fillStyle = '#7a6a4a'; ctx.font = '13px ui-monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(touchEnabled ? (inRun ? 'tap RESUME to keep working' : 'tap BACK when you\'re done')
                            : (inRun ? 'P or ESC to resume  ·  M mute' : 'ESC back  ·  M mute'), W / 2, by + 14);
}

// in-run: the pause modal over the frozen game
function drawPaused() {
  ctx.fillStyle = 'rgba(8,6,4,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 40px ui-monospace';
  ctx.fillText(cyr('PAUSED'), W / 2, 156);
  drawSettingsRows(true);
}

// from the title: same panel, no run to resume or abandon
function drawSettingsMenu() {
  ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#bfa45f'; ctx.font = 'bold 40px ui-monospace';
  ctx.fillText(cyr('SETTINGS'), W / 2, 156);
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
  ctx.fillText(cyr(`SHIFT ${run.shiftNum}`), W / 2, H / 2 - 58);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  const ms = maxStrikes();
  ctx.fillText(`deliver ${game.quota} before ${['zero','one','two','three','four','five','six'][ms] || ms} walk-offs`, W / 2, H / 2 - 24);

  if (run.heat > 0) {
    ctx.fillStyle = '#ff7a3a'; ctx.font = 'bold 13px ui-monospace';
    ctx.fillText(`HEAT ${run.heat} — ${HEAT.slice(0, run.heat).map(h => h.name).join(' · ')}`, W / 2, H / 2 + 96);
  }
  if (game.modifiers.length === 0) {
    ctx.fillStyle = '#6a7a5a'; ctx.font = 'italic 15px ui-monospace';
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

  // whoever is waiting on THIS floor queues by the lift door
  const waiting = game.passengers.filter(p => p.state === 'waiting' && p.origin === idx);
  let px = ROOM_LEFT + 96;
  for (const p of waiting) {
    p.tx = px;
    p.x = p.x ? p.x + (p.tx - p.x) * 0.2 : p.tx;
    drawPassenger(p, p.x, bot - 8, 'waiting');
    px += 52;
    if (px > ROOM_RIGHT - 24) break;
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

  // CABIN FULL flag — so it's obvious why this floor keeps piling up
  if (usedSlots >= cap) {
    const here = nearestFloorIdx(game.elev.y);
    const waiting = game.passengers.some(s => s.state === 'waiting' && s.origin === here);
    if (waiting) {
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
  // the readiness dot is ~1.6 physical px on a phone; when the landing is good,
  // the whole car says so — stopping level is the game's core skill, it
  // deserves feedback legible at any scale
  if (ok) { ctx.save(); ctx.shadowColor = '#7aaa55'; ctx.shadowBlur = 12; ctx.strokeStyle = '#8fca6a'; }
  else ctx.strokeStyle = '#bfa45f';
  ctx.lineWidth = 2;
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
  if (mode === 'waiting') { txt = p.origin > 0 ? '↓' + destLabel : destLabel; }
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

  // the boarding SHOUT — a real speech bubble, impossible to miss
  if (mode === 'riding' && p.shoutT > 0) {
    const a = Math.min(1, p.shoutT / 0.35);              // fade out at the end
    const pop = 1 + Math.max(0, (p.shoutT - 1.25) * 2.4); // a brief pop on arrival
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, fy - 88);
    ctx.scale(pop, pop);
    const txt = `${destLabel}!`;
    ctx.font = 'bold 14px ui-monospace';
    const bw = ctx.measureText(txt).width + 16;
    ctx.fillStyle = '#f2e8cf';
    ctx.fillRect(-bw / 2, -11, bw, 22);
    ctx.beginPath();                                      // the tail, toward their head
    ctx.moveTo(-5, 11); ctx.lineTo(5, 11); ctx.lineTo(-1, 19);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1.5;
    ctx.strokeRect(-bw / 2, -11, bw, 22);
    ctx.fillStyle = '#1a1410';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 0, 1);
    ctx.restore();
  }
}

function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(13,10,8,0.85)';
  ctx.fillRect(0, 0, W, 36);
  ctx.font = 'bold 14px ui-monospace'; ctx.textBaseline = 'middle';

  ctx.textAlign = 'left'; ctx.fillStyle = '#bfa45f';
  ctx.fillText(`SHIFT ${run.shiftNum}`, 16, 18);
  ctx.fillStyle = '#caa33a'; ctx.fillText(`LV ${run.level + 1}`, 100, 18);
  let hudX = 158;
  if (run.heat > 0) { ctx.fillStyle = '#ff7a3a'; ctx.fillText(`H${run.heat}`, hudX, 18); hudX += 42; }
  ctx.fillStyle = '#bfa45f'; ctx.fillText(`◆ ${run.parts}`, hudX, 18);
  if (run.fuses > 0) { ctx.fillStyle = '#d4a050'; ctx.fillText(`FUSE ${run.fuses}`, hudX + 68, 18); }

  // quota progress
  ctx.textAlign = 'center';
  ctx.fillStyle = '#bfa45f';
  ctx.fillText(`DELIVERED ${game.delivered} / ${game.quota}`, W / 2, 18);

  ctx.textAlign = 'right';
  const remaining = maxStrikes() - game.strikes;
  const dots = '●'.repeat(Math.max(0, remaining)) + '○'.repeat(game.strikes);
  ctx.fillStyle = remaining <= 1 ? '#aa3a32' : '#bfa45f';
  ctx.fillText(dots, W - 16, 18);

  // XP strip — the level-up heartbeat, right under the top bar
  ctx.fillStyle = '#241a10'; ctx.fillRect(0, 36, W, 4);
  ctx.fillStyle = '#caa33a'; ctx.fillRect(0, 36, W * Math.min(1, run.xp / run.xpNext), 4);

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
  ctx.font = 'bold 20px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

function drawTitle() {
  drawTitleArt();
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px ui-monospace, Menlo, monospace';
  ctx.fillText(cyr('THE SPIDER FLOOR'), W / 2, 162);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  ctx.fillText("operating the people's worst elevator", W / 2, 194);

  ctx.fillStyle = '#bfa45f'; ctx.font = '15px ui-monospace';
  const lines = [
    touchEnabled ? '▲ / ▼     crank the car up and down' : '↑ / ↓     crank the car up and down',
    touchEnabled ? 'DOORS     open / close when stopped' : 'SPACE     open / close the doors',
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

  drawButton('CLOCK IN  ▸', W / 2 - 290, H - 128, 200, 46,
             () => { openOperatorSelect(); }, true);
  drawButton(`WORKSHOP ★${save.stars}`, W / 2 - 78, H - 128, 184, 46,
             () => { menu = 'WORKSHOP'; }, false);
  const got = ACHIEVEMENTS.filter(a => save.ach[a.key]).length;
  drawButton(`ACHIEVEMENTS ${got}/${ACHIEVEMENTS.length}`, W / 2 + 118, H - 128, 184, 46,
             () => { menu = 'ACH'; }, false);
  drawButton('⚙', W / 2 + 310, H - 128, 46, 46, () => { menu = 'SETTINGS'; }, false);
  ctx.fillStyle = '#7a6a4a'; ctx.font = '11px ui-monospace'; ctx.textAlign = 'center';
  ctx.fillText(touchEnabled
    ? `best with the sound on — ⚙ has the sliders    ·    sound ${save.muted ? 'OFF' : 'on'}`
    : `SPACE clock in    ·    W workshop    ·    A achievements    ·    S settings    ·    M sound ${save.muted ? 'OFF' : 'on'}`, W / 2, H - 64);
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
  ctx.fillStyle = '#7a6a4a'; ctx.font = '13px ui-monospace';
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
  ctx.fillStyle = '#7a6a4a'; ctx.font = '14px ui-monospace';
  ctx.fillText(`best: ${save.best.shifts} shifts  ·  ${save.best.delivered} deliveries`, W / 2, H / 2 + 44);
  // the machine you died in, so next career starts with a plan instead of vibes
  const owned = UPGRADES.filter(u => run.up[u.key] > 0)
    .map(u => run.up[u.key] > 1 ? `${u.name} ${run.up[u.key]}` : u.name);
  ctx.fillStyle = '#5a523e'; ctx.font = '12px ui-monospace';
  ctx.fillText(owned.length ? `the machine: ${owned.join(' · ')}` : 'the machine: bone stock — maybe that was the problem',
               W / 2, H / 2 + 150);
  drawButton('SPEND ★ IN WORKSHOP', W / 2 - 240, H / 2 + 80, 226, 46, () => { menu = 'WORKSHOP'; }, false);
  drawButton('CLOCK IN AGAIN', W / 2 + 14, H / 2 + 80, 226, 46, () => { menu = null; game.state = 'TITLE'; }, true);
}

// ── operator select: who's on the crank this run ──
function drawOperatorSelect() {
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#bfa45f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 32px ui-monospace';
  ctx.fillText(cyr("WHO'S ON THE CRANK?"), W / 2, 50);
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#7a6a4a';
  ctx.fillText('every operator works the same lift — the bureau merely files the complaints', W / 2, 78);

  const cardW = 560, cardH = 84, gapY = 11;
  const x0 = (W - cardW) / 2, y0 = 100;
  OPERATORS.forEach((o, i) => {
    const cy = y0 + i * (cardH + gapY);
    const unlocked = isOpUnlocked(o);
    const isLast = o.key === (save.lastOperator || 'sal');

    ctx.fillStyle = unlocked ? '#1a130d' : '#100d0a';
    ctx.fillRect(x0, cy, cardW, cardH);
    ctx.strokeStyle = !unlocked ? '#2a2218' : isLast ? '#ffd44a' : '#bfa45f';
    ctx.lineWidth = isLast && unlocked ? 2.5 : 2;
    ctx.strokeRect(x0, cy, cardW, cardH);

    if (unlocked) {
      ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 16px ui-monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${i + 1}`, x0 + 14, cy + 10);
      ctx.fillStyle = '#e8dcc0'; ctx.font = 'bold 16px ui-monospace';
      ctx.fillText(`${o.name} — ${o.epithet}`, x0 + 36, cy + 9);
      ctx.fillStyle = '#7a6a4a'; ctx.font = 'italic 11px ui-monospace';
      ctx.fillText(o.blurb, x0 + 36, cy + 29);
      ctx.fillStyle = '#7adf9a'; ctx.font = touchEnabled ? '13px ui-monospace' : '12px ui-monospace';
      ctx.fillText(`+ ${o.buff}`, x0 + 36, cy + 48);
      ctx.fillStyle = '#e0584a';
      ctx.fillText(`− ${o.penalty}`, x0 + 36, cy + 65);
      if (isLast) {
        ctx.fillStyle = '#ffd44a'; ctx.font = 'bold 10px ui-monospace'; ctx.textAlign = 'right';
        ctx.fillText('LAST SHIFT ▸ SPACE', x0 + cardW - 12, cy + 10);
      }
      buttons.push({ x: x0, y: cy, w: cardW, h: cardH, fn: () => startWithOperator(o.key) });
    } else {
      ctx.fillStyle = '#4a3e2c'; ctx.font = 'bold 16px ui-monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`${o.name} — ${o.epithet}`, x0 + 36, cy + 9);
      ctx.fillStyle = '#3a3226'; ctx.font = '12px ui-monospace';
      ctx.fillText('🔒 punches in once you…', x0 + 36, cy + 40);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillText(o.unlockHint, x0 + 36, cy + 58);
    }
  });

  // ── the heat dial — only once the cord has been cut ──
  if (maxHeatUnlocked() > 0) {
    const hy = 592;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let hx = x0;
    ctx.font = 'bold 13px ui-monospace';
    ctx.fillStyle = menuHeat > 0 ? '#ff7a3a' : '#6a5a4a';
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
    ctx.font = '11px ui-monospace'; ctx.fillStyle = '#9a7a5a';
    const desc = menuHeat === 0 ? 'a normal career — press H to turn up the heat'
      : HEAT.slice(0, menuHeat).map(h => h.name).join(' · ');
    ctx.fillText(desc, hx, hy);
    // a generous hit strip: the old 24px row was ~10 CSS px on a phone — the
    // whole post-victory ladder was effectively locked for touch players
    buttons.push({ x: x0 - 4, y: hy - 24, w: cardW + 8, h: 48, fn: cycleHeat });
  }

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7a6a4a'; ctx.font = '12px ui-monospace';
  ctx.fillText(touchEnabled
    ? `tap an operator to clock in${maxHeatUnlocked() > 0 ? ' · tap the flames for heat' : ''}`
    : `1-5 pick · SPACE clock in with your last crew${maxHeatUnlocked() > 0 ? ' · H heat' : ''} · ESC back`, W / 2, H - 70);
  drawButton('◂  BACK', W / 2 - 110, H - 54, 220, 36, () => { menu = null; }, false);
}

// ── the Workshop: permanent cross-run perks bought with ★ stars ──
function drawWorkshop() {
  ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b9c4e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px ui-monospace';
  ctx.fillText(cyr('THE WORKSHOP'), W / 2, 54);
  ctx.font = '14px ui-monospace'; ctx.fillStyle = '#6a6a82';
  ctx.fillText('permanent perks between jobs — sanctioned by the housing committee', W / 2, 82);
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
    const hotkey = i < 9 ? `${i + 1}` : i === 9 ? '0' : null;
    if (hotkey) ctx.fillText(hotkey, cx + 9, cy + 9);
    ctx.fillStyle = '#b9c4e0'; ctx.font = 'bold 14px ui-monospace';
    ctx.fillText(m.name, cx + (hotkey ? 24 : 9), cy + 8);

    for (let l = 0; l < m.max; l++) {
      ctx.fillStyle = l < lvl ? '#7aaa55' : '#2a2c38';
      ctx.fillRect(cx + cardW - 12 - (m.max - l) * 11, cy + 9, 8, 6);
    }

    ctx.fillStyle = '#8a8aa2'; ctx.font = touchEnabled ? '12px ui-monospace' : '10.5px ui-monospace';
    wrapText(m.blurb[Math.min(lvl, m.blurb.length - 1)], cx + 10, cy + 28, cardW - 20, touchEnabled ? 13.5 : 12);

    ctx.font = 'bold 13px ui-monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    if (maxed) { ctx.fillStyle = '#7aaa55'; ctx.fillText('MAXED', cx + cardW - 10, cy + cardH - 8); }
    else { ctx.fillStyle = afford ? '#ffd44a' : '#6a6a4a'; ctx.fillText(`★ ${cost}`, cx + cardW - 10, cy + cardH - 8); }

    if (!maxed) buttons.push({ x: cx, y: cy, w: cardW, h: cardH, fn: () => buyMeta(m) });
  });

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6a6a82'; ctx.font = '12px ui-monospace';
  ctx.fillText(touchEnabled
    ? 'tap a perk to buy it  ·  perks apply NEXT run'
    : 'click a perk (or press 1–9, 0)  ·  A: achievements  ·  perks apply NEXT run', W / 2, H - 88);
  drawButton('★  ACHIEVEMENTS', W / 2 - 230, H - 68, 220, 44, () => { menu = 'ACH'; }, false);
  drawButton('◂  BACK', W / 2 + 10, H - 68, 220, 44, () => { menu = null; }, true);
}

// ── the achievements screen (the source of all ★) ──
function drawAchievements() {
  ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd44a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px ui-monospace';
  ctx.fillText(cyr('ACHIEVEMENTS'), W / 2, 40);
  const unlocked = ACHIEVEMENTS.filter(a => save.ach[a.key]).length;
  const earned = ACHIEVEMENTS.filter(a => save.ach[a.key]).reduce((s, a) => s + a.award, 0);
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#8a8aa2';
  ctx.fillText(`${unlocked} / ${ACHIEVEMENTS.length} unlocked  ·  ★ ${earned} of ${ACH_TOTAL} earned  ·  spend in the Workshop`, W / 2, 66);

  const cols = 5, cardW = 170, cardH = 56, gapX = 6, gapY = 7;   // 5 columns: 37 cards must fit above the BACK button
  const totalW = cols * cardW + (cols - 1) * gapX;
  const x0 = (W - totalW) / 2, y0 = 88;
  ACHIEVEMENTS.forEach((a, i) => {
    const cx = x0 + (i % cols) * (cardW + gapX);
    const cy = y0 + Math.floor(i / cols) * (cardH + gapY);
    const got = !!save.ach[a.key];
    ctx.fillStyle = got ? '#1c1808' : '#111016'; ctx.fillRect(cx, cy, cardW, cardH);
    ctx.strokeStyle = got ? '#ffd44a' : '#26283a'; ctx.lineWidth = got ? 2 : 1; ctx.strokeRect(cx, cy, cardW, cardH);
    ctx.fillStyle = got ? '#ffe27a' : '#5a5a6a';
    ctx.font = 'bold 12px ui-monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText((got ? '✓ ' : '') + a.name, cx + 9, cy + 7);
    ctx.fillStyle = got ? '#9a8a64' : '#4a4a58'; ctx.font = '9.5px ui-monospace';
    wrapText(a.desc, cx + 9, cy + 24, cardW - 40, 11);
    ctx.fillStyle = got ? '#7adf9a' : '#5a5a4a'; ctx.font = 'bold 12px ui-monospace';
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
  ctx.font = '13px ui-monospace'; ctx.fillStyle = '#7a6a4a';
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
    ctx.fillStyle = '#7a6a4a'; ctx.font = '11px ui-monospace';
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
    ctx.fillStyle = '#9a8a64'; ctx.font = touchEnabled ? '12.5px ui-monospace' : '11px ui-monospace';
    wrapText(it.blurb, ix + 10, shelfY + 26, itemW - 20, touchEnabled ? 14 : 13);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = 'bold 13px ui-monospace';
    if (it.bought) { ctx.fillStyle = '#7aaa55'; ctx.fillText('SOLD', ix + itemW - 10, shelfY + itemH - 8); }
    else { ctx.fillStyle = afford ? '#d4a050' : '#7a5a3a'; ctx.fillText(`◆ ${it.cost}`, ix + itemW - 10, shelfY + itemH - 8); }
    if (!it.bought) buttons.push({ x: ix, y: shelfY, w: itemW, h: itemH, fn: it.fn });
  });
  const rrSpent = shop.paidRerolls >= PAID_REROLLS_PER_VISIT;
  drawButton(rrSpent ? '↻ RESTOCK  (used)' : `↻ RESTOCK SHELF  (◆${REROLL_COST})`,
             W / 2 - 130, shelfY + itemH + 12, 260, 32, rerollShop, false);

  // ── your build so far: fittings and habits, with levels ──
  const by = shelfY + itemH + 64;
  drawBuildPanel(x0, by, totalW);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7a6a4a'; ctx.font = '12px ui-monospace';
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
  const owned = UPGRADES.filter(u => u.kind === kind && run.up[u.key] > 0);
  let cy = y + 2;
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

  ctx.fillStyle = '#7a6a4a'; ctx.font = '12px ui-monospace';
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

