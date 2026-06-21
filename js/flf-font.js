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

  function renderArt(fontName, str) {
    // A very large width disables figlet's word-wrapping. Without it, wide
    // fonts wrap (or fail to empty) on long space-less strings like
    // "0123456789"; the app does its own fit-to-viewport scaling instead.
    return window.figlet.textSync(str, {
      font: fontName,
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 100000,
      whitespaceBreak: false
    });
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
    label: label
  };
})();
