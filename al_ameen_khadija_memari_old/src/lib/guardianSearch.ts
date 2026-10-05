import { STUDENT_CLASSES } from './studentClasses';

export function matchesGuardianSearch(student: any, search: string) {
  const query = search.trim().toLowerCase();
  if (STUDENT_CLASSES.some(className => className.toLowerCase() === query)) {
    return String(student.class_name || '').trim().toLowerCase() === query;
  }
  return [student.student_name, student.registration_no, student.class_name,
    student.guardian?.login_id, student.whatsapp_number, student.guardian?.mobile]
    .some(value => String(value || '').toLowerCase().includes(query));
}
