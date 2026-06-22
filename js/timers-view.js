// timers-view.js
// Countdown-only pane UI: an always-visible new-countdown form, a big
// focused display for whichever countdown is currently selected within
// this pane, and a compact list of the other countdown instances. Builds
// all DOM with plain DOM APIs (createElement/classList/dataset), consistent
// with how segment-display.js builds its own nodes. Plain global script,
// no ES modules — exposes window.TimersView.
//
// "Focused within this pane" is a separate concept from the page-level
// focused/minor pane distinction app.js manages: even when this whole pane
// is shrunk to a small page-level widget, one countdown is still considered
// the pane's own focused countdown, it just renders compactly instead of
// with the full form/list.
//
// Public API:
//   TimersView.init(container)
//     - Builds the form, the big focused display, and the list inside
//       `container`. Does not auto-run; app.js calls this once during boot.
//   TimersView.tick()
//     - Called ~every 250ms by the central tick loop (app.js). Recomputes
//       remaining time for every countdown and updates the small per-row
//       segment displays plus the big focused display. Detects countdowns
//       that just transitioned to "done" and fires Notify.fire() once.
//   TimersView.setPaneFocused(isFocused)
//     - Tells this view whether the page currently has this pane focused
//       (large) or minor (small widget). When not focused, render() shows
//       only a compact summary of the within-pane-focused countdown — no
//       form, no list. Defaults to true (full UI) before this is ever
//       called.

