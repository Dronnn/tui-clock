// timer-stopwatch-view.js
// Stopwatch-only pane UI: an always-visible new-stopwatch form, a big
// focused display for whichever stopwatch is currently selected within
// this pane, and a compact list of the other stopwatch instances. Builds
// all DOM with plain DOM APIs (createElement/classList/dataset), consistent
// with how segment-display.js builds its own nodes. Plain global script,
// no ES modules — exposes window.TimerStopwatchView.
//
// Structural sibling of timers-view.js, but stopwatches never "complete"
// (no targetDuration, no done state, no Notify.fire calls) — they just
// count up from creation until paused/reset/deleted. Uses its own
// timer-stopwatch-view__* CSS classes rather than reusing timers-view__*,
// so the two panes can be restyled independently later.
//
// "Focused within this pane" is a separate concept from the page-level
// focused/minor pane distinction app.js manages: even when this whole pane
// is shrunk to a small page-level widget, one stopwatch is still considered
// the pane's own focused stopwatch, it just renders compactly instead of
// with the full form/list.
//
// Public API:
//   TimerStopwatchView.init(container)
//     - Builds the form, the big focused display, and the list inside
//       `container`. Does not auto-run; app.js calls this once during boot.
//   TimerStopwatchView.tick()
//     - Called ~every 250ms by the central tick loop (app.js). Recomputes
//       elapsed time for every stopwatch and updates the small per-row
//       segment displays plus the big focused display.
//   TimerStopwatchView.setPaneFocused(isFocused)
//     - Tells this view whether the page currently has this pane focused
//       (large) or minor (small widget). When not focused, render() shows
//       only a compact summary of the within-pane-focused stopwatch — no
//       form, no list. Defaults to true (full UI) before this is ever
//       called.

