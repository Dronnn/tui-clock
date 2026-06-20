// dash-font.js
// Renders strings into tty-clock-style chamfered ASCII-art digits.
// Plain global script, no ES modules — exposes window.DashFont.

(function () {
  'use strict';

  var GLYPHS = {
    '0': [
      ' ___ ',
      '/   \\',
      '|   |',
      '|   |',
      '|   |',
      '|   |',
      '\\___/'
    ],
    '1': [
      '     ',
      '    \\',
      '    |',
      '    |',
      '    |',
      '    |',
      '    |'
    ],
    '2': [
      ' ___ ',
      '    \\',
      '    |',
      ' ___/',
      '/    ',
      '|    ',
      '\\___ '
    ],
    '3': [
      ' ___ ',
      '    \\',
      '    |',
      ' ___/',
      '    \\',
      '    |',
      ' ___/'
    ],
    '4': [
      '     ',
      '/   \\',
      '|   |',
      '\\___|',
      '    |',
      '    |',
      '    |'
    ],
    '5': [
      ' ___ ',
      '/    ',
      '|    ',
      '\\___ ',
      '    \\',
      '    |',
      ' ___/'
    ],
    '6': [
      ' ___ ',
      '/    ',
      '|    ',
      '|___ ',
      '|   \\',
      '|   |',
      '\\___/'
    ],
    '7': [
      ' ___ ',
      '    \\',
      '    |',
      '   / ',
      '  /  ',
      ' |   ',
      ' |   '
    ],
    '8': [
      ' ___ ',
      '/   \\',
      '|   |',
      '\\___/',
      '/   \\',
      '|   |',
      '\\___/'
    ],
    '9': [
      ' ___ ',
      '/   \\',
      '|   |',
      '\\___|',
      '    |',
      '    |',
      ' ___/'
    ],
    ':': [
      '    ',
      ' () ',
      ' () ',
      '    ',
      ' () ',
      ' () ',
      '    '
    ],
    '-': [
      '     ',
      '     ',
      '     ',
      ' ___ ',
      '     ',
      '     ',
      '     '
    ],
    ' ': [
      '     ',
      '     ',
      '     ',
      '     ',
      '     ',
      '     ',
      '     '
    ]
  };

  var BLANK = GLYPHS[' '];

  function glyphFor(ch) {
    return Object.prototype.hasOwnProperty.call(GLYPHS, ch) ? GLYPHS[ch] : BLANK;
  }

  function buildGlyph(ch) {
    var rows = glyphFor(ch);
    var glyph = document.createElement('pre');
    glyph.className = 'dash-glyph' + (ch === ':' ? ' dash-glyph--narrow' : '');
    glyph.dataset.char = ch;
    glyph.textContent = rows.join('\n');
    return { el: glyph, ch: ch };
  }

  function buildAll(container, str) {
    container.innerHTML = '';

    var glyphs = [];
    for (var i = 0; i < str.length; i++) {
      var record = buildGlyph(str.charAt(i));
      container.appendChild(record.el);
      glyphs.push(record);
    }

    container._dashState = { str: str, glyphs: glyphs };
  }

  function renderDashString(container, str) {
    if (!container) {
      throw new Error('renderDashString: container element is required');
    }
    str = String(str);

    var state = container._dashState;
    if (!state || state.str.length !== str.length) {
      buildAll(container, str);
      return;
    }

    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === state.str.charAt(i)) {
        continue;
      }

      var newRecord = buildGlyph(ch);
      container.replaceChild(newRecord.el, state.glyphs[i].el);
      state.glyphs[i] = newRecord;
    }

    state.str = str;
  }

  window.renderDashString = renderDashString;
  window.DashFont = {
    renderDashString: renderDashString,
    render: renderDashString,
    GLYPHS: GLYPHS
  };
})();
