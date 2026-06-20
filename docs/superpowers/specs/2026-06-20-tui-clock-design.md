# TUI Clock / Timer / Alarm App — Design Spec

## Summary

A static, no-build, no-dependency web app that displays time-related information (current clock, countdowns/timers, alarms) using a retro terminal ("TUI") aesthetic: big digits built from small block segments, amber-on-black color scheme, monospace throughout.

## Constraints

- No installations of any kind (no npm, no build tools, no package managers). Plain HTML/CSS/JS only.
- Must run by opening `index.html` directly in a browser, or via a simple static file server (e.g. `python3 -m http.server`).
- No automated test framework (would require installing one); verification is manual, in-browser.

## Architecture

Single-page app, vanilla JS, organized into small focused modules:

```
index.html
css/style.css              amber-on-black theme, layout, tab bar
js/
  segment-display.js       renders 7-segment alphanumeric strings, diff-based fade/glow animation
  clock-view.js             current time: format cycling, timezone selection
  timer-model.js            timer/countdown data model: create, tick, persist
  alarm-model.js            alarm data model: recurring schedule, persist
  timers-view.js            list UI + big focused display for timers/countdowns
  alarms-view.js             list UI for alarms
  notify.js                   beep (Web Audio API), browser Notification API, visual flash
  storage.js                   thin localStorage wrapper used by timer-model & alarm-model
  app.js                       tab switching, boots the three views, central tick loop
```

A single central tick (`setInterval`, 250ms) in `app.js` drives all three views. Each view re-renders only when its displayed string actually changes, so multiple simultaneous timers stay cheap to render.

## Components

### Segment Display (`segment-display.js`)

- Each character is rendered as a grid of small block "cells" forming the classic 7-segment shape (plus colon/dot/space glyphs).
- Supports full alphanumeric segment approximations (calculator-style letterforms) so AM/PM, weekday abbreviations, and month names render as segments rather than plain text.
- `renderSegmentString(container, "12:34:56")`: diffs against the previously rendered string for that container and only animates segments whose on/off state actually changed.
- Animation: segments turning on fade in (opacity/brightness ramp, ~150ms), segments turning off fade out. No flip/slide motion.
- Sizing controlled by a CSS custom property (`--cell-size`) so the same component can be reused at different scales (large focused display vs. small list rows).

### Clock View (`clock-view.js`)

- Displays current time in the big segment display, updating every second.
- Format cycles through: 24h → 12h (AM/PM) → 24h+date → 12h+date, via a button and a keyboard shortcut (`f`).
- Timezone selector (dropdown, populated via `Intl.supportedValuesOf('timeZone')`) with "Local" as default; uses `Intl.DateTimeFormat` with the chosen IANA zone to compute the displayed time.
- Date display renders weekday + day/month/year using alphanumeric segments, e.g. `FRI 20 JUN 2026`.
- Selected format and timezone are persisted to `prefs` in localStorage.

### Timers / Countdowns View (`timers-view.js` + `timer-model.js`)

- List of all timers: name, remaining/elapsed time (small segment digits), status (running/paused/done).
- "+ New" form: name, type (countdown with target duration, or count-up stopwatch). Starts immediately on creation and joins the list.
- Clicking a row sets it as "focused": shown big in the main segment display at the top of the view. All timers tick regardless of focus.
- Timer state is computed from stored timestamps (`startTime`, `targetDuration`, `pausedAt`, `accumulatedPause`), not by decrementing a counter — so elapsed/remaining time stays correct across tab backgrounding or reloads.
- Per-timer controls: pause/resume, reset, delete.
- On countdown reaching zero: triggers `notify.js` (flash, beep, browser notification); row remains showing `00:00:00` flashing until dismissed or deleted.

### Alarms View (`alarms-view.js` + `alarm-model.js`)

- List of alarms: time-of-day (HH:MM), enabled toggle, repeat-day chips (Sun–Sat; defaults to all days).
- The central tick checks (throttled to once per real second) whether current local time matches any enabled alarm's time + day, guarding against re-firing multiple times within the same matching minute.
- On match: triggers `notify.js` (flash, beep, browser notification); shows a dismissible banner to silence.

### Notifications (`notify.js`)

- Visual: flash/blink the relevant row and (if focused) the big display.
- Sound: short beep synthesized via Web Audio API (no external audio files).
- Browser notification: `Notification.requestPermission()` requested lazily on first timer/alarm creation (not on page load); falls back to flash+beep only if permission is denied, without breaking the UI.

### Persistence (`storage.js`)

- Wraps `localStorage` for three keys:
  - `timers`: array of `{id, name, type, startTime, targetDuration, pausedAt, accumulatedPause, status}`
  - `alarms`: array of `{id, time, days[], enabled}`
  - `prefs`: `{clockFormat, timezone}`
- On load, `app.js` reconstructs timer/alarm state from stored timestamps compared against `Date.now()`, so state that changed while the tab was closed (e.g. a countdown that finished) is reflected immediately rather than silently lost.
- Writes are wrapped in try/catch (e.g. private browsing can throw on `localStorage` access); on failure, logs a console warning and continues operating in-memory for that session.

## Navigation

Clickable tab bar at the top (Clock / Timers / Alarms), styled to match the terminal aesthetic.

## Error Handling

- Timer creation form rejects empty/zero/negative durations with an inline message.
- Notification permission denial degrades gracefully (flash+beep still work).
- localStorage failures degrade gracefully (in-memory fallback for the session).

## Testing / Verification

No automated test framework (would require an install). Verification is manual in-browser:
- Load app, confirm clock ticks and format/timezone cycling works.
- Create timers/countdowns, confirm pause/resume/reset/delete and focus-switching work.
- Let a short countdown run to completion, confirm flash/beep/notification fire.
- Create a recurring alarm for a near-future time, confirm it fires once and doesn't re-fire within the same minute.
- Reload the page mid-timer and confirm persisted state reconstructs correctly.
