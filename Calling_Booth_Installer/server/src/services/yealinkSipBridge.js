const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { checkStudentCallingSchedule, getStudentGuardianOptions } = require('../routes/callingBooth');
const callingScheduleRouter = require('../routes/callingSchedule');
const { uploadBuffer } = require('../utils/cloudStorage');

const SIP_PORT = parseInt(process.env.SIP_PORT || '5060', 10);
const GATEWAY_IP = process.env.VOIP_GATEWAY_IP || '192.168.0.240';
let GATEWAY_PORT = parseInt(process.env.VOIP_GATEWAY_PORT || '30004', 10);
const YEALINK_IP = process.env.YEALINK_IP || '192.168.0.210';
const ALLOWED_BOOTH_EXTENSIONS = new Set(['101', '102', '103', '104', '8001']);
let lastYealinkRinfo = { address: YEALINK_IP, port: 5060 };

// Load IVR Audio Prompt (Bengali & English)
const IVR_AUDIO_PATH = path.join(__dirname, 'prompt_ivr.alaw');
let ivrAudioBuffer = null;
try {
  if (fs.existsSync(IVR_AUDIO_PATH)) {
    ivrAudioBuffer = fs.readFileSync(IVR_AUDIO_PATH);
    console.log(`[Yealink SIP Bridge] Loaded IVR audio prompt (${ivrAudioBuffer.length} bytes, ${(ivrAudioBuffer.length / 8000).toFixed(1)}s)`);
  }
} catch (e) {
  console.warn('[Yealink SIP Bridge] Could not load IVR audio prompt:', e.message);
}

// -----------------------------------------------------------------------------
// In-Band Audio DTMF Detection (Goertzel Algorithm for G.711 PCMA / PCMU)
// -----------------------------------------------------------------------------
const aLawToLinear = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let val = i ^ 0x55;
  let sign = val & 0x80;
  let exponent = (val >> 4) & 0x07;
  let mantissa = val & 0x0F;
  let sample = (mantissa << 4) + 8;
  if (exponent > 0) sample = (sample + 256) << (exponent - 1);
  aLawToLinear[i] = sign ? sample : -sample;
}

const uLawToLinear = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let val = ~i;
  let sign = val & 0x80;
  let exponent = (val >> 4) & 0x07;
  let mantissa = val & 0x0F;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  uLawToLinear[i] = sign ? -sample : sample;
}

function goertzel(samples, targetFreq, sampleRate) {
  const k = Math.round((samples.length * targetFreq) / sampleRate);
  const omega = (2 * Math.PI * k) / samples.length;
  const coeff = 2 * Math.cos(omega);
  let q0 = 0, q1 = 0, q2 = 0;
  for (let i = 0; i < samples.length; i++) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  return q1 * q1 + q2 * q2 - coeff * q1 * q2;
}

const DTMF_MAP = {
  '697,1209': '1', '697,1336': '2', '697,1477': '3',
  '770,1209': '4', '770,1336': '5', '770,1477': '6',
  '852,1209': '7', '852,1336': '8', '852,1477': '9',
  '941,1209': '*', '941,1336': '0', '941,1477': '#'
};

const LOW_FREQS = [697, 770, 852, 941];
const HIGH_FREQS = [1209, 1336, 1477, 1633];

function detectDtmfAudio(rawAudioBytes, codec = 'alaw') {
  const samples = new Int16Array(rawAudioBytes.length);
  const lut = codec === 'mulaw' ? uLawToLinear : aLawToLinear;
  let totalEnergy = 0;
  for (let i = 0; i < rawAudioBytes.length; i++) {
    samples[i] = lut[rawAudioBytes[i]];
    totalEnergy += samples[i] * samples[i];
  }

  // Energy threshold check (ignore silence / low level background noise)
  if (totalEnergy < 5000000) return null;

  let bestLowFreq = 0, bestLowEnergy = 0, secondLowEnergy = 0;
  for (const f of LOW_FREQS) {
    const e = goertzel(samples, f, 8000);
    if (e > bestLowEnergy) {
      secondLowEnergy = bestLowEnergy;
      bestLowEnergy = e;
      bestLowFreq = f;
    } else if (e > secondLowEnergy) {
      secondLowEnergy = e;
    }
  }

  let bestHighFreq = 0, bestHighEnergy = 0, secondHighEnergy = 0;
  for (const f of HIGH_FREQS) {
    const e = goertzel(samples, f, 8000);
    if (e > bestHighEnergy) {
      secondHighEnergy = bestHighEnergy;
      bestHighEnergy = e;
      bestHighFreq = f;
    } else if (e > secondHighEnergy) {
      secondHighEnergy = e;
    }
  }

  // Frequency dominance check: peak must be at least 2.5x the runner-up in each group
  if (bestLowEnergy < 2.5 * secondLowEnergy || bestHighEnergy < 2.5 * secondHighEnergy) {
    return null;
  }

  // Energy balance / twist test
  const ratio = bestHighEnergy / bestLowEnergy;
  if (ratio < 0.1 || ratio > 10.0) return null;

  const key = bestLowFreq + ',' + bestHighFreq;
  return DTMF_MAP[key] || null;
}

// -----------------------------------------------------------------------------
// Local Call Recording Helpers (8kHz 16-bit Mono WAV Stream Mixer)
// -----------------------------------------------------------------------------
async function isCallRecordingActive() {
  try {
    if (typeof callingScheduleRouter.getBoothSettings === 'function') {
      const s = await callingScheduleRouter.getBoothSettings();
      return Boolean(s && s.call_recording_enabled);
    }
    if (typeof callingScheduleRouter.isCallRecordingEnabled === 'function') {
      return callingScheduleRouter.isCallRecordingEnabled();
    }
  } catch (_) {}
  return typeof callingScheduleRouter.isCallRecordingEnabled === 'function'
    ? callingScheduleRouter.isCallRecordingEnabled()
    : false;
}

