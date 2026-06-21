// tools/identify-fonts.js
// Brute-matches the user's unnamed pasted figlet samples against every font in
// the local figlet-fonts collection by rendering the full charset and searching
// for signature substrings unique to each sample.
//
//   node tools/identify-fonts.js [/path/to/flf/dir]

const fs = require('fs');
const path = require('path');
const figlet = require('../js/figlet.js');

const flfDir = process.argv[2] || '/tmp/ff/xero-figlet-fonts-417429e';

// Signature substrings lifted verbatim from the user's pasted samples. Each is
// a shape that should appear only in the font that produced that sample.
const SIGNATURES = [
  { id: 'blob1 (o__ __o)', sig: 'o__ __o' },
  { id: 'blob2 (\\_/\\____/)', sig: '\\_/\\____/' },
  { id: 'blob2-alt (/ \\/_   \\)', sig: '/ \\/_   \\' },
  { id: 'blob5 (half-block ▀▀▀▀████)', sig: '▀▀▀▀████' },
  { id: 'blob6 (half-block ▄████ ██ ██)', sig: '▄████ ██ ██' },
];

const probe = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const files = fs.readdirSync(flfDir).filter((f) => f.toLowerCase().endsWith('.flf'));
const matches = {};
SIGNATURES.forEach((s) => { matches[s.id] = []; });

files.forEach((file) => {
  const name = file.replace(/\.flf$/i, '');
  let out;
  try {
    figlet.parseFont(name, fs.readFileSync(path.join(flfDir, file), 'utf8'));
    out = figlet.textSync(probe, { font: name });
  } catch (e) {
    return;
  }
  SIGNATURES.forEach((s) => {
    if (out.indexOf(s.sig) !== -1) matches[s.id].push(name);
  });
});

SIGNATURES.forEach((s) => {
  console.log('\n### ' + s.id);
  console.log(matches[s.id].length ? matches[s.id].join(', ') : '(no match)');
});
