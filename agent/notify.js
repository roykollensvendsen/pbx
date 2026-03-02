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

async function sendCallSummary(messages) {
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

  try {
    await transporter.sendMail({
      from: config.NOTIFY_EMAIL,
      to: config.NOTIFY_EMAIL,
      subject: `Tapt anrop – ${time}`,
      text: `Du hadde et innkommende anrop ${time}.\n\nSamtalelogg:\n\n${body}`,
    });
    console.log('[Notify] Email sent');
  } catch (err) {
    console.error('[Notify] Email failed:', err.message);
  }
}

module.exports = { sendCallSummary };
