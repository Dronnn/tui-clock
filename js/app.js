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

  var FOCUSED_DISPLAY_SELECTOR = '.clock-view__display, .timers-view__focused-display, .timer-stopwatch-view__focused-display';
  var CLOCK_FIT_TARGET_SELECTOR = '.viewfinder-frame';
  var FIT_TARGET_SELECTOR = CLOCK_FIT_TARGET_SELECTOR + ', ' + FOCUSED_DISPLAY_SELECTOR;
  var VIEWPORT_FIT_MARGIN_PX = 24;
  // Shrink a touch more than the measured fit: monospace/figlet glyph ink
  // renders slightly wider than its measured box, so without this the
  // content can still spill past the edge.
  var FIT_SAFETY = 0.9;
  var MIN_FIT_CELL_SIZE = 2;

  var resizeRaf = null;
  var styleRaf = null;

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
    fitDisplays();
  }

  function readPixelValue(value) {
    var parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  function verticalPadding(el) {
    var styles = getComputedStyle(el);
    return readPixelValue(styles.paddingTop) + readPixelValue(styles.paddingBottom);
  }

  function clearDisplayFit(display) {
    if (!display) {
      return;
    }
    display._fitScale = null;
    display.style.transform = '';
    display.style.transformOrigin = '';
  }

  function clearInactiveDisplayFits(activeDisplay) {
    var displays = document.querySelectorAll(FIT_TARGET_SELECTOR);
    for (var i = 0; i < displays.length; i++) {
      if (displays[i] !== activeDisplay) {
        clearDisplayFit(displays[i]);
      }
    }
  }

  function fitTargetForPane(pane) {
    if (!pane) {
      return null;
    }
    if (pane.id === 'view-clock') {
      return pane.querySelector(CLOCK_FIT_TARGET_SELECTOR);
    }
    return pane.querySelector(FOCUSED_DISPLAY_SELECTOR);
  }

  // True rendered extent of the content, robust against the flex/overflow
  // measurement traps that make scrollWidth/getBoundingClientRect under-
  // report for the <pre>-based figlet rows: take the largest of scrollWidth,
  // the element rect, and a DOM Range over its contents.
  function measureContent(el) {
    var width = el.scrollWidth || 0;
    var height = el.scrollHeight || 0;

    if (typeof el.getBoundingClientRect === 'function') {
      var rect = el.getBoundingClientRect();
      width = Math.max(width, rect.width);
      height = Math.max(height, rect.height);
    }

    if (typeof document.createRange === 'function') {
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        var rr = range.getBoundingClientRect();
        width = Math.max(width, rr.width);
        height = Math.max(height, rr.height);
      } catch (e) { /* ignore */ }
    }

    return { width: width, height: height };
  }

  function computeBaseCellSize() {
    var size = Math.min(window.innerWidth / 110, window.innerHeight / 70);
    return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, size));
  }

  // Sizes the focused display to always fit the viewport by scaling the real
  // layout via --root-cell-size (every font derives from it through
  // --cell-size), NOT a CSS transform — so flexbox keeps it centered and
  // nothing ever overflows or needs a scrollbar. Measures at the base size,
  // then shrinks proportionally with a safety margin (monospace glyph ink
  // tends to render a bit wider than its measured box).
  function fitDisplays() {
    var root = document.documentElement;
    var base = computeBaseCellSize();
    // Measure at the base size for a stable, oscillation-free result.
    root.style.setProperty('--root-cell-size', base.toFixed(2) + 'px');

    var pane = document.querySelector('.pane--focused');
    var display = fitTargetForPane(pane);
    // The fit is now layout-based; make sure no stale transform lingers.
    clearInactiveDisplayFits(null);
    if (display) {
      clearDisplayFit(display);
    }

    if (!pane || !display) {
      return;
    }

    var natural = measureContent(display);
    if (!natural.width || !natural.height) {
      return;
    }

    var paneRect = pane.getBoundingClientRect();
    var availableWidth = window.innerWidth - VIEWPORT_FIT_MARGIN_PX;
    var availableHeight = paneRect.height - verticalPadding(pane);
    if (!availableWidth || availableWidth < 1) {
      availableWidth = window.innerWidth;
    }
    if (!availableHeight || availableHeight < 1) {
      availableHeight = window.innerHeight;
    }

    var factor = Math.min(1, availableWidth / natural.width, availableHeight / natural.height);
    if (!isFinite(factor) || factor <= 0) {
      factor = 1;
    }
    factor *= FIT_SAFETY;

    var newSize = Math.max(MIN_FIT_CELL_SIZE, base * factor);
    root.style.setProperty('--root-cell-size', newSize.toFixed(2) + 'px');
  }

  // Sets the base --root-cell-size from the viewport; fitDisplays() then
  // refines it down so the focused display fits. Kept as a separate entry so
  // resize can set a sane size even before the first fit pass runs.
  function updateCellSize() {
    document.documentElement.style.setProperty(
      '--root-cell-size', computeBaseCellSize().toFixed(2) + 'px');
    fitDisplays();
  }

  function onResize() {
    if (resizeRaf !== null) {
      return;
    }
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = null;
      updateCellSize();
      fitDisplays();
    });
  }

  function onStyleAttributeChange() {
    if (styleRaf !== null) {
      return;
    }
    styleRaf = requestAnimationFrame(function () {
      styleRaf = null;
      tickAll();
    });
  }

  function observeStyleChanges() {
    if (typeof MutationObserver !== 'function') {
      return;
    }
    var observer = new MutationObserver(onStyleAttributeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-style']
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
    fitDisplays();
  }

  function cycleStyle(step) {
    if (window.SettingsPanel && typeof window.SettingsPanel.cycleStyle === 'function') {
      window.SettingsPanel.cycleStyle(step);
      tickAll(); // immediate re-render + re-fit for the new font
    }
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
    // 'N' (next) / 'P' (previous) cycle the font/visual style. event.code
    // guards against non-Latin keyboard layouts where the physical key yields
    // another char.
    if (keyName === 'n' || event.code === 'KeyN') {
      cycleStyle(1);
      return;
    }
    if (keyName === 'p' || event.code === 'KeyP') {
      cycleStyle(-1);
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
    observeStyleChanges();

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
    fitDisplays();
    window.addEventListener('resize', onResize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
