'use strict';

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const config = require('./config');
const { resample } = require('./resampler');

const ELEVENLABS_WS_URL = 'wss://api.elevenlabs.io/v1/text-to-speech';
// ElevenLabs PCM output sample rate
const TTS_SAMPLE_RATE = 22050;
const TARGET_SAMPLE_RATE = 8000;

class ElevenLabsTTS extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.ready = false;
    this.aborted = false;
  }

  async speak(text) {
    if (!text || this.aborted) return;

    return new Promise((resolve, reject) => {
      const voiceId = config.ELEVENLABS_VOICE_ID;
      const model = config.ELEVENLABS_MODEL;
      const params = new URLSearchParams({
        model_id: model,
        output_format: 'pcm_22050',
      });

      const url = `${ELEVENLABS_WS_URL}/${voiceId}/stream-input?${params}`;
      this.ws = new WebSocket(url);
      this.aborted = false;

      this.ws.on('open', () => {
        this.ready = true;
        // Send BOS (beginning of stream) with voice settings
        this.ws.send(JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          xi_api_key: config.ELEVENLABS_API_KEY,
        }));

        // Send the text
        this.ws.send(JSON.stringify({ text: text + ' ' }));

        // Send EOS (end of stream)
        this.ws.send(JSON.stringify({ text: '' }));
      });

      this.ws.on('message', (data) => {
        if (this.aborted) return;
        try {
          const msg = JSON.parse(data);
          if (msg.audio) {
            // Decode base64 PCM audio
            const pcm = Buffer.from(msg.audio, 'base64');
            // Resample from TTS rate to 8kHz
            const resampled = resample(pcm, TTS_SAMPLE_RATE, TARGET_SAMPLE_RATE);
            this.emit('audio', resampled);
          }
          if (msg.isFinal) {
            this.emit('done');
          }
        } catch (err) {
          console.error('[TTS] Parse error:', err.message);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[TTS] WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', () => {
        this.ready = false;
        this.ws = null;
        resolve();
      });
    });
  }

  abort() {
    this.aborted = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.ready = false;
  }
}

module.exports = { ElevenLabsTTS };
