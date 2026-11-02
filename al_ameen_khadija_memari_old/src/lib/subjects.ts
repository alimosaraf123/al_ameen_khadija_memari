export const SUBJECTS = ['Arabic', 'Art', 'Beng', 'Bio', 'Chem', 'Comp', 'Eng', 'Eng-I', 'Eng-II', 'Geo', 'Hind', 'Hist', 'L.Sc', 'Math', 'P.Sc', 'Phy', 'Sci'];

export const SUBJECT_DETAILS: Record<string, { full: string; aliases: string[] }> = {
  'Arabic': { full: 'Arabic', aliases: ['Arab', 'Arabic'] },
  'Art': { full: 'Art', aliases: ['Drawing', 'Art'] },
  'Beng': { full: 'Bengali', aliases: ['Bengali', 'Bangla', 'Beng'] },
  'Bio': { full: 'Biology', aliases: ['Biology', 'Bio'] },
  'Chem': { full: 'Chemistry', aliases: ['Chemistry', 'Chem'] },
  'Comp': { full: 'Computer', aliases: ['Computer', 'Comp', 'Computer Science'] },
  'Eng': { full: 'English', aliases: ['English', 'Eng'] },
  'Eng-I': { full: 'English I', aliases: ['English 1', 'Eng 1', 'Eng-I', 'English-I'] },
  'Eng-II': { full: 'English II', aliases: ['English 2', 'Eng 2', 'Eng-II', 'English-II'] },
  'Geo': { full: 'Geography', aliases: ['Geography', 'Geo'] },
  'Hind': { full: 'Hindi', aliases: ['Hindi', 'Hind'] },
  'Hist': { full: 'History', aliases: ['History', 'Hist', 'Histroy'] },
  'L.Sc': { full: 'Life Science', aliases: ['Life Science', 'L.Sc', 'LSc'] },
  'Math': { full: 'Mathematics', aliases: ['Mathematics', 'Math', 'Maths'] },
  'P.Sc': { full: 'Physical Science', aliases: ['Physical Science', 'P.Sc', 'PSc'] },
  'Phy': { full: 'Physics', aliases: ['Physics', 'Phy'] },
  'Sci': { full: 'Science', aliases: ['Science', 'Sci', 'Gen Sci'] }
};

export const SUBJECT_OPTIONS = SUBJECTS.map(code => {
  const d = SUBJECT_DETAILS[code];
  const full = d ? d.full : code;
  return {
    value: code,
    label: full !== code ? `${code} (${full})` : code,
    shortLabel: code,
    keywords: d ? [code, full, ...d.aliases] : [code]
  };
});
