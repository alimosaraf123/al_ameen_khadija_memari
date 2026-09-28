import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  Text,
  Alert,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../lib/api';
import { Field, Button, Card, H1, Muted } from '../components/ui';

type Student = {
  id: number;
  registration_no?: string;
  student_name?: string;
  class_name?: string;
  roll_no?: string;
  father_name?: string;
  guardian_name?: string;
  guardian_mobile?: string;
  mobile_number?: string;
};

export default function Guardians() {
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] =
    useState<Student | null>(null);

  const [credentials, setCredentials] =
    useState<{
      login_id: string;
      password: string;
    } | null>(null);

  const [saving, setSaving] =
    useState(false);

  const load = async () => {
    try {
      const [studentData, guardianData] =
        await Promise.all([
          api('/api/students'),
          api('/api/guardians'),
        ]);

      setStudents(
        studentData.students || []
      );

      setGuardians(
        guardianData.guardians || []
      );
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.message
      );
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredStudents =
    useMemo(() => {
      const q =
        search.trim().toLowerCase();

      if (!q) return [];

      return students
        .filter((s) => {
          const fields = [
            s.registration_no,
            s.student_name,
            s.class_name,
            s.roll_no,
            s.father_name,
            s.guardian_name,
            s.guardian_mobile,
            s.mobile_number,
          ];

          return fields.some(
            (value) =>
              String(value || '')
                .toLowerCase()
                .includes(q)
          );
        })
        .slice(0, 30);
    }, [search, students]);

  const linkedGuardian =
    selectedStudent
      ? guardians.find(
          (g) =>
            Array.isArray(g.students) &&
            g.students.some(
              (s: any) =>
                Number(s.id) ===
                Number(
                  selectedStudent.id
                )
            )
        )
      : null;

  const selectStudent = (
    student: Student
  ) => {
    setSelectedStudent(student);
    setCredentials(null);
    setSearch('');
  };

  const createGuardianLogin =
    async () => {
      if (
        !selectedStudent
          ?.registration_no
      ) {
        Alert.alert(
          'Error',
          'Registration No is missing.'
        );

        return;
      }

      try {
        setSaving(true);

        const data =
          await api(
            '/api/guardians/create-for-student',
            {
              method: 'POST',
              body: JSON.stringify({
                registration_no:
                  selectedStudent
                    .registration_no,
              }),
            }
          );

        setCredentials(
          data.credentials
        );

        await load();

        Alert.alert(
          'Success',
          'Guardian login created.'
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

  const resetGuardianPassword =
    async () => {
      if (!linkedGuardian?.id) {
        return;
      }

      try {
        setSaving(true);

        const data =
          await api(
            `/api/guardians/${linkedGuardian.id}/reset-password`,
            {
              method: 'POST',
            }
          );

        setCredentials(
          data.credentials
        );

        Alert.alert(
          'Success',
          'New password generated.'
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
        <H1>
          Guardian Login
        </H1>

        <Text style={styles.note}>
          Guardian login is created from the student's unique Registration No.
        </Text>

        <Text style={styles.heading}>
          Find Student
        </Text>

        {!selectedStudent ? (
          <>
            <Field
              placeholder="Registration No / Student Name"
              value={search}
              onChangeText={setSearch}
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
                    {student.registration_no ||
                      '-'}
                    {'  '}Class:{' '}
                    {student.class_name ||
                      '-'}
                    {'  '}Roll:{' '}
                    {student.roll_no ||
                      '-'}
                  </Text>

                  {!!student.father_name && (
                    <Text
                      style={
                        styles.studentMeta
                      }
                    >
                      Father:{' '}
                      {
                        student.father_name
                      }
                    </Text>
                  )}
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
        ) : (
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

            <InfoRow
              label="Registration No"
              value={
                selectedStudent
                  .registration_no
              }
            />

            <InfoRow
              label="Class"
              value={
                selectedStudent
                  .class_name
              }
            />

            <InfoRow
              label="Roll"
              value={
                selectedStudent
                  .roll_no
              }
            />

            <InfoRow
              label="Father"
              value={
                selectedStudent
                  .father_name
              }
            />

            <InfoRow
              label="Guardian"
              value={
                selectedStudent
                  .guardian_name
              }
            />

            <InfoRow
              label="Mobile"
              value={
                selectedStudent
                  .guardian_mobile ||
                selectedStudent
                  .mobile_number
              }
            />

            <TouchableOpacity
              style={
                styles.changeStudent
              }
              onPress={() => {
                setSelectedStudent(
                  null
                );
                setCredentials(null);
              }}
            >
              <Text
                style={
                  styles.changeText
                }
              >
                Change Student
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {selectedStudent && (
          <>
            <Text style={styles.heading}>
              Guardian Login Status
            </Text>

            {!linkedGuardian ? (
              <Card>
                <Text style={styles.statusNew}>
                  Guardian login not created yet
                </Text>

                <Text
                  style={
                    styles.loginRule
                  }
                >
                  User ID will be:
                </Text>

                <Text
                  style={
                    styles.bigLogin
                  }
                >
                  {
                    selectedStudent
                      .registration_no
                  }
                </Text>

                <Button
                  title={
                    saving
                      ? 'Creating...'
                      : 'Create Guardian Login'
                  }
                  onPress={
                    createGuardianLogin
                  }
                />
              </Card>
            ) : (
              <Card>
                <Text
                  style={
                    styles.statusDone
                  }
                >
                  Guardian login already created
                </Text>

                <InfoRow
                  label="Guardian"
                  value={
                    linkedGuardian
                      .guardian_name
                  }
                />

                <InfoRow
                  label="User ID"
                  value={
                    linkedGuardian
                      .login_id
                  }
                />

                <InfoRow
                  label="Status"
                  value={
                    linkedGuardian
                      .user_active
                      ? 'Active'
                      : 'Inactive'
                  }
                />

                <Button
                  title={
                    saving
                      ? 'Generating...'
                      : 'Generate New Password'
                  }
                  onPress={
                    resetGuardianPassword
                  }
                />
              </Card>
            )}
          </>
        )}

        {credentials && (
          <View
            style={
              styles.credentialsBox
            }
          >
            <Text
              style={
                styles.credentialsHeading
              }
            >
              Guardian Login Credentials
            </Text>

            <Text style={styles.warning}>
              এই password এখনই Guardian-কে দিন বা লিখে রাখুন। নিরাপত্তার জন্য পুরনো password পরে দেখা যাবে না; প্রয়োজন হলে নতুন password generate করবেন।
            </Text>

            <Text
              style={
                styles.credentialLabel
              }
            >
              User ID
            </Text>

            <Text
              selectable
              style={
                styles.credentialValue
              }
            >
              {credentials.login_id}
            </Text>

            <Text
              style={
                styles.credentialLabel
              }
            >
              Password
            </Text>

            <Text
              selectable
              style={
                styles.passwordValue
              }
            >
              {credentials.password}
            </Text>
          </View>
        )}

        <Text style={styles.heading}>
          Existing Guardian Logins
        </Text>

        {guardians.length === 0 && (
          <Muted>
            No guardian login found
          </Muted>
        )}

        {guardians.map(
          (guardian) => (
            <Card
              key={guardian.id}
            >
              <Text
                style={
                  styles.guardianName
                }
              >
                {
                  guardian.guardian_name
                }
              </Text>

              <Text>
                User ID:{' '}
                {guardian.login_id}
              </Text>

              <Text>
                Student:{' '}
                {Array.isArray(
                  guardian.students
                ) &&
                guardian.students.length
                  ? guardian.students
                      .map(
                        (s: any) =>
                          `${s.student_name} (${s.registration_no})`
                      )
                      .join(', ')
                  : '-'}
              </Text>
            </Card>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>
        {label}
      </Text>

      <Text style={styles.infoValue}>
        {value === null ||
        value === undefined ||
        value === ''
          ? '-'
          : String(value)}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor:
        '#f3f6f9',
    },

    content: {
      padding: 16,
      paddingBottom: 70,
    },

    note: {
      color: '#667085',
      marginTop: 4,
      marginBottom: 10,
    },

    heading: {
      fontSize: 19,
      fontWeight: '800',
      marginTop: 18,
      marginBottom: 10,
    },

    studentCard: {
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: '#d7dde2',
      borderRadius: 10,
      padding: 13,
      marginBottom: 8,
    },

    studentName: {
      fontSize: 18,
      fontWeight: '800',
    },

    studentMeta: {
      marginTop: 4,
      color: '#667085',
    },

    infoRow: {
      flexDirection: 'row',
      paddingVertical: 5,
    },

    infoLabel: {
      width: 125,
      fontWeight: '700',
      color: '#475467',
    },

    infoValue: {
      flex: 1,
    },

    changeStudent: {
      marginTop: 12,
      padding: 10,
      borderWidth: 1,
      borderColor: '#1565c0',
      borderRadius: 8,
    },

    changeText: {
      color: '#1565c0',
      textAlign: 'center',
      fontWeight: '800',
    },

    statusNew: {
      fontWeight: '800',
      color: '#9a6700',
      marginBottom: 10,
    },

    statusDone: {
      fontWeight: '800',
      color: '#137333',
      marginBottom: 10,
    },

    loginRule: {
      color: '#667085',
    },

    bigLogin: {
      fontSize: 22,
      fontWeight: '900',
      marginTop: 4,
      marginBottom: 14,
    },

    credentialsBox: {
      backgroundColor: '#fff7d6',
      borderWidth: 1,
      borderColor: '#e5bf31',
      borderRadius: 12,
      padding: 16,
      marginTop: 16,
    },

    credentialsHeading: {
      fontSize: 19,
      fontWeight: '900',
      marginBottom: 8,
    },

    warning: {
      color: '#6b5600',
      marginBottom: 14,
    },

    credentialLabel: {
      fontWeight: '700',
      color: '#475467',
      marginTop: 6,
    },

    credentialValue: {
      fontSize: 21,
      fontWeight: '900',
      marginTop: 3,
    },

    passwordValue: {
      fontSize: 24,
      fontWeight: '900',
      letterSpacing: 2,
      marginTop: 3,
    },

    guardianName: {
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 4,
    },
  });
