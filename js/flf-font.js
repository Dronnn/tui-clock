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

  // Trims the figlet art so its bounding box hugs the visible "ink": drops
  // leading/trailing blank lines and the common left/right blank margin. Fonts
  // carry different amounts of internal padding, so without this the framed
  // text would sit off-centre (often pushed to the top) and the frame's gap
  // would vary font-to-font. After trimming, a uniform CSS padding gives every
  // font the same gap and keeps the text centred.
  function trimArt(art) {
    var lines = art.split('\n');
    while (lines.length && lines[0].trim() === '') {
      lines.shift();
    }
    while (lines.length && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    if (!lines.length) {
      return '';
    }
    var minLead = Infinity;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        continue; // ignore interior blank lines when measuring the left margin
      }
      var lead = lines[i].length - lines[i].replace(/^ +/, '').length;
      if (lead < minLead) {
        minLead = lead;
      }
    }
    if (minLead === Infinity || minLead < 0) {
      minLead = 0;
    }
    for (var j = 0; j < lines.length; j++) {
      // Drop the shared left indent and any trailing spaces so the widest
      // inked line defines the box width.
      lines[j] = lines[j].slice(minLead).replace(/\s+$/, '');
    }
    return lines.join('\n');
  }

  function renderArt(fontName, str) {
    // A very large width disables figlet's word-wrapping. Without it, wide
    // fonts wrap (or fail to empty) on long space-less strings like
    // "0123456789"; the app does its own fit-to-viewport scaling instead.
    var art = window.figlet.textSync(str, {
      font: fontName,
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 100000,
      whitespaceBreak: false
    });
    return trimArt(art);
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
