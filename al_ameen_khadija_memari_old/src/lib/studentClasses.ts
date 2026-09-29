export const STUDENT_CLASSES = [
  'Nursary', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI-Sc.', 'XII-Sc.',
];
export function isVisibleStudentClass(value: string) {
  return !['xi-arts', 'xii-arts', '5'].includes(String(value).trim().toLowerCase().replace(/\s+/g, ''));
}