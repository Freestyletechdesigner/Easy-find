'use strict';

/**
 * whatsapp-connect.js
 * ───────────────────
 * Run this ONCE to scan the WhatsApp QR code and save the session.
 * After scanning, the session is saved to ./whatsapp-session/
 * and this script exits automatically.
 *
 * Usage:
 *   node whatsapp-connect.js
 *
 * After session is saved, just run your normal app:
 *   node app.js
 *
 * If you ever get logged out, delete whatsapp-session/ and run this again.
 */

require('dotenv').config();

const path = require('path');
const fs   = require('fs');

const SESSION_DIR = path.resolve(
    process.env.WHATSAPP_SESSION_DIR || './whatsapp-session'
);

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

async function main() {
    let makeWASocket, useMultiFileAuthState, DisconnectReason;
    let qrcode;

    try {
        const baileys = require('@whiskeysockets/baileys');
        makeWASocket          = baileys.makeWASocket || baileys.default;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
        DisconnectReason      = baileys.DisconnectReason;
    } catch (err) {
        console.error('\n❌  Baileys not installed.');
        console.error('    Run: npm install @whiskeysockets/baileys --save-exact --legacy-peer-deps\n');
        process.exit(1);
    }

    try { qrcode = require('qrcode-terminal'); } catch (_) {}

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    const sock = makeWASocket({
        auth:               state,
        printQRInTerminal:  false,
        logger:             require('pino')({ level: 'silent' }),
        browser:            ['EasyFind Fred', 'Chrome', '1.0.0'],
        syncFullHistory:    false,
        markOnlineOnConnect: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.clear();
            console.log('╔══════════════════════════════════════════════╗');
            console.log('║      EASYFIND FRED — WhatsApp QR Code        ║');
            console.log('╠══════════════════════════════════════════════╣');
            console.log('║  1. Open WhatsApp on your phone              ║');
            console.log('║  2. Tap ⋮ Menu → Linked Devices              ║');
            console.log('║  3. Tap "Link a Device"                      ║');
            console.log('║  4. Scan the QR code below                   ║');
            console.log('╚══════════════════════════════════════════════╝\n');

            if (qrcode) {
                qrcode.generate(qr, { small: true });
            } else {
                console.log(qr);
            }

            console.log('\n⏳  Waiting for scan… (QR refreshes every 60s)\n');
        }

        if (connection === 'open') {
            console.log('\n✅  WhatsApp connected successfully!');
            console.log(`📁  Session saved to: ${SESSION_DIR}`);
            console.log('\n👉  You can now start your app normally:');
            console.log('      node app.js\n');
            // Give saveCreds a moment to finish writing
            setTimeout(() => process.exit(0), 1500);
        }

        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason?.loggedOut) {
                console.log('\n❌  Logged out. Delete whatsapp-session/ and run this script again.');
                process.exit(1);
            } else {
                console.log(`\n⚠️  Connection closed (code ${code}) — retrying…\n`);
                setTimeout(main, 3000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
