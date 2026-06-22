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

  function figletRaw(fontName, s) {
    // A very large width disables figlet's word-wrapping. Without it, wide fonts
    // wrap (or fail to empty) on long space-less strings; the app does its own
    // fit-to-viewport scaling instead. Wrapping (when the digits are zoomed past
    // the frame) is handled at the source-string level in renderArt, not here.
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

  // Monospace mode, read globally from <html data-mono>: 'off' keeps the nice
  // kerned look (but proportional digits shift the centered block as they
  // tick); 'seconds' gives only the seconds digits a uniform cell (the rest
  // stay proportional); 'digits' gives every digit a uniform cell (weekday/
  // month stay normal width); 'all' gives every glyph a uniform cell.
  function monoMode() {
    var m = document.documentElement.getAttribute('data-mono');
    return (m === 'all' || m === 'digits' || m === 'seconds') ? m : 'off';
  }

  // Per-(font,char) glyph rectangle at the font's full height, keeping figlet's
  // natural horizontal spacing so monospaced output isn't cramped.
  var glyphCache = {};
  function glyphRect(fontName, ch) {
    var ck = fontName + '|' + ch;
    if (glyphCache[ck]) {
      return glyphCache[ck];
    }
    var lines = figletRaw(fontName, ch).split('\n');
    var w = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].length > w) {
        w = lines[i].length;
      }
    }
    var rect = [];
    for (i = 0; i < lines.length; i++) {
      rect.push(lines[i] + spaces(w - lines[i].length));
    }
    var g = { lines: rect, width: w, height: lines.length };
    glyphCache[ck] = g;
    return g;
  }

  function maxDigitCell(fontName) {
    var m = 0;
    for (var d = 0; d < 10; d++) {
      var w = glyphRect(fontName, String(d)).width;
      if (w > m) {
        m = w;
      }
    }
    return m;
  }

  function padCenter(lines, target) {
    var w = 0;
    var i;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].length > w) {
        w = lines[i].length;
      }
    }
    if (target <= w) {
      return lines;
    }
    var left = Math.floor((target - w) / 2);
    var out = [];
    for (i = 0; i < lines.length; i++) {
      out.push(spaces(left) + lines[i] + spaces(target - left - lines[i].length));
    }
    return out;
  }

  // Trims leading/trailing blank rows and the shared left margin so the result
  // hugs the ink. Used for the proportional ('off') mode. Returns a row array.
  function tightenRows(rows) {
    var lines = dropBlankEdges(rows);
    var minLead = commonLeftMargin(lines);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      out.push(lines[i].slice(minLead).replace(/\s+$/, ''));
    }
    return out;
  }

  // Drops only blank top/bottom rows, keeping every column intact. Mono modes
  // need this (not tightenRows): each row is exactly the sum of the per-glyph
  // cell widths, so leaving the columns untouched keeps the block width
  // constant as digits tick — the centered block never shifts. Trimming the
  // left margin / trailing space (as tightenRows does) would reintroduce the
  // jitter by making the width depend on the edge glyphs' ink.
  function trimVerticalRows(rows) {
    return dropBlankEdges(rows);
  }

  // True when index i falls inside the seconds range [start, end). When no
  // range is supplied (e.g. countdown/stopwatch don't pass one), 'seconds' mode
  // falls back to the last maximal run of digits in the string.
  function inSeconds(str, i, range) {
    if (range) {
      return i >= range[0] && i < range[1];
    }
    var end = -1;
    var k;
    for (k = str.length - 1; k >= 0; k--) {
      if (str.charAt(k) >= '0' && str.charAt(k) <= '9') {
        end = k;
        break;
      }
    }
    if (end < 0) {
      return false;
    }
    var start = end;
    while (start - 1 >= 0 && str.charAt(start - 1) >= '0' && str.charAt(start - 1) <= '9') {
      start--;
    }
    return i >= start && i <= end;
  }

  function composeMonoRows(fontName, str, mode, secondsRange) {
    if (!str.length) {
      return [];
    }
    var digitCell = maxDigitCell(fontName);
    var allCell = digitCell;
    var i;
    if (mode === 'all') {
      for (i = 0; i < str.length; i++) {
        var gw = glyphRect(fontName, str.charAt(i)).width;
        if (gw > allCell) {
          allCell = gw;
        }
      }
    }
    var height = glyphRect(fontName, str.charAt(0)).height;
    var cols = [];
    for (i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var g = glyphRect(fontName, ch);
      var target = g.width;
      var isDigit = ch >= '0' && ch <= '9';
      if (mode === 'all') {
        target = allCell;
      } else if (mode === 'digits' && isDigit) {
        target = digitCell;
      } else if (mode === 'seconds' && isDigit && inSeconds(str, i, secondsRange)) {
        target = digitCell;
      }
      cols.push(padCenter(g.lines, target));
    }
    var rows = [];
    for (var r = 0; r < height; r++) {
      var s = '';
      for (var c = 0; c < cols.length; c++) {
        s += cols[c][r] || '';
      }
      rows.push(s);
    }
    return trimVerticalRows(rows);
  }

  function secondsRangeOf(opts) {
    return opts && opts.secondsRange ? opts.secondsRange : null;
  }

  function secondsKeyOf(opts) {
    var r = secondsRangeOf(opts);
    return r ? r[0] + ',' + r[1] : '';
  }

  function wrapColsOf(opts) {
    return opts && opts.wrapCols ? opts.wrapCols : 0;
  }

  // Renders one source string (no wrapping) to a row array, in the active mode.
  function blockRows(fontName, str, secondsRange) {
    var mode = monoMode();
    if (mode === 'off') {
      return tightenRows(figletRaw(fontName, str).split('\n'));
    }
    return composeMonoRows(fontName, str, mode, secondsRange);
  }

  function maxRowLen(rows) {
    var w = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].length > w) {
        w = rows[i].length;
      }
    }
    return w;
  }

  // Stacks several rendered blocks vertically, centering each to the widest, so
  // a wrapped clock reads as multiple centered lines. A blank gap row separates
  // them.
  function stackBlocks(blocks) {
    var maxW = 0;
    var i;
    for (i = 0; i < blocks.length; i++) {
      maxW = Math.max(maxW, maxRowLen(blocks[i]));
    }
    var out = [];
    for (i = 0; i < blocks.length; i++) {
      if (i > 0) {
        out.push('');
      }
      var padded = padCenter(blocks[i], maxW);
      for (var r = 0; r < padded.length; r++) {
        out.push(padded[r]);
      }
    }
    return out;
  }

  // Greedily wraps the source string's space-separated words so that each line's
  // rendered block is no wider than wrapCols columns, then stacks the lines.
  // wrapCols is in figlet columns and is independent of the cell pixel size, so
  // the wrap is stable while the app scales --root-cell-size to fit.
  function wrapRows(fontName, str, wrapCols) {
    var words = str.split(' ');
    var blocks = [];
    var current = [];

    function flush() {
      if (current.length) {
        blocks.push(blockRows(fontName, current.join(' '), null));
        current = [];
      }
    }

    for (var i = 0; i < words.length; i++) {
      if (words[i] === '') {
        continue;
      }
      var trial = current.concat([words[i]]);
      var width = maxRowLen(blockRows(fontName, trial.join(' '), null));
      if (width > wrapCols && current.length) {
        flush();
        current = [words[i]];
      } else {
        current.push(words[i]);
      }
    }
    flush();

    if (!blocks.length) {
      return [];
    }
    return blocks.length === 1 ? blocks[0] : stackBlocks(blocks);
  }

  function renderArt(fontName, str, opts) {
    var wrapCols = wrapColsOf(opts);
    if (wrapCols > 0) {
      // When wrapping, the global seconds range no longer maps to the per-line
      // segments, so the 'seconds' mode falls back to its last-digit-run rule.
      return wrapRows(fontName, str, wrapCols).join('\n');
    }
    return blockRows(fontName, str, secondsRangeOf(opts)).join('\n');
  }

  function buildAll(container, str, key, fontName, opts) {
    var row = document.createElement('div');
    row.className = 'af-row';

    var pre = document.createElement('pre');
    pre.className = 'af-glyph af-block';
    pre.textContent = renderArt(fontName, str, opts);

    row.appendChild(pre);
    container.innerHTML = '';
    container.appendChild(row);

    container._flfState = {
      str: str, key: key, mono: monoMode(), secKey: secondsKeyOf(opts),
      wrap: wrapColsOf(opts), pre: pre
    };
  }

  function render(container, str, key, opts) {
    if (!container) {
      throw new Error('FlfFont.render: container element is required');
    }
    str = String(str);

    var fontName = ensureParsed(key);
    if (!fontName) {
      throw new Error('FlfFont.render: unknown font "' + key + '"');
    }

    var secKey = secondsKeyOf(opts);
    var wrap = wrapColsOf(opts);
    var state = container._flfState;
    if (!state || state.key !== key || state.mono !== monoMode()) {
      buildAll(container, str, key, fontName, opts);
      return;
    }
    if (state.str === str && state.secKey === secKey && state.wrap === wrap) {
      return;
    }
    state.pre.textContent = renderArt(fontName, str, opts);
    state.str = str;
    state.secKey = secKey;
    state.wrap = wrap;
  }

  window.FlfFont = {
    render: render,
    has: has,
    order: order,
    label: label,
    capabilities: capabilities
  };
})();