function decodeRtpToPcm16(msg) {
  if (!msg || msg.length < 13) return null;
  const pt = msg[1] & 0x7F;
  if (pt !== 8 && pt !== 0) return null; // Only PCMA (8) and PCMU (0)
  const payload = msg.subarray(12);
  const lut = pt === 0 ? uLawToLinear : aLawToLinear;
  const pcm = new Int16Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    pcm[i] = lut[payload[i]];
  }
  return pcm;
}

function markParentAnswered(session, reason = 'voice_detected') {
  if (!session || session.answeredAt || session.state === 'ENDED') return;
  if (session.answerFallbackTimer) {
    clearTimeout(session.answerFallbackTimer);
    session.answerFallbackTimer = null;
  }
  session.waitingForAnswer = false;
  session.answeredAt = new Date();
  console.log(`[Yealink SIP] Parent answered (${reason})! Talk timer started (${session.timeLimitSeconds}s limit = ${((session.timeLimitSeconds || 0) / 60).toFixed(1)} mins)...`);

  isCallRecordingActive().then((recOn) => {
    if (recOn && (session.state === 'BRIDGED' || session.isRecordingProxy)) {
      startCallRecording(session);
    }
  }).catch(() => {});

  if (session.timeLimitSeconds && session.timeLimitSeconds > 0) {
    session.timer = setTimeout(async () => {
      console.log(`[Yealink SIP] Auto-cutting call for student ${session.regNo}: limit ${session.timeLimitSeconds}s reached.`);
      endCallSession(session, 'quota_reached');
    }, session.timeLimitSeconds * 1000);
  }
}

function beginWaitingForAnswer(session) {
  if (!session || session.waitingForAnswer || session.answeredAt) return;
  session.waitingForAnswer = true;
  session.gw200Received = true;
  session.gwDialedAt = Date.now();
  session.nonRingSpeechFrames = 0;
  console.log(`[Yealink SIP] Gateway connected (ringing/early media). Listening for parent pickup before starting talk timer...`);
  session.answerFallbackTimer = setTimeout(() => {
    if (!session.answeredAt && (session.state === 'BRIDGED' || session.gw200Received)) {
      markParentAnswered(session, '45s_safety_fallback');
    }
  }, 45000);
}

function detectAnswerFromGatewayAudio(session, msg) {
  if (!session || !session.waitingForAnswer || session.answeredAt) return;
  // Wait 4.5s after gateway 200 OK so CCL FCT DTMF dialing & initial line clicks settle
  if (!session.gwDialedAt || (Date.now() - session.gwDialedAt) < 4500) return;

  const pcm = decodeRtpToPcm16(msg);
  if (!pcm || pcm.length === 0) return;

  let sumSq = 0;
  for (let i = 0; i < pcm.length; i++) {
    sumSq += pcm[i] * pcm[i];
  }
  const meanEnergy = sumSq / pcm.length;
  // Ignore silence / low-level comfort noise between ringback bursts
  if (meanEnergy < 12000) {
    session.nonRingSpeechFrames = 0;
    return;
  }

  const e400 = goertzel(pcm, 400, 8000);
  const e425 = goertzel(pcm, 425, 8000);
  const ringEnergy = Math.max(e400, e425);
  const ringRatio = (2 * ringEnergy) / (pcm.length * sumSq);

  if (ringRatio > 0.35) {
    // Still hearing 400Hz/425Hz ringback tone
    session.nonRingSpeechFrames = 0;
    return;
  }

  // Broadband speech / voice energy detected
  session.nonRingSpeechFrames = (session.nonRingSpeechFrames || 0) + 1;
  if (session.nonRingSpeechFrames >= 8) {
    markParentAnswered(session, 'voice_detected');
  }
}

function rewriteSdpIpAndPort(sdp, newIp, newPort) {
  if (!sdp) return sdp;
  return sdp
    .replace(/c=IN\s+IP4\s+[0-9.]+/i, `c=IN IP4 ${newIp}`)
    .replace(/m=audio\s+\d+/i, `m=audio ${newPort}`);
}

function startCallRecording(session) {
  if (!session || session.recordingActive) return;
  try {
    const dateFolder = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const recDir = path.resolve(__dirname, '..', '..', 'recordings', dateFolder);
    fs.mkdirSync(recDir, { recursive: true });

    const safeReg = String(session.regNo || 'call').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeRel = String(session.relation || 'Guardian').replace(/[^a-zA-Z0-9_-]/g, '');
    const stamp = Date.now();
    const fileName = `${safeReg}_${safeRel}_${stamp}.mp3`;
    const fullWavPath = path.join(recDir, fileName);
    const tempPcmPath = `${fullWavPath}.pcm`;

    session.recordingActive = true;
    session.recordedPcmBytes = 0;
    session.ylAudioQueue = [];
    session.gwAudioQueue = [];
    session.pcmStream = fs.createWriteStream(tempPcmPath);
    session.recordingMeta = {
      dateFolder,
      fileName,
      fullWavPath,
      tempPcmPath,
      apiPath: `/api/calls/recordings/${dateFolder}/${fileName}`,
    };

    session.recordInterval = setInterval(() => {
      if (!session.recordingActive || !session.pcmStream) return;
      const f1 = session.ylAudioQueue.length > 0 ? session.ylAudioQueue.shift() : null;
      const f2 = session.gwAudioQueue.length > 0 ? session.gwAudioQueue.shift() : null;
      const len = Math.max(f1 ? f1.length : 0, f2 ? f2.length : 0) || 160;
      const out = Buffer.allocUnsafe(len * 2);

      for (let i = 0; i < len; i++) {
        const s1 = f1 && i < f1.length ? f1[i] : 0;
        const s2 = f2 && i < f2.length ? f2[i] : 0;
        let mixed = s1 + s2;
        if (mixed > 32767) mixed = 32767;
        else if (mixed < -32768) mixed = -32768;
        out.writeInt16LE(mixed, i * 2);
      }

      session.pcmStream.write(out);
      session.recordedPcmBytes += out.length;
    }, 20);

    console.log(`[Yealink SIP] Call recording STARTED: ${session.recordingMeta.apiPath}`);
  } catch (err) {
    console.error('[Yealink SIP] Failed to start call recording:', err.message);
    session.recordingActive = false;
  }
}

