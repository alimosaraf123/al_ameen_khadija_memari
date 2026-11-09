const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiKey = (process.env.EXOTEL_API_KEY || '').trim();
const apiToken = (process.env.EXOTEL_API_TOKEN || '').trim();
const accountSid = (process.env.EXOTEL_ACCOUNT_SID || '').trim();
const callerId = (process.env.EXOTEL_CALLER_ID || '').trim().replace(/[-\s]/g, '');
const subdomain = (process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com').trim();

console.log('=== Checking Exotel Configuration ===');
console.log('Account SID:', accountSid);
console.log('API Key:', apiKey ? apiKey.substring(0, 6) + '...' : 'NOT SET');
console.log('Caller ID (Sanitized):', callerId);
console.log('Subdomain:', subdomain);

async function checkAccount(sub) {
  const url = `https://${sub}/v1/Accounts/${accountSid}.json`;
  const auth = 'Basic ' + Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
  try {
    const res = await fetch(url, { headers: { 'Authorization': auth } });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

async function run() {
  console.log('\n1. Testing authentication with subdomain:', subdomain);
  let res = await checkAccount(subdomain);
  console.log(`Response status (${subdomain}):`, res.status);
  
  if (!res.ok && subdomain === 'api.exotel.com') {
    console.log('\nTrying alternate subdomain: api.in.exotel.com...');
    const altRes = await checkAccount('api.in.exotel.com');
    console.log('Response status (api.in.exotel.com):', altRes.status);
    if (altRes.ok) {
      console.log('==> Note: Your account belongs to api.in.exotel.com');
      res = altRes;
    }
  }

  try {
    const parsed = JSON.parse(res.body);
    console.log('Response Details:', JSON.stringify(parsed, null, 2));
  } catch {
    console.log('Raw Response:', res.body || res.error);
  }
}

run();
