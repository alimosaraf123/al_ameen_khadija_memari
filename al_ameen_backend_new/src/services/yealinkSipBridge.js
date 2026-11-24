const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const pool = require('../db');
const { checkStudentCallingSchedule, getStudentGuardianOptions } = require('../routes/callingBooth');
const callingScheduleRouter = require('../routes/callingSchedule');

const SIP_PORT = parseInt(process.env.SIP_PORT || '5060', 10);
const GATEWAY_IP = process.env.VOIP_GATEWAY_IP || '192.168.0.240';
let GATEWAY_PORT = parseInt(process.env.VOIP_GATEWAY_PORT || '30004', 10);
const YEALINK_IP = process.env.YEALINK_IP || '192.168.0.210';
const ALLOWED_BOOTH_EXTENSIONS = new Set(['101', '102', '103', '104', '8001']);
let lastYealinkRinfo = { address: YEALINK_IP, port: 5060 };

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal && (net.address.startsWith('192.168.') || net.address.startsWith('10.'))) {
        return net.address;
      }
    }
  }
  return '192.168.0.133';
}

function extractSipUser(headerVal = '') {
  const m = String(headerVal).match(/sip:([^@>;:]+)[@;:]/i) || String(headerVal).match(/sip:([^@>;:]+)$/i);
  return m ? m[1].trim() : '';
}

function computeDigestAuth(username, password, method, uri, wwwAuthHeader) {
  const realmMatch = wwwAuthHeader.match(/realm="([^"]+)"/i);
  const nonceMatch = wwwAuthHeader.match(/nonce="([^"]+)"/i);
  const qopMatch = wwwAuthHeader.match(/qop="?([^",]+)"?/i);
  const opaqueMatch = wwwAuthHeader.match(/opaque="([^"]+)"/i);
  const algorithmMatch = wwwAuthHeader.match(/algorithm="?([^",]+)"?/i);

  const realm = realmMatch ? realmMatch[1] : '';
  const nonce = nonceMatch ? nonceMatch[1] : '';
  const qop = qopMatch ? qopMatch[1] : '';
  const opaque = opaqueMatch ? opaqueMatch[1] : '';
  const algorithm = (algorithmMatch ? algorithmMatch[1] : 'MD5').toUpperCase();

  const cnonce = Math.floor(Math.random() * 100000000).toString(16);
  const nc = '00000001';

  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

  let response = '';
  if (qop && qop.includes('auth')) {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }

  let digest = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", algorithm=${algorithm}`;
  if (opaque) digest += `, opaque="${opaque}"`;
  if (qop && qop.includes('auth')) digest += `, qop="auth", nc=${nc}, cnonce="${cnonce}"`;

  return digest;
}

function parseSipMessage(msgStr) {
  const sdpIdx = msgStr.indexOf('\r\n\r\n');
  const headerPart = sdpIdx !== -1 ? msgStr.slice(0, sdpIdx) : msgStr;
  const sdpBody = sdpIdx !== -1 ? msgStr.slice(sdpIdx + 4) : '';

  const lines = headerPart.split('\r\n');
  const firstLine = lines[0] || '';
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
  return { firstLine, headers, sdpBody };
}

let serverSocket = null;
// Active call sessions keyed by Yealink Call-ID and Gateway Call-ID
const activeSessions = new Map();

