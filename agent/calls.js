'use strict';

const fs = require('fs');
const path = require('path');
const log = require('./log');

const CALLS_FILE = path.join(__dirname, 'calls.json');
const MAX_ENTRIES = 100;

function loadCalls() {
  try {
    return JSON.parse(fs.readFileSync(CALLS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveCalls(calls) {
  fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
}

function logCall({ callerNumber, callerName, timestamp, messages, actions }) {
  const calls = loadCalls();
  calls.unshift({
    id: Date.now().toString(),
    callerNumber: callerNumber || 'ukjent',
    callerName: callerName || 'Ukjent',
    timestamp: timestamp || new Date().toLocaleString('no-NO', { timeZone: 'Europe/Oslo' }),
    messages: messages || [],
    actions: actions || [],
  });
  // Keep max entries (FIFO)
  if (calls.length > MAX_ENTRIES) {
    calls.length = MAX_ENTRIES;
  }
  saveCalls(calls);
  log.dashboard.info(`Call logged: ${callerName || 'Ukjent'} (${callerNumber || 'ukjent'})`);
}

function getCalls() {
  return loadCalls();
}

module.exports = { logCall, getCalls };
