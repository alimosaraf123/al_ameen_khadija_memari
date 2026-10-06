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
    useState('');

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
    w.document.write(`<html><head><title>Deposit Fund Statement</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:7px;text-align:left}h2{margin-bottom:4px}.summary{margin:12px 0}</style></head><body><h2>Student Deposit Fund Statement</h2><div>Student: ${esc(statement.student?.student_name || 'All students')} | Registration: ${esc(statement.student?.registration_no || statement.registration_no || 'All')} | Period: ${esc(statement.from_date || 'All')} to ${esc(statement.to_date || 'All')}</div><div class=summary>Deposit: ₹${Number(statement.summary?.deposit||0).toFixed(2)} | Withdrawal: ₹${Number(statement.summary?.withdrawal||0).toFixed(2)} | Advance: ₹${Number(statement.summary?.advance||0).toFixed(2)} | Due: ₹${Number(statement.summary?.due||0).toFixed(2)}</div><table><thead><tr><th>Reg.</th><th>Student</th><th>Date</th><th>Type</th><th>Amount</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></body></html>`); w.document.close(); setTimeout(() => w.print(), 300);
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

      setDetails('');

      setReferenceNo('');

      await loadFund(
        student.id
      );

    };


  // =====================================
  // SAVE TRANSACTION
  // =====================================

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
          'সঠিক Amount লিখুন।'
        );

        return;

      }


      if (!details.trim()) {

        Alert.alert(
          'Required',
          'Details / Purpose লিখুন।'
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

        setDetails('');

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
        </H1><Text style={styles.totalDue}>Total Due: ₹{Number(dashboard?.summary?.total_due || 0).toFixed(2)}</Text>

        <Card>
          <Text style={styles.heading}>Date Statement / Print</Text>
          <Text style={styles.help}>Select a student above, or enter a date range to see all students' transactions.</Text>
          <View style={styles.dateRow}><DatePickerField label="From Date" value={fromDate} onChange={setFromDate} /><DatePickerField label="To Date" value={toDate} onChange={setToDate} /></View>
          <Button title="View Statement" onPress={searchStatement} />
          {statement && <>
            <Text style={styles.dashboardText}>Deposit: ₹{Number(statement.summary?.deposit || 0).toFixed(2)} | Withdrawal: ₹{Number(statement.summary?.withdrawal || 0).toFixed(2)}</Text>
            <Text style={styles.dashboardText}>Advance: ₹{Number(statement.summary?.advance || 0).toFixed(2)} | Due: ₹{Number(statement.summary?.due || 0).toFixed(2)}</Text>
            {(statement.balances || []).map((row:any) => <View key={row.registration_no} style={styles.statementRow}><Text style={styles.statementName}>{row.student_name} · Reg. {row.registration_no}</Text><Text>Advance: ₹{Number(row.advance || 0).toFixed(2)} | Due: ₹{Number(row.due || 0).toFixed(2)}</Text></View>)}
            <Button title="Print Statement" onPress={printStatement} />
          </>}
        </Card>


        <Text
          style={styles.help}
        >
          Registration No অথবা Student Name দিয়ে Student খুঁজুন।
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

              <Text
                style={
                  styles.studentName
                }
              >
                {
                  selectedStudent
                    .student_name
                }
              </Text>


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
      ? 'Student-এর Fund-এ টাকা জমা আছে'
      : Number(
          fundData?.summary?.net_balance || 0
        ) < 0
      ? 'Student-এর Fund-এ ঘাটতি / Due আছে'
      : 'Fund Balance Zero'}

  </Text>

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


            {!fundData
              ?.transactions
              ?.length && (

              <Muted>
                No transactions yet.
              </Muted>

            )}


            {fundData
              ?.transactions
              ?.map(
                (item: any) => (

                  <View

                    key={item.id}

                    style={
                      styles.transactionCard
                    }

                  >

                    <View
                      style={
                        styles.transactionTop
                      }
                    >

                      <Text
                        style={
                          styles.transactionType
                        }
                      >
                        {item.transaction_type ===
                        'deposit'
                          ? 'Deposit'
                          : 'Withdrawal'}
                      </Text>


                      <Text
                        style={
                          item.transaction_type ===
                          'deposit'

                            ? styles.depositAmount

                            : styles.expenseAmount
                        }
                      >

                        {item.transaction_type ===
                        'deposit'
                          ? '+ '
                          : '- '}

                        ₹
                        {Number(
                          item.amount ||
                          0
                        ).toFixed(2)}

                      </Text>

                    </View>


                    <Text
                      style={
                        styles.transactionDetails
                      }
                    >
                      {
                        item.details ||
                        '-'
                      }
                    </Text>


                    <Text
                      style={
                        styles.transactionMeta
                      }
                    >
                      Date:{' '}
                      {
                        String(
                          item.transaction_date ||
                          ''
                        ).slice(
                          0,
                          10
                        )
                      }
                    </Text>


                    {!!item.reference_no && (

                      <Text
                        style={
                          styles.transactionMeta
                        }
                      >
                        Ref:{' '}
                        {
                          item.reference_no
                        }
                      </Text>

                    )}


                    <Text
                      style={
                        styles.balanceText
                      }
                    >
                      Balance after transaction:
                      {' '}
                      ₹
                      {Number(
                        item.running_balance ||
                        0
                      ).toFixed(2)}
                    </Text>

                  </View>

                )
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

    totalDue: {
      position: 'absolute',
      top: 18,
      left: '35%',
      fontSize: 19,
      fontWeight: '900',
      color: '#c62828',
    },

    statementRow: {
      borderTopWidth: 1,
      borderTopColor: '#e5e7eb',
      paddingVertical: 7,
    },

    statementName: {
      fontWeight: '800',
    },

    dateRow: {
      flexDirection: 'row',
      gap: 8,
    },

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

  });
