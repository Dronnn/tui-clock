# TUI Clock

A retro terminal-style clock, countdown, timer, and alarm app for the browser. Big 7-segment digits rendered from small block cells, amber-on-black aesthetic, with switchable color schemes and visual styles. No build step, no dependencies — just static HTML, CSS, and JavaScript.

## Features

- **Clock** — current time with switchable formats (24h, 12h, with/without date) and timezone selection.
- **Countdown** — one or more countdowns running at once, each with an optional title and subtitle.
- **Timer** — count-up stopwatches, also multiple at once with titles.
- **Alarms** — recurring alarms by time and weekday, shown in a corner widget.
- **Single combined screen** — Clock, Countdown, and Timer are all visible at once; the focused one is large and centered while the others shrink to small widgets. Switch focus with hotkeys.
- **Notifications** — visual flash, a synthesized beep (Web Audio), and optional browser notifications when a countdown or alarm fires.
- **Themes** — 3 color schemes (Amber, Green phosphor, Cyan) and multiple visual styles (flat glow, 3D, CRT scanline, and more), chosen from the settings gear.
- **Persistence** — timers, alarms, and preferences are saved to `localStorage` and restored on reload; running timers stay correct across reloads.

## Hotkeys

| Key | Action            |
|-----|-------------------|
| `C` | Focus the Clock   |
| `D` | Focus the Countdown |
| `T` | Focus the Timer (stopwatch) |
| `F` | Cycle the clock time format |

Hotkeys are ignored while typing in a text field.

## Running it

No installation or build is required. Either:

- Open `index.html` directly in your browser, or
- Serve the folder with any static server, e.g.:

  ```sh
  python3 -m http.server
  ```

  then visit `http://localhost:8000`.

A static server is recommended so browser features (notifications, storage) behave consistently.

## Browser support

Any modern browser (Chrome, Firefox, Safari, Edge). Uses the Web Audio API, the Notifications API, `Intl.DateTimeFormat`, and `localStorage` — all standard and widely supported. Features degrade gracefully when unavailable (for example, notifications fall back to the on-screen flash).

## Project structure

```
index.html          markup and script loading
css/style.css       theme, layout, segment-display styles
js/
  storage.js          localStorage wrapper with in-memory fallback
  segment-display.js  7-segment alphanumeric renderer
  notify.js           beep / browser notification / visual flash
  clock-view.js       clock pane
  timer-model.js      timer/countdown data model
  timers-view.js      countdown pane
  timer-stopwatch-view.js  stopwatch pane
  alarm-model.js      alarm data model
  alarms-view.js      alarm corner widget
  settings-panel.js   theme/color picker
  app.js              boot, central tick loop, mode switching
```

## License

MIT