function pushAudioFrame(session, side, msg) {
  if (!session || !session.recordingActive) return;
  const pcm = decodeRtpToPcm16(msg);
  if (!pcm) return;
  const q = side === 'yl' ? session.ylAudioQueue : session.gwAudioQueue;
  if (!q) return;
  if (q.length >= 50) q.shift();
  q.push(pcm);
}

async function encodePcmToMp3(pcmBuffer) {
  const lameMod = await import('@breezystack/lamejs');
  const Mp3Encoder = lameMod.Mp3Encoder || lameMod.default?.Mp3Encoder;
  const encoder = new Mp3Encoder(1, 8000, 24);
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = pcmBuffer.readInt16LE(i * 2);
  }
  const mp3Chunks = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf && mp3buf.length > 0) mp3Chunks.push(Buffer.from(mp3buf));
  }
  const endBuf = encoder.flush();
  if (endBuf && endBuf.length > 0) mp3Chunks.push(Buffer.from(endBuf));
  return Buffer.concat(mp3Chunks);
}

async function finalizeCallRecording(session) {
  if (!session || !session.recordingMeta) return null;
  if (session.recordingFinalized) return session.savedRecordingUrl || null;
  session.recordingFinalized = true;
  session.recordingActive = false;

  if (session.recordInterval) {
    clearInterval(session.recordInterval);
    session.recordInterval = null;
  }

  const meta = session.recordingMeta;
  if (session.pcmStream) {
    await new Promise((resolve) => {
      session.pcmStream.end(resolve);
    });
    session.pcmStream = null;
  }

  try {
    if (!fs.existsSync(meta.tempPcmPath)) return null;
    const stats = fs.statSync(meta.tempPcmPath);
    const dataSize = stats.size;
    if (dataSize < 1600) {
      fs.unlinkSync(meta.tempPcmPath);
      return null;
    }

    const pcmData = fs.readFileSync(meta.tempPcmPath);
    let uploadData = null;
    try {
      uploadData = await encodePcmToMp3(pcmData);
    } catch (mp3Err) {
      console.warn('[Yealink SIP] MP3 encode failed, falling back to WAV:', mp3Err.message);
      // Build 44-byte RIFF/WAV header for 8000Hz, 16-bit, Mono PCM
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(8000, 24);
      header.writeUInt32LE(16000, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);
      uploadData = Buffer.concat([header, pcmData]);
    }

    fs.writeFileSync(meta.fullWavPath, uploadData);
    fs.unlinkSync(meta.tempPcmPath);

    let finalUrl = meta.apiPath;
    try {
      const publicId = meta.fileName.replace(/\.(wav|mp3)$/i, '');
      const cloudRes = await uploadBuffer(uploadData, {
        resourceType: 'video',
        folder: `call-recordings/${meta.dateFolder}`,
        publicId,
      });
      if (cloudRes && cloudRes.url) {
        finalUrl = cloudRes.url;
        console.log(`[Yealink SIP] Call recording UPLOADED to Cloud: ${finalUrl}`);
      }
    } catch (cloudErr) {
      console.warn('[Yealink SIP] Cloud upload failed (using local URL fallback):', cloudErr.message);
    }

    session.savedRecordingUrl = finalUrl;
    console.log(`[Yealink SIP] Call recording SAVED: ${meta.fullWavPath} (${(uploadData.length / 1024).toFixed(1)} KB)`);
    return finalUrl;
  } catch (err) {
    console.error('[Yealink SIP] Failed to finalize recording WAV:', err.message);
    try { if (fs.existsSync(meta.tempPcmPath)) fs.unlinkSync(meta.tempPcmPath); } catch (_) {}
    return null;
  }
}

function extractAudioPortAndIp(sdp, defaultIp) {
  if (!sdp) return { port: 0, ip: defaultIp };
  const mMatch = sdp.match(/m=audio\s+(\d+)/i);
  const cMatch = sdp.match(/c=IN\s+IP4\s+([0-9.]+)/i);
  return {
    port: mMatch ? parseInt(mMatch[1], 10) : 0,
    ip: cMatch ? cMatch[1] : defaultIp
  };
}

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

function startIvrPromptStream(session) {
  if (!ivrAudioBuffer || ivrAudioBuffer.length === 0) {
    console.warn('[Yealink SIP Bridge] No IVR audio prompt buffer loaded.');
    return;
  }

  let rtpSeq = Math.floor(Math.random() * 5000);
  let rtpTimestamp = Math.floor(Math.random() * 100000);
  const rtpSsrc = Math.floor(Math.random() * 10000000);
  let audioOffset = 0;

  session.ivrInterval = setInterval(() => {
    if (session.state !== 'IVR') return;
    if (audioOffset + 160 > ivrAudioBuffer.length) {
      audioOffset = 0; // loop prompt until student presses digit
    }
    const chunk = ivrAudioBuffer.slice(audioOffset, audioOffset + 160);
    audioOffset += 160;

    const packet = Buffer.alloc(12 + chunk.length);
    packet[0] = 0x80;
    packet[1] = 8; // PCMA
    packet.writeUInt16BE(rtpSeq++ & 0xFFFF, 2);
    packet.writeUInt32BE(rtpTimestamp >>> 0, 4);
    rtpTimestamp += 160;
    packet.writeUInt32BE(rtpSsrc >>> 0, 8);
    chunk.copy(packet, 12);

    if (session.ylRtpSocket && session.ylRtpRemotePort) {
      session.ylRtpSocket.send(packet, session.ylRtpRemotePort, session.ylRtpRemoteIp);
    }
  }, 20);

  // 15 seconds timeout if student doesn't press any key: default to Option 1 (Father)
  session.ivrTimeout = setTimeout(() => {
    if (session.state === 'IVR') {
      console.log(`[Yealink SIP] IVR timeout (15s) for student ${session.regNo}. Automatically connecting to Option 1.`);
      triggerIvrChoice(session, 1);
    }
  }, 15000);
}

