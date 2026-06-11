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

## The Spider Floor v2: the webbed office (isometric maze)

The redesign (James's pitch): an isometric office-floor maze — webbed cubicles,
generated fresh each visit. VS-style swarm you dodge and carve through with the
manual sword. You enter by lift; the door seals behind you; the way OUT is a
different lift door somewhere in the maze. Loot deeper = escape-distance owed.

Key decisions (agreed direction):
- LOW cubicle walls — see the swarm over them, path around them. Legible terror.
- Flow-field swarm AI — BFS distance field from the player; spiders descend the
  gradient. Liquid VS swarming around walls, dozens of spiders, headless-testable.
- Braided maze gen — backtracker + ~20% walls knocked out for loops. Dead ends in
  a swarm game are death sentences; loops are decisions.
- AUTO sword, VS-faithful (James's call, the right one): swings on a visible
  cooldown at the NEAREST spider in range — not movement-facing, since you're
  usually running away. The arc CLEAVES everything in the wedge, so herding the
  flow-field until spiders bunch into one swing is the whole skill. Movement is
  the only verb → spider floor needs zero buttons on mobile (stick only).
- Screen-relative movement over the iso projection. Nobody thinks in diamonds.
- Limited vision in the dark → X-RAY power-up doubles as a map reveal.
- Exit door uses the same green glow + arrow language as the main game.

Build plan (~3 sessions, each shippable; the ledge stays until the maze lands whole):
- [ ] Session 1: maze gen + connectivity tests, iso renderer, camera, 2D movement
- [ ] Session 2: flow-field swarm, sword combat, cocoons/loot, exit + banking
- [ ] Session 3: spitters, visit escalation (visit 3 = the open ceiling + THE
      THREAD → unlocks the roof), mobile virtual joystick (shared with mobile todo),
      balance + heat-5 hook

Still applies from v1 thinking:
- [ ] **Pre-opening rumble** — ~8s of dust + low noise before the floor opens, so
      missing the window is a choice, not a dice roll.
- [ ] (Deliberately NOT adding spider-floor-only upgrades to the level-up pool —
      dead cards 90% of a shift.)

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
