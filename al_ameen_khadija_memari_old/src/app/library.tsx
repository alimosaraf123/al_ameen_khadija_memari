import LibraryLookup from '../components/LibraryLookup';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BarcodeDisplay, { BarcodeFormat } from '../components/BarcodeDisplay';
import JsBarcode from 'jsbarcode';
import { SafeAreaView } from 'react-native-safe-area-context';
import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';
import { Select } from '../components/StudentDirectory';
import { api, API_BASE } from '../lib/api';
import {
  IssueReceiptData,
  openReceiptPrintWindow,
  buildReceiptHtml,
  formatReceiptDate,
} from '../lib/libraryReceipt';

type Mode = 'menu' | 'catalogue' | 'issue' | 'status';

const due = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

const dateTime = (v: any) =>
  v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

const dateOnly = (v: any) => {
  if (!v) return '-';
  const str = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-IN');
};

const CATALOGUE_COLUMNS = [
  { key: 'book_number', label: 'Book Number', width: 130, sortable: true },
  { key: 'accession_no', label: 'Barcode', width: 140, sortable: true },
  { key: 'title', label: 'Book Name', width: 250, sortable: true },
  { key: 'book_class', label: 'Class', width: 110, sortable: true },
  { key: 'part', label: 'Part', width: 75, sortable: true },
  { key: 'category', label: 'Category', width: 120, sortable: true },
  { key: 'publisher', label: 'Publisher', width: 170, sortable: true },
  { key: 'publish_year', label: 'Publish Year', width: 120, sortable: true },
  { key: 'price', label: 'Price', width: 95, sortable: true },
  { key: 'purchase_date', label: 'Purchase Date', width: 130, sortable: true },
  { key: 'rack_no', label: 'Rack No', width: 95, sortable: true },
  { key: 'actions', label: 'Actions', width: 180, sortable: false },
];

