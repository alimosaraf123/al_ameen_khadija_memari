import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterStudents, sessionYears } from '../src/lib/studentDirectory.ts';
const students = [
  { id: 1, student_name: 'Student A', registration_no: '101', class_name: 'V', gender: 'Female', is_active: true, session_from: '2025', session_to: '2026', mobile_number: '9000000001' },
  { id: 2, student_name: 'Student B', registration_no: '102', class_name: 'VI', gender: 'M', is_active: false, session_from: '2023', session_to: '2024' },
  { id: 3, student_name: 'Student C', class_name: 'V', gender: 'male', is_active: true, session_from: null, session_to: null },
];
const all = { year: 'all', className: 'all', gender: 'all', status: 'all', search: '' };
test('session year includes both ends of a saved session', () => {
  assert.deepEqual(sessionYears(students[0]), [2025, 2026]);
  assert.deepEqual(sessionYears({ session_from: '2026', session_to: '2024' }), [2026]);
});
test('old dropout students remain discoverable by session', () => {
  assert.deepEqual(filterStudents(students, { ...all, year: '2023', status: 'dropout' }).map(s => s.id), [2]);
});
test('class, gender, status, year and search combine', () => {
  assert.deepEqual(filterStudents(students, { year: '2026', className: 'V', gender: 'female', status: 'active', search: '101' }).map(s => s.id), [1]);
  assert.equal(filterStudents(students, { ...all, className: 'VI', status: 'active' }).length, 0);
});
test('unknown sessions appear only under All Years', () => {
  assert.deepEqual(sessionYears(students[2]), []);
  assert.equal(filterStudents(students, all).length, 3);
  assert.equal(filterStudents(students, { ...all, year: '2026' }).length, 1);
});
test('gender abbreviations and name and phone searches', () => {
  assert.deepEqual(filterStudents(students, { ...all, gender: 'male' }).map(s => s.id), [2, 3]);
  assert.equal(filterStudents(students, { ...all, search: ' student a ' })[0].id, 1);
  assert.equal(filterStudents(students, { ...all, search: '9000000001' })[0].id, 1);
});