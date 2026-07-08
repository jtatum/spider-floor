# TODO

The working list. Roughly ordered within each section; strike things as they land.

## Next up

- [x] **Mobile: boss-fight touch buttons** — BOSS now binds ▲/▼ in `updateTouchUI`.
- [x] **Mobile: double-tap zoom on rapid button taps** — `touch-action: manipulation`
      on html/body/canvas + touchend claimed on the buttons.
- [x] **Arrows vs touch stomping** — touch buttons now feed synthetic `t-*` key names;
      rebinding/resize cleanup can no longer kill a held physical arrow key.
- [x] **Settings/pause modal** — resume · music volume · SFX volume (separate buses)
      · screen-shake toggle · abandon run (two-tap confirm; the touch answer to
      hold-R). P/ESC or the ⏸ chip (drawn in PLAYING/SPIDER/BOSS) opens it.
      Settings persist in the save.
- [x] **Mobile: "a hair too hard" — MEASURED and closed.** Headless bot playtests
      (real update() loop, touch-modeled input: 160ms latency, 120ms min-hold):
      lift trips were +27% slower on touch; maze stick at typical 0.85 thumb
      deflection walked 2.89 t/s vs the swarm's 3.3 cap (72% deaths vs kbd 59%).
      Shipped: stick response curve (full speed at 75% deflection — measured
      exact keyboard parity), touch coast drag −0.002 + stop window +5 (measured
      gap 27%→0%). Rejected BY MEASUREMENT: brake boost (made touch WORSE —
      coarser tap quantum), maze spawn thinning (overshot easier than desktop).
- [x] **Mobile: input reliability** — canvas `touch-action:none` +
      `overscroll-behavior:none` (stick drags could pull-to-refresh the run away);
      pointer capture on crank buttons (thumb drift no longer drops a hold, red
      flash when the OS steals one); second finger can't hijack the maze stick;
      44px pause chip + padded hit rects; tap-slop on small canvas buttons;
      content-box tap mapping; ▲ stacked over ▼ (motion axis), DOORS bottom-right;
      safe-area insets; touch-specific hint lines + bigger card text.
- [x] **Mobile: odds and ends** — heat dial got a real hit strip; workshop/levelup/
      shop blurbs render bigger on touch. (Achievement cards stay small — display-only.)

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

Build plan — ALL THREE SESSIONS SHIPPED. The maze IS the Spider Floor now; the
old 1D ledge is deleted. X on the title = dev shortcut straight into a visit.
- [x] Session 1: maze gen + connectivity tests, iso renderer, camera, 2D movement
- [x] Session 2: flow-field swarm, auto-sword cleave, cocoons (◆/heart/fuse + XP),
      exit + banking, OVERWHELMED → strike
- [x] Session 3: spitters + web-root globs (visit 2+), THE THREAD reveal (visit 3+,
      save.stats.sawThread), virtual joystick (stick-only mobile), heat-5 hook,
      X-RAY widens maze vision

Open follow-ups:
- [ ] **Balance the visit curve with human hands** — flood pacing
      (spawnEvery 2.6 − t·0.022, floor 0.55s), sword (range 1.55 / cd 0.55 / wedge),
      cocoon odds (62/23/15), spitter cadence. Tuned by arithmetic so far.
- [x] **Pre-opening rumble** — shipped: ~8s buildup (faint landing glow, low
      rumble tone, tremor ticks) before the floor opens; the building settles
      quietly if the shift is too far gone to open at all.
- [x] **Multi-cleave callout** — ×N CLEAVE +◆ for 3+ kills in one swing; the
      herding skill is now named and paid.
