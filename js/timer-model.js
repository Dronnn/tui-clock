// timer-model.js
// Data model for timers/countdowns: create, pause/resume/reset/delete,
// and elapsed/remaining computation. Decoupled from rendering — timers-view.js
// owns all DOM. Plain global script, no ES modules — exposes window.TimerModel.
//
// Timer object shape (persisted via Storage under the 'timers' key):
//   {
//     id: string,
//     name: string,
//     type: 'countdown' | 'stopwatch',
//     title: string (optional free-text label, default ''),
//     subtitle: string (optional free-text label, default ''),
//     startTime: number (ms, Date.now() at creation/last resume),
//     targetDuration: number (ms; only meaningful for type 'countdown'),
//     pausedAt: number|null (ms, Date.now() when paused; null while running),
//     accumulatedPause: number (ms, total time spent paused so far),
//     status: 'running' | 'paused' | 'done'
//   }
//
// title/subtitle are plain free text, not part of the 7-segment glyph set —
// view code renders them as ordinary themed text, never via
// renderSegmentString.
//
// Elapsed/remaining time is always computed from these timestamps against
// Date.now() at call time, never by decrementing a stored counter — so the
// correct value survives tab backgrounding, sleep, and page reloads.
//
// Public API:
//   TimerModel.create({ name, type, targetDuration, title, subtitle }) -> timer
//   TimerModel.getAll() -> timer[]
//   TimerModel.getById(id) -> timer|null
//   TimerModel.pause(id) -> timer|null
//   TimerModel.resume(id) -> timer|null
//   TimerModel.reset(id) -> timer|null
//   TimerModel.delete(id) -> boolean
//   TimerModel.getElapsedMs(timer) -> number
//   TimerModel.getRemainingMs(timer) -> number (countdowns only; 0 floor)
//   TimerModel.isDone(timer) -> boolean

(function () {
  'use strict';

  var STORAGE_KEY = 'timers';

  // ---------------------------------------------------------------------
  // ID generation
  // ---------------------------------------------------------------------

  function generateId() {
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  // ---------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------

  function loadAll() {
    var raw = Storage.load(STORAGE_KEY, []);
    if (!Array.isArray(raw)) {
      return [];
    }
    // Defensive reconstruction: drop anything that doesn't look like a
    // valid timer object rather than letting corrupt storage break the view.
    var result = [];
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i];
      if (!t || typeof t !== 'object') {
        continue;
      }
      if (typeof t.id !== 'string' || !t.id) {
        continue;
      }
      if (t.type !== 'countdown' && t.type !== 'stopwatch') {
        continue;
      }
      result.push({
        id: t.id,
        name: typeof t.name === 'string' && t.name ? t.name : 'Timer',
        type: t.type,
        title: typeof t.title === 'string' ? t.title : '',
        subtitle: typeof t.subtitle === 'string' ? t.subtitle : '',
        startTime: typeof t.startTime === 'number' ? t.startTime : Date.now(),
        targetDuration: typeof t.targetDuration === 'number' ? t.targetDuration : 0,
        pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
        accumulatedPause: typeof t.accumulatedPause === 'number' ? t.accumulatedPause : 0,
        status: (t.status === 'running' || t.status === 'paused' || t.status === 'done')
          ? t.status
          : 'running'
      });
    }
    return result;
  }

  function saveAll(timers) {
    Storage.save(STORAGE_KEY, timers);
  }

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  function create(options) {
    var opts = options || {};
    var name = (typeof opts.name === 'string' ? opts.name.trim() : '') || 'Timer';
    var type = opts.type === 'stopwatch' ? 'stopwatch' : 'countdown';
    var targetDuration = typeof opts.targetDuration === 'number' ? opts.targetDuration : 0;
    var title = typeof opts.title === 'string' ? opts.title.trim() : '';
    var subtitle = typeof opts.subtitle === 'string' ? opts.subtitle.trim() : '';

    // Defensive check at the model level too, even though timers-view.js is
    // expected to validate the form first: a countdown needs a positive
    // duration, or it would be born already "done".
    if (type === 'countdown' && (!isFinite(targetDuration) || targetDuration <= 0)) {
      throw new Error('TimerModel.create: countdown requires a positive targetDuration');
    }

    var timer = {
      id: generateId(),
      name: name,
      type: type,
      title: title,
      subtitle: subtitle,
      startTime: Date.now(),
      targetDuration: type === 'countdown' ? targetDuration : 0,
      pausedAt: null,
      accumulatedPause: 0,
      status: 'running'
    };

    var all = loadAll();
    all.push(timer);
    saveAll(all);
    return timer;
  }

  function getAll() {
    return loadAll();
  }

  function getById(id) {
    var all = loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        return all[i];
      }
    }
    return null;
  }

  function updateTimer(id, mutate) {
    var all = loadAll();
    var found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        mutate(all[i]);
        found = all[i];
        break;
      }
    }
    if (found) {
      saveAll(all);
    }
    return found;
  }

  function pause(id) {
    return updateTimer(id, function (timer) {
      if (timer.status !== 'running') {
        return;
      }
      timer.pausedAt = Date.now();
      timer.status = 'paused';
    });
  }

  function resume(id) {
    return updateTimer(id, function (timer) {
      if (timer.status !== 'paused') {
        return;
      }
      if (typeof timer.pausedAt === 'number') {
        timer.accumulatedPause += Date.now() - timer.pausedAt;
      }
      timer.pausedAt = null;
      timer.status = 'running';
    });
  }

  function reset(id) {
    return updateTimer(id, function (timer) {
      timer.startTime = Date.now();
      timer.pausedAt = null;
      timer.accumulatedPause = 0;
      timer.status = 'running';
    });
  }

  function deleteTimer(id) {
    var all = loadAll();
    var next = all.filter(function (t) {
      return t.id !== id;
    });
    if (next.length === all.length) {
      return false;
    }
    saveAll(next);
    return true;
  }

  // ---------------------------------------------------------------------
  // Time computation — derived purely from timestamps + Date.now()
  // ---------------------------------------------------------------------

  // How much "live" time has passed since startTime, excluding any time
  // spent paused (both already-accumulated pause and, if currently paused,
  // the ongoing pause span up to now).
  function getElapsedMs(timer) {
    if (!timer) {
      return 0;
    }
    var now = Date.now();
    var pauseSoFar = timer.accumulatedPause || 0;
    if (timer.status === 'paused' && typeof timer.pausedAt === 'number') {
      pauseSoFar += now - timer.pausedAt;
    }
    var elapsed = now - timer.startTime - pauseSoFar;
    return elapsed > 0 ? elapsed : 0;
  }

  function getRemainingMs(timer) {
    if (!timer || timer.type !== 'countdown') {
      return 0;
    }
    var remaining = timer.targetDuration - getElapsedMs(timer);
    return remaining > 0 ? remaining : 0;
  }

  function isDone(timer) {
    if (!timer || timer.type !== 'countdown') {
      return false;
    }
    if (timer.status === 'done') {
      return true;
    }
    return getRemainingMs(timer) <= 0;
  }

  window.TimerModel = {
    create: create,
    getAll: getAll,
    getById: getById,
    pause: pause,
    resume: resume,
    reset: reset,
    delete: deleteTimer,
    getElapsedMs: getElapsedMs,
    getRemainingMs: getRemainingMs,
    isDone: isDone
  };
})();
