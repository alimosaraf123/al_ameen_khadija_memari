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

export function isPassoutStudent(student: any): boolean {
  if (!student || student.is_active) return false;
  const reason = String(student.dropout_reason || '').toLowerCase();
  if (reason.includes('pass') && reason.includes('out')) return true;
  const from = parseInt(String(student.session_from ?? '').trim(), 10);
  const to = parseInt(String(student.session_to ?? '').trim(), 10);
  if (!Number.isNaN(from) && from <= 2025) return true;
  if (!Number.isNaN(to) && to <= 2025) return true;
  return false;
}

export function studentStatusLabel(student: any): 'Active' | 'Passout' | 'Dropout' {
  if (student?.is_active) return 'Active';
  return isPassoutStudent(student) ? 'Passout' : 'Dropout';
}

export function filterStudents(students: any[], filters: StudentFilters) {
  const query = filters.search.trim().toLowerCase();
  return students.filter(student => {
    const gender = String(student.gender || '').trim().toLowerCase();
    const normalizedGender = gender === 'm' ? 'male' : gender === 'f' ? 'female' : gender;
    const isPastSessionSelected = filters.year !== 'all' && filters.year !== '2026-2027' && filters.year !== '2026-2026';
    const matchesStatus =
      filters.status === 'all' ||
      (isPastSessionSelected && filters.status === 'active') ||
      (filters.status === 'active'
        ? student.is_active === true
        : filters.status === 'passout'
          ? isPassoutStudent(student)
          : filters.status === 'dropout'
            ? student.is_active === false && !isPassoutStudent(student)
            : student.is_active === false);
    return (filters.year === 'all' || studentSession(student) === filters.year)
      && (filters.className === 'all' || normalizeStudentClass(student.class_name) === normalizeStudentClass(filters.className))
      && (filters.gender === 'all' || normalizedGender === filters.gender)
      && matchesStatus
      && (!query || ['student_name', 'registration_no', 'mobile_number', 'guardian_mobile', 'whatsapp_number', 'room_name']
        .some(key => String(student[key] ?? '').toLowerCase().includes(query)));
  });
}
