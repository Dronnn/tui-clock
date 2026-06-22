// settings-panel.js
// Gear-icon button + dropdown for choosing a visual style (Flat/3D/CRT),
// color scheme (Amber/Green/Cyan), and optional Matrix background effect.
// Theme choices are applied as data-style/data-color attributes on <html>;
// every setting is persisted into Storage's 'prefs' object.
// Plain global script, no ES modules — exposes window.SettingsPanel.
//
// Public API:
//   SettingsPanel.init(container)
//     - container: the mount element (e.g. #settings-panel).
//     - Builds the gear button + dropdown DOM, restores persisted
//       visualStyle/colorScheme/matrixBg from Storage('prefs') (defaulting
//       to 'flat'/'amber'/false), applies the theme to <html> immediately,
//       and pre-selects the matching controls.
//     - Does not need a tick() — selections apply immediately on change,
//       there is nothing to poll.
//
// Persistence: reads/writes the 'prefs' object in Storage, merging with
// whatever else is already stored there (clockFormat/timezone owned by
// clock-view.js) — never overwrites unrelated fields.

(function () {
  'use strict';

  // Non-figlet styles (the bitmap/segment renderers). The figlet fonts are
  // appended dynamically from the embedded FIGlet data so adding a font to
  // figlet-fonts.js automatically surfaces it here and in the N-hotkey cycle.
  var BASE_STYLE_OPTIONS = [
    { value: 'flat', label: 'Flat' },
    { value: '3d', label: '3D' },
    { value: 'crt', label: 'CRT' },
    { value: 'glitch', label: 'Block 3D' },
    { value: 'block-stack', label: 'Block Stack' },
    { value: 'dash', label: 'Dash' },
    { value: 'dot-matrix', label: 'Dot Matrix' }
  ];

  // Populated in init() = BASE_STYLE_OPTIONS + one entry per embedded FIGlet
  // font. Mutable so init() can rebuild it once the font data is available.
  var STYLE_OPTIONS = BASE_STYLE_OPTIONS.slice();

  function buildStyleOptions() {
    var options = BASE_STYLE_OPTIONS.slice();
    if (window.FlfFont && typeof window.FlfFont.order === 'function') {
      var order = window.FlfFont.order();
      for (var i = 0; i < order.length; i++) {
        var key = order[i];
        options.push({ value: 'afont-' + key, label: 'Figlet: ' + window.FlfFont.label(key) });
      }
    }
    return options;
  }

  var COLOR_OPTIONS = [
    { value: 'amber', label: 'Amber' },
    { value: 'green', label: 'Green' },
    { value: 'cyan', label: 'Cyan' }
  ];

  var DEFAULT_STYLE = 'flat';
  var DEFAULT_COLOR = 'amber';

  var state = {
    initialized: false,
    container: null,
    menus: [],
    toggleButton: null,
    dropdown: null,
    fontsButton: null,
    fontsDropdown: null,
    matrixInput: null,
    shuffleInput: null,
    keepAwakeInput: null,
    visualStyle: DEFAULT_STYLE,
    colorScheme: DEFAULT_COLOR,
    matrixBg: false,
    fontShuffle: false,
    keepAwake: false,
    monoMode: 'off'
  };

  // Monospace modes for the figlet fonts (so ticking digits don't shift the
  // centered block). 'seconds' only fixes the seconds; 'digits' fixes every
  // number; 'all' fixes every glyph.
  var MONO_OPTIONS = [
    { value: 'off', label: 'Off' },
    { value: 'seconds', label: 'Seconds only' },
    { value: 'digits', label: 'All digits' },
    { value: 'all', label: 'Everything' }
  ];

  // Applies the monospace mode to <html data-mono> (read by FlfFont).
  function applyMono(value) {
    document.documentElement.setAttribute('data-mono', value);
  }

  // Auto-shuffle timer handle (setTimeout id) and its bounds. When shuffle is
  // on, the style jumps to a random figlet font every SHUFFLE_MIN..MAX ms.
  var shuffleTimer = null;
  var SHUFFLE_MIN_MS = 20000;
  var SHUFFLE_MAX_MS = 30000;

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
  // Applying theme attributes to the document
  // ---------------------------------------------------------------------

  function applyStyle(value) {
    document.documentElement.setAttribute('data-style', value);
  }

  function applyColor(value) {
    document.documentElement.setAttribute('data-color', value);
  }

  // ---------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------

  function buildRadioGroup(name, options, selectedValue, onChange) {
    var group = document.createElement('div');
    group.className = 'settings-panel__group';

    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      var label = document.createElement('label');
      label.className = 'settings-panel__option';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = option.value;
      input.checked = option.value === selectedValue;
      input.addEventListener('change', function (event) {
        if (event.target.checked) {
          onChange(event.target.value);
        }
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(option.label));
      group.appendChild(label);
    }

    return group;
  }

  function buildCheckboxRow(labelText, checked, onChange) {
    var label = document.createElement('label');
    label.className = 'settings-panel__option';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', function (event) {
      onChange(event.target.checked);
    });

    label.appendChild(input);
    label.appendChild(document.createTextNode(labelText));

    return { label: label, input: input };
  }

  function buildGroupLabel(text) {
    var el = document.createElement('div');
    el.className = 'settings-panel__group-label';
    el.textContent = text;
    return el;
  }

  // Each setting is its own button + dropdown in the header, all sharing the
  // one-open-at-a-time model. Creates the pair, registers it for the toggle/
  // close logic, wires the button, and returns the (empty) dropdown to fill.
  function buildMenu(container, label, ariaLabel, isFonts) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-panel__toggle' + (isFonts ? ' settings-panel__toggle--fonts' : '');
    button.setAttribute('aria-label', ariaLabel);
    button.textContent = label;

    var dropdown = document.createElement('div');
    dropdown.className = 'settings-panel__dropdown' + (isFonts ? ' settings-panel__dropdown--fonts' : '');

    container.appendChild(button);
    container.appendChild(dropdown);

    state.menus.push({ button: button, dropdown: dropdown });
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleMenu(dropdown, button);
    });

    return { button: button, dropdown: dropdown };
  }

  function buildDom(container) {
    container.innerHTML = '';
    container.className = 'settings-panel';
    state.menus = [];

    // Fonts (left-most): the font list only.
    var fonts = buildMenu(container, 'Aa', 'Fonts', true);
    fonts.dropdown.appendChild(buildGroupLabel('Font'));
    var styleGroup = buildRadioGroup('settings-panel-style', STYLE_OPTIONS, state.visualStyle, onStyleChange);
    styleGroup.classList.add('settings-panel__group--columns');
    fonts.dropdown.appendChild(styleGroup);

    // Color.
    var color = buildMenu(container, '◑', 'Color', false);
    color.dropdown.appendChild(buildGroupLabel('Color'));
    color.dropdown.appendChild(buildRadioGroup('settings-panel-color', COLOR_OPTIONS, state.colorScheme, onColorChange));

    // Monospace.
    var mono = buildMenu(container, '▦', 'Monospace', false);
    mono.dropdown.appendChild(buildGroupLabel('Monospace'));
    mono.dropdown.appendChild(buildRadioGroup('settings-panel-mono', MONO_OPTIONS, state.monoMode, onMonoChange));

    // Effects.
    var effects = buildMenu(container, '✦', 'Effects', false);
    effects.dropdown.appendChild(buildGroupLabel('Effects'));
    var effectsGroup = document.createElement('div');
    effectsGroup.className = 'settings-panel__group';

    var matrixRow = buildCheckboxRow('Matrix background', state.matrixBg, onMatrixBgChange);
    state.matrixInput = matrixRow.input;
    effectsGroup.appendChild(matrixRow.label);

    var shuffleRow = buildCheckboxRow('Shuffle fonts', state.fontShuffle, onShuffleChange);
    state.shuffleInput = shuffleRow.input;
    effectsGroup.appendChild(shuffleRow.label);

    var keepAwakeRow = buildCheckboxRow('Keep screen awake', state.keepAwake, onKeepAwakeChange);
    state.keepAwakeInput = keepAwakeRow.input;
    effectsGroup.appendChild(keepAwakeRow.label);

    effects.dropdown.appendChild(effectsGroup);

    // Settings (the gear, right-most): the clock format controls (built by
    // ClockView, which is initialized before SettingsPanel).
    var gear = buildMenu(container, '⚙', 'Settings', false);
    if (window.ClockView && typeof window.ClockView.getControls === 'function') {
      var clockControls = window.ClockView.getControls();
      if (clockControls) {
        gear.dropdown.appendChild(buildGroupLabel('Clock'));
        clockControls.classList.add('settings-panel__clock-controls');
        gear.dropdown.appendChild(clockControls);
      }
    }

    state.fontsButton = fonts.button;
    state.fontsDropdown = fonts.dropdown;
    state.toggleButton = gear.button;
    state.dropdown = gear.dropdown;
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  // All menus share one open-at-a-time model: opening one closes the rest.
  function closeMenus() {
    for (var i = 0; i < state.menus.length; i++) {
      state.menus[i].dropdown.classList.remove('is-open');
      state.menus[i].button.classList.remove('is-active');
    }
  }

  function toggleMenu(dropdown, button) {
    var open = dropdown.classList.contains('is-open');
    closeMenus();
    if (!open) {
      dropdown.classList.add('is-open');
      button.classList.add('is-active');
    }
  }

  function toggleSettings() {
    toggleMenu(state.dropdown, state.toggleButton);
  }

  function toggleFonts() {
    toggleMenu(state.fontsDropdown, state.fontsButton);
  }

  function onDocumentClick(event) {
    if (!state.container.contains(event.target)) {
      closeMenus();
    }
  }

  // Applies a style value everywhere: <html> attribute, persisted prefs, and
  // (so the dropdown stays in sync when the style is changed via hotkey) the
  // matching style radio's checked state.
  function setStyle(value) {
    state.visualStyle = value;
    applyStyle(value);
    savePrefs({ visualStyle: value });
    syncStyleRadio(value);
  }

  function syncStyleRadio(value) {
    if (!state.container) {
      return;
    }
    var radios = state.container.querySelectorAll('input[name="settings-panel-style"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === value;
    }
  }

  function onStyleChange(value) {
    setStyle(value);
  }

  // Advances the visual style to the next (step > 0) or previous (step < 0)
  // entry in STYLE_OPTIONS, wrapping around. Bound to the 'N' hotkey by app.js
  // so the user can flip through fonts/designs without opening settings.
  function cycleStyle(step) {
    var n = STYLE_OPTIONS.length;
    if (n === 0) {
      return null;
    }
    var idx = 0;
    for (var i = 0; i < n; i++) {
      if (STYLE_OPTIONS[i].value === state.visualStyle) {
        idx = i;
        break;
      }
    }
    var delta = step || 1;
    var next = ((idx + delta) % n + n) % n;
    setStyle(STYLE_OPTIONS[next].value);
    return STYLE_OPTIONS[next];
  }

  // ---------------------------------------------------------------------
  // Auto-shuffle: jump to a random figlet font on a randomized interval.
  // ---------------------------------------------------------------------

  function figletStyleValues() {
    var values = [];
    var order = window.FIGLET_FONT_ORDER || [];
    for (var i = 0; i < order.length; i++) {
      values.push('afont-' + order[i]);
    }
    return values;
  }

  function pickRandomFigletStyle() {
    var values = figletStyleValues();
    if (values.length === 0) {
      return null;
    }
    // Avoid repeating the current style. If the only option is the current one,
    // fall back to it rather than looping forever.
    var candidates = values.filter(function (v) {
      return v !== state.visualStyle;
    });
    var pool = candidates.length ? candidates : values;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function scheduleShuffle() {
    var delay = SHUFFLE_MIN_MS + Math.random() * (SHUFFLE_MAX_MS - SHUFFLE_MIN_MS);
    shuffleTimer = window.setTimeout(function () {
      var next = pickRandomFigletStyle();
      if (next) {
        setStyle(next);
        document.dispatchEvent(new CustomEvent('tuiclock:style-changed'));
      }
      scheduleShuffle();
    }, delay);
  }

  function setShuffle(on) {
    on = !!on;
    state.fontShuffle = on;
    if (shuffleTimer !== null) {
      window.clearTimeout(shuffleTimer);
      shuffleTimer = null;
    }
    if (on) {
      scheduleShuffle();
    }
    if (state.shuffleInput) {
      state.shuffleInput.checked = on;
    }
    savePrefs({ fontShuffle: on });
  }

  function toggleShuffle() {
    setShuffle(!state.fontShuffle);
    return state.fontShuffle;
  }

  function isShuffling() {
    return state.fontShuffle;
  }

  function setColor(value) {
    state.colorScheme = value;
    applyColor(value);
    savePrefs({ colorScheme: value });
    if (state.container) {
      var radios = state.container.querySelectorAll('input[name="settings-panel-color"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === value;
      }
    }
  }

  function onColorChange(value) {
    setColor(value);
  }

  // Advances the color scheme to the next entry, wrapping. Bound to the 'X'
  // hotkey by app.js.
  function cycleColor(step) {
    var n = COLOR_OPTIONS.length;
    if (n === 0) {
      return null;
    }
    var idx = 0;
    for (var i = 0; i < n; i++) {
      if (COLOR_OPTIONS[i].value === state.colorScheme) {
        idx = i;
        break;
      }
    }
    var next = ((idx + (step || 1)) % n + n) % n;
    setColor(COLOR_OPTIONS[next].value);
    return COLOR_OPTIONS[next];
  }

  function onMatrixBgChange(value) {
    state.matrixBg = value;

    if (window.MatrixBG) {
      if (window.MatrixBG.isEnabled() !== value) {
        window.MatrixBG.toggle();
      }
      state.matrixBg = window.MatrixBG.isEnabled();
    }

    if (state.matrixInput) {
      state.matrixInput.checked = state.matrixBg;
    }
    savePrefs({ matrixBg: state.matrixBg });
  }

  function onShuffleChange(value) {
    setShuffle(value);
  }

  // ---------------------------------------------------------------------
  // Monospace mode for the figlet fonts
  // ---------------------------------------------------------------------

  function setMono(value) {
    if (!isValidOption(MONO_OPTIONS, value)) {
      value = 'off';
    }
    state.monoMode = value;
    applyMono(value);
    savePrefs({ monoMode: value });
    if (state.container) {
      var radios = state.container.querySelectorAll('input[name="settings-panel-mono"]');
      for (var i = 0; i < radios.length; i++) {
        radios[i].checked = radios[i].value === value;
      }
    }
    // The renderers read data-mono lazily; nudge a redraw so the change shows
    // immediately instead of only on the next tick.
    document.dispatchEvent(new CustomEvent('tuiclock:style-changed'));
  }

  function onMonoChange(value) {
    setMono(value);
  }

  // ---------------------------------------------------------------------
  // Keep-awake (Screen Wake Lock API). Prevents the display from sleeping
  // while the checkbox is on; re-acquires the lock when the tab becomes
  // visible again (the browser releases it on tab switch). Silently degrades
  // where the API is unavailable.
  // ---------------------------------------------------------------------

  var wakeLock = null;

  function wakeLockSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  function requestWakeLock() {
    if (!wakeLockSupported()) {
      return;
    }
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () {
        wakeLock = null;
      });
    }).catch(function () {
      // Rejected (e.g. not visible, or blocked) — leave it; visibilitychange
      // will retry while the toggle is on.
    });
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  function onVisibilityChange() {
    if (state.keepAwake && document.visibilityState === 'visible' && !wakeLock) {
      requestWakeLock();
    }
  }

  function setKeepAwake(on) {
    on = !!on;
    state.keepAwake = on;
    if (on) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
    if (state.keepAwakeInput) {
      state.keepAwakeInput.checked = on;
    }
    savePrefs({ keepAwake: on });
  }

  function onKeepAwakeChange(value) {
    setKeepAwake(value);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function init(container) {
    if (!container) {
      throw new Error('SettingsPanel.init: container element is required');
    }

    STYLE_OPTIONS = buildStyleOptions();

    var prefs = loadPrefs();
    state.visualStyle = isValidOption(STYLE_OPTIONS, prefs.visualStyle) ? prefs.visualStyle : DEFAULT_STYLE;
    state.colorScheme = isValidOption(COLOR_OPTIONS, prefs.colorScheme) ? prefs.colorScheme : DEFAULT_COLOR;
    state.matrixBg = prefs.matrixBg === true;
    state.fontShuffle = prefs.fontShuffle === true;
    state.keepAwake = prefs.keepAwake === true;
    state.monoMode = isValidOption(MONO_OPTIONS, prefs.monoMode) ? prefs.monoMode : 'off';

    state.container = container;
    buildDom(container);

    if (state.fontShuffle) {
      setShuffle(true);
    }
    if (state.keepAwake) {
      requestWakeLock();
    }

    applyStyle(state.visualStyle);
    applyColor(state.colorScheme);
    applyMono(state.monoMode);

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('visibilitychange', onVisibilityChange);

    state.initialized = true;
  }

  function isValidOption(options, value) {
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === value) {
        return true;
      }
    }
    return false;
  }

  window.SettingsPanel = {
    init: init,
    cycleStyle: cycleStyle,
    cycleColor: cycleColor,
    setShuffle: setShuffle,
    toggleShuffle: toggleShuffle,
    isShuffling: isShuffling,
    toggleSettings: toggleSettings,
    toggleFonts: toggleFonts
  };
})();
