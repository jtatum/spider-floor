// THE SPIDER FLOOR — procedural audio
// (loaded as an ordered classic script; all files share one global scope)

// ════════════════════════════════════════════════════════════ AUDIO
// Tiny procedural synth — no asset files. Created lazily on first input.

// Buffer position of a looping source at time `now`, given when it started
// (sAt) and the buffer offset it started at (sOff). Pure math, so it's unit-
// tested: it's what lets a resume-capable track pick up where it left off
// after a brief detour (level-up / spider floor) instead of restarting.
function musicPosOf(cfg, sAt, sOff, now) {
  const loopLen = cfg.loopEnd - cfg.loopStart;
  let p = sOff + (now - sAt);
  if (loopLen > 0 && p >= cfg.loopEnd) p = cfg.loopStart + ((p - cfg.loopEnd) % loopLen);
  return p;
}

const sfx = (() => {
  let ac = null, master = null, muted = false;
  let mOsc = null, mGain = null;          // the motor: a persistent hum that tracks speed
  function ensure() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.32; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function resume() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.32;
  }
  // called every frame with 0..1 = |speed| / maxSpeed (0 when idle/paused/menus)
  function setMotor(level) {
    if (!ac) return;
    if (!mOsc) {
      if (level <= 0.02) return;          // don't build the rig until it's needed
      mOsc = ac.createOscillator(); mGain = ac.createGain();
      mOsc.type = 'triangle'; mOsc.frequency.value = 36;
      mGain.gain.value = 0;
      mOsc.connect(mGain); mGain.connect(master);
      mOsc.start();
    }
    const t = ac.currentTime;
    mGain.gain.setTargetAtTime(Math.min(1, level) * 0.17, t, 0.07);
    mOsc.frequency.setTargetAtTime(34 + level * 62, t, 0.07);
  }

  // ── music: decoded tracks that loop a region seamlessly (loopStart→loopEnd) ──
  // Files are dual-encoded (Ogg Opus + AAC/m4a); we fetch whichever the browser
  // can decode. Routed through a dedicated gain so we can fade in/out without a
  // hard cut, and through master so Mute covers it too.
  const MUSIC = {
    title:    { base: 'audio/title',    loopStart: 23.810, loopEnd: 95.245,  gain: 0.5 },
    gameplay: { base: 'audio/gameplay', loopStart: 10.719, loopEnd: 127.492, gain: 0.42, resume: true },
    levelup:  { base: 'audio/levelup',  loopStart: 12.350, loopEnd: 60.390,  gain: 0.5 },
    shop:     { base: 'audio/shop',     loopStart: 20.299, loopEnd: 87.609,  gain: 0.5 },
    fired:    { base: 'audio/fired',    loopStart: 32.924, loopEnd: 90.831,  gain: 0.5 },
  };
  let musicGain = null, musicSrc = null, musicCur = null, musicReq = null;
  // for resume-capable tracks (gameplay): remember where we left off so a brief
  // level-up detour doesn't restart the bed from its intro every time.
  let playName = null, playCfg = null, startedAt = 0, startOffset = 0;
  const resumeStore = {};
  const bufCache = {};
  const posOf = musicPosOf;

  function pickUrl(base) {
    // choose by what this browser will actually decode (Opus is smaller/cleaner)
    let probe = null;
    try { probe = typeof Audio !== 'undefined' ? new Audio() : null; } catch (e) {}
    const can = (t) => probe && probe.canPlayType && probe.canPlayType(t) !== '';
    if (can('audio/ogg; codecs="opus"')) return base + '.opus';
    if (can('audio/mp4; codecs="mp4a.40.2"') || can('audio/aac')) return base + '.m4a';
    return base + '.opus';   // a sensible default; decode may still succeed
  }
  async function load(name) {
    if (bufCache[name]) return bufCache[name];
    const url = pickUrl(MUSIC[name].base);
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    const buf = await ac.decodeAudioData(data);
    bufCache[name] = buf;
    return buf;
  }
  function stopMusicSrc(fade = 0.5) {
    if (!musicSrc || !ac) return;
    const t = ac.currentTime, src = musicSrc;
    if (playCfg && playCfg.resume && playName) {   // bank our spot so we can resume it
      resumeStore[playName] = posOf(playCfg, startedAt, startOffset, t);
    }
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.0001, t + fade);
    try { src.stop(t + fade + 0.05); } catch (e) {}
    musicSrc = null; playCfg = null; playName = null;
  }
  // idempotent: pass a track name to ensure it's playing, or null to stop.
  // Called every frame by the main loop, so it doubles as the retry that starts
  // the music the instant the audio context unlocks.
  function music(name) {
    musicReq = name;
    if (!name) { musicCur = null; stopMusicSrc(); return; }
    ensure();
    // Browsers block audio until a user gesture; the context starts 'suspended'.
    // Don't build into a suspended context (it can resume muted or mid-fade) —
    // wait until it's actually running, then start cleanly from the top. Because
    // we only commit musicCur once running, the loop keeps retrying until unlock.
    if (!ac || ac.state !== 'running') return;
    if (name === musicCur) return;       // already playing/queued the right track
    musicCur = name;
    if (!musicGain) { musicGain = ac.createGain(); musicGain.gain.value = 0; musicGain.connect(master); }
    const cfg = MUSIC[name];
    load(name).then(buf => {
      if (musicReq !== name) return;     // the screen changed while we were decoding
      stopMusicSrc(0.08);
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = cfg.loopStart;
      src.loopEnd = Math.min(cfg.loopEnd, buf.duration);
      src.connect(musicGain);
      const t = ac.currentTime;
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(0.0001, t);
      musicGain.gain.linearRampToValueAtTime(cfg.gain, t + 0.4);   // gentle fade-in
      const offset = (cfg.resume && resumeStore[name] != null) ? resumeStore[name] : 0;
      src.start(0, offset);
      musicSrc = src;
      playCfg = cfg; playName = name; startedAt = t; startOffset = offset;
    }).catch(() => {});                  // a missing/undecodable file just stays silent
  }

  function tone(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
    if (!ac || muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  return {
    resume, setMuted, setMotor, music,
    creak() { tone(170 + Math.random() * 70, 0.13, 'sawtooth', 0.12, 65 + Math.random() * 20); },
    ding()  { tone(880, 0.12, 'sine', 0.5); tone(1320, 0.16, 'sine', 0.3); },
    near()  { tone(1040, 0.05, 'sine', 0.25); },
    board() { tone(440, 0.07, 'square', 0.35, 560); },
    chime() { tone(660, 0.09, 'sine', 0.5); tone(990, 0.14, 'sine', 0.4, 1180); },
    door()  { tone(160, 0.18, 'sawtooth', 0.25, 120); },
    thud()  { tone(90, 0.14, 'sine', 0.6, 60); },
    buzz()  { tone(140, 0.22, 'sawtooth', 0.45, 80); },
    buy()   { tone(523, 0.08, 'square', 0.4); tone(784, 0.12, 'square', 0.4); },
    power() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.4), i * 55)); },
    achieve(){ [784, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'triangle', 0.4), i * 80)); },
    spider(){ tone(120, 0.6, 'sawtooth', 0.3, 88); tone(123.5, 0.6, 'sawtooth', 0.22, 90); },
    sword() { tone(640, 0.09, 'triangle', 0.3, 1100); },
    slash() { tone(900, 0.07, 'square', 0.4, 300); tone(300, 0.08, 'sawtooth', 0.3, 160); },
    hurt()  { tone(200, 0.16, 'sawtooth', 0.5, 90); },
    caught(){ [600, 480, 360, 250, 170].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sawtooth', 0.45), i * 70)); },
    fanfare(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'square', 0.4), i * 90)); },
    fired() { [330, 294, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.4), i * 160)); },
    intro() { tone(392, 0.16, 'sine', 0.3); setTimeout(() => tone(587, 0.2, 'sine', 0.3), 130); },
    tip()   { tone(784, 0.07, 'sine', 0.5); tone(1175, 0.12, 'sine', 0.4, 1320); },
  };
})();

sfx.setMuted(save.muted);   // honour the saved preference from the first note

