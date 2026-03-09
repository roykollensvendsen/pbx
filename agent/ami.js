'use strict';

const net = require('net');
const config = require('./config');
const log = require('./log');

function sendAction(action) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('AMI timeout'));
    }, 5000);

    socket.connect(config.AMI_PORT, config.AMI_HOST, () => {
      // Wait for AMI banner before sending
    });

    socket.on('data', (data) => {
      response += data.toString();

      // Wait for banner, then send action
      if (response.includes('Asterisk Call Manager') && !socket._actionSent) {
        socket._actionSent = true;
        const lines = Object.entries(action)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n');
        socket.write(lines + '\r\n\r\n');
        return;
      }

      // Check for complete response
      if (response.includes('Response: Success') || response.includes('Response: Error')) {
        clearTimeout(timer);
        socket.destroy();
        if (response.includes('Response: Error')) {
          const msgMatch = response.match(/Message: (.+)/);
          reject(new Error(`AMI error: ${msgMatch ? msgMatch[1].trim() : 'unknown'}`));
        } else {
          resolve(response);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function redirectChannel(channel, context, exten) {
  // Login
  await sendAction({
    Action: 'Login',
    Username: config.AMI_USER,
    Secret: config.AMI_SECRET,
  });

  // Redirect
  await sendAction({
    Action: 'Login',
    Username: config.AMI_USER,
    Secret: config.AMI_SECRET,
  });

  // Need a new connection for the redirect since each sendAction opens/closes
  // Actually, let's do login+redirect in one connection
  return redirectWithLogin(channel, context, exten);
}

async function redirectWithLogin(channel, context, exten) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = '';
    let loggedIn = false;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('AMI timeout'));
    }, 5000);

    socket.connect(config.AMI_PORT, config.AMI_HOST);

    socket.on('data', (data) => {
      response += data.toString();

      // Wait for banner
      if (response.includes('Asterisk Call Manager') && !socket._bannerHandled) {
        socket._bannerHandled = true;
        socket.write(
          `Action: Login\r\nUsername: ${config.AMI_USER}\r\nSecret: ${config.AMI_SECRET}\r\n\r\n`
        );
        return;
      }

      if (!loggedIn && response.includes('Response: Success')) {
        loggedIn = true;
        response = '';
        socket.write(
          `Action: Redirect\r\nChannel: ${channel}\r\nContext: ${context}\r\nExten: ${exten}\r\nPriority: 1\r\n\r\n`
        );
        return;
      }

      if (loggedIn && (response.includes('Response: Success') || response.includes('Response: Error'))) {
        clearTimeout(timer);
        socket.write('Action: Logoff\r\n\r\n');
        socket.destroy();
        if (response.includes('Response: Error')) {
          const msgMatch = response.match(/Message: (.+)/);
          reject(new Error(`AMI Redirect error: ${msgMatch ? msgMatch[1].trim() : 'unknown'}`));
        } else {
          log.ami.info(`Redirected ${channel} → ${context}/${exten}`);
          resolve();
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = { redirectChannel: redirectWithLogin };