- [ ] Consider: gate the roof on sawThread instead of spiderVisits ≥ 1 (the fiction
      wants it; the pacing implications need James's playtest verdict).
- [ ] (Deliberately NOT adding spider-floor-only upgrades to the level-up pool —
      dead cards 90% of a shift.)
- [ ] **AUDIT FINDING, half settled: the Spider Floor was strictly dominant.**
      The June 11 balance merge already took the economy half (kills pay 1◆ not
      2, payday moved into cocoons, spider XP 6→4). STILL OPEN: update() freezes
      ALL shift patience during MAZE, so a long visit is still free real estate —
      candidate fix remains waiting patience draining at ~30% inside. Verdict
      wanted on that half only.

## Later

- [ ] **Balance playtest pass (human hands)** — XP curve (`xpBase`/`xpGrowth`),
      down-spawn cadence (×2.6), heat rung tuning, late-shift quota slog
      (`6 + n*2.2` vs. patience squeeze — shift 10 may be a grind, not a crescendo).
      THE AUDIT DID THE ARITHMETIC (2026-07, multi-agent + queue sims). The
      June 11 balance merge settled some of it; still open:
      · **Shift 5 cliff** (OPEN): base-stat throughput ceiling (~13.5-16
        deliveries/min) < arrivals (20.7/min) — 60-seed sim survival
        100/100/93/53/0% for shifts 1-5 without move/door/cargo cards. A TAS
        fails shift 6. Softer ramp (spawn 4.8 − 0.28n, floor 1.9) or guarantee
        a throughput card early. (Numbers predate additive patience — the
        failure mode shifts but the arrival-rate wall stands; worth a re-sim.)
      · **Shift 9-10 flatline** (OPEN): patMul and spawn both hit their floors
        there; only quota keeps growing → same pressure, longer shifts. Cap
        quota ~25 and scale intensity (rush waves / second modifier) instead.
      · **Level-up heartbeat slows late** — SETTLED the other way: the June 11
        pass deliberately slowed completion (xpGrowth 13, overflow pays +5◆)
        so the build lands ~shift 6. The audit's speed-it-up idea is overridden
        by James's tested preference; drop it.
      · **Heat rungs 2+3+4 all attack strikes** (OPEN) and stack; the ladder
        narrows onto one resource. Re-denominate rung 3 as economic?
      (Fixed outright in the mobile session: nervous riders' 0.6× now cuts the
      patience BASE only, not the per-floor trip budget — long-haul nervous
      riders were provably undeliverable as last-in-batch from shift 6.)
- [ ] **Daily seeded run** — needs a seeded RNG plumbed through `shuffle`/spawns;
      shareable "today's building" + local best. The web build's retention hook.
- [ ] **Victory-song subtitles** — the lyrics deserve timed captions; build the
      track-studio page (loop-point finder + lyric timing) as the tool for it.
- [ ] **Run summary screen** — what you built, what killed you, fares/XP graph.
      (First slice shipped: FIRED now shows a cause-of-death line from the
      flight-recorder counters + the build you died in. The full shift-by-shift
      panel is still the #1 missing piece — and doubles as the daily's share card.)
- [ ] **More building events** — flooded floor, stuck celebrity, rival operator…
      the Spider Floor taught players to expect a haunted building; deliver a
      second ghost.
- [ ] **Gate the X dev shortcut** before sharing the link — it ships enabled on
      the title, silently starts a run, and bumps real spiderVisits/achievements.
      (Keep it behind e.g. `?dev` or a triple-tap; it's too useful to delete.)
- [ ] **Landmark language ideas from the audit** — a NEW IN TOWN modifier where
      riders shout the LANDMARK not the number ('the cat floor!'); replace two of
      the three same-shape colored doors (red/blue/green) with distinct fixtures.
- [ ] **Shipped from the audit's shortlist** — shop forecast (TOMORROW: … posted
      in the Parts Shop; specials are counterplay now), boss inherits motor/
      brakes/reinforced, upgrades change the machine's voice (brakes hush the
      creak, motor hums deeper, quick doors sound quicker), aligned+stopped now
      glows the whole car border green (phone-legible readiness).
