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
    toggleButton: null,
    dropdown: null,
    matrixInput: null,
    shuffleInput: null,
    visualStyle: DEFAULT_STYLE,
    colorScheme: DEFAULT_COLOR,
    matrixBg: false,
    fontShuffle: false
  };

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

  function buildDom(container) {
    container.innerHTML = '';
    container.className = 'settings-panel';

    var toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'settings-panel__toggle';
    toggleButton.setAttribute('aria-label', 'Settings');
    toggleButton.textContent = '⚙';
    container.appendChild(toggleButton);

    var dropdown = document.createElement('div');
    dropdown.className = 'settings-panel__dropdown';

    var styleLabel = document.createElement('div');
    styleLabel.className = 'settings-panel__group-label';
    styleLabel.textContent = 'Style';
    dropdown.appendChild(styleLabel);

    var styleGroup = buildRadioGroup('settings-panel-style', STYLE_OPTIONS, state.visualStyle, onStyleChange);
    styleGroup.classList.add('settings-panel__group--columns');
    dropdown.appendChild(styleGroup);

    var colorLabel = document.createElement('div');
    colorLabel.className = 'settings-panel__group-label';
    colorLabel.textContent = 'Color';
    dropdown.appendChild(colorLabel);

    var colorGroup = buildRadioGroup('settings-panel-color', COLOR_OPTIONS, state.colorScheme, onColorChange);
    dropdown.appendChild(colorGroup);

    var effectsLabel = document.createElement('div');
    effectsLabel.className = 'settings-panel__group-label';
    effectsLabel.textContent = 'Effects';
    dropdown.appendChild(effectsLabel);

    var effectsGroup = document.createElement('div');
    effectsGroup.className = 'settings-panel__group';

    var matrixRow = buildCheckboxRow('Matrix background', state.matrixBg, onMatrixBgChange);
    state.matrixInput = matrixRow.input;
    effectsGroup.appendChild(matrixRow.label);

    var shuffleRow = buildCheckboxRow('Shuffle fonts', state.fontShuffle, onShuffleChange);
    state.shuffleInput = shuffleRow.input;
    effectsGroup.appendChild(shuffleRow.label);

    dropdown.appendChild(effectsGroup);

    // Mount the clock's format controls here (they are built by ClockView but
    // belong in this menu, not under the clock). ClockView is initialized
    // before SettingsPanel, so getControls() is available.
    if (window.ClockView && typeof window.ClockView.getControls === 'function') {
      var clockControls = window.ClockView.getControls();
      if (clockControls) {
        var clockLabel = document.createElement('div');
        clockLabel.className = 'settings-panel__group-label';
        clockLabel.textContent = 'Clock';
        dropdown.appendChild(clockLabel);
        clockControls.classList.add('settings-panel__clock-controls');
        dropdown.appendChild(clockControls);
      }
    }

    container.appendChild(dropdown);

    state.toggleButton = toggleButton;
    state.dropdown = dropdown;
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  function openDropdown() {
    state.dropdown.classList.add('is-open');
    state.toggleButton.classList.add('is-active');
  }

  function closeDropdown() {
    state.dropdown.classList.remove('is-open');
    state.toggleButton.classList.remove('is-active');
  }

  function isDropdownOpen() {
    return state.dropdown.classList.contains('is-open');
  }

  function toggleDropdown() {
    if (isDropdownOpen()) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function onDocumentClick(event) {
    if (!state.container.contains(event.target)) {
      closeDropdown();
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
    if (!state.dropdown) {
      return;
    }
    var radios = state.dropdown.querySelectorAll('input[name="settings-panel-style"]');
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
    if (state.dropdown) {
      var radios = state.dropdown.querySelectorAll('input[name="settings-panel-color"]');
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

    state.container = container;
    buildDom(container);

    if (state.fontShuffle) {
      setShuffle(true);
    }

    applyStyle(state.visualStyle);
    applyColor(state.colorScheme);

    state.toggleButton.addEventListener('click', function (event) {
      event.stopPropagation();
      toggleDropdown();
    });

    document.addEventListener('click', onDocumentClick);

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
    isShuffling: isShuffling
  };
})();
