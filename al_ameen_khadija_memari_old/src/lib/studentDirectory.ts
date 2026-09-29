export function normalizeStudentClass(value: unknown): string {
  const text = String(value ?? '').trim();
  const key = text.toLowerCase().replace(/[\s.\-]+/g, '');
  if (key === 'xisc') return 'XI-Sc.';
  if (key === 'xiisc') return 'XII-Sc.';
  return text;
}
export type StudentFilters = { year: string; className: string; gender: string; status: string; search: string };

export function sessionYears(student: any): number[] {
  const year = (value: unknown) => {
    const match = String(value ?? '').match(/(?:19|20|21)\d{2}/);
    return match ? Number(match[0]) : null;
  };
  const from = year(student.session_from);
  const to = year(student.session_to);
  if (from !== null) {
    const last = to !== null && to >= from ? to : from;
    return Array.from({ length: Math.min(last - from + 1, 100) }, (_, i) => from + i);
  }
  if (to !== null) return [to];
  return [];
}

export function filterStudents(students: any[], filters: StudentFilters) {
  const query = filters.search.trim().toLowerCase();
  return students.filter(student => {
    const gender = String(student.gender || '').trim().toLowerCase();
    const normalizedGender = gender === 'm' ? 'male' : gender === 'f' ? 'female' : gender;
    return (filters.year === 'all' || sessionYears(student).includes(Number(filters.year)))
      && (filters.className === 'all' || normalizeStudentClass(student.class_name) === normalizeStudentClass(filters.className))
      && (filters.gender === 'all' || normalizedGender === filters.gender)
      && (filters.status === 'all' || (filters.status === 'active' ? student.is_active === true : student.is_active === false))
      && (!query || ['student_name', 'registration_no', 'mobile_number', 'guardian_mobile', 'whatsapp_number', 'room_name']
        .some(key => String(student[key] ?? '').toLowerCase().includes(query)));
  });
}
