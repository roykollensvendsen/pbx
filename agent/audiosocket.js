'use strict';

// AudioSocket TLV protocol types
const TYPE_UUID = 0x01;
const TYPE_AUDIO = 0x10;
const TYPE_TERMINATE = 0x00;
// Silence frame: 320 bytes (20ms at 8kHz 16-bit mono)
const SILENCE_FRAME = Buffer.alloc(320, 0);

function parseFrame(buffer) {
  if (buffer.length < 3) return null;

  const type = buffer.readUInt8(0);
  const length = buffer.readUInt16BE(1);

  if (buffer.length < 3 + length) return null;

  const payload = buffer.subarray(3, 3 + length);
  return { type, length, payload, totalLength: 3 + length };
}

function encodeAudio(pcmBuffer) {
  const header = Buffer.alloc(3);
  header.writeUInt8(TYPE_AUDIO, 0);
  header.writeUInt16BE(pcmBuffer.length, 1);
  return Buffer.concat([header, pcmBuffer]);
}

function encodeTerminate() {
  const frame = Buffer.alloc(3);
  frame.writeUInt8(TYPE_TERMINATE, 0);
  frame.writeUInt16BE(0, 1);
  return frame;
}

function encodeSilence() {
  return encodeAudio(SILENCE_FRAME);
}

function formatUUID(buf) {
  const hex = buf.toString('hex');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20, 32),
  ].join('-');
}

module.exports = {
  TYPE_UUID,
  TYPE_AUDIO,
  TYPE_TERMINATE,
  SILENCE_FRAME,
  parseFrame,
  encodeAudio,
  encodeTerminate,
  encodeSilence,
  formatUUID,
};
