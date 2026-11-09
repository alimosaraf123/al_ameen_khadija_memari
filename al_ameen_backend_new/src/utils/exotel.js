const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function getExotelConfig() {
  const apiKey = (process.env.EXOTEL_API_KEY || '').trim();
  const apiToken = (process.env.EXOTEL_API_TOKEN || '').trim();
  const accountSid = (process.env.EXOTEL_ACCOUNT_SID || '').trim();
  const callerId = (process.env.EXOTEL_CALLER_ID || '').trim().replace(/[-\s]/g, '');
  const subdomain = (process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com').trim();

  if (!apiKey || !apiToken || !accountSid || !callerId) {
    throw new Error('Exotel credentials are not fully configured in environment variables');
  }

  return { apiKey, apiToken, accountSid, callerId, subdomain };
}

/**
 * Standardize Indian phone number to 0XXXXXXXXXX or +91XXXXXXXXXX
 * Exotel requires either '0' prefix or '+91' prefix for Indian 10-digit mobile numbers.
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  
  if (digits.length === 10) {
    return '0' + digits;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return '0' + digits.slice(2);
  }
  
  // Return cleaned digits if other format
  return digits;
}

/**
 * Initiate Click-To-Call (Connect Two Numbers)
 * @param {Object} options
 * @param {string} options.from - First number to dial (Agent / Staff / Teacher)
 * @param {string} options.to - Second number to dial (Parent / Guardian)
 * @param {string} [options.callbackUrl] - Webhook callback URL
 * @param {boolean} [options.record=true] - Enable call recording
 * @param {number} [options.timeLimit] - Max duration of call in seconds
 * @param {number} [options.timeOut] - Ring timeout in seconds
 */
async function initiateCall({ from, to, callbackUrl, record = true, timeLimit, timeOut }) {
  const { apiKey, apiToken, accountSid, callerId, subdomain } = getExotelConfig();

  const formattedFrom = normalizePhoneNumber(from);
  const formattedTo = normalizePhoneNumber(to);

  if (!formattedFrom || formattedFrom.length < 10) {
    throw new Error(`Invalid 'From' phone number: ${from}`);
  }
  if (!formattedTo || formattedTo.length < 10) {
    throw new Error(`Invalid 'To' phone number: ${to}`);
  }

  const endpoint = `https://${subdomain}/v1/Accounts/${accountSid}/Calls/connect.json`;

  const params = new URLSearchParams({
    From: formattedFrom,
    To: formattedTo,
    CallerId: callerId,
    Record: record ? 'true' : 'false'
  });

  if (callbackUrl) {
    params.append('StatusCallback', callbackUrl);
    params.append('StatusCallbackContentType', 'application/json');
  }
  if (timeLimit && Number(timeLimit) > 0) {
    params.append('TimeLimit', String(timeLimit));
  }
  if (timeOut && Number(timeOut) > 0) {
    params.append('TimeOut', String(timeOut));
  }

  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  const rawText = await response.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { raw: rawText };
  }

  if (!response.ok) {
    const errorMsg = data?.RestException?.Message || data?.message || `Exotel API error (HTTP ${response.status})`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  const callInfo = data.Call || {};
  return {
    callSid: callInfo.Sid,
    status: callInfo.Status,
    dateCreated: callInfo.DateCreated,
    from: callInfo.From,
    to: callInfo.To,
    callerId: callInfo.PhoneNumberSid || callerId,
    raw: data
  };
}

/**
 * Fetch Call Details and Recording URL from Exotel
 * @param {string} callSid
 */
async function fetchCallDetails(callSid) {
  if (!callSid) throw new Error('Call SID is required');
  const { apiKey, apiToken, accountSid, subdomain } = getExotelConfig();

  const endpoint = `https://${subdomain}/v1/Accounts/${accountSid}/Calls/${callSid}.json`;
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': authHeader
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.RestException?.Message || `Failed to fetch call details for ${callSid}`);
  }

  const call = data.Call || {};
  return {
    callSid: call.Sid,
    status: call.Status,
    duration: call.Duration ? parseInt(call.Duration, 10) : 0,
    recordingUrl: call.RecordingUrl || null,
    startTime: call.StartTime,
    endTime: call.EndTime,
    raw: data
  };
}

module.exports = {
  getExotelConfig,
  normalizePhoneNumber,
  initiateCall,
  fetchCallDetails
};

