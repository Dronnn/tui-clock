// block-stack-font.js
// Renders strings into a chunky 5x7 bitmap digit font with three stepped
// wireframe outline copies behind the solid face.
// Plain global script, no ES modules — exposes window.BlockStackFont.

(function () {
  'use strict';

  var GLYPHS = {
    '0': [
      '11111',
      '10001',
      '10011',
      '10101',
      '11001',
      '10001',
      '11111'
    ],
    '1': [
      '00110',
      '01110',
      '00110',
      '00110',
      '00110',
      '00110',
      '01111'
    ],
    '2': [
      '11111',
      '00001',
      '00001',
      '11111',
      '10000',
      '10000',
      '11111'
    ],
    '3': [
      '11111',
      '00001',
      '00001',
      '01111',
      '00001',
      '00001',
      '11111'
    ],
    '4': [
      '10001',
      '10001',
      '10001',
      '11111',
      '00001',
      '00001',
      '00001'
    ],
    '5': [
      '11111',
      '10000',
      '10000',
      '11111',
      '00001',
      '00001',
      '11111'
    ],
    '6': [
      '11111',
      '10000',
      '10000',
      '11111',
      '10001',
      '10001',
      '11111'
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
      '11111',
      '10001',
      '10001',
      '11111',
      '10001',
      '10001',
      '11111'
    ],
    '9': [
      '11111',
      '10001',
      '10001',
      '11111',
      '00001',
      '00001',
      '11111'
    ],
    ':': [
      '0',
      '1',
      '1',
      '0',
      '1',
      '1',
      '0'
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
  var SHADOW_COUNT = 3;

  function glyphFor(ch) {
    return Object.prototype.hasOwnProperty.call(GLYPHS, ch) ? GLYPHS[ch] : BLANK;
  }

  function isOn(rows, row, col) {
    return row >= 0 &&
      row < rows.length &&
      col >= 0 &&
      col < rows[row].length &&
      rows[row].charAt(col) === '1';
  }

  function setStyleVar(el, name, value) {
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty(name, value);
    } else if (el.style) {
      el.style[name] = value;
    }
  }

  function appendCell(layer, rows, row, col, kind) {
    var cell = document.createElement('div');
    var on = isOn(rows, row, col);
    var className = 'bs-cell';

    cell.dataset.row = String(row);
    cell.dataset.col = String(col);

    if (kind === 'solid') {
      if (on) {
        className += ' bs-on';
      }
    } else if (on) {
      className += ' bs-outline';
      if (!isOn(rows, row - 1, col)) {
        className += ' bs-edge-top';
      }
      if (!isOn(rows, row, col + 1)) {
        className += ' bs-edge-right';
      }
      if (!isOn(rows, row + 1, col)) {
        className += ' bs-edge-bottom';
      }
      if (!isOn(rows, row, col - 1)) {
        className += ' bs-edge-left';
      }
    }

    cell.className = className;
    layer.appendChild(cell);
  }

  function buildLayer(rows, kind, shadowIndex) {
    var layer = document.createElement('div');
    var cols = rows[0].length;
    var className = 'bs-layer';

    if (kind === 'solid') {
      className += ' bs-solid';
    } else {
      className += ' bs-shadow bs-shadow-' + shadowIndex;
      layer.dataset.shadow = String(shadowIndex);
    }

    layer.className = className;
    setStyleVar(layer, '--bs-cols', String(cols));

    for (var row = 0; row < rows.length; row++) {
      for (var col = 0; col < cols; col++) {
        appendCell(layer, rows, row, col, kind);
      }
    }

    return layer;
  }

  function buildGlyph(ch) {
    var rows = glyphFor(ch);
    var glyph = document.createElement('div');
    var cols = rows[0].length;

    glyph.className = 'bs-glyph' + (cols === 1 ? ' bs-glyph--narrow' : '');
    glyph.dataset.char = ch;
    setStyleVar(glyph, '--bs-cols', String(cols));

    for (var i = SHADOW_COUNT; i >= 1; i--) {
      glyph.appendChild(buildLayer(rows, 'shadow', i));
    }
    glyph.appendChild(buildLayer(rows, 'solid', 0));

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

    container._bsState = { str: str, glyphs: glyphs };
  }

  function renderBlockStackString(container, str) {
    if (!container) {
      throw new Error('renderBlockStackString: container element is required');
    }
    str = String(str);

    var state = container._bsState;
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

  window.renderBlockStackString = renderBlockStackString;
  window.BlockStackFont = {
    renderBlockStackString: renderBlockStackString,
    render: renderBlockStackString,
    GLYPHS: GLYPHS
  };
})();
