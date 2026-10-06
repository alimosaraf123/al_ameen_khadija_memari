export const PRIVATE_ROUTES = [
  'visits','terminal-exams','teachers','teacher-attendance','teacher','teacher-security','system-admin',
  'superadmin','students','student-transfer','student-lifecycle','settings',
  'service-staff','routines','rooms','room-assignments','problems','office','notices',
  'marks','library','illness','id-cards','guardians','guardian','guardian-student',
  'gateman','gate-pass','dues','documents','dining-stock','deposit-fund',
  'deposit-fund-report','class-results','behavior','audit-log','attendance',
] as const;
export function canOpenRoute(route:string,user:any) {
  if(!user?.is_active || !user?.role)return false;
  if(user.password_change_required && route!=='settings')return false;
  if(route==='superadmin')return ['admin','super_admin'].includes(user.role);
  if(route==='teacher-attendance')return ['admin','super_admin'].includes(user.role);
  if(route==='system-admin')return user.role==='super_admin';
  if(['guardian','guardian-student'].includes(route))return user.role==='guardian';
  if(route==='teacher')return ['teacher','admin','super_admin'].includes(user.role);
  if(['office','library','gateman'].includes(route))return [route,'admin','super_admin'].includes(user.role);
  return true;
}
