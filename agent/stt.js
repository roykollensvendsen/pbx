'use strict';

const { EventEmitter } = require('events');
const WebSocket = require('ws');
const config = require('./config');
const { sendApiAlert } = require('./notify');

class DeepgramSTT extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.ready = false;
  }

  start() {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: config.AGENT_LANGUAGE,
      encoding: 'linear16',
      sample_rate: '8000',
      channels: '1',
      interim_results: 'true',
      utterance_end_ms: '1200',
      vad_events: 'true',
      endpointing: '500',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params}`;
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Token ${config.DEEPGRAM_API_KEY}` },
    });

    this.ws.on('open', () => {
      this.ready = true;
      console.log('[STT] Deepgram connected');
      this.emit('ready');
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          if (alt && alt.transcript) {
            this.emit('transcript', {
              text: alt.transcript,
              isFinal: msg.is_final,
              speechFinal: msg.speech_final,
            });
          }
        } else if (msg.type === 'UtteranceEnd') {
          this.emit('utterance_end');
        }
      } catch (err) {
        console.error('[STT] Parse error:', err.message);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[STT] WebSocket error:', err.message);
      sendApiAlert('Deepgram STT', err);
      this.emit('error', err);
    });

    this.ws.on('close', (code, reason) => {
      this.ready = false;
      console.log(`[STT] Closed: ${code} ${reason}`);
      if (code !== 1000 && code !== 1001 && code !== 1005) {
        sendApiAlert('Deepgram STT', `WebSocket closed unexpectedly: ${code} ${reason}`);
      }
      this.emit('close');
    });
  }

  send(pcmBuffer) {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcmBuffer);
    }
  }

  stop() {
    if (this.ws) {
      this.ready = false;
      // Send close message to finalize any pending transcription
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = { DeepgramSTT };
