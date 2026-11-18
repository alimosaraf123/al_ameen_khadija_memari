export const PRIVATE_ROUTES = [
  'display-control',
  'visits', 'terminal-exams', 'teachers', 'teacher-attendance', 'teacher-settings', 'teacher', 'teacher-security', 'system-admin',
  'superadmin', 'students', 'student-transfer', 'student-lifecycle', 'settings',
  'service-staff', 'routines', 'rooms', 'room-assignments', 'problems', 'office', 'notices',
  'marks', 'library', 'illness', 'id-cards', 'guardians', 'guardian', 'guardian-student',
  'gateman', 'gate-pass', 'dues', 'documents', 'dining-stock', 'deposit-fund',
  'deposit-fund-report', 'fees', 'hostel-fees', 'class-results', 'behavior', 'asset-register', 'audit-log', 'attendance',
] as const;

const HOSTEL_FEES_BLOCKED_USER_IDS = new Set(['27', '381', '382']);

export function isHostelFeesBlockedUser(user: any): boolean {
  if (!user || user.role === 'super_admin') return false;
  const uid = String(user.id ?? user.userId ?? '').trim();
  if (HOSTEL_FEES_BLOCKED_USER_IDS.has(uid)) return true;
  const hay = `${user.login_id || user.loginId || ''} ${user.full_name || user.name || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return (
    hay.includes('noorsaba') ||
    hay.includes('masema') ||
    hay.includes('masuma') ||
    hay.includes('nasmin')
  );
}

export function canOpenRoute(route: string, user: any) {
  if (!user?.is_active || !user?.role) return false;
  if (user.password_change_required && route !== 'settings') return false;
  if (route === 'display-control') return ['admin', 'super_admin'].includes(user.role);
  if (route === 'superadmin') return ['admin', 'super_admin'].includes(user.role);
  if (route === 'teacher-attendance') return ['admin', 'super_admin'].includes(user.role);
  if (route === 'teacher-settings') return ['teacher', 'admin', 'super_admin'].includes(user.role);
  if (route === 'asset-register') return ['admin', 'super_admin'].includes(user.role);
  if (route === 'hostel-fees') return ['office', 'admin', 'super_admin'].includes(user.role) && !isHostelFeesBlockedUser(user);
  if (route === 'system-admin') return user.role === 'super_admin';
  if (['guardian', 'guardian-student'].includes(route)) return user.role === 'guardian';
  if (route === 'teacher') return ['teacher', 'admin', 'super_admin'].includes(user.role);
  if (['office', 'library', 'gateman'].includes(route)) return [route, 'admin', 'super_admin'].includes(user.role);
  return true;
}
