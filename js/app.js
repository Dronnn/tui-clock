// app.js
// Boots the three pane containers (Clock/Countdown/Timer), wires up hotkey-
// driven focus switching, and drives a single central tick loop that calls
// into each view's tick(). Plain global script, no ES modules.
//
// Responsibilities:
//   - Grab the pane containers and the header's mode indicator.
//   - Call ClockView.init / TimersView.init / TimerStopwatchView.init once on
//     boot. (AlarmsView.init is intentionally NOT called here anymore —
//     #view-alarms was removed in favor of a future alarm corner widget;
//     see TODO near boot() below.)
//   - Mode switching: all three panes stay mounted and visible at all times
//     — nothing is ever hidden or removed from the DOM. setActiveMode(name)
//     toggles which single pane carries .pane--focused (large, centered)
//     versus .pane--minor (small widget row) on the three #view-* / #view-
//     timer-mode containers, tells TimersView/TimerStopwatchView whether
//     their pane is the focused one (so they can switch between their full
//     and compact rendering), and updates the header's mode-indicator text.
//     Triggered by C/D/T keydown (Clock/Countdown/Timer), ignored while
//     typing in an input/textarea/select or while a modifier key is held.
//     The same guarded keydown path opens the alarm corner popover on A.
//     Last-active mode is persisted to Storage's 'prefs' object and restored
//     on boot (default: 'clock').
//   - A single setInterval(250ms) calls ClockView.tick(), TimersView.tick(),
//     TimerStopwatchView.tick() every interval, regardless of which pane is
//     focused — every pane keeps ticking even while minor. Each view
//     re-renders only what changed internally, so calling all of them
//     unconditionally is cheap.
//   - One immediate tick right after init so the UI isn't blank/stale on
//     first paint (e.g. a countdown that already finished while the tab
//     was closed shows as done immediately, since TimerModel computes
//     against Date.now() rather than a decrementing counter).

(function () {
  'use strict';

  var TICK_INTERVAL_MS = 250;

  // Min/max bounds for the responsive --root-cell-size recalculated on
  // resize (see updateCellSize below). 10px is the original fixed value
  // this whole system replaces, so it sits comfortably inside the range.
  var MIN_CELL_SIZE = 6;
  var MAX_CELL_SIZE = 16;

  var resizeRaf = null;

  // Mode names map 1:1 to hotkeys and to MODE_LABELS below. 'timer' is the
  // stopwatch mode (#view-timer-mode); 'timers' (plural, matching the
  // existing #view-timers id/container) is the Countdown mode.
  var MODE_KEYS = { c: 'clock', d: 'timers', t: 'timer' };
  var MODE_LABELS = { clock: 'CLOCK', timers: 'COUNTDOWN', timer: 'TIMER' };
  var DEFAULT_MODE = 'clock';

  var modeContainers = null; // populated in boot(): { clock, timers, timer }
  var modeIndicatorEl = null;

  function tickAll() {
    window.ClockView.tick();
    window.TimersView.tick();
    window.TimerStopwatchView.tick();
    window.AlarmCorner.tick();
  }

  // Recomputes --root-cell-size from the current viewport so the big Clock
  // display scales down on small windows (avoiding overflow/scrollbars)
  // and scales up on large ones, instead of staying frozen at one fixed
  // pixel size. --cell-size, the clock's own override, and the segment-
  // display CSS (pure calc()-driven, no inline JS pixel styles) all derive
  // from --root-cell-size, so writing this one custom property reflows
  // every already-rendered digit with no re-render call needed.
  function updateCellSize() {
    var widthBased = window.innerWidth / 110;
    var heightBased = window.innerHeight / 70;
    var size = Math.min(widthBased, heightBased);
    size = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, size));
    document.documentElement.style.setProperty('--root-cell-size', size.toFixed(2) + 'px');
  }

  function onResize() {
    if (resizeRaf !== null) {
      return;
    }
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = null;
      updateCellSize();
    });
  }

  // ---------------------------------------------------------------------
  // Prefs persistence (read-merge-write so unrelated fields survive, same
  // pattern as clock-view.js/settings-panel.js)
  // ---------------------------------------------------------------------

  function loadPrefs() {
    return window.Storage.load('prefs', {});
  }

  function savePrefs(patch) {
    var current = loadPrefs();
    var merged = {};
    var key;
    for (key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        merged[key] = current[key];
      }
    }
    for (key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        merged[key] = patch[key];
      }
    }
    window.Storage.save('prefs', merged);
  }

  // ---------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------

  // Toggles .pane--focused / .pane--minor on the three #view-* / #view-
  // timer-mode containers (all three stay mounted and visible — nothing is
  // ever hidden), tells TimersView/TimerStopwatchView whether their pane is
  // the focused one, and updates the header's mode-indicator text. Used
  // both by the C/D/T hotkey handler and to set the initial mode on boot.
  function setActiveMode(modeName) {
    if (!modeContainers || !modeContainers[modeName]) {
      return;
    }
    var key;
    for (key in modeContainers) {
      if (Object.prototype.hasOwnProperty.call(modeContainers, key)) {
        var isFocused = key === modeName;
        modeContainers[key].classList.toggle('pane--focused', isFocused);
        modeContainers[key].classList.toggle('pane--minor', !isFocused);
      }
    }
    window.TimersView.setPaneFocused(modeName === 'timers');
    window.TimerStopwatchView.setPaneFocused(modeName === 'timer');
    if (modeIndicatorEl) {
      var label = MODE_LABELS[modeName] || modeName.toUpperCase();
      modeIndicatorEl.innerHTML = label + ' <span class="app-header__hint">(C/D/T to switch)</span>';
    }
    savePrefs({ activeMode: modeName });
  }

  function onModeKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    var target = document.activeElement;
    var tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    var keyName = event.key.toLowerCase();
    if (keyName === 'a') {
      window.AlarmCorner.open();
      return;
    }
    var modeName = MODE_KEYS[keyName];
    if (!modeName) {
      return;
    }
    setActiveMode(modeName);
  }

  function boot() {
    var clockContainer = document.getElementById('view-clock');
    var timersContainer = document.getElementById('view-timers');
    var timerModeContainer = document.getElementById('view-timer-mode');

    modeContainers = {
      clock: clockContainer,
      timers: timersContainer,
      timer: timerModeContainer
    };

    modeIndicatorEl = document.getElementById('mode-indicator');

    window.ClockView.init(clockContainer);
    window.TimersView.init(timersContainer);
    window.TimerStopwatchView.init(timerModeContainer);
    window.AlarmCorner.init(document.getElementById('alarm-corner'));
    window.SettingsPanel.init(document.getElementById('settings-panel'));

    document.addEventListener('keydown', onModeKeyDown);

    var prefs = loadPrefs();
    if (prefs.matrixBg && window.MatrixBG) {
      window.MatrixBG.enable();
    }

    var initialMode = Object.prototype.hasOwnProperty.call(modeContainers, prefs.activeMode)
      ? prefs.activeMode
      : DEFAULT_MODE;
    setActiveMode(initialMode);

    // Immediate first tick so the clock/timers/alarms aren't blank/stale
    // until the first 250ms interval fires.
    tickAll();

    setInterval(tickAll, TICK_INTERVAL_MS);

    // Initial sizing pass plus a lightly-throttled (rAF) resize listener —
    // CSS custom properties cascade automatically, so this is the only JS
    // needed for responsive segment sizing; centering itself is pure CSS
    // (flex + viewport units) and recalculates on its own.
    updateCellSize();
    window.addEventListener('resize', onResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
