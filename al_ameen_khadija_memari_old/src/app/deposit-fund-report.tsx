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

import * as FileSystem
  from 'expo-file-system/legacy';

import * as Sharing
  from 'expo-sharing';

import {
  api,
} from '../lib/api';

import {
  Field,
  Button,
  Card,
  H1,
  Muted,
} from '../components/ui';
import PageNavigation from '../components/PageNavigation';


type FilterType =
  | 'all'
  | 'due'
  | 'deposit'
  | 'clear';


export default function DepositFundReport() {

  const [data, setData] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [filter, setFilter] =
    useState<FilterType>('all');


  // =====================================
  // LOAD REPORT
  // =====================================

  const loadReport =
    async () => {

      try {

        setLoading(true);

        const result =
          await api(
            '/api/guardians/admin/deposit-fund-report'
          );

        setData(result);

      } catch (e: any) {

        Alert.alert(
          'Error',
          e.message ||
          'Unable to load report'
        );

      } finally {

        setLoading(false);

      }

    };


  useEffect(() => {
    loadReport();
  }, []);


  // =====================================
  // FILTER STUDENTS
  // =====================================

  const students =
    useMemo(() => {

      const all =
        data?.students || [];

      const q =
        search
          .trim()
          .toLowerCase();


      return all.filter(
        (student: any) => {

          const matchesFilter =
            filter === 'all'

              ? true

              : student.status ===
                filter;


          const matchesSearch =
            !q

              ? true

              : [

                  student.registration_no,

                  student.student_name,

                  student.class_name,

                  student.roll_no,

                  student.guardian_name,

                  student.father_name,

                  student.guardian_mobile,

                  student.father_mobile,

                ].some(
                  (value) =>
                    String(value || '')
                      .toLowerCase()
                      .includes(q)
                );


          return (
            matchesFilter &&
            matchesSearch
          );

        }
      );

    }, [
      data,
      filter,
      search,
    ]);


  // =====================================
  // MOBILE NUMBER
  // =====================================

  const getMobile =
    (student: any) => {

      return (
        student.whatsapp_number ||
        student.guardian_mobile ||
        student.father_mobile ||
        student.mother_mobile ||
        student.mobile_number ||
        ''
      );

    };


  // =====================================
  // WHATSAPP REMINDER
  // =====================================

  const sendWhatsApp =
    async (student: any) => {

      const rawMobile =
        String(
          getMobile(student)
        ).trim();


      if (!rawMobile) {

        Alert.alert(
          'Mobile Number Missing',
          'Guardian, father, or mother mobile number was not found for this student.'
        );

        return;

      }


      let mobile =
        rawMobile.replace(
          /\D/g,
          ''
        );


      // Indian mobile number
      if (mobile.length === 10) {
        mobile =
          `91${mobile}`;
      }


      if (
        mobile.length < 10
      ) {

        Alert.alert(
          'Invalid Mobile',
          'A valid WhatsApp mobile number was not found.'
        );

        return;

      }


      const due =
        Number(
          student.due || 0
        );

      const advance = Number(student.available_balance || 0);
      const balanceLine = due > 0
        ? `Deposit Fund Due: ₹${due.toFixed(2)}`
        : `Deposit Fund Advance Balance: ₹${advance.toFixed(2)}`;


      const message =
`Al-Ameen Mission
Memari Khadija Campus

Student Deposit Fund Reminder

Student: ${student.student_name || '-'}
Registration No: ${student.registration_no || '-'}
Class: ${student.class_name || '-'}

${balanceLine}

Please arrange payment of the required Student Deposit Fund.

Thank you.`;


      const url =
        `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`;


      try {

        await Linking.openURL(
          url
        );

      } catch (e) {

        Alert.alert(
          'WhatsApp Error',
          'Unable to open WhatsApp.'
        );

      }

    };


  // =====================================
  // CSV HELPERS
  // =====================================

  const csvCell =
    (value: any) => {

      const text =
        String(
          value ?? ''
        )
          .replace(
            /"/g,
            '""'
          );

      return `"${text}"`;

    };


  const createCsv =
    () => {

      const header = [

        'Registration No',

        'Student Name',

        'Class',

        'Roll',

        'Total Deposit',

        'Total Expense',

        'Current Balance',

        'Due',

        'Status',

        'Guardian Name',

        'Mobile',

        'Last Transaction Date',

      ];


      const rows =
        students.map(
          (student: any) => [

            student.registration_no,

            student.student_name,

            student.class_name,

            student.roll_no,

            Number(
              student.total_deposit ||
              0
            ).toFixed(2),

            Number(
              student.total_expense ||
              0
            ).toFixed(2),

            Number(
              student.net_balance ||
              0
            ).toFixed(2),

            Number(
              student.due ||
              0
            ).toFixed(2),

            student.status,

            student.guardian_name ||
            student.father_name ||
            '',

            getMobile(student),

            student.last_transaction_date
              ? String(
                  student.last_transaction_date
                ).slice(0, 10)
              : '',

          ]
            .map(csvCell)
            .join(',')
        );


      return (
        '\uFEFF' +
        header
          .map(csvCell)
          .join(',') +
        '\n' +
        rows.join('\n')
      );

    };


  // =====================================
  // DOWNLOAD CSV
  // =====================================

  const downloadCsv =
    async () => {

      if (!students.length) {

        Alert.alert(
          'No Data',
          'There is no data available to download.'
        );

        return;

      }


      const csv =
        createCsv();


      const suffix =
        filter === 'all'
          ? 'all'
          : filter;


      const fileName =
        `deposit-fund-report-${suffix}.csv`;


      try {

        // WEB
        if (
          Platform.OS === 'web'
        ) {

          const blob =
            new Blob(
              [csv],
              {
                type:
                  'text/csv;charset=utf-8;',
              }
            );


          const url =
            URL.createObjectURL(
              blob
            );


          const link =
            document.createElement(
              'a'
            );


          link.href =
            url;

          link.download =
            fileName;


          document.body.appendChild(
            link
          );


          link.click();


          document.body.removeChild(
            link
          );


          URL.revokeObjectURL(
            url
          );


          return;

        }


        // MOBILE
        const fileUri =
          `${FileSystem.cacheDirectory}${fileName}`;


        await FileSystem
          .writeAsStringAsync(
            fileUri,
            csv,
            {
              encoding:
                FileSystem
                  .EncodingType
                  .UTF8,
            }
          );


        const sharingAvailable =
          await Sharing
            .isAvailableAsync();


        if (!sharingAvailable) {

          Alert.alert(
            'Saved',
            `Report saved: ${fileUri}`
          );

          return;

        }


        await Sharing.shareAsync(
          fileUri,
          {
            mimeType:
              'text/csv',

            dialogTitle:
              'Deposit Fund Report',
          }
        );


      } catch (e: any) {

        Alert.alert(
          'Download Error',
          e.message ||
          'Unable to download report'
        );

      }

    };


  const summary =
    data?.summary || {};


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
        <PageNavigation />

        <H1>
          Deposit Fund Report
        </H1>


        <Text
          style={styles.help}
        >
          All Student Deposit Fund Summary
        </Text>


        <Button
          title={
            loading
              ? 'Refreshing...'
              : 'Refresh Report'
          }
          onPress={
            loadReport
          }
        />


        {/* =================================
            SUMMARY
        ================================= */}

        <Text
          style={styles.heading}
        >
          Overall Summary
        </Text>


        <View
          style={styles.summaryRow}
        >

          <SummaryBox
            label="Total Students"
            value={
              String(
                summary.total_students ||
                0
              )
            }
          />

          <SummaryBox
            label="Due Students"
            value={
              String(
                summary.due_students ||
                0
              )
            }
          />

        </View>


        <View
          style={styles.summaryRow}
        >

          <SummaryBox
            label="Total Deposit"
            value={
              `₹${Number(
                summary.total_deposit ||
                0
              ).toFixed(2)}`
            }
          />

          <SummaryBox
            label="Total Expense"
            value={
              `₹${Number(
                summary.total_expense ||
                0
              ).toFixed(2)}`
            }
          />

        </View>


        <View
          style={styles.summaryRow}
        >

          <SummaryBox
            label="Positive Balance"
            value={
              `₹${Number(
                summary.total_positive_balance ||
                0
              ).toFixed(2)}`
            }
          />

          <SummaryBox
            label="Total Due"
            value={
              `₹${Number(
                summary.total_due ||
                0
              ).toFixed(2)}`
            }
          />

        </View>


        <View
          style={
            styles.netBox
          }
        >

          <Text
            style={
              styles.netLabel
            }
          >
            Net Fund Balance
          </Text>

          <Text
            style={[
              styles.netValue,

              Number(
                summary.net_fund_balance ||
                0
              ) >= 0

                ? styles.positive

                : styles.negative,
            ]}
          >

            {Number(
              summary.net_fund_balance ||
              0
            ) > 0
              ? '+ '
              : Number(
                  summary.net_fund_balance ||
                  0
                ) < 0
              ? '- '
              : ''}

            ₹
            {Math.abs(
              Number(
                summary.net_fund_balance ||
                0
              )
            ).toFixed(2)}

          </Text>

        </View>


        {/* =================================
            FILTER
        ================================= */}

        <Text
          style={styles.heading}
        >
          Student Report
        </Text>


        <Field
          placeholder="Registration No / Student Name / Class"
          value={search}
          onChangeText={
            setSearch
          }
        />


        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={
            styles.filterScroll
          }
        >

          <FilterButton
            title="All"
            selected={
              filter === 'all'
            }
            onPress={() =>
              setFilter('all')
            }
          />

          <FilterButton
            title="Due Only"
            selected={
              filter === 'due'
            }
            onPress={() =>
              setFilter('due')
            }
          />

          <FilterButton
            title="Deposit"
            selected={
              filter === 'deposit'
            }
            onPress={() =>
              setFilter('deposit')
            }
          />

          <FilterButton
            title="Clear"
            selected={
              filter === 'clear'
            }
            onPress={() =>
              setFilter('clear')
            }
          />

        </ScrollView>


        <Text
          style={styles.countText}
        >
          Showing: {students.length} Students
        </Text>


        <Button
          title="Download Current Report (CSV)"
          onPress={
            downloadCsv
          }
        />


        {/* =================================
            STUDENTS
        ================================= */}

        {!students.length && (

          <Muted>
            No matching student found.
          </Muted>

        )}


        {students.map(
          (student: any) => {

            const balance =
              Number(
                student.net_balance ||
                0
              );


            return (

              <Card
                key={student.id}
              >

                <Text
                  style={
                    styles.studentName
                  }
                >
                  {student.student_name}
                </Text>


                <Text
                  style={
                    styles.studentMeta
                  }
                >
                  Reg: {student.registration_no || '-'}
                  {'  '}Class: {student.class_name || '-'}
                  {'  '}Roll: {student.roll_no || '-'}
                </Text>


                <View
                  style={
                    styles.balanceRow
                  }
                >

                  <Text>
                    Current Balance
                  </Text>


                  <Text
                    style={[
                      styles.studentBalance,

                      balance > 0
                        ? styles.positive

                        : balance < 0
                        ? styles.negative

                        : styles.zero,
                    ]}
                  >

                    {balance > 0
                      ? '+ '
                      : balance < 0
                      ? '- '
                      : ''}

                    ₹
                    {Math.abs(
                      balance
                    ).toFixed(2)}

                  </Text>

                </View>


                <Text
                  style={
                    styles.studentMeta
                  }
                >
                  Total Deposit: ₹
                  {Number(
                    student.total_deposit ||
                    0
                  ).toFixed(2)}
                </Text>


                <Text
                  style={
                    styles.studentMeta
                  }
                >
                  Total Expense: ₹
                  {Number(
                    student.total_expense ||
                    0
                  ).toFixed(2)}
                </Text>


                {Number(student.due || 0) > 0 && (

                  <TouchableOpacity
                    style={
                      styles.whatsappButton
                    }
                    onPress={() =>
                      sendWhatsApp(
                        student
                      )
                    }
                  >

                    <Text
                      style={
                        styles.whatsappText
                      }
                    >
                      Send Due Reminder on WhatsApp
                    </Text>

                  </TouchableOpacity>

                )}

              </Card>

            );

          }
        )}

      </ScrollView>

    </SafeAreaView>

  );

}