function triggerIvrChoice(session, choiceDigit) {
  if (session.state !== 'IVR') return;
  session.state = 'DIALING_GATEWAY';

  if (session.ivrInterval) {
    clearInterval(session.ivrInterval);
    session.ivrInterval = null;
  }
  if (session.ivrTimeout) {
    clearTimeout(session.ivrTimeout);
    session.ivrTimeout = null;
  }

  const optKey = parseInt(choiceDigit, 10);
  const selectedOption = session.options.find(o => o.key === optKey) || session.options[0];
  if (!selectedOption || !selectedOption.mobile) {
    console.warn(`[Yealink SIP] Reg No ${session.regNo} option ${optKey} has no valid mobile.`);
    endCallSession(session, 'no_number');
    return;
  }

  session.selectedOption = selectedOption;
  session.relation = selectedOption.label || selectedOption.relation;
  session.dialedNumber = selectedOption.mobile;
  session.optionKey = selectedOption.key;

  console.log(`[Yealink SIP] IVR Choice [${choiceDigit}] received! Selected: ${session.relation} (${session.dialedNumber})`);

  // Create Gateway RTP socket for media relay
  session.gwRtpSocket = dgram.createSocket('udp4');
  session.gwRtpSocket.bind(0, () => {
    const gwLocalPort = session.gwRtpSocket.address().port;
    session.gwLocalRtpPort = gwLocalPort;

    session.gwRtpSocket.on('message', (msg, rinfo) => {
      session.gwRtpRemotePort = rinfo.port;
      session.gwRtpRemoteIp = rinfo.address;
      detectAnswerFromGatewayAudio(session, msg);
      pushAudioFrame(session, 'gw', msg);
      if (session.ylRtpSocket && session.ylRtpRemotePort) {
        session.ylRtpSocket.send(msg, session.ylRtpRemotePort, session.ylRtpRemoteIp);
      }
    });

    sendInviteToGateway(session);
  });
}

