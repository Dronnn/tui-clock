// dot-matrix-font.js
// Renders strings into a sparse 5x7 square LED dot-matrix font.
// Plain global script, no ES modules — exposes window.DotMatrixFont.

(function () {
  'use strict';

  var GLYPHS = {
    '0': [
      '01110',
      '10001',
      '10011',
      '10101',
      '11001',
      '10001',
      '01110'
    ],
    '1': [
      '00100',
      '01100',
      '00100',
      '00100',
      '00100',
      '00100',
      '01110'
    ],
    '2': [
      '01110',
      '10001',
      '00001',
      '00010',
      '00100',
      '01000',
      '11111'
    ],
    '3': [
      '11110',
      '00001',
      '00001',
      '01110',
      '00001',
      '00001',
      '11110'
    ],
    '4': [
      '00010',
      '00110',
      '01010',
      '10010',
      '11111',
      '00010',
      '00010'
    ],
    '5': [
      '11111',
      '10000',
      '10000',
      '11110',
      '00001',
      '00001',
      '11110'
    ],
    '6': [
      '01110',
      '10000',
      '10000',
      '11110',
      '10001',
      '10001',
      '01110'
    ],
    '7': [
      '11111',
      '00001',
      '00010',
      '00100',
      '01000',
      '01000',
      '01000'
    ],
    '8': [
      '01110',
      '10001',
      '10001',
      '01110',
      '10001',
      '10001',
      '01110'
    ],
    '9': [
      '01110',
      '10001',
      '10001',
      '01111',
      '00001',
      '00001',
      '01110'
    ],
    'A': [
      '01110',
      '10001',
      '10001',
      '11111',
      '10001',
      '10001',
      '10001'
    ],
    'B': [
      '11110',
      '10001',
      '10001',
      '11110',
      '10001',
      '10001',
      '11110'
    ],
    'C': [
      '01111',
      '10000',
      '10000',
      '10000',
      '10000',
      '10000',
      '01111'
    ],
    'D': [
      '11110',
      '10001',
      '10001',
      '10001',
      '10001',
      '10001',
      '11110'
    ],
    'E': [
      '11111',
      '10000',
      '10000',
      '11110',
      '10000',
      '10000',
      '11111'
    ],
    'F': [
      '11111',
      '10000',
      '10000',
      '11110',
      '10000',
      '10000',
      '10000'
    ],
    'G': [
      '01111',
      '10000',
      '10000',
      '10011',
      '10001',
      '10001',
      '01111'
    ],
    'H': [
      '10001',
      '10001',
      '10001',
      '11111',
      '10001',
      '10001',
      '10001'
    ],
    'I': [
      '01110',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100',
      '01110'
    ],
    'J': [
      '00001',
      '00001',
      '00001',
      '00001',
      '10001',
      '10001',
      '01110'
    ],
    'K': [
      '10001',
      '10010',
      '10100',
      '11000',
      '10100',
      '10010',
      '10001'
    ],
    'L': [
      '10000',
      '10000',
      '10000',
      '10000',
      '10000',
      '10000',
      '11111'
    ],
    'M': [
      '10001',
      '11011',
      '10101',
      '10101',
      '10001',
      '10001',
      '10001'
    ],
    'N': [
      '10001',
      '11001',
      '10101',
      '10011',
      '10001',
      '10001',
      '10001'
    ],
    'O': [
      '01110',
      '10001',
      '10001',
      '10001',
      '10001',
      '10001',
      '01110'
    ],
    'P': [
      '11110',
      '10001',
      '10001',
      '11110',
      '10000',
      '10000',
      '10000'
    ],
    'Q': [
      '01110',
      '10001',
      '10001',
      '10001',
      '10101',
      '10010',
      '01101'
    ],
    'R': [
      '11110',
      '10001',
      '10001',
      '11110',
      '10100',
      '10010',
      '10001'
    ],
    'S': [
      '01111',
      '10000',
      '10000',
      '01110',
      '00001',
      '00001',
      '11110'
    ],
    'T': [
      '11111',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100'
    ],
    'U': [
      '10001',
      '10001',
      '10001',
      '10001',
      '10001',
      '10001',
      '01110'
    ],
    'V': [
      '10001',
      '10001',
      '10001',
      '10001',
      '10001',
      '01010',
      '00100'
    ],
    'W': [
      '10001',
      '10001',
      '10001',
      '10101',
      '10101',
      '10101',
      '01010'
    ],
    'X': [
      '10001',
      '10001',
      '01010',
      '00100',
      '01010',
      '10001',
      '10001'
    ],
    'Y': [
      '10001',
      '10001',
      '01010',
      '00100',
      '00100',
      '00100',
      '00100'
    ],
    'Z': [
      '11111',
      '00001',
      '00010',
      '00100',
      '01000',
      '10000',
      '11111'
    ],
    ':': [
      '00000',
      '00100',
      '00100',
      '00000',
      '00100',
      '00100',
      '00000'
    ],
    '-': [
      '00000',
      '00000',
      '00000',
      '11111',
      '00000',
      '00000',
      '00000'
    ],
    '.': [
      '00000',
      '00000',
      '00000',
      '00000',
      '00000',
      '01100',
      '01100'
    ],
    ' ': [
      '00000',
      '00000',
      '00000',
      '00000',
      '00000',
      '00000',
      '00000'
    ]
  };

  var BLANK = GLYPHS[' '];

  function glyphFor(ch) {
    var upper = ch.toUpperCase();
    return Object.prototype.hasOwnProperty.call(GLYPHS, upper) ? GLYPHS[upper] : BLANK;
  }

  function buildGlyph(ch) {
    var rows = glyphFor(ch);
    var glyph = document.createElement('div');

    glyph.className = 'dm-glyph';
    glyph.dataset.char = ch;

    for (var row = 0; row < rows.length; row++) {
      for (var col = 0; col < rows[row].length; col++) {
        var cell = document.createElement('div');
        var className = 'dm-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        if (rows[row].charAt(col) === '1') {
          className += ' dm-on';
        }
        cell.className = className;
        glyph.appendChild(cell);
      }
    }

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

    container._dmState = { str: str, glyphs: glyphs };
  }

  function renderDotMatrixString(container, str) {
    if (!container) {
      throw new Error('renderDotMatrixString: container element is required');
    }
    str = String(str);

    var state = container._dmState;
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

  window.renderDotMatrixString = renderDotMatrixString;
  window.DotMatrixFont = {
    renderDotMatrixString: renderDotMatrixString,
    render: renderDotMatrixString,
    GLYPHS: GLYPHS
  };
})();
