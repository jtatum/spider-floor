// THE SPIDER FLOOR — procedural audio
// (loaded as an ordered classic script; all files share one global scope)

// ════════════════════════════════════════════════════════════ AUDIO
// Tiny procedural synth — no asset files. Created lazily on first input.

const sfx = (() => {
  let ac = null, master = null;
  function ensure() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.32; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function resume() { ensure(); if (ac && ac.state === 'suspended') ac.resume(); }
  function tone(freq, dur, type = 'square', vol = 0.5, slideTo = null) {
    if (!ac) return;
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
    resume,
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

