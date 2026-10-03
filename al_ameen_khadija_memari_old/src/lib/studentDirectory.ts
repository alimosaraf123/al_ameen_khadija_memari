export function normalizeStudentClass(value: unknown): string {
  const text = String(value ?? '').trim();
  const key = text.toLowerCase().replace(/[\s.\-]+/g, '');
  if (key === 'xisc') return 'XI-Sc.';
  if (key === 'xiisc') return 'XII-Sc.';
  return text;
}
export type StudentFilters = { year: string; className: string; gender: string; status: string; search: string };

export function studentSession(student: any): string {
  const from = String(student.session_from ?? '').trim();
  const to = String(student.session_to ?? '').trim();
  return /^\d{4}$/.test(from) && /^\d{4}$/.test(to) ? `${from}-${to}` : '';
}

export function filterStudents(students: any[], filters: StudentFilters) {
  const query = filters.search.trim().toLowerCase();
  return students.filter(student => {
    const gender = String(student.gender || '').trim().toLowerCase();
    const normalizedGender = gender === 'm' ? 'male' : gender === 'f' ? 'female' : gender;
    return (filters.year === 'all' || studentSession(student) === filters.year)
      && (filters.className === 'all' || normalizeStudentClass(student.class_name) === normalizeStudentClass(filters.className))
      && (filters.gender === 'all' || normalizedGender === filters.gender)
      && (filters.status === 'all' || (filters.status === 'active' ? student.is_active === true : student.is_active === false))
      && (!query || ['student_name', 'registration_no', 'mobile_number', 'guardian_mobile', 'whatsapp_number', 'room_name']
        .some(key => String(student[key] ?? '').toLowerCase().includes(query)));
  });
}
