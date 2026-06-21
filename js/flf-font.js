// flf-font.js
// Renders strings as real FIGlet fonts using the vendored figlet.js engine
// (the same engine that powers patorjk's TAAG, so output matches exactly) and
// the font data embedded in figlet-fonts.js. Unlike the hand-made AsciiFont
// glyphs, these fonts cover the full printable ASCII range, so weekday/month
// names render as letters and kerning fonts (e.g. ANSI Shadow) sit correctly.
//
// Plain global script, no ES modules — exposes window.FlfFont.
// Emits the same DOM shape as AsciiFont (a `.af-row` holding one `.af-glyph`
// <pre>) so existing CSS sizing and the app's fit-to-viewport logic apply
// unchanged. The whole string is laid out as a single FIGlet block so
// kerning/smushing between characters is correct (not glyph-by-glyph).

(function () {
  'use strict';

  var parsed = {}; // key -> true once figlet.parseFont has run for it

  function fontsData() {
    return window.FIGLET_FONTS || {};
  }

  function has(key) {
    return Object.prototype.hasOwnProperty.call(fontsData(), key);
  }

  function order() {
    return window.FIGLET_FONT_ORDER || Object.keys(fontsData());
  }

  function label(key) {
    var entry = fontsData()[key];
    return entry ? entry.label || entry.name || key : key;
  }

  // Returns { letters, colon, period } describing which glyph classes the font
  // can render, so the clock can fall back to a numeric-only format (no
  // letters) and an alternate time separator (no colon). Unknown fonts are
  // assumed fully capable.
  function capabilities(key) {
    var entry = fontsData()[key];
    var caps = entry && entry.caps;
    return {
      letters: caps ? caps.letters !== false : true,
      colon: caps ? caps.colon !== false : true,
      period: caps ? caps.period !== false : true
    };
  }

  // Parses a font into figlet on first use (lazy — avoids parsing all fonts at
  // boot). Returns the figlet font name to pass to textSync, or null.
  function ensureParsed(key) {
    var entry = fontsData()[key];
    if (!entry) {
      return null;
    }
    if (!parsed[key]) {
      if (!window.figlet || typeof window.figlet.parseFont !== 'function') {
        throw new Error('FlfFont: figlet engine is not loaded');
      }
      window.figlet.parseFont(entry.name, entry.data);
      parsed[key] = true;
    }
    return entry.name;
  }

  // Per-font caches: the widest digit glyph, and the stable "box" (left margin +
  // width in columns) of a given digit-normalized shape.
  var widestDigitCache = {};
  var shapeBoxCache = {};

  function figletRaw(fontName, s) {
    // A very large width disables figlet's word-wrapping. Without it, wide fonts
    // wrap (or fail to empty) on long space-less strings; the app does its own
    // fit-to-viewport scaling instead.
    return window.figlet.textSync(s, {
      font: fontName,
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 100000,
      whitespaceBreak: false
    });
  }

  function spaces(n) {
    return n > 0 ? new Array(n + 1).join(' ') : '';
  }

  function dropBlankEdges(lines) {
    var start = 0;
    var end = lines.length;
    while (start < end && lines[start].trim() === '') {
      start++;
    }
    while (end > start && lines[end - 1].trim() === '') {
      end--;
    }
    return lines.slice(start, end);
  }

  // Common count of leading spaces across the inked lines (ignoring blank ones).
  function commonLeftMargin(lines) {
    var min = Infinity;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        continue;
      }
      var lead = lines[i].length - lines[i].replace(/^ +/, '').length;
      if (lead < min) {
        min = lead;
      }
    }
    return isFinite(min) ? min : 0;
  }

  function widestDigit(fontName) {
    if (widestDigitCache[fontName]) {
      return widestDigitCache[fontName];
    }
    var best = '0';
    var bestWidth = -1;
    for (var d = 0; d < 10; d++) {
      var lines = dropBlankEdges(figletRaw(fontName, String(d)).split('\n'));
      var ml = commonLeftMargin(lines);
      var w = 0;
      for (var i = 0; i < lines.length; i++) {
        var t = lines[i].slice(ml).replace(/\s+$/, '');
        if (t.length > w) {
          w = t.length;
        }
      }
      if (w > bestWidth) {
        bestWidth = w;
        best = String(d);
      }
    }
    widestDigitCache[fontName] = best;
    return best;
  }

  // The stable box for a shape (the string with every digit replaced by the
  // font's widest digit): its left margin and column width. Because the widest
  // digit is used, the real string never exceeds this width, so the rendered
  // block keeps a constant size as digits tick — the left edge stays put and
  // only trailing space on the right changes. This kills the horizontal jitter
  // without forcing ugly monospaced digits.
  function shapeBox(fontName, shape) {
    var cacheKey = fontName + '|' + shape;
    if (shapeBoxCache[cacheKey]) {
      return shapeBoxCache[cacheKey];
    }
    var lines = dropBlankEdges(figletRaw(fontName, shape).split('\n'));
    var minLead = commonLeftMargin(lines);
    var width = 0;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].slice(minLead).replace(/\s+$/, '');
      if (t.length > width) {
        width = t.length;
      }
    }
    var box = { minLead: minLead, width: width };
    shapeBoxCache[cacheKey] = box;
    return box;
  }

  function renderArt(fontName, str) {
    var shape = str.replace(/[0-9]/g, widestDigit(fontName));
    var box = shapeBox(fontName, shape);
    var lines = dropBlankEdges(figletRaw(fontName, str).split('\n'));
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].slice(box.minLead).replace(/\s+$/, '');
      if (line.length > box.width) {
        line = line.slice(0, box.width);
      }
      // Right-pad to the stable box width so the <pre> never reflows.
      out.push(line + spaces(box.width - line.length));
    }
    return out.join('\n');
  }

  function buildAll(container, str, key, fontName) {
    var row = document.createElement('div');
    row.className = 'af-row';

    var pre = document.createElement('pre');
    pre.className = 'af-glyph af-block';
    pre.textContent = renderArt(fontName, str);

    row.appendChild(pre);
    container.innerHTML = '';
    container.appendChild(row);

    container._flfState = { str: str, key: key, pre: pre };
  }

  function render(container, str, key) {
    if (!container) {
      throw new Error('FlfFont.render: container element is required');
    }
    str = String(str);

    var fontName = ensureParsed(key);
    if (!fontName) {
      throw new Error('FlfFont.render: unknown font "' + key + '"');
    }

    var state = container._flfState;
    if (!state || state.key !== key) {
      buildAll(container, str, key, fontName);
      return;
    }
    if (state.str === str) {
      return;
    }
    state.pre.textContent = renderArt(fontName, str);
    state.str = str;
  }

  window.FlfFont = {
    render: render,
    has: has,
    order: order,
    label: label,
    capabilities: capabilities
  };
})();
