'use strict';

const fs = require('fs');
const path = require('path');
const log = require('./log');

const MESSAGES_DIR = path.join(__dirname, 'messages');

// Ensure messages directory exists
if (!fs.existsSync(MESSAGES_DIR)) {
  fs.mkdirSync(MESSAGES_DIR);
}

// Normalize aliases to canonical family member names
const NAME_ALIASES = {
  cesaria: 'cecile',
  cecile: 'cecile',
  roy: 'roy',
  lukas: 'lukas',
  alana: 'alana',
};

function normalizeName(name) {
  const lower = name.toLowerCase().trim();
  return NAME_ALIASES[lower] || lower;
}

function nameToFile(name) {
  return path.join(MESSAGES_DIR, normalizeName(name) + '.json');
}

function loadMessages(name) {
  try {
    return JSON.parse(fs.readFileSync(nameToFile(name), 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveMessages(name, messages) {
  fs.writeFileSync(nameToFile(name), JSON.stringify(messages, null, 2));
}

function leaveMessage(recipient, from, message) {
  const messages = loadMessages(recipient);
  const entry = {
    id: Date.now().toString(),
    from,
    message,
    timestamp: new Date().toLocaleString('no-NO', { timeZone: 'Europe/Oslo' }),
    heard: false,
  };
  messages.push(entry);
  saveMessages(recipient, messages);
  log.brain.info(`Message saved for ${normalizeName(recipient)} from ${from}`);
  return entry;
}

function checkMessages(recipient) {
  const messages = loadMessages(recipient);
  // Mark unheard messages as heard
  let changed = false;
  for (const msg of messages) {
    if (!msg.heard) {
      msg.heard = true;
      changed = true;
    }
  }
  if (changed) saveMessages(recipient, messages);
  return messages;
}

function deleteMessages(recipient, messageIds) {
  const messages = loadMessages(recipient);
  let deleted = 0;
  const remaining = messages.filter((m) => {
    if (messageIds === 'heard' && m.heard) { deleted++; return false; }
    if (messageIds === 'all') { deleted++; return false; }
    if (Array.isArray(messageIds) && messageIds.includes(m.id)) { deleted++; return false; }
    return true;
  });
  saveMessages(recipient, remaining);
  log.brain.info(`Deleted ${deleted} message(s) for ${normalizeName(recipient)}`);
  return deleted;
}

function editMessage(recipient, messageId, newText) {
  const messages = loadMessages(recipient);
  const msg = messages.find((m) => m.id === messageId);
  if (!msg) return null;
  msg.message = newText;
  saveMessages(recipient, messages);
  log.brain.info(`Message ${messageId} edited for ${normalizeName(recipient)}`);
  return msg;
}

function messageSummary() {
  const FAMILY = ['roy', 'cecile', 'lukas', 'alana'];
  const summary = {};
  for (const name of FAMILY) {
    const msgs = loadMessages(name);
    if (msgs.length > 0) {
      const unheard = msgs.filter((m) => !m.heard).length;
      summary[name] = { total: msgs.length, unheard };
    }
  }
  return summary;
}

module.exports = { leaveMessage, checkMessages, deleteMessages, editMessage, messageSummary };
