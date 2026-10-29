import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { API_BASE } from '../lib/api';

interface StudentResult {
  rank: number;
  file: string;
  registration_no: string;
  mission_reg_no?: string;
  student_name: string;
  school_name: string;
  class_name: string;
  total_questions: number;
  correct_count: number;
  correct_questions: number[];
  wrong_count: number;
  wrong_questions: number[];
  blank_count: number;
  blank_questions: number[];
  final_score: number;
  full_marks: number;
  student_answers: Record<string, string>;
}

const makeBlankKey = (count = 35): Record<string, string> => {
  const k: Record<string, string> = {};
  for (let i = 1; i <= count; i++) {
    k[String(i)] = '';
  }
  return k;
};

export default function OmrEvaluation() {
  // Exam Configuration & Inputs (Starts fresh & blank on page load)
  const [examName, setExamName] = useState<string>('');
  const [totalQuestions, setTotalQuestions] = useState<string>('35');
  const [marksPerCorrect, setMarksPerCorrect] = useState<string>('1.0');
  const [negativeMark, setNegativeMark] = useState<string>('0.0');
  const [fullMarks, setFullMarks] = useState<string>('35.0');

  // Answer Key
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [answerKey, setAnswerKey] = useState<Record<string, string>>(() => makeBlankKey(35));

  // Answer Key Presets (DB & LocalStorage)
  const [presetList, setPresetList] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [savingPreset, setSavingPreset] = useState<boolean>(false);
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);

  // State
  const [evaluating, setEvaluating] = useState(false);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
  const [folderInfo, setFolderInfo] = useState({ path: 'd:\\memari_soft\\omr_scans', total: 0 });
  const fileInputRef = React.useRef<any>(null);
  const cameraInputRef = React.useRef<any>(null);

  // Terminal Exam Sync State
  const [terminalTargets, setTerminalTargets] = useState<any[]>([]);
  const [selectedExamSubjectId, setSelectedExamSubjectId] = useState<string>('');
  const [syncingTerminal, setSyncingTerminal] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters: School, Class, Rank, Reg No, Student Name & Search for results table
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [filterRank, setFilterRank] = useState<string>('ALL');
  const [filterRegNo, setFilterRegNo] = useState<string>('');
  const [filterStudentName, setFilterStudentName] = useState<string>('');
  const [resultSearchQuery, setResultSearchQuery] = useState<string>('');
  const [resultSortBy, setResultSortBy] = useState<string>('rank');

  // Past Records & Evaluation Archive
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveRecords, setArchiveRecords] = useState<any[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveTab, setArchiveTab] = useState<'evaluations' | 'presets' | 'scans'>('evaluations');
  const [scannedFilesList, setScannedFilesList] = useState<any[]>([]);

  const loadFolderInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/omr/folder-info`);
      const data = await res.json();
      if (data.success) {
        setFolderInfo({ path: data.folder_path, total: data.total_files });
      }
    } catch (_) {}
  };

  const loadTerminalTargets = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/omr/terminal-targets`);
      const data = await res.json();
      if (data.success && Array.isArray(data.targets)) {
        setTerminalTargets(data.targets);
      }
    } catch (_) {}
  };

  const loadArchiveRecords = async () => {
    setLoadingArchive(true);
    try {
      const res = await fetch(`${API_BASE}/api/omr/records`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.records)) {
        setArchiveRecords(data.records);
      }
    } catch (_) {}
    try {
      const res2 = await fetch(`${API_BASE}/api/omr/scans-list`);
      const data2 = await res2.json();
      if (data2 && data2.success && Array.isArray(data2.files)) {
        setScannedFilesList(data2.files);
      }
    } catch (_) {}
    setLoadingArchive(false);
  };

  const handleLoadPastRecord = async (recordId: number) => {
    setLoadingArchive(true);
    try {
      const res = await fetch(`${API_BASE}/api/omr/records/${recordId}`);
      const data = await res.json();
      if (data && data.success && data.record) {
        const rec = data.record;
        setExamName(rec.exam_name || '');
        setPresetNameInput(rec.exam_name || '');
        setTotalQuestions(rec.total_questions ? String(rec.total_questions) : '35');
        setMarksPerCorrect(rec.marks_per_correct !== undefined ? String(rec.marks_per_correct) : '1.0');
        setNegativeMark(rec.negative_mark !== undefined ? String(rec.negative_mark) : '0.0');
        setFullMarks(rec.full_marks !== undefined ? String(rec.full_marks) : '35.0');

        let parsedKey = rec.answer_key;
        if (typeof parsedKey === 'string') {
          try { parsedKey = JSON.parse(parsedKey); } catch (_) {}
        }
        if (parsedKey && typeof parsedKey === 'object') {
          const qCount = parseInt(rec.total_questions, 10) || 35;
          const cleanKey: Record<string, string> = {};
          for (let i = 1; i <= qCount; i++) {
            const v = (parsedKey && (parsedKey[String(i)] || parsedKey[i])) || '';
            cleanKey[String(i)] = String(v).trim().toUpperCase();
          }
          setAnswerKey(cleanKey);
        }

        let parsedResults = rec.results;
        if (typeof parsedResults === 'string') {
          try { parsedResults = JSON.parse(parsedResults); } catch (_) {}
        }
        if (Array.isArray(parsedResults)) {
          setResults(parsedResults);
        }

        setShowArchiveModal(false);
        Alert.alert(
          'Past Record Loaded! 📂',
          `Evaluation for "${rec.exam_name}" loaded successfully!\nTotal Candidates: ${rec.total_candidates}\nDate: ${new Date(rec.created_at).toLocaleDateString('en-GB')}`
        );
      } else {
        Alert.alert('Load Error', data?.message || 'Could not load record');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoadingArchive(false);
    }
  };

  const handleDeletePastRecord = async (recordId: number) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm('Are you sure you want to delete this past evaluation record?')) return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/omr/records/${recordId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        await loadArchiveRecords();
        Alert.alert('Deleted', 'Record removed from archive.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  // Admin ability to remove an individual candidate from active results
  const handleRemoveCandidate = (regNo: string, studentName?: string) => {
    const confirmMsg = `Remove "${studentName || regNo}" from results?\n\nThis candidate will be deleted from the current evaluation results.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }

    setResults(prevResults => {
      const updated = prevResults.filter(r => String(r.registration_no).trim() !== String(regNo).trim());
      return updated.map((r, idx) => ({
        ...r,
        rank: idx + 1
      }));
    });
    setSelectedStudent(null);
  };

  const applyPresetObject = (p: any, showAlert = false) => {
    if (!p) return;
    const pid = String(p.id);
    setSelectedPresetId(pid);
    const pName = p.name || p.exam_name || '';
    setExamName(pName);
    setPresetNameInput(pName);
    const qCount = parseInt(p.total_questions, 10) || 35;
    setTotalQuestions(String(qCount));
    setMarksPerCorrect(p.marks_per_correct !== undefined && p.marks_per_correct !== null ? String(p.marks_per_correct) : '1.0');
    setNegativeMark(p.negative_mark !== undefined && p.negative_mark !== null ? String(p.negative_mark) : '0.0');
    setFullMarks(p.full_marks !== undefined && p.full_marks !== null ? String(p.full_marks) : String(qCount * 1.0));

    let parsedKey = p.answer_key;
    if (typeof parsedKey === 'string') {
      try {
        parsedKey = JSON.parse(parsedKey);
      } catch (_) {}
    }

    const cleanKey: Record<string, string> = {};
    for (let i = 1; i <= qCount; i++) {
      const v = (parsedKey && (parsedKey[String(i)] || parsedKey[i])) || '';
      cleanKey[String(i)] = String(v).trim().toUpperCase();
    }
    setAnswerKey(cleanKey);

    if (showAlert) {
      Alert.alert(
        'Preset Loaded! 📥',
        `Preset "${pName}" loaded!\nAll ${qCount} answers have been loaded into the OMR bubbles.`
      );
    }
  };

  const loadPresets = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/omr/answer-keys`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.keys)) {
        setPresetList(data.keys);
        return data.keys;
      }
    } catch (_) {}
    return [];
  };

  // Initial load: Ensure workspace starts 100% fresh and blank every time the page is opened
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        localStorage.removeItem('omr_active_config');
      } catch (_) {}
    }
    setResults([]);
    setSelectedStudent(null);
    setExamName('');
    setPresetNameInput('');
    setTotalQuestions('35');
    setMarksPerCorrect('1.0');
    setNegativeMark('0.0');
    setFullMarks('35.0');
    setSelectedPresetId('');
    setAnswerKey(makeBlankKey(35));
    setSyncStatusMsg(null);
    loadFolderInfo();
    loadTerminalTargets();
    loadPresets();
  }, []);

  // Inject print styles so that in Print Preview (Ctrl+P or Print Button), ONLY the Master Merit List is printed
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'omr-print-stylesheet';
      let styleTag = document.getElementById(styleId);
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = `
        /* Watermark placeholder styling in light black (হালকা কালো) */
        input::placeholder, textarea::placeholder {
          color: #64748b !important;
          opacity: 0.85 !important;
        }
        input::-webkit-input-placeholder, textarea::-webkit-input-placeholder {
          color: #64748b !important;
          opacity: 0.85 !important;
        }
        input::-moz-placeholder, textarea::-moz-placeholder {
          color: #64748b !important;
          opacity: 0.85 !important;
        }
        input:-ms-input-placeholder, textarea:-ms-input-placeholder {
          color: #64748b !important;
          opacity: 0.85 !important;
        }

        @media print {
          /* 1. Complete concealment of all screen controls, configuration boxes, action buttons, sync cards, and tabs */
          #omr-header-wrapper,
          #omr-controls-wrapper,
          .omr-no-print,
          [data-no-print="true"],
          #omr-no-print-card,
          #omr-no-print-actionbar,
          #omr-no-print-terminal,
          #omr-no-print-filters {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            min-height: 0 !important;
            max-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            opacity: 0 !important;
          }

          /* 2. Reset Expo & React Native Web body/root overflow constraints */
          html, body {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #root, #root > div, [data-testid="root"], [data-testid="safearea"] {
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            background: #ffffff !important;
            background-color: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          #omr-scroll-view, #omr-scroll-view > div {
            overflow: visible !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          div {
            overflow: visible !important;
          }

          /* 3. A4 Landscape page sizing and clean margin */
          @page {
            size: landscape;
            margin: 8mm 6mm;
          }

          /* 4. Master Merit List sheet formatting */
          #omr-master-merit-sheet {
            display: block !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }

          /* 5. Clean table rows without awkward page-break splits */
          .omr-table-row {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `;
      return () => {
        const tag = document.getElementById(styleId);
        if (tag) tag.remove();
      };
    }
  }, []);

  // Workspace always starts fresh and blank on every page visit (no auto-restoring old results from localStorage)

  // Derived filtered results
  const schoolList = Array.from(new Set(results.map(r => r.school_name).filter(Boolean)));
  const classList = Array.from(new Set(results.map(r => r.class_name).filter(Boolean)));

  const displayedResults = React.useMemo(() => {
    let list = [...results];
    if (selectedSchoolFilter && selectedSchoolFilter !== 'ALL') {
      list = list.filter(r => r.school_name === selectedSchoolFilter);
    }
    if (selectedClassFilter && selectedClassFilter !== 'ALL') {
      list = list.filter(r => (r.class_name || '').trim().toLowerCase() === selectedClassFilter.trim().toLowerCase());
    }
    // Filter by Rank (Top 5, Top 10, Top 20, Top 50, etc.)
    if (filterRank === 'top5') {
      list = list.filter(r => r.rank <= 5);
    } else if (filterRank === 'top10') {
      list = list.filter(r => r.rank <= 10);
    } else if (filterRank === 'top20') {
      list = list.filter(r => r.rank <= 20);
    } else if (filterRank === 'top50') {
      list = list.filter(r => r.rank <= 50);
    } else if (filterRank && filterRank !== 'ALL') {
      const rNum = parseInt(filterRank, 10);
      if (!isNaN(rNum)) {
        list = list.filter(r => r.rank === rNum);
      }
    }
    // Filter by Registration No / Mission ID
    if (filterRegNo.trim()) {
      const reg = filterRegNo.trim().toLowerCase();
      list = list.filter(r =>
        (r.registration_no || '').toLowerCase().includes(reg) ||
        (r.mission_reg_no || '').toLowerCase().includes(reg)
      );
    }
    // Filter by Student Name
    if (filterStudentName.trim()) {
      const sName = filterStudentName.trim().toLowerCase();
      list = list.filter(r => (r.student_name || '').toLowerCase().includes(sName));
    }
    // Global Search Query
    if (resultSearchQuery.trim()) {
      const q = resultSearchQuery.trim().toLowerCase();
      list = list.filter(r =>
        (r.student_name || '').toLowerCase().includes(q) ||
        (r.registration_no || '').toLowerCase().includes(q) ||
        (r.mission_reg_no || '').toLowerCase().includes(q) ||
        (r.school_name || '').toLowerCase().includes(q) ||
        (r.class_name || '').toLowerCase().includes(q)
      );
    }
    // Sorting
    if (resultSortBy === 'score_asc') {
      list.sort((a, b) => a.final_score - b.final_score);
    } else if (resultSortBy === 'name_asc') {
      list.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
    } else if (resultSortBy === 'name_desc') {
      list.sort((a, b) => (b.student_name || '').localeCompare(a.student_name || ''));
    } else if (resultSortBy === 'reg_asc') {
      list.sort((a, b) => (a.registration_no || '').localeCompare(b.registration_no || ''));
    } else if (resultSortBy === 'reg_desc') {
      list.sort((a, b) => (b.registration_no || '').localeCompare(a.registration_no || ''));
    } else if (resultSortBy === 'rank_desc') {
      list.sort((a, b) => b.rank - a.rank);
    } else {
      list.sort((a, b) => a.rank - b.rank);
    }
    return list;
  }, [results, selectedSchoolFilter, selectedClassFilter, filterRank, filterRegNo, filterStudentName, resultSearchQuery, resultSortBy]);

  // Push evaluated marks to Terminal Exam as Draft
  const handlePushToTerminalExam = async () => {
    if (!selectedExamSubjectId) {
      Alert.alert('Select Target Subject', 'Please select a Terminal Exam and Subject first.');
      return;
    }

    const target = terminalTargets.find(t => String(t.exam_subject_id) === String(selectedExamSubjectId));
    const countToSync = displayedResults.length;

    const confirmMsg = `Push ${countToSync} student marks to "${target?.exam_name} (Class ${target?.class_name} - ${target?.subject_name})" as a DRAFT?\n\n• Marks will be saved as Draft (status: assigned).\n• Teachers can review, edit/correct marks, or add Theory/Oral marks.\n• Student Mission IDs and School Registration numbers will be automatically matched.`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }

    setSyncingTerminal(true);
    setSyncStatusMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/omr/sync-terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_subject_id: Number(selectedExamSubjectId),
          results: displayedResults
        })
      });

      const data = await res.json();
      if (data.success) {
        setSyncStatusMsg({
          type: 'success',
          text: `✓ ${data.message} Status: DRAFT. You can now verify or edit in Terminal Exams.`
        });
        Alert.alert(
          'Saved as Draft',
          `${data.synced_count} student mark(s) successfully pushed to ${target?.exam_name} (${target?.class_name} - ${target?.subject_name}) as DRAFT!\n\nOpen Terminal Exam to verify or make corrections.`
        );
      } else {
        setSyncStatusMsg({
          type: 'error',
          text: `✕ ${data.message || 'Failed to sync with Terminal Exam'}`
        });
        Alert.alert('Sync Failed', data.message || 'Could not push marks');
      }
    } catch (err: any) {
      setSyncStatusMsg({ type: 'error', text: err.message });
      Alert.alert('Error', err.message);
    } finally {
      setSyncingTerminal(false);
    }
  };

  // Next School: Clear scanned sheets and table results, but KEEP the 35 Answer Key & Exam Settings intact!
  const handleClearForNextSchool = async () => {
    const confirmMsg = `Clear previous scans and results for the NEXT SCHOOL?\n\n• Answer Key (${totalQuestions} questions) will remain SAVED.\n• Exam settings ("${examName}") are preserved.\n• The scan folder will be cleared so you can upload the new school's sheets.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }
    setEvaluating(true);
    try {
      await fetch(`${API_BASE}/api/omr/clear-folder`, { method: 'POST' });
      setResults([]);
      setSelectedStudent(null);
      setSelectedSchoolFilter('ALL');
      setSelectedClassFilter('ALL');
      setFilterRank('ALL');
      setFilterRegNo('');
      setFilterStudentName('');
      setResultSearchQuery('');
      setResultSortBy('rank');
      setSyncStatusMsg(null);
      setFolderInfo({ ...folderInfo, total: 0 });
      Alert.alert(
        'Ready for Next School! 🏫',
        `Previous results and scans cleared.\nYour Answer Key (${totalQuestions} questions) and Exam Settings are PRESERVED!\n\nYou can now upload the next school's sheets and click "Run Evaluation".`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setEvaluating(false);
      await loadFolderInfo();
      await loadTerminalTargets();
    }
  };

  // Full reset for a completely new exam (blank workspace)
  const handleResetAndClear = async () => {
    const confirmMsg = "Completely wipe workspace for a NEW EXAM?\n\n• Clears scanned sheets.\n• Resets all results.\n• Clears exam name and question configuration.\n\n(Note: If you only want to evaluate the NEXT SCHOOL using this same answer key, use 'Next School (Keep Key)' instead!)";
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMsg)) return;
    }
    setEvaluating(true);
    try {
      await fetch(`${API_BASE}/api/omr/clear-folder`, { method: 'POST' });
      setResults([]);
      setSelectedStudent(null);
      setSelectedSchoolFilter('ALL');
      setSelectedClassFilter('ALL');
      setFilterRank('ALL');
      setFilterRegNo('');
      setFilterStudentName('');
      setResultSearchQuery('');
      setResultSortBy('rank');
      setSyncStatusMsg(null);
      setExamName('');
      setPresetNameInput('');
      setTotalQuestions('');
      setMarksPerCorrect('');
      setNegativeMark('');
      setFullMarks('');
      setSelectedPresetId('');
      setAnswerKey(makeBlankKey(35));
      setFolderInfo({ ...folderInfo, total: 0 });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          localStorage.removeItem('omr_active_config');
        } catch (_) {}
      }
      Alert.alert('Workspace Cleared', 'All previous data and scanned sheets have been wiped. The space is now completely blank and ready for a new evaluation.');
    } catch (e: any) {
      setResults([]);
      setSelectedStudent(null);
    } finally {
      setEvaluating(false);
      await loadFolderInfo();
      await loadTerminalTargets();
    }
  };

  // Reset answer key and inputs to blank (New Exam mode inside modal)
  const handleResetToBlank = (confirmFirst = false) => {
    if (confirmFirst && Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm('Clear all fields and answer bubbles to blank (New Exam mode)?')) return;
    }
    setSelectedPresetId('');
    setExamName('');
    setPresetNameInput('');
    setTotalQuestions('');
    setMarksPerCorrect('');
    setNegativeMark('');
    setFullMarks('');
    setAnswerKey(makeBlankKey(35));
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { localStorage.removeItem('omr_active_config'); } catch (_) {}
    }
  };

  // Preset Handlers
  const handleApplyPreset = (presetIdStr: string) => {
    if (!presetIdStr) {
      handleResetToBlank(false);
      return;
    }
    const p = presetList.find(x => String(x.id) === String(presetIdStr));
    if (!p) {
      Alert.alert('Preset Not Found', 'Could not find the selected preset.');
      return;
    }
    applyPresetObject(p, true);
  };

  const handleSavePreset = async (targetPresetId?: number) => {
    const nameToSave = examName.trim();
    if (!nameToSave) {
      Alert.alert('Exam Name Needed', 'Please enter Exam Name in the input box above before updating (e.g. Class-XI 1st semester 2026 Biology).');
      return;
    }
    setSavingPreset(true);
    try {
      const qNum = parseInt(totalQuestions, 10) || 35;
      const rightMark = marksPerCorrect === '' ? 1.0 : (isNaN(parseFloat(marksPerCorrect)) ? 1.0 : parseFloat(marksPerCorrect));
      const wrongMark = negativeMark === '' ? 0.0 : (isNaN(parseFloat(negativeMark)) ? 0.0 : parseFloat(negativeMark));
      const totalMark = fullMarks === '' ? (qNum * rightMark) : (isNaN(parseFloat(fullMarks)) ? (qNum * rightMark) : parseFloat(fullMarks));

      const updateId = targetPresetId !== undefined ? targetPresetId : (selectedPresetId ? Number(selectedPresetId) : undefined);

      const res = await fetch(`${API_BASE}/api/omr/answer-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: updateId,
          name: nameToSave,
          exam_name: nameToSave,
          total_questions: qNum,
          marks_per_correct: rightMark,
          negative_mark: wrongMark,
          full_marks: totalMark,
          answer_key: answerKey
        })
      });
      const data = await res.json();
      if (data && data.success) {
        Alert.alert('Preset Updated! 💾', `Answer key preset "${nameToSave}" updated in database!\nAll ${qNum} answers are saved.`);
        await loadPresets();
        if (data.key?.id) {
          setSelectedPresetId(String(data.key.id));
        }
      } else {
        Alert.alert('Save Failed', data?.message || 'Could not save preset');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPreset(false);
    }
  };

  const handleSaveAsNewPreset = async () => {
    const nameToSave = examName.trim();
    if (!nameToSave) {
      Alert.alert('Exam Name Needed', 'Please enter Exam Name in the input box above first (e.g. Class-XI 1st semester 2026 Biology).');
      return;
    }
    setSavingPreset(true);
    try {
      const qNum = parseInt(totalQuestions, 10) || 35;
      const rightMark = marksPerCorrect === '' ? 1.0 : (isNaN(parseFloat(marksPerCorrect)) ? 1.0 : parseFloat(marksPerCorrect));
      const wrongMark = negativeMark === '' ? 0.0 : (isNaN(parseFloat(negativeMark)) ? 0.0 : parseFloat(negativeMark));
      const totalMark = fullMarks === '' ? (qNum * rightMark) : (isNaN(parseFloat(fullMarks)) ? (qNum * rightMark) : parseFloat(fullMarks));

      const res = await fetch(`${API_BASE}/api/omr/answer-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameToSave,
          exam_name: nameToSave,
          total_questions: qNum,
          marks_per_correct: rightMark,
          negative_mark: wrongMark,
          full_marks: totalMark,
          answer_key: answerKey
        })
      });
      const data = await res.json();
      if (data && data.success) {
        Alert.alert('New Preset Created! 💾', `New preset "${nameToSave}" created and saved in database!`);
        await loadPresets();
        if (data.key?.id) {
          setSelectedPresetId(String(data.key.id));
        }
      } else {
        Alert.alert('Save Failed', data?.message || 'Could not save preset');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPreset(false);
    }
  };

  const handleSaveKeyAndReEvaluate = async () => {
    // 1. If exam name is provided, auto-commit to database
    if (examName.trim()) {
      try {
        const qNum = parseInt(totalQuestions, 10) || 35;
        const rightMark = marksPerCorrect === '' ? 1.0 : (isNaN(parseFloat(marksPerCorrect)) ? 1.0 : parseFloat(marksPerCorrect));
        const wrongMark = negativeMark === '' ? 0.0 : (isNaN(parseFloat(negativeMark)) ? 0.0 : parseFloat(negativeMark));
        const totalMark = fullMarks === '' ? (qNum * rightMark) : (isNaN(parseFloat(fullMarks)) ? (qNum * rightMark) : parseFloat(fullMarks));

        const res = await fetch(`${API_BASE}/api/omr/answer-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedPresetId ? Number(selectedPresetId) : undefined,
            name: examName.trim(),
            exam_name: examName.trim(),
            total_questions: qNum,
            marks_per_correct: rightMark,
            negative_mark: wrongMark,
            full_marks: totalMark,
            answer_key: answerKey
          })
        });
        const data = await res.json();
        if (data && data.success && data.key) {
          setSelectedPresetId(String(data.key.id));
          await loadPresets();
        }
      } catch (e) {
        console.log('Auto DB commit notice:', e);
      }
    }

    // 2. Close modal and execute evaluation with updated answer key
    setShowKeyModal(false);
    await runEvaluation();
  };

  const handleDeletePreset = async (id: number) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm('Are you sure you want to delete this saved Answer Key preset from database?')) return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/omr/answer-keys/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && data.success) {
        handleResetToBlank(false);
        await loadPresets();
        Alert.alert('Deleted', 'Preset removed from database.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const runEvaluation = async () => {
    const hasAnyAnswer = Object.values(answerKey).some((v: any) => v && v !== '');
    if (!hasAnyAnswer) {
      Alert.alert(
        'Answer Key Empty! ⚠️',
        'No answers are set in the Answer Key. Please click "📝 Set Answer Key" to set the correct answers (or select and Load a saved preset), then evaluate.'
      );
      setShowKeyModal(true);
      return;
    }
    setEvaluating(true);
    try {
      const qNum = parseInt(totalQuestions, 10) || 35;
      const rightMark = marksPerCorrect === '' ? 1.0 : (isNaN(parseFloat(marksPerCorrect)) ? 1.0 : parseFloat(marksPerCorrect));
      const wrongMark = negativeMark === '' ? 0.0 : (isNaN(parseFloat(negativeMark)) ? 0.0 : parseFloat(negativeMark));
      const totalMark = fullMarks === '' ? (qNum * rightMark) : (isNaN(parseFloat(fullMarks)) ? (qNum * rightMark) : parseFloat(fullMarks));

      const res = await fetch(`${API_BASE}/api/omr/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_name: examName.trim(),
          total_questions: qNum,
          marks_per_correct: rightMark,
          negative_mark: wrongMark,
          full_marks: totalMark,
          answer_key: answerKey
        })
      });

      const data = await res.json();
      if (data && data.success && Array.isArray(data.results)) {
        setResults(data.results);
      } else {
        Alert.alert('Error', data.message || 'Evaluation failed');
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert('Evaluation Error', err.message || 'Failed to connect to backend server');
    } finally {
      setEvaluating(false);
    }
  };

  const handleUploadFiles = async (event: any) => {
    const rawFiles = event?.target?.files;
    if (!rawFiles || rawFiles.length === 0) return;

    // 1. Immediately copy into an immutable Array so DOM changes do NOT wipe the files!
    // In Chrome/WebKit, setting fileInputRef.current.value = '' immediately empties the live event.target.files FileList!
    const files = Array.from(rawFiles) as File[];
    if (files.length === 0) return;

    // Reset the input value after copying files so same files can be re-selected if needed
    if (fileInputRef.current) {
      try { fileInputRef.current.value = ''; } catch (_) {}
    }

    // Auto-clear previous temporary scans when doing a new bulk upload
    try {
      await fetch(`${API_BASE}/api/omr/clear-folder`, { method: 'POST' });
    } catch (_) {}

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('sheets', files[i]);
    }

    setEvaluating(true);
    try {
      const res = await fetch(`${API_BASE}/api/omr/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data && data.success) {
        await loadFolderInfo();
        await runEvaluation();
      } else {
        Alert.alert('Upload Failed', data?.message || 'Could not upload files');
      }
    } catch (e: any) {
      Alert.alert('Upload Error', e.message);
    } finally {
      setEvaluating(false);
    }
  };

  // Camera Capture (Direct from Mobile Camera via capture="environment")
  const handleCameraCapture = async (event: any) => {
    const rawFiles = event?.target?.files;
    if (!rawFiles || rawFiles.length === 0) return;

    const files = Array.from(rawFiles) as File[];
    if (files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('sheets', files[i]);
    }
    setEvaluating(true);
    try {
      const res = await fetch(`${API_BASE}/api/omr/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data && data.success) {
        await loadFolderInfo();
        const currentTotal = data.total_files || (folderInfo.total + (data.uploaded_count || 1));
        Alert.alert(
          'OMR Sheet Captured! 📸',
          `✓ ${data.uploaded_count} OMR sheet(s) captured & saved.\nTotal sheets ready to evaluate: ${currentTotal}\n\nWhat would you like to do next?`,
          [
            {
              text: '📸 Scan Next Sheet (পরের খাতা)',
              onPress: () => {
                if (Platform.OS === 'web') {
                  const el = document.getElementById('omr-camera-scan-input') as HTMLInputElement;
                  if (el) {
                    el.value = '';
                    el.click();
                  }
                }
              }
            },
            {
              text: '⚡ Run Evaluation (মূল্যায়ন শুরু)',
              onPress: () => {
                runEvaluation();
              }
            }
          ]
        );
      } else {
        Alert.alert('Scan Failed', data?.message || 'Could not upload scanned sheet');
      }
    } catch (e: any) {
      Alert.alert('Scan Error', e.message);
    } finally {
      setEvaluating(false);
      if (event.target) event.target.value = '';
    }
  };

  const handlePrint = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const originalTitle = document.title;
      document.title = `Master Merit List - ${examName || 'OMR Result'}`;
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    } else {
      Alert.alert('Print', 'Use browser Print command to print the Master Merit List');
    }
  };

  const handleExportCSV = () => {
    if (displayedResults.length === 0) {
      Alert.alert('No Data', 'Please run evaluation first or clear filter');
      return;
    }

    const headers = [
      'Rank',
      'Registration No',
      'Student Name',
      'Class',
      'School / Institute',
      'Right Count',
      'Correct Question Numbers',
      'Wrong Count',
      'Wrong Question Numbers',
      'Blank Count',
      'Final Score',
      'Full Marks'
    ];

    const rows = displayedResults.map(r => [
      r.rank,
      `"${r.registration_no}"`,
      `"${r.student_name}"`,
      `"${r.class_name}"`,
      `"${r.school_name}"`,
      r.correct_count,
      `"${r.correct_questions.join(', ')}"`,
      r.wrong_count,
      `"${r.wrong_questions.join(', ')}"`,
      r.blank_count,
      r.final_score.toFixed(2),
      r.full_marks.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const suffix = selectedSchoolFilter !== 'ALL' ? `_${selectedSchoolFilter.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      link.setAttribute('download', `${examName.replace(/[^a-zA-Z0-9]/g, '_')}${suffix}_Merit_List.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Alert.alert('Exported', 'CSV Data generated successfully');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View
        nativeID="omr-header-wrapper"
        {...(Platform.OS === 'web' ? { id: 'omr-header-wrapper', 'data-no-print': 'true' } as any : {})}
        style={styles.noPrint}
      >
        <AcademyHeader compact />
      </View>

      <ScrollView
        nativeID="omr-scroll-view"
        {...(Platform.OS === 'web' ? { id: 'omr-scroll-view' } as any : {})}
        contentContainerStyle={styles.container}
      >
        {/* SCREEN-ONLY CONTROLS WRAPPER (100% OFF / HIDDEN ON PRINT) */}
        <View
          nativeID="omr-controls-wrapper"
          {...(Platform.OS === 'web' ? { id: 'omr-controls-wrapper', 'data-no-print': 'true' } as any : {})}
          style={styles.noPrint}
        >
          {/* TOP CONFIGURATION BAR (NO-PRINT) */}
          <View
            style={[styles.card, styles.noPrint]}
            nativeID="omr-no-print-card"
            {...(Platform.OS === 'web' ? { id: 'omr-no-print-card', 'data-no-print': 'true' } as any : {})}
          >
          <View style={styles.cardHeader}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#e2e8f0',
                    paddingHorizontal: 11,
                    paddingVertical: 6,
                    borderRadius: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5
                  }}
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/superadmin'))}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#1e293b' }}>⬅️ Back</Text>
                </TouchableOpacity>
                <Text style={styles.pageTitle}>OMR Exam & Evaluation System</Text>
              </View>
              <Text style={styles.pageSubtitle}>Automatic sheet recognition, scoring & Master Merit List generation</Text>
            </View>
            <View style={styles.topBtnGroup}>
              {Platform.OS === 'web' && (
                <>
                  {/* DIRECT CAMERA SCAN INPUT (OPENS CAMERA APP INSTANTLY ON ANDROID / IPHONE) */}
                  <input
                    id="omr-camera-scan-input"
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                    onChange={handleCameraCapture}
                  />
                  {/* BULK FILE / GALLERY UPLOAD INPUT */}
                  <input
                    id="omr-file-upload-input"
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept="image/jpeg,image/png,image/jpg"
                    style={{ position: 'absolute', top: -9999, left: -9999, opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
                    onChange={handleUploadFiles}
                  />
                </>
              )}

              {/* 📸 SCAN WITH CAMERA (OPENS PHONE CAMERA DIRECTLY VIA NATIVE LABEL) */}
              {Platform.OS === 'web' ? (
                <label
                  htmlFor="omr-camera-scan-input"
                  style={{
                    backgroundColor: '#059669',
                    padding: '9px 15px',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    boxShadow: '0 1px 3px rgba(5, 150, 105, 0.3)'
                  }}
                >
                  📸 Scan with Camera
                </label>
              ) : (
                <TouchableOpacity
                  style={styles.btnScan}
                  onPress={() => {
                    if (cameraInputRef.current) cameraInputRef.current.click();
                  }}
                >
                  <Text style={styles.btnScanText}>📸 Scan with Camera</Text>
                </TouchableOpacity>
              )}

              {/* 📁 UPLOAD FILES / GALLERY */}
              {Platform.OS === 'web' ? (
                <label
                  htmlFor="omr-file-upload-input"
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    color: '#334155',
                    fontWeight: 700,
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  📁 Upload Files
                </label>
              ) : (
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => {
                    if (fileInputRef.current) fileInputRef.current.click();
                  }}
                >
                  <Text style={styles.btnSecondaryText}>📁 Upload Files</Text>
                </TouchableOpacity>
              )}

              {/* 📝 SET ANSWER KEY */}
              <TouchableOpacity style={styles.btnSecondary} onPress={() => setShowKeyModal(true)}>
                <Text style={styles.btnSecondaryText}>📝 Set Answer Key</Text>
              </TouchableOpacity>

              {/* ⚡ RUN EVALUATION */}
              <TouchableOpacity
                style={[styles.btnPrimary, evaluating && styles.btnDisabled]}
                onPress={runEvaluation}
                disabled={evaluating}
              >
                <Text style={styles.btnPrimaryText}>{evaluating ? 'Evaluating...' : '⚡ Run Evaluation'}</Text>
              </TouchableOpacity>

              {/* 🏫 NEXT SCHOOL */}
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: '#0284c7', backgroundColor: '#f0f9ff' }]}
                onPress={handleClearForNextSchool}
                disabled={evaluating}
              >
                <Text style={[styles.btnSecondaryText, { color: '#0369a1', fontWeight: '800' }]}>
                  {evaluating ? 'Clearing...' : '🏫 Next School (Keep Key)'}
                </Text>
              </TouchableOpacity>

              {/* 🔄 CLEAR / NEW EXAM */}
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: '#e11d48', backgroundColor: '#fff1f2' }]}
                onPress={handleResetAndClear}
                disabled={evaluating}
              >
                <Text style={[styles.btnSecondaryText, { color: '#be123c', fontWeight: '800' }]}>
                  {evaluating ? '🔄 Clearing...' : '🔄 Clear / New Exam'}
                </Text>
              </TouchableOpacity>

              {/* 📂 FIND / LOAD PAST RECORDS */}
              <TouchableOpacity
                style={[styles.btnSecondary, { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' }]}
                onPress={() => {
                  setShowArchiveModal(true);
                  loadArchiveRecords();
                }}
              >
                <Text style={[styles.btnSecondaryText, { color: '#6d28d9', fontWeight: '800' }]}>
                  📂 Past Records (পূর্বের রেকর্ড)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PRINT & EXPORT ACTION BAR (NO-PRINT) */}
        {results.length > 0 && (
          <View
            style={[styles.actionBar, styles.noPrint]}
            nativeID="omr-no-print-actionbar"
            {...(Platform.OS === 'web' ? { id: 'omr-no-print-actionbar', 'data-no-print': 'true' } as any : {})}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={styles.resultsBadge}>
                📊 Total Evaluated Candidates: <Text style={{ fontWeight: '800' }}>{results.length}</Text>
              </Text>
              <Text style={styles.resultsBadgeSub}>
                Right: +{marksPerCorrect || '1.0'} | Wrong: -{negativeMark || '0.0'} | Full Marks: {fullMarks || '35.0'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingVertical: 7, paddingHorizontal: 12, borderColor: '#0284c7', backgroundColor: '#f0f9ff' }]}
                onPress={handleClearForNextSchool}
                disabled={evaluating}
              >
                <Text style={{ color: '#0369a1', fontWeight: '800', fontSize: 12 }}>
                  {evaluating ? 'Clearing...' : '🏫 Next School (Keep Key)'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSecondary, { paddingVertical: 7, paddingHorizontal: 12, borderColor: '#e11d48', backgroundColor: '#fff1f2' }]}
                onPress={handleResetAndClear}
                disabled={evaluating}
              >
                <Text style={{ color: '#be123c', fontWeight: '800', fontSize: 12 }}>
                  {evaluating ? '🔄 Clearing...' : '🔄 Clear / New Exam'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
                <Text style={styles.exportBtnText}>📥 Export Excel (.CSV)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
                <Text style={styles.printBtnText}>🖨️ Print Master Merit List</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 🎯 TERMINAL EXAM INTEGRATION & DRAFT SYNC (NO-PRINT) */}
        {results.length > 0 && (
          <View
            style={[styles.terminalSyncCard, styles.noPrint]}
            nativeID="omr-no-print-terminal"
            {...(Platform.OS === 'web' ? { id: 'omr-no-print-terminal', 'data-no-print': 'true' } as any : {})}
          >
            <View style={styles.syncCardHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16 }}>🎯</Text>
                  <Text style={styles.syncCardTitle}>Sync Marks to Terminal Exam (Draft Mode)</Text>
                  <View style={styles.draftPill}>
                    <Text style={styles.draftPillText}>DRAFT MODE</Text>
                  </View>
                </View>
                <Text style={styles.syncCardDesc}>
                  Pushes evaluated OMR scores directly into the selected Terminal Exam subject as a <Text style={{ fontWeight: '800', color: '#166534' }}>DRAFT</Text>. Matches student by Mission ID, 10-digit School/Council ID, or Name. Teachers/Admins can verify, edit/correct, and add written marks before publishing.
                </Text>
              </View>
            </View>

            <View style={styles.syncControlsRow}>
              <View style={{ flex: 2, minWidth: 260 }}>
                <Text style={styles.fieldLabel}>Select Target Terminal Exam & Subject:</Text>
                {Platform.OS === 'web' ? (
                  <select
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #94a3b8',
                      backgroundColor: '#ffffff',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontWeight: '600'
                    }}
                    value={selectedExamSubjectId}
                    onChange={(e: any) => setSelectedExamSubjectId(e.target.value)}
                  >
                    <option value="">-- Choose Target Terminal Exam & Subject --</option>
                    {terminalTargets.map((t: any) => (
                      <option key={t.exam_subject_id} value={t.exam_subject_id}>
                        {t.exam_name} (Class {t.class_name}) ➔ {t.subject_name} [MCQ: {t.mcq_marks || t.full_marks}] ({t.teacher_name || 'Unassigned'})
                      </option>
                    ))}
                  </select>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.btnSync,
                  (!selectedExamSubjectId || syncingTerminal) && styles.btnDisabled
                ]}
                onPress={handlePushToTerminalExam}
                disabled={!selectedExamSubjectId || syncingTerminal}
              >
                <Text style={styles.btnSyncText}>
                  {syncingTerminal ? '⏳ Pushing to Terminal...' : '🚀 Push Marks to Terminal Exam as Draft'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnOpenTerminal}
                onPress={() => router.push('/terminal-exams')}
              >
                <Text style={styles.btnOpenTerminalText}>📋 Open Terminal Exams</Text>
              </TouchableOpacity>
            </View>

            {syncStatusMsg && (
              <View style={[
                styles.syncBanner,
                syncStatusMsg.type === 'success' ? styles.syncBannerSuccess : styles.syncBannerError
              ]}>
                <Text style={[
                  styles.syncBannerText,
                  syncStatusMsg.type === 'success' ? styles.syncBannerTextSuccess : styles.syncBannerTextError
                ]}>
                  {syncStatusMsg.text}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 🏫 MULTI-SCHOOL FILTER TABS (FOR SEPARATE SCHOOL SUBMISSION) */}
        {results.length > 0 && schoolList.length > 1 && (
          <View
            style={[styles.schoolFilterCard, styles.noPrint]}
            nativeID="omr-no-print-filters"
            {...(Platform.OS === 'web' ? { id: 'omr-no-print-filters', 'data-no-print': 'true' } as any : {})}
          >
            <Text style={styles.schoolFilterTitle}>
              🏫 School-wise View & Print (Filter for submitting separate result sheets to respective schools):
            </Text>
            <View style={styles.schoolFilterTabs}>
              <TouchableOpacity
                style={[
                  styles.schoolFilterBtn,
                  selectedSchoolFilter === 'ALL' && styles.schoolFilterBtnActive
                ]}
                onPress={() => setSelectedSchoolFilter('ALL')}
              >
                <Text
                  style={[
                    styles.schoolFilterBtnText,
                    selectedSchoolFilter === 'ALL' && styles.schoolFilterBtnTextActive
                  ]}
                >
                  All Schools ({results.length})
                </Text>
              </TouchableOpacity>
              {schoolList.map((sch) => {
                const count = results.filter(r => r.school_name === sch).length;
                return (
                  <TouchableOpacity
                    key={sch}
                    style={[
                      styles.schoolFilterBtn,
                      selectedSchoolFilter === sch && styles.schoolFilterBtnActive
                    ]}
                    onPress={() => setSelectedSchoolFilter(sch)}
                  >
                    <Text
                      style={[
                        styles.schoolFilterBtnText,
                        selectedSchoolFilter === sch && styles.schoolFilterBtnTextActive
                      ]}
                    >
                      {sch} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        </View>

        {/* 100% ENGLISH MASTER MERIT LIST (SHOWN ONLY WHEN EVALUATED) */}
        {results.length > 0 ? (
          <View
            nativeID="omr-master-merit-sheet"
            {...(Platform.OS === 'web' ? { id: 'omr-master-merit-sheet' } as any : {})}
            style={styles.meritSheetContainer}
          >
            {/* Institutional Header */}
            <View style={styles.meritHeader}>
              <Text style={styles.institutionName}>Al-Ameen Mission Academy Memari</Text>
              <Text style={styles.meritTitle}>MASTER MERIT LIST - OMR EVALUATION RESULT</Text>
              {selectedSchoolFilter !== 'ALL' && (
                <View style={styles.schoolSelectedBanner}>
                  <Text style={styles.schoolSelectedText}>SCHOOL: {selectedSchoolFilter.toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.meritMetaRow}>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Exam: </Text>{examName || 'OMR Exam'}</Text>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Full Marks: </Text>{!isNaN(parseFloat(fullMarks)) ? parseFloat(fullMarks).toFixed(2) : ((parseInt(totalQuestions, 10) || 35) * (parseFloat(marksPerCorrect) || 1.0)).toFixed(2)}</Text>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Right: </Text>+{marksPerCorrect || '1.0'}</Text>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Negative: </Text>-{negativeMark || '0.0'}</Text>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Candidates: </Text>{displayedResults.length}</Text>
                <Text style={styles.meritMetaItem}><Text style={styles.metaLabel}>Date: </Text>{new Date().toLocaleDateString('en-GB')}</Text>
              </View>
            </View>

            {/* 🔍 SEARCH & FILTER BAR (SCREEN-ONLY / HIDDEN ON PRINT) */}
            <View
              style={[styles.tableFilterBar, styles.noPrint]}
              nativeID="omr-table-filter-bar"
              {...(Platform.OS === 'web' ? { id: 'omr-table-filter-bar', 'data-no-print': 'true' } as any : {})}
            >
              <View style={styles.tableFilterLeft}>
                {/* Search Box & Button */}
                {/* Global Search Box & Button */}
                <View style={styles.searchBoxWrap}>
                  <Text style={styles.searchIcon}>🔍</Text>
                  <TextInput
                    style={styles.searchTextInput}
                    placeholder="Search any text..."
                    placeholderTextColor="#64748b"
                    value={resultSearchQuery}
                    onChangeText={setResultSearchQuery}
                  />
                  {resultSearchQuery ? (
                    <TouchableOpacity onPress={() => setResultSearchQuery('')} style={styles.clearSearchBtn}>
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* 🏆 Rank Filter */}
                <View style={styles.filterSelectWrap}>
                  <Text style={styles.filterSelectLabel}>Rank:</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#1e293b'
                      }}
                      value={filterRank}
                      onChange={(e: any) => setFilterRank(e.target.value)}
                    >
                      <option value="ALL">All Ranks</option>
                      <option value="top5">Top 5</option>
                      <option value="top10">Top 10</option>
                      <option value="top20">Top 20</option>
                      <option value="top50">Top 50</option>
                    </select>
                  ) : null}
                </View>

                {/* 🆔 Reg No Filter */}
                <View style={styles.filterInputWrap}>
                  <Text style={styles.filterSelectLabel}>Reg No:</Text>
                  <TextInput
                    style={styles.filterTextInput}
                    placeholder="Filter Reg No..."
                    placeholderTextColor="#94a3b8"
                    value={filterRegNo}
                    onChangeText={setFilterRegNo}
                  />
                  {filterRegNo ? (
                    <TouchableOpacity onPress={() => setFilterRegNo('')} style={styles.clearSearchBtn}>
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* 👤 Student Name Filter */}
                <View style={styles.filterInputWrap}>
                  <Text style={styles.filterSelectLabel}>Student Name:</Text>
                  <TextInput
                    style={styles.filterTextInput}
                    placeholder="Filter Name..."
                    placeholderTextColor="#94a3b8"
                    value={filterStudentName}
                    onChangeText={setFilterStudentName}
                  />
                  {filterStudentName ? (
                    <TouchableOpacity onPress={() => setFilterStudentName('')} style={styles.clearSearchBtn}>
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* School Filter Dropdown (if multiple schools exist) */}
                {schoolList.length > 1 && (
                  <View style={styles.filterSelectWrap}>
                    <Text style={styles.filterSelectLabel}>School:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#1e293b'
                        }}
                        value={selectedSchoolFilter}
                        onChange={(e: any) => setSelectedSchoolFilter(e.target.value)}
                      >
                        <option value="ALL">All Schools ({results.length})</option>
                        {schoolList.map(sch => (
                          <option key={sch} value={sch}>
                            {sch} ({results.filter(r => r.school_name === sch).length})
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </View>
                )}

                {/* Class Filter Dropdown (if multiple classes exist) */}
                {classList.length > 1 && (
                  <View style={styles.filterSelectWrap}>
                    <Text style={styles.filterSelectLabel}>Class:</Text>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '12px',
                          fontWeight: '600',
                          color: '#1e293b'
                        }}
                        value={selectedClassFilter}
                        onChange={(e: any) => setSelectedClassFilter(e.target.value)}
                      >
                        <option value="ALL">All Classes</option>
                        {classList.map(cls => (
                          <option key={cls} value={cls}>
                            Class {cls} ({results.filter(r => r.class_name === cls).length})
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </View>
                )}

                {/* Sort Order Dropdown */}
                <View style={styles.filterSelectWrap}>
                  <Text style={styles.filterSelectLabel}>Sort:</Text>
                  {Platform.OS === 'web' ? (
                    <select
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#1e293b'
                      }}
                      value={resultSortBy}
                      onChange={(e: any) => setResultSortBy(e.target.value)}
                    >
                      <option value="rank">Rank (Highest Score First)</option>
                      <option value="rank_desc">Rank (Lowest Score First)</option>
                      <option value="name_asc">Student Name (A → Z)</option>
                      <option value="name_desc">Student Name (Z → A)</option>
                      <option value="reg_asc">Registration No (Asc)</option>
                      <option value="reg_desc">Registration No (Desc)</option>
                    </select>
                  ) : null}
                </View>

                {/* Reset Filters button if any filter is active */}
                {(resultSearchQuery || filterRank !== 'ALL' || filterRegNo || filterStudentName || selectedSchoolFilter !== 'ALL' || selectedClassFilter !== 'ALL' || resultSortBy !== 'rank') && (
                  <TouchableOpacity
                    style={styles.btnResetFilters}
                    onPress={() => {
                      setResultSearchQuery('');
                      setFilterRank('ALL');
                      setFilterRegNo('');
                      setFilterStudentName('');
                      setSelectedSchoolFilter('ALL');
                      setSelectedClassFilter('ALL');
                      setResultSortBy('rank');
                    }}
                  >
                    <Text style={styles.btnResetFiltersText}>🧹 Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Showing count indicator */}
              <View style={styles.tableFilterRight}>
                <Text style={styles.filterCountBadge}>
                  Showing: <Text style={{ fontWeight: '800', color: '#0F52BA' }}>{displayedResults.length}</Text> of {results.length} Candidates
                </Text>
              </View>
            </View>

            {/* TABLE - Maximum width given to Student Name, Correct Qs, Wrong Qs */}
            <View style={styles.tableWrapper}>
              <View style={styles.tableHeaderRow}>
                {Platform.OS === 'web' ? (
                  <TouchableOpacity
                    style={[styles.colRank, { cursor: 'pointer' } as any]}
                    onPress={() => setResultSortBy(prev => prev === 'rank' ? 'rank_desc' : 'rank')}
                  >
                    <Text style={[styles.th, { color: '#0F52BA' }]}>
                      Rank {resultSortBy === 'rank' ? '▼' : resultSortBy === 'rank_desc' ? '▲' : '⇅'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.th, styles.colRank]}>Rank</Text>
                )}

                {Platform.OS === 'web' ? (
                  <TouchableOpacity
                    style={[styles.colReg, { cursor: 'pointer' } as any]}
                    onPress={() => setResultSortBy(prev => prev === 'reg_asc' ? 'reg_desc' : 'reg_asc')}
                  >
                    <Text style={[styles.th, { color: '#0F52BA' }]}>
                      Reg No {resultSortBy === 'reg_asc' ? '▲' : resultSortBy === 'reg_desc' ? '▼' : '⇅'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.th, styles.colReg]}>Reg No</Text>
                )}

                {Platform.OS === 'web' ? (
                  <TouchableOpacity
                    style={[styles.colName, { cursor: 'pointer' } as any]}
                    onPress={() => setResultSortBy(prev => prev === 'name_asc' ? 'name_desc' : 'name_asc')}
                  >
                    <Text style={[styles.th, { color: '#0F52BA' }]}>
                      Student Name {resultSortBy === 'name_asc' ? '▲' : resultSortBy === 'name_desc' ? '▼' : '⇅'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.th, styles.colName]}>Student Name</Text>
                )}

                <Text style={[styles.th, styles.colClass]}>Class</Text>
                <Text style={[styles.th, styles.colCount]}>Right</Text>
                <Text style={[styles.th, styles.colCorrectList]}>Correct Question Numbers</Text>
                <Text style={[styles.th, styles.colCount]}>Wrong</Text>
                <Text style={[styles.th, styles.colWrongList]}>Wrong Question Numbers</Text>
                <Text style={[styles.th, styles.colCount]}>Blank</Text>
                <Text style={[styles.th, styles.colScore]}>Final Score</Text>
              </View>

              {displayedResults.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                  onPress={() => setSelectedStudent(item)}
                  {...(Platform.OS === 'web' ? { className: 'omr-table-row' } as any : {})}
                >
                  <Text style={[styles.td, styles.colRank, styles.rankBadge]}>{item.rank}</Text>
                  <View style={[styles.td, styles.colReg]}>
                    <Text style={styles.boldMono}>{item.registration_no}</Text>
                    {item.mission_reg_no ? (
                      <Text style={styles.missionSubText}>ID: {item.mission_reg_no}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.td, styles.colName]}>
                    <Text style={styles.studentNameText}>{item.student_name}</Text>
                  </View>
                  <View style={[styles.td, styles.colClass]}>
                    <Text style={styles.classText}>{item.class_name}</Text>
                    {item.school_name && !item.school_name.toUpperCase().includes('MEMARI') ? (
                      <Text style={styles.schoolSubText}>{item.school_name}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.td, styles.colCount, styles.rightText]}>{item.correct_count}</Text>
                  <Text style={[styles.td, styles.colCorrectList, styles.listText]}>
                    {item.correct_questions.length > 0 ? item.correct_questions.join(', ') : 'None'}
                  </Text>
                  <Text style={[styles.td, styles.colCount, styles.wrongText]}>{item.wrong_count}</Text>
                  <Text style={[styles.td, styles.colWrongList, styles.listText, styles.wrongListText]}>
                    {item.wrong_questions.length > 0 ? item.wrong_questions.join(', ') : 'None'}
                  </Text>
                  <Text style={[styles.td, styles.colCount, styles.blankText]}>{item.blank_count}</Text>
                  <Text style={[styles.td, styles.colScore, styles.scoreText]}>
                    {item.final_score.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Footer note for print */}
            <View style={styles.meritFooter}>
              <Text style={styles.footerNote}>
                * System generated Master Merit List from OMR evaluation engine. Space optimized for high-density 1-2 page record keeping.
              </Text>
              <Text style={styles.footerSignature}>Authorized Signatory</Text>
            </View>
          </View>
        ) : (
          /* CLEAN BLANK SLATE WORKSPACE READY FOR NEW EVALUATION */
          <View
            style={[styles.blankSlateContainer, styles.noPrint]}
            nativeID="omr-blank-slate"
            {...(Platform.OS === 'web' ? { id: 'omr-blank-slate', 'data-no-print': 'true' } as any : {})}
          >
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📝</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 }}>
              OMR Exam Evaluation Workspace
            </Text>
            <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 540, lineHeight: 20 }}>
              Use your mobile camera or upload scanned OMR sheets to evaluate scores and generate Master Merit List:
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
              {Platform.OS === 'web' ? (
                <>
                  <label
                    htmlFor="omr-camera-scan-input"
                    style={{
                      backgroundColor: '#059669',
                      padding: '11px 20px',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
                    }}
                  >
                    📸 Scan with Camera
                  </label>
                  <label
                    htmlFor="omr-file-upload-input"
                    style={{
                      backgroundColor: '#0284c7',
                      padding: '11px 20px',
                      borderRadius: '10px',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)'
                    }}
                  >
                    📁 Upload OMR Sheets
                  </label>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.btnScan}
                    onPress={() => {
                      if (cameraInputRef.current) cameraInputRef.current.click();
                    }}
                  >
                    <Text style={styles.btnScanText}>📸 Scan with Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnScan, { backgroundColor: '#0284c7' }]}
                    onPress={() => {
                      if (fileInputRef.current) fileInputRef.current.click();
                    }}
                  >
                    <Text style={styles.btnScanText}>📁 Upload Files</Text>
                  </TouchableOpacity>
                </>
              )}
              {folderInfo.total > 0 && (
                <TouchableOpacity
                  style={[styles.btnPrimary, { paddingVertical: 11, paddingHorizontal: 20, borderRadius: 10 }]}
                  onPress={runEvaluation}
                  disabled={evaluating}
                >
                  <Text style={styles.btnPrimaryText}>
                    {evaluating ? '⏳ Evaluating...' : `⚡ Run Evaluation (${folderInfo.total} Ready)`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* MODAL: ANSWER KEY EDITOR */}
        <Modal visible={showKeyModal} transparent animationType="fade" onRequestClose={() => setShowKeyModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 780 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Set Question Answer Key (Q1 to Q{totalQuestions})</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Answer key auto-saves for all schools. You can also save multiple exam presets.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowKeyModal(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* EXAM CONFIGURATION ROW (EXAM NAME, TOTAL QUESTIONS, MARKS, NEGATIVE, FULL MARKS) */}
              <View style={{
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 8,
                padding: 10,
                marginBottom: 10
              }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                  {/* Exam Name */}
                  <View style={{ flex: 2.2, minWidth: 200 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 3 }}>Exam Name (English)</Text>
                    <TextInput
                      style={[styles.textInput, { paddingVertical: 5, fontSize: 12, backgroundColor: '#ffffff', color: '#0f172a' }]}
                      value={examName}
                      onChangeText={setExamName}
                      placeholder="e.g. Class-XI 1st semester 2026 Biology"
                      placeholderTextColor="#64748b"
                    />
                  </View>

                  {/* Total Questions */}
                  <View style={{ flex: 1, minWidth: 95 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 3 }}>Total Questions (Numeric)</Text>
                    <TextInput
                      style={[styles.textInput, { paddingVertical: 5, fontSize: 12, backgroundColor: '#ffffff', textAlign: 'center', color: '#0f172a' }]}
                      value={totalQuestions}
                      onChangeText={(v) => {
                        setTotalQuestions(v);
                        const q = parseFloat(v);
                        const m = parseFloat(marksPerCorrect || '1.0');
                        if (!isNaN(q) && !isNaN(m)) {
                          setFullMarks((q * m).toString());
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="35"
                      placeholderTextColor="#64748b"
                    />
                  </View>

                  {/* Marks per Right (+) */}
                  <View style={{ flex: 1, minWidth: 95 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d', marginBottom: 3 }}>Marks per Right (+)</Text>
                    <TextInput
                      style={[styles.textInput, { paddingVertical: 5, fontSize: 12, backgroundColor: '#ffffff', textAlign: 'center', color: '#15803d', fontWeight: '700' }]}
                      value={marksPerCorrect}
                      onChangeText={(v) => {
                        setMarksPerCorrect(v);
                        const q = parseFloat(totalQuestions || '35');
                        const m = parseFloat(v);
                        if (!isNaN(q) && !isNaN(m)) {
                          setFullMarks((q * m).toString());
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="1.00"
                      placeholderTextColor="#64748b"
                    />
                  </View>

                  {/* Negative Mark (-) */}
                  <View style={{ flex: 1, minWidth: 105 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91c1c', marginBottom: 3 }}>Negative Mark per Wrong (-)</Text>
                    <TextInput
                      style={[styles.textInput, { paddingVertical: 5, fontSize: 12, backgroundColor: '#ffffff', textAlign: 'center', color: '#b91c1c', fontWeight: '700' }]}
                      value={negativeMark}
                      onChangeText={setNegativeMark}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#64748b"
                    />
                  </View>

                  {/* Full Marks */}
                  <View style={{ flex: 1, minWidth: 85 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1e293b', marginBottom: 3 }}>Full Marks</Text>
                    <TextInput
                      style={[styles.textInput, { paddingVertical: 5, fontSize: 12, backgroundColor: '#f1f5f9', textAlign: 'center', fontWeight: '800', color: '#0f172a' }]}
                      value={fullMarks}
                      onChangeText={setFullMarks}
                      keyboardType="numeric"
                      placeholder="35.00"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                </View>
              </View>

              {/* PRESET LOAD & SAVE BAR */}
              {(() => {
                const loadedPreset = presetList.find(x => String(x.id) === String(selectedPresetId));
                return (
                  <View style={{
                    backgroundColor: '#f8fafc',
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 10,
                    gap: 9
                  }}>
                    {/* 1. LOAD PRESET ROW */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#334155', minWidth: 160 }}>
                        📂 Load Saved Preset (আগে সেভ করা কি):
                      </Text>
                      <View style={{ flex: 1, minWidth: 240, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        {Platform.OS === 'web' ? (
                          <select
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: '7px 9px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              fontSize: 12,
                              color: '#0f172a',
                              backgroundColor: '#ffffff',
                              outline: 'none'
                            }}
                            value={selectedPresetId}
                            onChange={(e) => {
                              setSelectedPresetId(e.target.value);
                            }}
                          >
                            <option value="">-- {presetList.length === 0 ? 'No Saved Presets in Database' : `Choose from ${presetList.length} Saved Preset(s)`} --</option>
                            {presetList.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.name || p.exam_name} ({p.total_questions || 35}Q)
                              </option>
                            ))}
                          </select>
                        ) : null}

                        {/* Explicit Load Button: ONLY loads preset into bubbles when clicked */}
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            backgroundColor: selectedPresetId ? '#0284c7' : '#94a3b8',
                            borderRadius: 6
                          }}
                          onPress={() => {
                            if (!selectedPresetId) {
                              Alert.alert('Select Preset', 'Please select a preset from the dropdown list first, then click Load.');
                              return;
                            }
                            handleApplyPreset(selectedPresetId);
                          }}
                        >
                          <Text style={{ fontSize: 11.5, color: '#ffffff', fontWeight: '800' }}>📥 Load</Text>
                        </TouchableOpacity>

                        {selectedPresetId ? (
                          <TouchableOpacity
                            style={{ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#fee2e2', borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' }}
                            onPress={() => handleDeletePreset(Number(selectedPresetId))}
                          >
                            <Text style={{ fontSize: 11.5, color: '#b91c1c', fontWeight: '800' }}>🗑️</Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={{ paddingHorizontal: 9, paddingVertical: 7, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' }}
                          onPress={() => handleResetToBlank(true)}
                        >
                          <Text style={{ fontSize: 11.5, color: '#475569', fontWeight: '700' }}>🧹 Reset to Blank</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* DIVIDER */}
                    <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 1 }} />

                    {/* 2. STATUS & SAVE / UPDATE ROW */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569' }}>Status:</Text>
                        {loadedPreset ? (
                          <View style={{ backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#166534' }}>
                              🟢 Loaded Preset: {loadedPreset.name || loadedPreset.exam_name}
                            </Text>
                          </View>
                        ) : (
                          <View style={{ backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 5 }}>
                            <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#64748b' }}>
                              ⚪ Blank / New Exam Mode (ফাঁকা নতুন পরীক্ষা)
                            </Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        {loadedPreset ? (
                          <TouchableOpacity
                            style={[styles.btnPrimary, { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#059669' }]}
                            onPress={() => handleSavePreset(Number(selectedPresetId))}
                            disabled={savingPreset}
                          >
                            <Text style={[styles.btnPrimaryText, { fontSize: 11.5 }]}>
                              {savingPreset ? 'Updating...' : `💾 Update "${loadedPreset.name || 'Preset'}"`}
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        <TouchableOpacity
                          style={[styles.btnSecondary, { paddingVertical: 6, paddingHorizontal: 11, borderColor: '#0284c7', backgroundColor: '#f0f9ff' }]}
                          onPress={handleSaveAsNewPreset}
                          disabled={savingPreset}
                        >
                          <Text style={{ fontSize: 11.5, color: '#0284c7', fontWeight: '800' }}>
                            ➕ Save as New Preset
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })()}

              {/* TOOLBAR: MULTI-SELECT & CLEAR ALL ANSWERS */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2, flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                    Click bubbles to set answer:
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.multiToggleBtn,
                      multiSelectMode && styles.multiToggleBtnActive
                    ]}
                    onPress={() => setMultiSelectMode(!multiSelectMode)}
                  >
                    <Text style={[
                      styles.multiToggleBtnText,
                      multiSelectMode && styles.multiToggleBtnTextActive
                    ]}>
                      {multiSelectMode ? '✓ Multi-Answer Mode: ON' : '➕ Multiple Answers Mode'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={{ paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' }}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      if (!window.confirm('Clear all answer bubbles to blank?')) return;
                    }
                    const blankKeys: Record<string, string> = {};
                    const qNum = parseInt(totalQuestions, 10) || 35;
                    for (let i = 1; i <= qNum; i++) blankKeys[String(i)] = '';
                    setAnswerKey(blankKeys);
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#be123c' }}>🧹 Clear All Answers</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }}>
                <View style={styles.keyGrid}>
                  {Array.from({ length: parseInt(totalQuestions, 10) || 35 }, (_, i) => i + 1).map((q) => {
                    const curVal = answerKey[q.toString()] || '';
                    const isAll = curVal === 'ALL' || curVal === 'BONUS' || curVal === '*';
                    const activeOpts = isAll ? [] : curVal.split(',').filter(Boolean);

                    return (
                      <View key={q} style={[styles.keyItem, isAll && { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 5, alignItems: 'center' }}>
                          <Text style={[styles.keyQNum, isAll && { color: '#b45309', fontWeight: '900' }]}>Q{q}</Text>
                          <TouchableOpacity
                            style={[
                              styles.bonusBtn,
                              isAll && styles.bonusBtnActive
                            ]}
                            onPress={() => {
                              setAnswerKey({
                                ...answerKey,
                                [q.toString()]: isAll ? '' : 'ALL'
                              });
                            }}
                          >
                            <Text style={[
                              styles.bonusBtnText,
                              isAll && styles.bonusBtnTextActive
                            ]}>
                              ★ ALL
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {['A', 'B', 'C', 'D'].map((opt) => {
                            const isSelected = activeOpts.includes(opt);
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={[
                                  styles.optCircle,
                                  isSelected && styles.optCircleActive,
                                  isAll && { opacity: 0.35 }
                                ]}
                                onPress={() => {
                                  if (isAll) {
                                    setAnswerKey({ ...answerKey, [q.toString()]: opt });
                                    return;
                                  }
                                  if (multiSelectMode) {
                                    let opts = [...activeOpts];
                                    if (opts.includes(opt)) {
                                      opts = opts.filter(x => x !== opt);
                                    } else {
                                      opts.push(opt);
                                    }
                                    opts.sort();
                                    setAnswerKey({ ...answerKey, [q.toString()]: opts.join(',') });
                                  } else {
                                    setAnswerKey({ ...answerKey, [q.toString()]: curVal === opt ? '' : opt });
                                  }
                                }}
                              >
                                <Text
                                  style={[
                                    styles.optText,
                                    isSelected && styles.optTextActive
                                  ]}
                                >
                                  {opt}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
                  <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                    ✓ Key is kept saved automatically in browser and database.
                  </Text>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleSaveKeyAndReEvaluate}
                  >
                    <Text style={styles.btnPrimaryText}>✓ Save Key & Re-Evaluate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: PAST EXAM RECORDS & ARCHIVE */}
        <Modal visible={showArchiveModal} transparent animationType="fade" onRequestClose={() => setShowArchiveModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 840, width: '95%', maxHeight: '90%' }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>📂 Past Records & Archive (পূর্বের পরীক্ষার রেকর্ড ও ফলাফল)</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Search, view, and restore previous exam evaluations, uploaded scans, and answer keys.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowArchiveModal(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Navigation Tabs */}
              <View style={{ flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderColor: '#e2e8f0', paddingBottom: 10, marginBottom: 12 }}>
                <TouchableOpacity
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: archiveTab === 'evaluations' ? '#7c3aed' : '#f1f5f9'
                  }}
                  onPress={() => setArchiveTab('evaluations')}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: archiveTab === 'evaluations' ? '#ffffff' : '#475569' }}>
                    📊 Evaluated Exams ({archiveRecords.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: archiveTab === 'presets' ? '#7c3aed' : '#f1f5f9'
                  }}
                  onPress={() => setArchiveTab('presets')}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: archiveTab === 'presets' ? '#ffffff' : '#475569' }}>
                    🔑 Saved Answer Keys ({presetList.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    borderRadius: 6,
                    backgroundColor: archiveTab === 'scans' ? '#7c3aed' : '#f1f5f9'
                  }}
                  onPress={() => setArchiveTab('scans')}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: archiveTab === 'scans' ? '#ffffff' : '#475569' }}>
                    📁 Scanned Sheets in Server ({scannedFilesList.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TAB 1: EVALUATED EXAMS */}
              {archiveTab === 'evaluations' && (
                <View style={{ flex: 1 }}>
                  {/* Search box */}
                  <View style={{ marginBottom: 10 }}>
                    <TextInput
                      style={[styles.textInput, { fontSize: 12.5, paddingVertical: 6, backgroundColor: '#ffffff' }]}
                      placeholder="🔍 Search past evaluated exams by name..."
                      value={archiveSearch}
                      onChangeText={setArchiveSearch}
                    />
                  </View>

                  <ScrollView style={{ maxHeight: 420 }}>
                    {archiveRecords.filter(r => !archiveSearch || (r.exam_name || '').toLowerCase().includes(archiveSearch.toLowerCase())).length === 0 ? (
                      <View style={{ padding: 30, alignItems: 'center' }}>
                        <Text style={{ fontSize: 13, color: '#94a3b8' }}>
                          {archiveRecords.length === 0 ? 'No past evaluations recorded yet. When you run an evaluation, it will be automatically archived here!' : 'No matching records found.'}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {archiveRecords
                          .filter(r => !archiveSearch || (r.exam_name || '').toLowerCase().includes(archiveSearch.toLowerCase()))
                          .map((rec) => (
                            <View
                              key={rec.id}
                              style={{
                                backgroundColor: '#ffffff',
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                borderRadius: 8,
                                padding: 12,
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 10
                              }}
                            >
                              <View style={{ flex: 1, minWidth: 240 }}>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
                                  {rec.exam_name}
                                </Text>
                                <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                                  <Text style={{ fontSize: 11.5, color: '#166534', fontWeight: '700' }}>
                                    👥 Candidates: {rec.total_candidates}
                                  </Text>
                                  <Text style={{ fontSize: 11.5, color: '#475569' }}>
                                    Full Marks: {rec.full_marks} (+{rec.marks_per_correct} / -{rec.negative_mark})
                                  </Text>
                                  <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                                    📅 {new Date(rec.created_at).toLocaleDateString('en-GB')} {new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                </View>
                              </View>

                              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                <TouchableOpacity
                                  style={{
                                    backgroundColor: '#0284c7',
                                    paddingHorizontal: 12,
                                    paddingVertical: 7,
                                    borderRadius: 6
                                  }}
                                  onPress={() => handleLoadPastRecord(rec.id)}
                                >
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffffff' }}>
                                    📥 Load Results
                                  </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                  style={{
                                    backgroundColor: '#fee2e2',
                                    borderWidth: 1,
                                    borderColor: '#fca5a5',
                                    paddingHorizontal: 8,
                                    paddingVertical: 7,
                                    borderRadius: 6
                                  }}
                                  onPress={() => handleDeletePastRecord(rec.id)}
                                >
                                  <Text style={{ fontSize: 12, color: '#b91c1c' }}>🗑️</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* TAB 2: SAVED PRESETS */}
              {archiveTab === 'presets' && (
                <ScrollView style={{ maxHeight: 420 }}>
                  {presetList.length === 0 ? (
                    <View style={{ padding: 30, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#94a3b8' }}>No saved answer key presets found.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {presetList.map((p) => (
                        <View
                          key={p.id}
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 8,
                            padding: 12,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 10
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 200 }}>
                            <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>
                              {p.name || p.exam_name}
                            </Text>
                            <Text style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                              {p.total_questions || 35} Questions | Full Marks: {p.full_marks || '35.00'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={{ backgroundColor: '#0284c7', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 }}
                              onPress={() => {
                                applyPresetObject(p, true);
                                setShowArchiveModal(false);
                                setShowKeyModal(true);
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffffff' }}>
                                📥 Load Key
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', paddingHorizontal: 8, paddingVertical: 7, borderRadius: 6 }}
                              onPress={() => handleDeletePreset(Number(p.id))}
                            >
                              <Text style={{ fontSize: 12, color: '#b91c1c' }}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>
              )}

              {/* TAB 3: SCANNED FILES */}
              {archiveTab === 'scans' && (
                <ScrollView style={{ maxHeight: 420 }}>
                  {scannedFilesList.length === 0 ? (
                    <View style={{ padding: 30, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#94a3b8' }}>No scanned sheets currently stored in the server.</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {scannedFilesList.map((f, i) => (
                        <View
                          key={i}
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                            📄 {f.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748b' }}>
                            {(f.size / 1024).toFixed(1)} KB
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>
              )}

              {/* Modal Footer */}
              <View style={[styles.modalFooter, { marginTop: 14, justifyContent: 'flex-end' }]}>
                <TouchableOpacity
                  style={[styles.btnSecondary, { paddingHorizontal: 16 }]}
                  onPress={() => setShowArchiveModal(false)}
                >
                  <Text style={styles.btnSecondaryText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: STUDENT OMR DETAILS */}
        <Modal visible={!!selectedStudent} transparent animationType="fade" onRequestClose={() => setSelectedStudent(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxWidth: 650 }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedStudent?.student_name}</Text>
                  <Text style={{ fontSize: 13, color: '#64748b' }}>
                    Reg No: {selectedStudent?.registration_no} | Class: {selectedStudent?.class_name} | {selectedStudent?.school_name}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedStudent(null)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.statsSummary}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Score</Text>
                  <Text style={[styles.statValue, { color: '#0F52BA' }]}>
                    {selectedStudent?.final_score.toFixed(2)} / {selectedStudent?.full_marks}
                  </Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Right</Text>
                  <Text style={[styles.statValue, { color: '#16a34a' }]}>{selectedStudent?.correct_count}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Wrong</Text>
                  <Text style={[styles.statValue, { color: '#dc2626' }]}>{selectedStudent?.wrong_count}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Blank</Text>
                  <Text style={[styles.statValue, { color: '#64748b' }]}>{selectedStudent?.blank_count}</Text>
                </View>
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#1e293b' }}>
                Question-by-Question Breakdown:
              </Text>
              <ScrollView style={{ maxHeight: 260 }}>
                <View style={styles.breakdownGrid}>
                  {Array.from({ length: selectedStudent?.total_questions || 35 }, (_, i) => i + 1).map((q) => {
                    const marked = selectedStudent?.student_answers[q.toString()] || 'BLANK';
                    const correctAns = answerKey[q.toString()] || '';
                    const isRight = selectedStudent?.correct_questions?.includes(q);
                    const isWrong = selectedStudent?.wrong_questions?.includes(q);
                    const isBonus = correctAns === 'ALL' || correctAns === 'BONUS' || correctAns === '*';

                    return (
                      <View
                        key={q}
                        style={[
                          styles.breakdownItem,
                          isRight && { backgroundColor: '#dcfce7', borderColor: '#86efac' },
                          isWrong && { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
                          isBonus && { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }
                        ]}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>Q{q}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '800' }}>
                          {marked === 'BLANK' ? '-' : marked}
                        </Text>
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: isBonus ? '#b45309' : '#64748b' }}>
                          Key: {isBonus ? '★ ALL' : (correctAns || '-')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Admin actions: Delete candidate / Close */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 16,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: '#e2e8f0'
              }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#fee2e2',
                    borderWidth: 1,
                    borderColor: '#fca5a5',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                  onPress={() => {
                    if (selectedStudent) {
                      handleRemoveCandidate(selectedStudent.registration_no, selectedStudent.student_name);
                    }
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>
                    🗑️ Delete Candidate (ফলাফল থেকে মুছুন)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: '#0F52BA',
                    paddingHorizontal: 18,
                    paddingVertical: 8,
                    borderRadius: 6
                  }}
                  onPress={() => setSelectedStudent(null)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>


      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { padding: 14, paddingBottom: 40 },
  noPrint: {},

  tableFilterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    marginTop: 4
  },
  tableFilterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1
  },
  tableFilterRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  searchBoxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 260,
    maxWidth: 380,
    flex: 1
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6
  },
  searchTextInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
    padding: 0
  },
  clearSearchBtn: {
    padding: 2,
    marginLeft: 6
  },
  clearSearchText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700'
  },
  filterSelectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  filterSelectLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  filterInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6
  },
  filterTextInput: {
    fontSize: 12,
    color: '#0f172a',
    padding: 0,
    minWidth: 100,
    maxWidth: 150
  },
  btnResetFilters: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6
  },
  btnResetFiltersText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#b91c1c'
  },
  filterCountBadge: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12
  },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },

  topBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    width: '100%',
    marginTop: 6
  },
  btnScan: {
    backgroundColor: '#059669',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  btnScanText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13
  },
  btnPrimary: {
    backgroundColor: '#0F52BA',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  btnSecondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  btnSecondaryText: { color: '#334155', fontWeight: '700', fontSize: 13 },

  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  fieldBoxLarge: { flex: 2, minWidth: 260 },
  fieldBox: { flex: 1, minWidth: 140 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 5 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff'
  },

  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14
  },
  resultsBadge: { fontSize: 14, color: '#1e293b' },
  resultsBadgeSub: { fontSize: 12, color: '#64748b' },
  exportBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  exportBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  printBtn: {
    backgroundColor: '#047857',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  printBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },

  // MERIT SHEET STYLES (A4 LANDSCAPE PRINT OPTIMIZED)
  meritSheetContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 16,
    borderRadius: 8
  },
  blankSlateContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 45,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10
  },
  meritHeader: {
    textAlign: 'center',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
    paddingBottom: 10,
    marginBottom: 10
  },
  institutionName: {
    fontFamily: Platform.OS === 'web' ? '"Times New Roman", Times, Georgia, serif' : 'serif',
    fontSize: 24,
    fontWeight: '800',
    color: '#1a3db8',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 3
  },
  meritTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.5
  },
  meritMetaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 6
  },
  meritMetaItem: { fontSize: 11, color: '#1e293b' },
  metaLabel: { fontWeight: '700', color: '#64748b' },

  tableWrapper: { width: '100%', overflow: 'hidden' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a'
  },
  th: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 4
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center'
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  td: { fontSize: 11, color: '#1e293b', paddingHorizontal: 4 },

  // COLUMN WIDTH RATIOS
  colRank: { width: 44, textAlign: 'center' },
  colReg: { width: 110, alignItems: 'center', justifyContent: 'center' },
  colName: { width: 170 },
  colClass: { width: 140 },
  colCount: { width: 48, textAlign: 'center' },
  colCorrectList: { flex: 3, minWidth: 220 },
  colWrongList: { flex: 2, minWidth: 160 },
  colScore: { width: 75, textAlign: 'right' },

  rankBadge: { fontWeight: '800', color: '#0f172a' },
  boldMono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '800', fontSize: 11, color: '#0f172a' },
  missionSubText: { fontSize: 9.5, color: '#0284c7', fontWeight: '800', marginTop: 1 },
  studentNameText: { fontWeight: '700', fontSize: 11, color: '#0f172a' },
  classText: { fontWeight: '700', fontSize: 11, color: '#334155' },
  schoolSubText: { fontSize: 9.5, color: '#64748b' },
  rightText: { color: '#15803d', fontWeight: '800' },
  wrongText: { color: '#b91c1c', fontWeight: '800' },
  blankText: { color: '#64748b', fontWeight: '600' },
  scoreText: { color: '#0F52BA', fontWeight: '900', fontSize: 12 },
  listText: { fontSize: 10, color: '#15803d', lineHeight: 14 },
  wrongListText: { color: '#b91c1c' },

  meritFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1'
  },
  footerNote: { fontSize: 9.5, color: '#64748b', fontStyle: 'italic' },
  footerSignature: { fontSize: 11, fontWeight: '700', color: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 2 },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 580,
    padding: 18,
    maxHeight: '90%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
    marginBottom: 12
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  closeBtn: { fontSize: 18, color: '#64748b', fontWeight: '700', padding: 4 },
  presetBar: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between'
  },
  presetLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4
  },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyItem: {
    width: 126,
    padding: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    alignItems: 'center'
  },
  keyQNum: { fontSize: 11, fontWeight: '700', color: '#475569' },
  bonusBtn: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  bonusBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706'
  },
  bonusBtnText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748b'
  },
  bonusBtnTextActive: {
    color: '#ffffff'
  },
  multiToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe'
  },
  multiToggleBtnActive: {
    backgroundColor: '#0F52BA',
    borderColor: '#0F52BA'
  },
  multiToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8'
  },
  multiToggleBtnTextActive: {
    color: '#ffffff'
  },
  optCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center'
  },
  optCircleActive: { backgroundColor: '#0F52BA', borderColor: '#0F52BA' },
  optText: { fontSize: 10, fontWeight: '700', color: '#334155' },
  optTextActive: { color: '#ffffff' },
  modalFooter: { marginTop: 14, alignItems: 'flex-end' },

  statsSummary: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center'
  },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  statValue: { fontSize: 14, fontWeight: '900', marginTop: 2 },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  breakdownItem: {
    width: 58,
    padding: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },

  // TERMINAL EXAM SYNC CARD
  terminalSyncCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3
  },
  syncCardHeader: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f9ff',
    paddingBottom: 8
  },
  syncCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369a1'
  },
  draftPill: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  draftPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.5
  },
  syncCardDesc: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
    lineHeight: 18
  },
  syncControlsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap'
  },
  syncLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6
  },
  btnSync: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSyncText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12.5
  },
  btnOpenTerminal: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnOpenTerminalText: {
    color: '#1e293b',
    fontWeight: '700',
    fontSize: 12.5
  },
  syncBanner: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1
  },
  syncBannerSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  syncBannerError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  syncBannerText: {
    fontSize: 12,
    fontWeight: '600'
  },
  syncBannerTextSuccess: {
    color: '#166534'
  },
  syncBannerTextError: {
    color: '#991b1b'
  },

  // SCHOOL FILTER TABS
  schoolFilterCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  schoolFilterTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  schoolFilterTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  schoolFilterBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  schoolFilterBtnActive: {
    backgroundColor: '#0F52BA',
    borderColor: '#0F52BA'
  },
  schoolFilterBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569'
  },
  schoolFilterBtnTextActive: {
    color: '#ffffff'
  },

  schoolSelectedBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
    alignSelf: 'center'
  },
  schoolSelectedText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  }
});

