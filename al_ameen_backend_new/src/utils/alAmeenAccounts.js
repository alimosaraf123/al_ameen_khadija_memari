const pool = require('../db');

const ACCOUNTS_BASE_URL = 'https://alameenmission.net/alameen/accounts/';
const FEES_REPORT_URL = 'https://alameenmission.net/alameen/accounts/?action=fees_report';
const LOGIN_SUBMIT_URL = 'https://alameenmission.net/alameen/accounts/index.php';
const MEMARI_BRANCH_ID = '94';

let memoryCookie = null;

async function getSetting(key) {
  try {
    const res = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key = $1 LIMIT 1', [key]);
    if (res.rows.length && res.rows[0].setting_value) {
      return res.rows[0].setting_value.trim();
    }
  } catch (err) {
    // fallback
  }
  return null;
}

async function setSetting(key, value) {
  try {
    const up = await pool.query('UPDATE app_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2', [value, key]);
    if (up.rowCount === 0) {
      await pool.query('INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, NOW())', [key, value]);
    }
  } catch (err) {
    console.error('Failed to save setting:', key, err.message);
  }
}

async function getPortalCredentials() {
  const portalUrl = (await getSetting('alameen_accounts_portal_url')) || process.env.ALAMEEN_ACCOUNTS_URL || FEES_REPORT_URL;
  const username = (await getSetting('alameen_accounts_username')) || process.env.ALAMEEN_ACCOUNTS_USERNAME || process.env.ALAMEEN_ACCOUNTS_EMAIL || 'mosaraf';
  const password = (await getSetting('alameen_accounts_password')) || process.env.ALAMEEN_ACCOUNTS_PASSWORD || 'Mahmud#007$';
  const cookie = memoryCookie || (await getSetting('alameen_accounts_cookie')) || process.env.ALAMEEN_ACCOUNTS_COOKIE || '';
  return { portalUrl, username, password, cookie };
}

async function savePortalCredentials({ portalUrl, username, password, cookie }) {
  if (portalUrl !== undefined) await setSetting('alameen_accounts_portal_url', String(portalUrl).trim() || '');
  if (username !== undefined) await setSetting('alameen_accounts_username', username || '');
  if (password !== undefined) await setSetting('alameen_accounts_password', password || '');
  if (cookie !== undefined) {
    memoryCookie = cookie || null;
    await setSetting('alameen_accounts_cookie', cookie || '');
  }
}

function extractCookie(responseHeaders) {
  const setCookieHeader = responseHeaders.get ? responseHeaders.get('set-cookie') : responseHeaders['set-cookie'];
  if (!setCookieHeader) return null;
  const match = String(setCookieHeader).match(/PHPSESSID=([^;,\s]+)/);
  return match ? match[1] : null;
}

async function loginToPortal(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '').trim();
  if (!user || !pass) {
    throw new Error('Al-Ameen Accounts username and password are required.');
  }

  const bodyParams = new URLSearchParams();
  bodyParams.set('action', 'log_in_submit');
  bodyParams.set('email', user);
  bodyParams.set('password', pass);

  const res = await fetch(LOGIN_SUBMIT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': ACCOUNTS_BASE_URL + '?action=log_in',
    },
    body: bodyParams.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });

  const rawHeaders = res.headers;
  const phpsessid = extractCookie(rawHeaders);
  const text = await res.text();

  if (text.includes('Invalid email or password') || text.includes('wrongemail')) {
    throw new Error('Invalid email/username or password for Al-Ameen Accounts.');
  }

  if (phpsessid) {
    memoryCookie = phpsessid;
    await setSetting('alameen_accounts_cookie', phpsessid);
    return phpsessid;
  }

  const existing = await getSetting('alameen_accounts_cookie');
  if (existing) {
    memoryCookie = existing;
    return existing;
  }

  throw new Error('Could not establish session cookie from Al-Ameen Accounts login.');
}

