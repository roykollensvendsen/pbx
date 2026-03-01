'use strict';

const path = require('path');

// Load .env from agent directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const required = [
  'ANTHROPIC_API_KEY',
  'DEEPGRAM_API_KEY',
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID',
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length && !process.env.ECHO_MODE) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy agent/.env.example to agent/.env and fill in your API keys.');
  process.exit(1);
}

module.exports = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  AGENT_PORT: parseInt(process.env.AGENT_PORT || '9092', 10),
  AGENT_LANGUAGE: process.env.AGENT_LANGUAGE || 'no',
  ELEVENLABS_MODEL: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  ECHO_MODE: !!process.env.ECHO_MODE,
};
