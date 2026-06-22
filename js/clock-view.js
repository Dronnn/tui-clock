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

  // The display string is composed from independent, separately-persisted
  // pieces rather than a fixed cycle of modes:
  //   timeFormat:   '24H' | '12H'
  //   datePosition: 'off'    -> time only
  //                 'before' -> date, then time
  //                 'after'  -> time, then date
  //   showWeekday:  include the weekday abbreviation in the date
  //   monthNumeric: month as a number (06) instead of a word (JUN)
  //   showSeconds:  include seconds in the time
  var TIME_FORMATS = ['24H', '12H'];
  var DATE_POSITIONS = ['off', 'before', 'after'];

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
    datePositionSelect: null,
    weekdayInput: null,
    monthNumericInput: null,
    secondsInput: null,
    splitInput: null,
    timezoneSelect: null,
    titleInput: null,
    subtitleInput: null,
    titleEl: null,
    subtitleEl: null,
    timeFormat: TIME_FORMATS[0],
    datePosition: 'off',
    showWeekday: true,
    monthNumeric: false,
    showSeconds: true,
    splitDateTime: false,
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

  // Maps a short month name ("Jun") to its two-digit number ("06").
  function monthNumberFor(shortMonth) {
    var idx = MONTH_ABBR.indexOf((shortMonth || '').toUpperCase().slice(0, 3));
    return idx === -1 ? '00' : pad2(idx + 1);
  }

  // Reports what the currently selected font can render, so the clock can fall
  // back to a numeric-only format (fonts without letters) and an alternate time
  // separator (fonts without ':'). Non-figlet renderers support the full set.
  function activeFontCaps() {
    var style = document.documentElement.dataset.style || '';
    if (style.indexOf('afont-') === 0 && window.FlfFont &&
        typeof window.FlfFont.capabilities === 'function') {
      var key = style.slice('afont-'.length);
      if (window.FlfFont.has(key)) {
        return window.FlfFont.capabilities(key);
      }
    }
    return { letters: true, colon: true, period: true };
  }

  // Composes the display string from the current format pieces, adapted to the
  // active font: a font without letters shows an all-numeric 24h date+time, and
  // a font without ':' uses '.' (or a space) to separate the time. Returns
  // { str, secondsRange } where secondsRange is the [start, end) character span
  // of the fastest-changing time field (seconds if shown, else minutes) inside
  // str — used by the figlet 'seconds' monospace mode to stabilize that field.
  function formatNow() {
    var parts12 = getParts(state.timezone);
    var parts24 = get24Parts(state.timezone);
    var caps = activeFontCaps();

    var sep = caps.colon ? ':' : (caps.period ? '.' : ' ');
    // Without letters there is no AM/PM and no weekday/month words, so force a
    // numeric 24h presentation.
    var use12 = state.timeFormat === '12H' && caps.letters;
    var weekday = state.showWeekday && caps.letters;
    var monthNumeric = state.monthNumeric || !caps.letters;

    var timeStr;
    if (use12) {
      var hh12 = pad2(parts12.hour === '24' ? '12' : parts12.hour);
      timeStr = hh12 + sep + pad2(parts12.minute);
      if (state.showSeconds) {
        timeStr += sep + pad2(parts12.second);
      }
      timeStr += ' ' + (parts12.dayPeriod || '').toUpperCase();
    } else {
      timeStr = pad2(parts24.hour) + sep + pad2(parts24.minute);
      if (state.showSeconds) {
        timeStr += sep + pad2(parts24.second);
      }
    }

    // Fastest field within timeStr: HH(2)+sep(1)+MM(2) [+sep(1)] -> SS or MM.
    var fieldStart = state.showSeconds ? 6 : 3;
    var fieldRange = [fieldStart, fieldStart + 2];

    if (state.datePosition === 'off') {
      return { str: timeStr, secondsRange: fieldRange };
    }

    // A '\n' between date and time forces them onto separate rendered lines
    // (the renderer treats it as a hard break); '  ' keeps them on one line and
    // lets the size-fit wrap only when needed.
    var dateTimeSep = state.splitDateTime ? '\n' : '  ';

    var dateParts = [];
    if (weekday) {
      dateParts.push((parts12.weekday || '').toUpperCase().slice(0, 3));
    }
    dateParts.push(pad2(parts12.day));
    dateParts.push(monthNumeric
      ? monthNumberFor(parts12.month)
      : (parts12.month || '').toUpperCase().slice(0, 3));
    dateParts.push(parts12.year);
    var dateStr = dateParts.join(' ');

    if (state.datePosition === 'before') {
      var offset = dateStr.length + dateTimeSep.length;
      return {
        str: dateStr + dateTimeSep + timeStr,
        secondsRange: [fieldRange[0] + offset, fieldRange[1] + offset]
      };
    }
    return { str: timeStr + dateTimeSep + dateStr, secondsRange: fieldRange };
  }

  // ---------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------

  function formatButtonLabel(timeFormat) {
    return timeFormat === '12H' ? 'FORMAT: 12H' : 'FORMAT: 24H';
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

    // The frame encloses the title, the digits, and the subtitle as one fixed
    // box (sized in CSS, independent of the digits), so it never shifts as the
    // numbers tick.
    var frame = buildViewfinderFrame();

    var titleEl = document.createElement('div');
    titleEl.className = 'clock-view__title';

    var displayMount = document.createElement('div');
    displayMount.className = 'segment-display clock-view__display';

    var subtitleEl = document.createElement('div');
    subtitleEl.className = 'clock-view__subtitle';

    frame.appendChild(titleEl);
    frame.appendChild(displayMount);
    frame.appendChild(subtitleEl);

    container.appendChild(frame);

    var controls = document.createElement('div');
    controls.className = 'clock-view__controls';

    var formatButton = document.createElement('button');
    formatButton.type = 'button';
    formatButton.className = 'clock-view__format-btn';
    controls.appendChild(formatButton);

    // Date position selector (off / date-then-time / time-then-date).
    var dateLabel = document.createElement('label');
    dateLabel.className = 'clock-view__field-label';
    dateLabel.textContent = 'DATE:';
    var datePositionSelect = document.createElement('select');
    datePositionSelect.className = 'clock-view__timezone-select';
    var DATE_OPTION_LABELS = { off: 'Off', before: 'Date, time', after: 'Time, date' };
    for (var d = 0; d < DATE_POSITIONS.length; d++) {
      var opt = document.createElement('option');
      opt.value = DATE_POSITIONS[d];
      opt.textContent = DATE_OPTION_LABELS[DATE_POSITIONS[d]];
      datePositionSelect.appendChild(opt);
    }
    dateLabel.appendChild(datePositionSelect);
    controls.appendChild(dateLabel);

    // Weekday / seconds / numeric-month toggles.
    function buildToggle(labelText, className) {
      var label = document.createElement('label');
      label.className = 'clock-view__toggle';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.className = className;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + labelText));
      controls.appendChild(label);
      return input;
    }
    var weekdayInput = buildToggle('Weekday', 'clock-view__weekday-toggle');
    var secondsInput = buildToggle('Seconds', 'clock-view__seconds-toggle');
    var monthNumericInput = buildToggle('Month as number', 'clock-view__month-toggle');
    var splitInput = buildToggle('Date & time on separate lines', 'clock-view__split-toggle');

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

    // The controls are NOT placed under the clock; they're mounted into the
    // settings dropdown (see SettingsPanel) so the clock area stays clean and
    // perfectly centered. They are exposed via ClockView.getControls().
    state.controlsEl = controls;

    state.displayMount = displayMount;
    state.formatButton = formatButton;
    state.datePositionSelect = datePositionSelect;
    state.weekdayInput = weekdayInput;
    state.secondsInput = secondsInput;
    state.monthNumericInput = monthNumericInput;
    state.splitInput = splitInput;
    state.timezoneSelect = timezoneSelect;
    state.titleInput = titleInput;
    state.subtitleInput = subtitleInput;
    state.titleEl = titleEl;
    state.subtitleEl = subtitleEl;
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  // 'F' / the format button toggles between 24-hour and 12-hour time.
  function cycleFormat() {
    state.timeFormat = state.timeFormat === '24H' ? '12H' : '24H';
    state.formatButton.textContent = formatButtonLabel(state.timeFormat);
    savePrefs({ clockTimeFormat: state.timeFormat });
    renderNow();
  }

  function onTimezoneChange() {
    state.timezone = state.timezoneSelect.value;
    savePrefs({ timezone: state.timezone });
    renderNow();
  }

  function onDatePositionChange() {
    state.datePosition = state.datePositionSelect.value;
    savePrefs({ clockDatePosition: state.datePosition });
    renderNow();
  }

  function onWeekdayChange() {
    state.showWeekday = state.weekdayInput.checked;
    savePrefs({ clockShowWeekday: state.showWeekday });
    renderNow();
  }

  function onSecondsChange() {
    state.showSeconds = state.secondsInput.checked;
    savePrefs({ clockShowSeconds: state.showSeconds });
    renderNow();
  }

  function onMonthNumericChange() {
    state.monthNumeric = state.monthNumericInput.checked;
    savePrefs({ clockMonthNumeric: state.monthNumeric });
    renderNow();
  }

  function onSplitChange() {
    state.splitDateTime = state.splitInput.checked;
    savePrefs({ clockSplitDateTime: state.splitDateTime });
    renderNow();
    // Splitting changes the block height, so trigger app.js's re-fit (it
    // listens for this event and re-runs the size fit).
    document.dispatchEvent(new CustomEvent('tuiclock:style-changed'));
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
    var formatted = formatNow();
    // _fitWrapCols is set by app.js's fit pass: when the digits are zoomed past
    // the frame it holds the column budget at which the string wraps onto new
    // lines; 0/undefined means render on a single line.
    window.renderDigits(state.displayMount, formatted.str, {
      secondsRange: formatted.secondsRange,
      wrapCols: state.displayMount._fitWrapCols || 0
    });
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function init(container) {
    if (!container) {
      throw new Error('ClockView.init: container element is required');
    }

    var prefs = loadPrefs();
    state.timeFormat = TIME_FORMATS.indexOf(prefs.clockTimeFormat) !== -1
      ? prefs.clockTimeFormat
      // Migrate the old combined clockFormat ('12H'/'12H_DATE' -> 12-hour).
      : (typeof prefs.clockFormat === 'string' && prefs.clockFormat.indexOf('12H') === 0 ? '12H' : '24H');
    state.datePosition = DATE_POSITIONS.indexOf(prefs.clockDatePosition) !== -1
      ? prefs.clockDatePosition
      : (typeof prefs.clockFormat === 'string' && prefs.clockFormat.indexOf('_DATE') !== -1 ? 'before' : 'off');
    state.showWeekday = typeof prefs.clockShowWeekday === 'boolean' ? prefs.clockShowWeekday : true;
    state.showSeconds = typeof prefs.clockShowSeconds === 'boolean' ? prefs.clockShowSeconds : true;
    state.monthNumeric = prefs.clockMonthNumeric === true;
    state.splitDateTime = prefs.clockSplitDateTime === true;
    state.timezone = typeof prefs.timezone === 'string' ? prefs.timezone : LOCAL_ZONE;
    state.title = typeof prefs.clockTitle === 'string' ? prefs.clockTitle : '';
    state.subtitle = typeof prefs.clockSubtitle === 'string' ? prefs.clockSubtitle : '';

    state.container = container;
    buildDom(container);

    state.formatButton.textContent = formatButtonLabel(state.timeFormat);
    state.formatButton.addEventListener('click', cycleFormat);

    state.datePositionSelect.value = state.datePosition;
    state.datePositionSelect.addEventListener('change', onDatePositionChange);
    state.weekdayInput.checked = state.showWeekday;
    state.weekdayInput.addEventListener('change', onWeekdayChange);
    state.secondsInput.checked = state.showSeconds;
    state.secondsInput.addEventListener('change', onSecondsChange);
    state.monthNumericInput.checked = state.monthNumeric;
    state.monthNumericInput.addEventListener('change', onMonthNumericChange);
    state.splitInput.checked = state.splitDateTime;
    state.splitInput.addEventListener('change', onSplitChange);

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

  function getControls() {
    return state.controlsEl;
  }

  window.ClockView = {
    init: init,
    tick: tick,
    getControls: getControls
  };
})();
