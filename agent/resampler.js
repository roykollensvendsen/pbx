'use strict';

// Linear interpolation resampler for 16-bit signed LE PCM mono audio.

function resample(inputBuf, fromRate, toRate) {
  if (fromRate === toRate) return inputBuf;

  const inputSamples = inputBuf.length / 2;
  const ratio = fromRate / toRate;
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const s0 = inputBuf.readInt16LE(srcIndex * 2);
    const s1 = srcIndex + 1 < inputSamples
      ? inputBuf.readInt16LE((srcIndex + 1) * 2)
      : s0;

    const sample = Math.round(s0 + frac * (s1 - s0));
    output.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }

  return output;
}

module.exports = { resample };
