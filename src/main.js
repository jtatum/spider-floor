// THE SPIDER FLOOR — loop, fit, touch controls
// (loaded as an ordered classic script; all files share one global scope)

// ════════════════════════════════════════════════════════════ LOOP

// which track plays on which screen (null/absent = silence)
const MUSIC_BY_SCREEN = {
  TITLE: 'title', OPERATOR: 'title', WORKSHOP: 'title', ACH: 'title', SETTINGS: 'title',   // title theme covers the menu cluster
  PLAYING: 'gameplay',                        // resumes across level-up detours (see audio.js)
  LEVELUP: 'levelup', SHIFT_DONE: 'shop', SHOP: 'shop', MAZE: 'spider', BOSS: 'boss', FIRED: 'fired',
  VICTORY: 'victory',                         // the win song plays once, then hands off (see audio.js)
};

// when does the music come out of the one sad cone above the doors?
function wantsTinny(st, r) {
  return st === 'LEVELUP' || (st === 'PLAYING' && !!(r && r.up && r.up.muzak > 0));
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  render();
  // the motor hums with the car's speed — silent in menus and while paused,
  // and each Rebuilt Motor level makes the hum deeper and calmer
  const motorLevel = (!paused && game && game.state === 'PLAYING' && !menu)
    ? Math.abs(game.elev.v) / game.m.maxSpeed : 0;
  sfx.setMotor(motorLevel, (typeof run !== 'undefined' && run && run.up) ? (run.up.motor || 0) : 0);
  // music follows the screen: the level-up jingle while you pick, and the shop
  // theme across the survived/parts-shop flow (same track → no restart between them)
  const st = menu || (game ? game.state : 'TITLE');
  sfx.music(MUSIC_BY_SCREEN[st] || null);
  // …and sometimes through the cabin speaker: level-ups always (you ARE in the
  // lift), and with Cabin Muzak installed the gameplay bed turns diegetic —
  // the upgrade soothes the riders by making the soundtrack elevator music.
  sfx.setTinny(wantsTinny(st, typeof run !== 'undefined' ? run : null));
  updateHint();
  if (touchEnabled) updateTouchUI();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Browsers block audio until the first user gesture. Unlock on the FIRST
// interaction ANYWHERE on the page (not just a canvas click or key) so the
// title music starts the moment the player touches anything; the rAF loop is
// already calling sfx.music('title'), so it begins as soon as the context runs.
const unlockAudio = () => {
  sfx.resume();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlockAudio);
};
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlockAudio);

// Once the page is fully loaded, warm the rest of the soundtrack's bytes into
// cache on idle so no screen starts silent waiting on a fetch (see prefetchAll).
if (document.readyState === 'complete') sfx.prefetchAll();
else window.addEventListener('load', () => sfx.prefetchAll(), { once: true });

// tab away mid-shift → the building waits for you
window.addEventListener('blur', () => {
  if (!menu && game && (game.state === 'PLAYING' || game.state === 'BOSS' || game.state === 'MAZE')) {
    setPaused(true);
  }
  // the browser never delivers keyup for keys held across a tab switch — clear
  // them or the car cranks itself on resume (touch re-asserts every frame, safe)
  keys.clear();
  sfx.setMotor(0);   // rAF stops in hidden tabs; don't leave the hum droning
});

// the hint line under the canvas follows the current screen
const hintEl = document.getElementById('hint');
let lastHint = '';
const HINTS = {
  PAUSED:   'PAUSED · tap or click an option · P resume',
  TITLE:    'SPACE clock in · W workshop · A achievements · M sound',
  PLAYING:  '↑/↓ crank · SPACE doors · P pause · hold R abandon run',
  MAZE:     'arrows walk the corridors · the sword swings itself · find the other lift',
  BOSS:     '↑/↓ crank · ram it when it drops · dodge the red',
  SHOP:     'F fuse · Z/X specials · R restock · ENTER start',
  LEVELUP:  '1-9 pick · R reroll · B banish · S skip (+2◆)',
  WORKSHOP: '1-9/0 buy a perk · A achievements · ESC back',
  OPERATOR: '1-5 pick an operator · SPACE last crew · H heat · ESC back',
  SETTINGS: 'drag the sliders · ESC back',
  ACH:      'ESC back',
  SHIFT_DONE: 'SPACE shop',
  FIRED:    'SPACE clock in again · W workshop',
  VICTORY:  'SPACE clock out',
};
// thumbs get their own dialect — no SPACE, no letter keys, nothing to hold
const HINTS_TOUCH = {
  PAUSED:   'PAUSED · tap an option to continue',
  TITLE:    'tap CLOCK IN to start',
  PLAYING:  '▲▼ crank · DOORS when level · ❚❚ pause',
  MAZE:     'drag to walk · the sword swings itself',
  BOSS:     '▲ ram it when it drops · ▼ retreat · dodge the red',
  SHOP:     'tap the shelf · START SHIFT when ready',
  LEVELUP:  'tap a card to install it',
  WORKSHOP: 'tap a perk to buy it',
  OPERATOR: 'tap an operator to clock in',
  SETTINGS: 'drag the sliders',
  ACH:      'tap BACK',
  SHIFT_DONE: 'tap an option',
  FIRED:    'tap to clock in again',
  VICTORY:  'tap CLOCK OUT',
};
function updateHint() {
  if (!hintEl) return;
  const st = paused ? 'PAUSED' : (menu || (game ? game.state : 'TITLE'));
  const table = touchEnabled ? HINTS_TOUCH : HINTS;
  const text = table[st] || table.TITLE;
  if (text !== lastHint) { lastHint = text; hintEl.textContent = text; }
}

