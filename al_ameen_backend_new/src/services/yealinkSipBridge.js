const dgram = require('dgram');
const pool = require('../db');
const gsmAdb = require('../utils/gsmAdb');
const { checkStudentCallingSchedule, getStudentGuardianOptions } = require('../routes/callingBooth');
const callingScheduleRouter = require('../routes/callingSchedule');

const SIP_PORT = 5060;
const SERVER_IP = '192.168.0.248';
const ALLOWED_BOOTH_EXTENSIONS = new Set(['101', '102', '103', '104']);

function extractSipUser(headerVal = '') {
  const m = String(headerVal).match(/sip:([^@>;]+)@/i);
  return m ? m[1].trim() : '';
}

let serverSocket = null;

function parseSipHeaders(msgStr) {
  const lines = msgStr.split('\r\n');
  const firstLine = lines[0];
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) break;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const val = line.slice(colonIdx + 1).trim();
      headers[key] = val;
    }
  }
  return { firstLine, headers };
}

function startSipBridge() {
  if (serverSocket) return;

  serverSocket = dgram.createSocket('udp4');

  serverSocket.on('error', (err) => {
    console.warn('[Yealink SIP Bridge] Error:', err.message);
  });

  serverSocket.on('message', async (msg, rinfo) => {
    const msgStr = msg.toString('utf8');
    const { firstLine, headers } = parseSipHeaders(msgStr);
    const method = firstLine.split(' ')[0].toUpperCase();

    // 1. Handle REGISTER
    if (method === 'REGISTER') {
      console.log(`[Yealink SIP] REGISTER from ${rinfo.address}:${rinfo.port}`);
      const tag = Math.floor(Math.random() * 1000000);
      const toHeader = headers['to'] || '';
      const toWithTag = toHeader.includes('tag=') ? toHeader : `${toHeader};tag=${tag}`;
      const expires = headers['expires'] || '3600';

      const response = 
        `SIP/2.0 200 OK\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${toWithTag}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Contact: ${headers['contact'] || `<sip:101@${rinfo.address}:${rinfo.port}>`}\r\n` +
        `Expires: ${expires}\r\n` +
        `Content-Length: 0\r\n\r\n`;

      serverSocket.send(Buffer.from(response), rinfo.port, rinfo.address);
      return;
    }

    // 2. Handle INVITE (Outgoing from Yealink Booth OR Incoming from Gateway)
    if (method === 'INVITE') {
      const targetMatch = firstLine.match(/sip:([^@]+)@/i);
      const dialedNumber = targetMatch ? targetMatch[1] : '';
      const callerUser = extractSipUser(headers['from']);
      const isOutgoingFromBooth = ALLOWED_BOOTH_EXTENSIONS.has(callerUser) || /^booth/i.test(callerUser);

      // Block ALL incoming calls when incoming_calls_enabled is FALSE (default OFF)
      if (!isOutgoingFromBooth) {
        let incomingAllowed = false;
        try {
          const settings = await callingScheduleRouter.getBoothSettings();
          incomingAllowed = Boolean(settings?.incoming_calls_enabled);
        } catch (_) {
          incomingAllowed = false;
        }
        if (!incomingAllowed) {
          console.log(`[Yealink SIP] BLOCKED incoming call from "${callerUser || rinfo.address}" to "${dialedNumber}" (Incoming calls are OFF)`);
          const tag = Math.floor(Math.random() * 1000000);
          const toHeader = headers['to'] || '';
          const toWithTag = toHeader.includes('tag=') ? toHeader : `${toHeader};tag=${tag}`;
          const forbidden =
            `SIP/2.0 403 Forbidden\r\n` +
            `Via: ${headers['via']}\r\n` +
            `From: ${headers['from']}\r\n` +
            `To: ${toWithTag}\r\n` +
            `Call-ID: ${headers['call-id']}\r\n` +
            `CSeq: ${headers['cseq']}\r\n` +
            `Reason: SIP;cause=403;text="Incoming calls disabled"\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(forbidden), rinfo.port, rinfo.address);
          return;
        }
      }

      console.log(`[Yealink SIP] INVITE received! Dialed number: "${dialedNumber}" from ${rinfo.address}`);

      // Send 100 Trying & 180 Ringing to Yealink phone so handset hears ring
      const tag = Math.floor(Math.random() * 1000000);
      const toHeader = headers['to'] || '';
      const toWithTag = toHeader.includes('tag=') ? toHeader : `${toHeader};tag=${tag}`;

      const trying = 
        `SIP/2.0 100 Trying\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(trying), rinfo.port, rinfo.address);

      const ringing = 
        `SIP/2.0 180 Ringing\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${toWithTag}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(ringing), rinfo.port, rinfo.address);

      // Resolve student registration number or phone number
      try {
        let mobileToCall = dialedNumber;

        // If student entered a Registration Number (e.g. 62910)
        const stuRes = await pool.query(
          `SELECT id, registration_no, student_name, guardian_mobile, mother_mobile, father_mobile 
           FROM students 
           WHERE registration_no = $1 AND is_active = TRUE LIMIT 1`,
          [dialedNumber]
        );

        if (stuRes.rowCount) {
          const student = stuRes.rows[0];
          // Check schedule
          const check = await checkStudentCallingSchedule(student.id, student.registration_no);
          if (check.allowed) {
            const options = await getStudentGuardianOptions(student.id);
            // Default to Mother or Father or Guardian
            const preferred = options.find(o => o.key === 2) || options[0];
            if (preferred && preferred.mobile) {
              mobileToCall = preferred.mobile;
              console.log(`[Yealink SIP] Reg No ${dialedNumber} (${student.student_name}) resolved to ${preferred.label}: ${mobileToCall}`);
            }
          } else {
            console.warn(`[Yealink SIP] Calling not allowed for ${dialedNumber}: ${check.message}`);
          }
        }

        // Trigger real GSM call via connected Android phone!
        if (mobileToCall && mobileToCall.length >= 10) {
          console.log(`[Yealink SIP] Triggering ADB GSM call to: ${mobileToCall}`);
          await gsmAdb.dialNumber(mobileToCall);
        }
      } catch (e) {
        console.error('[Yealink SIP] Error processing call:', e.message);
      }
      return;
    }

    // 3. Handle BYE / CANCEL (Student hangs up handset)
    if (method === 'BYE' || method === 'CANCEL') {
      console.log(`[Yealink SIP] ${method} received! Hanging up GSM call.`);
      const response = 
        `SIP/2.0 200 OK\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(response), rinfo.port, rinfo.address);

      // Hang up connected Android mobile!
      try {
        await gsmAdb.hangUpCall();
      } catch (e) {}
      return;
    }

    // 4. Handle ACK
    if (method === 'ACK') {
      return;
    }
  });

  serverSocket.bind(SIP_PORT, '0.0.0.0', () => {
    console.log(`[Yealink SIP Bridge] Listening for Yealink IP phone on UDP port ${SIP_PORT}...`);
  });
}

module.exports = {
  startSipBridge
};