function sendInviteToGateway(session) {
  const localIp = getLocalIp();
  let cleanDigits = session.dialedNumber.replace(/\D/g, '');
  if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) cleanDigits = cleanDigits.slice(2);
  else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) cleanDigits = cleanDigits.slice(1);
  const dialDigitsForGw = cleanDigits;
  session.gwDialedNumber = dialDigitsForGw;

  const fromTag = Math.floor(Math.random() * 1000000);
  const gwFromHeader = `<sip:8001@${localIp}>;tag=${fromTag}`;
  session.gwFromHeader = gwFromHeader;
  session.gwPlaced = true;

  const gwSdp = 
    `v=0\r\n` +
    `o=- 2001 2001 IN IP4 ${localIp}\r\n` +
    `s=Al-Ameen-Call\r\n` +
    `c=IN IP4 ${localIp}\r\n` +
    `t=0 0\r\n` +
    `m=audio ${session.gwLocalRtpPort} RTP/AVP 8 0 101\r\n` +
    `a=rtpmap:8 PCMA/8000\r\n` +
    `a=rtpmap:0 PCMU/8000\r\n` +
    `a=rtpmap:101 telephone-event/8000\r\n` +
    `a=fmtp:101 0-15\r\n` +
    `a=sendrecv\r\n`;

  const gwInvite = 
    `INVITE sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
    `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
    `From: ${gwFromHeader}\r\n` +
    `To: <sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
    `Call-ID: ${session.gwCallId}\r\n` +
    `CSeq: 1 INVITE\r\n` +
    `Contact: <sip:8001@${localIp}:${SIP_PORT}>\r\n` +
    `User-Agent: Al-Ameen-SIP-Bridge\r\n` +
    `Content-Type: application/sdp\r\n` +
    `Content-Length: ${Buffer.byteLength(gwSdp)}\r\n\r\n` +
    gwSdp;

  serverSocket.send(Buffer.from(gwInvite), GATEWAY_PORT, GATEWAY_IP, (err) => {
    if (err) console.error('[Yealink SIP] Error sending to Gateway:', err.message);
    else console.log(`[Yealink SIP] Routing IVR call to Gateway (${GATEWAY_IP}:${GATEWAY_PORT}) for mobile: ${dialDigitsForGw}`);
  });
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

        if (headers['to']) {
          session.gwToHeader = headers['to'];
        }
        if (headers['contact']) {
          const cMatch = headers['contact'].match(/<([^>]+)>/);
          session.gwContactUri = cMatch ? cMatch[1] : headers['contact'];
        }

        // When 200 OK arrives from Gateway for outgoing call, immediately ACK it so Gateway stops retransmissions
        if (statusCode === 200 && !session.isIncoming) {
          const reqUri = session.gwContactUri || `sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}`;
          const cseqAck = headers['cseq'] ? headers['cseq'].replace('INVITE', 'ACK') : '1 ACK';
          const gwAckImmediate = 
            `ACK ${reqUri} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
            `From: ${session.gwFromHeader || `<sip:8001@${localIp}>`}\r\n` +
            `To: ${session.gwToHeader || headers['to']}\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: ${cseqAck}\r\n` +
            `Max-Forwards: 70\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(gwAckImmediate), GATEWAY_PORT, GATEWAY_IP);
        }

        // In IVR mode, Yealink was pre-answered for the voice menu.
        // Link audio when Gateway sends 180/183/200, and start timer when parent answers
        if (session.isIvr) {
          if (sdpBody) {
            const gwMedia = extractAudioPortAndIp(sdpBody, GATEWAY_IP);
            session.gwRtpRemotePort = gwMedia.port;
            session.gwRtpRemoteIp = gwMedia.ip;
            session.state = 'BRIDGED';
            console.log(`[Yealink SIP] Gateway RTP media linked: ${session.gwRtpRemoteIp}:${session.gwRtpRemotePort}`);
          }

          if (statusCode === 200 && !session.answeredAt) {
            beginWaitingForAnswer(session);
          }

          if (statusCode >= 400 && statusCode !== 401) {
            console.warn(`[Yealink SIP] Gateway call failed with ${statusCode}. Ending call.`);
            endCallSession(session, 'failed_' + statusCode);
          }
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

        let outSdp = sdpBody;
        if (session.isRecordingProxy && sdpBody) {
          const gwMedia = extractAudioPortAndIp(sdpBody, GATEWAY_IP);
          session.gwRtpRemotePort = gwMedia.port;
          session.gwRtpRemoteIp = gwMedia.ip;
          outSdp = rewriteSdpIpAndPort(sdpBody, localIp, session.ylLocalRtpPort);
        }

        if (outSdp) {
          yealinkResp += `Content-Type: application/sdp\r\n`;
          yealinkResp += `Content-Length: ${Buffer.byteLength(outSdp)}\r\n\r\n` + outSdp;
        } else {
          yealinkResp += `Content-Length: 0\r\n\r\n`;
        }

        serverSocket.send(Buffer.from(yealinkResp), session.yealinkRinfo.port, session.yealinkRinfo.address);

        // When call answered (200 OK)
        if (statusCode === 200 && !session.answeredAt) {
          beginWaitingForAnswer(session);
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
    // 2. Handle INFO (DTMF from Yealink during IVR)
    // =========================================================================
    if (method === 'INFO') {
      const callId = headers['call-id'];
      const session = activeSessions.get(callId);
      const okResp = 
        `SIP/2.0 200 OK\r\n` +
        `Via: ${headers['via']}\r\n` +
        `From: ${headers['from']}\r\n` +
        `To: ${headers['to']}\r\n` +
        `Call-ID: ${headers['call-id']}\r\n` +
        `CSeq: ${headers['cseq']}\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(okResp), rinfo.port, rinfo.address);

      if (session && session.state === 'IVR') {
        const bodyToCheck = (sdpBody || msgStr).trim();
        console.log(`[Yealink SIP] SIP INFO received during IVR from ${rinfo.address}:${rinfo.port}. Body:\n${bodyToCheck}`);
        let digit = null;
        const sigMatch = bodyToCheck.match(/Signal\s*[:=]\s*([0-9*#])/i) ||
                         bodyToCheck.match(/<dtmf>([0-9*#])<\/dtmf>/i) ||
                         bodyToCheck.match(/^([1-5])$/m) ||
                         bodyToCheck.match(/\b([1-5])\b/);
        if (sigMatch) {
          digit = sigMatch[1];
        }
        if (digit && ['1', '2', '3', '4', '5'].includes(digit)) {
          console.log(`[Yealink SIP] SIP INFO DTMF parsed successfully: [${digit}]`);
          triggerIvrChoice(session, parseInt(digit, 10));
        }
      }
      return;
    }

    // =========================================================================
    // 3. Handle REGISTER (from Yealink phone or Gateway)
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
        let incomingAllowed = false;
        try {
          if (typeof callingScheduleRouter.getBoothSettings === 'function') {
            const s = await callingScheduleRouter.getBoothSettings();
            incomingAllowed = Boolean(s && s.incoming_calls_enabled);
          } else if (typeof callingScheduleRouter.isIncomingCallsEnabled === 'function') {
            incomingAllowed = callingScheduleRouter.isIncomingCallsEnabled();
          }
        } catch (e) {
          incomingAllowed = typeof callingScheduleRouter.isIncomingCallsEnabled === 'function'
            ? callingScheduleRouter.isIncomingCallsEnabled()
            : false;
        }

        if (!incomingAllowed) {
          console.log(`[Yealink SIP] Incoming call from BSNL SIM REJECTED (Incoming Calls: OFF in Settings). Responding 486 Busy Here to Gateway.`);
          const busy = 
            `SIP/2.0 486 Busy Here\r\n` +
            `Via: ${headers['via']}\r\n` +
            `From: ${headers['from']}\r\n` +
            `To: ${headers['to']};tag=${Math.floor(Math.random() * 1000000)}\r\n` +
            `Call-ID: ${headers['call-id']}\r\n` +
            `CSeq: ${headers['cseq']}\r\n` +
            `Reason: Q.850;cause=17;text="User Busy"\r\n` +
            `Server: Al-Ameen-IPBX\r\n` +
            `Content-Length: 0\r\n\r\n`;
          serverSocket.send(Buffer.from(busy), rinfo.port, rinfo.address);
          return;
        }

        console.log(`[Yealink SIP] Incoming call from BSNL SIM ALLOWED (Incoming Calls: ON in Settings)! Forwarding to Yealink phone (${lastYealinkRinfo.address}:${lastYealinkRinfo.port})...`);
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
      let selectedOptionKey = null;
      let timeLimitSeconds = 480; // 8 minutes default

      try {
        let cleanDialed = String(dialedNumber || '').trim();
        let parsedRegNo = null;
        let requestedOptionKey = null;

        // Pattern A: Delimited with * or #, e.g. "62910*1", "62910#2", "*62910*3#"
        const delimMatch = cleanDialed.match(/^\*?(\d{4,7})[*#](\d)#?$/);
        if (delimMatch) {
          parsedRegNo = delimMatch[1];
          requestedOptionKey = parseInt(delimMatch[2], 10);
        }

        if (parsedRegNo) {
          const stuRes = await pool.query(
            `SELECT id, registration_no, student_name, class_name, guardian_mobile, mother_mobile, father_mobile 
             FROM students 
             WHERE registration_no = $1 AND is_active = TRUE LIMIT 1`,
            [parsedRegNo]
          );
          if (stuRes.rowCount) {
            student = stuRes.rows[0];
          }
        } else if (/^\d{4,7}$/.test(cleanDialed)) {
          // Direct exact match (e.g. 5-digit reg "62910" or 4-digit reg "7427")
          const directRes = await pool.query(
            `SELECT id, registration_no, student_name, class_name, guardian_mobile, mother_mobile, father_mobile 
             FROM students 
             WHERE registration_no = $1 AND is_active = TRUE LIMIT 1`,
            [cleanDialed]
          );

          if (directRes.rowCount && cleanDialed.length >= 5) {
            student = directRes.rows[0];
            requestedOptionKey = null; // Default option
          } else if (!directRes.rowCount && cleanDialed.length >= 5) {
            // Suffix match: e.g. "629101" -> reg "62910" + option 1
            const lastChar = cleanDialed.slice(-1);
            const prefix = cleanDialed.slice(0, -1);
            if (['1', '2', '3', '4', '5'].includes(lastChar)) {
              const suffixRes = await pool.query(
                `SELECT id, registration_no, student_name, class_name, guardian_mobile, mother_mobile, father_mobile 
                 FROM students 
                 WHERE registration_no = $1 AND is_active = TRUE LIMIT 1`,
                [prefix]
              );
              if (suffixRes.rowCount) {
                student = suffixRes.rows[0];
                requestedOptionKey = parseInt(lastChar, 10);
              }
            }
          } else if (directRes.rowCount) {
            student = directRes.rows[0];
            requestedOptionKey = null;
          }
        }

        if (student) {
          // Check schedule & weekly quota
          const check = await checkStudentCallingSchedule(student.id, student.registration_no);
          if (!check.allowed) {
            console.warn(`[Yealink SIP] Call blocked for student ${student.registration_no} (${student.student_name}): ${check.message}`);
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

          if (requestedOptionKey === null) {
            // Student dialed 5-digit Registration Number -> Start IVR Voice Menu!
            console.log(`[Yealink SIP] Reg No ${student.registration_no} (${student.student_name}) entered IVR mode. Starting voice prompt...`);

            const gwCallId = `gw-${headers['call-id']}`;
            const ylMedia = extractAudioPortAndIp(sdpBody, rinfo.address);

            // Parse offered telephone-event payload type from Yealink SDP
            let yealinkDtmfPt = 101;
            const dtmfMatch = sdpBody ? sdpBody.match(/a=rtpmap:(\d+)\s+telephone-event/i) : null;
            if (dtmfMatch) {
              yealinkDtmfPt = parseInt(dtmfMatch[1], 10);
            }
            console.log(`[Yealink SIP] Yealink offered DTMF telephone-event payload type: ${yealinkDtmfPt}`);

            const session = {
              yealinkRinfo: rinfo,
              yealinkCallId: headers['call-id'],
              yealinkHeaders: headers,
              ylToTag: Math.floor(Math.random() * 1000000),
              gwCallId: gwCallId,
              dialedNumber: student.registration_no,
              studentId: student.id,
              studentName: student.student_name,
              regNo: student.registration_no,
              className: student.class_name,
              relation: 'Pending Selection',
              optionKey: null,
              options: options,
              timeLimitSeconds: timeLimitSeconds,
              dtmfPayloadType: yealinkDtmfPt,
              sdpBody: sdpBody,
              authRetried: false,
              startedAt: new Date(),
              answeredAt: null,
              timer: null,
              isIvr: true,
              state: 'IVR',
              ylRtpRemotePort: ylMedia.port,
              ylRtpRemoteIp: ylMedia.ip
            };

            activeSessions.set(headers['call-id'], session);
            activeSessions.set(gwCallId, session);

            // Bind local Yealink RTP socket
            session.ylRtpSocket = dgram.createSocket('udp4');
            session.ylRtpSocket.bind(0, () => {
              const ylLocalPort = session.ylRtpSocket.address().port;
              session.ylLocalRtpPort = ylLocalPort;

              session.ylRtpSocket.on('message', (msg, remoteRinfo) => {
                session.ylRtpRemotePort = remoteRinfo.port;
                session.ylRtpRemoteIp = remoteRinfo.address;

                if (session.state === 'IVR') {
                  const pt = msg[1] & 0x7F;

                  // 1. Check RFC 2833 telephone-event DTMF
                  const isRfc2833 = (pt === session.dtmfPayloadType) || (pt === 101) || (pt >= 96 && pt <= 127 && msg.length <= 24);
                  if (isRfc2833 && msg.length >= 16) {
                    const event = msg[12];
                    console.log(`[Yealink SIP] RFC 2833 DTMF received: event=${event}, pt=${pt}, len=${msg.length}`);
                    if (event >= 1 && event <= 5) {
                      triggerIvrChoice(session, event);
                      return;
                    }
                  }

                  // 2. Check In-band Audio DTMF (G.711 PCMA pt=8 or PCMU pt=0)
                  if ((pt === 8 || pt === 0) && msg.length >= 172) {
                    const audioPayload = msg.subarray(12, 172);
                    const detected = detectDtmfAudio(audioPayload, pt === 0 ? 'mulaw' : 'alaw');
                    if (detected) {
                      console.log(`[Yealink SIP] In-band Audio DTMF detected! Key: [${detected}]`);
                      if (['1', '2', '3', '4', '5'].includes(detected)) {
                        triggerIvrChoice(session, parseInt(detected, 10));
                        return;
                      }
                    }
                  }
                } else if (session.state === 'BRIDGED') {
                  pushAudioFrame(session, 'yl', msg);
                  if (session.gwRtpSocket && session.gwRtpRemotePort) {
                    session.gwRtpSocket.send(msg, session.gwRtpRemotePort, session.gwRtpRemoteIp);
                  }
                }
              });

              // Send 200 OK to Yealink to establish audio
              const ylSdp = 
                `v=0\r\n` +
                `o=- 1001 1001 IN IP4 ${localIp}\r\n` +
                `s=Al-Ameen-IVR\r\n` +
                `c=IN IP4 ${localIp}\r\n` +
                `t=0 0\r\n` +
                `m=audio ${ylLocalPort} RTP/AVP 8 0 ${session.dtmfPayloadType}\r\n` +
                `a=rtpmap:8 PCMA/8000\r\n` +
                `a=rtpmap:0 PCMU/8000\r\n` +
                `a=rtpmap:${session.dtmfPayloadType} telephone-event/8000\r\n` +
                `a=fmtp:${session.dtmfPayloadType} 0-15\r\n` +
                `a=sendrecv\r\n`;

              const ylOk = 
                `SIP/2.0 200 OK\r\n` +
                `Via: ${headers['via']}\r\n` +
                `From: ${headers['from']}\r\n` +
                `To: ${headers['to']};tag=${session.ylToTag}\r\n` +
                `Call-ID: ${headers['call-id']}\r\n` +
                `CSeq: ${headers['cseq']}\r\n` +
                `Contact: <sip:8001@${localIp}:${SIP_PORT}>\r\n` +
                `User-Agent: Al-Ameen-SIP-Bridge\r\n` +
                `Content-Type: application/sdp\r\n` +
                `Content-Length: ${Buffer.byteLength(ylSdp)}\r\n\r\n` +
                ylSdp;

              serverSocket.send(Buffer.from(ylOk), rinfo.port, rinfo.address);

              // Start streaming IVR voice prompt
              startIvrPromptStream(session);
            });

            return;
          }

          let selectedOption = null;
          if (requestedOptionKey) {
            selectedOption = options.find(o => o.key === requestedOptionKey);
            if (!selectedOption) {
              console.warn(`[Yealink SIP] Reg No ${student.registration_no} requested Option ${requestedOptionKey}, but not configured. Falling back.`);
              selectedOption = options.find(o => o.key === 1) || options.find(o => o.key === 2) || options[0];
            }
          }

          if (selectedOption && selectedOption.mobile) {
            mobileToCall = selectedOption.mobile;
            selectedOptionKey = selectedOption.key;
            chosenRelation = selectedOption.label || selectedOption.relation || `Guardian ${selectedOption.key}`;
            console.log(`[Yealink SIP] Reg No ${student.registration_no} (${student.student_name}) [Dial ${selectedOption.key}: ${chosenRelation}] resolved to: ${mobileToCall}`);
          }
        }
      } catch (err) {
        console.error('[Yealink SIP] Student lookup error:', err.message);
      }

      // Security Policy: Direct mobile number dialing is strictly disabled!
      // Only active student registration numbers (with optional guardian key 1-5) are allowed.
      if (!student) {
        console.warn(`[Yealink SIP] Call BLOCKED: "${dialedNumber}" is not a registered student. Direct mobile dialing is disabled.`);
        const tag = Math.floor(Math.random() * 1000000);
        const forbidden = 
          `SIP/2.0 403 Forbidden\r\n` +
          `Via: ${headers['via']}\r\n` +
          `From: ${headers['from']}\r\n` +
          `To: ${headers['to']};tag=${tag}\r\n` +
          `Call-ID: ${headers['call-id']}\r\n` +
          `CSeq: ${headers['cseq']}\r\n` +
          `Reason: SIP;cause=403;text="${encodeURIComponent('সরাসরি মোবাইল নম্বরে কল করা নিষেধ। অনুগ্রহ করে ৫ ডিজিটের রেজিস্ট্রেশন নম্বর ডায়াল করুন।')}"\r\n` +
          `Content-Length: 0\r\n\r\n`;
        serverSocket.send(Buffer.from(forbidden), rinfo.port, rinfo.address);
        return;
      }

      if (!selectedOptionKey || !mobileToCall || mobileToCall === dialedNumber) {
        console.warn(`[Yealink SIP] No guardian mobile number found for student ${student.registration_no} (${student.student_name})`);
        const tag = Math.floor(Math.random() * 1000000);
        const notFound = 
          `SIP/2.0 404 Not Found\r\n` +
          `Via: ${headers['via']}\r\n` +
          `From: ${headers['from']}\r\n` +
          `To: ${headers['to']};tag=${tag}\r\n` +
          `Call-ID: ${headers['call-id']}\r\n` +
          `CSeq: ${headers['cseq']}\r\n` +
          `Reason: SIP;cause=404;text="${encodeURIComponent('এই ছাত্রের কোনো অভিভাবকের মোবাইল নম্বর যুক্ত নেই।')}"\r\n` +
          `Content-Length: 0\r\n\r\n`;
        serverSocket.send(Buffer.from(notFound), rinfo.port, rinfo.address);
        return;
      }

      // Format mobile number: 10 digits
      let cleanDigits = mobileToCall.replace(/\D/g, '');
      if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
        cleanDigits = cleanDigits.slice(2);
      } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
        cleanDigits = cleanDigits.slice(1);
      }

      if (!cleanDigits || cleanDigits.length < 10) {
        console.warn(`[Yealink SIP] Invalid guardian mobile number: "${mobileToCall}" for student ${student.registration_no}`);
        const tag = Math.floor(Math.random() * 1000000);
        const badNum = 
          `SIP/2.0 404 Not Found\r\n` +
          `Via: ${headers['via']}\r\n` +
          `From: ${headers['from']}\r\n` +
          `To: ${headers['to']};tag=${tag}\r\n` +
          `Call-ID: ${headers['call-id']}\r\n` +
          `CSeq: ${headers['cseq']}\r\n` +
          `Reason: SIP;cause=404;text="${encodeURIComponent('অভিভাবকের মোবাইল নম্বরটি সঠিক নয়।')}"\r\n` +
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
        optionKey: selectedOptionKey,
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
      
      const fromTag = Math.floor(Math.random() * 1000000);
      const gwFromHeader = `<sip:8001@${localIp}>;tag=${fromTag}`;
      session.gwFromHeader = gwFromHeader;
      session.gwPlaced = true;

      const sendDirectGwInvite = (inviteSdp) => {
        session.sdpBody = inviteSdp;
        const gwInvite = 
          `INVITE sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT} SIP/2.0\r\n` +
          `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
          `From: ${gwFromHeader}\r\n` +
          `To: <sip:${dialDigitsForGw}@${GATEWAY_IP}:${GATEWAY_PORT}>\r\n` +
          `Call-ID: ${gwCallId}\r\n` +
          `CSeq: 1 INVITE\r\n` +
          `Contact: <sip:8001@${localIp}:${SIP_PORT}>\r\n` +
          `User-Agent: Al-Ameen-SIP-Bridge\r\n` +
          `Content-Type: application/sdp\r\n` +
          `Content-Length: ${Buffer.byteLength(inviteSdp)}\r\n\r\n` +
          inviteSdp;

        serverSocket.send(Buffer.from(gwInvite), GATEWAY_PORT, GATEWAY_IP, (err) => {
          if (err) console.error('[Yealink SIP] Error sending to Gateway:', err.message);
          else console.log(`[Yealink SIP] Successfully sent INVITE to ${GATEWAY_IP}:${GATEWAY_PORT}`);
        });
      };

      if (sdpBody) {
        session.isRecordingProxy = true;
        const ylMedia = extractAudioPortAndIp(sdpBody, rinfo.address);
        session.ylRtpRemoteIp = ylMedia.ip;
        session.ylRtpRemotePort = ylMedia.port;

        session.ylRtpSocket = dgram.createSocket('udp4');
        session.gwRtpSocket = dgram.createSocket('udp4');

        session.ylRtpSocket.bind(0, () => {
          session.ylLocalRtpPort = session.ylRtpSocket.address().port;
          session.ylRtpSocket.on('message', (msg, remoteRinfo) => {
            session.ylRtpRemotePort = remoteRinfo.port;
            session.ylRtpRemoteIp = remoteRinfo.address;
            pushAudioFrame(session, 'yl', msg);
            if (session.gwRtpSocket && session.gwRtpRemotePort) {
              session.gwRtpSocket.send(msg, session.gwRtpRemotePort, session.gwRtpRemoteIp);
            }
          });

          session.gwRtpSocket.bind(0, () => {
            session.gwLocalRtpPort = session.gwRtpSocket.address().port;
            session.gwRtpSocket.on('message', (msg, remoteRinfo) => {
              session.gwRtpRemotePort = remoteRinfo.port;
              session.gwRtpRemoteIp = remoteRinfo.address;
              detectAnswerFromGatewayAudio(session, msg);
              pushAudioFrame(session, 'gw', msg);
              if (session.ylRtpSocket && session.ylRtpRemotePort) {
                session.ylRtpSocket.send(msg, session.ylRtpRemotePort, session.ylRtpRemoteIp);
              }
            });

            const proxiedSdp = rewriteSdpIpAndPort(sdpBody, localIp, session.gwLocalRtpPort);
            sendDirectGwInvite(proxiedSdp);
          });
        });
      } else {
        sendDirectGwInvite(sdpBody);
      }
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
          const reqUri = session.gwContactUri || `sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}`;
          const toHeader = session.gwToHeader || `<sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}>`;
          const cseqAck = session.gwCSeq ? session.gwCSeq.replace('INVITE', 'ACK') : '1 ACK';
          const gwAck = 
            `ACK ${reqUri} SIP/2.0\r\n` +
            `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
            `From: ${session.gwFromHeader || `<sip:8001@${localIp}>`}\r\n` +
            `To: ${toHeader}\r\n` +
            `Call-ID: ${session.gwCallId}\r\n` +
            `CSeq: ${cseqAck}\r\n` +
            `Max-Forwards: 70\r\n` +
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
  if (session.answerFallbackTimer) clearTimeout(session.answerFallbackTimer);
  if (session.ivrInterval) clearInterval(session.ivrInterval);
  if (session.ivrTimeout) clearTimeout(session.ivrTimeout);

  const localIp = getLocalIp();

  // Send BYE to Gateway if placed
  try {
    if (session.gwPlaced) {
      const gwReqUri = session.gwContactUri || `sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}:${GATEWAY_PORT}`;
      const gwBye = 
        `BYE ${gwReqUri} SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
        `From: ${session.gwFromHeader || `<sip:8001@${localIp}>`}\r\n` +
        `To: ${session.gwToHeader || `<sip:${session.gwDialedNumber || session.dialedNumber}@${GATEWAY_IP}>`}\r\n` +
        `Call-ID: ${session.gwCallId}\r\n` +
        `CSeq: 10 BYE\r\n` +
        `Max-Forwards: 70\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(gwBye), GATEWAY_PORT, GATEWAY_IP);
    }
  } catch (_) {}

  // Send BYE to Yealink if call was answered, in IVR, or Gateway already sent 200 OK
  try {
    if ((session.answeredAt || session.isIvr || session.gw200Received) && session.yealinkRinfo && session.yealinkHeaders) {
      const ylReqUri = session.yealinkHeaders['contact'] 
        ? (session.yealinkHeaders['contact'].match(/<([^>]+)>/)?.[1] || session.yealinkHeaders['contact'])
        : `sip:101@${session.yealinkRinfo.address}:${session.yealinkRinfo.port}`;
      const ylFrom = `${session.yealinkHeaders['to']};tag=${session.ylToTag}`;
      const ylTo = session.yealinkHeaders['from'];
      const ylBye = 
        `BYE ${ylReqUri} SIP/2.0\r\n` +
        `Via: SIP/2.0/UDP ${localIp}:${SIP_PORT};branch=z9hG4bK${Math.floor(Math.random() * 1000000)}\r\n` +
        `From: ${ylFrom}\r\n` +
        `To: ${ylTo}\r\n` +
        `Call-ID: ${session.yealinkCallId}\r\n` +
        `CSeq: 10 BYE\r\n` +
        `Max-Forwards: 70\r\n` +
        `Content-Length: 0\r\n\r\n`;
      serverSocket.send(Buffer.from(ylBye), session.yealinkRinfo.port, session.yealinkRinfo.address);
    }
  } catch (_) {}

  cleanupSession(session, reason);
}

async function cleanupSession(session, reason) {
  if (session.timer) clearTimeout(session.timer);
  if (session.answerFallbackTimer) clearTimeout(session.answerFallbackTimer);
  if (session.ivrInterval) clearInterval(session.ivrInterval);
  if (session.ivrTimeout) clearTimeout(session.ivrTimeout);

  if (session.ylRtpSocket) {
    try { session.ylRtpSocket.close(); } catch(e){}
    session.ylRtpSocket = null;
  }
  if (session.gwRtpSocket) {
    try { session.gwRtpSocket.close(); } catch(e){}
    session.gwRtpSocket = null;
  }

  activeSessions.delete(session.yealinkCallId);
  activeSessions.delete(session.gwCallId);

  // Finalize call recording (if active) before saving log
  const recordingUrl = await finalizeCallRecording(session);

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
         sim_slot, gateway_type, recording_url, notes, started_at, ended_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
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
        recordingUrl,
        `Ended via ${reason}${session.optionKey ? ` (Dial ${session.optionKey})` : ''}`,
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
