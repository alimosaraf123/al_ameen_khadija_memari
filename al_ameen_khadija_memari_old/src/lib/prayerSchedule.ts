import { Coordinates, CalculationMethod, Madhab, PrayerTimes } from 'adhan';

// Coordinates for Al-Ameen Mission Academy Memari
export const MEMARI_COORDINATES = {
  latitude: 23.186813165763375,
  longitude: 88.11163491185468,
};

export interface PrayerRow {
  key: string;
  name: string;
  arabicName?: string;
  start: Date;
  end?: Date;
  startText: string;
  endText: string;
  isProhibited: boolean;
  isNafal?: boolean;
  note: string;
  isCurrent: boolean;
}

export interface DaySchedule {
  englishDate: string;
  bengaliDate: string;
  hijriDate: string;
  currentWaqt: string;
  currentWaqtSubtext: string;
  rows: PrayerRow[];
}

const BANGLA_NUMS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const toBanglaDigits = (str: string | number) =>
  String(str).replace(/\d/g, (d) => BANGLA_NUMS[Number(d)]);

const formatTime12 = (d: Date, toBangla = true) => {
  let hrs = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  hrs = hrs % 12;
  hrs = hrs ? hrs : 12;
  const timeStr = `${String(hrs).padStart(2, '0')}:${mins} ${ampm}`;
  return toBangla ? toBanglaDigits(timeStr) : timeStr;
};

// Accurate Bengali Date Calculator (West Bengal Solar Panjika / সূর্যসিদ্ধান্ত পঞ্জিকা)
const WB_MONTH_TRANSITIONS = [
  { gMonth: 0, gDay: 15, bMonth: 'মাঘ', prevMonth: 'পৌষ', prevDays: 30 },
  { gMonth: 1, gDay: 14, bMonth: 'ফাল্গুন', prevMonth: 'মাঘ', prevDays: 30 },
  { gMonth: 2, gDay: 15, bMonth: 'চৈত্র', prevMonth: 'ফাল্গুন', prevDays: 30 },
  { gMonth: 3, gDay: 15, bMonth: 'বৈশাখ', prevMonth: 'চৈত্র', prevDays: 30 },
  { gMonth: 4, gDay: 16, bMonth: 'জ্যৈষ্ঠ', prevMonth: 'বৈশাখ', prevDays: 31 },
  { gMonth: 5, gDay: 16, bMonth: 'আষাঢ়', prevMonth: 'জ্যৈষ্ঠ', prevDays: 31 },
  { gMonth: 6, gDay: 17, bMonth: 'শ্রাবণ', prevMonth: 'আষাঢ়', prevDays: 31 },
  { gMonth: 7, gDay: 18, bMonth: 'ভাদ্র', prevMonth: 'শ্রাবণ', prevDays: 31 },
  { gMonth: 8, gDay: 18, bMonth: 'আশ্বিন', prevMonth: 'ভাদ্র', prevDays: 31 },
  { gMonth: 9, gDay: 18, bMonth: 'কার্তিক', prevMonth: 'আশ্বিন', prevDays: 30 },
  { gMonth: 10, gDay: 18, bMonth: 'অগ্রহায়ণ', prevMonth: 'কার্তিক', prevDays: 30 },
  { gMonth: 11, gDay: 17, bMonth: 'পৌষ', prevMonth: 'অগ্রহায়ণ', prevDays: 30 },
];

export function getBengaliDate(date = new Date()): string {
  const gYear = date.getFullYear();
  const gMonth = date.getMonth();
  const gDate = date.getDate();
  const trans = WB_MONTH_TRANSITIONS[gMonth];

  const banglaDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
  const dayName = banglaDays[date.getDay()];

  const bYear = (gMonth < 3 || (gMonth === 3 && gDate < 15)) ? gYear - 594 : gYear - 593;

  let bDay: number;
  let bMonthName: string;

  if (gDate >= trans.gDay) {
    bDay = gDate - trans.gDay + 1;
    bMonthName = trans.bMonth;
  } else {
    bDay = trans.prevDays - (trans.gDay - gDate - 1);
    bMonthName = trans.prevMonth;
  }

  return `${dayName}, ${toBanglaDigits(bDay)} ${bMonthName}, ${toBanglaDigits(bYear)} বঙ্গাব্দ`;
}

// Arabic day of week (রবিবার থেকে শনিবার)
export const ARABIC_DAYS = [
  'আল-আহাদ (الأحد)',     // Sunday
  'আল-ইছনাইন (الإثنين)',   // Monday
  'আস-সুলাসা (الثلاثاء)',  // Tuesday
  'আল-আরবাআ (الأربعاء)',  // Wednesday
  'আল-খামিস (الخميس)',    // Thursday
  'আল-জুমুআ (الجمعة)',    // Friday
  'আস-সাবত (السبت)',     // Saturday
];

// Arabic Islamic months in Bengali
export const HIJRI_MONTHS = [
  'মহররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি',
  'জমাদিউল আউয়াল', 'জমাদিউস সানি', 'রজব', 'শাবান',
  'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'
];