function startSipBridge() {
  if (serverSocket) return;

  const localIp = getLocalIp();
  serverSocket = dgram.createSocket('udp4');

  serverSocket.on('error', (err) => {
    console.warn('[Yealink SIP Bridge] Error:', err.message);
  });

  serverSocket.on('message', async (msg, rinfo) => {
    const msgStr = msg.toString('utf8');
    const { firstLine, headers, sdpBody } = parseSipMessage(msgStr);
    const isResponse = firstLine.startsWith('SIP/2.0');
    const method = isResponse ? '' : firstLine.split(' ')[0].toUpperCase();

    // Dynamically learn Gateway signaling port
    if (rinfo.address === GATEWAY_IP && rinfo.port !== GATEWAY_PORT) {
      GATEWAY_PORT = rinfo.port;
    }

    // Log all incoming SIP traffic for real-time diagnostics
    if (firstLine.trim()) {
      console.log(`[Yealink SIP] ${rinfo.address}:${rinfo.port} -> ${firstLine}`);
    }

    // =========================================================================
    // 0. Handle OPTIONS (SIP keepalive / ping)
    // =========================================================================
    if (method === 'OPTIONS') {
      const response = 
        `SIP/2.0 200 OK\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Allow: INVITE, ACK, CANCEL, OPTIONS, BYE, REGISTER\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(response), rinfo.port, rinfo.address);
      return;
    }

    // =========================================================================
    // 1. Handle SIP Responses (from Gateway or Yealink)
    // =========================================================================
    if (isResponse) {
      const statusParts = firstLine.split(' ');
      const statusCode = parseInt(statusParts[1], 10);
      const callId = headers['call-id'];
      const session = activeSessions.get(callId);

      if (!session) return;

      // Case A: Response from Gateway -> Relay to Yealink phone
      if (rinfo.address === GATEWAY_IP) {
        // Log all gateway headers for diagnostics
        console.log(`[Yealink SIP] Gateway (${rinfo.address}:${rinfo.port}) -> ${firstLine} for Call ${session.dialedNumber}`);
        if (statusCode >= 400) {
          console.log(`[Yealink SIP] Gateway failure details:`, JSON.stringify(headers));
        }

        // Send ACK for failure responses to stop gateway retransmissions
        if (statusCode >= 400 && statusCode !== 401) {
          const failAck = 
            `ACK sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=${headers['via'] ? (headers['via'].match(/branch=([^;]+)/i)?.[1] || 'z9hG4bKfail') : 'z9hG4bKfail'}\r\n` +
            `From: <sip:8001@${localIp}>\r\n` +
            `To: ${headers['to'] || `<sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}>`}\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: ${headers['cseq'] ? headers['cseq'].replace('INVITE', 'ACK') : '1 ACK'}\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(failAck), GATEWAY_PORT, GATEWAY_IP);
        }

        // Handle 401 Unauthorized challenge from Gateway
        if (statusCode === 401 && headers['www-authenticate'] && !session.authRetried) {
          session.authRetried = true;
          console.log(`[Yealink SIP] Gateway 401 Challenge received. Sending ACK and Authenticating with Digest...`);
          const uri = `sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}`;

          // Send ACK for 401
          const ack401 = 
            `ACK ${uri} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=${headers['via'] ? (headers['via'].match(/branch=([^;]+)/i)?.[1] || 'z9hG4bKack') : 'z9hG4bKack'}\r\n` +
            `From: ${headers['from']}\r\n` +
            `To: ${headers['to']}\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: ${headers['cseq'] ? headers['cseq'].replace('INVITE', 'ACK') : '1 ACK'}\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(ack401), GATEWAY_PORT, GATEWAY_IP);

          const authHeader = computeDigestAuth('8001', '', 'INVITE', uri, headers['www-authenticate']);
          
          const authInvite = 
            `INVITE ${uri} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
            `From: <sip:8001@${localIp}>;tag=${Math.floor(Math.random() * 1000000)}\r\n` +
            `To: <sip:${session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: 2 INVITE\r\n` +
            `Authorization: ${authHeader}\r\n` +
            `Contact: <sip:8001@${localIp}:${SIP_PORT}>\r\n` +
            `User-Agent: Al-Ameen-SIP-Bridge\r\n` +
            `Content-Type: application/sdp\r\n` +
            `Content-Length: ${Buffer.byteLength(session.sdpBody || '')}\r\n\r\n` +
            (session.sdpBody || '');

          serverSocket.send(Buffer.from(authInvite), GATEWAY_PORT, GATEWAY_IP);
          return;
        }

        let yealinkResp = 
          `SIP/2.0 ${statusParts.slice(1).join(' ')}\r\n` +
          `Via: ${session.yealinkHeaders['via']}\r\n` +
          `From: ${session.yealinkHeaders['from']}\r\n` +
          `To: ${headers['to'] || session.yealinkHeaders['to']}\r\n` +
          `Call-ID: ${session.yealinkCallId}\r\n` +
          `CSeq: ${headers['cseq'] || session.yealinkHeaders['cseq']}\r\n`;

        if (session.yealinkHeaders['record-route']) {
          yealinkResp += `Record-Route: ${session.yealinkHeaders['record-route']}\r\n`;
        }

        if (sdpBody) {
          yealinkResp += `Content-Type: application/sdp\r\n`;
          yealinkResp += `Content-Length: ${Buffer.byteLength(sdpBody)}\r\n\r\n` + sdpBody;
        } else {
          yealinkResp += `Content-Length: 0\r\n\r\n`;
        }

        serverSocket.send(Buffer.from(yealinkResp), session.yealinkRinfo.port, session.yealinkRinfo.address);

        // When call answered (200 OK)
        if (statusCode === 200 && !session.answeredAt) {
          session.answeredAt = new Date();
          console.log(`[Yealink SIP] Call answered by parent/callee!`);

          // Apply talk time limit auto-cut
          if (session.timeLimitSeconds && session.timeLimitSeconds > 0) {
            session.timer = setTimeout(async () => {
              console.log(`[Yealink SIP] Auto-cutting call for student ${session.regNo}: limit ${session.timeLimitSeconds}s reached.`);
              endCallSession(session, 'quota_reached');
            }, session.timeLimitSeconds * 1000);
          }
        }

        // If call failed / rejected / busy (4xx, 5xx, 6xx)
        if (statusCode >= 400 && statusCode !== 401) {
          cleanupSession(session, 'failed_' + statusCode);
        }
      }

      // Case B: Response from Yealink (for Incoming call from GSM)
      if (session.isIncoming && rinfo.address === session.yealinkRinfo.address) {
        console.log(`[Yealink SIP] Yealink (${rinfo.address}) -> ${firstLine} for Incoming Call`);
        let gwResp = 
          `SIP/2.0 ${statusParts.slice(1).join(' ')}\r\n` +
          `Via: ${session.gwHeaders['via']}\r\n` +
          `From: ${session.gwHeaders['from']}\r\n` +
          `To: ${headers['to'] || session.gwHeaders['to']}\r\n` +
          `Call-ID: ${session.gwCallId}\r\n` +
          `CSeq: ${headers['cseq'] || session.gwHeaders['cseq']}\r\n`;

        if (sdpBody) {
          gwResp += `Content-Type: application/sdp\r\n`;
          gwResp += `Content-Length: ${Buffer.byteLength(sdpBody)}\r\n\r\n` + sdpBody;
        } else {
          gwResp += `Content-Length: 0\r\n\r\n`;
        }

        serverSocket.send(Buffer.from(gwResp), GATEWAY_PORT, GATEWAY_IP);

        if (statusCode === 200 && !session.answeredAt) {
          session.answeredAt = new Date();
          console.log(`[Yealink SIP] Incoming call answered on Yealink handset!`);
        }
        if (statusCode >= 400) {
          cleanupSession(session, 'failed_' + statusCode);
        }
      }
      return;
    }

    // =========================================================================
    // 2. Handle REGISTER (from Yealink phone or Gateway)
    // =========================================================================
    if (method === 'REGISTER') {
      if (rinfo.address !== GATEWAY_IP) {
        lastYealinkRinfo = { address: rinfo.address, port: rinfo.port };
      }
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

    // =========================================================================
    // 3. Handle INVITE
    // =========================================================================
    if (method === 'INVITE') {
      const targetMatch = firstLine.match(/sip:([^@;: ]+)/i);
      const dialedNumber = targetMatch ? targetMatch[1].trim() : '';
      const callerUser = extractSipUser(headers['from']);

      // -----------------------------------------------------------------------
      // Case A: INCOMING CALL FROM BSNL SIM / GATEWAY (Port 2) TO BOOTH
      // -----------------------------------------------------------------------
      if (rinfo.address === GATEWAY_IP) {
        console.log(`[Yealink SIP] Incoming call from BSNL SIM on VG204O! Forwarding to Yealink phone (${lastYealinkRinfo.address}:${lastYealinkRinfo.port})...`);
        const ylCallId = `yl-${headers['call-id']}`;
        const session = {
          gwRinfo: rinfo,
          gwCallId: headers['call-id'],
          gwHeaders: headers,
          yealinkCallId: ylCallId,
          yealinkRinfo: lastYealinkRinfo,
          dialedNumber: 'Incoming Call',
          isIncoming: true,
          startedAt: new Date(),
          answeredAt: null
        };
        activeSessions.set(headers['call-id'], session);
        activeSessions.set(ylCallId, session);

        // 100 Trying to gateway immediately
        const trying = 
          `SIP/2.0 100 Trying\r\n` +
          `Via: ${headers['via']}\r\n` +
          `From: ${headers['from']}\r\n` +
          `To: ${headers['to']}\r\n` +
          `Call-ID: ${headers['call-id']}\r\n` +
          `CSeq: ${headers['cseq']}\r\n` +
          `Content-Length: 0\r\n\r\n`;
        serverSocket.send(Buffer.from(trying), rinfo.port, rinfo.address);

        // Forward INVITE to Yealink phone
        const ylInvite = 
          `INVITE sip:101@${lastYealinkRinfo.address}:${lastYealinkRinfo.port} SIP/2.0\r\n` +
          `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
          `From: <sip:BSNL@${localIp}>;tag=${Math.floor(Math.random() * 1000000)}\r\n` +
          `To: <sip:101@${lastYealinkRinfo.address}>\r\n` +
          `Call-ID: ${ylCallId}\r\n` +
          `CSeq: 1 INVITE\r\n` +
          `Contact: <sip:101@${localIp}:${SIP_PORT}>\r\n` +
          `Content-Type: application/sdp\r\n` +
          `Content-Length: ${Buffer.byteLength(sdpBody)}\r\n\r\n` +
          sdpBody;

        serverSocket.send(Buffer.from(ylInvite), lastYealinkRinfo.port, lastYealinkRinfo.address);
        return;
      }

      // -----------------------------------------------------------------------
      // Case B: OUTGOING CALL FROM YEALINK HANDSET
      // -----------------------------------------------------------------------
      console.log(`[Yealink SIP] INVITE received from Yealink! Dialed: "${dialedNumber}" (caller: ${callerUser})`);

      // 100 Trying to handset immediately
      const trying = 
        `SIP/2.0 100 Trying\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(trying), rinfo.port, rinfo.address);

      let mobileToCall = dialedNumber;
      let student = null;
      let chosenRelation = 'Parent';
      let timeLimitSeconds = 480; // 8 minutes default

      try {
        // Check if dialed number is a student Registration Number (e.g. 5 digits)
        const stuRes = await pool.query(
          `SELECT id, registration_no, student_name, class_name, guardian_mobile, mother_mobile, father_mobile 
           FROM students 
           WHERE registration_no = $1 AND is_active = TRUE LIMIT 1`,
          [dialedNumber]
        );

        if (stuRes.rowCount) {
          student = stuRes.rows[0];
          // Check schedule & weekly quota
          const check = await checkStudentCallingSchedule(student.id, student.registration_no);
          if (!check.allowed) {
            console.warn(`[Yealink SIP] Call blocked for ${dialedNumber}: ${check.message}`);
            const tag = Math.floor(Math.random() * 1000000);
            const forbidden = 
              `SIP/2.0 403 Forbidden\r\n` +
              `Via: ${headers['via']}\r\n` +
              `From: ${headers['from']}\r\n` +
              `To: ${headers['to']};tag=${tag}\r\n` +
              `Call-ID: ${headers['call-id']}\r\n` +
              `CSeq: ${headers['cseq']}\r\n` +
              `Reason: SIP;cause=403;text="${encodeURIComponent(check.message_bn || check.message)}"\r\n` +
              `Content-Length: 0\r\n\r\n`;
            serverSocket.send(Buffer.from(forbidden), rinfo.port, rinfo.address);
            return;
          }

          timeLimitSeconds = check.remaining_seconds || (check.allowed_talk_time ? check.allowed_talk_time * 60 : 480);
          const options = await getStudentGuardianOptions(student.id);
          const preferred = options.find(o => o.key === 2) || options[0];
          if (preferred && preferred.mobile) {
            mobileToCall = preferred.mobile;
            chosenRelation = preferred.label || 'Guardian';
            console.log(`[Yealink SIP] Reg No ${dialedNumber} (${student.student_name}) resolved to ${chosenRelation}: ${mobileToCall}`);
          }
        }
      } catch (err) {
        console.error('[Yealink SIP] Student lookup error:', err.message);
      }

      // Format mobile number: 10 digits
      let cleanDigits = mobileToCall.replace(/\D/g, '');
      if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
        cleanDigits = cleanDigits.slice(2);
      } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
        cleanDigits = cleanDigits.slice(1);
      }

      if (!cleanDigits || cleanDigits.length < 10) {
        console.warn(`[Yealink SIP] Invalid destination number: "${dialedNumber}"`);
        const tag = Math.floor(Math.random() * 1000000);
        const badNum = 
          `SIP/2.0 404 Not Found\r\n` +
          `Via: ${headers['via']}\r\n` +
          `From: ${headers['from']}\r\n` +
          `To: ${headers['to']};tag=${tag}\r\n` +
          `Call-ID: ${headers['call-id']}\r\n` +
          `CSeq: ${headers['cseq']}\r\n` +
          `Content-Length: 0\r\n\r\n`;
        serverSocket.send(Buffer.from(badNum), rinfo.port, rinfo.address);
        return;
      }

      mobileToCall = cleanDigits;
      // Standard 10-digit Indian mobile dialing for GSM FCT SIM (no leading 0)
      const dialDigitsForGw = mobileToCall;

      // Create session
      const gwCallId = `gw-${headers['call-id']}`;
      const session = {
        yealinkRinfo: rinfo,
        yealinkCallId: headers['call-id'],
        yealinkHeaders: headers,
        gwCallId: gwCallId,
        dialedNumber: mobileToCall,
        gwDialedNumber: dialDigitsForGw,
        studentId: student ? student.id : null,
        studentName: student ? student.student_name : null,
        regNo: student ? student.registration_no : dialedNumber,
        className: student ? student.class_name : null,
        relation: chosenRelation,
        timeLimitSeconds: timeLimitSeconds,
        sdpBody: sdpBody,
        authRetried: false,
        startedAt: new Date(),
        answeredAt: null,
        timer: null
      };

      activeSessions.set(headers['call-id'], session);
      activeSessions.set(gwCallId, session);

      // Send INVITE to VG204O gateway on port 30004 with 0-prefixed number
      console.log(`[Yealink SIP] Routing call to VG204O (${GATEWAY_IP}:${GATEWAY_PORT}) for mobile: ${dialDigitsForGw} (original: ${mobileToCall})`);
      
      const gwInvite = 
        `INVITE sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
        `From: <sip:8001@${localIp}>;tag=${Math.floor(Math.random() * 1000000)}\r\n` +
        `To: <sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
        `Call-ID: ${gwCallId}\r\n` +
        `CSeq: 1 INVITE\r\n` +
        `Contact: <sip:8001@${localIp}:${SIP_PORT}>\r\n` +
        `User-Agent: Al-Ameen-SIP-Bridge\r\n` +
        `Content-Type: application/sdp\r\n` +
        `Content-Length: ${Buffer.byteLength(sdpBody)}\r\n\r\n` +
        sdpBody;

      serverSocket.send(Buffer.from(gwInvite), GATEWAY_PORT, GATEWAY_IP, (err) => {
        if (err) console.error('[Yealink SIP] Error sending to Gateway:', err.message);
        else console.log(`[Yealink SIP] Successfully sent INVITE to ${GATEWAY_IP}:${GATEWAY_PORT}`);
      });
      return;
    }

    // =========================================================================
    // 4. Handle ACK
    // =========================================================================
    if (method === 'ACK') {
      const callId = headers['call-id'];
      const session = activeSessions.get(callId);
      if (session) {
        if (session.isIncoming) {
          const gwAck = 
            `ACK sip:2@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
            `From: <sip:BSNL@${localIp}>\r\n` +
            `To: ${session.gwHeaders['to'] || `<sip:2@${GATEWAY_IP}>`}\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: 1 ACK\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(gwAck), GATEWAY_PORT, GATEWAY_IP);
        } else {
          const gwAck = 
            `ACK sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
            `From: <sip:8001@${localIp}>\r\n` +
            `To: <sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: 1 ACK\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(gwAck), GATEWAY_PORT, GATEWAY_IP);
        }
      }
      return;
    }

    // =========================================================================
    // 5. Handle BYE or CANCEL (Call hangup)
    // =========================================================================
    if (method === 'BYE' || method === 'CANCEL') {
      const callId = headers['call-id'];
      const session = activeSessions.get(callId);

      // Reply 200 OK to sender
      const response = 
        `SIP/2.0 200 OK\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(response), rinfo.port, rinfo.address);

      if (session) {
        console.log(`[Yealink SIP] ${method} received for ${session.dialedNumber}. Ending call.`);
        endCallSession(session, method.toLowerCase());
      }
      return;
    }
  });

  serverSocket.bind(SIP_PORT, '0.0.0.0', () => {
    console.log(`[Yealink SIP Bridge] Listening for Yealink IP phone on UDP port ${SIP_PORT}... (Local IP: ${localIp}, Gateway: ${GATEWAY_IP}:${GATEWAY_PORT})`);
  });
}

async function endCallSession(session, reason = 'hangup') {
  if (!session) return;
  if (session.timer) clearTimeout(session.timer);

  const localIp = getLocalIp();

  // Send BYE to Gateway
  try {
    const gwBye = 
      `BYE sip:${session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
      `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
      `From: <sip:8001@${localIp}>\r\n` +
      `To: <sip:${session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
      `Call-ID: ${session.gwCallId}\r\n` +
      `CSeq: 3 BYE\r\n` +
      `Content-Length: 0\r\n\r\n`;
    serverSocket.send(Buffer.from(gwBye), GATEWAY_PORT, GATEWAY_IP);
  } catch (_) {}

  // Send BYE to Yealink if call was already answered
  try {
    if (session.answeredAt && session.yealinkRinfo) {
      const ylBye = 
        `BYE sip:101@${session.yealinkRinfo.address}:${session.yealinkRinfo.port} SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
        `From: <sip:${session.dialedNumber}@${localIp}>\r\n` +
        `To: <sip:101@${session.yealinkRinfo.address}>\r\n` +
        `Call-ID: ${session.yealinkCallId}\r\n` +
        `CSeq: 3 BYE\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(ylBye), session.yealinkRinfo.port, session.yealinkRinfo.address);
    }
  } catch (_) {}

  cleanupSession(session, reason);
}

