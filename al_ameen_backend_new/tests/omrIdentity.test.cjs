const test = require('node:test');
const assert = require('node:assert/strict');
const { matchName, matchRegistration, matchResultStudent, rosterForExam } = require('../src/utils/omrIdentity');

const roster = [
  { id: '738', registration_no: '40554', student_name: 'Sahanaj Parvin', class_name: 'XI-Sc.', school_reg_no: null },
  { id: '776', registration_no: '56545', student_name: 'Tajmira Khatun', class_name: 'XI-Sc.', school_reg_no: '2262106333' },
];

test('a missing school registration can be resolved from a handwritten name with one OCR character error', () => {
  assert.equal(matchRegistration('2262118819', roster), null);
  assert.equal(matchName('SAHANAT PARVIN', roster, true)?.registration_no, '40554');
  assert.equal(matchName('SAHANAJPARVIN', roster)?.registration_no, '40554');
});

test('ambiguous handwriting and an unverified school number never assign a student', () => {
  const ambiguous = [...roster, { id: '999', registration_no: '99999', student_name: 'Sahanaf Parvin', class_name: 'XI-Sc.' }];
  assert.equal(matchName('SAHANAT PARVIN', ambiguous, true), null);
  assert.equal(matchName('SAHANAT KATUN', roster, true), null);
  assert.equal(matchRegistration('2262117695', roster), null);
});

test('terminal sync uses the recognized Mission ID when the school number is not yet linked', () => {
  const result = { registration_no: '2262118819', mission_reg_no: '40554', student_name: 'Sahanaj Parvin' };
  assert.equal(matchResultStudent(result, roster, 'XI-Sc.')?.id, '738');
  assert.equal(matchResultStudent(result, roster, 'Class XI-Sc.')?.id, '738');
  assert.equal(matchResultStudent(result, roster, 'XII-Sc.'), null);
});

test('matching an existing school registration and keeping numeric classes distinct', () => {
  assert.equal(matchRegistration('2262106333', roster)?.registration_no, '56545');
  assert.equal(matchResultStudent({ mission_reg_no: '40554' }, [{ ...roster[0], class_name: 'Class 10' }], 'Class 11'), null);
});

test('the exam grade distinguishes identical names in XI and XII', () => {
  const namesakes = [
    { id: '1', registration_no: '45376', student_name: 'Sabnur Sultana', class_name: 'XI-Sc.' },
    { id: '2', registration_no: '53955', student_name: 'Sabnur Sultana', class_name: 'XII-Sc.' },
  ];
  assert.equal(matchName('SABNUR SULTANA', namesakes), null);
  assert.equal(matchName('SABNUR SULTANA', rosterForExam(namesakes, { examName: 'xi 1st semister school exam 2026 Mathematics' }))?.registration_no, '45376');
});

test('handwriting surname corrections require an exact first name and an unambiguous student', () => {
  const students = [
    { id: 1, student_name: 'Mampi Khatun', registration_no: '60282' },
    { id: 2, student_name: 'Mobina Parvin', registration_no: '77868' },
  ];
  assert.equal(matchName('_ Mampi Khasun', students, true)?.registration_no, '60282');
  assert.equal(matchName('Mobina Pavin', students, true)?.registration_no, '77868');
  assert.equal(matchName('Mobiosa Powin', students, true), null);
  assert.equal(matchName('Mobina Pavin', [...students, { id: 3, student_name: 'Mobina Parwin' }], true), null);
});
