// tools/add-letters.js
// One-off: inserts A-Z glyphs into the hand-made 5x7 bitmap fonts
// (dot-matrix, block-stack) so they can render weekday/month letters.
// Run: node tools/add-letters.js

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

// Standard 5x7 uppercase bitmap font.
const LETTERS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111']
};

function entriesText() {
  return Object.keys(LETTERS).map(function (ch) {
    var rows = LETTERS[ch].map(function (r) { return "      '" + r + "'"; }).join(',\n');
    return "    '" + ch + "': [\n" + rows + '\n    ]';
  }).join(',\n');
}

function patch(file) {
  var full = path.join(root, file);
  var src = fs.readFileSync(full, 'utf8');
  if (src.indexOf("'A': [") !== -1) {
    console.log('SKIP (already has letters): ' + file);
    return;
  }
  // Insert the letters just before the GLYPHS object closes ("    ]\n  };").
  var marker = '    ]\n  };';
  var idx = src.indexOf(marker);
  if (idx === -1) {
    console.error('marker not found in ' + file);
    return;
  }
  var replacement = '    ],\n' + entriesText() + '\n  };';
  src = src.slice(0, idx) + replacement + src.slice(idx + marker.length);
  fs.writeFileSync(full, src);
  console.log('patched ' + file);
}

// Chamfered ASCII-art A-Z for the dash font (5 wide x 7 tall), matching the
// tty-clock digit style (_ | / \).
const DASH_LETTERS = {
  A: [' ___ ', '/   \\', '|   |', '|___|', '|   |', '|   |', '|   |'],
  B: ['____ ', '|   |', '|   |', '|__ |', '|   |', '|   |', '|___|'],
  C: [' ___ ', '/    ', '|    ', '|    ', '|    ', '\\    ', ' \\___'],
  D: ['___  ', '|  \\ ', '|   |', '|   |', '|   |', '|  / ', '|__  '],
  E: [' ____', '|    ', '|    ', '|___ ', '|    ', '|    ', '|____'],
  F: [' ____', '|    ', '|    ', '|___ ', '|    ', '|    ', '|    '],
  G: [' ___ ', '/    ', '|    ', '|  __', '|   |', '\\   |', ' \\__|'],
  H: ['|   |', '|   |', '|   |', '|___|', '|   |', '|   |', '|   |'],
  I: [' ___ ', '  |  ', '  |  ', '  |  ', '  |  ', '  |  ', ' _|_ '],
  J: ['  ___', '    |', '    |', '    |', '    |', '\\   |', ' \\__/'],
  K: ['|   /', '|  / ', '| /  ', '|/   ', '|\\   ', '| \\  ', '|  \\ '],
  L: ['|    ', '|    ', '|    ', '|    ', '|    ', '|    ', '|____'],
  M: ['|\\ /|', '| V |', '|   |', '|   |', '|   |', '|   |', '|   |'],
  N: ['|\\  |', '| \\ |', '|  \\|', '|   |', '|   |', '|   |', '|   |'],
  O: [' ___ ', '/   \\', '|   |', '|   |', '|   |', '|   |', '\\___/'],
  P: [' ___ ', '|   \\', '|   |', '|___/', '|    ', '|    ', '|    '],
  Q: [' ___ ', '/   \\', '|   |', '|   |', '|  \\|', '\\   \\', ' \\__\\'],
  R: [' ___ ', '|   \\', '|   |', '|__ /', '|  \\ ', '|   \\', '|    '],
  S: [' ___ ', '/    ', '|    ', '\\___ ', '    \\', '    |', ' ___/'],
  T: ['_____', '  |  ', '  |  ', '  |  ', '  |  ', '  |  ', '  |  '],
  U: ['|   |', '|   |', '|   |', '|   |', '|   |', '|   |', '\\___/'],
  V: ['|   |', '|   |', '|   |', '\\   /', ' \\ / ', '  V  ', '     '],
  W: ['|   |', '|   |', '|   |', '|   |', '| | |', '| | |', '\\_|_/'],
  X: ['\\   /', ' \\ / ', '  X  ', '  X  ', ' / \\ ', '/   \\', '     '],
  Y: ['\\   /', ' \\ / ', '  V  ', '  |  ', '  |  ', '  |  ', '  |  '],
  Z: ['_____', '    /', '   / ', '  /  ', ' /   ', '/    ', '_____']
};

function dashEntriesText() {
  return Object.keys(DASH_LETTERS).map(function (ch) {
    var rows = DASH_LETTERS[ch].map(function (r) { return "      '" + r.replace(/\\/g, '\\\\') + "'"; }).join(',\n');
    return "    '" + ch + "': [\n" + rows + '\n    ]';
  }).join(',\n');
}

function patchDash() {
  var file = 'js/dash-font.js';
  var full = path.join(root, file);
  var src = fs.readFileSync(full, 'utf8');
  if (src.indexOf("'A': [") !== -1) {
    console.log('SKIP (already has letters): ' + file);
    return;
  }
  var marker = '    ]\n  };';
  var idx = src.indexOf(marker);
  if (idx === -1) {
    console.error('marker not found in ' + file);
    return;
  }
  var replacement = '    ],\n' + dashEntriesText() + '\n  };';
  src = src.slice(0, idx) + replacement + src.slice(idx + marker.length);
  fs.writeFileSync(full, src);
  console.log('patched ' + file);
}

patch('js/dot-matrix-font.js');
patch('js/block-stack-font.js');
patchDash();