function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (

    <View
      style={styles.summaryBox}
    >

      <Text
        style={styles.summaryLabel}
      >
        {label}
      </Text>

      <Text
        style={styles.summaryValue}
      >
        {value}
      </Text>

    </View>

  );

}


function FilterButton({
  title,
  selected,
  onPress,
}: {
  title: string;
  selected: boolean;
  onPress: () => void;
}) {

  return (

    <TouchableOpacity
      style={[
        styles.filterButton,

        selected &&
          styles.filterSelected,
      ]}
      onPress={onPress}
    >

      <Text
        style={[
          styles.filterText,

          selected &&
            styles.filterSelectedText,
        ]}
      >
        {title}
      </Text>

    </TouchableOpacity>

  );

}


const styles =
  StyleSheet.create({

    page: {
      flex: 1,
      backgroundColor: '#f3f6f9',
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

    heading: {
      fontSize: 19,
      fontWeight: '800',
      marginTop: 20,
      marginBottom: 10,
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
      padding: 14,
    },

    summaryLabel: {
      color: '#667085',
      marginBottom: 5,
      fontSize: 13,
    },

    summaryValue: {
      fontSize: 18,
      fontWeight: '900',
    },

    netBox: {
      backgroundColor: '#fff',
      borderRadius: 14,
      padding: 18,
      alignItems: 'center',
      marginBottom: 10,
    },

    netLabel: {
      color: '#667085',
      fontWeight: '700',
    },

    netValue: {
      fontSize: 28,
      fontWeight: '900',
      marginTop: 6,
    },

    positive: {
      color: '#137333',
    },

    negative: {
      color: '#c62828',
    },

    zero: {
      color: '#475467',
    },

    filterScroll: {
      marginBottom: 10,
    },

    filterButton: {
      borderWidth: 1,
      borderColor: '#1565c0',
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 20,
      marginRight: 8,
    },

    filterSelected: {
      backgroundColor: '#1565c0',
    },

    filterText: {
      color: '#1565c0',
      fontWeight: '700',
    },

    filterSelectedText: {
      color: '#fff',
    },

    countText: {
      color: '#667085',
      marginBottom: 10,
    },

    studentName: {
      fontSize: 18,
      fontWeight: '800',
    },

    studentMeta: {
      color: '#667085',
      marginTop: 5,
    },

    balanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#eef1f4',
    },

    studentBalance: {
      fontSize: 20,
      fontWeight: '900',
    },

    whatsappButton: {
      marginTop: 14,
      backgroundColor: '#137333',
      padding: 12,
      borderRadius: 9,
    },

    whatsappText: {
      color: '#fff',
      textAlign: 'center',
      fontWeight: '800',
    },

  });
