'use strict';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';
const BRIGHT_GREEN = '\x1b[92m';
const BRIGHT_YELLOW = '\x1b[93m';
const BRIGHT_CYAN = '\x1b[96m';

const TAGS = {
  server:  { icon: '🖥️ ', color: CYAN },
  stt:     { icon: '🎤', color: GREEN },
  tts:     { icon: '🔊', color: MAGENTA },
  brain:   { icon: '🧠', color: YELLOW },
  ami:     { icon: '📡', color: BLUE },
  notify:  { icon: '📧', color: WHITE },
  echo:    { icon: '🔁', color: DIM },
  dashboard: { icon: '🌐', color: BRIGHT_CYAN },
};

function timestamp() {
  return new Date().toLocaleTimeString('no-NO', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function make(tag) {
  const { icon, color } = TAGS[tag] || { icon: '  ', color: WHITE };
  const prefix = `${DIM}${timestamp()}${RESET} ${icon} ${color}${BOLD}${tag.toUpperCase()}${RESET}`;

  return {
    info: (...args) => console.log(`${prefix}${color}`, ...args, RESET),
    error: (...args) => console.error(`${prefix} ${RED}${BOLD}ERROR${RESET}${RED}`, ...args, RESET),

    // Semantic helpers for conversation flow
    userSaid: (text) => console.log(`${prefix} ${BRIGHT_GREEN}👤 "${text}"${RESET}`),
    aiSay: (text) => console.log(`${prefix} ${BRIGHT_YELLOW}💬 "${text}"${RESET}`),
    action: (text) => console.log(`${prefix} ${BRIGHT_CYAN}📞 ${text}${RESET}`),
  };
}

module.exports = {
  server: make('server'),
  stt: make('stt'),
  tts: make('tts'),
  brain: make('brain'),
  ami: make('ami'),
  notify: make('notify'),
  echo: make('echo'),
  dashboard: make('dashboard'),
};
