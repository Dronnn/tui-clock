// digit-render.js
// Dispatches display rendering between the classic segment renderer and
// optional digit renderers selected by document.documentElement.dataset.style.
// Plain global script, no ES modules — exposes window.renderDigits.

(function () {
  'use strict';

  // A style is a valid ASCII/figlet font style if it is "afont-<key>" with a
  // non-empty key. The actual renderer (real FIGlet via FlfFont, or the legacy
  // hand-made AsciiFont) is chosen at dispatch time based on which one knows
  // the key.
  function asciiFontKey(style) {
    if (typeof style !== 'string' || style.indexOf('afont-') !== 0) {
      return null;
    }
    return style.slice('afont-'.length) || null;
  }

  function activeRenderer() {
    var style = document.documentElement.dataset.style;
    if (style === 'block-stack' || style === 'dash' || style === 'dot-matrix') {
      return style;
    }
    if (asciiFontKey(style) !== null) {
      return style;
    }
    return 'segment';
  }

  function clearRendererState(container) {
    container.innerHTML = '';
    container._sdState = null;
    container._bsState = null;
    container._dashState = null;
    container._dmState = null;
    container._afState = null;
  }

  // opts (optional): { secondsRange: [start, end) } — character range of the
  // seconds digits, used only by the figlet renderer's 'seconds' monospace
  // mode. Ignored by the bitmap/segment renderers.
  function renderDigits(container, str, opts) {
    if (!container) {
      throw new Error('renderDigits: container element is required');
    }

    var renderer = activeRenderer();
    if (container.dataset.renderer !== renderer) {
      clearRendererState(container);
      container.dataset.renderer = renderer;
    }

    if (renderer === 'block-stack') {
      if (!window.BlockStackFont || typeof window.BlockStackFont.renderBlockStackString !== 'function') {
        throw new Error('renderDigits: BlockStackFont renderer is not available');
      }
      window.BlockStackFont.renderBlockStackString(container, str);
      return;
    }

    if (renderer === 'dash') {
      if (!window.DashFont || typeof window.DashFont.renderDashString !== 'function') {
        throw new Error('renderDigits: DashFont renderer is not available');
      }
      window.DashFont.renderDashString(container, str);
      return;
    }

    if (renderer === 'dot-matrix') {
      if (!window.DotMatrixFont || typeof window.DotMatrixFont.renderDotMatrixString !== 'function') {
        throw new Error('renderDigits: DotMatrixFont renderer is not available');
      }
      window.DotMatrixFont.renderDotMatrixString(container, str);
      return;
    }

    if (renderer.indexOf('afont-') === 0) {
      var fontKey = renderer.slice('afont-'.length);
      // Prefer the real FIGlet engine (full ASCII charset, exact patorjk
      // output); fall back to the legacy hand-made glyphs only if FlfFont
      // doesn't know this font.
      if (window.FlfFont && typeof window.FlfFont.has === 'function' && window.FlfFont.has(fontKey)) {
        window.FlfFont.render(container, str, fontKey, opts);
        return;
      }
      if (!window.AsciiFont || typeof window.AsciiFont.render !== 'function') {
        throw new Error('renderDigits: AsciiFont renderer is not available');
      }
      window.AsciiFont.render(container, str, fontKey);
      return;
    }

    if (typeof window.renderSegmentString !== 'function') {
      throw new Error('renderDigits: segment renderer is not available');
    }
    window.renderSegmentString(container, str);
  }

  window.renderDigits = renderDigits;
})();
