// segment-display.js
// Renders strings into a row of classic 7-segment "digits" built from
// small block cell divs, calculator/clock-radio style. Supports digits,
// a calculator-style alphabet subset, colon, period and space.
// Plain global script, no ES modules — exposes window.renderSegmentString
// (and window.SegmentDisplay for the lower-level pieces, in case later
// modules want them).
//
// Public API:
//   renderSegmentString(container, str)
//     - container: a DOM element that will host the digit row.
//     - str: the string to display.
//     - First call (or a call where the previous string length differs)
//       rebuilds the DOM for `container` from scratch, sized to str.length.
//     - Subsequent calls with the same length diff character-by-character
//       and only toggle the .on class on segments whose on/off state
//       actually changed for that position, so unrelated digits don't
//       get touched (avoids re-triggering CSS transitions and is cheap
//       to call every tick).
//
// DOM shape built per character ("digit"):
//   <div class="sd-digit">
//     <div class="sd-cell sd-seg-a"></div>   top
//     <div class="sd-cell sd-seg-b"></div>   top-right
//     <div class="sd-cell sd-seg-c"></div>   bottom-right
//     <div class="sd-cell sd-seg-d"></div>   bottom
//     <div class="sd-cell sd-seg-e"></div>   bottom-left
//     <div class="sd-cell sd-seg-f"></div>   top-left
//     <div class="sd-cell sd-seg-g"></div>   middle
//   </div>
// For colon / period characters a narrower "punct" digit is built instead,
// containing one or two dot cells rather than the seven segment cells.
// Segments/dots that are "off" stay in the DOM (dim, via CSS) rather than
// being removed, so toggling is a pure class change.

