# The Spider Floor

An elevator roguelike. You're the new operator of the worst lift in the tallest
building in town — **no floor display, no dispatch screen**, just a cranky manual
crank and your own memory. Pick your operator, scoop passengers from the lobby,
remember the floors they shouted, and deliver each one before they lose patience.
From shift 3, **calls ring from the upper floors too** — a lamp on the door frame
means someone up there wants down. Survive a shift, earn parts, and rebuild the
death-trap into a dream machine — where every upgrade is the sweet relief of not
having to do the hard part anymore.

…and everyone in the building has heard about the **Spider Floor**, somewhere
below the lobby. Brave enough to step off and find out?

## Play

Open `index.html` in a browser (or serve the folder and visit it). No build step.

- **↑ / ↓** — crank the car up / down. It's a flywheel: let go and it *coasts*.
  Reverse-crank to brake. Stopping on a floor is the whole skill.
- **SPACE** — open / close the doors (only when stopped **and** aligned).
- **P / ESC / the ⏸ chip** — pause opens the settings modal: music & SFX volume,
  screen shake, abandon run. (The game also pauses itself on lost focus.)
- **M** — mute / unmute. All settings are remembered between sessions.
- **W** — on the title screen, open the **Workshop**; **A** for achievements.
- **hold R** — abandon the run and start over (a tap does nothing).

A rider's floor is shown when they're in the lobby, then **fades to "?"** a few
seconds after they board — so you have to remember. Doors open only when the car
is stopped and level with a floor. Hit the shift's quota to survive; run out of
strikes and you're fired.

### Loops
- **Operators** — pick who's on the crank each run: a minor buff and a minor
  dent (the intern learns fast but rattles riders; the charmer can't brake…).
  Most unlock by just playing. Patience scales with the trip being asked —
  a penthouse haul earns more grace than a floor-2 hop.
- **Down-riders** — upstairs calls run on their own clock and pay a long-haul
  bonus. Ignore one and they take the stairs: lost fare, not a strike.
- **In a shift** — every delivery earns **XP**; a full bar freezes the game for a
  **level-up: pick 1 of 3** relief upgrades (auto-leveling, a dispatch board that
  posts rider floors again, quicker doors, a bigger cabin…) that install on the
  spot. Builds live in slots — **5 machine fittings + 4 operator habits** — so
  once a rack is full, level-ups only deepen what you own. One paid reroll per
  level-up, and once per run you may **banish** (B) a part from the pool forever.
- **Between shifts** — ◆ parts from fares buy consumables in the Parts Shop:
  Spare Fuses and one-shot specials (espresso, spider tip-offs, night classes…).
- **Across runs** — surviving earns ★ stars. Spend them in the **Workshop** on
  permanent perks that make each new career start less hopeless.
- **The Spider Floor** — occasionally a webbed floor opens *below the lobby*.
  Step off to grab cocooned parts while a spider descends — bank them by bolting
  back to the lift in time, or get greedy and get caught.

## Develop

Plain HTML + CSS + canvas. No framework, no bundler. The source is split into
ordered classic scripts under `src/` (they share one global scope and are
loaded in order by `index.html`):

| file | what's in it |
| --- | --- |
| `src/data.js`   | config (`CFG`), all data tables, save/achievements, state & economy |
| `src/sim.js`    | input, the simulation `update()`, the Spider Floor combat |
| `src/render.js` | every `draw*` + the `render()` loop |
| `src/audio.js`  | the procedural synth (`sfx`) **and** the looping music layer |
| `src/main.js`   | the rAF loop, canvas fit, touch controls, music-by-screen map |

Sound effects are synthesized (no asset files); **music** is streamed from
`audio/` — each track dual-encoded as **Ogg Opus + AAC/m4a** and chosen per
browser via `canPlayType`. Tracks loop a region seamlessly via WebAudio
`loopStart`/`loopEnd` (sample-accurate, gapless); `MUSIC_BY_SCREEN` in
`main.js` says which track plays where. To add or re-cut a track, encode with
`ffmpeg -t <trim> -c:a libopus` / `-c:a aac` and add its loop points to `MUSIC`
in `audio.js`. The build copies `audio/` into `dist/` verbatim.

```
npm test     # headless logic tests (Node, no deps) — node tests/run.mjs
```

The tests (`tests/`) concatenate the `src/` files in load order into a `vm`
context with stubbed browser globals and drive the real update loop. Tuning
knobs live in `CFG` at the top of `src/data.js`.

## Deploy

`npm run build` (`tools/build.mjs`, zero dependencies) concatenates the `src/`
scripts into one **content-hashed** file (`dist/app.<hash>.js`) and rewrites
`index.html` to point at it — so the published site can be cached aggressively
and busts automatically the moment the code changes. There's no build for local
dev; `tools/dev-server.mjs` just serves the plain `src/` files with no-cache
headers.

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the tests, then
builds and publishes `dist/` to **GitHub Pages** on every push to `main`.
One-time setup after you create the repo: **Settings → Pages → Source: GitHub
Actions**.
