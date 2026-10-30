const path = require('path');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');
const english = require('@tesseract.js-data/eng');
const { readHandwriting, cleanHandwritingCrop } = require('./omrHandwriting');

const normalizeName = value => String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
const normalizeRegistration = value => String(value || '').trim().replace(/[\s-]/g, '').toUpperCase();
const normalizeClass = value => String(value || '').toUpperCase()
  .replace(/^CLASS[\s:-]*/, '').replace(/[^A-Z0-9]/g, '');

function uniqueStudent(students) {
  const unique = new Map(students.map(student => [String(student.id), student]));
  return unique.size === 1 ? unique.values().next().value : null;
}

function matchRegistration(value, students) {
  const key = normalizeRegistration(value);
  if (!key) return null;
  return uniqueStudent(students.filter(student =>
    ['registration_no', 'school_reg_no', 'council_reg_no', 'admission_no'].some(field =>
      normalizeRegistration(student[field]) === key)));
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function matchName(text, students, allowOcrCorrection = false) {
  const key = normalizeName(text);
  if (key.length < 6) return null;
  // Handwriting OCR can join or split words. Ignore spacing, but require the
  // complete name and an unambiguous roster match before assigning marks.
  const exact = students.filter(student => normalizeName(student.student_name) === key);
  if (exact.length) return uniqueStudent(exact);
  if (!allowOcrCorrection) return null;
  const words = String(text).trim().toUpperCase().split(/\s+/).map(normalizeName).filter(Boolean);
  // Cursive surname strokes are frequently joined (Parvin -> Pavin,
  // Khatun -> Khan). Require a complete, exact first name of 5+ letters,
  // only two words, and a unique roster candidate for this correction.
  if (words.length === 2 && words[0].length >= 5 && key.length >= 9) {
    const surnameCorrections = students.filter(student => {
      const parts = String(student.student_name).trim().split(/\s+/).map(normalizeName).filter(Boolean);
      return parts.length === 2 && parts[0] === words[0] &&
        words[1].length >= 4 && parts[1].length >= 4 && editDistance(words[1], parts[1]) <= 2;
    });
    if (surnameCorrections.length) return uniqueStudent(surnameCorrections);
  }
  if (key.length < 11) return null;
  if (words.length < 2 || words[0].length < 6) return null;
  const surname = normalizeName(words[words.length - 1]);
  // Accept a single OCR character error in a long first name only when the
  // surname is exact and the candidate is unique across the active roster.
  const close = students.filter(student => {
    const parts = String(student.student_name).trim().split(/\s+/);
    return normalizeName(parts[parts.length - 1]) === surname &&
      editDistance(key, normalizeName(student.student_name)) === 1;
  });
  return uniqueStudent(close);
}

function matchResultStudent(result, students, className) {
  const roster = className ? students.filter(student =>
    normalizeClass(student.class_name) === normalizeClass(className)) : students;
  return matchRegistration(result.mission_reg_no, roster) ||
    matchRegistration(result.registration_no, roster) || matchName(result.student_name, roster);
}

function identifyResult(result, student, method) {
  return {
    ...result,
    student_id: String(student.id),
    mission_reg_no: String(student.registration_no),
    student_name: student.student_name,
    class_name: student.class_name || result.class_name,
    school_name: student.admitted_school_name || result.school_name || '',
    identity_match: method,
  };
}

function rosterForExam(students, { examName = '', className = '' } = {}) {
  if (className) return students.filter(student =>
    normalizeClass(student.class_name) === normalizeClass(className));
  const grade = String(examName).match(/\b(XII|XI|VIII|VII|VI|IX|IV|III|II|X|V|I)\b/i)?.[1]?.toUpperCase();
  if (!grade) return students;
  return students.filter(student =>
    new RegExp(`^(?:CLASS\\s*)?${grade}(?:[^IVX]|$)`, 'i').test(String(student.class_name || '').trim()));
}

async function nameCrop(imagePath, region, style = 'threshold') {
  const metadata = await sharp(imagePath).metadata();
  const bounds = region || { left: 0.298, top: 0.419, width: 0.54, height: 0.029 };
  // Use detected field geometry. Signature-only forms place the handwriting
  // below the printed heading, unlike forms with a dedicated name row.
  const left = Math.max(0, Math.round(metadata.width * bounds.left));
  const top = Math.max(0, Math.round(metadata.height * bounds.top));
  const { data, info } = await sharp(imagePath).removeAlpha().toColourspace('srgb')
    .extract({
      left, top,
      width: Math.min(metadata.width - left, Math.round(metadata.width * bounds.width)),
      height: Math.min(metadata.height - top, Math.round(metadata.height * bounds.height)),
    }).raw().toBuffer({ resolveWithObject: true });
  const mono = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mono.length; i++) {
    const r = data[i * info.channels], g = data[i * info.channels + 1], b = data[i * info.channels + 2];
    // Blue ink is valid handwriting on the newer black-and-white form.
    // Do not erase pixels based on their color.
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    mono[i] = style === 'gray' ? gray : (gray < 165 ? 0 : 255);
  }
  const crop = await sharp(mono, { raw: { width: info.width, height: info.height, channels: 1 } })
    .resize({ width: Math.max(info.width, 1400) })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#fff' }).png().toBuffer();
  return cleanHandwritingCrop(crop);
}

