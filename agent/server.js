'use strict';

const net = require('net');
const config = require('./config');
const { parseFrame, encodeAudio, encodeTerminate, formatUUID, TYPE_UUID, TYPE_AUDIO, TYPE_TERMINATE, SILENCE_FRAME } = require('./audiosocket');
const { DeepgramSTT } = require('./stt');
const { Brain } = require('./brain');
const { ElevenLabsTTS } = require('./tts');

function handleConnection(socket) {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[Server] New connection from ${remoteAddr}`);

  let uuid = null;
  let buffer = Buffer.alloc(0);
  let stt = null;
  let brain = null;
  let tts = null;
  let processing = false;
  let ttsPlaying = false;
  let pendingTranscript = '';
  let destroyed = false;

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    console.log(`[Server] Cleaning up ${uuid || remoteAddr}`);
    if (stt) stt.stop();
    if (tts) tts.abort();
  }

  // --- Echo mode ---
  if (config.ECHO_MODE) {
    console.log('[Server] Running in ECHO mode');

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      while (true) {
        const frame = parseFrame(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.totalLength);

        if (frame.type === TYPE_UUID) {
          uuid = formatUUID(frame.payload);
          console.log(`[Echo] UUID: ${uuid}`);
        } else if (frame.type === TYPE_AUDIO) {
          // Echo audio back immediately
          if (!socket.destroyed) {
            socket.write(encodeAudio(frame.payload));
          }
        } else if (frame.type === TYPE_TERMINATE) {
          console.log('[Echo] Received terminate');
          socket.end();
        }
      }
    });

    socket.on('close', () => console.log(`[Echo] Connection closed: ${uuid || remoteAddr}`));
    socket.on('error', (err) => console.error(`[Echo] Error: ${err.message}`));
    return;
  }

  // --- Full AI pipeline ---
  stt = new DeepgramSTT();
  brain = new Brain();

  // Buffer for accumulating final transcripts into a complete utterance
  let utteranceText = '';

  stt.on('transcript', ({ text, isFinal, speechFinal }) => {
    if (isFinal) {
      utteranceText += (utteranceText ? ' ' : '') + text;
      console.log(`[STT] Final: "${text}" (accumulated: "${utteranceText}")`);

      if (speechFinal && utteranceText.trim()) {
        handleUtterance(utteranceText.trim());
        utteranceText = '';
      }
    } else {
      console.log(`[STT] Interim: "${text}"`);

      // Barge-in: if user speaks while TTS is playing, stop TTS
      if (ttsPlaying && text.length > 3) {
        console.log('[Server] Barge-in detected, stopping TTS');
        if (tts) tts.abort();
        ttsPlaying = false;
      }
    }
  });

  stt.on('utterance_end', () => {
    if (utteranceText.trim() && !processing) {
      console.log(`[STT] Utterance end, processing: "${utteranceText}"`);
      handleUtterance(utteranceText.trim());
      utteranceText = '';
    }
  });

  stt.on('error', (err) => console.error('[STT] Error:', err.message));

  async function handleUtterance(text) {
    if (processing || destroyed) return;
    processing = true;
    console.log(`[Brain] User said: "${text}"`);

    try {
      // Collect sentence chunks from Claude and speak them one at a time
      for await (const sentence of brain.respondStreaming(text)) {
        if (destroyed) break;
        console.log(`[Brain] Sentence: "${sentence}"`);
        await speakSentence(sentence);
      }
    } catch (err) {
      console.error('[Brain] Error:', err.message);
    } finally {
      processing = false;
      ttsPlaying = false;
    }
  }

  function speakSentence(sentence) {
    return new Promise((resolve) => {
      if (destroyed) return resolve();

      tts = new ElevenLabsTTS();
      ttsPlaying = true;

      tts.on('audio', (pcmChunk) => {
        if (destroyed || socket.destroyed) return;
        // Send audio in 320-byte frames (20ms at 8kHz 16-bit mono)
        let offset = 0;
        while (offset < pcmChunk.length) {
          const end = Math.min(offset + 320, pcmChunk.length);
          let frame = pcmChunk.subarray(offset, end);
          // Pad last frame if needed
          if (frame.length < 320) {
            const padded = Buffer.alloc(320, 0);
            frame.copy(padded);
            frame = padded;
          }
          socket.write(encodeAudio(frame));
          offset = end;
        }
      });

      tts.on('done', () => {
        ttsPlaying = false;
      });

      tts.on('error', () => {
        ttsPlaying = false;
        resolve();
      });

      tts.speak(sentence).then(resolve).catch(() => resolve());
    });
  }

  // Start STT
  stt.start();

  // Send initial greeting after a short delay
  stt.on('ready', () => {
    console.log('[Server] Pipeline ready, sending greeting');
    // Small delay to let the call settle
    setTimeout(async () => {
      if (destroyed) return;
      processing = true;
      const greeting = 'Hei, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Kan jeg ta imot en beskjed?';
      console.log(`[Brain] Greeting: "${greeting}"`);
      // Add to conversation history so Claude knows the context
      brain.messages.push({ role: 'assistant', content: greeting });
      await speakSentence(greeting);
      processing = false;
    }, 500);
  });

  // Handle incoming AudioSocket frames
  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    while (true) {
      const frame = parseFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.totalLength);

      if (frame.type === TYPE_UUID) {
        uuid = formatUUID(frame.payload);
        console.log(`[Server] UUID: ${uuid}`);
      } else if (frame.type === TYPE_AUDIO) {
        // Forward audio to STT
        stt.send(frame.payload);
      } else if (frame.type === TYPE_TERMINATE) {
        console.log('[Server] Received terminate — caller hung up');
        cleanup();
        socket.end();
      }
    }
  });

  socket.on('close', () => {
    console.log(`[Server] Connection closed: ${uuid || remoteAddr}`);
    cleanup();
  });

  socket.on('error', (err) => {
    console.error(`[Server] Socket error: ${err.message}`);
    cleanup();
  });
}

const server = net.createServer(handleConnection);

server.listen(config.AGENT_PORT, '127.0.0.1', () => {
  const mode = config.ECHO_MODE ? 'ECHO' : 'AI';
  console.log(`[Server] AudioSocket server (${mode} mode) listening on 127.0.0.1:${config.AGENT_PORT}`);
});

server.on('error', (err) => {
  console.error('[Server] Fatal error:', err.message);
  process.exit(1);
});
