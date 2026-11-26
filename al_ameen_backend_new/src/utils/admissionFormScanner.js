const sharp = require('sharp');
const pool = require('../db');

const ADMISSION_FORM_PROMPT = `You are reading a scanned handwritten "Al-Ameen Mission Academy, Memari - Student Registration Form".
Extract every filled field accurately into strict JSON. If a field is blank or unreadable, use "" (or false for booleans).

Return ONLY a JSON object with these exact keys:
{
  "student_name": "",
  "registration_no": "",
  "class_name": "Normalize roman classes like V, VI, VII, VIII, IX, X, XI-Sc., XII-Sc., XI, XII",
  "stream": "Sc / Arts / Gen or empty",
  "gender": "Female or Male (if F -> Female, M -> Male)",
  "admission_date": "YYYY-MM-DD (from DD/MM/YYYY)",
  "date_of_birth": "YYYY-MM-DD (from DD/MM/YYYY)",
  "session_from": "4-digit year e.g. 2026",
  "session_to": "4-digit year e.g. 2027",
  "monthly_fees": "digits only e.g. 5390",
  "whatsapp_number": "10 digits only",
  "mobile_number": "10 digits if separate, otherwise same as whatsapp_number",
  "email": "lowercase email, fix common handwriting like @gmail.com",
  "aadhaar_no": "12 digits without spaces",
  "blood_group": "e.g. B+, O+, A+, AB+",
  "caste_name": "e.g. GENERAL, OBC, SC, ST, MUSLIM",
  "previous_branch_name": "",
  "is_handicapped": false,
  "is_orphan": false,
  "banglarshiksha_id": "",
  "kanyashree_id": "",
  "father_name": "",
  "father_aadhaar_no": "12 digits without spaces",
  "father_qualification": "",
  "father_occupation": "",
  "father_annual_income": "digits only",
  "father_mobile": "10 digits only",
  "mother_name": "",
  "mother_aadhaar_no": "12 digits without spaces",
  "mother_qualification": "",
  "mother_occupation": "",
  "mother_annual_income": "digits only",
  "mother_mobile": "10 digits only",
  "present_village": "",
  "present_post_office": "",
  "present_police_station": "",
  "present_pin_code": "6 digits",
  "present_block": "",
  "present_district": "",
  "present_state": "e.g. WEST BENGAL",
  "permanent_village": "",
  "permanent_post_office": "",
  "permanent_police_station": "",
  "permanent_pin_code": "6 digits",
  "permanent_block": "",
  "permanent_district": "",
  "permanent_state": "e.g. WEST BENGAL",
  "visitor1": {
    "visitor_name": "",
    "relation": "",
    "mobile_number": "10 digits",
    "village": "",
    "post_office": "",
    "police_station": "",
    "pin_code": "6 digits",
    "block": "",
    "district": "",
    "state": "e.g. WEST BENGAL"
  },
  "visitor2": {
    "visitor_name": "",
    "relation": "",
    "mobile_number": "10 digits",
    "village": "",
    "post_office": "",
    "police_station": "",
    "pin_code": "6 digits",
    "block": "",
    "district": "",
    "state": ""
  },
  "bank_account_no": "digits only",
  "bank_ifsc_code": "uppercase 11 chars e.g. PUNB0062120",
  "bank_name": ""
}`;

async function getGeminiApiKey() {
  if (process.env.GEMINI_API_KEY) return String(process.env.GEMINI_API_KEY).trim();
  try {
    const r = await pool.query(`SELECT value FROM app_settings WHERE key = 'gemini_api_key' LIMIT 1`);
    if (r.rowCount && r.rows[0].value) return String(r.rows[0].value).trim();
  } catch {
    // app_settings table may not exist yet
  }
  return '';
}

function cleanDigits(v, maxLen) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  return maxLen ? d.slice(0, maxLen) : d;
}

