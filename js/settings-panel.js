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
    visualStyle: DEFAULT_STYLE,
    colorScheme: DEFAULT_COLOR,
    matrixBg: false
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
    state.matrixInput = input;

    return label;
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
    effectsGroup.appendChild(buildCheckboxRow('Matrix background', state.matrixBg, onMatrixBgChange));
    dropdown.appendChild(effectsGroup);

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

  function onColorChange(value) {
    state.colorScheme = value;
    applyColor(value);
    savePrefs({ colorScheme: value });
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

    state.container = container;
    buildDom(container);

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
    cycleStyle: cycleStyle
  };
})();
