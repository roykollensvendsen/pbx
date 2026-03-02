'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.NOTIFY_EMAIL,
    pass: config.NOTIFY_EMAIL_PASSWORD,
  },
});

// Rate limiting: track last alert time per service
const alertCooldowns = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

async function sendApiAlert(service, error) {
  if (!config.NOTIFY_EMAIL) return;

  const now = Date.now();
  const lastSent = alertCooldowns.get(service) || 0;
  if (now - lastSent < ALERT_COOLDOWN_MS) {
    console.log(`[Notify] Alert for ${service} suppressed (cooldown)`);
    return;
  }
  alertCooldowns.set(service, now);

  const time = new Date().toLocaleString('no-NO', { timeZone: 'Europe/Oslo' });
  const errMsg = error instanceof Error ? error.message : String(error);

  try {
    await transporter.sendMail({
      from: config.NOTIFY_EMAIL,
      to: config.NOTIFY_EMAIL,
      subject: `API-feil: ${service} – ${time}`,
      text: `API-feil i ${service} oppdaget ${time}.\n\nFeilmelding:\n${errMsg}`,
    });
    console.log(`[Notify] API alert sent for ${service}`);
  } catch (err) {
    console.error('[Notify] API alert email failed:', err.message);
  }
}

async function sendCallSummary(messages, callerNumber, callerName) {
  if (!config.NOTIFY_EMAIL) {
    console.log('[Notify] No email configured, skipping notification');
    return;
  }

  // Build conversation log
  const lines = messages.map((m) => {
    const label = m.role === 'user' ? 'Innringer' : 'AI';
    return `${label}: ${m.content}`;
  });

  const body = lines.join('\n\n');
  const time = new Date().toLocaleString('no-NO', { timeZone: 'Europe/Oslo' });

  let callerInfo = '';
  if (callerName && callerNumber) {
    callerInfo = ` fra ${callerName} (${callerNumber})`;
  } else if (callerNumber) {
    callerInfo = ` fra ${callerNumber}`;
  }

  try {
    await transporter.sendMail({
      from: config.NOTIFY_EMAIL,
      to: config.NOTIFY_EMAIL,
      subject: `Tapt anrop${callerInfo} – ${time}`,
      text: `Du hadde et innkommende anrop${callerInfo} ${time}.\n\nSamtalelogg:\n\n${body}`,
    });
    console.log('[Notify] Email sent');
  } catch (err) {
    console.error('[Notify] Email failed:', err.message);
  }
}

module.exports = { sendCallSummary, sendApiAlert };
