// storage.js
// Thin wrapper around localStorage with JSON encoding and an in-memory
// fallback for environments where localStorage throws (e.g. private
// browsing in some browsers, or disabled storage). Plain global script,
// no ES modules — exposes window.Storage.
//
// Usage:
//   Storage.save('timers', [...]);
//   var timers = Storage.load('timers', []);
//
// Known keys used by later modules: 'timers', 'alarms', 'prefs'.

(function () {
  'use strict';

  // In-memory fallback store, used only if localStorage access fails.
  var memoryStore = {};
  var memoryFallbackActive = false;

  function load(key, fallback) {
    if (memoryFallbackActive) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key)
        ? memoryStore[key]
        : fallback;
    }
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Storage.load: falling back to in-memory store for key "' + key + '":', err);
      memoryFallbackActive = true;
      return Object.prototype.hasOwnProperty.call(memoryStore, key)
        ? memoryStore[key]
        : fallback;
    }
  }

  function save(key, value) {
    memoryStore[key] = value;
    if (memoryFallbackActive) {
      return false;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Storage.save: falling back to in-memory store for key "' + key + '":', err);
      memoryFallbackActive = true;
      return false;
    }
  }

  window.Storage = {
    load: load,
    save: save
  };
})();