function cleanText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8377;/gi, '₹')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFeesTable(html) {
  const tableMatch = html.match(/<table[^>]*id=["']fee_report["'][\s\S]*?<\/table>/i) || html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return { rows: [] };
  }

  const tableHtml = tableMatch[0];

  // Column headers
  const theadMatch = tableHtml.match(/<thead[\s\S]*?<\/thead>/i);
  const headerSection = theadMatch ? theadMatch[0] : tableHtml;
  const thMatches = [...headerSection.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)];
  const headers = thMatches.map(m => cleanText(m[1]));

  let totalColIdx = 52;
  headers.forEach((h, idx) => {
    if (/total\s*amount/i.test(h)) {
      totalColIdx = idx;
    }
  });

  // Extract all rows
  const rowMatches = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parsedBills = [];

  for (const r of rowMatches) {
    const tdMatches = [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (!tdMatches.length || tdMatches.length < 8) continue;

    const cells = tdMatches.map(m => cleanText(m[1]));
    const rowText = cells.join(' ').toLowerCase();

    // Skip summary footer rows
    if (rowText.includes('day total') || rowText.includes('monthly total') || rowText.includes('total amount')) {
      continue;
    }

    const dateStr = (cells[0] || '').trim();
    const billNo = (cells[1] || '').trim();
    const rawMode = (cells[2] || '').trim();
    const regNo = (cells[3] || '').trim();
    const studentName = (cells[4] || '').trim();
    const fatherName = (cells[5] || '').trim();
    const branch = (cells[6] || '').trim();
    const className = (cells[7] || '').trim();

    // A valid bill must have a numeric bill number and valid regNo
    if (!billNo || billNo === '0' || !/^\d+$/.test(billNo)) continue;
    if (regNo === '0' && studentName === '0') continue;

    // Amount from column 52 (Total Amount)
    let amount = 0;
    if (cells.length > totalColIdx && cells[totalColIdx]) {
      const parsed = parseFloat(cells[totalColIdx].replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed)) amount = parsed;
    }

    // Fallback if cell 52 was 0, sum fee columns from index 8 onwards
    if (amount === 0) {
      for (let i = 8; i < Math.min(cells.length, 52); i++) {
        const val = parseFloat(cells[i].replace(/[^0-9.]/g, ''));
        if (!isNaN(val) && val > 0) amount += val;
      }
    }

    // "cash hole cash r cash cahra ja thakbe sob online hobe"
    const isCash = rawMode.toLowerCase().includes('cash');
    const paymentMode = isCash ? 'cash' : 'online';

    // Format date as YYYY-MM-DD
    let formattedDate = dateStr;
    const dMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dMatch) {
      formattedDate = `${dMatch[3]}-${dMatch[1].padStart(2, '0')}-${dMatch[2].padStart(2, '0')}`;
    }

    parsedBills.push({
      id: billNo,
      bill_number: billNo,
      transaction_date: formattedDate,
      raw_date: dateStr,
      payment_mode: paymentMode,
      raw_payment_mode: rawMode,
      registration_no: regNo,
      student_name: studentName,
      father_name: fatherName,
      branch_name: branch || 'Memari',
      class_name: className,
      amount: Number(amount.toFixed(2)),
      details: rawMode,
    });
  }

  return { rows: parsedBills };
}

async function fetchPortalPage(url, method = 'POST', body = null, cookie = '') {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': FEES_REPORT_URL,
  };
  if (cookie) headers['Cookie'] = `PHPSESSID=${cookie}`;
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const res = await fetch(url, {
    method,
    headers,
    body: body ? body.toString() : undefined,
    redirect: 'follow',
    signal: AbortSignal.timeout(60000),
  });

  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function ensureValidCookie() {
  const creds = await getPortalCredentials();
  let cookie = creds.cookie;

  if (cookie) {
    try {
      const testRes = await fetchPortalPage(FEES_REPORT_URL, 'GET', null, cookie);
      if (!testRes.text.includes('id="login_form"') && !testRes.text.includes('Administrator Login')) {
        return cookie;
      }
    } catch {
      // test failed
    }
  }

  // Attempt login with username & password
  if (creds.username && creds.password) {
    cookie = await loginToPortal(creds.username, creds.password);
    return cookie;
  }

  throw new Error('Al-Ameen Accounts credentials or valid session cookie required.');
}

// In-memory cache for past dates
const chunkCache = new Map();
const reportCache = new Map();

const pad = n => String(n).padStart(2, '0');
const toYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

function daysBetween(d1, d2) {
  const [y1, m1, day1] = d1.split('-').map(Number);
  const [y2, m2, day2] = d2.split('-').map(Number);
  const diff = new Date(y2, m2 - 1, day2) - new Date(y1, m1 - 1, day1);
  return Math.round(diff / (1000 * 60 * 60 * 24)) + 1;
}

function splitDateRange(sdate, edate, maxDays = 5) {
  const chunks = [];
  const [sy, sm, sd] = sdate.split('-').map(Number);
  const [ey, em, ed] = edate.split('-').map(Number);
  let curr = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (curr <= end) {
    const chunkEnd = new Date(curr);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ sdate: toYmd(curr), edate: toYmd(chunkEnd) });
    curr = new Date(chunkEnd);
    curr.setDate(curr.getDate() + 1);
  }
  return chunks;
}

