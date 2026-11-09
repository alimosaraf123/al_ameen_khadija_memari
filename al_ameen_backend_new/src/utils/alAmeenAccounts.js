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

const BANKS = [
  { id: '4310', key: 'axis_24877', name: 'Axis - 24877', full_name: 'Axis Bank A/c No.- 910010023824877' },
  { id: '9705', key: 'axis_43880', name: 'Axis - 43880', full_name: 'Axis Bank A/C NO - 921010046243880' },
  { id: '16513', key: 'sbi_19665', name: 'SBI - 19665', full_name: 'S.B.I. A/c - 43718419665' },
  { id: '6310', key: 'sbi_70917', name: 'SBI - 70917', full_name: 'S.B.I. A/c - 37247970917' },
];

function cleanNum(val) {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function getFinancialYearInfo(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  const month = isNaN(d.getMonth()) ? new Date().getMonth() + 1 : d.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const label = `${startYear}-${startYear + 1}`;
  const FY_MAP = {
    '2022-2023': '3585',
    '2023-2024': '3699',
    '2024-2025': '3835',
    '2025-2026': '3961',
    '2026-2027': '4097',
    '2027-2028': '4097',
  };
  return { id: FY_MAP[label] || '4097', label };
}

async function getAvailableBanks(cookie) {
  try {
    const res = await fetchPortalPage(ACCOUNTS_BASE_URL + '?action=bank_book', 'GET', null, cookie);
    const selectMatch = res.text.match(/<select[^>]*name=["']bank_id["'][\s\S]*?<\/select>/i);
    if (!selectMatch) return BANKS;
    const opts = [...selectMatch[0].matchAll(/<option\b[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi)];
    const banks = opts.map(o => {
      const id = o[1].trim();
      const label = cleanText(o[2]);
      const known = BANKS.find(b => b.id === id);
      if (known) return known;
      let name = label;
      const digitsMatch = label.match(/(\d{4,6})$/);
      if (digitsMatch) {
        if (/axis/i.test(label)) name = `Axis - ${digitsMatch[1]}`;
        else if (/sbi|s\.b\.i/i.test(label)) name = `SBI - ${digitsMatch[1]}`;
        else name = `${label.slice(0, 10)} - ${digitsMatch[1]}`;
      }
      return { id, key: `bank_${id}`, name, full_name: label };
    });
    return banks.length > 0 ? banks : BANKS;
  } catch {
    return BANKS;
  }
}

function parseBookHtml(html) {
  const tableMatch = html.match(/<table[^>]*id=["']fee_report["'][\s\S]*?<\/table>/i) ||
                     html.match(/<table[^>]*class=["'][^"']*data_table[^"']*["'][\s\S]*?<\/table>/i);
  if (!tableMatch) {
    return { opening: 0, receipt: 0, payment: 0, closing: 0, transactions: [] };
  }

  const trs = [...tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  let openingDebit = 0;
  let openingCredit = 0;
  let hasOpening = false;
  let totalDebit = null;
  let totalCredit = null;
  let closingDebit = 0;
  let closingCredit = 0;
  let hasClosing = false;
  let sumTxnDebit = 0;
  let sumTxnCredit = 0;
  const transactions = [];

  for (const tr of trs) {
    const cells = [...tr[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map(m => cleanText(m[1]));
    if (cells.length < 3) continue;

    const rowText = cells.join(' ').toLowerCase();

    if (rowText.includes('opening balance')) {
      hasOpening = true;
      openingDebit = cleanNum(cells[2] || cells[3] || 0);
      openingCredit = cleanNum(cells[3] || cells[4] || 0);
      continue;
    }

    if (rowText.includes('total amount')) {
      totalDebit = cleanNum(cells[2] || cells[3] || 0);
      totalCredit = cleanNum(cells[3] || cells[4] || 0);
      continue;
    }

    if (rowText.includes('closing balance')) {
      hasClosing = true;
      closingDebit = cleanNum(cells[2] || cells[3] || 0);
      closingCredit = cleanNum(cells[3] || cells[4] || 0);
      continue;
    }

    if (cells[0] === '0' && cells[1] === '') continue;
    if (rowText.includes('date') && (rowText.includes('ledger') || rowText.includes('particulars'))) continue;

    const len = cells.length;
    let debit = 0;
    let credit = 0;
    if (len >= 7) {
      credit = cleanNum(cells[len - 2]);
      debit = cleanNum(cells[len - 3]);
    }
    sumTxnDebit += debit;
    sumTxnCredit += credit;

    let date = cells[1] || '';
    let particulars = cells[2] || '';
    let narration = '';
    let vch_type = '';
    let vch_no = '';

    const c3Lower = String(cells[3] || '').trim().toLowerCase();
    const c4Lower = String(cells[4] || '').trim().toLowerCase();

    if (['receipt', 'payment', 'contra', 'journal'].includes(c3Lower)) {
      // Bank Book column structure: Date, Particulars, Vch Type, Vch No, Cheque/Ref No
      vch_type = cells[3];
      vch_no = cells[4] || '';
      narration = cells[5] || '';
    } else if (['receipt', 'payment', 'contra', 'journal'].includes(c4Lower)) {
      // Cash Book column structure: Date, Particulars, Narration, Vch Type, Vch No
      narration = cells[3] || '';
      vch_type = cells[4];
      vch_no = cells[5] || '';
    } else {
      narration = cells[3] || '';
      vch_type = cells[4] || '';
      vch_no = cells[5] || '';
    }

    transactions.push({
      date,
      particulars,
      narration,
      vch_type,
      vch_no,
      receipt: debit,
      payment: credit,
    });
  }

  const opening = Number((openingDebit - openingCredit).toFixed(2));
  let receipt = 0;
  let payment = 0;

  if (totalDebit !== null && hasOpening) {
    receipt = Number(Math.max(0, totalDebit - openingDebit).toFixed(2));
  } else {
    receipt = Number(sumTxnDebit.toFixed(2));
  }

  if (totalCredit !== null && hasOpening) {
    payment = Number(Math.max(0, totalCredit - openingCredit).toFixed(2));
  } else {
    payment = Number(sumTxnCredit.toFixed(2));
  }

  let closing = 0;
  if (hasClosing) {
    closing = Number((closingDebit - closingCredit).toFixed(2));
  } else if (totalDebit !== null && totalCredit !== null) {
    closing = Number((totalDebit - totalCredit).toFixed(2));
  } else {
    closing = Number((opening + receipt - payment).toFixed(2));
  }

  return {
    opening,
    receipt,
    payment,
    closing,
    transactions
  };
}

async function getReceiptPaymentReportData({ fromDate = '', toDate = '' } = {}) {
  const today = toYmd(new Date());
  const sdate = fromDate || today;
  const edate = toDate || sdate;

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

  const fyInfo = getFinancialYearInfo(sdate);
  const banks = await getAvailableBanks(cookie);

  // 1. Fetch Cash Book
  const cashForm = new URLSearchParams({
    financial_year_id: fyInfo.id,
    sdate,
    edate,
    branch_id: MEMARI_BRANCH_ID,
    search: ''
  });

  const cashResPromise = fetchPortalPage(ACCOUNTS_BASE_URL + '?action=cash_book', 'POST', cashForm, cookie)
    .then(r => parseBookHtml(r.text))
    .catch(err => {
      console.error('Error fetching cash book:', err.message);
      return { opening: 0, receipt: 0, payment: 0, closing: 0, transactions: [] };
    });

  // 2. Fetch Bank Books
  const bankPromises = banks.map(b => {
    const bankForm = new URLSearchParams({
      financial_year_id: fyInfo.id,
      bank_id: b.id,
      sdate,
      edate,
      branch_id: MEMARI_BRANCH_ID,
      search: ''
    });
    return fetchPortalPage(ACCOUNTS_BASE_URL + '?action=bank_book', 'POST', bankForm, cookie)
      .then(r => ({ ...b, ...parseBookHtml(r.text) }))
      .catch(err => {
        console.error(`Error fetching bank book ${b.name}:`, err.message);
        return { ...b, opening: 0, receipt: 0, payment: 0, closing: 0, transactions: [] };
      });
  });

  const [cashData, ...bankResults] = await Promise.all([cashResPromise, ...bankPromises]);

  // Construct rows matching Image 5:
  // [Cash, Axis - 24877, Axis - 43880, SBI - 19665, SBI - 70917]
  const rows = [
    {
      account_id: 'cash',
      account_name: 'Cash',
      code: 'cash',
      opening_balance: cashData.opening,
      receipt: cashData.receipt,
      payment: cashData.payment,
      closing_balance: cashData.closing,
      transaction_count: cashData.transactions.length,
      transactions: cashData.transactions,
    },
    ...bankResults.map(b => ({
      account_id: b.id,
      account_name: b.name,
      code: b.key,
      full_name: b.full_name,
      opening_balance: b.opening,
      receipt: b.receipt,
      payment: b.payment,
      closing_balance: b.closing,
      transaction_count: b.transactions.length,
      transactions: b.transactions,
    }))
  ];

  const total = {
    account_name: 'Total',
    opening_balance: Number(rows.reduce((sum, r) => sum + r.opening_balance, 0).toFixed(2)),
    receipt: Number(rows.reduce((sum, r) => sum + r.receipt, 0).toFixed(2)),
    payment: Number(rows.reduce((sum, r) => sum + r.payment, 0).toFixed(2)),
    closing_balance: Number(rows.reduce((sum, r) => sum + r.closing_balance, 0).toFixed(2)),
  };

  return {
    success: true,
    from_date: sdate,
    to_date: edate,
    financial_year: fyInfo.label,
    branch: 'Memari',
    rows,
    total
  };
}

const DUE_LIST_URL = 'https://alameenmission.net/alameen/accounts/?action=due_list';

async function getDueListData({ toDate = '', classId = 'all', sessionYear = 'last_2_sessions' } = {}) {
  const today = toYmd(new Date());
  const edate = toDate || today;

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

  // Active XI/XII students from local database
  let activeXiXii = new Map();
  try {
    const dbRes = await pool.query(`
      SELECT registration_no, student_name, class_name, mobile_number, whatsapp_number, father_mobile 
      FROM students 
      WHERE is_active = true AND (class_name ILIKE '%XI%' OR class_name ILIKE '%XII%')
    `);
    dbRes.rows.forEach(r => {
      activeXiXii.set(String(r.registration_no).trim(), r);
    });
  } catch (dbErr) {
    console.error('Error fetching active XI/XII students:', dbErr);
  }

  let targetSessions = [];
  if (sessionYear === 'last_2_sessions' || !sessionYear) {
    targetSessions = ['2026', '2025'];
  } else {
    targetSessions = [String(sessionYear).trim()];
  }

  const allDues = [];
  const seenRegs = new Set();

  for (const sess of targetSessions) {
    const bodyParams = new URLSearchParams();
    bodyParams.set('sdate', '');
    bodyParams.set('edate', edate);
    bodyParams.set('branch_id', MEMARI_BRANCH_ID);
    bodyParams.set('classid', classId || 'all');
    bodyParams.set('session_year', sess);
    bodyParams.set('search', 'search');

    let res = await fetchPortalPage(DUE_LIST_URL, 'POST', bodyParams, cookie);
    if (!res || !res.text) continue;

    // Check if session expired
    if (res.text.includes('id="login_form"') || res.text.includes('Administrator Login')) {
      const creds = await getPortalCredentials();
      if (creds.username && creds.password) {
        cookie = await loginToPortal(creds.username, creds.password);
        res = await fetchPortalPage(DUE_LIST_URL, 'POST', bodyParams, cookie);
      }
    }

    const html = res.text;
    const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (!theadMatch) continue;

    const ths = [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => cleanText(m[1]));

    let totalColIdx = 51;
    let smsTextColIdx = 53;
    let dueMonthColIdx = 54;
    ths.forEach((h, idx) => {
      if (/total\s*amount/i.test(h)) totalColIdx = idx;
      if (/sms\s*text/i.test(h)) smsTextColIdx = idx;
      if (/due\s*months?/i.test(h)) dueMonthColIdx = idx;
    });

    const admissionColIndices = [];
    ths.forEach((h, idx) => {
      if (/registration fee|admission fee|re-admission fee|bedding fee|utensil fee|caution money|development fee/i.test(h)) {
        admissionColIndices.push(idx);
      }
    });

    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) continue;

    const rows = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

    for (const r of rows) {
      const tds = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => cleanText(m[1]));
      if (tds.length < 10) continue;

      const regNo = (tds[0] || '').trim();
      const branchName = (tds[1] || '').trim();
      const className = (tds[2] || '').trim();
      const studentName = (tds[3] || '').trim();
      const fatherName = (tds[6] || '').trim();
      let phone = (tds[7] || '').replace(/[^0-9]/g, '');
      let whatsapp = (tds[8] || '').replace(/[^0-9]/g, '');

      const clean10 = (num) => {
        if (!num) return '';
        let n = String(num).replace(/[^0-9]/g, '');
        if (n.length === 12 && n.startsWith('91')) n = n.slice(2);
        if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
        return n;
      };

      phone = clean10(phone);
      whatsapp = clean10(whatsapp);

      const totalDue = parseFloat((tds[totalColIdx] || '0').replace(/[^0-9.]/g, '')) || 0;
      if (totalDue <= 0) continue;

      let admissionDue = 0;
      for (const colIdx of admissionColIndices) {
        const val = parseFloat((tds[colIdx] || '0').replace(/[^0-9.]/g, '')) || 0;
        admissionDue += val;
      }
      const monthlyDue = Math.max(0, totalDue - admissionDue);
      const dueMonth = (tds[dueMonthColIdx] || '').trim();

      // XI - XII Filter: Only show students who exist in local database
      const isXiOrXii = /xi|xii/i.test(className);
      if (isXiOrXii) {
        if (!activeXiXii.has(regNo)) {
          continue; // Exclude student not in local DB
        }
        const localStud = activeXiXii.get(regNo);
        if (!phone || phone.length < 10) phone = clean10(localStud.mobile_number || localStud.father_mobile);
        if (!whatsapp || whatsapp.length < 10) whatsapp = clean10(localStud.whatsapp_number || localStud.mobile_number);
      }

      if (!whatsapp || whatsapp.length < 10) whatsapp = phone;
      if (!phone || phone.length < 10) phone = whatsapp;

      // WhatsApp message template as requested:
      // "Dear, [NAME], Reg.No.[REG], class-[CLASS], Pay Your total dues Rs.[TOTAL_DUE] , if already paid please ignore it. From-Al Ameen Mission Academy,Memari"
      const waMessage = `Dear, ${studentName}, Reg.No.${regNo}, class-${className}, Pay Your total dues Rs.${totalDue} , if already paid please ignore it. From-Al Ameen Mission Academy,Memari`;

      const uniqueKey = `${regNo}_${sess}`;
      if (seenRegs.has(uniqueKey)) continue;
      seenRegs.add(uniqueKey);

      allDues.push({
        registration_no: regNo,
        student_name: studentName,
        branch_name: branchName,
        class_name: className,
        father_name: fatherName,
        phone,
        whatsapp,
        admission_due: admissionDue,
        monthly_due: monthlyDue,
        due_month: dueMonth,
        total_due: totalDue,
        session_year: sess,
        whatsapp_message: waMessage,
      });
    }
  }

  // Summary totals
  const totalStudents = allDues.length;
  const totalAdmissionDue = allDues.reduce((s, r) => s + r.admission_due, 0);
  const totalMonthlyDue = allDues.reduce((s, r) => s + r.monthly_due, 0);
  const grandTotalDue = allDues.reduce((s, r) => s + r.total_due, 0);

  return {
    success: true,
    to_date: edate,
    class_id: classId,
    session_year: sessionYear,
    total_students: totalStudents,
    total_admission_due: totalAdmissionDue,
    total_monthly_due: totalMonthlyDue,
    grand_total_due: grandTotalDue,
    rows: allDues,
  };
}

module.exports = {
  getPortalCredentials,
  savePortalCredentials,
  loginToPortal,
  getFeesReportData,
  getReceiptPaymentReportData,
  getDueListData,
  FEES_REPORT_URL,
  DUE_LIST_URL,
};