async function cleanupSession(session, reason) {
  activeSessions.delete(session.yealinkCallId);
  activeSessions.delete(session.gwCallId);

  // Save to database
  const durationSec = session.answeredAt ? Math.round((Date.now() - session.answeredAt.getTime()) / 1000) : 0;
  const status = durationSec > 0 ? 'completed' : (reason === 'cancel' ? 'cancelled' : 'missed');

  console.log(`[Yealink SIP] Call finished: ${session.dialedNumber} | Duration: ${durationSec}s | Status: ${status}`);

  try {
    await pool.query(
      `INSERT INTO hostel_call_logs (
         student_id, student_name, registration_no, class_name,
         contact_person, phone_number, call_status,
         call_duration_seconds, max_allowed_seconds,
         sim_slot, gateway_type, notes, started_at, ended_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        session.studentId,
        session.studentName,
        session.regNo,
        session.className,
        session.relation || 'Guardian',
        session.dialedNumber,
        status,
        durationSec,
        session.timeLimitSeconds || 480,
        'SIM 1 (Port 2)',
        'VG204O + CCL FCT',
        `Ended via ${reason}`,
        session.startedAt
      ]
    );
  } catch (err) {
    console.error('[Yealink SIP] Failed to save call log:', err.message);
  }
}

module.exports = {
  startSipBridge
};
