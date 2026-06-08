# The Spider Floor

An elevator roguelike. You're the new operator of the worst lift in the tallest
building in town — **no floor display, no dispatch screen**, just a cranky manual
crank and your own memory. Scoop passengers from the lobby, remember the floors
they shouted, and deliver each one before they lose patience. Survive a shift,
earn parts, and rebuild the death-trap into a dream machine — where every upgrade
is the sweet relief of not having to do the hard part anymore.

…and everyone in the building has heard about the **Spider Floor**, somewhere
below the lobby. Brave enough to step off and find out?

## Play

Open `index.html` in a browser (or serve the folder and visit it). No build step.

- **↑ / ↓** — crank the car up / down. It's a flywheel: let go and it *coasts*.
  Reverse-crank to brake. Stopping on a floor is the whole skill.
- **SPACE** — open / close the doors (only when stopped **and** aligned).
- **M** — on the title screen, open the **Workshop**.

A rider's floor is shown when they're in the lobby, then **fades to "?"** a few
seconds after they board — so you have to remember. Doors open only when the car
is stopped and level with a floor. Hit the shift's quota to survive; run out of
strikes and you're fired.

### Loops
- **In a run** — earn ◆ parts per fare; spend them between shifts in the Parts
  Shop on relief upgrades (auto-leveling, a dispatch board that posts rider
  floors again, a floor counter, quicker doors, a bigger cabin…) and Spare Fuses.
- **Across runs** — surviving earns ★ stars. Spend them in the **Workshop** on
  permanent perks that make each new career start less hopeless.
- **The Spider Floor** — occasionally a webbed floor opens *below the lobby*.
  Step off to grab cocooned parts while a spider descends — bank them by bolting
  back to the lift in time, or get greedy and get caught.

## Develop

Plain HTML + CSS + canvas, single `game.js`. No framework, no bundler.

```
npm test     # headless logic tests (Node, no deps) — node tests/run.mjs
```

The tests load the real `game.js` into a `vm` context with stubbed browser
globals and drive the actual update loop. Tuning knobs live in `CFG` at the top
of `game.js`.
