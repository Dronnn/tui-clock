// ascii-font.js
// Registry-backed FIGlet-style ASCII digit renderer.
// Plain global script, no ES modules — exposes window.AsciiFont.

(function () {
  'use strict';

  var REQUIRED_GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ' '];

  // To add a font: add one entry here with glyphs for 0-9, ':' and ' '.
  // The normalizer pads each glyph to its own width and validates that every
  // glyph in that font has the same row count. Then add a settings radio with
  // value "afont-<key>"; digit-render.js already dispatches valid afont keys.
  var RAW_FONTS = {
    standard: {
      glyphs: {
        '0': [
          '  ___  ',
          ' / _ \\ ',
          '| | | |',
          '| |_| |',
          ' \\___/ ',
          '       '
        ],
        '1': [
          ' _ ',
          '/ |',
          '| |',
          '| |',
          '|_|',
          '   '
        ],
        '2': [
          ' ____  ',
          '|___ \\ ',
          '  __) |',
          ' / __/ ',
          '|_____|',
          '       '
        ],
        '3': [
          ' _____ ',
          '|___ / ',
          '  |_ \\ ',
          ' ___) |',
          '|____/ ',
          '       '
        ],
        '4': [
          ' _  _   ',
          '| || |  ',
          '| || |_ ',
          '|__   _|',
          '   |_|  ',
          '        '
        ],
        '5': [
          ' ____  ',
          '| ___| ',
          '|___ \\ ',
          ' ___) |',
          '|____/ ',
          '       '
        ],
        '6': [
          '  __   ',
          ' / /_  ',
          "| '_ \\ ",
          '| (_) |',
          ' \\___/ ',
          '       '
        ],
        '7': [
          ' _____ ',
          '|___  |',
          '   / / ',
          '  / /  ',
          ' /_/   ',
          '       '
        ],
        '8': [
          '  ___  ',
          ' ( _ ) ',
          ' / _ \\ ',
          '| (_) |',
          ' \\___/ ',
          '       '
        ],
        '9': [
          '  ___  ',
          ' / _ \\ ',
          '| (_) |',
          ' \\__, |',
          '   /_/ ',
          '       '
        ],
        ':': [
          '   ',
          ' _ ',
          '(_)',
          ' _ ',
          '(_)',
          '   '
        ],
        ' ': [
          '   ',
          '   ',
          '   ',
          '   ',
          '   ',
          '   '
        ]
      }
    },
    big: {
      glyphs: {
        '0': [
          '  ___  ',
          ' / _ \\ ',
          '| | | |',
          '| | | |',
          '| |_| |',
          ' \\___/ ',
          '       ',
          '       '
        ],
        '1': [
          ' __ ',
          '/_ |',
          ' | |',
          ' | |',
          ' | |',
          ' |_|',
          '    ',
          '    '
        ],
        '2': [
          ' ___  ',
          '|__ \\ ',
          '   ) |',
          '  / / ',
          ' / /_ ',
          '|____|',
          '      ',
          '      '
        ],
        '3': [
          ' ____  ',
          '|___ \\ ',
          '  __) |',
          ' |__ < ',
          ' ___) |',
          '|____/ ',
          '       ',
          '       '
        ],
        '4': [
          ' _  _   ',
          '| || |  ',
          '| || |_ ',
          '|__   _|',
          '   | |  ',
          '   |_|  ',
          '        ',
          '        '
        ],
        '5': [
          ' _____ ',
          '| ____|',
          '| |__  ',
          '|___ \\ ',
          ' ___) |',
          '|____/ ',
          '       ',
          '       '
        ],
        '6': [
          '   __  ',
          '  / /  ',
          ' / /_  ',
          "| '_ \\ ",
          '| (_) |',
          ' \\___/ ',
          '       ',
          '       '
        ],
        '7': [
          ' ______ ',
          '|____  |',
          '    / / ',
          '   / /  ',
          '  / /   ',
          ' /_/    ',
          '        ',
          '        '
        ],
        '8': [
          '  ___  ',
          ' / _ \\ ',
          '| (_) |',
          ' > _ < ',
          '| (_) |',
          ' \\___/ ',
          '       ',
          '       '
        ],
        '9': [
          '  ___  ',
          ' / _ \\ ',
          '| (_) |',
          ' \\__, |',
          '   / / ',
          '  /_/  ',
          '       ',
          '       '
        ],
        ':': [
          '   ',
          ' _ ',
          '(_)',
          '   ',
          ' _ ',
          '(_)',
          '   ',
          '   '
        ],
        ' ': [
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    '
        ]
      }
    },
    banner: {
      glyphs: {
        '0': [
          ' ##### ',
          '#     #',
          '#     #',
          '#     #',
          '#     #',
          '#     #',
          ' ##### ',
          '       '
        ],
        '1': [
          '   #   ',
          '  ##   ',
          ' # #   ',
          '   #   ',
          '   #   ',
          '   #   ',
          ' ##### ',
          '       '
        ],
        '2': [
          ' ##### ',
          '#     #',
          '      #',
          ' ##### ',
          '#      ',
          '#      ',
          '#######',
          '       '
        ],
        '3': [
          ' ##### ',
          '#     #',
          '      #',
          ' ##### ',
          '      #',
          '#     #',
          ' ##### ',
          '       '
        ],
        '4': [
          '#      ',
          '#    # ',
          '#    # ',
          '#    # ',
          '#######',
          '     # ',
          '     # ',
          '       '
        ],
        '5': [
          '#######',
          '#      ',
          '#      ',
          '###### ',
          '      #',
          '#     #',
          ' ##### ',
          '       '
        ],
        '6': [
          ' ##### ',
          '#     #',
          '#      ',
          '###### ',
          '#     #',
          '#     #',
          ' ##### ',
          '       '
        ],
        '7': [
          '#######',
          '#    # ',
          '    #  ',
          '   #   ',
          '  #    ',
          '  #    ',
          '  #    ',
          '       '
        ],
        '8': [
          ' ##### ',
          '#     #',
          '#     #',
          ' ##### ',
          '#     #',
          '#     #',
          ' ##### ',
          '       '
        ],
        '9': [
          ' ##### ',
          '#     #',
          '#     #',
          ' ######',
          '      #',
          '#     #',
          ' ##### ',
          '       '
        ],
        ':': [
          '   ',
          ' # ',
          ' # ',
          '   ',
          ' # ',
          ' # ',
          '   ',
          '   '
        ],
        ' ': [
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    ',
          '    '
        ]
      }
    }
  };

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function spaces(count) {
    var out = '';
    for (var i = 0; i < count; i++) {
      out += ' ';
    }
    return out;
  }

  function padRight(value, width) {
    value = String(value);
    return value.length < width ? value + spaces(width - value.length) : value;
  }

  function normalizeGlyph(fontKey, ch, rows, expectedHeight) {
    if (!Array.isArray(rows) || rows.length !== expectedHeight) {
      throw new Error('AsciiFont: glyph "' + ch + '" in "' + fontKey + '" must have ' + expectedHeight + ' rows');
    }

    var width = 0;
    for (var i = 0; i < rows.length; i++) {
      width = Math.max(width, String(rows[i]).length);
    }

    var normalized = [];
    for (var j = 0; j < rows.length; j++) {
      normalized.push(padRight(rows[j], width));
    }
    return normalized;
  }

  function normalizeFont(fontKey, sourceFont) {
    var sourceGlyphs = sourceFont.glyphs || {};
    var expectedHeight = null;
    var ch;

    for (ch in sourceGlyphs) {
      if (hasOwn(sourceGlyphs, ch)) {
        expectedHeight = sourceGlyphs[ch].length;
        break;
      }
    }

    if (!expectedHeight) {
      throw new Error('AsciiFont: font "' + fontKey + '" has no glyphs');
    }

    for (var i = 0; i < REQUIRED_GLYPHS.length; i++) {
      ch = REQUIRED_GLYPHS[i];
      if (!hasOwn(sourceGlyphs, ch)) {
        throw new Error('AsciiFont: font "' + fontKey + '" is missing glyph "' + ch + '"');
      }
    }

    var glyphs = {};
    for (ch in sourceGlyphs) {
      if (hasOwn(sourceGlyphs, ch)) {
        glyphs[ch] = normalizeGlyph(fontKey, ch, sourceGlyphs[ch], expectedHeight);
      }
    }

    return { glyphs: glyphs };
  }

  function normalizeFonts(sourceFonts) {
    var fonts = {};
    for (var fontKey in sourceFonts) {
      if (hasOwn(sourceFonts, fontKey)) {
        fonts[fontKey] = normalizeFont(fontKey, sourceFonts[fontKey]);
      }
    }
    return fonts;
  }

  var FONTS = normalizeFonts(RAW_FONTS);

  function resolveFontKey(fontKey) {
    return hasOwn(FONTS, fontKey) ? fontKey : 'standard';
  }

  function glyphFor(font, ch) {
    return hasOwn(font.glyphs, ch) ? font.glyphs[ch] : font.glyphs[' '];
  }

  function buildGlyph(ch, font) {
    var rows = glyphFor(font, ch);
    var glyph = document.createElement('pre');
    glyph.className = 'af-glyph';
    glyph.dataset.char = ch;
    glyph.textContent = rows.join('\n');
    return { el: glyph, ch: ch };
  }

  function buildAll(container, str, fontKey) {
    var resolvedFontKey = resolveFontKey(fontKey);
    var font = FONTS[resolvedFontKey];
    var row = document.createElement('div');
    var glyphs = [];

    row.className = 'af-row';
    container.innerHTML = '';

    for (var i = 0; i < str.length; i++) {
      var record = buildGlyph(str.charAt(i), font);
      row.appendChild(record.el);
      glyphs.push(record);
    }

    container.appendChild(row);
    container._afState = {
      str: str,
      fontKey: resolvedFontKey,
      row: row,
      glyphs: glyphs
    };
  }

  function render(container, str, fontKey) {
    if (!container) {
      throw new Error('AsciiFont.render: container element is required');
    }

    str = String(str);

    var resolvedFontKey = resolveFontKey(fontKey);
    var state = container._afState;
    if (!state || state.str.length !== str.length || state.fontKey !== resolvedFontKey) {
      buildAll(container, str, resolvedFontKey);
      return;
    }

    if (state.str === str) {
      return;
    }

    var font = FONTS[resolvedFontKey];
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      if (ch === state.str.charAt(i)) {
        continue;
      }

      var newRecord = buildGlyph(ch, font);
      state.row.replaceChild(newRecord.el, state.glyphs[i].el);
      state.glyphs[i] = newRecord;
    }

    state.str = str;
  }

  window.AsciiFont = {
    FONTS: FONTS,
    render: render
  };
})();
