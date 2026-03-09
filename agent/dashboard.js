'use strict';

const http = require('http');
const config = require('./config');
const { getAllMessages } = require('./messages');
const { getCalls } = require('./calls');
const log = require('./log');

const HTML = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PBX Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
  .header { background: #2c3e50; color: white; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 1.3em; }
  .tabs { display: flex; background: #34495e; }
  .tab { padding: 12px 24px; color: #95a5a6; cursor: pointer; border: none; background: none; font-size: 1em; }
  .tab.active { color: white; border-bottom: 3px solid #3498db; }
  .tab:hover { color: #ecf0f1; }
  .content { max-width: 900px; margin: 20px auto; padding: 0 16px; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* Beskjeder */
  .member { background: white; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .member-header { padding: 14px 18px; background: #ecf0f1; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
  .member-header h2 { font-size: 1.1em; text-transform: capitalize; }
  .badge { background: #e74c3c; color: white; border-radius: 12px; padding: 2px 10px; font-size: 0.85em; }
  .msg-list { padding: 0; }
  .msg { padding: 12px 18px; border-top: 1px solid #eee; display: flex; flex-direction: column; gap: 4px; }
  .msg-meta { display: flex; justify-content: space-between; font-size: 0.85em; color: #777; }
  .msg-from { font-weight: 600; color: #555; }
  .msg-text { margin-top: 2px; }
  .msg.unheard { border-left: 3px solid #3498db; }
  .msg.heard { opacity: 0.7; }

  /* Samtalelogg */
  .call { background: white; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .call-header { padding: 14px 18px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .call-header:hover { background: #f9f9f9; }
  .call-name { font-weight: 600; }
  .call-time { font-size: 0.85em; color: #777; }
  .call-number { font-size: 0.85em; color: #999; }
  .call-details { display: none; padding: 0 18px 14px; }
  .call-details.open { display: block; }
  .transcript { background: #f8f9fa; border-radius: 6px; padding: 12px; font-size: 0.9em; }
  .transcript .user { color: #2980b9; }
  .transcript .assistant { color: #27ae60; }
  .transcript .role { font-weight: 600; }
  .call-actions { margin-top: 8px; font-size: 0.85em; color: #8e44ad; }

  .empty { text-align: center; color: #999; padding: 40px; }
  .refresh-note { text-align: center; color: #aaa; font-size: 0.8em; padding: 16px; }
</style>
</head>
<body>
<div class="header">
  <h1>PBX Dashboard</h1>
</div>
<div class="tabs">
  <button class="tab active" data-tab="messages">Beskjeder</button>
  <button class="tab" data-tab="calls">Samtalelogg</button>
</div>
<div class="content">
  <div id="messages" class="panel active"></div>
  <div id="calls" class="panel"></div>
</div>
<div class="refresh-note">Oppdateres automatisk hvert 30 sekund</div>

<script>
// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadMessages() {
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    const el = document.getElementById('messages');
    if (Object.keys(data).length === 0) {
      el.innerHTML = '<div class="empty">Ingen beskjeder</div>';
      return;
    }
    let html = '';
    for (const [name, msgs] of Object.entries(data)) {
      const unheard = msgs.filter(m => !m.heard).length;
      const badge = unheard > 0 ? '<span class="badge">' + unheard + ' uhørt' + (unheard > 1 ? 'e' : '') + '</span>' : '';
      html += '<div class="member"><div class="member-header"><h2>' + escapeHtml(capitalize(name)) + '</h2>' + badge + '</div><div class="msg-list">';
      // Show newest first
      for (const msg of [...msgs].reverse()) {
        const cls = msg.heard ? 'msg heard' : 'msg unheard';
        html += '<div class="' + cls + '">'
          + '<div class="msg-meta"><span class="msg-from">Fra: ' + escapeHtml(msg.from) + '</span><span>' + escapeHtml(msg.timestamp) + '</span></div>'
          + '<div class="msg-text">' + escapeHtml(msg.message) + '</div>'
          + '</div>';
      }
      html += '</div></div>';
    }
    el.innerHTML = html;
  } catch (e) {
    console.error('Failed to load messages', e);
  }
}

async function loadCalls() {
  try {
    const res = await fetch('/api/calls');
    const data = await res.json();
    const el = document.getElementById('calls');
    if (data.length === 0) {
      el.innerHTML = '<div class="empty">Ingen samtaler registrert</div>';
      return;
    }
    let html = '';
    for (const call of data) {
      html += '<div class="call"><div class="call-header" onclick="this.nextElementSibling.classList.toggle(\'open\')">'
        + '<div><span class="call-name">' + escapeHtml(call.callerName) + '</span> <span class="call-number">' + escapeHtml(call.callerNumber) + '</span></div>'
        + '<span class="call-time">' + escapeHtml(call.timestamp) + '</span>'
        + '</div><div class="call-details"><div class="transcript">';
      for (const m of call.messages) {
        const cls = m.role === 'user' ? 'user' : 'assistant';
        const label = m.role === 'user' ? 'Innringer' : 'AI';
        html += '<div><span class="role ' + cls + '">' + label + ':</span> ' + escapeHtml(m.content) + '</div>';
      }
      if (!call.messages || call.messages.length === 0) {
        html += '<div style="color:#999">Ingen transkripsjon</div>';
      }
      html += '</div>';
      if (call.actions && call.actions.length > 0) {
        html += '<div class="call-actions">Handlinger: ' + call.actions.map(a => escapeHtml(a)).join(', ') + '</div>';
      }
      html += '</div></div>';
    }
    el.innerHTML = html;
  } catch (e) {
    console.error('Failed to load calls', e);
  }
}

function refresh() {
  loadMessages();
  loadCalls();
}

refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (req.method === 'GET' && req.url === '/api/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllMessages()));
  } else if (req.method === 'GET' && req.url === '/api/calls') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getCalls()));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(config.DASHBOARD_PORT, '0.0.0.0', () => {
  log.dashboard.info(`Dashboard listening on http://0.0.0.0:${config.DASHBOARD_PORT}`);
});

server.on('error', (err) => {
  log.dashboard.error(`Dashboard failed to start: ${err.message}`);
});

module.exports = server;