(function () {
  'use strict';

  // Module-scoped runtime state (not persisted — rebuilt from TimerModel
  // data on every init()).
  var els = {};
  var focusedId = null;
  var isPaneFocused = true;

  // Ids that have already triggered a completion notification during this
  // page's runtime. Intentionally in-memory only: the spec only requires
  // the beep/notification to fire once at the moment of completion, not on
  // every reload of an already-finished countdown (the flashing visual is
  // fine to reappear, since the row itself shows .flashing while undismissed).
  var notifiedIds = {};

  // Ids whose completion flash the user has dismissed (clicked Stop). A
  // dismissed-but-still-done countdown shows 00:00:00 without flashing.
  // Cleared on reset so a re-run can flash again.
  var dismissedIds = {};

  function dismissTimer(id) {
    dismissedIds[id] = true;
    var record = rowRecords[id];
    if (record) {
      Notify.stopFlash(record.el);
    }
    if (focusedId === id && els.focusedDisplay) {
      Notify.stopFlash(els.focusedDisplay);
    }
  }

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Always HH:MM:SS for consistency, per spec ("your call, keep it simple").
  function formatDuration(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
  }

  function displayMsFor(timer) {
    return TimerModel.getRemainingMs(timer);
  }

  function getCountdowns() {
    return TimerModel.getAll().filter(function (t) {
      return t.type === 'countdown';
    });
  }

  // ---------------------------------------------------------------------
  // Form: parse a duration string into milliseconds
  // ---------------------------------------------------------------------

  // Accepts "HH:MM:SS", "MM:SS", or a bare number of seconds. Returns
  // milliseconds, or null if the string doesn't parse as a non-negative
  // duration at all (distinct from "parses but is zero/negative", which
  // callers reject separately so they can give a specific message).
  function parseDurationToMs(str) {
    var trimmed = String(str || '').trim();
    if (!trimmed) {
      return null;
    }
    var parts = trimmed.split(':');
    if (parts.length > 3) {
      return null;
    }
    var nums = [];
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+$/.test(parts[i].trim())) {
        return null;
      }
      nums.push(parseInt(parts[i], 10));
    }
    var hours = 0, minutes = 0, seconds = 0;
    if (nums.length === 1) {
      seconds = nums[0];
    } else if (nums.length === 2) {
      minutes = nums[0];
      seconds = nums[1];
    } else {
      hours = nums[0];
      minutes = nums[1];
      seconds = nums[2];
    }
    return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
  }

  // ---------------------------------------------------------------------
  // Form: build + wire the always-visible new-countdown form
  // ---------------------------------------------------------------------

  function buildForm(container) {
    var form = document.createElement('form');
    form.className = 'timers-view__form';

    var nameLabel = document.createElement('label');
    nameLabel.className = 'timers-view__form-field';
    nameLabel.textContent = 'Name';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'timers-view__form-input';
    nameInput.placeholder = 'Timer name';
    nameInput.maxLength = 40;
    // Default so the user can just press Start. defaultValue is set too so the
    // value survives form.reset() after each created countdown.
    nameInput.value = 'Timer';
    nameInput.defaultValue = 'Timer';
    nameLabel.appendChild(nameInput);

    var titleLabel = document.createElement('label');
    titleLabel.className = 'timers-view__form-field';
    titleLabel.textContent = 'Title (optional)';
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'timers-view__form-input';
    titleInput.placeholder = 'Title';
    titleInput.maxLength = 60;
    titleLabel.appendChild(titleInput);

    var subtitleLabel = document.createElement('label');
    subtitleLabel.className = 'timers-view__form-field';
    subtitleLabel.textContent = 'Subtitle (optional)';
    var subtitleInput = document.createElement('input');
    subtitleInput.type = 'text';
    subtitleInput.className = 'timers-view__form-input';
    subtitleInput.placeholder = 'Subtitle';
    subtitleInput.maxLength = 60;
    subtitleLabel.appendChild(subtitleInput);

    var durationLabel = document.createElement('label');
    durationLabel.className = 'timers-view__form-field';
    durationLabel.textContent = 'Duration (HH:MM:SS)';
    var durationInput = document.createElement('input');
    durationInput.type = 'text';
    durationInput.className = 'timers-view__form-input';
    durationInput.placeholder = '00:05:00';
    durationInput.value = '00:05:00';
    durationInput.defaultValue = '00:05:00';
    durationLabel.appendChild(durationInput);

    var errorEl = document.createElement('div');
    errorEl.className = 'timers-view__form-error';
    errorEl.hidden = true;

    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'timers-view__form-submit';
    submitBtn.textContent = 'Start';

    var actions = document.createElement('div');
    actions.className = 'timers-view__form-actions';
    actions.appendChild(submitBtn);

    form.appendChild(nameLabel);
    form.appendChild(titleLabel);
    form.appendChild(subtitleLabel);
    form.appendChild(durationLabel);
    form.appendChild(errorEl);
    form.appendChild(actions);

    function setError(message) {
      if (!message) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = message;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      // Name is optional — fall back to a default so the user can just set a
      // duration and press Start.
      var name = nameInput.value.trim() || 'Timer';

      var ms = parseDurationToMs(durationInput.value);
      if (ms === null) {
        setError('Enter duration as HH:MM:SS, MM:SS, or seconds.');
        durationInput.focus();
        return;
      }
      if (ms <= 0) {
        setError('Duration must be greater than zero.');
        durationInput.focus();
        return;
      }

      var timer;
      try {
        timer = TimerModel.create({
          name: name,
          type: 'countdown',
          targetDuration: ms,
          title: titleInput.value,
          subtitle: subtitleInput.value
        });
      } catch (err) {
        setError(err && err.message ? err.message : 'Could not create countdown.');
        return;
      }

      Notify.requestPermissionIfNeeded();
      focusedId = timer.id;
      setError(null);
      form.reset();
      renderList();
    });

    container.appendChild(form);

    els.form = form;
  }

  // ---------------------------------------------------------------------
  // Focused (big) display
  // ---------------------------------------------------------------------

  function buildFocusedArea(container) {
    var section = document.createElement('div');
    section.className = 'timers-view__focused';

    var title = document.createElement('div');
    title.className = 'timers-view__focused-title';
    title.textContent = 'No countdown selected';

    var subtitleEl = document.createElement('div');
    subtitleEl.className = 'timers-view__focused-subtitle';

    var display = document.createElement('div');
    display.className = 'segment-display timers-view__focused-display';

    var labelEl = document.createElement('div');
    labelEl.className = 'timers-view__focused-label';

    var controls = document.createElement('div');
    controls.className = 'timers-view__focused-controls';
    controls.hidden = true;

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'timers-view__row-btn timers-view__focused-toggle';
    toggleBtn.textContent = 'Pause';

    var stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'timers-view__row-btn timers-view__focused-stop';
    stopBtn.textContent = 'Stop';
    stopBtn.hidden = true;

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'timers-view__row-btn timers-view__focused-reset';
    resetBtn.textContent = 'Reset';

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'timers-view__row-btn timers-view__focused-delete';
    deleteBtn.textContent = 'Delete';

    controls.appendChild(toggleBtn);
    controls.appendChild(stopBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(deleteBtn);

    toggleBtn.addEventListener('click', function () {
      var current = focusedId !== null ? TimerModel.getById(focusedId) : null;
      if (!current) {
        return;
      }
      if (current.status === 'paused') {
        TimerModel.resume(current.id);
      } else {
        TimerModel.pause(current.id);
      }
      render();
    });

    stopBtn.addEventListener('click', function () {
      if (focusedId !== null) {
        dismissTimer(focusedId);
        render();
      }
    });

    resetBtn.addEventListener('click', function () {
      if (focusedId === null) {
        return;
      }
      delete notifiedIds[focusedId];
      delete dismissedIds[focusedId];
      TimerModel.reset(focusedId);
      Notify.stopFlash(els.focusedDisplay);
      render();
    });

    deleteBtn.addEventListener('click', function () {
      if (focusedId === null) {
        return;
      }
      delete notifiedIds[focusedId];
      delete dismissedIds[focusedId];
      TimerModel.delete(focusedId);
      focusedId = null;
      renderList();
    });

    section.appendChild(title);
    section.appendChild(display);
    section.appendChild(subtitleEl);
    section.appendChild(labelEl);
    section.appendChild(controls);
    container.appendChild(section);

    els.focusedSection = section;
    els.focusedTitle = title;
    els.focusedSubtitle = subtitleEl;
    els.focusedDisplay = display;
    els.focusedLabel = labelEl;
    els.focusedControls = controls;
    els.focusedToggle = toggleBtn;
    els.focusedStop = stopBtn;
  }

  // ---------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------

  function buildListArea(container) {
    var list = document.createElement('div');
    list.className = 'timers-view__list';
    container.appendChild(list);
    els.list = list;
  }

  function statusLabel(timer) {
    if (timer.status === 'paused') {
      return 'PAUSED';
    }
    if (TimerModel.isDone(timer)) {
      return 'DONE';
    }
    return 'RUNNING';
  }

  function buildRow(timer) {
    var row = document.createElement('div');
    row.className = 'timers-view__row';
    row.dataset.timerId = timer.id;

    var info = document.createElement('div');
    info.className = 'timers-view__row-info';

    var nameEl = document.createElement('div');
    nameEl.className = 'timers-view__row-name';
    nameEl.textContent = timer.name;

    var statusEl = document.createElement('div');
    statusEl.className = 'timers-view__row-status';
    statusEl.textContent = statusLabel(timer);

    info.appendChild(nameEl);
    info.appendChild(statusEl);

    var display = document.createElement('div');
    display.className = 'segment-display timers-view__row-display';

    var controls = document.createElement('div');
    controls.className = 'timers-view__row-controls';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'timers-view__row-btn timers-view__row-toggle';

    var stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'timers-view__row-btn timers-view__row-stop';
    stopBtn.textContent = 'Stop';
    stopBtn.hidden = true;

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'timers-view__row-btn timers-view__row-reset';
    resetBtn.textContent = 'Reset';

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'timers-view__row-btn timers-view__row-delete';
    deleteBtn.textContent = 'Delete';

    controls.appendChild(toggleBtn);
    controls.appendChild(stopBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(deleteBtn);

    stopBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      dismissTimer(timer.id);
      renderList();
    });

    row.appendChild(info);
    row.appendChild(display);
    row.appendChild(controls);

    toggleBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      var current = TimerModel.getById(timer.id);
      if (!current) {
        return;
      }
      if (current.status === 'paused') {
        TimerModel.resume(timer.id);
      } else {
        TimerModel.pause(timer.id);
      }
      renderList();
    });

    resetBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      delete notifiedIds[timer.id];
      delete dismissedIds[timer.id];
      TimerModel.reset(timer.id);
      Notify.stopFlash(row);
      renderList();
    });

    deleteBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      delete notifiedIds[timer.id];
      delete dismissedIds[timer.id];
      TimerModel.delete(timer.id);
      if (focusedId === timer.id) {
        focusedId = null;
      }
      renderList();
    });

    row.addEventListener('click', function () {
      focusedId = timer.id;
      renderList();
    });

    return {
      el: row,
      nameEl: nameEl,
      statusEl: statusEl,
      display: display,
      toggleBtn: toggleBtn,
      stopBtn: stopBtn
    };
  }

  // Cache of row records keyed by timer id, so tick() can update displays
  // without rebuilding DOM every 250ms. Rebuilt whenever renderList() runs
  // (creation/deletion/pause/resume/reset/focus-change), which are all
  // low-frequency user actions.
  var rowRecords = {};

  function renderList() {
    var countdowns = getCountdowns();

    // Clear any focused id that no longer exists.
    if (focusedId !== null) {
      var stillExists = countdowns.some(function (t) {
        return t.id === focusedId;
      });
      if (!stillExists) {
        focusedId = null;
      }
    }
    // Default to the first countdown if nothing is focused yet.
    if (focusedId === null && countdowns.length > 0) {
      focusedId = countdowns[0].id;
    }

    els.list.innerHTML = '';
    rowRecords = {};

    var others = countdowns.filter(function (t) {
      return t.id !== focusedId;
    });

    if (others.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'timers-view__empty';
      empty.textContent = countdowns.length === 0
        ? 'No countdowns yet. Create one above.'
        : 'No other countdowns.';
      els.list.appendChild(empty);
    } else {
      for (var i = 0; i < others.length; i++) {
        var timer = others[i];
        var record = buildRow(timer);
        rowRecords[timer.id] = record;
        els.list.appendChild(record.el);
      }
    }

    render();
  }

  // ---------------------------------------------------------------------
  // Per-tick display updates (cheap: no DOM rebuild, just text/segment
  // updates plus status/class toggles already present in the DOM).
  // ---------------------------------------------------------------------

  function updateRowDisplays() {
    var countdowns = getCountdowns();

    for (var i = 0; i < countdowns.length; i++) {
      var timer = countdowns[i];
      var record = rowRecords[timer.id];
      checkCompletion(timer);
      if (!record) {
        continue;
      }

      var ms = displayMsFor(timer);
      var str = formatDuration(ms);
      window.renderDigits(record.display, str);

      var done = TimerModel.isDone(timer);
      var label = statusLabel(timer);
      if (record.statusEl.textContent !== label) {
        record.statusEl.textContent = label;
      }
      record.toggleBtn.textContent = timer.status === 'paused' ? 'Resume' : 'Pause';
      record.toggleBtn.disabled = done;

      if (done && !dismissedIds[timer.id]) {
        Notify.flash(record.el, { duration: 0 });
      } else {
        Notify.stopFlash(record.el);
      }
      if (record.stopBtn) {
        record.stopBtn.hidden = !done || !!dismissedIds[timer.id];
      }
    }
  }

  // Fires the completion notification exactly once per completion, tracked
  // in-memory for this page's runtime. Runs regardless of whether the
  // countdown currently has a list row or focused display on screen, so a
  // countdown finishing while this pane is in compact mode still notifies.
  function checkCompletion(timer) {
    var done = TimerModel.isDone(timer);
    if (done && !notifiedIds[timer.id]) {
      notifiedIds[timer.id] = true;
      Notify.fire(els.focusedDisplay, timer.name + ' finished', timer.name + ' countdown has completed.');
    }
  }

  function updateFocusedDisplay() {
    var focusedTimer = focusedId !== null ? TimerModel.getById(focusedId) : null;

    if (focusedTimer && focusedTimer.type === 'countdown') {
      els.focusedTitle.textContent = focusedTimer.title || focusedTimer.name;
      els.focusedSubtitle.textContent = focusedTimer.subtitle || '';
      els.focusedSubtitle.hidden = !focusedTimer.subtitle;
      els.focusedLabel.textContent = focusedTimer.name + ' — ' + statusLabel(focusedTimer);
      var focusedStr = formatDuration(displayMsFor(focusedTimer));
      window.renderDigits(els.focusedDisplay, focusedStr);
      var focusedDone = TimerModel.isDone(focusedTimer);
      if (focusedDone && !dismissedIds[focusedTimer.id]) {
        Notify.flash(els.focusedDisplay, { duration: 0 });
      } else {
        Notify.stopFlash(els.focusedDisplay);
      }
      updateFocusedControls(focusedTimer, focusedDone);
    } else {
      els.focusedTitle.textContent = 'No countdown selected';
      els.focusedSubtitle.textContent = '';
      els.focusedSubtitle.hidden = true;
      els.focusedLabel.textContent = '';
      window.renderDigits(els.focusedDisplay, '--:--:--');
      Notify.stopFlash(els.focusedDisplay);
      updateFocusedControls(null, false);
    }
  }

  // Keeps the focused countdown's control row in sync: toggle label/disabled,
  // and the Stop (dismiss-flash) button visible only while it is finished and
  // not yet dismissed.
  function updateFocusedControls(timer, done) {
    if (!els.focusedControls) {
      return;
    }
    var hasTimer = !!timer;
    els.focusedControls.hidden = !hasTimer;
    if (!hasTimer) {
      return;
    }
    els.focusedToggle.textContent = timer.status === 'paused' ? 'Resume' : 'Pause';
    els.focusedToggle.disabled = done;
    els.focusedStop.hidden = !done || !!dismissedIds[timer.id];
  }

  // Renders whichever of the two modes (full vs compact) currently applies,
  // based on isPaneFocused. Both branches always update the focused
  // display + completion tracking; only the form/list visibility differs.
  function render() {
    if (!els.focusedSection) {
      return;
    }
    updateFocusedDisplay();
    if (els.form) {
      els.form.hidden = !isPaneFocused;
    }
    if (els.list) {
      els.list.hidden = !isPaneFocused;
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function init(container) {
    if (!container) {
      throw new Error('TimersView.init: container element is required');
    }
    container.innerHTML = '';
    els = {};
    focusedId = null;

    var root = document.createElement('div');
    root.className = 'timers-view';

    buildFocusedArea(root);
    buildForm(root);
    buildListArea(root);

    container.appendChild(root);

    renderList();
  }

  function tick() {
    if (!els.focusedSection) {
      return;
    }
    updateRowDisplays();
    updateFocusedDisplay();
  }

  function setPaneFocused(isFocused) {
    isPaneFocused = !!isFocused;
    render();
  }

  window.TimersView = {
    init: init,
    tick: tick,
    setPaneFocused: setPaneFocused
  };
})();
