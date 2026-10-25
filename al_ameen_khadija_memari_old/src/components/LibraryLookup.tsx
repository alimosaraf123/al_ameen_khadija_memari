import React, { useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../lib/api';

export default function LibraryLookup({ onStudent, onIssueReady, onClear }: { onStudent: (data: any) => void; onIssueReady?: () => void; onClear?: () => boolean | void }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<any>(null);
  const [message, setMessage] = useState('Scan an issued book, or enter student registration.');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const input = useRef<TextInput>(null);
  const latest = useRef('');

  function clear() {
    if (locked.current) return;
    if (onClear?.() === false) {
      setMessage('Please wait for the current book issue to finish.');
      return;
    }
    latest.current = '';
    setQuery('');
    setPending(null);
    setMessage('Ready. Scan a book or enter student registration.');
    input.current?.focus();
  }

  async function submit() {
    if (locked.current) return;
    const code = latest.current.trim();
    if (!code) { setMessage('Enter a registration number or scan a book barcode.'); return; }
    locked.current = true;
    setBusy(true);
    let readyToIssue = false;
    try {
      if (pending && pending.code === code) {
        const loan = pending.result.loans[0];
        await api('/api/service-panels/library/loans/' + loan.id + '/return', { method: 'PATCH' });
        setPending(null);
        setQuery('');
        latest.current = '';
        onStudent({ ...pending.result, loans: [{ ...loan, returned_at: new Date().toISOString() }] });
        setMessage('Book returned successfully: ' + loan.accession_no + ' - ' + pending.result.student.student_name);
        return;
      }
      setMessage('Searching...');
      if (/^\d+$/.test(code)) {
        try {
          const result = await api('/api/service-panels/library/student/' + encodeURIComponent(code));
          onStudent(result);
          setPending(null);
          setMessage('Student selected: ' + result.student.student_name);
          readyToIssue = true;
          return;
        } catch (error: any) {
          if (!/student not found/i.test(error.message)) throw error;
        }
      }
      const result = await api('/api/service-panels/library/return-book/' + encodeURIComponent(code));
      if (!result.student || result.loans?.length !== 1) throw new Error('A single issued copy could not be identified. Use Book Status to select the student.');
      onStudent(result);
      setPending({ code, result });
      setMessage('Book found. Check the student below, then press Enter to confirm return.');
    } catch (error: any) {
      setMessage(error.message || 'Could not complete the request. Please try again.');
    } finally {
      locked.current = false;
      setBusy(false);
      if (readyToIssue && onIssueReady) {
        input.current?.blur();
        onIssueReady();
      } else input.current?.focus();
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TextInput ref={input} autoFocus value={query}
          placeholder="Student registration / issued book barcode"
          onChangeText={(value) => { latest.current = value; setQuery(value); setPending(null); }}
          onSubmitEditing={() => void submit()} blurOnSubmit={false}
          style={{ flex: 1, minWidth: 180, padding: 12, borderWidth: 1, borderColor: '#bbc7d2', borderRadius: 7 }} />
        <TouchableOpacity disabled={busy} onPress={() => void submit()}
          style={{ padding: 12, backgroundColor: pending ? '#198754' : '#1769aa', borderRadius: 7, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Please wait...' : pending ? 'Confirm Return (Enter)' : 'Find Student / Book'}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} onPress={clear}
          accessibilityLabel="Clear selection and focus registration or barcode"
          style={{ padding: 12, backgroundColor: '#e3edf7', borderRadius: 7, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ color: '#174f75', fontWeight: '800' }}>New Scan / Clear</Text>
        </TouchableOpacity>
      </View>
      <Text accessibilityLiveRegion="polite">{message}</Text>
      {pending ? <View style={{ padding: 12, backgroundColor: '#fff3cd', borderRadius: 7 }}>
        <Text style={{ fontWeight: 'bold' }}>{pending.result.loans[0].accession_no} - {pending.result.loans[0].title}</Text>
        <Text>{pending.result.student.student_name} - Reg: {pending.result.student.registration_no} - Class: {pending.result.student.class_name}</Text>
        <Text>Press Enter again to return this book.</Text>
      </View> : null}
    </View>
  );
}