function normalizeDateIso(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yyyy}-${mm}-${dd}`;
}

async function lookupIfsc(ifsc) {
  const clean = String(ifsc || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 11) return null;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      bank_name: data.BANK || '',
      bank_branch_name: data.BRANCH || '',
      bank_branch_address: data.ADDRESS || '',
    };
  } catch {
    return null;
  }
}

function normalizeExtractedData(raw = {}) {
  const cleanVisitor = (v) => {
    if (!v || typeof v !== 'object') return {};
    return {
      visitor_name: String(v.visitor_name || '').trim().toUpperCase(),
      relation: String(v.relation || '').trim(),
      mobile_number: cleanDigits(v.mobile_number, 10),
      village: String(v.village || '').trim().toUpperCase(),
      post_office: String(v.post_office || '').trim().toUpperCase(),
      police_station: String(v.police_station || '').trim().toUpperCase(),
      pin_code: cleanDigits(v.pin_code, 6),
      block: String(v.block || '').trim().toUpperCase(),
      district: String(v.district || '').trim().toUpperCase(),
      state: String(v.state || '').trim().toUpperCase() || 'WEST BENGAL',
    };
  };

  let gender = String(raw.gender || '').trim().toLowerCase();
  if (gender === 'f' || gender === 'female') gender = 'Female';
  else if (gender === 'm' || gender === 'male') gender = 'Male';
  else gender = '';

  const sessionFrom = cleanDigits(raw.session_from, 4);
  const sessionTo = cleanDigits(raw.session_to, 4);
  const ifsc = String(raw.bank_ifsc_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);

  return {
    student_name: String(raw.student_name || '').trim().toUpperCase(),
    registration_no: cleanDigits(raw.registration_no, 12) || String(raw.registration_no || '').trim(),
    class_name: String(raw.class_name || '').trim(),
    stream: String(raw.stream || '').trim(),
    gender,
    admission_date: normalizeDateIso(raw.admission_date),
    date_of_birth: normalizeDateIso(raw.date_of_birth),
    session_from: sessionFrom,
    session_to: sessionTo,
    academic_session: sessionFrom && sessionTo ? `${sessionFrom}-${sessionTo}` : '',
    monthly_fees: cleanDigits(raw.monthly_fees),
    whatsapp_number: cleanDigits(raw.whatsapp_number, 10),
    mobile_number: cleanDigits(raw.mobile_number || raw.whatsapp_number, 10),
    email: String(raw.email || '').trim().toLowerCase(),
    aadhaar_no: cleanDigits(raw.aadhaar_no, 12),
    blood_group: String(raw.blood_group || '').trim().toUpperCase(),
    caste_name: String(raw.caste_name || '').trim().toUpperCase(),
    previous_branch_name: String(raw.previous_branch_name || '').trim().toUpperCase(),
    is_handicapped: Boolean(raw.is_handicapped),
    is_orphan: Boolean(raw.is_orphan),
    banglarshiksha_id: String(raw.banglarshiksha_id || '').trim(),
    kanyashree_id: String(raw.kanyashree_id || '').trim(),
    father_name: String(raw.father_name || '').trim().toUpperCase(),
    father_aadhaar_no: cleanDigits(raw.father_aadhaar_no, 12),
    father_qualification: String(raw.father_qualification || '').trim(),
    father_occupation: String(raw.father_occupation || '').trim(),
    father_annual_income: cleanDigits(raw.father_annual_income),
    father_mobile: cleanDigits(raw.father_mobile, 10),
    mother_name: String(raw.mother_name || '').trim().toUpperCase(),
    mother_aadhaar_no: cleanDigits(raw.mother_aadhaar_no, 12),
    mother_qualification: String(raw.mother_qualification || '').trim(),
    mother_occupation: String(raw.mother_occupation || '').trim(),
    mother_annual_income: cleanDigits(raw.mother_annual_income),
    mother_mobile: cleanDigits(raw.mother_mobile, 10),
    present_village: String(raw.present_village || '').trim().toUpperCase(),
    present_post_office: String(raw.present_post_office || '').trim().toUpperCase(),
    present_police_station: String(raw.present_police_station || '').trim().toUpperCase(),
    present_pin_code: cleanDigits(raw.present_pin_code, 6),
    present_block: String(raw.present_block || '').trim().toUpperCase(),
    present_district: String(raw.present_district || '').trim().toUpperCase(),
    present_state: String(raw.present_state || '').trim().toUpperCase() || 'WEST BENGAL',
    permanent_village: String(raw.permanent_village || raw.present_village || '').trim().toUpperCase(),
    permanent_post_office: String(raw.permanent_post_office || raw.present_post_office || '').trim().toUpperCase(),
    permanent_police_station: String(raw.permanent_police_station || raw.present_police_station || '').trim().toUpperCase(),
    permanent_pin_code: cleanDigits(raw.permanent_pin_code || raw.present_pin_code, 6),
    permanent_block: String(raw.permanent_block || raw.present_block || '').trim().toUpperCase(),
    permanent_district: String(raw.permanent_district || raw.present_district || '').trim().toUpperCase(),
    permanent_state: String(raw.permanent_state || raw.present_state || '').trim().toUpperCase() || 'WEST BENGAL',
    visitor1: cleanVisitor(raw.visitor1),
    visitor2: cleanVisitor(raw.visitor2),
    bank_account_no: cleanDigits(raw.bank_account_no),
    bank_ifsc_code: ifsc,
    bank_name: String(raw.bank_name || '').trim().toUpperCase(),
  };
}

async function scanWithTesseractFallback(jpegBuffer) {
  const Tesseract = require('tesseract.js');
  const enhanced = await sharp(jpegBuffer).greyscale().normalize().sharpen().png().toBuffer();
  const { data } = await Tesseract.recognize(enhanced, 'eng');
  const text = String(data?.text || '');
  const regMatch = text.match(/Reg\.?\s*No\.?\s*[:\-]?\s*(\d{4,7})/i);
  const phones = [...new Set((text.match(/\b[6-9]\d{9}\b/g) || []))];
  const aadhaars = [...new Set((text.replace(/\s+/g, ' ').match(/\b\d{4}\s?\d{4}\s?\d{4}\b/g) || []).map((a) => a.replace(/\s+/g, '')))];
  const pins = [...new Set((text.match(/\b7\d{5}\b/g) || []))];
  const ifscMatch = text.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i);
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const dates = (text.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g) || []).map(normalizeDateIso).filter(Boolean);

  return normalizeExtractedData({
    registration_no: regMatch ? regMatch[1] : '',
    admission_date: dates[0] || '',
    date_of_birth: dates[1] || '',
    whatsapp_number: phones[0] || '',
    father_mobile: phones[1] || '',
    email: emailMatch ? emailMatch[0] : '',
    aadhaar_no: aadhaars[0] || '',
    father_aadhaar_no: aadhaars[1] || '',
    mother_aadhaar_no: aadhaars[2] || '',
    present_pin_code: pins[0] || '',
    bank_ifsc_code: ifscMatch ? ifscMatch[0].toUpperCase() : '',
    visitor1: { mobile_number: phones[2] || '' },
  });
}

async function scanAdmissionFormBuffer(fileBuffer) {
  const preparedJpeg = await sharp(fileBuffer, { failOn: 'error' })
    .rotate()
    .resize({ width: 2000, height: 2600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  const apiKey = await getGeminiApiKey();
  let engine = 'gemini_vision';
  let extracted = null;
  let warning = '';

  if (apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [
        {
          parts: [
            { text: ADMISSION_FORM_PROMPT },
            { inline_data: { mime_type: 'image/jpeg', data: preparedJpeg.toString('base64') } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error?.message || `Gemini API failed (${res.status})`);
    }
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);
    extracted = normalizeExtractedData(parsed);
  } else {
    engine = 'tesseract_basic';
    extracted = await scanWithTesseractFallback(preparedJpeg);
    warning = 'GEMINI_API_KEY not configured: used offline basic OCR (numbers/dates only). Add GEMINI_API_KEY in .env for full handwriting extraction.';
  }

  if (extracted.bank_ifsc_code) {
    const bankInfo = await lookupIfsc(extracted.bank_ifsc_code);
    if (bankInfo) {
      if (!extracted.bank_name && bankInfo.bank_name) extracted.bank_name = bankInfo.bank_name;
      extracted.bank_branch_name = bankInfo.bank_branch_name || '';
      extracted.bank_branch_address = bankInfo.bank_branch_address || '';
    }
  }

  return {
    engine,
    warning,
    extracted,
    preview_data_url: `data:image/jpeg;base64,${preparedJpeg.toString('base64')}`,
  };
}

module.exports = {
  scanAdmissionFormBuffer,
};
