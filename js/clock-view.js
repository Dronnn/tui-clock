// clock-view.js
// Current-time view: big segment display of "now", a format-cycling control,
// a timezone selector, and a keyboard shortcut ('f') to cycle format while
// this view is active. Plain global script, no ES modules — exposes
// window.ClockView.
//
// Public API:
//   ClockView.init(container)
//     - container: the view's mount element (e.g. #view-clock).
//     - Builds the DOM (segment-display mount + control row), restores
//       persisted format/timezone from Storage('prefs'), attaches listeners.
//     - Does NOT render automatically on script load and does NOT call
//       Storage/DOM APIs until invoked — app.js owns calling this once, on
//       boot.
//   ClockView.tick()
//     - Meant to be called roughly once per second by app.js's central tick
//       loop. Computes "now" in the selected timezone, formats it per the
//       current format mode, and renders it via renderDigits.
//     - Safe to call before init() (no-ops if not yet initialized).
//
// Persistence: reads/writes the 'prefs' object in Storage, merging with
// whatever else may already be stored there (e.g. future keys owned by
// other views) — never overwrites unrelated fields.

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Format modes
  // ---------------------------------------------------------------------

  // Cycle order: 24h -> 12h (AM/PM) -> 24h+date -> 12h+date -> back to 24h.
  var FORMAT_MODES = ['24H', '12H', '24H_DATE', '12H_DATE'];

  var LOCAL_ZONE = 'LOCAL'; // special marker meaning "no explicit timeZone option"

  var MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // ---------------------------------------------------------------------
  // Module state (one Clock view per page, matching the other foundation
  // modules' single-mount-point assumption).
  // ---------------------------------------------------------------------

  var state = {
    initialized: false,
    container: null,
    displayMount: null,
    formatButton: null,
    timezoneSelect: null,
    titleInput: null,
    subtitleInput: null,
    titleEl: null,
    subtitleEl: null,
    formatMode: FORMAT_MODES[0],
    timezone: LOCAL_ZONE,
    title: '',
    subtitle: ''
  };

  // ---------------------------------------------------------------------
  // Prefs persistence (read-merge-write so unrelated fields survive)
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
  // Time formatting
  // ---------------------------------------------------------------------

  // Builds an Intl.DateTimeFormat for the given timezone (or none for
  // LOCAL_ZONE), requesting the parts we need regardless of locale, and
  // returns a lookup of part type -> value for "now".
  function getParts(timezone) {
    var options = {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      hourCycle: 'h12'
    };
    if (timezone !== LOCAL_ZONE) {
      options.timeZone = timezone;
    }
    var formatter = new Intl.DateTimeFormat('en-US', options);
    var parts = formatter.formatToParts(new Date());
    var lookup = {};
    for (var i = 0; i < parts.length; i++) {
      lookup[parts[i].type] = parts[i].value;
    }
    return lookup;
  }

  function pad2(n) {
    var s = String(n);
    return s.length < 2 ? '0' + s : s;
  }

  // Computes 24h hour/minute/second independent of the 12h parts Intl gives
  // us, so the 24h formats don't depend on locale hour-cycle quirks.
  function get24Parts(timezone) {
    var options = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    };
    if (timezone !== LOCAL_ZONE) {
      options.timeZone = timezone;
    }
    var formatter = new Intl.DateTimeFormat('en-US', options);
    var parts = formatter.formatToParts(new Date());
    var lookup = {};
    for (var i = 0; i < parts.length; i++) {
      lookup[parts[i].type] = parts[i].value;
    }
    return lookup;
  }

  // Formats "now" in the given timezone according to formatMode. Returns an
  // uppercase string ready for the active digit renderer. The segment
  // renderer supports digits, A-Z, ':', '.', and space; alternate renderers
  // may support a narrower glyph set.
  function formatNow(formatMode, timezone) {
    var parts12 = getParts(timezone);
    var parts24 = get24Parts(timezone);

    var hh24 = pad2(parts24.hour);
    var mm = pad2(parts24.minute);
    var ss = pad2(parts24.second);

    var hh12 = pad2(parts12.hour === '24' ? '12' : parts12.hour); // h12 already gives 1-12, guard just in case
    var ampm = (parts12.dayPeriod || '').toUpperCase(); // 'AM' / 'PM'

    var timeStr24 = hh24 + ':' + mm + ':' + ss;
    var timeStr12 = hh12 + ':' + mm + ':' + ss + ' ' + ampm;

    var weekday = (parts12.weekday || '').toUpperCase().slice(0, 3);
    var month = (parts12.month || '').toUpperCase().slice(0, 3);
    var day = pad2(parts12.day);
    var year = parts12.year;
    var dateStr = weekday + ' ' + day + ' ' + month + ' ' + year;

    switch (formatMode) {
      case '24H':
        return timeStr24;
      case '12H':
        return timeStr12;
      case '24H_DATE':
        return dateStr + '  ' + timeStr24;
      case '12H_DATE':
        return dateStr + '  ' + timeStr12;
      default:
        return timeStr24;
    }
  }

  // ---------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------

  function formatButtonLabel(formatMode) {
    switch (formatMode) {
      case '24H':
        return 'FORMAT: 24H';
      case '12H':
        return 'FORMAT: 12H';
      case '24H_DATE':
        return 'FORMAT: 24H + DATE';
      case '12H_DATE':
        return 'FORMAT: 12H + DATE';
      default:
        return 'FORMAT';
    }
  }

  function buildTimezoneOptions(selectEl, selectedZone) {
    selectEl.innerHTML = '';

    var localOption = document.createElement('option');
    localOption.value = LOCAL_ZONE;
    localOption.textContent = 'Local';
    selectEl.appendChild(localOption);

    var zones = [];
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        zones = Intl.supportedValuesOf('timeZone');
      }
    } catch (err) {
      zones = [];
    }

    for (var i = 0; i < zones.length; i++) {
      var option = document.createElement('option');
      option.value = zones[i];
      option.textContent = zones[i];
      selectEl.appendChild(option);
    }

    // If the persisted zone isn't in the supported list (e.g. browser
    // without Intl.supportedValuesOf, or a stale/removed zone), fall back
    // to Local rather than leaving the select on a missing value.
    var hasZone = selectedZone === LOCAL_ZONE;
    if (!hasZone) {
      for (var j = 0; j < selectEl.options.length; j++) {
        if (selectEl.options[j].value === selectedZone) {
          hasZone = true;
          break;
        }
      }
    }
    selectEl.value = hasZone ? selectedZone : LOCAL_ZONE;
    if (!hasZone) {
      state.timezone = LOCAL_ZONE;
    }
  }

  function buildViewfinderFrame() {
    var frame = document.createElement('div');
    frame.className = 'viewfinder-frame';

    var corners = ['tl', 'tr', 'bl', 'br'];
    for (var i = 0; i < corners.length; i++) {
      var corner = document.createElement('div');
      corner.className = 'viewfinder-frame__corner viewfinder-frame__corner--' + corners[i];
      frame.appendChild(corner);
    }

    return frame;
  }

  function buildDom(container) {
    container.innerHTML = '';

    var titleEl = document.createElement('div');
    titleEl.className = 'clock-view__title';

    var frame = buildViewfinderFrame();

    var displayMount = document.createElement('div');
    displayMount.className = 'segment-display clock-view__display';
    frame.appendChild(displayMount);

    var subtitleEl = document.createElement('div');
    subtitleEl.className = 'clock-view__subtitle';

    container.appendChild(titleEl);
    container.appendChild(frame);
    container.appendChild(subtitleEl);

    var controls = document.createElement('div');
    controls.className = 'clock-view__controls';

    var formatButton = document.createElement('button');
    formatButton.type = 'button';
    formatButton.className = 'clock-view__format-btn';
    controls.appendChild(formatButton);

    var timezoneLabel = document.createElement('label');
    timezoneLabel.className = 'clock-view__timezone-label';
    timezoneLabel.textContent = 'TIMEZONE:';

    var timezoneSelect = document.createElement('select');
    timezoneSelect.className = 'clock-view__timezone-select';
    timezoneLabel.appendChild(timezoneSelect);
    controls.appendChild(timezoneLabel);

    var titleFieldLabel = document.createElement('label');
    titleFieldLabel.className = 'clock-view__field-label';
    titleFieldLabel.textContent = 'TITLE:';
    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'clock-view__text-input';
    titleInput.placeholder = 'e.g. NEXT STREAM';
    titleFieldLabel.appendChild(titleInput);
    controls.appendChild(titleFieldLabel);

    var subtitleFieldLabel = document.createElement('label');
    subtitleFieldLabel.className = 'clock-view__field-label';
    subtitleFieldLabel.textContent = 'SUBTITLE:';
    var subtitleInput = document.createElement('input');
    subtitleInput.type = 'text';
    subtitleInput.className = 'clock-view__text-input';
    subtitleInput.placeholder = 'e.g. starting soon';
    subtitleFieldLabel.appendChild(subtitleInput);
    controls.appendChild(subtitleFieldLabel);

    container.appendChild(controls);

    state.displayMount = displayMount;
    state.formatButton = formatButton;
    state.timezoneSelect = timezoneSelect;
    state.titleInput = titleInput;
    state.subtitleInput = subtitleInput;
    state.titleEl = titleEl;
    state.subtitleEl = subtitleEl;
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  function cycleFormat() {
    var currentIndex = FORMAT_MODES.indexOf(state.formatMode);
    var nextIndex = (currentIndex + 1) % FORMAT_MODES.length;
    state.formatMode = FORMAT_MODES[nextIndex];
    state.formatButton.textContent = formatButtonLabel(state.formatMode);
    savePrefs({ clockFormat: state.formatMode });
    renderNow();
  }

  function onTimezoneChange() {
    state.timezone = state.timezoneSelect.value;
    savePrefs({ timezone: state.timezone });
    renderNow();
  }

  function onTitleInput() {
    state.title = state.titleInput.value;
    savePrefs({ clockTitle: state.title });
    renderLabels();
  }

  function onSubtitleInput() {
    state.subtitle = state.subtitleInput.value;
    savePrefs({ clockSubtitle: state.subtitle });
    renderLabels();
  }

  // Renders the free-text title (above) and subtitle (below) the digits,
  // hiding each element when its text is empty.
  function renderLabels() {
    if (!state.titleEl || !state.subtitleEl) {
      return;
    }
    var title = (state.title || '').trim();
    state.titleEl.textContent = title;
    state.titleEl.style.display = title ? '' : 'none';

    var subtitle = (state.subtitle || '').trim();
    state.subtitleEl.textContent = subtitle;
    state.subtitleEl.style.display = subtitle ? '' : 'none';
  }

  // Reasonable self-contained "is this view currently the big, focused
  // pane" check, matching the .pane--focused convention used by
  // index.html/style.css. app.js owns the real C/D/T mode-switching logic;
  // this just avoids cycling the format from the minor clock widget's
  // keydown handler when some other pane is focused.
  function isViewActive() {
    if (!state.container) {
      return false;
    }
    return state.container.classList.contains('pane--focused');
  }

  function onKeyDown(event) {
    if (!isViewActive()) {
      return;
    }
    // Ignore the shortcut while focus is in a form control, so typing into
    // the (future) timer/alarm forms elsewhere never gets eaten by this
    // view's global listener.
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    if (event.key === 'f' || event.key === 'F') {
      cycleFormat();
    }
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  function renderNow() {
    if (!state.initialized) {
      return;
    }
    var str = formatNow(state.formatMode, state.timezone);
    window.renderDigits(state.displayMount, str);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function init(container) {
    if (!container) {
      throw new Error('ClockView.init: container element is required');
    }

    var prefs = loadPrefs();
    state.formatMode = FORMAT_MODES.indexOf(prefs.clockFormat) !== -1 ? prefs.clockFormat : FORMAT_MODES[0];
    state.timezone = typeof prefs.timezone === 'string' ? prefs.timezone : LOCAL_ZONE;
    state.title = typeof prefs.clockTitle === 'string' ? prefs.clockTitle : '';
    state.subtitle = typeof prefs.clockSubtitle === 'string' ? prefs.clockSubtitle : '';

    state.container = container;
    buildDom(container);

    state.formatButton.textContent = formatButtonLabel(state.formatMode);
    state.formatButton.addEventListener('click', cycleFormat);

    buildTimezoneOptions(state.timezoneSelect, state.timezone);
    state.timezoneSelect.addEventListener('change', onTimezoneChange);

    state.titleInput.value = state.title;
    state.subtitleInput.value = state.subtitle;
    state.titleInput.addEventListener('input', onTitleInput);
    state.subtitleInput.addEventListener('input', onSubtitleInput);

    document.addEventListener('keydown', onKeyDown);

    state.initialized = true;
    renderLabels();
    renderNow();
  }

  function tick() {
    renderNow();
  }

  window.ClockView = {
    init: init,
    tick: tick
  };
})();
