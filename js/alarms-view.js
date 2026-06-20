// alarms-view.js
// List UI for recurring alarms: create form (time + day-of-week chips +
// enabled toggle), list rows with enabled toggle/delete, and the firing
// logic that checks alarms against the current time on every tick. Plain
// global script, no ES modules — exposes window.AlarmsView.
//
// Public API:
//   AlarmsView.init(container)
//     - Builds all DOM inside `container` (the "+ New" control/form, the
//       dismissible firing banner, and the alarm list). No auto-run; the
//       app.js boot sequence calls this once.
//   AlarmsView.tick()
//     - Called periodically by the central tick loop (every ~250ms). Cheap
//       no-op unless the current second has actually advanced since the
//       last call (throttled internally), since alarm matching only needs
//       once-per-second granularity per the spec. On a fresh HH:MM match
//       for an enabled alarm, fires notify.js (flash+beep+notification) and
//       shows a dismissible banner. Guards against re-firing the same
//       alarm repeatedly within the same matching minute.
//
// Firing/dedup approach:
//   A module-level `lastFiredMinute` map (alarmId -> "HH:MM" last fired) is
//   kept in memory only (not persisted — the spec only requires not
//   re-firing within the same session/minute, so in-memory state that
//   resets on reload is sufficient and simpler than persisting it). On each
//   throttled check, an alarm only fires if AlarmModel.checkDue(...) is true
//   AND lastFiredMinute[alarm.id] !== currentHHMM; once fired, that map is
//   updated immediately so subsequent ticks within the same minute skip it.

