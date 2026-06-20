// matrix-bg.js
// Optional full-window Matrix-rain canvas background. Plain global script,
// no ES modules — exposes window.MatrixBG.

(function () {
  'use strict';

  var CHARACTERS = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var FONT_SIZE = 18;
  var TRAIL_LENGTH = 16;
  var FRAME_INTERVAL_MS = 1000 / 24;
  var TRAIL_ALPHA = 0.16;
  var HEAD_ALPHA = 0.48;
  var CANVAS_OPACITY = 0.32;

  var canvas = null;
  var ctx = null;
  var columns = [];
  var enabled = false;
  var rafId = null;
  var lastFrameTime = 0;

  function ensureCanvas() {
    if (canvas) {
      return;
    }

    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');

    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'none';
    canvas.style.opacity = String(CANVAS_OPACITY);

    document.body.appendChild(canvas);
  }

  function resizeCanvas() {
    if (!canvas || !ctx) {
      return;
    }

    var dpr = window.devicePixelRatio || 1;
    var width = Math.max(1, window.innerWidth || 1);
    var height = Math.max(1, window.innerHeight || 1);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    if (ctx.setTransform) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    rebuildColumns(width, height);
  }

  function rebuildColumns(width, height) {
    var count = Math.ceil(width / FONT_SIZE);
    columns = [];

    for (var i = 0; i < count; i++) {
      columns.push({
        x: i * FONT_SIZE,
        y: Math.random() * height,
        speed: 0.65 + Math.random() * 0.75
      });
    }
  }

  function randomCharacter() {
    return CHARACTERS.charAt(Math.floor(Math.random() * CHARACTERS.length));
  }

  function readAccentColor() {
    var styles = getComputedStyle(document.documentElement);
    return styles.getPropertyValue('--fg').trim() || '#33ff66';
  }

  function drawFrame() {
    var width = window.innerWidth || canvas.width;
    var height = window.innerHeight || canvas.height;
    var accentColor = readAccentColor();

    ctx.clearRect(0, 0, width, height);
    ctx.font = FONT_SIZE + 'px "SF Mono", "JetBrains Mono", "Fira Code", monospace';
    ctx.textBaseline = 'top';

    for (var i = 0; i < columns.length; i++) {
      var column = columns[i];
      var headRow = Math.floor(column.y / FONT_SIZE);

      for (var trailIndex = 0; trailIndex < TRAIL_LENGTH; trailIndex++) {
        var y = (headRow - trailIndex) * FONT_SIZE;
        if (y < -FONT_SIZE || y > height) {
          continue;
        }

        if (trailIndex === 0) {
          ctx.globalAlpha = HEAD_ALPHA;
          ctx.fillStyle = 'rgba(245, 255, 245, 0.95)';
        } else {
          ctx.globalAlpha = TRAIL_ALPHA * (1 - trailIndex / TRAIL_LENGTH);
          ctx.fillStyle = accentColor;
        }
        ctx.fillText(randomCharacter(), column.x, y);
      }

      column.y += column.speed * FONT_SIZE;
      if (column.y - TRAIL_LENGTH * FONT_SIZE > height) {
        column.y = -Math.random() * height * 0.6;
        column.speed = 0.65 + Math.random() * 0.75;
      }
    }

    ctx.globalAlpha = 1;
  }

  function loop(timestamp) {
    if (!enabled) {
      return;
    }

    if (!lastFrameTime || timestamp - lastFrameTime >= FRAME_INTERVAL_MS) {
      lastFrameTime = timestamp;
      drawFrame();
    }

    rafId = requestAnimationFrame(loop);
  }

  function enable() {
    if (enabled) {
      return;
    }

    ensureCanvas();
    enabled = true;
    lastFrameTime = 0;
    canvas.style.display = 'block';
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    rafId = requestAnimationFrame(loop);
  }

  function disable() {
    if (!enabled) {
      return;
    }

    enabled = false;
    window.removeEventListener('resize', resizeCanvas);

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
    }
  }

  function toggle() {
    if (enabled) {
      disable();
    } else {
      enable();
    }
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  window.MatrixBG = {
    enable: enable,
    disable: disable,
    toggle: toggle,
    isEnabled: isEnabled
  };
})();
