# TODO

The working list. Roughly ordered within each section; strike things as they land.

## Next up

- [ ] **Mobile: boss-fight touch buttons** — `updateTouchUI` has no BOSS branch, so the
      ending is unplayable on a phone. Needs ▲/▼ (crank) at minimum.
- [ ] **Settings/pause modal** — one modal for: resume · music volume · SFX volume
      (separate gain nodes already exist) · screen-shake toggle · abandon run (the
      touch answer to hold-R) · quit to title. Opened by P/ESC and a small ⏸ corner
      button (which also gives touch a pause). Replaces the bare PAUSED overlay.
- [ ] **Mobile: odds and ends** — bigger tap targets on workshop/achievement cards;
      mute reachable by touch (lives in the modal).

## The Spider Floor (making the namesake earn its title)

- [ ] **Visit escalation per career** — visit 1: the ledge as-is. Visit 2+: cocoons
      on the ledge to slash open (◆ / Spare Fuse / power-up) — spatial greed beyond
      kill-farming. Visit 3: the room is deeper and you SEE THE THREAD going up —
      that moment is what unlocks the roof (same gate, real fiction).
- [ ] **The floor moves** — sometimes opens *between* floors (a webbed gap at 4½
      that shouldn't exist), not always below the lobby. Variable detour cost.
- [ ] **Pre-opening rumble** — ~8s of dust + low noise before the banner, so missing
      the window is a choice, not a dice roll.
- [ ] **One new enemy: the spitter** — lobs a web glob; dodge or be rooted a beat.
      Later visits only. (Deliberately NOT adding spider-floor-only upgrades to the
      level-up pool — dead cards 90% of a shift.)

## Later

- [ ] **Balance playtest pass (human hands)** — XP curve (`xpBase`/`xpGrowth`),
      down-spawn cadence (×2.6), heat rung tuning, late-shift quota slog
      (`6 + n*2.2` vs. patience squeeze — shift 10 may be a grind, not a crescendo).
- [ ] **Daily seeded run** — needs a seeded RNG plumbed through `shuffle`/spawns;
      shareable "today's building" + local best. The web build's retention hook.
- [ ] **Victory-song subtitles** — the lyrics deserve timed captions; build the
      track-studio page (loop-point finder + lyric timing) as the tool for it.
- [ ] **Run summary screen** — what you built, what killed you, fares/XP graph.
- [ ] **More building events** — flooded floor, stuck celebrity, rival operator…
      the Spider Floor taught players to expect a haunted building; deliver a
      second ghost.