(function () {
  'use strict';

  var DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  var els = null; // populated by init(): references to built DOM nodes.
  var lastFiredMinute = {}; // alarmId -> "HH:MM" last fired, in-memory only.
  var lastCheckedSecond = -1; // throttle: only re-check once the wall-clock second changes.
  var hasCreatedFirstAlarm = false; // tracks whether we've already lazily requested notification permission.

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
  // Form (create new alarm)
  // ---------------------------------------------------------------------

  function buildForm(container) {
    var wrap = document.createElement('div');
    wrap.className = 'alarms-view__new';

    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'alarms-view__new-toggle';
    toggleBtn.textContent = '+ New';

    var form = document.createElement('form');
    form.className = 'alarms-view__form';
    form.hidden = true;

    var timeLabel = document.createElement('label');
    timeLabel.className = 'alarms-view__form-label';
    timeLabel.textContent = 'TIME';
    var timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'alarms-view__time-input';
    timeInput.required = true;
    timeLabel.appendChild(timeInput);

    var daysWrap = document.createElement('div');
    daysWrap.className = 'alarms-view__day-chips';
    var dayCheckboxes = [];
    DAY_LABELS.forEach(function (label, index) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'alarms-view__day-chip is-active';
      chip.textContent = label;
      chip.dataset.day = String(index);
      chip.setAttribute('aria-pressed', 'true');
      chip.addEventListener('click', function () {
        var isActive = chip.classList.toggle('is-active');
        chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      daysWrap.appendChild(chip);
      dayCheckboxes.push(chip);
    });

    var enabledLabel = document.createElement('label');
    enabledLabel.className = 'alarms-view__form-label alarms-view__form-label--inline';
    var enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = true;
    enabledLabel.appendChild(enabledInput);
    enabledLabel.appendChild(document.createTextNode('ENABLED'));

    var errorEl = document.createElement('div');
    errorEl.className = 'alarms-view__form-error';
    errorEl.hidden = true;

    var actions = document.createElement('div');
    actions.className = 'alarms-view__form-actions';
    var submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'alarms-view__form-submit';
    submitBtn.textContent = 'Create';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'alarms-view__form-cancel';
    cancelBtn.textContent = 'Cancel';
    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);

    form.appendChild(timeLabel);
    form.appendChild(daysWrap);
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
      dayCheckboxes.forEach(function (chip) {
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

      var selectedDays = dayCheckboxes
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
          enabled: enabledInput.checked
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
    });

    wrap.appendChild(toggleBtn);
    wrap.appendChild(form);
    container.appendChild(wrap);
  }

  // ---------------------------------------------------------------------
  // Firing banner
  // ---------------------------------------------------------------------

  function buildBanner(container) {
    var banner = document.createElement('div');
    banner.className = 'alarms-view__banner';
    banner.hidden = true;

    var text = document.createElement('span');
    text.className = 'alarms-view__banner-text';

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'alarms-view__banner-dismiss';
    dismissBtn.textContent = 'Dismiss';

    banner.appendChild(text);
    banner.appendChild(dismissBtn);
    container.appendChild(banner);

    return { banner: banner, text: text, dismissBtn: dismissBtn, rowEl: null };
  }

  function showBanner(alarm, rowEl) {
    var b = els.bannerState;
    b.text.textContent = 'Alarm ' + alarm.time + ' is going off.';
    b.banner.hidden = false;
    b.rowEl = rowEl;

    var dismiss = function () {
      if (b.rowEl) {
        Notify.stopFlash(b.rowEl);
      }
      b.banner.hidden = true;
      b.rowEl = null;
    };
    // Replace the dismiss handler each time so it always closes over the
    // currently-firing row rather than stacking duplicate listeners.
    b.dismissBtn.onclick = dismiss;
  }

  // ---------------------------------------------------------------------
  // List rendering
  // ---------------------------------------------------------------------

  function buildRow(alarm) {
    var row = document.createElement('div');
    row.className = 'alarms-view__row';
    row.dataset.id = alarm.id;
    if (!alarm.enabled) {
      row.classList.add('is-disabled');
    }

    var timeEl = document.createElement('span');
    timeEl.className = 'alarms-view__row-time';
    timeEl.textContent = alarm.time;

    var daysEl = document.createElement('span');
    daysEl.className = 'alarms-view__row-days';
    daysEl.textContent = describeDays(alarm.days);

    var enabledBtn = document.createElement('button');
    enabledBtn.type = 'button';
    enabledBtn.className = 'alarms-view__row-toggle';
    enabledBtn.textContent = alarm.enabled ? 'ON' : 'OFF';
    enabledBtn.classList.toggle('is-on', alarm.enabled);
    enabledBtn.addEventListener('click', function () {
      AlarmModel.update(alarm.id, { enabled: !alarm.enabled });
      renderList();
    });

    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'alarms-view__row-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
      AlarmModel.delete(alarm.id);
      delete lastFiredMinute[alarm.id];
      renderList();
    });

    row.appendChild(timeEl);
    row.appendChild(daysEl);
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
      empty.className = 'alarms-view__empty';
      empty.textContent = 'No alarms yet.';
      listEl.appendChild(empty);
      return;
    }

    alarms.forEach(function (alarm) {
      listEl.appendChild(buildRow(alarm));
    });
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function init(container) {
    container.innerHTML = '';

    els = {
      list: null,
      bannerState: null
    };

    var bannerState = buildBanner(container);
    els.bannerState = bannerState;

    buildForm(container);

    var listEl = document.createElement('div');
    listEl.className = 'alarms-view__list';
    container.appendChild(listEl);
    els.list = listEl;

    renderList();
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
      if (!alarm.enabled) {
        return;
      }
      if (!AlarmModel.checkDue(alarm, now)) {
        return;
      }
      if (lastFiredMinute[alarm.id] === nowHHMM) {
        return; // Already fired for this exact matching minute.
      }
      lastFiredMinute[alarm.id] = nowHHMM;

      var rowEl = els.list.querySelector('[data-id="' + alarm.id + '"]');
      Notify.fire(rowEl, 'Alarm: ' + alarm.time, describeDays(alarm.days));
      showBanner(alarm, rowEl);
    });
  }

  window.AlarmsView = {
    init: init,
    tick: tick
  };
})();
