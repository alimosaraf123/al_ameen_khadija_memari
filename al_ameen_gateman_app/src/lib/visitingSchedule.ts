export function getClassGrade(className?: string | null): number | null {
  if (!className) return null;
  const c = String(className).trim().toUpperCase();
  if (c.startsWith('XII') || c.startsWith('12')) return 12;
  if (c.startsWith('XI') || c.startsWith('11')) return 11;
  if (c.startsWith('X') || c.startsWith('10')) return 10;
  if (c.startsWith('IX') || c.startsWith('9')) return 9;
  if (c.startsWith('VIII') || c.startsWith('8')) return 8;
  if (c.startsWith('VII') || c.startsWith('7')) return 7;
  if (c.startsWith('VI') || c.startsWith('6')) return 6;
  if (c.startsWith('V') || c.startsWith('5')) return 5;
  return null;
}

export function getSundayOfMonth(date: Date | string): number {
  const d = new Date(date);
  if (d.getDay() !== 0) return 0;
  return Math.ceil(d.getDate() / 7);
}

export function checkVisitingSchedule(date: Date | string, className?: string | null) {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return { allowed: false, isSunday: false, sundayNumber: 0, message: 'Invalid date specified.' };
  }

  const isSunday = d.getDay() === 0;
  const dayOfMonth = d.getDate();
  const sundayNumber = isSunday ? Math.ceil(dayOfMonth / 7) : 0;
  const grade = getClassGrade(className);

  const sundayOrdinals = ['', '1st', '2nd', '3rd', '4th', '5th'];
  const todaySundayText = isSunday ? `${sundayOrdinals[sundayNumber]} Sunday` : 'Weekday (Not Sunday)';

  const isOddGrade = grade ? grade % 2 === 1 : null;
  const scheduledText = grade 
    ? (isOddGrade ? '1st & 3rd Sunday' : '2nd & 4th Sunday')
    : 'Sundays only';

  if (!isSunday) {
    return {
      allowed: false,
      isSunday: false,
      sundayNumber: 0,
      grade,
      todaySundayText,
      scheduledText,
      message: `Visiting is only allowed on scheduled Sundays. The selected date is not Sunday (${d.toLocaleDateString('en-IN', { weekday: 'long' })}).`,
    };
  }

  if (sundayNumber === 5) {
    return {
      allowed: false,
      isSunday: true,
      sundayNumber: 5,
      grade,
      todaySundayText,
      scheduledText,
      message: `5th Sunday has NO visiting permitted (মাসের ৫ম রবিবারে কোনো ভিজিটিং হবে না)।`,
    };
  }

  if (grade) {
    const allowedSundays = isOddGrade ? [1, 3] : [2, 4];
    if (!allowedSundays.includes(sundayNumber)) {
      return {
        allowed: false,
        isSunday: true,
        sundayNumber,
        grade,
        todaySundayText,
        scheduledText,
        message: `Class ${className} visiting is only scheduled on ${scheduledText}. Selected date is ${todaySundayText} (ক্লাস ${className}-এর জন্য শুধুমাত্র ${scheduledText} বরাদ্দ)।`,
      };
    }
  }

  return {
    allowed: true,
    isSunday: true,
    sundayNumber,
    grade,
    todaySundayText,
    scheduledText,
    message: `Scheduled visiting day for Class ${className || ''} (${todaySundayText}).`,
  };
}