(function () {
  'use strict';

  // Segment order used throughout: a, b, c, d, e, f, g
  //   a = top
  //   b = top-right
  //   c = bottom-right
  //   d = bottom
  //   e = bottom-left
  //   f = top-left
  //   g = middle
  var SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  // Character -> 7-segment bitmap, expressed as a 7-char string of 0/1
  // in the order a,b,c,d,e,f,g. Letters are calculator-style approximations
  // chosen for legibility rather than typographic accuracy.
  var CHAR_SEGMENTS = {
    '0': '1111110',
    '1': '0110000',
    '2': '1101101',
    '3': '1111001',
    '4': '0110011',
    '5': '1011011',
    '6': '1011111',
    '7': '1110000',
    '8': '1111111',
    '9': '1111011',

    ' ': '0000000',

    // Letters needed for AM/PM and weekday/month abbreviations:
    // SUN MON TUE WED THU FRI SAT JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC
    // plus the explicitly required set: A P M F R I J U N S T W D B C E H L O Y
    'A': '1110111',
    'B': '0011111', // approximation of lowercase-b shape
    'C': '1001110',
    'D': '0111101', // approximation of lowercase-d shape
    'E': '1001111',
    'F': '1000111',
    'G': '1011110',
    'H': '0110111',
    'I': '0110000', // same shape as 1, distinguishable in context
    'J': '0111100',
    'K': '0110111', // approximated as H (no distinct 7-seg shape)
    'L': '0001110',
    'M': '0101010', // approximated via top+both uppers, no true M on 7-seg
    'N': '0010101', // lowercase-n approximation (mid + both right/left lower)
    'O': '1111110', // same shape as 0, distinguishable in context
    'P': '1100111',
    'Q': '1110011', // approximated as 9-like
    'R': '0000101', // lowercase-r approximation
    'S': '1011011', // same shape as 5
    'T': '0001111', // lowercase-t approximation
    'U': '0111110',
    'V': '0111110', // approximated as U (no distinct 7-seg shape)
    'W': '0101011', // approximated, distinct from M by the middle segment
    'X': '0110111', // approximated as H
    'Y': '0110011', // same shape as 4
    'Z': '1101101'  // approximated as 2
  };

  // Punctuation rendered as small dot(s) rather than full 7-segment cells.
  // ':' -> two dots (upper + lower), '.' -> single dot (lower only).
  var PUNCT_DOTS = {
    ':': { upper: true, lower: true },
    '.': { upper: false, lower: true }
  };

  function isPunct(ch) {
    return Object.prototype.hasOwnProperty.call(PUNCT_DOTS, ch);
  }

  function segmentsFor(ch) {
    var upper = ch.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(CHAR_SEGMENTS, upper)) {
      return CHAR_SEGMENTS[upper];
    }
    // Unsupported character: render as blank (all segments off) rather
    // than throwing, so unexpected input degrades gracefully.
    return '0000000';
  }

  // Builds the DOM for a single 7-segment digit and returns
  // { el, segmentEls: { a: el, b: el, ... } }.
  function buildDigit() {
    var digit = document.createElement('div');
    digit.className = 'sd-digit';
    var segmentEls = {};
    for (var i = 0; i < SEGMENT_NAMES.length; i++) {
      var name = SEGMENT_NAMES[i];
      var cell = document.createElement('div');
      cell.className = 'sd-cell sd-seg-' + name;
      digit.appendChild(cell);
      segmentEls[name] = cell;
    }
    return { el: digit, segmentEls: segmentEls, kind: 'segments' };
  }

  // Builds the DOM for a punctuation "digit" (colon/period) and returns
  // { el, dotEls: { upper: el, lower: el } }.
  function buildPunct() {
    var digit = document.createElement('div');
    digit.className = 'sd-digit sd-digit-punct';
    var upper = document.createElement('div');
    upper.className = 'sd-cell sd-dot sd-dot-upper';
    var lower = document.createElement('div');
    lower.className = 'sd-cell sd-dot sd-dot-lower';
    digit.appendChild(upper);
    digit.appendChild(lower);
    return { el: digit, dotEls: { upper: upper, lower: lower }, kind: 'punct' };
  }

  // Applies the on/off state for a single character to an already-built
  // digit record (from buildDigit/buildPunct), toggling only what changed
  // relative to previousChar (may be undefined on first render).
  function applyChar(digitRecord, ch, previousChar) {
    if (digitRecord.kind === 'punct') {
      var dots = PUNCT_DOTS[ch] || { upper: false, lower: false };
      var prevDots = (previousChar !== undefined && isPunct(previousChar))
        ? (PUNCT_DOTS[previousChar] || { upper: false, lower: false })
        : { upper: false, lower: false };
      if (previousChar === undefined || dots.upper !== prevDots.upper) {
        digitRecord.dotEls.upper.classList.toggle('on', dots.upper);
      }
      if (previousChar === undefined || dots.lower !== prevDots.lower) {
        digitRecord.dotEls.lower.classList.toggle('on', dots.lower);
      }
      return;
    }

    var bits = segmentsFor(ch);
    var prevBits = previousChar !== undefined ? segmentsFor(previousChar) : null;
    for (var i = 0; i < SEGMENT_NAMES.length; i++) {
      var name = SEGMENT_NAMES[i];
      var on = bits.charAt(i) === '1';
      if (prevBits === null || bits.charAt(i) !== prevBits.charAt(i)) {
        digitRecord.segmentEls[name].classList.toggle('on', on);
      }
    }
  }

  // container._sdState shape:
  //   { str: '<last rendered string>', digits: [digitRecord, ...] }

  function buildAll(container, str) {
    container.innerHTML = '';
    var digits = [];
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var record = isPunct(ch) ? buildPunct() : buildDigit();
      container.appendChild(record.el);
      applyChar(record, ch, undefined);
      digits.push(record);
    }
    container._sdState = { str: str, digits: digits };
  }

  function renderSegmentString(container, str) {
    if (!container) {
      throw new Error('renderSegmentString: container element is required');
    }
    str = String(str);

    var state = container._sdState;
    if (!state || state.str.length !== str.length) {
      buildAll(container, str);
      return;
    }

    // Same length as before: diff character-by-character, only touching
    // digits whose underlying character (and therefore segment pattern)
    // actually changed. A digit whose char is identical to last time is
    // skipped entirely, including its punct/segment kind check.
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var prevCh = state.str.charAt(i);
      if (ch === prevCh) {
        continue;
      }

      var record = state.digits[i];
      var wantsPunct = isPunct(ch);
      var isPunctRecord = record.kind === 'punct';

      if (wantsPunct !== isPunctRecord) {
        // Character kind changed (e.g. digit -> colon at this position).
        // Rebuild just this one digit's DOM node in place.
        var oldEl = record.el;
        var newRecord = wantsPunct ? buildPunct() : buildDigit();
        oldEl.parentNode.replaceChild(newRecord.el, oldEl);
        applyChar(newRecord, ch, undefined);
        state.digits[i] = newRecord;
      } else {
        applyChar(record, ch, prevCh);
      }
    }
    state.str = str;
  }

  window.renderSegmentString = renderSegmentString;
  window.SegmentDisplay = {
    render: renderSegmentString,
    CHAR_SEGMENTS: CHAR_SEGMENTS,
    PUNCT_DOTS: PUNCT_DOTS
  };
})();