function getAlgorithmicHijriDate(date = new Date()): { day: number; monthName: string; year: number } {
  const gYear = date.getFullYear();
  const gMonth = date.getMonth();
  const gDay = date.getDate();

  let m = gMonth + 1;
  let y = gYear;
  if (m < 3) {
    y -= 1;
    m += 12;
  }

  let a = Math.floor(y / 100);
  let b = 2 - a + Math.floor(a / 4);
  if (y < 1583) b = 0;
  if (y === 1582) {
    if (m > 10) b = -10;
    if (m === 10) {
      b = 0;
      if (gDay > 4) b = -10;
    }
  }

  let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + gDay + b - 1524;
  jd += 1; // Subcontinent / Umm al-Qura lunar sighting offset

  let z = jd;
  let l = z - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
  l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  m = Math.floor((24 * l) / 709);
  let d = l - Math.floor((709 * m) / 24);
  y = 30 * n + j - 30;

  const monthIdx = Math.max(0, Math.min(11, m - 1));
  return { day: d, monthName: HIJRI_MONTHS[monthIdx] || 'জমাদিউস সানি', year: y };
}

// Hijri / Islamic Date with Arabic Day, Month, and Year
export function getHijriDate(date = new Date()): string {
  const dayName = ARABIC_DAYS[date.getDay()] || '';
  try {
    const formatter = new Intl.DateTimeFormat('bn-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formatted = formatter.format(date).replace(/\s*যুগ\s*$/, '').trim();
    // Validate that Intl didn't fall back to Gregorian months like "জুন", "নভেম্বর" or "খ্রিস্টপূর্ব"
    const isBadFallback = /জুন|জানুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর|খ্রিস্টপূর্ব/i.test(formatted);
    if (!isBadFallback && formatted.length > 5) {
      return `${dayName}, ${formatted} হিজরি`;
    }
  } catch {}

  // Pure standalone algorithmic calculation fallback
  const h = getAlgorithmicHijriDate(date);
  return `${dayName}, ${toBanglaDigits(h.day)} ${h.monthName}, ${toBanglaDigits(h.year)} হিজরি`;
}

export function getDaySchedule(date = new Date(), adjustments = { fajr: -3, sunrise: -2, dhuhr: 3, asr: 1, maghrib: 5, isha: 0 }): DaySchedule {
  const coords = new Coordinates(MEMARI_COORDINATES.latitude, MEMARI_COORDINATES.longitude);
  const params = CalculationMethod.Karachi();
  params.madhab = Madhab.Hanafi;

  // Apply subtle precautions matching local campus/mosque display boards
  params.adjustments.fajr = adjustments.fajr;
  params.adjustments.sunrise = adjustments.sunrise;
  params.adjustments.dhuhr = adjustments.dhuhr;
  params.adjustments.asr = adjustments.asr;
  params.adjustments.maghrib = adjustments.maghrib;
  params.adjustments.isha = adjustments.isha;

  const pt = new PrayerTimes(coords, date, params);

  // Derived periods:
  // Ishraq: 10 mins after sunrise until mid-morning (~8:40 AM)
  const ishraqStart = new Date(pt.sunrise.getTime() + 10 * 60000);
  const ishraqEnd = new Date(date);
  ishraqEnd.setHours(8, 40, 0, 0);

  // Zawal (prohibited): 5 mins before Dhuhr until Dhuhr start
  const zawalStart = new Date(pt.dhuhr.getTime() - 5 * 60000);
  const zawalEnd = new Date(pt.dhuhr);

  // Sunset prohibited window: ~16 mins before Maghrib
  const sunsetProhibitedStart = new Date(pt.maghrib.getTime() - 16 * 60000);
  const sunsetProhibitedEnd = new Date(pt.maghrib);

  // Tahajjud: 11:00 PM until 10 mins before Fajr
  const tahajjudStart = new Date(date);
  tahajjudStart.setHours(23, 0, 0, 0);
  const tahajjudEnd = new Date(pt.fajr.getTime() - 5 * 60000);

  const now = new Date();
  const checkCurrent = (s: Date, e: Date) => now >= s && now < e;

  const rows: PrayerRow[] = [
    {
      key: 'fajr',
      name: 'ফজর',
      arabicName: 'الفجر',
      start: pt.fajr,
      end: pt.sunrise,
      startText: formatTime12(pt.fajr),
      endText: formatTime12(pt.sunrise),
      isProhibited: false,
      note: 'সুবহে সাদিক থেকে সূর্যোদয়ের পূর্ব পর্যন্ত',
      isCurrent: checkCurrent(pt.fajr, pt.sunrise),
    },
    {
      key: 'sunrise_prohibited',
      name: 'সূর্যোদয় (নামাজ নিষেধ)',
      start: pt.sunrise,
      end: ishraqStart,
      startText: formatTime12(pt.sunrise),
      endText: formatTime12(ishraqStart),
      isProhibited: true,
      note: 'সূর্য ওঠার সময় যেকোনো নামাজ পড়া সম্পূর্ণ নিষেধ',
      isCurrent: checkCurrent(pt.sunrise, ishraqStart),
    },
    {
      key: 'ishraq',
      name: 'ইশরাক ও চাশত',
      arabicName: 'الإشراق',
      start: ishraqStart,
      end: ishraqEnd,
      startText: formatTime12(ishraqStart),
      endText: formatTime12(ishraqEnd),
      isProhibited: false,
      isNafal: true,
      note: 'নফল নামাজের উত্তম মোস্তাহাব সময়',
      isCurrent: checkCurrent(ishraqStart, ishraqEnd),
    },
    {
      key: 'zawal_prohibited',
      name: 'জোয়াল / জাওয়াল (নামাজ নিষেধ)',
      start: zawalStart,
      end: zawalEnd,
      startText: formatTime12(zawalStart),
      endText: formatTime12(zawalEnd),
      isProhibited: true,
      note: 'ঠিক দ্বিপ্রহরে সূর্য মাথার উপর থাকাকালীন নামাজ নিষেধ',
      isCurrent: checkCurrent(zawalStart, zawalEnd),
    },
    {
      key: 'dhuhr',
      name: 'যোহর',
      arabicName: 'الظهر',
      start: pt.dhuhr,
      end: pt.asr,
      startText: formatTime12(pt.dhuhr),
      endText: formatTime12(pt.asr),
      isProhibited: false,
      note: 'সূর্য ঢলে পড়ার পর থেকে আসরের পূর্ব পর্যন্ত',
      isCurrent: checkCurrent(pt.dhuhr, pt.asr),
    },
    {
      key: 'asr',
      name: 'আসর (হানাফী)',
      arabicName: 'العصر',
      start: pt.asr,
      end: sunsetProhibitedStart,
      startText: formatTime12(pt.asr),
      endText: formatTime12(pt.maghrib),
      isProhibited: false,
      note: 'ছায়া দ্বিগুণ হওয়া থেকে সূর্যাস্ত পর্যন্ত',
      isCurrent: checkCurrent(pt.asr, sunsetProhibitedStart),
    },
    {
      key: 'sunset_prohibited',
      name: 'সূর্যাস্ত (নামাজ নিষেধ)',
      start: sunsetProhibitedStart,
      end: sunsetProhibitedEnd,
      startText: formatTime12(sunsetProhibitedStart),
      endText: formatTime12(sunsetProhibitedEnd),
      isProhibited: true,
      note: 'সূর্য ডোবার মুহূর্ত (শুধু আসরের ফরজ বাকি থাকলে পড়া যায়)',
      isCurrent: checkCurrent(sunsetProhibitedStart, sunsetProhibitedEnd),
    },
    {
      key: 'maghrib',
      name: 'মাগরিব',
      arabicName: 'المغرب',
      start: pt.maghrib,
      end: pt.isha,
      startText: formatTime12(pt.maghrib),
      endText: formatTime12(pt.isha),
      isProhibited: false,
      note: 'সূর্যাস্তের পর থেকে পশ্চিম আকাশের লালিমা থাকা পর্যন্ত',
      isCurrent: checkCurrent(pt.maghrib, pt.isha),
    },
    {
      key: 'isha',
      name: 'ইশা',
      arabicName: 'العشاء',
      start: pt.isha,
      end: pt.fajr,
      startText: formatTime12(pt.isha),
      endText: 'সুবহে সাদিক',
      isProhibited: false,
      note: 'লালিমা দূর হওয়ার পর থেকে সুবহে সাদিকের পূর্ব পর্যন্ত',
      isCurrent: (now >= pt.isha) || (now < pt.fajr),
    },
    {
      key: 'tahajjud',
      name: 'তাহাজ্জুদ',
      arabicName: 'التهجد',
      start: tahajjudStart,
      end: tahajjudEnd,
      startText: formatTime12(tahajjudStart),
      endText: formatTime12(tahajjudEnd),
      isProhibited: false,
      isNafal: true,
      note: 'রাতের শেষ তৃতীয়াংশে তাহাজ্জুদের সেরা সময়',
      isCurrent: (now.getHours() >= 23 || now < tahajjudEnd),
    },
  ];

  let currentWaqt = 'সাধারণ সময়';
  let currentWaqtSubtext = '';
  const currentItem = rows.find(r => r.isCurrent);
  if (currentItem) {
    if (currentItem.isProhibited) {
      currentWaqt = `⚠️ এখন ${currentItem.name}`;
      currentWaqtSubtext = currentItem.note;
    } else {
      currentWaqt = `🟢 এখন ${currentItem.name} এর ওয়াক্ত চলছে`;
      currentWaqtSubtext = `শেষ সময়: ${currentItem.endText}`;
    }
  }

  const englishDate = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    englishDate,
    bengaliDate: getBengaliDate(date),
    hijriDate: getHijriDate(date),
    currentWaqt,
    currentWaqtSubtext,
    rows,
  };
}