async function querySingleSessionChunk(sessionYear, sdate, edate, cookie) {
  const today = toYmd(new Date());
  const cacheKey = `${sessionYear}_${sdate}_${edate}_${MEMARI_BRANCH_ID}`;
  if (edate < today && chunkCache.has(cacheKey)) {
    return chunkCache.get(cacheKey);
  }

  const formBody = new URLSearchParams();
  formBody.set('sdate', sdate);
  formBody.set('edate', edate);
  formBody.set('session_year', sessionYear);
  formBody.set('branch_id', MEMARI_BRANCH_ID);
  formBody.set('search', 'Search');

  let res = await fetchPortalPage(FEES_REPORT_URL, 'POST', formBody, cookie);

  if (res.text.includes('id="login_form"') || res.text.includes('Administrator Login')) {
    const creds = await getPortalCredentials();
    const newCookie = await loginToPortal(creds.username, creds.password);
    res = await fetchPortalPage(FEES_REPORT_URL, 'POST', formBody, newCookie);
  }

  const { rows } = parseFeesTable(res.text);
  const result = rows.map(r => ({ ...r, session: sessionYear }));

  if (edate < today) {
    chunkCache.set(cacheKey, result);
  }

  return result;
}

async function querySessionBills(sessionYear, sdate, edate, cookie) {
  const days = daysBetween(sdate, edate);
  if (days <= 5) {
    return querySingleSessionChunk(sessionYear, sdate, edate, cookie);
  }

  const chunks = splitDateRange(sdate, edate, 5);
  const chunkResults = [];

  for (let i = 0; i < chunks.length; i += 2) {
    const batch = chunks.slice(i, i + 2);
    const batchRes = await Promise.all(
      batch.map(ch => querySingleSessionChunk(sessionYear, ch.sdate, ch.edate, cookie).catch(err => {
        console.error(`Error querying chunk ${ch.sdate} to ${ch.edate} for session ${sessionYear}:`, err.message);
        return [];
      }))
    );
    for (const res of batchRes) {
      chunkResults.push(...res);
    }
  }

  return chunkResults;
}

async function getFeesReportData({ fromDate = '', toDate = '', session = '', branch = 'Memari' } = {}) {
  const today = toYmd(new Date());
  const sdate = fromDate || today;
  const edate = toDate || sdate;
  const reportKey = `${sdate}_${edate}_${session || 'last_3_sessions'}_${branch}`;

  if (edate < today && reportCache.has(reportKey)) {
    return reportCache.get(reportKey);
  }

  let cookie;
  try {
    cookie = await ensureValidCookie();
  } catch (err) {
    return {
      success: false,
      need_login: true,
      message: err.message || 'Login required for Al-Ameen Accounts portal.',
    };
  }

  const availableSessions = [
    { value: '2027', label: 'Session 2027' },
    { value: '2026', label: 'Session 2026' },
    { value: '2025', label: 'Session 2025' },
    { value: '2024', label: 'Session 2024' },
    { value: '2023', label: 'Session 2023' },
    { value: '2022', label: 'Session 2022' },
  ];

  const last3Sessions = ['2026', '2025', '2024'];

  let targetSessions = [];
  if (session === 'last_3_sessions' || session === 'all' || !session) {
    targetSessions = last3Sessions;
  } else {
    targetSessions = [session];
  }

  const allBills = [];
  const seenBillIds = new Set();

  // Query sessions sequentially to prevent PHP session lock deadlock
  for (const sess of targetSessions) {
    try {
      const sessionRows = await querySessionBills(sess, sdate, edate, cookie);
      for (const r of sessionRows) {
        const key = `${r.bill_number}-${r.transaction_date}-${r.registration_no}`;
        if (!seenBillIds.has(key)) {
          seenBillIds.add(key);
          allBills.push(r);
        }
      }
    } catch (err) {
      console.error(`Session ${sess} query error:`, err.message);
    }
  }

  // Calculate totals
  const totalAmount = allBills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const onlineAmount = allBills.filter(b => b.payment_mode === 'online').reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const cashAmount = allBills.filter(b => b.payment_mode === 'cash').reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const report = {
    success: true,
    source: 'portal',
    portal_url: FEES_REPORT_URL,
    branch: 'Memari',
    from_date: sdate,
    to_date: edate,
    session: session || 'last_3_sessions',
    queried_sessions: targetSessions,
    available_sessions: availableSessions,
    last_3_sessions: last3Sessions,
    bill_count: allBills.length,
    total_amount: Number(totalAmount.toFixed(2)),
    online_amount: Number(onlineAmount.toFixed(2)),
    cash_amount: Number(cashAmount.toFixed(2)),
    fees: allBills,
  };

  if (edate < today) {
    reportCache.set(reportKey, report);
  }

  return report;
}

module.exports = {
  getPortalCredentials,
  savePortalCredentials,
  loginToPortal,
  getFeesReportData,
  FEES_REPORT_URL,
};
