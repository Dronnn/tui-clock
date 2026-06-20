// notify.js
// Notifications for timer completion / alarm firing: a short synthesized
// beep (Web Audio API, no audio files), a best-effort browser Notification,
// and a CSS-driven visual flash on a given element. Plain global script,
// no ES modules — exposes window.Notify.
//
// Public API:
//   Notify.beep()
//     - Plays a short (~200ms) synthesized beep. Lazily creates and reuses
//       a single shared AudioContext. Resumes it if suspended (browsers
//       may require a user gesture before audio can play). Never throws —
//       logs a console.warn and gives up silently if audio is unavailable.
//   Notify.requestPermissionIfNeeded()
//     - Calls Notification.requestPermission() the first time it's called,
//       and never again afterward (cached in-module). Intended to be
//       called lazily by timer/alarm creation code, not on page load.
//   Notify.notify(title, options)
//     - Shows `new Notification(title, options)` only if the Notification
//       API exists and permission is already 'granted'. No-ops otherwise
//       (callers are expected to pair this with Notify.flash/beep, which
//       work regardless of notification permission). Never throws.
//   Notify.flash(element, options)
//     - Adds the `.flashing` CSS class to `element`, triggering a blinking
//       amber animation defined in css/style.css. Removes the class after
//       `options.duration` ms (default 4000), unless `options.duration` is
//       explicitly 0/false, meaning "flash until Notify.stopFlash is
//       called" (e.g. a finished timer row that should keep flashing until
//       dismissed or deleted).
//   Notify.stopFlash(element)
//     - Removes the `.flashing` class and clears any pending auto-stop
//       timer for that element.
//   Notify.fire(element, title, body)
//     - Convenience combo: flash(element) + beep() + best-effort
//       notify(title, { body }). Used by timer-completion and alarm-firing
//       code, which want all three at once per the design spec.

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Beep (Web Audio API)
  // ---------------------------------------------------------------------

  // Lazily created, reused across calls — repeatedly creating AudioContext
  // instances can hit browser limits (Chrome caps the number alive at once).
  var sharedAudioCtx = null;

  function getAudioContext() {
    if (sharedAudioCtx) {
      return sharedAudioCtx;
    }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    try {
      sharedAudioCtx = new Ctor();
    } catch (err) {
      console.warn('Notify.beep: failed to create AudioContext:', err);
      sharedAudioCtx = null;
    }
    return sharedAudioCtx;
  }

  function playBeep(ctx) {
    var duration = 0.2; // seconds, ~200ms
    var oscillator = ctx.createOscillator();
    var gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880; // A5, a clear but not jarring tone

    var now = ctx.currentTime;
    // Short attack/decay envelope so the beep doesn't click at start/end.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  function beep() {
    var ctx = getAudioContext();
    if (!ctx) {
      console.warn('Notify.beep: Web Audio API unavailable, skipping beep.');
      return;
    }

    try {
      if (ctx.state === 'suspended') {
        // Some browsers require a user gesture before audio can start.
        // resume() returns a promise; play once it resolves, and fail
        // silently (with a warning) if it's rejected.
        ctx.resume().then(function () {
          try {
            playBeep(ctx);
          } catch (err) {
            console.warn('Notify.beep: failed to play after resume:', err);
          }
        }, function (err) {
          console.warn('Notify.beep: AudioContext.resume() was rejected:', err);
        });
        return;
      }
      playBeep(ctx);
    } catch (err) {
      console.warn('Notify.beep: failed to play beep:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Browser Notification API
  // ---------------------------------------------------------------------

  var permissionRequested = false;

  function requestPermissionIfNeeded() {
    if (permissionRequested) {
      return;
    }
    permissionRequested = true;

    if (!('Notification' in window) || typeof Notification.requestPermission !== 'function') {
      return;
    }
    try {
      // requestPermission() is promise-based in modern browsers but used
      // to be callback-based; calling with no args is safe in both.
      Notification.requestPermission().catch(function (err) {
        console.warn('Notify.requestPermissionIfNeeded: request failed:', err);
      });
    } catch (err) {
      console.warn('Notify.requestPermissionIfNeeded: request threw:', err);
    }
  }

  function notify(title, options) {
    if (!('Notification' in window)) {
      return;
    }
    if (Notification.permission !== 'granted') {
      return;
    }
    try {
      new Notification(title, options);
    } catch (err) {
      console.warn('Notify.notify: failed to show notification:', err);
    }
  }

  // ---------------------------------------------------------------------
  // Visual flash
  // ---------------------------------------------------------------------

  var DEFAULT_FLASH_DURATION = 4000; // ms

  // Tracks pending auto-stop timers per element so a second flash() call
  // on the same element restarts (rather than stacks) the timeout, and so
  // stopFlash() can cancel it cleanly.
  var flashTimers = new WeakMap();

  function flash(element, options) {
    if (!element) {
      return;
    }
    var opts = options || {};
    var duration = Object.prototype.hasOwnProperty.call(opts, 'duration')
      ? opts.duration
      : DEFAULT_FLASH_DURATION;

    var existingTimer = flashTimers.get(element);
    if (existingTimer) {
      clearTimeout(existingTimer);
      flashTimers.delete(element);
    }

    element.classList.add('flashing');

    if (duration) {
      var timer = setTimeout(function () {
        stopFlash(element);
      }, duration);
      flashTimers.set(element, timer);
    }
  }

  function stopFlash(element) {
    if (!element) {
      return;
    }
    var existingTimer = flashTimers.get(element);
    if (existingTimer) {
      clearTimeout(existingTimer);
      flashTimers.delete(element);
    }
    element.classList.remove('flashing');
  }

  // ---------------------------------------------------------------------
  // Combined convenience entry point
  // ---------------------------------------------------------------------

  function fire(element, title, body) {
    flash(element);
    beep();
    notify(title, { body: body });
  }

  window.Notify = {
    beep: beep,
    requestPermissionIfNeeded: requestPermissionIfNeeded,
    notify: notify,
    flash: flash,
    stopFlash: stopFlash,
    fire: fire
  };
})();