(function () {
  'use strict';

  // Module-scoped runtime state (not persisted — rebuilt from TimerModel
  // data on every init()).
  var els = {};
  var focusedId = null;
  var isPaneFocused = true;

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // Always HH:MM:SS for consistency, matching timers-view.js.
  function formatDuration(ms) {
    var totalSeconds = Math.floor(ms / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return pad2(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
  }

  function displayMsFor(timer) {
    return TimerModel.getElapsedMs(timer);
  }

  function getStopwatches() {
    return TimerModel.getAll().filter(function (t) {
      return t.type === 'stopwatch';
    });
  }

  // ---------------------------------------------------------------------
  // Form: build + wire the always-visible new-stopwatch form
  // ---------------------------------------------------------------------

  function buildForm(container) {
    var form = document.createElement('form');
    form.className = 'timer-stopwatch-view__form';

    var nameLabel = document.createElement('label');
    nameLabel.className = 'timer-stopwatch-view__form-field';
    nameLabel.textContent = 'Name';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'timer-stopwatch-view__form-input';
    nameInput.placeholder = 'Stopwatch name';
    nameInput.maxLength = 40;
    nameLabel.appendChild(nameInput);

    var titleLabel = document.createElement('label');
    titleLabel.className = 'timer-stopwatch-view__form-field';
    titleLabel.textContent = 'Title (optional)';
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'timer-stopwatch-view__form-input';
    titleInput.placeholder = 'Title';
    titleInput.maxLength = 60;
    titleLabel.appendChild(titleInput);

    var subtitleLabel = document.createElement('label');
    subtitleLabel.className = 'timer-stopwatch-view__form-field';
    subtitleLabel.textContent = 'Subtitle (optional)';
    var subtitleInput = document.createElement('input');
    subtitleInput.type = 'text';
    subtitleInput.className = 'timer-stopwatch-view__form-input';
    subtitleInput.placeholder = 'Subtitle';
    subtitleInput.maxLength = 60;
    subtitleLabel.appendChild(subtitleInput);

    var errorEl = document.createElement('div');
    errorEl.className = 'timer-stopwatch-view__form-error';
    errorEl.hidden = true;

    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'timer-stopwatch-view__form-submit';
    submitBtn.textContent = 'Start';

    var actions = document.createElement('div');
    actions.className = 'timer-stopwatch-view__form-actions';
    actions.appendChild(submitBtn);

    form.appendChild(nameLabel);
    form.appendChild(titleLabel);
    form.appendChild(subtitleLabel);
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

      var name = nameInput.value.trim();
      if (!name) {
        setError('Name is required.');
        nameInput.focus();
        return;
      }

      var timer;
      try {
        timer = TimerModel.create({
          name: name,
          type: 'stopwatch',
          title: titleInput.value,
          subtitle: subtitleInput.value
        });
      } catch (err) {
        setError(err && err.message ? err.message : 'Could not create stopwatch.');
        return;
      }

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
    section.className = 'timer-stopwatch-view__focused';

    var title = document.createElement('div');
    title.className = 'timer-stopwatch-view__focused-title';
    title.textContent = 'No stopwatch selected';

    var subtitleEl = document.createElement('div');
    subtitleEl.className = 'timer-stopwatch-view__focused-subtitle';

    var display = document.createElement('div');
    display.className = 'segment-display timer-stopwatch-view__focused-display';

    var labelEl = document.createElement('div');
    labelEl.className = 'timer-stopwatch-view__focused-label';

    section.appendChild(title);
    section.appendChild(display);
    section.appendChild(subtitleEl);
    section.appendChild(labelEl);
    container.appendChild(section);

    els.focusedSection = section;
    els.focusedTitle = title;
    els.focusedSubtitle = subtitleEl;
    els.focusedDisplay = display;
    els.focusedLabel = labelEl;
  }

  // ---------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------

  function buildListArea(container) {
    var list = document.createElement('div');
    list.className = 'timer-stopwatch-view__list';
    container.appendChild(list);
    els.list = list;
  }

  function statusLabel(timer) {
    return timer.status === 'paused' ? 'PAUSED' : 'RUNNING';
  }

  function buildRow(timer) {
    var row = document.createElement('div');
    row.className = 'timer-stopwatch-view__row';
    row.dataset.timerId = timer.id;

    var info = document.createElement('div');
    info.className = 'timer-stopwatch-view__row-info';

    var nameEl = document.createElement('div');
    nameEl.className = 'timer-stopwatch-view__row-name';
    nameEl.textContent = timer.name;

    var statusEl = document.createElement('div');
    statusEl.className = 'timer-stopwatch-view__row-status';
    statusEl.textContent = statusLabel(timer);

    info.appendChild(nameEl);
    info.appendChild(statusEl);

    var display = document.createElement('div');
    display.className = 'segment-display timer-stopwatch-view__row-display';

    var controls = document.createElement('div');
    controls.className = 'timer-stopwatch-view__row-controls';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'timer-stopwatch-view__row-btn timer-stopwatch-view__row-toggle';

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'timer-stopwatch-view__row-btn timer-stopwatch-view__row-reset';
    resetBtn.textContent = 'Reset';

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'timer-stopwatch-view__row-btn timer-stopwatch-view__row-delete';
    deleteBtn.textContent = 'Delete';

    controls.appendChild(toggleBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(deleteBtn);

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
      TimerModel.reset(timer.id);
      renderList();
    });

    deleteBtn.addEventListener('click', function (event) {
      event.stopPropagation();
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
      toggleBtn: toggleBtn
    };
  }

  // Cache of row records keyed by timer id, so tick() can update displays
  // without rebuilding DOM every 250ms. Rebuilt whenever renderList() runs
  // (creation/deletion/pause/resume/reset/focus-change), which are all
  // low-frequency user actions.
  var rowRecords = {};

  function renderList() {
    var stopwatches = getStopwatches();

    // Clear any focused id that no longer exists.
    if (focusedId !== null) {
      var stillExists = stopwatches.some(function (t) {
        return t.id === focusedId;
      });
      if (!stillExists) {
        focusedId = null;
      }
    }
    // Default to the first stopwatch if nothing is focused yet.
    if (focusedId === null && stopwatches.length > 0) {
      focusedId = stopwatches[0].id;
    }

    els.list.innerHTML = '';
    rowRecords = {};

    var others = stopwatches.filter(function (t) {
      return t.id !== focusedId;
    });

    if (others.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'timer-stopwatch-view__empty';
      empty.textContent = stopwatches.length === 0
        ? 'No stopwatches yet. Create one above.'
        : 'No other stopwatches.';
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
  // updates plus status toggles already present in the DOM).
  // ---------------------------------------------------------------------

  function updateRowDisplays() {
    var stopwatches = getStopwatches();

    for (var i = 0; i < stopwatches.length; i++) {
      var timer = stopwatches[i];
      var record = rowRecords[timer.id];
      if (!record) {
        continue;
      }

      var str = formatDuration(displayMsFor(timer));
      renderSegmentString(record.display, str);

      var label = statusLabel(timer);
      if (record.statusEl.textContent !== label) {
        record.statusEl.textContent = label;
      }
      record.toggleBtn.textContent = timer.status === 'paused' ? 'Resume' : 'Pause';
    }
  }

  function updateFocusedDisplay() {
    var focusedTimer = focusedId !== null ? TimerModel.getById(focusedId) : null;

    if (focusedTimer && focusedTimer.type === 'stopwatch') {
      els.focusedTitle.textContent = focusedTimer.title || focusedTimer.name;
      els.focusedSubtitle.textContent = focusedTimer.subtitle || '';
      els.focusedSubtitle.hidden = !focusedTimer.subtitle;
      els.focusedLabel.textContent = focusedTimer.name + ' — ' + statusLabel(focusedTimer);
      var focusedStr = formatDuration(displayMsFor(focusedTimer));
      renderSegmentString(els.focusedDisplay, focusedStr);
    } else {
      els.focusedTitle.textContent = 'No stopwatch selected';
      els.focusedSubtitle.textContent = '';
      els.focusedSubtitle.hidden = true;
      els.focusedLabel.textContent = '';
      renderSegmentString(els.focusedDisplay, '--:--:--');
    }
  }

  // Renders whichever of the two modes (full vs compact) currently applies,
  // based on isPaneFocused. Both branches always update the focused
  // display; only the form/list visibility differs.
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
      throw new Error('TimerStopwatchView.init: container element is required');
    }
    container.innerHTML = '';
    els = {};
    focusedId = null;

    var root = document.createElement('div');
    root.className = 'timer-stopwatch-view';

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

  window.TimerStopwatchView = {
    init: init,
    tick: tick,
    setPaneFocused: setPaneFocused
  };
})();
