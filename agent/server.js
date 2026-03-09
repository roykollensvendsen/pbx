'use strict';

const net = require('net');
const fs = require('fs');
const config = require('./config');
const { parseFrame, encodeAudio, encodeTerminate, formatUUID, TYPE_UUID, TYPE_AUDIO, TYPE_TERMINATE, SILENCE_FRAME } = require('./audiosocket');
const { DeepgramSTT } = require('./stt');
const { Brain } = require('./brain');
const { ElevenLabsTTS } = require('./tts');
const { sendCallSummary, sendApiAlert } = require('./notify');
const { redirectChannel } = require('./ami');

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
  let callerNumber = null;
  let callerName = null;
  let callerChannel = null;

  function readCallerID() {
    try {
      const stat = fs.statSync('/tmp/agent-callerid');
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 5000) {
        console.log(`[Server] Ignoring stale callerid file (${Math.round(ageMs / 1000)}s old)`);
        try { fs.unlinkSync('/tmp/agent-callerid'); } catch (e) {}
        return false;
      }
      const raw = fs.readFileSync('/tmp/agent-callerid', 'utf8').trim();
      const parts = raw.split('|');
      callerNumber = parts[0] || null;
      callerName = (parts[1] && parts[1] !== callerNumber) ? parts[1] : null;
      callerChannel = parts[2] || null;
      console.log(`[Server] Caller: ${callerName || 'unknown'} (${callerNumber || 'unknown'}) channel=${callerChannel || 'unknown'}`);
      // Remove file (may fail if owned by root — that's OK)
      try { fs.unlinkSync('/tmp/agent-callerid'); } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  // Try reading caller ID — retry a few times since Asterisk writes it just before Dial()
  readCallerID();

  // Audio playback queue with real-time pacing (20ms per frame)
  let playbackQueue = [];
  let playbackTimer = null;

  function startPlayback() {
    if (playbackTimer) return;
    playbackTimer = setInterval(() => {
      if (playbackQueue.length === 0) {
        clearInterval(playbackTimer);
        playbackTimer = null;
        return;
      }
      const frame = playbackQueue.shift();
      if (!socket.destroyed) {
        socket.write(encodeAudio(frame));
      }
    }, 20);
  }

  function queueAudio(pcmChunk) {
    // Split into 320-byte frames (20ms at 8kHz 16-bit mono)
    let offset = 0;
    while (offset < pcmChunk.length) {
      const end = Math.min(offset + 320, pcmChunk.length);
      let frame = pcmChunk.subarray(offset, end);
      if (frame.length < 320) {
        const padded = Buffer.alloc(320, 0);
        frame.copy(padded);
        frame = padded;
      }
      playbackQueue.push(frame);
      offset = end;
    }
    startPlayback();
  }

  function stopPlayback() {
    playbackQueue = [];
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  function cleanup() {
    if (destroyed) return;
    destroyed = true;
    console.log(`[Server] Cleaning up ${uuid || remoteAddr}`);
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    stopPlayback();
    if (stt) stt.stop();
    if (tts) tts.abort();
    // Send email notification if agent answered (even if caller said nothing)
    if (brain && brain.messages.length > 0) {
      sendCallSummary(brain.messages, callerNumber, callerName);
    }
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

  function waitForPlaybackDrain() {
    return new Promise((resolve) => {
      if (playbackQueue.length === 0) return resolve();
      const check = setInterval(() => {
        if (playbackQueue.length === 0 || destroyed) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  async function handleUtterance(text) {
    if (processing || destroyed) return;
    processing = true;
    console.log(`[Brain] User said: "${text}"`);

    try {
      // Collect sentence chunks from Claude and speak them one at a time
      for await (const chunk of brain.respondStreaming(text)) {
        if (destroyed) break;

        // Check if this is a tool action rather than text
        if (chunk && typeof chunk === 'object' && chunk.type === 'make_call') {
          console.log(`[Server] make_call requested: ${chunk.phoneNumber}`);
          await waitForPlaybackDrain();
          try {
            await redirectChannel(callerChannel, 'outbound-agent', chunk.phoneNumber);
            console.log(`[Server] Call redirected to ${chunk.phoneNumber}`);
          } catch (err) {
            console.error(`[Server] Redirect failed: ${err.message}`);
            await speakSentence('Beklager, jeg klarte ikke å koble samtalen.');
          }
          break;
        }

        if (chunk && typeof chunk === 'object' && chunk.type === 'transfer_call') {
          console.log(`[Server] transfer_call requested: ext ${chunk.extension}`);
          await waitForPlaybackDrain();
          try {
            await redirectChannel(callerChannel, 'transfer-agent', chunk.extension);
            console.log(`[Server] Call transferred to ext ${chunk.extension}`);
          } catch (err) {
            console.error(`[Server] Transfer failed: ${err.message}`);
            await speakSentence('Beklager, jeg klarte ikke å sette deg over.');
          }
          break;
        }

        console.log(`[Brain] Sentence: "${chunk}"`);
        await speakSentence(chunk);
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
        queueAudio(pcmChunk);
      });

      tts.on('error', () => {
        ttsPlaying = false;
        stopPlayback();
        resolve();
      });

      // When TTS WebSocket closes, wait for playback queue to drain
      tts.speak(sentence).then(() => {
        if (playbackQueue.length === 0) {
          ttsPlaying = false;
          return resolve();
        }
        // Poll until queue is drained
        const waitDrain = setInterval(() => {
          if (playbackQueue.length === 0 || destroyed) {
            clearInterval(waitDrain);
            ttsPlaying = false;
            resolve();
          }
        }, 50);
      }).catch(() => {
        ttsPlaying = false;
        resolve();
      });
    });
  }

  // Send silence frames to keep AudioSocket alive (Asterisk times out after 2s of no activity)
  // Also send KeepAlive to Deepgram while TTS is playing to prevent idle timeout
  const keepAliveTimer = setInterval(() => {
    if (destroyed || socket.destroyed) return;
    if (!ttsPlaying) {
      socket.write(encodeAudio(SILENCE_FRAME));
    } else if (stt) {
      stt.keepAlive();
    }
  }, 200);

  // Start STT
  stt.start();

  // Send initial greeting after a short delay
  stt.on('ready', () => {
    console.log('[Server] Pipeline ready, sending greeting');
    // Delay to let caller ID file be written and call settle
    setTimeout(async () => {
      if (destroyed) return;
      // Re-read caller ID in case it wasn't available at connect time
      if (!callerNumber) readCallerID();
      // Now create Brain with caller info (init fetches time/weather)
      const canMakeCall = callerChannel && callerChannel.startsWith('PJSIP/');
      const canTransfer = !!callerChannel;
      brain = new Brain(callerNumber, callerName, canMakeCall, canTransfer);
      await brain.init();
      processing = true;
      const callNote = canMakeCall ? ', ringe noen for deg' : '';
      const transferNote = canTransfer ? ', sette deg over til en intern linje' : '';
      const greeting = callerName
        ? `Hei ${callerName}, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Jeg kan ta imot en beskjed, svare på spørsmål om klokka og været${callNote}${transferNote}, eller fortelle en vits.`
        : `Hei, du har ringt Roy. Han er ikke tilgjengelig akkurat nå. Jeg kan ta imot en beskjed, svare på spørsmål om klokka og været${callNote}${transferNote}, eller fortelle en vits.`;
      console.log(`[Brain] Greeting: "${greeting}"`);
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
        // Don't send audio to STT while TTS is playing (prevents self-hearing)
        if (!ttsPlaying) {
          stt.send(frame.payload);
        }
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
    sendApiAlert('AudioSocket', err);
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
