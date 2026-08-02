// A client can freely lie about a file's MIME type and extension, so the
// upload routes' allowlist check alone isn't enough - this verifies the
// uploaded bytes actually look like the file type they claim to be, using
// each format's magic-byte signature (SEC-11).
const SIGNATURES = {
  pdf: (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-',

  jpg: (buf) => buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,

  png: (buf) => buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])),

  webp: (buf) => buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP',

  // HEIC is ISOBMFF: a size field, then an 'ftyp' box whose brand identifies
  // the encoding. Apple's HEIC photos use a handful of brand codes.
  heic: (buf) => {
    if (buf.length < 12 || buf.subarray(4, 8).toString('latin1') !== 'ftyp') return false;
    const brand = buf.subarray(8, 12).toString('latin1');
    return brand.startsWith('hei') || brand.startsWith('hev') || brand === 'mif1' || brand === 'msf1';
  },

  // Legacy binary .doc is an OLE compound file.
  doc: (buf) => buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])),

  // .docx is a zip. Checking for the "word/" internal entry path (rather
  // than just the zip signature) rejects a renamed .xlsx/.pptx or a plain
  // zip file without needing a full zip-parsing dependency.
  docx: (buf) => buf.length >= 4 &&
    buf.subarray(0, 4).toString('latin1') === 'PK\x03\x04' &&
    buf.includes('word/'),

  // SVG is plain-text XML, not a binary format with a fixed byte signature,
  // so this checks for a leading XML/svg declaration instead.
  svg: (buf) => {
    const text = buf.subarray(0, 256).toString('utf8').replace(new RegExp('^﻿'), '').trimStart();
    return /^<\?xml/i.test(text) || /^<svg[\s>]/i.test(text);
  },
};

SIGNATURES.jpeg = SIGNATURES.jpg;

function matchesExtension(buffer, ext) {
  const check = SIGNATURES[ext?.toLowerCase()];
  return check ? check(buffer) : false;
}

module.exports = { matchesExtension };
