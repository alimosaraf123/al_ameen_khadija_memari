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

// Accurate Bengali Date Calculator (West Bengal revised calendar)
export function getBengaliDate(date = new Date()): string {
  const d = date.getDate();
  const m = date.getMonth(); // 0 = Jan, 10 = Nov
  const y = date.getFullYear();

  const banglaMonths = [
    'বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ',
    'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ',
    'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'
  ];
  const banglaDays = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

  const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const startDay = 14; // April 14 is 1st Boishakh

  const bYear = (m < 3 || (m === 3 && d < startDay)) ? y - 594 : y - 593;

  const startOfBanglaYear = new Date(y, 3, startDay);
  if (date < startOfBanglaYear) {
    startOfBanglaYear.setFullYear(y - 1);
  }
  const diffDays = Math.floor((date.getTime() - startOfBanglaYear.getTime()) / (1000 * 60 * 60 * 24));

  const monthLengths = [31, 31, 31, 31, 31, 30, 30, 30, 30, 30, isLeapYear ? 30 : 29, 30];
  let remDays = Math.max(0, diffDays);
  let bMonth = 0;
  for (let i = 0; i < 12; i++) {
    if (remDays < monthLengths[i]) {
      bMonth = i;
      break;
    }
    remDays -= monthLengths[i];
  }
  const bDay = remDays + 1;
  const dayName = banglaDays[date.getDay()];

  return `${dayName}, ${toBanglaDigits(bDay)} ${banglaMonths[bMonth]}, ${toBanglaDigits(bYear)} বঙ্গাব্দ`;
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

// Hijri / Islamic Date with Arabic Day, Month, and Year
export function getHijriDate(date = new Date()): string {
  try {
    const dayName = ARABIC_DAYS[date.getDay()] || '';
    const formatter = new Intl.DateTimeFormat('bn-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const formatted = formatter.format(date).replace(/\s*যুগ\s*$/, '').trim();
    return `${dayName}, ${formatted} হিজরি`;
  } catch {
    return 'হিজরি ক্যালেন্ডার';
  }
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