async function enrichOmrResults(results, imagePaths, students, exam = {}) {
  let worker;
  const enriched = [];
  const ocrRoster = rosterForExam(students, exam);
  try {
    for (const result of results) {
      if (result.identity_match === 'manual') {
        enriched.push(result);
        continue;
      }
      const matched = matchRegistration(result.registration_no, students);
      if (matched) {
        enriched.push(identifyResult(result, matched, 'registration'));
        continue;
      }
      const imagePath = imagePaths.find(file => path.basename(file) === result.file);
      let text = result.scanned_name || '';
      let selectedMatch = matchName(text, ocrRoster, true);
      const observations = [];
      if (imagePath) {
        if (!worker) {
          worker = await createWorker('eng', 1, {
            langPath: english.langPath, gzip: true, cacheMethod: 'none',
          });
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, user_defined_dpi: '300' });
        }
        const regions = result.identity_regions?.length ? result.identity_regions : [undefined];
        const correctedMatches = [];
        selectedMatch = null;
        scanRegions: for (const region of regions) {
          for (const [style, mode] of [['threshold', PSM.SINGLE_LINE], ['gray', PSM.SINGLE_LINE], ['gray', PSM.RAW_LINE]]) {
            await worker.setParameters({ tessedit_pageseg_mode: mode });
            const crop = await nameCrop(imagePath, region, style);
            const { data } = await worker.recognize(crop);
            const observed = data.text.trim();
            if (!observed) continue;
            observations.push({ text: observed, source: region?.kind || 'name_field', confidence: data.confidence });
            const exact = matchName(observed, ocrRoster);
            if (exact) {
              selectedMatch = exact;
              text = observed;
              break scanRegions;
            }
            const corrected = matchName(observed, ocrRoster, true);
            if (corrected) correctedMatches.push({ student: corrected, text: observed, confidence: data.confidence });
          }
        }
        if (!selectedMatch && uniqueStudent(correctedMatches.map(match => match.student))) {
          correctedMatches.sort((a, b) => b.confidence - a.confidence);
          selectedMatch = correctedMatches[0].student;
          text = correctedMatches[0].text;
        }
        if (!selectedMatch) {
          for (const region of regions) {
            const crop = await nameCrop(imagePath, region, 'gray');
            const observed = await readHandwriting(crop);
            observations.push({ text: observed, source: region?.kind || 'name_field', recognizer: 'handwriting' });
            const matchedHandwriting = matchName(observed, ocrRoster, true);
            if (matchedHandwriting) {
              selectedMatch = matchedHandwriting;
              text = observed;
              break;
            }
          }
        }
        if (!selectedMatch && observations.length) text = observations[0].text;
      }
      enriched.push(selectedMatch ? identifyResult({ ...result, scanned_name: text, identity_observations: observations }, selectedMatch, 'sheet_name') : {
        ...result, scanned_name: text, identity_observations: observations, identity_match: 'unmatched',
      });
    }
    return enriched;
  } finally {
    if (worker) await worker.terminate();
  }
}

module.exports = { enrichOmrResults, matchRegistration, matchName, matchResultStudent, nameCrop, identifyResult, rosterForExam };
