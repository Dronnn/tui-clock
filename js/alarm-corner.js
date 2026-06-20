// alarm-corner.js
// Fixed bottom-right alarm corner widget. Replaces the old full-page
// AlarmsView: a small resting bell glyph + the next upcoming alarm's time,
// which opens an upward/leftward popover with the full alarm editor (list +
// "+ New" form). Plain global script, no ES modules — exposes
// window.AlarmCorner.
//
// Public API:
//   AlarmCorner.init(container)
//     - Builds the resting widget + popover DOM inside `container`
//       (#alarm-corner). Wires the outside-click-to-close handler (same
//       pattern as settings-panel.js). Called once from app.js boot().
//   AlarmCorner.tick()
//     - Called by the central ~250ms tick loop. Fires due enabled alarms
//       (AlarmModel.checkDue), guarding re-fire within the same minute via
//       an in-memory map, and refreshes the resting "next alarm" text only
//       when it actually changes.
//   AlarmCorner.open()
//     - Programmatically opens the same popover as the resting widget.
//
// Firing/dedup approach mirrors the old alarms-view: a module-level
// `lastFiredMinute` map (alarmId -> "HH:MM") kept in memory only, plus a
// once-per-real-second throttle so matching only runs at second granularity.

(function () {
  'use strict';

  var DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  var els = null; // populated by init(): references to built DOM nodes.
  var lastFiredMinute = {}; // alarmId -> "HH:MM" last fired, in-memory only.
  var lastCheckedSecond = -1; // throttle: only re-check once the wall-clock second changes.
  var lastNextText = null; // last rendered "next alarm" string, to skip redundant DOM writes.
  var hasCreatedFirstAlarm = false; // tracks whether we've requested notification permission yet.

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function describeDays(days) {
    if (!Array.isArray(days) || days.length === 0) {
      return '(no days)';
    }
    if (days.length === 7) {
      return 'EVERY DAY';
    }
    var sorted = days.slice().sort(function (a, b) { return a - b; });
    return sorted.map(function (d) { return DAY_LABELS[d]; }).join(' ');
  }

  // ---------------------------------------------------------------------
  // Next-alarm computation: soonest enabled alarm that will fire from now,
  // scanning forward up to 7 days. Returns the alarm + its label or null.
  // ---------------------------------------------------------------------

  function findNextAlarm(now) {
    var alarms = AlarmModel.getAll().filter(function (a) { return a.enabled; });
    if (alarms.length === 0) {
      return null;
    }

    var best = null;
    var bestDelta = Infinity;
    var nowMinutes = now.getHours() * 60 + now.getMinutes();
    var nowDay = now.getDay();

    alarms.forEach(function (alarm) {
      var parts = alarm.time.split(':');
      var alarmMinutes = Number(parts[0]) * 60 + Number(parts[1]);
      for (var offset = 0; offset < 8; offset++) {
        var day = (nowDay + offset) % 7;
        if (alarm.days.indexOf(day) === -1) {
          continue;
        }
        var delta = offset * 1440 + (alarmMinutes - nowMinutes);
        // Strictly future (the current matching minute fires now, not "next").
        if (delta <= 0) {
          continue;
        }
        if (delta < bestDelta) {
          bestDelta = delta;
          best = alarm;
        }
        break;
      }
    });

    return best;
  }

  function refreshNextText(now) {
    var next = findNextAlarm(now || new Date());
    var text = next ? next.time : 'no alarms';
    if (text === lastNextText) {
      return;
    }
    lastNextText = text;
    els.nextText.textContent = text;
    els.nextText.classList.toggle('is-empty', !next);
  }

  // ---------------------------------------------------------------------
  // Form (create new alarm)
  // ---------------------------------------------------------------------

  function buildForm() {
    var wrap = document.createElement('div');
    wrap.className = 'alarm-corner__new';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'alarm-corner__new-toggle';
    toggleBtn.textContent = '+ New';

    var form = document.createElement('form');
    form.className = 'alarm-corner__form';
    form.hidden = true;

    var timeLabel = document.createElement('label');
    timeLabel.className = 'alarm-corner__form-label';
    timeLabel.textContent = 'TIME';
    var timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'alarm-corner__time-input';
    timeInput.required = true;
    timeLabel.appendChild(timeInput);

    var daysWrap = document.createElement('div');
    daysWrap.className = 'alarm-corner__day-chips';
    var dayChips = [];
    DAY_LABELS.forEach(function (label, index) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'alarm-corner__day-chip is-active';
      chip.textContent = label;
      chip.dataset.day = String(index);
      chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', function () {
        var isActive = chip.classList.toggle('is-active');
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      daysWrap.appendChild(chip);
      dayChips.push(chip);
    });

    var titleLabel = document.createElement('label');
    titleLabel.className = 'alarm-corner__form-label';
    titleLabel.textContent = 'TITLE (optional)';
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'alarm-corner__text-input';
    titleInput.placeholder = 'e.g. Wake up';
    titleLabel.appendChild(titleInput);

    var subtitleLabel = document.createElement('label');
    subtitleLabel.className = 'alarm-corner__form-label';
    subtitleLabel.textContent = 'SUBTITLE (optional)';
    var subtitleInput = document.createElement('input');
    subtitleInput.type = 'text';
    subtitleInput.className = 'alarm-corner__text-input';
    subtitleInput.placeholder = 'e.g. Stretch + water';
    subtitleLabel.appendChild(subtitleInput);

    var enabledLabel = document.createElement('label');
    enabledLabel.className = 'alarm-corner__form-label alarm-corner__form-label--inline';
    var enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = true;
    enabledLabel.appendChild(enabledInput);
    enabledLabel.appendChild(document.createTextNode('ENABLED'));

    var errorEl = document.createElement('div');
    errorEl.className = 'alarm-corner__form-error';
    errorEl.hidden = true;

    var actions = document.createElement('div');
    actions.className = 'alarm-corner__form-actions';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'alarm-corner__form-submit';
    submitBtn.textContent = 'Create';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'alarm-corner__form-cancel';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);

    form.appendChild(timeLabel);
    form.appendChild(daysWrap);
    form.appendChild(titleLabel);
    form.appendChild(subtitleLabel);
    form.appendChild(enabledLabel);
    form.appendChild(errorEl);
    form.appendChild(actions);

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    function resetForm() {
      timeInput.value = '';
      titleInput.value = '';
      subtitleInput.value = '';
      dayChips.forEach(function (chip) {
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
      });
      enabledInput.checked = true;
      clearError();
    }

    function openForm() {
      form.hidden = false;
      toggleBtn.hidden = true;
      timeInput.focus();
    }

    function closeForm() {
      form.hidden = true;
      toggleBtn.hidden = false;
      resetForm();
    }

    toggleBtn.addEventListener('click', openForm);
    cancelBtn.addEventListener('click', closeForm);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError();

      var time = timeInput.value;
      if (!time) {
        showError('Please choose a time for the alarm.');
        return;
      }

      var selectedDays = dayChips
        .filter(function (chip) { return chip.classList.contains('is-active'); })
        .map(function (chip) { return Number(chip.dataset.day); });

      if (selectedDays.length === 0) {
        showError('Select at least one day.');
        return;
      }

      try {
        AlarmModel.create({
          time: time,
          days: selectedDays,
          enabled: enabledInput.checked,
          title: titleInput.value.trim(),
          subtitle: subtitleInput.value.trim()
        });
      } catch (err) {
        showError(err.message || 'Could not create alarm.');
        return;
      }

      if (!hasCreatedFirstAlarm) {
        hasCreatedFirstAlarm = true;
        Notify.requestPermissionIfNeeded();
      }

      closeForm();
      renderList();
      lastNextText = null; // force a refresh of the resting "next" text.
      refreshNextText();
    });

    els.formApi = { close: closeForm };
    wrap.appendChild(toggleBtn);
    wrap.appendChild(form);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // List rendering
  // ---------------------------------------------------------------------

  function buildRow(alarm) {
    var row = document.createElement('div');
    row.className = 'alarm-corner__row';
    row.dataset.id = alarm.id;
    if (!alarm.enabled) {
      row.classList.add('is-disabled');
    }

    var info = document.createElement('div');
    info.className = 'alarm-corner__row-info';

    var topLine = document.createElement('div');
    topLine.className = 'alarm-corner__row-line';

    var timeEl = document.createElement('span');
    timeEl.className = 'alarm-corner__row-time';
    timeEl.textContent = alarm.time;

    var daysEl = document.createElement('span');
    daysEl.className = 'alarm-corner__row-days';
    daysEl.textContent = describeDays(alarm.days);

    topLine.appendChild(timeEl);
    topLine.appendChild(daysEl);
    info.appendChild(topLine);

    if (alarm.title) {
      var titleEl = document.createElement('div');
      titleEl.className = 'alarm-corner__row-title';
      titleEl.textContent = alarm.title;
      info.appendChild(titleEl);
    }
    if (alarm.subtitle) {
      var subtitleEl = document.createElement('div');
      subtitleEl.className = 'alarm-corner__row-subtitle';
      subtitleEl.textContent = alarm.subtitle;
      info.appendChild(subtitleEl);
    }

    var enabledBtn = document.createElement('button');
    enabledBtn.type = 'button';
    enabledBtn.className = 'alarm-corner__row-toggle';
    enabledBtn.textContent = alarm.enabled ? 'ON' : 'OFF';
    enabledBtn.classList.toggle('is-on', alarm.enabled);
    enabledBtn.addEventListener('click', function () {
      AlarmModel.update(alarm.id, { enabled: !alarm.enabled });
      renderList();
      lastNextText = null;
      refreshNextText();
    });

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'alarm-corner__row-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
      AlarmModel.delete(alarm.id);
      delete lastFiredMinute[alarm.id];
      renderList();
      lastNextText = null;
      refreshNextText();
    });

    row.appendChild(info);
    row.appendChild(enabledBtn);
    row.appendChild(deleteBtn);

    return row;
  }

  function renderList() {
    var listEl = els.list;
    listEl.innerHTML = '';
    var alarms = AlarmModel.getAll();

    if (alarms.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'alarm-corner__empty';
      empty.textContent = 'No alarms yet.';
      listEl.appendChild(empty);
      return;
    }

    alarms.forEach(function (alarm) {
      listEl.appendChild(buildRow(alarm));
    });
  }

  // ---------------------------------------------------------------------
  // Popover open/close (outside-click pattern from settings-panel.js)
  // ---------------------------------------------------------------------

  function isOpen() {
    return els.popover.classList.contains('is-open');
  }

  function openPopover() {
    els.popover.classList.add('is-open');
    els.button.classList.add('is-active');
  }

  function closePopover() {
    els.popover.classList.remove('is-open');
    els.button.classList.remove('is-active');
  }

  function togglePopover() {
    if (isOpen()) {
      closePopover();
    } else {
      renderList();
      openPopover();
    }
  }

  function onDocumentClick(event) {
    if (!els.container.contains(event.target)) {
      closePopover();
    }
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function open() {
    if (!els) {
      return;
    }
    renderList();
    openPopover();
  }

  function init(container) {
    if (!container) {
      throw new Error('AlarmCorner.init: container element is required');
    }

    container.innerHTML = '';
    container.classList.add('alarm-corner');

    els = {
      container: container,
      button: null,
      bell: null,
      nextText: null,
      popover: null,
      list: null,
      formApi: null
    };

    // Resting widget: bell glyph + next-alarm time.
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'alarm-corner__button';
    button.setAttribute('aria-label', 'Alarms');

    var bell = document.createElement('span');
    bell.className = 'alarm-corner__bell';
    bell.textContent = '⏰'; // ⏰

    var nextText = document.createElement('span');
    nextText.className = 'alarm-corner__next';

    button.appendChild(bell);
    button.appendChild(nextText);
    container.appendChild(button);

    // Popover (opens upward/leftward via CSS bottom/right anchoring).
    var popover = document.createElement('div');
    popover.className = 'alarm-corner__popover';

    var heading = document.createElement('div');
    heading.className = 'alarm-corner__heading';
    heading.textContent = 'Alarms';
    popover.appendChild(heading);

    els.button = button;
    els.bell = bell;
    els.nextText = nextText;
    els.popover = popover;

    popover.appendChild(buildForm());

    var listEl = document.createElement('div');
    listEl.className = 'alarm-corner__list';
    popover.appendChild(listEl);
    els.list = listEl;

    container.appendChild(popover);

    button.addEventListener('click', function (event) {
      event.stopPropagation();
      togglePopover();
    });
    document.addEventListener('click', onDocumentClick);

    renderList();
    refreshNextText();
  }

  function tick() {
    if (!els) {
      return; // init() hasn't run yet.
    }

    var now = new Date();
    var second = now.getSeconds();
    if (second === lastCheckedSecond) {
      return; // Throttle: only re-check once per real second.
    }
    lastCheckedSecond = second;

    var nowHHMM = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    var alarms = AlarmModel.getAll();

    alarms.forEach(function (alarm) {
      if (!AlarmModel.checkDue(alarm, now)) {
        return;
      }
      if (lastFiredMinute[alarm.id] === nowHHMM) {
        return; // Already fired for this exact matching minute.
      }
      lastFiredMinute[alarm.id] = nowHHMM;

      var title = 'Alarm: ' + alarm.time + (alarm.title ? ' — ' + alarm.title : '');
      var body = alarm.subtitle || describeDays(alarm.days);
      Notify.fire(els.button, title, body);
    });

    refreshNextText(now);
  }

  window.AlarmCorner = {
    init: init,
    open: open,
    tick: tick
  };
})();