// fit canvas to viewport while keeping internal resolution
function fit() {
  const pad = 16;
  // budget for the frame's chrome (10px gap + hint line + canvas border) so a
  // height-constrained layout (landscape phones) never overflows the viewport —
  // overflow made the page scrollable, which let the browser steal stick drags
  const chrome = 30;
  const sw = (window.innerWidth - pad) / W;
  const shh = (window.innerHeight - pad - chrome) / H;
  const s = Math.min(sw, shh, 1.4);
  canvas.style.width = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
}
window.addEventListener('resize', fit);
fit();

// ──────────────────────────────────────────────── touch controls (phones)
// On-screen buttons that feed the same `keys` set / handleKey the keyboard does,
// so all game logic is reused. Bindings swap by game state (lift vs. spider).
let touchEnabled = false;
const touchEls = {};
function setupTouch() {
  const wrap = document.createElement('div'); wrap.id = 'touch';
  const mk = (id, cls) => { const b = document.createElement('div'); b.className = 'tbtn ' + cls; b.id = id; wrap.appendChild(b); return b; };
  touchEls.L = mk('tL', 'tL'); touchEls.R = mk('tR', 'tR');
  touchEls.A = mk('tA', 'tA'); touchEls.B = mk('tB', 'tB');
  document.body.appendChild(wrap);
  for (const el of Object.values(touchEls)) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); sfx.resume();
      const key = el.dataset.key; if (!key) return;
      // capture the pointer: a thumb drifting off the button mid-crank must not
      // release the hold (pointerleave used to drop it — brutal while braking)
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      if (el.dataset.mode === 'tap') handleKey(key); else keys.add(key);
      el.classList.add('on');
    });
    const release = e => { if (e) e.preventDefault(); const key = el.dataset.key; if (key) keys.delete(key); el.classList.remove('on'); };
    el.addEventListener('pointerup', release);
    // a pointercancel means the OS claimed the touch (gesture nav, palm) — the
    // hold is dropped through no fault of the thumb, so SAY so with a red flash
    el.addEventListener('pointercancel', e => {
      release(e);
      el.classList.add('lost');
      setTimeout(() => el.classList.remove('lost'), 260);
    });
    el.addEventListener('pointerleave', release);   // belt-and-braces; capture makes this rare
    // iOS synthesizes a double-tap "smart zoom" from rapid taps unless the
    // touch sequence is fully claimed — pointerdown preventDefault isn't enough
    el.addEventListener('touchend', e => e.preventDefault());
  }
}
// Touch buttons feed SYNTHETIC key names ('t-up', not 'arrowup') into the same
// `keys` set the keyboard uses. The sim checks both. This matters: bindings are
// swapped/cleared on state changes and resizes, and when touch shared names
// with the keyboard, that cleanup would silently kill a HELD physical arrow key.
function updateTouchUI() {
  if (!touchEnabled) return;
  const st = menu || (game ? game.state : 'TITLE');
  const set = (el, key, label, mode) => {
    key = key || '';
    if (el.dataset.key && el.dataset.key !== key) { keys.delete(el.dataset.key); el.classList.remove('on'); }
    el.dataset.key = key; el.dataset.mode = mode || 'hold'; el.textContent = label;
    el.style.display = key ? 'flex' : 'none';
  };
  if (st === 'PLAYING') {
    set(touchEls.L, 't-up', '▲', 'hold');
    set(touchEls.R, 't-down', '▼', 'hold');
    set(touchEls.A, ' ', 'DOORS', 'tap');
    set(touchEls.B, '', '');
  } else if (st === 'BOSS') {
    set(touchEls.L, 't-up', '▲', 'hold');
    set(touchEls.R, 't-down', '▼', 'hold');
    set(touchEls.A, '', ''); set(touchEls.B, '', '');
  } else {            // menus/title/shop: tap the canvas directly
    set(touchEls.L, '', ''); set(touchEls.R, '', ''); set(touchEls.A, '', ''); set(touchEls.B, '', '');
  }
}
function refreshTouchEnabled() {
  touchEnabled = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  const wrap = document.getElementById('touch');
  if (wrap) wrap.style.display = touchEnabled ? 'block' : 'none';
  if (!touchEnabled) { for (const el of Object.values(touchEls)) { if (el.dataset.key) keys.delete(el.dataset.key); } }
}
setupTouch();
refreshTouchEnabled();
window.addEventListener('resize', refreshTouchEnabled);

