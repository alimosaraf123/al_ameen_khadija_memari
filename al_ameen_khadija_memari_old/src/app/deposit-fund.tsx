import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  api,
} from '../lib/api';
import {router} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';

import {
  Field,
  Button,
  Card,
  H1,
  Muted,
} from '../components/ui';


type Student = {
  id: number;
  registration_no?: string;
  student_name?: string;
  class_name?: string;
  roll_no?: string;
  father_name?: string;
  whatsapp_number?: string;
  guardian_mobile?: string;
  father_mobile?: string;
  mother_mobile?: string;
  mobile_number?: string;
};


export default function DepositFund() {

  const [students, setStudents] =
    useState<Student[]>([]);

  const [search, setSearch] =
    useState('');

  const [
    selectedStudent,
    setSelectedStudent
  ] = useState<Student | null>(null);

  const [
    fundData,
    setFundData
  ] = useState<any>(null);

  const [
    transactionType,
    setTransactionType
  ] = useState<
    'deposit' | 'expense'
  >('deposit');

  const [amount, setAmount] =
    useState('');

  const [details, setDetails] =
    useState('Cash');

  const [sdfBookNo, setSdfBookNo] = useState('');
  const [bookNoEditing, setBookNoEditing] = useState(true);

  const [
    referenceNo,
    setReferenceNo
  ] = useState('');

  const [
    saving,
    setSaving
  ] = useState(false);

  const [dashboard, setDashboard] = useState<any>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statement, setStatement] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'statement' | 'transactions'>('transactions');


  // =====================================
  // LOAD STUDENTS
  // =====================================

  const loadStudents =
    async () => {

      try {

        const data =
          await api(
            '/api/students'
          );

        setStudents(
          data.students || []
        );

      } catch (e: any) {

        Alert.alert(
          'Error',
          e.message
        );

      }

    };


  useEffect(() => {
    loadStudents();
    api('/api/guardians/admin/deposit-fund-report').then(setDashboard).catch(() => {});
  }, []);

  const totalSdfDue = (dashboard?.students || []).reduce((sum: number, student: any) => sum + Number(student.due || 0), 0) || Number(dashboard?.summary?.total_due || 0);
  const totalSdfAdvance = (dashboard?.students || []).reduce((sum: number, student: any) => sum + Number(student.available_balance || 0), 0) || Number(dashboard?.summary?.total_positive_balance || 0);

  const searchStatement = async () => {
    if (!selectedStudent && !fromDate.trim() && !toDate.trim()) return Alert.alert('Required', 'Select a student or enter a date range.');
    try {
      const query = new URLSearchParams();
      if (selectedStudent?.registration_no) query.set('registration_no', String(selectedStudent.registration_no));
      if (fromDate.trim()) query.set('from_date', fromDate.trim());
      if (toDate.trim()) query.set('to_date', toDate.trim());
      setStatement(await api('/api/guardians/admin/deposit-fund-statement?' + query.toString()));
    } catch (e: any) { Alert.alert('Statement', e.message); }
  };

  const printStatement = () => {
    if (Platform.OS !== 'web' || !statement) return Alert.alert('Print', 'Statement print is available on web.');
    const esc = (v:any) => String(v ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] || c));
    const rows = (statement.transactions || []).map((x:any) => `<tr><td>${esc(x.registration_no)}</td><td>${esc(x.student_name)}</td><td>${esc(String(x.transaction_date).slice(0,10))}</td><td>${x.transaction_type==='deposit'?'Deposit':'Withdrawal'}</td><td>${Number(x.amount||0).toFixed(2)}</td><td>${esc(x.details)}</td></tr>`).join('');
    const w = window.open('', '_blank'); if (!w) return;
    const signed = Number(statement.summary?.balance || 0); const sign = signed > 0 ? '+' : signed < 0 ? '-' : '';
    w.document.write(`<html><head><title>Deposit Fund Statement</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:7px;text-align:left}h2{margin-bottom:4px}.summary{margin:12px 0}</style></head><body><h2>Student Deposit Fund Statement</h2><div>Student: ${esc(statement.student?.student_name || 'All students')} | Registration: ${esc(statement.student?.registration_no || statement.registration_no || 'All')} | Period: ${esc(statement.from_date || 'All')} to ${esc(statement.to_date || 'All')}</div><div class=summary>Balance: ${sign}₹${Math.abs(signed).toFixed(2)}</div><table><thead><tr><th>Reg.</th><th>Student</th><th>Date</th><th>Type</th><th>Amount</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></body></html>`); w.document.close(); setTimeout(() => w.print(), 300);
  };


  // =====================================
  // SEARCH STUDENTS
  // =====================================

  const filteredStudents =
    useMemo(() => {

      const q =
        search
          .trim()
          .toLowerCase();


      if (!q) {
        return [];
      }


      return students
        .filter((student) => {

          const fields = [

            student.registration_no,

            student.student_name,

            student.class_name,

            student.roll_no,

            student.father_name,

          ];


          return fields.some(
            (value) =>
              String(value || '')
                .toLowerCase()
                .includes(q)
          );

        })
        .slice(0, 30);

    }, [
      search,
      students,
    ]);


  // =====================================
  // LOAD FUND
  // =====================================

  const loadFund =
    async (
      studentId: number
    ) => {

      try {

        const data =
          await api(
            `/api/guardians/admin/student/${studentId}/deposit-fund`
          );

        setFundData(data);
        setSdfBookNo(String(data.student?.sdf_book_no || ''));
        setBookNoEditing(!String(data.student?.sdf_book_no || '').trim());

      } catch (e: any) {

        Alert.alert(
          'Error',
          e.message
        );

      }

    };


  // =====================================
  // SELECT STUDENT
  // =====================================

  const selectStudent =
    async (
      student: Student
    ) => {

      setSelectedStudent(
        student
      );

      setSearch('');

      setAmount('');

      setDetails('Cash');

      setReferenceNo('');

      await loadFund(
        student.id
      );

    };

  const openStatementStudent = async (row: any) => {
    const found = students.find((item) => String(item.registration_no) === String(row.registration_no));
    if (!found) return Alert.alert('Student', 'Student account could not be found.');
    setActiveTab('transactions');
    await selectStudent(found);
  };


  // =====================================
  // SAVE TRANSACTION
  // =====================================

  const saveSdfBookNo = async () => {
    if (!selectedStudent) return;
    try {
      await api(`/api/guardians/admin/student/${selectedStudent.id}/deposit-fund-book`, {
        method: 'PATCH',
        body: JSON.stringify({ sdf_page_no: sdfBookNo.trim() }),
      });
      setFundData((current: any) => current ? { ...current, student: { ...current.student, sdf_book_no: sdfBookNo.trim() } } : current);
      setBookNoEditing(false);
      Alert.alert('Saved', 'SDF Page No. updated successfully.');
    } catch (e: any) {
      Alert.alert('SDF Page No.', e.message || 'Could not update SDF Page No.');
    }
  };

  const saveTransaction =
    async () => {

      if (!selectedStudent) {
        return;
      }


      const numericAmount =
        Number(amount);


      if (
        !numericAmount ||
        numericAmount <= 0
      ) {

        Alert.alert(
          'Invalid Amount',
          'Enter a valid amount.'
        );

        return;

      }


      if (!details.trim()) {

        Alert.alert(
          'Required',
          'Enter details or purpose.'
        );

        return;

      }


      try {

        setSaving(true);


        await api(
          `/api/guardians/admin/student/${selectedStudent.id}/deposit-fund`,
          {

            method: 'POST',

            body:
              JSON.stringify({

                transaction_type:
                  transactionType,

                amount:
                  numericAmount,

                details:
                  details.trim(),

                reference_no:
                  referenceNo.trim() ||
                  null,

              }),

          }
        );


        Alert.alert(
          'Success',
          transactionType ===
            'deposit'

            ? 'Deposit added successfully.'

            : 'Withdrawal added successfully.'
        );


        setAmount('');

        setDetails('Cash');

        setReferenceNo('');


        await loadFund(
          selectedStudent.id
        );


      } catch (e: any) {

        Alert.alert(
          'Error',
          e.message
        );


      } finally {

        setSaving(false);

      }

    };

  const sendDueReminder = async () => {
    if (!selectedStudent) return;
    const rawMobile = String(
      selectedStudent.whatsapp_number ||
      selectedStudent.guardian_mobile ||
      selectedStudent.father_mobile ||
      selectedStudent.mother_mobile ||
      selectedStudent.mobile_number ||
      ''
    ).trim();
    let mobile = rawMobile.replace(/\D/g, '');
    if (mobile.length === 10) mobile = `91${mobile}`;
    if (mobile.length < 12) {
      Alert.alert('WhatsApp Number Missing', 'WhatsApp/guardian mobile number was not found for this student.');
      return;
    }
    const due = Math.abs(Number(fundData?.summary?.net_balance || 0));
    const message = `Student Deposit Fund Due Reminder\nAssalamualaikum, Dear ${selectedStudent.student_name || '-'}\nRegistration No: ${selectedStudent.registration_no || '-'}\nClass: ${selectedStudent.class_name || '-'}\n\nDeposit Fund Due: ₹${due.toFixed(2)}\n\nPlease arrange payment of the required Student Deposit Fund in cash.\nif already paid please ignore it.\nThank you.\nAl-Ameen Mission Memari Khadija Campus`;
    try {
      await Linking.openURL(`https://wa.me/${mobile}?text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert('WhatsApp Error', 'Unable to open WhatsApp.');
    }
  };

  // Show outstanding SDF dues and cash transactions in one chronological history.
  const historyItems = [
    ...(fundData?.sdf_dues || []).map((item: any) => ({
      ...item,
      historyType: 'due',
      historyDate: item.due_date || item.created_at || '',
    })),
    ...(fundData?.transactions || []).map((item: any) => ({
      ...item,
      historyType: 'transaction',
      historyDate: item.transaction_date || item.created_at || '',
    })),
  ].sort((a: any, b: any) => {
    const byDate = String(b.historyDate).localeCompare(String(a.historyDate));
    return byDate || Number(b.id || 0) - Number(a.id || 0);
  });


  return (

    <SafeAreaView
      style={styles.page}
    >

      <ScrollView

        contentContainerStyle={
          styles.content
        }

        keyboardShouldPersistTaps="handled"

      >

        <AcademyHeader />
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/superadmin')} style={styles.backButton}><Text style={styles.backText}>← Back</Text></TouchableOpacity>

        <H1>
          Student Deposit Fund
        </H1>
        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setActiveTab('transactions')} style={[styles.tabButton, activeTab === 'transactions' && styles.tabActive]}>
            <Text style={styles.tabText}>Deposit / Withdrawal</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveTab('statement')} style={[styles.tabButton, activeTab === 'statement' && styles.tabActive]}>
            <Text style={styles.tabText}>Statement</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/dues' as any)} style={styles.tabButton}>
            <Text style={styles.tabText}>Bulk SDF Due Entry</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/deposit-fund-report' as any)} style={styles.tabButton}>
            <Text style={styles.tabText}>Due Reminder</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => setActiveTab('statement')} style={styles.tabButton}>
            <Text style={styles.tabText}>Day Book</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sdfSummary}>
          {totalSdfDue > 0 ? (
            <View style={styles.sdfSummaryCard}>
              <Text style={styles.sdfLabel}>Total SDF Due (All Students)</Text>
              <Text style={styles.sdfDue}>{'\u20B9'}{totalSdfDue.toFixed(2)}</Text>
            </View>
          ) : (
            <View style={styles.sdfSummaryCard}>
              <Text style={styles.sdfLabel}>Total SDF Advance (All Students)</Text>
              <Text style={styles.sdfAdvance}>{'\u20B9'}{totalSdfAdvance.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {activeTab === 'statement' && (
          <Card>
          <Text style={styles.heading}>Date Statement / Print</Text>
          <Text style={styles.help}>Select a student above, or enter a date range to see all students' transactions.</Text>
          <View style={styles.dateRow}><DatePickerField label="From Date" value={fromDate} onChange={setFromDate} /><DatePickerField label="To Date" value={toDate} onChange={setToDate} /></View>
          <Button title="View Statement" onPress={searchStatement} />
          {statement && <>
            <Text style={styles.dashboardText}>Balance: {Number(statement.summary?.balance || 0) > 0 ? '+' : Number(statement.summary?.balance || 0) < 0 ? '-' : ''}₹{Math.abs(Number(statement.summary?.balance || 0)).toFixed(2)}</Text>
            {(statement.balances || []).filter((row:any) => Number(row.balance || 0) !== 0).map((row:any) => <TouchableOpacity key={row.registration_no} accessibilityRole="button" onPress={() => { void openStatementStudent(row); }} style={styles.statementRow}><Text style={styles.statementName}>{row.student_name} · Reg. {row.registration_no}</Text><Text>Balance: {Number(row.balance || 0) > 0 ? '+' : '-'}₹{Math.abs(Number(row.balance || 0)).toFixed(2)}</Text><Text style={styles.statementLink}>Open student account</Text></TouchableOpacity>)}
            <Button title="Print Statement" onPress={printStatement} />
          </>}
          </Card>
        )}


        {activeTab === 'transactions' && (
          <>
        <Text
          style={styles.help}
        >
          Search for a student by registration number or student name.
        </Text>


        {/* =================================
            STUDENT SEARCH
        ================================= */}

        {!selectedStudent && (

          <>

            <Field

              placeholder="Registration No / Student Name"

              value={search}

              onChangeText={
                setSearch
              }
              onSubmitEditing={() => {
                if (filteredStudents[0]) selectStudent(filteredStudents[0]);
              }}
              returnKeyType="search"

            />


            {filteredStudents.map(
              (student) => (

                <TouchableOpacity

                  key={student.id}

                  style={
                    styles.studentCard
                  }

                  onPress={() =>
                    selectStudent(
                      student
                    )
                  }

                >

                  <Text
                    style={
                      styles.studentName
                    }
                  >
                    {
                      student.student_name
                    }
                  </Text>


                  <Text
                    style={
                      styles.studentMeta
                    }
                  >

                    Reg:{' '}
                    {
                      student.registration_no ||
                      '-'
                    }

                    {'   '}

                    Class:{' '}
                    {
                      student.class_name ||
                      '-'
                    }

                    {'   '}

                    Roll:{' '}
                    {
                      student.roll_no ||
                      '-'
                    }

                  </Text>

                </TouchableOpacity>

              )
            )}


            {!!search.trim() &&
              filteredStudents.length ===
                0 && (

                <Muted>
                  No matching student found
                </Muted>

              )}

          </>

        )}


        {/* =================================
            SELECTED STUDENT
        ================================= */}

        {selectedStudent && (

          <>

            <Card>
              <View style={styles.studentCardInner}>

              <Text
                style={
                  styles.studentName
                }
              >
                {
                  selectedStudent
                    .student_name
                }
                {'  ·  SDF Page No: '}
                <Text style={sdfBookNo.trim() ? styles.savedBookNo : undefined}>{sdfBookNo || '-'}</Text>
              </Text>

              <View style={styles.bookNoRow}>
                <Field
                  placeholder="SDF Page No."
                  value={sdfBookNo}
                  onChangeText={setSdfBookNo}
                  onSubmitEditing={() => bookNoEditing ? saveSdfBookNo() : setBookNoEditing(true)}
                  returnKeyType="done"
                  style={styles.bookNoInput}
                />
                <TouchableOpacity style={styles.bookNoSave} onPress={() => bookNoEditing ? saveSdfBookNo() : setBookNoEditing(true)}>
                  <Text style={styles.bookNoSaveText}>{bookNoEditing ? 'Save Book No.' : 'Edit Book No.'}</Text>
                </TouchableOpacity>
              </View>


              <Text
                style={
                  styles.studentMeta
                }
              >
                Registration No:{' '}
                {
                  selectedStudent
                    .registration_no ||
                  '-'
                }
              </Text>


              <Text
                style={
                  styles.studentMeta
                }
              >
                Class:{' '}
                {
                  selectedStudent
                    .class_name ||
                  '-'
                }
                {'   '}
                Roll:{' '}
                {
                  selectedStudent
                    .roll_no ||
                  '-'
                }
              </Text>


              <TouchableOpacity

                style={
                  styles.changeStudent
                }

                onPress={() => {

                  setSelectedStudent(
                    null
                  );

                  setFundData(
                    null
                  );

                  setSearch('');

                }}

              >

                <Text
                  style={
                    styles.changeStudentText
                  }
                >
                  Change Student
                </Text>

              </TouchableOpacity>
              </View>
            </Card>


            {/* ===============================
                FUND SUMMARY
            =============================== */}

            <Text
              style={styles.heading}
            >
              Fund Summary
            </Text>
<View style={styles.netBalanceBox}>

  <Text style={styles.netBalanceLabel}>
    Current Fund Balance
  </Text>

  <Text
    style={[
      styles.netBalanceValue,

      Number(
        fundData?.summary?.net_balance || 0
      ) > 0
        ? styles.positiveBalance
        : Number(
            fundData?.summary?.net_balance || 0
          ) < 0
        ? styles.negativeBalance
        : styles.zeroBalance,
    ]}
  >

    {Number(
      fundData?.summary?.net_balance || 0
    ) > 0
      ? '+ '
      : Number(
          fundData?.summary?.net_balance || 0
        ) < 0
      ? '- '
      : ''}

    ₹
    {Math.abs(
      Number(
        fundData?.summary?.net_balance || 0
      )
    ).toFixed(2)}

  </Text>

  <Text style={styles.netBalanceStatus}>

    {Number(
      fundData?.summary?.net_balance || 0
    ) > 0
      ? 'The student has a fund balance.'
      : Number(
          fundData?.summary?.net_balance || 0
        ) < 0
      ? 'The student has a fund shortfall / due.'
      : 'Fund Balance Zero'}

  </Text>

  {Number(fundData?.summary?.net_balance || 0) < 0 && (
    <TouchableOpacity style={styles.whatsappButton} onPress={sendDueReminder}>
      <Text style={styles.whatsappText}>Send Due Reminder on WhatsApp</Text>
    </TouchableOpacity>
  )}

</View>




            {/* ===============================
                ADD TRANSACTION
            =============================== */}

            <Text
              style={styles.heading}
            >
              Add Transaction
            </Text>


            <Card>

              <View
                style={
                  styles.typeRow
                }
              >

                <TouchableOpacity

                  style={[
                    styles.typeButton,

                    transactionType ===
                      'deposit' &&
                      styles.typeSelected
                  ]}

                  onPress={() =>
                    setTransactionType(
                      'deposit'
                    )
                  }

                >

                  <Text
                    style={[
                      styles.typeText,

                      transactionType ===
                        'deposit' &&
                        styles.typeSelectedText
                    ]}
                  >
                    Deposit
                  </Text>

                </TouchableOpacity>


                <TouchableOpacity

                  style={[
                    styles.typeButton,

                    transactionType ===
                      'expense' &&
                      styles.typeSelected
                  ]}

                  onPress={() =>
                    setTransactionType(
                      'expense'
                    )
                  }

                >

                  <Text
                    style={[
                      styles.typeText,

                      transactionType ===
                        'expense' &&
                        styles.typeSelectedText
                    ]}
                  >
                    Withdrawal
                  </Text>

                </TouchableOpacity>

              </View>


              <Field

                placeholder="Amount"

                value={amount}

                onChangeText={(value: string) =>
                  setAmount(
                    value.replace(
                      /[^0-9.]/g,
                      ''
                    )
                  )
                }

                keyboardType="decimal-pad"
                onSubmitEditing={saveTransaction}
                returnKeyType="done"

              />


              <Field

                placeholder={
                  transactionType ===
                    'deposit'

                    ? 'Details (e.g. Guardian Deposit)'

                    : 'Withdrawal Details (e.g. Medicine)'
                }

                value={details}

                onChangeText={
                  setDetails
                }

              />


              <Field

                placeholder="Reference No (Optional)"

                value={
                  referenceNo
                }

                onChangeText={
                  setReferenceNo
                }

              />


              <Button

                title={
                  saving
                    ? 'Saving...'

                    : transactionType ===
                        'deposit'

                    ? 'Add Deposit'

                    : 'Add Withdrawal'
                }

                onPress={
                  saveTransaction
                }

              />

            </Card>


            {/* ===============================
                TRANSACTION HISTORY
            =============================== */}

            <Text
              style={styles.heading}
            >
              Transaction History
            </Text>

            {historyItems.map((item: any) => item.historyType === 'due' ? (
              <View key={`due-${item.id}`} style={styles.transactionCard}>
                <View style={styles.transactionTop}>
                  <Text style={styles.transactionType}>Due</Text>
                  <Text style={styles.expenseAmount}>- ₹{Number(item.amount || 0).toFixed(2)}</Text>
                </View>
                <Text style={styles.transactionDetails}>{item.due_title || 'SDF Due'}{item.session_name ? ` · Session ${item.session_name}` : ''}</Text>
                <Text style={styles.transactionMeta}>Due date: {item.due_date ? String(item.due_date).slice(0, 10) : '-'}</Text>
              </View>
            ) : (
              <View key={`transaction-${item.id}`} style={styles.transactionCard}>
                <View style={styles.transactionTop}>
                  <Text style={styles.transactionType}>
                    {item.transaction_type === 'deposit' ? 'Deposit' : 'Withdrawal'}
                  </Text>
                  <Text style={item.transaction_type === 'deposit' ? styles.depositAmount : styles.expenseAmount}>
                    {item.transaction_type === 'deposit' ? '+ ' : '- '}<Text style={styles.currency}>₹</Text>{Number(item.amount || 0).toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.transactionDetails}>{item.details || '-'}</Text>
                <Text style={styles.transactionMeta}>Date: {String(item.transaction_date || '').slice(0, 10)}</Text>
                {!!item.reference_no && <Text style={styles.transactionMeta}>Ref: {item.reference_no}</Text>}
                <Text style={styles.balanceText}>Balance after transaction: <Text style={styles.currency}>₹</Text>{Number(item.running_balance || 0).toFixed(2)}</Text>
              </View>
            ))}


            {!historyItems.length && (

              <Muted>
                No transactions yet.
              </Muted>

            )}

          </>
        )}

          </>
        )}


      </ScrollView>

    </SafeAreaView>

  );

}


const styles =
  StyleSheet.create({
netBalanceBox: {
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: 18,
  marginBottom: 12,
  alignItems: 'center',
},

netBalanceLabel: {
  color: '#667085',
  fontWeight: '700',
  marginBottom: 7,
},

netBalanceValue: {
  fontSize: 30,
  fontWeight: '900',
},

positiveBalance: {
  color: '#137333',
},

negativeBalance: {
  color: '#c62828',
},

zeroBalance: {
  color: '#475467',
},

netBalanceStatus: {
  marginTop: 6,
  color: '#667085',
  textAlign: 'center',
},

whatsappButton: {
  marginTop: 12,
  backgroundColor: '#128c4a',
  paddingHorizontal: 14,
  paddingVertical: 11,
  borderRadius: 8,
  alignItems: 'center',
},

whatsappText: {
  color: '#fff',
  fontWeight: '800',
},
    page: {
      flex: 1,
      backgroundColor:
        '#f3f6f9',
    },

    backButton: {
      alignSelf: 'flex-start',
      backgroundColor: '#e5eef8',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 7,
      marginBottom: 6,
    },

    backText: {
      color: '#1764a5',
      fontWeight: '800',
    },

    content: {
      padding: 16,
      paddingBottom: 70,
    },

    help: {
      color: '#667085',
      marginTop: 5,
      marginBottom: 15,
    },

    dashboardText: {
      fontSize: 16,
      fontWeight: '800',
      marginVertical: 3,
    },

    sdfSummary: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 18,
      marginVertical: 14,
      paddingHorizontal: 4,
    },
    sdfSummaryCard: {
      flex: 1,
      minWidth: 180,
      backgroundColor: '#fff',
      borderRadius: 10,
      padding: 12,
    },
    sdfLabel: {
      color: '#667085',
      fontWeight: '700',
      marginBottom: 5,
    },
    sdfDue: {
      fontSize: 18,
      fontWeight: '900',
      color: '#c62828',
    },
    sdfAdvance: {
      fontSize: 18,
      fontWeight: '900',
      color: '#087f5b',
    },

    statementRow: {
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      paddingVertical: 7,
    },

    statementName: {
      fontWeight: '800',
    },

    statementLink: {
      color: '#1768c5',
      fontWeight: '800',
      marginTop: 3,
    },

    dateRow: {
      flexDirection: 'row',
      gap: 8,
    },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    tabButton: { backgroundColor: '#e5eef8', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 7 },
    tabActive: { backgroundColor: '#1768c5' },
    tabText: { color: '#173d6b', fontWeight: '800' },

    heading: {
      fontSize: 19,
      fontWeight: '800',
      marginTop: 20,
      marginBottom: 10,
    },

    studentCard: {
      backgroundColor: '#fff',
      padding: 14,
      borderRadius: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: '#d7dde2',
    },

    studentName: {
      fontSize: 18,
      fontWeight: '800',
    },

    studentCardInner: {
      position: 'relative',
      paddingTop: 2,
      paddingRight: 180,
      minHeight: 112,
    },

    savedBookNo: {
      color: '#1565c0',
      fontWeight: '900',
    },

    bookNoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      position: 'absolute',
      right: 0,
      top: 0,
    },

    bookNoInput: {
      width: 64,
      paddingVertical: 7,
      paddingHorizontal: 8,
      marginBottom: 0,
      fontSize: 14,
    },

    bookNoSave: {
      backgroundColor: '#1565c0',
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },

    bookNoSaveText: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 12,
    },

    studentMeta: {
      color: '#667085',
      marginTop: 5,
    },

    changeStudent: {
      marginTop: 14,
      padding: 10,
      borderWidth: 1,
      borderColor: '#1565c0',
      borderRadius: 8,
    },

    changeStudentText: {
      textAlign: 'center',
      color: '#1565c0',
      fontWeight: '700',
    },

    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },

    summaryBox: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 15,
    },

    summaryLabel: {
      color: '#667085',
      marginBottom: 5,
    },

    summaryValue: {
      fontSize: 22,
      fontWeight: '900',
    },

    smallSummaryValue: {
      fontSize: 18,
      fontWeight: '800',
    },

    typeRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },

    typeButton: {
      flex: 1,
      padding: 12,
      borderWidth: 1,
      borderColor: '#1565c0',
      borderRadius: 9,
    },

    typeSelected: {
      backgroundColor: '#1565c0',
    },

    typeText: {
      textAlign: 'center',
      color: '#1565c0',
      fontWeight: '800',
    },

    typeSelectedText: {
      color: '#fff',
    },

    transactionCard: {
      backgroundColor: '#fff',
      padding: 14,
      borderRadius: 10,
      marginBottom: 9,
    },

    transactionTop: {
      flexDirection: 'row',
      justifyContent:
        'space-between',
      alignItems: 'center',
    },

    transactionType: {
      fontWeight: '800',
      fontSize: 16,
    },

    depositAmount: {
      fontWeight: '900',
      fontSize: 17,
      color: '#137333',
    },

    expenseAmount: {
      fontWeight: '900',
      fontSize: 17,
      color: '#c62828',
    },

    transactionDetails: {
      marginTop: 7,
      fontWeight: '600',
    },

    transactionMeta: {
      color: '#667085',
      marginTop: 4,
      fontSize: 13,
    },

    balanceText: {
      marginTop: 7,
      fontWeight: '700',
    },

    currency: {
      fontFamily: 'Arial',
    },

  });
