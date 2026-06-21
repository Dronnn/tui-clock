// help-overlay.js
// A '?' help button + full-window overlay listing the keyboard shortcuts.
// Plain global script, no ES modules — exposes window.HelpOverlay.
//
//   HelpOverlay.init()   - appends the button + overlay to <body> (once).
//   HelpOverlay.open()   - shows the overlay.
//   HelpOverlay.close()  - hides it.
//   HelpOverlay.toggle() - flips it. Bound to the '?' key by app.js.

(function () {
  'use strict';

  // Each row: [key, description]. Mirrors the shortcuts handled in app.js /
  // the views.
  var SHORTCUTS = [
    ['C', 'Clock'],
    ['D', 'Countdown'],
    ['T', 'Timer'],
    ['A', 'Alarms'],
    ['F', 'Cycle time format'],
    ['N', 'Next font'],
    ['P', 'Previous font'],
    ['R', 'Shuffle fonts on/off'],
    ['X', 'Cycle color'],
    ['+/-', 'Size'],
    ['?', 'This help']
  ];

  var els = { button: null, overlay: null };
  var initialized = false;

  function buildButton() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-btn';
    btn.setAttribute('aria-label', 'Help');
    btn.textContent = '?';
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      toggle();
    });
    return btn;
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'help-overlay';

    var panel = document.createElement('div');
    panel.className = 'help-overlay__panel';

    var heading = document.createElement('div');
    heading.className = 'help-overlay__heading';
    heading.textContent = 'KEYBOARD SHORTCUTS';
    panel.appendChild(heading);

    var list = document.createElement('div');
    list.className = 'help-overlay__list';
    for (var i = 0; i < SHORTCUTS.length; i++) {
      var row = document.createElement('div');
      row.className = 'help-overlay__row';

      var key = document.createElement('span');
      key.className = 'help-overlay__key';
      key.textContent = SHORTCUTS[i][0];

      var desc = document.createElement('span');
      desc.className = 'help-overlay__desc';
      desc.textContent = SHORTCUTS[i][1];

      row.appendChild(key);
      row.appendChild(desc);
      list.appendChild(row);
    }
    panel.appendChild(list);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'help-overlay__close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', function (event) {
      event.stopPropagation();
      closeOverlay();
    });
    panel.appendChild(close);

    // Clicking the backdrop (outside the panel) closes; clicks inside don't.
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        closeOverlay();
      }
    });
    panel.addEventListener('click', function (event) {
      event.stopPropagation();
    });

    overlay.appendChild(panel);
    return overlay;
  }

  function isOpen() {
    return !!els.overlay && els.overlay.classList.contains('is-open');
  }

  function openOverlay() {
    if (els.overlay) {
      els.overlay.classList.add('is-open');
    }
  }

  function closeOverlay() {
    if (els.overlay) {
      els.overlay.classList.remove('is-open');
    }
  }

  function toggle() {
    if (isOpen()) {
      closeOverlay();
    } else {
      openOverlay();
    }
  }

  function init() {
    if (initialized) {
      return;
    }
    els.button = buildButton();
    els.overlay = buildOverlay();
    document.body.appendChild(els.button);
    document.body.appendChild(els.overlay);

    // Escape closes the overlay regardless of focus.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        closeOverlay();
      }
    });

    initialized = true;
  }

  window.HelpOverlay = {
    init: init,
    open: openOverlay,
    close: closeOverlay,
    toggle: toggle,
    isOpen: isOpen
  };
})();
