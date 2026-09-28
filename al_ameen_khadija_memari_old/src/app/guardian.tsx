import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';

import { api, API_BASE } from '../lib/api';
import { clearSession } from '../lib/auth';
import {
  saveGuardianBiometricToken,
  hasGuardianBiometricToken,
  clearGuardianBiometricToken,
  getGuardianBiometricToken,
} from '../lib/guardianDevice';
import { Field, Button, Muted } from '../components/ui';

type TabName = 'home' | 'result' | 'details' | 'documents' | 'settings';

const PAYMENT_URL = 'https://alameenmission.net/fees_payment/fees_memari/';
const RECEIPT_URL = 'https://alameenmission.net/fees_receipt/';

export default function Guardian() {
  const [tab, setTab] = useState<TabName>('home');
  const [student, setStudent] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [childData, setChildData] = useState<any>(null);
  const [depositData, setDepositData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [monthlyFeeData, setMonthlyFeeData] = useState<any>(null);
  const [monthlyFeeLoading, setMonthlyFeeLoading] = useState(false);
  const [monthlyFeeError, setMonthlyFeeError] = useState('');

  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showMpinPanel, setShowMpinPanel] = useState(false);
  const [mpinPassword, setMpinPassword] = useState('');
  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [savingMpin, setSavingMpin] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  const loadMonthlyFeeDue = async (studentId: number) => {
    try {
      setMonthlyFeeLoading(true);
      setMonthlyFeeError('');

      const result = await api(
        `/api/guardians/student/${studentId}/monthly-fee-due`
      );

      setMonthlyFeeData(result);
    } catch (e: any) {
      setMonthlyFeeData(null);
      setMonthlyFeeError(e.message || 'Monthly Fee Due পাওয়া যাচ্ছে না।');
    } finally {
      setMonthlyFeeLoading(false);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const home = await api('/api/guardians/home');
      const firstStudent = home?.students?.[0];

      if (!firstStudent) {
        setStudent(null);
        return;
      }

      setStudent(firstStudent);
      const studentId = firstStudent.id;

      const [profileResult, childResult, depositResult] = await Promise.all([
        api(`/api/guardians/student/${studentId}/profile`),
        api(`/api/guardians/student/${studentId}`),
        api(`/api/guardians/student/${studentId}/deposit-fund`),
      ]);

      setProfile(profileResult);
      setChildData(childResult);
      setDepositData(depositResult);

      loadMonthlyFeeDue(studentId);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unable to load Guardian Dashboard');
    } finally {
      setLoading(false);
    }
  };

  const checkBiometricStatus = async () => {
    try {
      const enabled = await hasGuardianBiometricToken();
      setBiometricEnabled(enabled);
    } catch (e) {
      console.log('Biometric status check failed', e);
    }
  };

  useEffect(() => {
    loadDashboard();
    checkBiometricStatus();
  }, []);

  const getPhotoUrl = () => {
    const photo = profile?.student?.photo_url || student?.photo_url;

    if (!photo) return null;
    if (String(photo).startsWith('http')) return String(photo);

    return `${API_BASE}${photo}`;
  };

  const changePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Required', 'Current Password লিখুন।');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Required', 'New Password কমপক্ষে 6 characters হতে হবে।');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password mismatch', 'New Password এবং Confirm Password একই নয়।');
      return;
    }

    try {
      setChangingPassword(true);

      await api('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      Alert.alert('Success', 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordPanel(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setChangingPassword(false);
    }
  };

  const saveMpin = async () => {
    if (!mpinPassword) {
      Alert.alert('Required', 'Current Password লিখুন।');
      return;
    }

    if (!/^\d{6}$/.test(mpin)) {
      Alert.alert('Invalid mPIN', 'mPIN ঠিক 6 সংখ্যার হতে হবে।');
      return;
    }

    if (mpin !== confirmMpin) {
      Alert.alert('mPIN mismatch', 'mPIN এবং Confirm mPIN একই নয়।');
      return;
    }

    try {
      setSavingMpin(true);

      await api('/api/set-mpin', {
        method: 'POST',
        body: JSON.stringify({
          current_password: mpinPassword,
          mpin,
        }),
      });

      Alert.alert('Success', 'mPIN saved successfully.');
      setMpinPassword('');
      setMpin('');
      setConfirmMpin('');
      setShowMpinPanel(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingMpin(false);
    }
  };

  const enableFingerprint = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile Only', 'Fingerprint Login mobile app-এ ব্যবহার করুন।');
      return;
    }

    try {
      setBiometricBusy(true);

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Not Available', 'এই ফোনে biometric hardware পাওয়া যায়নি।');
        return;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert(
          'Fingerprint Not Set',
          'আগে ফোনের Settings থেকে Fingerprint সেট করুন।'
        );
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable Fingerprint Login',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Phone Security',
      });

      if (!authResult.success) return;

      const result = await api('/api/biometric/register', {
        method: 'POST',
        body: JSON.stringify({
          device_name: 'Guardian Mobile',
        }),
      });

      if (!result.device_token) {
        throw new Error('Device token was not received.');
      }

      await saveGuardianBiometricToken(result.device_token);
      setBiometricEnabled(true);
      Alert.alert('Success', 'Fingerprint Login enabled successfully.');
    } catch (e: any) {
      Alert.alert('Fingerprint Error', e.message || 'Unable to enable Fingerprint Login');
    } finally {
      setBiometricBusy(false);
    }
  };

  const disableFingerprint = async () => {
    try {
      setBiometricBusy(true);
      const deviceToken = await getGuardianBiometricToken();

      if (deviceToken) {
        try {
          await api('/api/biometric/revoke', {
            method: 'POST',
            body: JSON.stringify({
              device_token: deviceToken,
            }),
          });
        } catch (e) {
          console.log('Server revoke failed', e);
        }
      }

      await clearGuardianBiometricToken();
      setBiometricEnabled(false);
      Alert.alert('Disabled', 'Fingerprint Login disabled.');
    } finally {
      setBiometricBusy(false);
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingPage}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={styles.loadingPage}>
        <Text>No Student linked with this account.</Text>
      </SafeAreaView>
    );
  }

  const s = profile?.student || childData?.student || student;
  const netBalance = Number(depositData?.summary?.net_balance || 0);
  const notices = childData?.notices || [];
  const marks = childData?.marks || [];
  const documents = childData?.documents || [];
  const photoUrl = getPhotoUrl();

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.brandHeader}>
        <Image
          source={require('../../assets/images/al-ameen-logo.jpg')}
          style={styles.brandLogo}
          resizeMode="contain"
          accessibilityLabel="Al-Ameen Mission Academy Memari logo"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.brandName}>Al-Ameen Mission Academy Memari</Text>
        </View>
      </View>
      {/* STUDENT HEADER */}
      <View style={styles.studentHeader}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoText}>{String(s?.student_name || 'S').trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.studentName}>{s?.student_name || '-'}</Text>
          <Text style={styles.studentMeta}>Reg: {s?.registration_no || '-'}</Text>
          <Text style={styles.studentMeta}>
            Class: {s?.class_name || '-'}
          </Text>
          {!!s?.room_id && (
            <Text style={styles.studentMeta}>Room: {s.room_id}</Text>
          )}
        </View>
      </View>

      {/* MAIN TABS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabContent}
      >
        <Tab title="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <Tab title="Result" active={tab === 'result'} onPress={() => setTab('result')} />
        <Tab
          title="Student Details"
          active={tab === 'details'}
          onPress={() => setTab('details')}
        />
        <Tab
          title="Documents"
          active={tab === 'documents'}
          onPress={() => setTab('documents')}
        />
        <Tab
          title="Settings"
          active={tab === 'settings'}
          onPress={() => setTab('settings')}
        />

        <TouchableOpacity style={styles.logoutTab} onPress={logout}>
          <Text style={styles.logoutTabText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* HOME */}
        {tab === 'home' && (
          <>
            <Text style={styles.heading}>Notifications</Text>

            {notices.length === 0 ? (
              <Card tone="notice">
                <Muted>No new notification.</Muted>
              </Card>
            ) : (
              notices.slice(0, 5).map((notice: any, index: number) => (
                <Card key={notice.id || index} tone="notice">
                  <Text style={styles.noticeTitle}>
                    {notice.title || notice.notice_title || 'Notice'}
                  </Text>

                  {!!(notice.message || notice.content || notice.description) && (
                    <Text style={styles.noticeText}>
                      {notice.message || notice.content || notice.description}
                    </Text>
                  )}

                  {!!(notice.published_at || notice.created_at) && (
                    <Text style={styles.dateText}>
                      {String(notice.published_at || notice.created_at).slice(0, 10)}
                    </Text>
                  )}
                </Card>
              ))
            )}

            {/* MONTHLY FEES */}
            <Text style={styles.heading}>Monthly Fees</Text>

            <Card tone="fees">
              {monthlyFeeLoading ? (
                <Text style={styles.settingsHelp}>Checking Monthly Fee Due...</Text>
              ) : monthlyFeeError ? (
                <Text style={styles.errorText}>{monthlyFeeError}</Text>
              ) : monthlyFeeData ? (
                <>
                  {monthlyFeeData?.monthly_dues?.length > 0 ? (
                    monthlyFeeData.monthly_dues.map((item: any, index: number) => (
                      <View key={index} style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.label}>{item.month_year}</Text>
                          {!!item.description && (
                            <Text style={styles.feeDescription}>{item.description}</Text>
                          )}
                        </View>

                        <Text style={[styles.value, styles.monthlyDueAmount]}>
                          ₹{Number(item.amount || 0).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noDueText}>No Monthly Fee Due</Text>
                  )}

                  <View style={styles.totalDueBox}>
                    <View style={styles.row}>
                      <Text style={styles.totalDueLabel}>Total Due</Text>
                      <Text
                        style={[
                          styles.totalDueValue,
                          Number(monthlyFeeData?.total_due || 0) > 0
                            ? styles.negative
                            : styles.positive,
                        ]}
                      >
                        ₹{Number(monthlyFeeData?.total_due || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}

              <Button
                title={monthlyFeeLoading ? 'Checking...' : 'Refresh Monthly Due'}
                onPress={() => loadMonthlyFeeDue(student.id)}
              />

              <TouchableOpacity
                style={styles.primaryLink}
                onPress={() => Linking.openURL(PAYMENT_URL)}
              >
                <Text style={styles.primaryLinkText}>Pay Monthly Fees</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={() => Linking.openURL(RECEIPT_URL)}
              >
                <Text style={styles.secondaryLinkText}>Download Fee Receipt</Text>
              </TouchableOpacity>
            </Card>

            {/* DEPOSIT FUND */}
            <Text style={styles.heading}>Student Deposit Fund</Text>

            <View style={styles.fundBalanceBox}>
              <Text style={styles.fundLabel}>Current Fund Balance</Text>

              <Text
                style={[
                  styles.fundAmount,
                  netBalance > 0
                    ? styles.positive
                    : netBalance < 0
                    ? styles.negative
                    : styles.zero,
                ]}
              >
                {netBalance > 0 ? '+ ' : netBalance < 0 ? '- ' : ''}₹
                {Math.abs(netBalance).toFixed(2)}
              </Text>

              <Text style={styles.fundStatus}>
                {netBalance > 0
                  ? 'Fund-এ টাকা জমা আছে'
                  : netBalance < 0
                  ? 'Fund-এ Due / ঘাটতি আছে'
                  : 'Fund Balance Zero'}
              </Text>
            </View>

            <Text style={styles.subHeading}>Recent Transactions</Text>

            {!depositData?.transactions?.length ? (
              <Card>
                <Muted>No transaction yet.</Muted>
              </Card>
            ) : (
              depositData.transactions.slice(0, 10).map((item: any) => (
                <View key={item.id} style={styles.transactionCard}>
                  <View style={styles.transactionTop}>
                    <Text style={styles.transactionDetails}>
                      {item.details ||
                        (item.transaction_type === 'deposit' ? 'Deposit' : 'Expense')}
                    </Text>

                    <Text
                      style={[
                        styles.transactionAmount,
                        item.transaction_type === 'deposit'
                          ? styles.positive
                          : styles.negative,
                      ]}
                    >
                      {item.transaction_type === 'deposit' ? '+ ' : '- '}₹
                      {Number(item.amount || 0).toFixed(2)}
                    </Text>
                  </View>

                  <Text style={styles.dateText}>
                    {String(item.transaction_date || '').slice(0, 10)}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* RESULT */}
        {tab === 'result' && (
          <>
            <Text style={styles.heading}>Published Result</Text>

            {marks.length === 0 ? (
              <Card>
                <Muted>No published result available.</Muted>
              </Card>
            ) : (
              marks.map((mark: any, index: number) => (
                <Card key={mark.id || index}>
                  <Text style={styles.resultExam}>{mark.exam_name || 'Exam'}</Text>

                  <View style={styles.row}>
                    <Text style={styles.label}>Subject</Text>
                    <Text style={styles.value}>{mark.subject_name || '-'}</Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={styles.label}>Marks</Text>
                    <Text style={styles.value}>
                      {mark.marks_obtained ?? mark.marks ?? mark.score ?? '-'}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        {/* STUDENT DETAILS */}
        {tab === 'details' && (
          <>
            <Text style={styles.heading}>Student Details</Text>

            <Card>
              <Info label="Registration No" value={s.registration_no} />
              <Info label="Student Name" value={s.student_name} />
              <Info label="Class" value={s.class_name} />
              <Info label="Admission No" value={s.admission_no} />
              <Info
                label="Date of Birth"
                value={s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : null}
              />
              <Info label="Gender" value={s.gender} />
              <Info label="Blood Group" value={s.blood_group} />
              <Info label="Mobile" value={s.mobile_number} />
              <Info label="WhatsApp" value={s.whatsapp_number} />
            </Card>

            <Text style={styles.subHeading}>Father</Text>
            <Card>
              <Info label="Name" value={s.father_name} />
              <Info label="Mobile" value={s.father_mobile} />
              <Info label="Occupation" value={s.father_occupation} />
              <Info label="Qualification" value={s.father_qualification} />
            </Card>

            <Text style={styles.subHeading}>Mother</Text>
            <Card>
              <Info label="Name" value={s.mother_name} />
              <Info label="Mobile" value={s.mother_mobile} />
              <Info label="Occupation" value={s.mother_occupation} />
              <Info label="Qualification" value={s.mother_qualification} />
            </Card>

            <Text style={styles.subHeading}>Visitor 1</Text>
            <Card>
              <Info label="Name" value={profile?.visitor1?.visitor_name} />
              <Info label="Relation" value={profile?.visitor1?.relation} />
              <Info label="Mobile" value={profile?.visitor1?.mobile_number} />
            </Card>

            <Text style={styles.subHeading}>Visitor 2</Text>
            <Card>
              <Info label="Name" value={profile?.visitor2?.visitor_name} />
              <Info label="Relation" value={profile?.visitor2?.relation} />
              <Info label="Mobile" value={profile?.visitor2?.mobile_number} />
            </Card>
          </>
        )}

        {/* DOCUMENTS */}
        {tab === 'documents' && (
          <>
            <Text style={styles.heading}>Documents</Text>

            {documents.length === 0 ? (
              <Card>
                <Muted>No document available.</Muted>
              </Card>
            ) : (
              documents.map((doc: any, index: number) => (
                <Card key={doc.id || index}>
                  <Text style={styles.documentTitle}>
                    {doc.document_title || doc.document_type || 'Document'}
                  </Text>
                  <Text style={styles.documentMeta}>
                    {doc.guardian_download_allowed
                      ? 'View + Download Allowed'
                      : 'View Only'}
                  </Text>
                </Card>
              ))
            )}

            <Button
              title="Open Secure Documents"
              onPress={() =>
                router.push({
                  pathname: '/guardian-student',
                  params: { id: String(student.id) },
                } as any)
              }
            />
          </>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <>
            <Text style={styles.heading}>Settings</Text>

            {/* PASSWORD */}
            <Card>
              <Button
                title={
                  showPasswordPanel ? 'Close Change Password' : 'Change Password'
                }
                onPress={() => setShowPasswordPanel(!showPasswordPanel)}
              />

              {showPasswordPanel && (
                <View style={styles.settingsBox}>
                  <Field
                    placeholder="Current Password"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                  />
                  <Field
                    placeholder="New Password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                  />
                  <Field
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                  <Button
                    title={changingPassword ? 'Changing...' : 'Save New Password'}
                    onPress={changePassword}
                  />
                </View>
              )}
            </Card>

            {/* MPIN */}
            <Card>
              <Button
                title={showMpinPanel ? 'Close mPIN' : 'Set / Change mPIN'}
                onPress={() => setShowMpinPanel(!showMpinPanel)}
              />

              {showMpinPanel && (
                <View style={styles.settingsBox}>
                  <Field
                    placeholder="Current Password"
                    value={mpinPassword}
                    onChangeText={setMpinPassword}
                    secureTextEntry
                  />
                  <Field
                    placeholder="6 Digit mPIN"
                    value={mpin}
                    onChangeText={(value: string) =>
                      setMpin(value.replace(/\D/g, '').slice(0, 6))
                    }
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={6}
                  />
                  <Field
                    placeholder="Confirm 6 Digit mPIN"
                    value={confirmMpin}
                    onChangeText={(value: string) =>
                      setConfirmMpin(value.replace(/\D/g, '').slice(0, 6))
                    }
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={6}
                  />
                  <Button
                    title={savingMpin ? 'Saving...' : 'Save mPIN'}
                    onPress={saveMpin}
                  />
                </View>
              )}
            </Card>

            {/* FINGERPRINT */}
            {Platform.OS !== 'web' && (
              <Card>
                <Text style={styles.settingsTitle}>Fingerprint Login</Text>
                <Text style={styles.settingsHelp}>
                  {biometricEnabled
                    ? 'Fingerprint Login এই device-এ চালু আছে।'
                    : 'Fingerprint Login এই device-এ বন্ধ আছে।'}
                </Text>

                {!biometricEnabled ? (
                  <Button
                    title={
                      biometricBusy ? 'Please wait...' : 'Enable Fingerprint Login'
                    }
                    onPress={enableFingerprint}
                  />
                ) : (
                  <Button
                    title={
                      biometricBusy ? 'Please wait...' : 'Disable Fingerprint Login'
                    }
                    onPress={disableFingerprint}
                  />
                )}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Tab({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

function Card({ children, tone = 'default' }: {
  children: React.ReactNode;
  tone?: 'default' | 'notice' | 'fees';
}) {
  return (
    <View style={[styles.card, tone === 'notice' && styles.noticeCard, tone === 'fees' && styles.feesCard]}>
      {children}
    </View>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>
        {value === null || value === undefined || value === '' ? '-' : String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  brandLogo: { width: 54, height: 56 },
  brandName: { color: '#166534', fontSize: 17, fontWeight: '800' },
  page: {
    flex: 1,
    backgroundColor: '#f4f3ff',
  },

  loadingPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  studentHeader: {
    backgroundColor: '#4338ca',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 22,
    gap: 13,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },

  photo: {
    width: 78,
    height: 78,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#c7d2fe',
    backgroundColor: '#e9edf2',
  },

  photoPlaceholder: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  photoText: {
    color: '#4338ca',
    fontWeight: '700',
    fontSize: 32,
  },

  studentName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },

  studentMeta: {
    marginTop: 3,
    color: '#e0e7ff',
    fontWeight: '600',
  },

  tabBar: {
    maxHeight: 66,
    flexGrow: 0,
    backgroundColor: '#f4f3ff',
  },

  tabContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },

  tab: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginHorizontal: 2,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },

  tabActive: {
    backgroundColor: '#4338ca',
  },

  tabText: {
    color: '#667085',
    fontWeight: '700',
  },

  tabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },

  logoutTab: {
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginHorizontal: 2,
    borderRadius: 14,
    backgroundColor: '#ffe4e6',
  },

  logoutTabText: {
    color: '#c62828',
    fontWeight: '900',
  },

  content: {
    padding: 18,
    paddingBottom: 70,
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },

  heading: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 10,
    color: '#172b4d',
  },

  subHeading: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 8,
  },

  noticeTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  noticeText: {
    marginTop: 6,
    color: '#475467',
    lineHeight: 20,
  },

  dateText: {
    marginTop: 5,
    color: '#64748b',
    fontSize: 12,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 10,
  },

  label: {
    color: '#667085',
    fontWeight: '700',
  },

  value: {
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },

  errorText: {
    color: '#c62828',
    marginBottom: 10,
  },

  feeDescription: {
    color: '#667085',
    fontSize: 12,
    marginTop: 2,
  },

  monthlyDueAmount: {
    color: '#c62828',
    fontSize: 18,
  },

  noDueText: {
    color: '#137333',
    fontWeight: '800',
    marginBottom: 10,
  },

  totalDueBox: {
    borderTopWidth: 1,
    borderTopColor: '#e5e9ee',
    marginTop: 8,
    paddingTop: 10,
  },

  totalDueLabel: {
    fontWeight: '900',
    fontSize: 17,
  },

  totalDueValue: {
    fontWeight: '900',
    fontSize: 21,
  },

  primaryLink: {
    backgroundColor: '#047857',
    padding: 13,
    borderRadius: 9,
    marginTop: 10,
  },

  primaryLinkText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '800',
  },

  secondaryLink: {
    borderWidth: 1,
    borderColor: '#c4b5fd',
    backgroundColor: '#ede9fe',
    padding: 13,
    borderRadius: 9,
    marginTop: 10,
  },

  secondaryLinkText: {
    color: '#5b21b6',
    textAlign: 'center',
    fontWeight: '800',
  },

  fundBalanceBox: {
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#6ee7b7',
    borderRadius: 22,
    padding: 26,
    alignItems: 'center',
  },

  fundLabel: {
    color: '#065f46',
    fontWeight: '700',
  },

  fundAmount: {
    fontSize: 30,
    fontWeight: '900',
    marginTop: 6,
  },

  fundStatus: {
    color: '#065f46',
    marginTop: 5,
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

  transactionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#14b8a6',
  },

  transactionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  transactionDetails: {
    flex: 1,
    fontWeight: '700',
  },

  transactionAmount: {
    fontWeight: '900',
  },

  resultExam: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 5,
  },

  infoRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },

  infoLabel: {
    width: 135,
    color: '#667085',
    fontWeight: '700',
  },

  infoValue: {
    flex: 1,
    fontWeight: '600',
  },

  documentTitle: {
    fontSize: 16,
    fontWeight: '800',
  },

  documentMeta: {
    color: '#667085',
    marginTop: 5,
  },

  settingsBox: {
    marginTop: 12,
  },

  settingsTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },

  settingsHelp: {
    color: '#667085',
    marginBottom: 12,
  },
  card: { backgroundColor: '#ffffff', borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#e0e7ff' },
  noticeCard: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  feesCard: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
});
