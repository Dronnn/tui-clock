// digit-render.js
// Dispatches display rendering between the classic segment renderer and
// optional digit renderers selected by document.documentElement.dataset.style.
// Plain global script, no ES modules — exposes window.renderDigits.

(function () {
  'use strict';

  function asciiFontKey(style) {
    if (typeof style !== 'string' || style.indexOf('afont-') !== 0) {
      return null;
    }

    var fontKey = style.slice('afont-'.length);
    if (!fontKey) {
      return null;
    }

    if (!window.AsciiFont || !window.AsciiFont.FONTS) {
      return fontKey;
    }

    return Object.prototype.hasOwnProperty.call(window.AsciiFont.FONTS, fontKey) ? fontKey : null;
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

  function renderDigits(container, str) {
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
      if (!window.AsciiFont || typeof window.AsciiFont.render !== 'function') {
        throw new Error('renderDigits: AsciiFont renderer is not available');
      }
      window.AsciiFont.render(container, str, renderer.slice('afont-'.length));
      return;
    }

    if (typeof window.renderSegmentString !== 'function') {
      throw new Error('renderDigits: segment renderer is not available');
    }
    window.renderSegmentString(container, str);
  }

  window.renderDigits = renderDigits;
})();