const getNextBookAutoValues = (booksList: any[]) => {
  let maxNum = 1099; // Ensures start at 1100 if existing numbers are lower
  for (const b of booksList) {
    const rawNum = String(b.book_number || '').trim();
    const matchNum = rawNum.match(/\d+/);
    if (matchNum) {
      const val = parseInt(matchNum[0], 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
    const rawAcc = String(b.accession_no || '').trim();
    const matchAcc = rawAcc.match(/aam0*(\d+)/i) || rawAcc.match(/\d+/);
    if (matchAcc) {
      const val = parseInt(matchAcc[1] || matchAcc[0], 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
  }
  const nextNum = maxNum + 1;
  const nextBookNumber = String(nextNum);
  const nextBarcode = 'aam' + String(nextNum).padStart(5, '0');
  return { nextBookNumber, nextBarcode };
};

const compareBooks = (a: any, b: any, key: string) => {
  if (key === 'default') {
    return Number(a.id || 0) - Number(b.id || 0);
  }
  if (key === 'book_number') {
    const vA = String(a.book_number ?? '').trim();
    const vB = String(b.book_number ?? '').trim();
    if (!vA && !vB) return 0;
    if (!vA) return 1;
    if (!vB) return -1;
    const nA = Number(vA);
    const nB = Number(vB);
    if (!isNaN(nA) && !isNaN(nB)) return nA - nB;
    return vA.localeCompare(vB, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (key === 'price') {
    const hasA = a.price !== null && a.price !== undefined && String(a.price).trim() !== '';
    const hasB = b.price !== null && b.price !== undefined && String(b.price).trim() !== '';
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return Number(a.price) - Number(b.price);
  }
  if (key === 'publish_year') {
    const hasA = a.publish_year !== null && a.publish_year !== undefined && String(a.publish_year).trim() !== '';
    const hasB = b.publish_year !== null && b.publish_year !== undefined && String(b.publish_year).trim() !== '';
    if (!hasA && !hasB) return 0;
    if (!hasA) return 1;
    if (!hasB) return -1;
    return Number(a.publish_year) - Number(b.publish_year);
  }
  if (key === 'publisher') {
    const vA = String(a.publisher || a.author || '').trim();
    const vB = String(b.publisher || b.author || '').trim();
    if (!vA && !vB) return 0;
    if (!vA) return 1;
    if (!vB) return -1;
    return vA.localeCompare(vB, undefined, { sensitivity: 'base', numeric: true });
  }
  const vA = String(a[key] ?? '').trim();
  const vB = String(b[key] ?? '').trim();
  if (!vA && !vB) return 0;
  if (!vA) return 1;
  if (!vB) return -1;
  return vA.localeCompare(vB, undefined, { sensitivity: 'base', numeric: true });
};

export default function Library() {
  const bookInput = useRef<TextInput>(null);
  const [bookFocusRequest, setBookFocusRequest] = useState(0);

  useEffect(() => {
    if (!bookFocusRequest) return;
    const frame = requestAnimationFrame(() => bookInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [bookFocusRequest]);

  const scanValue = useRef('');
  const issueLock = useRef(false);

  const [mode, setMode] = useState<Mode>('menu');
  const [catalogFilter, setCatalogFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [books, setBooks] = useState<any[]>([]);
  const [sortKey, setSortKey] = useState<string>('default');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const [q, setQ] = useState('');
  const [bookNumber, setBookNumber] = useState('');
  const [accession, setAccession] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [copies, setCopies] = useState('1');
  const [bookClass, setBookClass] = useState('');
  const [part, setPart] = useState('');
  const [category, setCategory] = useState('academic');
  const [publisher, setPublisher] = useState('');
  const [publishYear, setPublishYear] = useState('');
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [rackNo, setRackNo] = useState('');
  const [showBookForm, setShowBookForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [reg, setReg] = useState('');
  const [data, setData] = useState<any>(null);
  const [bookMessage, setBookMessage] = useState('');
  const [bookId, setBookId] = useState('');
  const [bookSearch, setBookSearch] = useState('');
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [dueDate, setDueDate] = useState(due());
  const [dismissSuggestions, setDismissSuggestions] = useState(false);

  const matchingSuggestions = useMemo(() => {
    const query = bookSearch.trim().toLowerCase();
    if (!query || selectedBook || dismissSuggestions) return [];
    return books
      .filter(
        (x: any) =>
          Number(x.available_copies) > 0 &&
          [x.book_number, x.accession_no, x.title].some(v =>
            String(v || '').toLowerCase().includes(query)
          )
      )
      .slice(0, 10);
  }, [books, bookSearch, selectedBook, dismissSuggestions]);

  const [barcodeModalBook, setBarcodeModalBook] = useState<any>(null);
  const [receiptModal, setReceiptModal] = useState<IssueReceiptData | null>(null);

  const [status, setStatus] = useState('issued');
  const [statusQ, setStatusQ] = useState('');
  const [records, setRecords] = useState<any[]>([]);

  const loadBooks = async (nextFilter = catalogFilter, nextClass = classFilter) => {
    try {
      const d = await api(
        '/api/service-panels/library/books?q=' +
          encodeURIComponent(q) +
          '&category=' +
          encodeURIComponent(nextFilter) +
          '&book_class=' +
          encodeURIComponent(nextClass)
      );
      setBooks(d.books || []);
    } catch (e: any) {
      Alert.alert('Library', e.message);
    }
  };

  const loadStatus = async (next = status) => {
    try {
      const d = await api(
        '/api/service-panels/library/status?status=' +
          encodeURIComponent(next) +
          '&q=' +
          encodeURIComponent(statusQ)
      );
      setRecords(d.records || []);
    } catch (e: any) {
      Alert.alert('Book Status', e.message);
    }
  };

  useEffect(() => {
    void loadBooks();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'library-table-scroll-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          #libraryTableScroll, #statusTableScroll {
            scrollbar-width: thin;
            scrollbar-color: #93c5fd #f1f5f9;
          }
          #libraryTableScroll::-webkit-scrollbar,
          #statusTableScroll::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          #libraryTableScroll::-webkit-scrollbar-track,
          #statusTableScroll::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 6px;
          }
          #libraryTableScroll::-webkit-scrollbar-thumb,
          #statusTableScroll::-webkit-scrollbar-thumb {
            background: #93c5fd;
            border-radius: 6px;
            border: 2px solid #f1f5f9;
          }
          #libraryTableScroll::-webkit-scrollbar-thumb:hover,
          #statusTableScroll::-webkit-scrollbar-thumb:hover {
            background: #2563eb;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  const sortedBooks = useMemo(() => {
    if (!sortKey || sortKey === 'default') {
      return sortAsc ? books : [...books].reverse();
    }
    return [...books].sort((a, b) => {
      const res = compareBooks(a, b, sortKey);
      return sortAsc ? res : -res;
    });
  }, [books, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(cur => !cur);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const bookBody = () => ({
    book_number: bookNumber,
    accession_no: accession,
    title,
    author,
    total_copies: Number(copies),
    book_class: bookClass,
    part,
    category,
    publisher,
    publish_year: publishYear,
    price,
    purchase_date: purchaseDate,
    rack_no: rackNo,
  });

  const clearBook = () => {
    setBookNumber('');
    setAccession('');
    setTitle('');
    setAuthor('');
    setCopies('1');
    setBookClass('');
    setPart('');
    setCategory('academic');
    setPublisher('');
    setPublishYear('');
    setPrice('');
    setPurchaseDate('');
    setRackNo('');
    setEditing(null);
    setShowBookForm(false);
  };

  const openAddBook = () => {
    clearBook();
    const { nextBookNumber, nextBarcode } = getNextBookAutoValues(books);
    setBookNumber(nextBookNumber);
    setAccession(nextBarcode);
    setEditing(null);
    setShowBookForm(true);
  };

  const add = async () => {
    try {
      if (editing) {
        await api('/api/service-panels/library/books/' + editing.id, {
          method: 'PATCH',
          body: JSON.stringify(bookBody()),
        });
      } else {
        await api('/api/service-panels/library/books', {
          method: 'POST',
          body: JSON.stringify(bookBody()),
        });
      }
      clearBook();
      await loadBooks();
      Alert.alert('Library', editing ? 'Book updated.' : 'Book added.');
    } catch (e: any) {
      Alert.alert('Library', e.message);
    }
  };

  const editBook = (x: any) => {
    setEditing(x);
    setBookNumber(x.book_number || '');
    setAccession(x.accession_no || '');
    setTitle(x.title || '');
    setAuthor(x.author || '');
    setCopies(String(x.total_copies || 1));
    setBookClass(x.book_class || '');
    setPart(x.part || '');
    setCategory(x.category || 'academic');
    setPublisher(x.publisher || '');
    setPublishYear(x.publish_year ? String(x.publish_year) : '');
    setPrice(x.price ? String(x.price) : '');
    setPurchaseDate(x.purchase_date ? String(x.purchase_date).slice(0, 10) : '');
    setRackNo(x.rack_no || '');
    setShowBookForm(true);
  };

  const archiveBook = (x: any) =>
    Alert.alert('Archive Book', `Archive ${x.title}? Loan history will be preserved.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/api/service-panels/library/books/' + x.id + '/archive', {
              method: 'PATCH',
            });
            await loadBooks();
          } catch (e: any) {
            Alert.alert('Library', e.message);
          }
        },
      },
    ]);

  const printBarcode = (x: any) => {
    if (typeof window === 'undefined') return Alert.alert('Barcode', 'Print from the web panel.');
    const value = String(x.accession_no || x.book_number || '').trim();
    if (!value) return Alert.alert('Barcode', 'This book has no barcode.');

    let svgHtml = '';
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, value, {
        format: 'CODE128',
        width: 2.2,
        height: 75,
        displayValue: true,
        fontSize: 18,
        font: 'Arial',
        fontOptions: 'bold',
        textMargin: 6,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
      });
      svgHtml = svg.outerHTML;
    } catch (e) {
      console.warn('Barcode print error:', e);
    }

    const w = window.open('', '_blank', 'width=620,height=440');
    if (w) {
      w.document.write(
        `<html><head><title>Barcode ${value}</title><style>
          @page { size: auto; margin: 8mm; }
          body { font-family: Arial, sans-serif; text-align: center; padding: 24px; background: #fff; }
          .title { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #1e293b; }
          .barcode-box { display: flex; justify-content: center; align-items: center; margin: 16px auto; }
          .meta { font-size: 14px; color: #475569; margin-top: 8px; font-weight: 600; }
          button { margin-top: 20px; padding: 10px 24px; background: #0878f9; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 15px; cursor: pointer; }
          @media print { button { display: none; } }
        </style></head><body>
          <div class="title">${String(x.title || 'Book Barcode')}</div>
          <div class="barcode-box">${svgHtml || `<h3>${value}</h3>`}</div>
          <div class="meta">Book No: ${String(x.book_number || '-')} | Class: ${String(x.book_class || '-')} | Rack: ${String(x.rack_no || '-')}</div>
          <button onclick="window.print()">Print Barcode</button>
        </body></html>`
      );
      w.document.close();
      w.focus();
    }
  };

  const student = async () => {
    const code = data?.student?.registration_no || reg.trim();
    if (!code) return;
    try {
      setData(await api('/api/service-panels/library/student/' + encodeURIComponent(code)));
    } catch (e: any) {
      Alert.alert('Student', e.message);
    }
  };

  const findBook = async () => {
    setBookMessage('');
    const code = bookSearch.trim();
    if (!code) return Alert.alert('Library', 'Enter Book Number, Barcode or Book Name.');
    const local = books.find(
      (x: any) =>
        Number(x.available_copies) > 0 &&
        (String(x.book_number || '').toLowerCase() === code.toLowerCase() ||
          String(x.accession_no || '').toLowerCase() === code.toLowerCase() ||
          String(x.title || '').toLowerCase() === code.toLowerCase())
    );
    if (local) {
      setSelectedBook(local);
      setBookId(String(local.id));
      setBookSearch(local.accession_no);
      return;
    }
    try {
      const d = await api('/api/service-panels/library/book/' + encodeURIComponent(code));
      setSelectedBook(d.book);
      setBookId(String(d.book.id));
    } catch (e: any) {
      setSelectedBook(null);
      setBookId('');
      setBookMessage(e.message);
      Alert.alert('Book', e.message);
    }
  };

  const printReceiptFromLoan = (loan: any, st: any) => {
    const receiptData: IssueReceiptData = {
      studentName: st?.student_name || 'Student',
      regNo: st?.registration_no || '',
      className: st?.class_name || '',
      transactionId: loan?.id || loan?.loan_id || 'ID',
      photoUrl: st?.photo_url,
      bookBarcode: loan?.accession_no || loan?.book_number || '',
      bookName: loan?.title || 'Book',
      issueDate: loan?.issued_at || new Date().toISOString(),
      rackNo: loan?.rack_no || '',
      issuedByName: loan?.issued_by_name || '',
    };
    setReceiptModal(receiptData);
    openReceiptPrintWindow(receiptData, API_BASE);
  };

  const printReceiptFromStatus = (record: any) => {
    const receiptData: IssueReceiptData = {
      studentName: record?.student_name || 'Student',
      regNo: record?.registration_no || '',
      className: record?.class_name || '',
      transactionId: record?.loan_id || record?.id || 'ID',
      photoUrl: record?.photo_url,
      bookBarcode: record?.accession_no || record?.book_number || '',
      bookName: record?.title || 'Book',
      issueDate: record?.issued_at || new Date().toISOString(),
      rackNo: record?.rack_no || '',
      issuedByName: record?.issued_by_name || '',
    };
    setReceiptModal(receiptData);
    openReceiptPrintWindow(receiptData, API_BASE);
  };

  const issue = async (overrideId?: string) => {
    if (issueLock.current) return;
    const activeId = overrideId || bookId;
    if (!data?.student || !activeId) {
      setBookMessage('Find student and select a book.');
      return;
    }

    // Open print window synchronously on click so browser popup blocker does not block it:
    let printWin: Window | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        printWin = window.open('', '_blank', 'width=620,height=460,scrollbars=no');
        if (printWin) {
          printWin.document.write('<!DOCTYPE html><html><head><title>Loading Receipt...</title></head><body style="font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p style="color:#64748b;font-weight:bold;">Preparing print slip...</p></body></html>');
        }
      } catch {}
    }

    issueLock.current = true;
    setBookMessage('Issuing book...');
    try {
      const res = await api('/api/service-panels/library/issue', {
        method: 'POST',
        body: JSON.stringify({
          book_id: Number(activeId),
          student_id: data.student.id,
          due_date: dueDate,
        }),
      });

      const studentObj = res?.student || data.student;
      const bookObj =
        res?.book || selectedBook || books.find((b: any) => b.id === Number(activeId));
      const receiptData: IssueReceiptData = {
        studentName: studentObj?.student_name || 'Student',
        regNo: studentObj?.registration_no || '',
        className: studentObj?.class_name || '',
        transactionId: res?.loan_id || 'NEW',
        photoUrl: studentObj?.photo_url,
        bookBarcode: bookObj?.accession_no || bookObj?.book_number || scanValue.current || '',
        bookName: bookObj?.title || 'Book',
        issueDate: res?.issued_at || new Date().toISOString(),
        rackNo: bookObj?.rack_no || '',
        issuedByName: res?.issued_by_name || '',
      };
      setReceiptModal(receiptData);

      if (printWin && !printWin.closed) {
        printWin.document.open();
        printWin.document.write(buildReceiptHtml(receiptData, API_BASE));
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          try {
            printWin?.print();
          } catch {}
        }, 400);
      } else {
        openReceiptPrintWindow(receiptData, API_BASE);
      }

      setBookId('');
      setBookSearch('');
      scanValue.current = '';
      setSelectedBook(null);
      setBookMessage('Book issued successfully.');
      await loadBooks();
      await student();
      await loadStatus();
    } catch (e: any) {
      if (printWin && !printWin.closed) {
        printWin.close();
      }
      setBookMessage(e.message);
    } finally {
      issueLock.current = false;
      bookInput.current?.focus();
    }
  };

  const scanAndIssue = async () => {
    if (issueLock.current) return;
    const code = scanValue.current.trim() || bookSearch.trim();
    if (!code) {
      setBookMessage('Scan a book barcode first.');
      return;
    }
    issueLock.current = true;
    setBookMessage('Finding book...');
    let found: any;
    try {
      const result = await api('/api/service-panels/library/book/' + encodeURIComponent(code));
      found = result.book;
      setSelectedBook(found);
      setBookId(String(found.id));
    } catch (e: any) {
      setBookMessage(e.message);
      setSelectedBook(null);
      setBookId('');
    } finally {
      issueLock.current = false;
    }
    if (found) await issue(String(found.id));
  };

  const returned = async (id: number) => {
    try {
      await api('/api/service-panels/library/loans/' + id + '/return', {
        method: 'PATCH',
      });
      await loadBooks();
      if (data) await student();
      await loadStatus();
    } catch (e: any) {
      Alert.alert('Library', e.message);
    }
  };

  const open = (m: Mode) => {
    setMode(m);
    if (m === 'status') void loadStatus();
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />
        <View style={s.top}>
          <Text style={s.title}>Library Panel</Text>
          {mode !== 'menu' && (
            <TouchableOpacity style={s.back} onPress={() => setMode('menu')}>
              <Text style={s.backText}>‹ Library Menu</Text>
            </TouchableOpacity>
          )}
        </View>

        {mode === 'menu' && (
          <View style={s.menu}>
            <Menu title="Book Catalogue" onPress={() => open('catalogue')} />
            <Menu title="Issue / Return" onPress={() => open('issue')} />
            <Menu title="Book Status" onPress={() => open('status')} />
          </View>
        )}

        {mode === 'catalogue' && (
          <View style={s.card}>
            <View style={s.catalogueFilter}>
              <Select
                label="Category"
                value={catalogFilter}
                onChange={(v: string) => {
                  setCatalogFilter(v);
                  void loadBooks(v, classFilter);
                }}
                options={[
                  { value: '', label: 'All Categories' },
                  { value: 'academic', label: 'Academic' },
                  { value: 'art', label: 'Art' },
                  { value: 'general', label: 'General' },
                ]}
              />
              <Select
                label="Class"
                value={classFilter}
                onChange={(v: string) => {
                  setClassFilter(v);
                  void loadBooks(catalogFilter, v);
                }}
                options={[
                  { value: '', label: 'All Classes' },
                  { value: 'v', label: 'V' },
                  { value: 'vi', label: 'VI' },
                  { value: 'vii', label: 'VII' },
                  { value: 'viii', label: 'VIII' },
                  { value: 'ix', label: 'IX' },
                  { value: 'x', label: 'X' },
                  { value: 'xi_science', label: 'XI Science' },
                  { value: 'xi_arts', label: 'XI Arts' },
                  { value: 'xii_science', label: 'XII Science' },
                  { value: 'xii_arts', label: 'XII Arts' },
                  { value: 'jee', label: 'JEE' },
                  { value: 'neet', label: 'NEET' },
                  { value: 'ssc', label: 'SSC' },
                ]}
              />
            </View>

            <View style={s.listTitle}>
              <Text style={s.listHeading}>List of Books ({sortedBooks.length})</Text>
              <TouchableOpacity
                style={s.primary}
                onPress={openAddBook}
              >
                <Text style={s.white}>Add Book</Text>
              </TouchableOpacity>
            </View>

            {showBookForm && (
              <View style={s.bookForm}>
                <View style={s.formHeaderRow}>
                  <Text style={s.heading}>{editing ? 'Edit Book' : 'Add Book'}</Text>
                  {!editing ? (
                    <View style={s.autoTag}>
                      <Text style={s.autoTagText}>Auto: Book #{bookNumber} · Barcode: {accession}</Text>
                    </View>
                  ) : (
                    <View style={s.editTag}>
                      <Text style={s.editTagText}>Editing Book #{editing.book_number || editing.id} (Changeable)</Text>
                    </View>
                  )}
                </View>
                <View style={s.grid}>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>
                      Book Number {editing ? '(Changeable)' : '(Auto: 1100+)'}
                    </Text>
                    <Field
                      p="Book Number"
                      v={bookNumber}
                      set={setBookNumber}
                      editable={true}
                    />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>
                      Barcode / Book ID * {editing ? '(Changeable)' : '(Auto: aam01100+)'}
                    </Text>
                    <Field
                      p="Barcode / Book ID *"
                      v={accession}
                      set={setAccession}
                      editable={true}
                    />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Book Name *</Text>
                    <Field p="Book Name *" v={title} set={setTitle} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Class</Text>
                    <Field p="Class" v={bookClass} set={setBookClass} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Part</Text>
                    <Field p="Part" v={part} set={setPart} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Category</Text>
                    <Field p="Category" v={category} set={setCategory} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Author</Text>
                    <Field p="Author" v={author} set={setAuthor} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Publisher</Text>
                    <Field p="Publisher" v={publisher} set={setPublisher} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Publish Year</Text>
                    <Field p="Publish Year" v={publishYear} set={setPublishYear} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Price</Text>
                    <Field p="Price" v={price} set={setPrice} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Purchase Date</Text>
                    <DatePickerField
                      label=""
                      value={purchaseDate}
                      onChange={setPurchaseDate}
                      optional={true}
                      style={{ marginBottom: 0, minWidth: 190 }}
                    />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Rack No</Text>
                    <Field p="Rack No" v={rackNo} set={setRackNo} />
                  </View>
                  <View style={s.inputWrapper}>
                    <Text style={s.inputLabel}>Copies</Text>
                    <Field p="Copies" v={copies} set={setCopies} />
                  </View>
                </View>

                {accession.trim().length > 0 && (
                  <View style={s.barcodePreviewBox}>
                    <Text style={s.barcodePreviewHeading}>
                      Barcode Preview (Code 128 - react-native-barcode-creator)
                    </Text>
                    <BarcodeDisplay
                      value={accession.trim()}
                      format={BarcodeFormat.CODE128}
                      width={280}
                      height={85}
                      showText={true}
                    />
                  </View>
                )}

                <View style={s.grid}>
                  <TouchableOpacity style={s.primary} onPress={add}>
                    <Text style={s.white}>{editing ? 'Save Changes' : 'Save Book'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.light} onPress={clearBook}>
                    <Text>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={s.catalogueControls}>
              <View style={s.sortControlGroup}>
                <Text style={s.sortBarLabel}>Sort by:</Text>
                <View style={s.sortSelectBox}>
                  <Select
                    label="Sort Column"
                    value={sortKey}
                    onChange={(v: string) => setSortKey(v)}
                    options={[
                      { value: 'default', label: 'Default Order' },
                      { value: 'book_number', label: 'Book Number' },
                      { value: 'accession_no', label: 'Barcode' },
                      { value: 'title', label: 'Book Name' },
                      { value: 'book_class', label: 'Class' },
                      { value: 'part', label: 'Part' },
                      { value: 'category', label: 'Category' },
                      { value: 'publisher', label: 'Publisher' },
                      { value: 'publish_year', label: 'Publish Year' },
                      { value: 'price', label: 'Price' },
                      { value: 'purchase_date', label: 'Purchase Date' },
                      { value: 'rack_no', label: 'Rack No' },
                    ]}
                  />
                </View>
                <TouchableOpacity
                  style={s.directionButton}
                  onPress={() => setSortAsc(prev => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort ${sortAsc ? 'Ascending' : 'Descending'}`}
                >
                  <Text style={s.directionButtonText}>
                    {sortAsc ? '▲ Asc' : '▼ Desc'}
                  </Text>
                </TouchableOpacity>
                {sortKey !== 'default' && (
                  <TouchableOpacity
                    style={s.resetSortButton}
                    onPress={() => {
                      setSortKey('default');
                      setSortAsc(true);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={s.resetSortText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={s.searchGroup}>
                <Field
                  p="Search"
                  v={q}
                  set={setQ}
                  onSubmitEditing={() => loadBooks()}
                  returnKeyType="search"
                />
                <TouchableOpacity style={s.light} onPress={() => loadBooks()}>
                  <Text>Search</Text>
                </TouchableOpacity>
              </View>
            </View>

            <CatalogueTable
              books={sortedBooks}
              sortKey={sortKey}
              sortAsc={sortAsc}
              onSort={toggleSort}
              onBarcode={(b: any) => setBarcodeModalBook(b)}
              onEdit={editBook}
              onArchive={archiveBook}
            />

            {barcodeModalBook && (
              <Modal
                visible={!!barcodeModalBook}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setBarcodeModalBook(null)}
              >
                <View style={s.modalOverlay}>
                  <View style={s.modalCard}>
                    <View style={s.modalHeader}>
                      <Text style={s.modalTitle}>Book Barcode</Text>
                      <TouchableOpacity
                        style={s.modalCloseBtn}
                        onPress={() => setBarcodeModalBook(null)}
                      >
                        <Text style={s.modalCloseText}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={s.modalBookTitle}>
                      {barcodeModalBook.title || 'Untitled Book'}
                    </Text>
                    <Text style={s.modalMeta}>
                      Book #{barcodeModalBook.book_number || '-'} · Class: {barcodeModalBook.book_class || '-'} · Rack: {barcodeModalBook.rack_no || '-'}
                    </Text>

                    <View style={s.modalBarcodeArea}>
                      <BarcodeDisplay
                        value={barcodeModalBook.accession_no || barcodeModalBook.book_number || 'aam01100'}
                        format={BarcodeFormat.CODE128}
                        width={300}
                        height={100}
                        showText={true}
                      />
                    </View>

                    <View style={s.modalActions}>
                      <TouchableOpacity
                        style={s.primary}
                        onPress={() => {
                          printBarcode(barcodeModalBook);
                        }}
                      >
                        <Text style={s.white}>Print Barcode</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.light}
                        onPress={() => setBarcodeModalBook(null)}
                      >
                        <Text>Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            )}
          </View>
        )}

        {mode === 'issue' && (
          <View style={s.card}>
            <Text style={s.heading}>Issue / Return</Text>
            <LibraryLookup
              onClear={() => {
                if (issueLock.current) return false;
                setData(null);
                setReg('');
                setBookSearch('');
                scanValue.current = '';
                setBookId('');
                setSelectedBook(null);
                setBookMessage('');
                setDismissSuggestions(false);
                return true;
              }}
              onIssueReady={() => {
                setBookSearch('');
                scanValue.current = '';
                setDismissSuggestions(false);
                setBookFocusRequest(value => value + 1);
              }}
              onStudent={(result: any) => {
                setData(result);
                setReg(String(result.student.registration_no));
                setBookId('');
                setSelectedBook(null);
                setDismissSuggestions(false);
              }}
            />
            {data && (
              <>
                <View style={s.student}>
                  {data.student.photo_url && (
                    <Image
                      source={{
                        uri: /^http/.test(data.student.photo_url)
                          ? data.student.photo_url
                          : API_BASE + data.student.photo_url,
                      }}
                      style={s.photo}
                    />
                  )}
                  <Text style={s.bold}>
                    {data.student.student_name} · {data.student.registration_no} · Class{' '}
                    {data.student.class_name}
                  </Text>
                </View>
                <View style={s.grid}>
                  <View style={s.bookSearchArea}>
                    <View style={s.bookLookup}>
                      <Field
                        key={'book-scan-' + bookFocusRequest}
                        autoFocus={bookFocusRequest > 0}
                        inputRef={bookInput}
                        blurOnSubmit={false}
                        p="Book Number / Barcode / Book Name"
                        v={bookSearch}
                        set={(v: string) => {
                          scanValue.current = v;
                          setBookSearch(v);
                          setSelectedBook(null);
                          setBookId('');
                          setDismissSuggestions(false);
                        }}
                        onSubmitEditing={() => void scanAndIssue()}
                        returnKeyType="search"
                      />
                      <TouchableOpacity style={s.primary} onPress={findBook}>
                        <Text style={s.white}>Find Book</Text>
                      </TouchableOpacity>
                    </View>
                    {matchingSuggestions.length > 0 && (
                      <View style={s.suggestions}>
                        <View style={s.suggestionsHeader}>
                          <Text style={s.suggestionsHeaderTitle}>
                            Matching Books ({matchingSuggestions.length})
                          </Text>
                          <TouchableOpacity
                            style={s.suggestionsCloseBtn}
                            onPress={() => setDismissSuggestions(true)}
                          >
                            <Text style={s.suggestionsCloseText}>✕ Close</Text>
                          </TouchableOpacity>
                        </View>
                        <ScrollView
                          style={{ maxHeight: 260 }}
                          nestedScrollEnabled={true}
                          keyboardShouldPersistTaps="handled"
                        >
                          {matchingSuggestions.map((x: any) => (
                            <TouchableOpacity
                              key={x.id}
                              style={s.suggestion}
                              onPress={() => {
                                setSelectedBook(x);
                                setBookId(String(x.id));
                                setBookSearch(x.accession_no);
                                setDismissSuggestions(true);
                              }}
                            >
                              <View style={s.suggestionTop}>
                                <Text style={s.bold}>
                                  Book #{x.book_number || '-'} · Barcode: {x.accession_no}
                                </Text>
                                <Text style={s.suggestionRack}>
                                  Rack {x.rack_no || '-'}
                                </Text>
                              </View>
                              <Text style={s.suggestionTitle}>
                                {x.title} {x.book_class ? `· Class ${x.book_class}` : ''}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  {selectedBook && (
                    <View style={s.selectedBook}>
                      <Text style={s.bold}>
                        {selectedBook.accession_no} · {selectedBook.title}
                      </Text>
                      <Text>
                        Class: {selectedBook.book_class || '-'} · Rack:{' '}
                        {selectedBook.rack_no || '-'} · Available: {selectedBook.available_copies}
                      </Text>
                    </View>
                  )}
                  <DatePickerField label="Due date" value={dueDate} onChange={setDueDate} />
                  <TouchableOpacity style={s.issue} onPress={() => void issue()}>
                    <Text style={s.white}>Issue Book</Text>
                  </TouchableOpacity>
                </View>
                {bookMessage ? (
                  <Text accessibilityLiveRegion="polite" style={{ color: '#b42318', fontWeight: '700' }}>
                    {bookMessage}
                  </Text>
                ) : null}
                <View style={s.historySection}>
                  <Text style={s.heading}>Student Book History</Text>
                  {data.loans.map((x: any) => (
                    <View key={x.id} style={s.row}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={s.bold}>
                          {x.accession_no} · {x.title}
                        </Text>
                        <Text>
                          Issued: {dateTime(x.issued_at)} · Due: {dateOnly(x.due_date)} ·{' '}
                          {x.returned_at ? 'Returned: ' + dateTime(x.returned_at) : 'Outstanding'}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={s.receiptBtn}
                          onPress={() => printReceiptFromLoan(x, data.student)}
                        >
                          <Text style={s.white}>Receipt</Text>
                        </TouchableOpacity>
                        {!x.returned_at && (
                          <TouchableOpacity style={s.returned} onPress={() => returned(x.id)}>
                            <Text style={s.white}>Return</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {mode === 'status' && (
          <View style={s.card}>
            <Text style={s.heading}>Book Status</Text>
            <View style={s.statusBar}>
              <Select
                label="Status"
                value={status}
                onChange={(v: string) => {
                  setStatus(v);
                  void loadStatus(v);
                }}
                options={[
                  { value: 'issued', label: 'Issued' },
                  { value: 'available', label: 'Not Issued / Available' },
                ]}
              />
              <Field
                p="Search book / student / registration"
                v={statusQ}
                set={setStatusQ}
              />
              <TouchableOpacity style={s.primary} onPress={() => loadStatus()}>
                <Text style={s.white}>Search</Text>
              </TouchableOpacity>
            </View>
            <StatusTable
              status={status}
              records={records}
              onReturn={returned}
              onPrintReceipt={printReceiptFromStatus}
            />
          </View>
        )}

        {receiptModal && (
          <Modal
            visible={!!receiptModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setReceiptModal(null)}
          >
            <View style={s.modalOverlay}>
              <View style={[s.modalCard, { maxWidth: 640, width: '96%', padding: 16 }]}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Library Book Issue Receipt (14cm × 9.5cm)</Text>
                  <TouchableOpacity
                    style={s.modalCloseBtn}
                    onPress={() => setReceiptModal(null)}
                  >
                    <Text style={s.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginVertical: 8, alignItems: 'center', backgroundColor: '#e2e8f0', padding: 8, borderRadius: 8 }}>
                  {Platform.OS === 'web' ? (
                    React.createElement('iframe', {
                      srcDoc: buildReceiptHtml(receiptModal, API_BASE),
                      style: {
                        width: '567px',
                        height: '397px',
                        maxWidth: '100%',
                        border: 'none',
                        borderRadius: '4px',
                        background: '#f1f5f9',
                      },
                      title: 'Receipt Preview',
                    })
                  ) : (
                    <View style={{ padding: 16, alignItems: 'center', backgroundColor: '#fff', width: '100%', borderRadius: 6 }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{receiptModal.bookName}</Text>
                      <Text style={{ marginTop: 4 }}>Barcode: {receiptModal.bookBarcode}</Text>
                      <Text>Student: {receiptModal.studentName} ({receiptModal.regNo})</Text>
                      <Text>Transaction ID: {receiptModal.transactionId}</Text>
                      <Text>Date: {formatReceiptDate(receiptModal.issueDate)}</Text>
                    </View>
                  )}
                </View>

                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={[s.primary, { backgroundColor: '#198754' }]}
                    onPress={() => {
                      openReceiptPrintWindow(receiptModal, API_BASE);
                    }}
                  >
                    <Text style={s.white}>Print Receipt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.light}
                    onPress={() => setReceiptModal(null)}
                  >
                    <Text>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Menu = ({ title, onPress }: any) => (
  <TouchableOpacity onPress={onPress} style={s.menuCard}>
    <Text style={s.menuArrow}>›</Text>
    <Text style={s.menuText}>{title}</Text>
  </TouchableOpacity>
);

const TableScrollWrapper = ({ children, nativeID, style }: any) => {
  if (Platform.OS === 'web') {
    return (
      <View nativeID={nativeID} style={style}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true}>
      <ScrollView
        style={{ maxHeight: 580 }}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
        stickyHeaderIndices={[0]}
      >
        {children}
      </ScrollView>
    </ScrollView>
  );
};

const CatalogueTable = ({
  books,
  sortKey,
  sortAsc,
  onSort,
  onBarcode,
  onEdit,
  onArchive,
}: any) => (
  <TableScrollWrapper nativeID="libraryTableScroll" style={s.tableScrollFrame}>
    <View style={s.catalogueTable}>
      <View style={[s.tr, s.th, s.stickyHeader]}>
        {CATALOGUE_COLUMNS.map(col => {
          const isSorted = sortKey === col.key;
          if (!col.sortable) {
            return (
              <View key={col.key} style={[s.catalogueHeadWrap, { width: col.width }]}>
                <Text style={s.catalogueHead}>{col.label}</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={col.key}
              onPress={() => onSort(col.key)}
              style={[
                s.catalogueHeadWrap,
                s.catalogueHeadTouch,
                { width: col.width },
                isSorted && s.catalogueHeadActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${col.label}, currently ${
                isSorted ? (sortAsc ? 'ascending' : 'descending') : 'unsorted'
              }`}
            >
              <Text
                style={[s.catalogueHead, isSorted && s.catalogueHeadActiveText]}
                numberOfLines={1}
              >
                {col.label}
              </Text>
              <Text style={[s.sortIndicator, isSorted && s.sortIndicatorActive]}>
                {isSorted ? (sortAsc ? ' ▲' : ' ▼') : ' ⇅'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {books.map((x: any, i: number) => (
        <View
          key={String(x.id || x.accession_no || 'book') + '-' + i}
          style={[s.tr, i % 2 === 1 ? s.trAlt : null]}
        >
          <Text style={[s.catalogueCell, { width: 130 }]}>{x.book_number || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 140 }]}>{x.accession_no}</Text>
          <Text style={[s.catalogueCell, { width: 250 }]}>{x.title}</Text>
          <Text style={[s.catalogueCell, { width: 110 }]}>{x.book_class || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 75 }]}>{x.part || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 120 }]}>{x.category || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 170 }]}>{x.publisher || x.author || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 120 }]}>{x.publish_year || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 95 }]}>{x.price || '-'}</Text>
          <Text style={[s.catalogueCell, { width: 130 }]}>
            {x.purchase_date ? String(x.purchase_date).slice(0, 10) : '-'}
          </Text>
          <Text style={[s.catalogueCell, { width: 95 }]}>{x.rack_no || '-'}</Text>
          <View style={[s.catalogueActions, { width: 180 }]}>
            <TouchableOpacity style={s.barcode} onPress={() => onBarcode(x)}>
              <Text style={s.white}>Barcode</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.edit} onPress={() => onEdit(x)}>
              <Text>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.archive} onPress={() => onArchive(x)}>
              <Text style={s.white}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {books.length === 0 && (
        <View style={{ padding: 24 }}>
          <Text style={s.empty}>No books found matching the criteria.</Text>
        </View>
      )}
    </View>
  </TableScrollWrapper>
);

const StatusTable = ({ status, records, onReturn, onPrintReceipt }: any) => {
  const [sortCol, setSortCol] = useState<string>('id');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(cur => !cur);
    else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortedRecords = useMemo(() => {
    if (!sortCol) return records;
    return [...records].sort((a, b) => {
      const vA = String(a[sortCol] ?? '').trim();
      const vB = String(b[sortCol] ?? '').trim();
      const nA = Number(vA);
      const nB = Number(vB);
      const res = !isNaN(nA) && !isNaN(nB) && vA !== '' && vB !== ''
        ? nA - nB
        : vA.localeCompare(vB, undefined, { numeric: true, sensitivity: 'base' });
      return sortAsc ? res : -res;
    });
  }, [records, sortCol, sortAsc]);

  const issuedHeaders: [string, string][] = [
    ['accession_no', 'Book ID'],
    ['student_name', 'Student Name'],
    ['registration_no', 'Reg. No'],
    ['class_name', 'Class'],
    ['issued_at', 'Issue Date & Time'],
    ['due_date', 'Due Date'],
    ['title', 'Book Name'],
    ['author', 'Author'],
    ['action', 'Action'],
  ];

  const availableHeaders: [string, string][] = [
    ['accession_no', 'Book ID'],
    ['title', 'Book Name'],
    ['author', 'Author'],
    ['available_count', 'Available'],
    ['total_copies', 'Total Copies'],
  ];

  const headers = status === 'issued' ? issuedHeaders : availableHeaders;

  return (
    <TableScrollWrapper nativeID="statusTableScroll" style={s.tableScrollFrame}>
      <View style={s.table}>
        <View style={[s.tr, s.th, s.stickyHeader]}>
          {headers.map(([colKey, label]) => {
            const isSortable = colKey !== 'action';
            const isSorted = sortCol === colKey;
            const isAction = colKey === 'action';
            if (!isSortable) {
              return (
                <View key={colKey} style={[s.cellHead, isAction && { width: 170 }]}>
                  <Text style={[s.cellHeadText, isAction && { width: 170 }]}>{label}</Text>
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={colKey}
                onPress={() => toggleSort(colKey)}
                style={[s.cellHead, s.cellHeadTouch, isSorted && s.catalogueHeadActive]}
                accessibilityRole="button"
              >
                <Text style={[s.cellHeadText, isSorted && s.catalogueHeadActiveText]}>
                  {label}
                </Text>
                <Text style={[s.sortIndicator, isSorted && s.sortIndicatorActive]}>
                  {isSorted ? (sortAsc ? ' ▲' : ' ▼') : ' ⇅'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {sortedRecords.length ? (
          sortedRecords.map((x: any, i: number) => (
            <View
              key={status + '-' + String(x.loan_id || x.id || x.accession_no || 'record') + '-' + i}
              style={[s.tr, i % 2 === 1 ? s.trAlt : null]}
            >
              {status === 'issued' ? (
                <>
                  <Text style={s.cell}>{x.accession_no}</Text>
                  <Text style={s.cell}>{x.student_name}</Text>
                  <Text style={s.cell}>{x.registration_no}</Text>
                  <Text style={s.cell}>{x.class_name || '-'}</Text>
                  <Text style={s.cell}>{dateTime(x.issued_at)}</Text>
                  <Text style={s.cell}>{x.due_date}</Text>
                  <Text style={s.cell}>{x.title}</Text>
                  <Text style={s.cell}>{x.author || '-'}</Text>
                  <View style={[s.cell, { width: 170, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                    <TouchableOpacity
                      style={s.receiptBtn}
                      onPress={() => onPrintReceipt?.(x)}
                    >
                      <Text style={s.white}>Receipt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.returned} onPress={() => onReturn(x.loan_id)}>
                      <Text style={s.white}>Return</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.cell}>{x.accession_no}</Text>
                  <Text style={s.cell}>{x.title}</Text>
                  <Text style={s.cell}>{x.author || '-'}</Text>
                  <Text style={s.cell}>{x.available_count}</Text>
                  <Text style={s.cell}>{x.total_copies}</Text>
                </>
              )}
            </View>
          ))
        ) : (
          <Text style={s.empty}>No book record found.</Text>
        )}
      </View>
    </TableScrollWrapper>
  );
};

const Field = ({ p, v, set, inputRef, ...rest }: any) => (
  <TextInput
    ref={inputRef}
    value={v}
    onChangeText={set}
    placeholder={p}
    style={s.input}
    {...rest}
  />
);

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef4f7' },
  body: { padding: 16, maxWidth: 1500, width: '100%', alignSelf: 'center', gap: 13 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 25, fontWeight: '900' },
  back: { backgroundColor: '#dce8f4', padding: 10, borderRadius: 7 },
  backText: { fontWeight: '800', color: '#174f75' },
  white: { color: '#fff', fontWeight: '800' },
  menu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 11,
  },
  menuCard: {
    minWidth: 250,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#d5dce5',
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 10,
  },
  menuArrow: { fontSize: 28, color: '#1769aa' },
  menuText: { fontSize: 18, fontWeight: '900' },
  catalogueFilter: { backgroundColor: '#b9e2ee', padding: 10, borderRadius: 7 },
  listTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#b7c0cb',
    padding: 7,
  },
  listHeading: { fontSize: 24, fontWeight: '900' },
  bookForm: {
    backgroundColor: '#f5f8fb',
    borderWidth: 1,
    borderColor: '#ccd5df',
    padding: 14,
    borderRadius: 8,
    gap: 12,
  },
  catalogueControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  sortControlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortBarLabel: {
    fontWeight: '800',
    color: '#334155',
    fontSize: 14,
  },
  sortSelectBox: {
    minWidth: 165,
  },
  directionButton: {
    backgroundColor: '#dceaf8',
    borderColor: '#93c5fd',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  directionButtonText: {
    fontWeight: '800',
    color: '#0369a1',
    fontSize: 13,
  },
  resetSortButton: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  resetSortText: {
    fontWeight: '700',
    color: '#64748b',
    fontSize: 12,
  },
  searchGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' },
  catalogueTable: { minWidth: 1615 },
  catalogueHeadWrap: {
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  catalogueHeadTouch: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : {}),
  },
  catalogueHead: {
    fontWeight: '900',
    color: '#1e293b',
    fontSize: 14,
  },
  catalogueHeadActive: {
    backgroundColor: '#bed7f7',
  },
  catalogueHeadActiveText: {
    color: '#0c4a6e',
    fontWeight: '900',
  },
  sortIndicator: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '800',
    marginLeft: 3,
  },
  sortIndicatorActive: {
    color: '#0284c7',
    fontWeight: '900',
  },
  catalogueCell: { padding: 11, color: '#1e293b' },
  catalogueActions: { padding: 6, flexDirection: 'row', gap: 5, alignItems: 'center' },
  barcode: { backgroundColor: '#0878f9', padding: 8, borderRadius: 6 },
  edit: { backgroundColor: '#ffc107', padding: 8, borderRadius: 6 },
  archive: { backgroundColor: '#dc3545', padding: 8, borderRadius: 6 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 10, gap: 11, position: 'relative' },
  heading: { fontSize: 19, fontWeight: '900' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'flex-end',
    position: 'relative',
    zIndex: 50,
  },
  statusBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-end',
    backgroundColor: '#d8f2fb',
    padding: 12,
    borderRadius: 8,
  },
  input: {
    minWidth: 190,
    borderWidth: 1,
    borderColor: '#bbc7d2',
    borderRadius: 7,
    padding: 10,
    backgroundColor: '#fff',
  },
  primary: { backgroundColor: '#1769aa', padding: 12, borderRadius: 7 },
  light: { backgroundColor: '#e3edf7', padding: 12, borderRadius: 7 },
  issue: { backgroundColor: '#7048a8', padding: 12, borderRadius: 7 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    padding: 11,
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  bold: { fontWeight: '800' },
  bookSearchArea: {
    minWidth: 360,
    flex: 2,
    position: 'relative',
    zIndex: 100,
  },
  bookLookup: { minWidth: 320, flex: 1, flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  suggestions: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 8,
    elevation: 30,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.22), 0 4px 10px rgba(0, 0, 0, 0.12)',
        } as any)
      : {}),
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  suggestionsHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  suggestionsCloseBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  suggestionsCloseText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  suggestion: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  suggestionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionTitle: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
  },
  suggestionRack: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  historySection: {
    position: 'relative',
    zIndex: 1,
    marginTop: 10,
  },
  selectedBook: { minWidth: 280, backgroundColor: '#d8f0dd', padding: 10, borderRadius: 7 },
  student: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#e8f2ff',
    padding: 10,
    borderRadius: 8,
  },
  photo: { width: 55, height: 65, borderRadius: 5 },
  returned: { backgroundColor: '#198754', padding: 9, borderRadius: 6 },
  receiptBtn: { backgroundColor: '#0284c7', padding: 9, borderRadius: 6 },
  table: { minWidth: 1250 },
  tableScrollFrame: {
    maxHeight: 580,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web'
      ? ({
          overflow: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: '#93c5fd #f1f5f9',
        } as any)
      : {}),
  },
  stickyHeader: {
    position: (Platform.OS === 'web' ? 'sticky' : 'relative') as any,
    top: 0,
    zIndex: 20,
    backgroundColor: '#cfe0fa',
    borderBottomWidth: 2,
    borderBottomColor: '#93c5fd',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '0 2px 5px rgba(0,0,0,0.08)',
        } as any)
      : {}),
  },
  trAlt: {
    backgroundColor: '#f8fafc',
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  th: { backgroundColor: '#cfe0fa' },
  cellHead: {
    width: 140,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cellHeadTouch: {
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : {}),
  },
  cellHeadText: { width: 140, padding: 11, fontWeight: '900' },
  cell: { width: 140, padding: 11 },
  empty: { padding: 20, color: '#667085' },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  autoTag: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  autoTagText: {
    color: '#166534',
    fontWeight: '800',
    fontSize: 13,
  },
  editTag: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editTagText: {
    color: '#92400e',
    fontWeight: '800',
    fontSize: 13,
  },
  inputWrapper: {
    minWidth: 190,
    flex: 1,
    gap: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  barcodePreviewBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  barcodePreviewHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 440,
    gap: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '800',
  },
  modalBookTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
  },
  modalMeta: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
  },
  modalBarcodeArea: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
    marginTop: 4,
  },
});
