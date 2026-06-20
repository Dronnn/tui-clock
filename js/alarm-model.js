// alarm-model.js
// Data model for recurring alarms: create/read/update/delete, persisted via
// storage.js, decoupled from any rendering concerns. Plain global script,
// no ES modules — exposes window.AlarmModel.
//
// Alarm shape: { id, time, days[], enabled, title, subtitle }
//   id:       string, unique per alarm (see makeId below).
//   time:     "HH:MM" 24-hour string, e.g. "07:30".
//   days[]:   array of weekday indices 0=Sun..6=Sat the alarm repeats on.
//             Defaults to all 7 days ([0,1,2,3,4,5,6]) unless customized.
//   enabled:  boolean, whether the alarm is currently armed.
//   title:    optional string label shown on the alarm + in its notification
//             (default '').
//   subtitle: optional string sub-label / notification body (default '').
//
// Public API:
//   AlarmModel.create({ time, days, enabled })
//     - Validates `time` (must match /^([01]\d|2[0-3]):[0-5]\d$/) and `days`
//       (if provided, must be a non-empty array of integers 0-6; defaults to
//       all 7 days if omitted/empty). Throws an Error with a human-readable
//       message on invalid input — callers (the view layer) are expected to
//       catch this and show an inline message rather than alert().
//     - Persists immediately and returns the newly created alarm object.
//   AlarmModel.getAll()
//     - Returns the current array of alarms (freshly read from storage).
//   AlarmModel.update(id, changes)
//     - Shallow-merges `changes` into the alarm with the given id (e.g.
//       { enabled: false } or { time: '08:00', days: [1,2,3,4,5] }).
//       Re-validates time/days if those fields are part of `changes`.
//       Persists and returns the updated alarm, or null if id not found.
//   AlarmModel.delete(id)
//     - Removes the alarm with the given id, persists, returns true if a
//       row was actually removed, false otherwise.
//   AlarmModel.checkDue(alarm, now)
//     - Pure predicate, no side effects, no internal "already fired" state:
//       returns true if alarm.enabled, now's weekday is in alarm.days, and
//       now's "HH:MM" equals alarm.time. Dedup against repeated firing
//       within the same matching minute is intentionally NOT handled here
//       — that's session-lifetime UI state (which alarms have already
//       fired for which minute), not data, so it belongs in alarms-view.js
//       (its tick loop) rather than this model. Keeping it here would mean
//       persisting/resetting fired-state for no real benefit, since the
//       spec only requires no re-fire within the same session/minute.

(function () {
  'use strict';

  var STORAGE_KEY = 'alarms';
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  function makeId() {
    return 'alarm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function isValidTime(time) {
    return typeof time === 'string' && TIME_RE.test(time);
  }

  function isValidDays(days) {
    if (!Array.isArray(days) || days.length === 0) {
      return false;
    }
    for (var i = 0; i < days.length; i++) {
      var d = days[i];
      if (typeof d !== 'number' || isNaN(d) || d < 0 || d > 6 || Math.floor(d) !== d) {
        return false;
      }
    }
    return true;
  }

  function normalizeDays(days) {
    // De-dupe and sort ascending so persisted/rendered day lists are stable.
    var unique = [];
    for (var i = 0; i < days.length; i++) {
      if (unique.indexOf(days[i]) === -1) {
        unique.push(days[i]);
      }
    }
    unique.sort(function (a, b) { return a - b; });
    return unique;
  }

  function loadAll() {
    return Storage.load(STORAGE_KEY, []);
  }

  function saveAll(alarms) {
    Storage.save(STORAGE_KEY, alarms);
  }

  function getAll() {
    return loadAll();
  }

  function create(input) {
    var opts = input || {};

    var time = opts.time;
    if (!isValidTime(time)) {
      throw new Error('Alarm time must be in HH:MM 24-hour format.');
    }

    var days;
    if (opts.days === undefined || opts.days === null) {
      days = ALL_DAYS.slice();
    } else {
      if (!isValidDays(opts.days)) {
        throw new Error('Alarm days must be a non-empty array of weekday indices (0=Sun..6=Sat).');
      }
      days = normalizeDays(opts.days);
    }

    var enabled = opts.enabled === undefined ? true : Boolean(opts.enabled);

    var title = opts.title === undefined || opts.title === null ? '' : String(opts.title);
    var subtitle = opts.subtitle === undefined || opts.subtitle === null ? '' : String(opts.subtitle);

    var alarm = {
      id: makeId(),
      time: time,
      days: days,
      enabled: enabled,
      title: title,
      subtitle: subtitle
    };

    var alarms = loadAll();
    alarms.push(alarm);
    saveAll(alarms);

    return alarm;
  }

  function update(id, changes) {
    var alarms = loadAll();
    var index = -1;
    for (var i = 0; i < alarms.length; i++) {
      if (alarms[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      return null;
    }

    var current = alarms[index];
    var patch = changes || {};

    var nextTime = Object.prototype.hasOwnProperty.call(patch, 'time') ? patch.time : current.time;
    if (!isValidTime(nextTime)) {
      throw new Error('Alarm time must be in HH:MM 24-hour format.');
    }

    var nextDays;
    if (Object.prototype.hasOwnProperty.call(patch, 'days')) {
      if (!isValidDays(patch.days)) {
        throw new Error('Alarm days must be a non-empty array of weekday indices (0=Sun..6=Sat).');
      }
      nextDays = normalizeDays(patch.days);
    } else {
      nextDays = current.days;
    }

    var nextEnabled = Object.prototype.hasOwnProperty.call(patch, 'enabled')
      ? Boolean(patch.enabled)
      : current.enabled;

    var nextTitle = Object.prototype.hasOwnProperty.call(patch, 'title')
      ? (patch.title === undefined || patch.title === null ? '' : String(patch.title))
      : (current.title || '');

    var nextSubtitle = Object.prototype.hasOwnProperty.call(patch, 'subtitle')
      ? (patch.subtitle === undefined || patch.subtitle === null ? '' : String(patch.subtitle))
      : (current.subtitle || '');

    var updated = {
      id: current.id,
      time: nextTime,
      days: nextDays,
      enabled: nextEnabled,
      title: nextTitle,
      subtitle: nextSubtitle
    };

    alarms[index] = updated;
    saveAll(alarms);

    return updated;
  }

  function deleteAlarm(id) {
    var alarms = loadAll();
    var next = alarms.filter(function (a) { return a.id !== id; });
    if (next.length === alarms.length) {
      return false;
    }
    saveAll(next);
    return true;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function checkDue(alarm, now) {
    if (!alarm || !alarm.enabled) {
      return false;
    }
    if (!Array.isArray(alarm.days) || alarm.days.indexOf(now.getDay()) === -1) {
      return false;
    }
    var nowTime = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    return nowTime === alarm.time;
  }

  window.AlarmModel = {
    create: create,
    getAll: getAll,
    update: update,
    delete: deleteAlarm,
    checkDue: checkDue,
    ALL_DAYS: ALL_DAYS.slice()
  };
})();
