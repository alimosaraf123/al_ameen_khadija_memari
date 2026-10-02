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
import { clearSession, getToken } from '../lib/auth';
import {
  saveGuardianBiometricToken,
  hasGuardianBiometricToken,
  clearGuardianBiometricToken,
  getGuardianBiometricToken,
} from '../lib/guardianDevice';
import { Field, Button, Muted } from '../components/ui';

type TabName = 'home' | 'result' | 'gatepass' | 'visits' | 'details' | 'documents' | 'settings';


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

  const openMonthlyFeePayment = async () => {
    if (!student?.id) {
      return Alert.alert('Fee Payment', 'Student information is not available.');
    }

    try {
      const result = await api('/api/guardians/student/' + student.id + '/fee-payment-link');
      if (!result?.payment_path) {
        throw new Error('Fee payment link could not be created.');
      }
      await Linking.openURL(API_BASE + result.payment_path);
    } catch (e: any) {
      Alert.alert('Fee Payment', e.message || 'Unable to open the fee payment page.');
    }
  };

  const openFeeReceipt = async () => {
    if (!student?.id) {
      return Alert.alert('Fee Receipt', 'Student information is not available.');
    }

    try {
      const result = await api('/api/guardians/student/' + student.id + '/fee-receipt-link');
      if (!result?.receipt_path) {
        throw new Error('Fee receipt link could not be created.');
      }
      await Linking.openURL(API_BASE + result.receipt_path);
    } catch (e: any) {
      Alert.alert('Fee Receipt', e.message || 'Unable to open the fee receipt page.');
    }
  };
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

      const [profileResult, childResult, depositResult] = await Promise.allSettled([
        api(`/api/guardians/student/${studentId}/profile`),
        api(`/api/guardians/student/${studentId}`),
        api(`/api/guardians/student/${studentId}/deposit-fund`),
      ]);

      setProfile(profileResult.status === 'fulfilled' ? profileResult.value : null);
      setChildData(childResult.status === 'fulfilled' ? childResult.value : null);
      setDepositData(depositResult.status === 'fulfilled' ? depositResult.value : null);

      const failed = [profileResult, childResult, depositResult].find(
        (result) => result.status === 'rejected'
      );
      if (failed?.status === 'rejected') {
        Alert.alert('Some information could not be loaded', failed.reason?.message || 'Please try again.');
      }

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
          confirm_password: confirmPassword,
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

  const openGuardianDocument = async (doc: any, download = false) => {
    if (Platform.OS !== 'web') {
      router.push({ pathname: '/guardian-student', params: { id: String(student.id) } } as any);
      return;
    }
    let opened: any = null;
    try {
      if (!download) opened = window.open('about:blank', '_blank');
      const token = await getToken();
      const endpoint = download ? doc.download_endpoint : doc.view_endpoint;
      if (!endpoint) throw new Error('Download is not allowed for this document.');
      const response = await fetch(API_BASE + endpoint, { headers: { Authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('Document could not be opened.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = window.document.createElement('a');
        link.href = url; link.download = doc.document_title || doc.document_type || 'document';
        window.document.body.appendChild(link); link.click(); link.remove();
      } else if (opened) opened.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error: any) {
      if (opened) opened.close();
      Alert.alert('Document', error.message || 'Document action failed.');
    }
  };

  const logout = async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch {}
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

  const s = { ...student, ...childData?.student, ...profile?.student };
  const netBalance = Number(depositData?.summary?.net_balance || 0);
  const notices = childData?.notices || [];
  const marks = childData?.marks || [];
  const documents = childData?.documents || [];
  const gatePasses = childData?.gate_passes || [];
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
          {!!s?.room_number && (
            <Text style={styles.studentMeta}>Room: {s.room_number}</Text>
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
        <Tab title="Gate Pass" active={tab === 'gatepass'} onPress={() => setTab('gatepass')} />
        <Tab title="Visiting Day Permission" active={tab === 'visits'} onPress={() => setTab('visits')} />
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
              notices.slice(0, 1).map((notice: any, index: number) => (
                <Card key={notice.id || index} tone="notice">
                  <Text style={styles.noticeTitle}>
                    {notice.title || notice.notice_title || 'Notice'}
                  </Text>

                  {!!(notice.notice_text || notice.message || notice.content || notice.description) && (
                    <Text style={styles.noticeText}>
                      {notice.notice_text || notice.message || notice.content || notice.description}
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


              <TouchableOpacity
                style={styles.primaryLink}
                onPress={openMonthlyFeePayment}
              >
                <Text style={styles.primaryLinkText}>Pay Monthly Fees</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={openFeeReceipt}
              >
                <Text style={styles.secondaryLinkText}>Download Fee Receipt</Text>
              </TouchableOpacity>
              <Button
                title={monthlyFeeLoading ? 'Checking...' : 'Refresh Monthly Due'}
                onPress={() => loadMonthlyFeeDue(student.id)}
              />

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
                {depositData
                  ? `${netBalance > 0 ? '+ ' : netBalance < 0 ? '- ' : ''}₹${Math.abs(netBalance).toFixed(2)}`
                  : 'তথ্য পাওয়া যায়নি'}
              </Text>

              <Text style={styles.fundStatus}>
                {!depositData ? 'Fund-এর তথ্য লোড করা যায়নি' : netBalance > 0
                  ? 'Fund-এ টাকা জমা আছে'
                  : netBalance < 0
                  ? 'Fund-এ Due / ঘাটতি আছে'
                  : 'Fund Balance Zero'}
              </Text>
            </View>

            <Text style={styles.subHeading}>Recent Transactions</Text>

            {!depositData?.transactions?.length ? (
              <Card>
                <Muted>{depositData ? 'No transaction yet.' : 'Transaction information unavailable.'}</Muted>
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
            <TouchableOpacity style={{backgroundColor:'#1764a5',padding:12,borderRadius:9,marginBottom:12}} onPress={()=>router.push('/class-results')}><Text style={{color:'#fff',fontWeight:'900',textAlign:'center'}}>View Full Class Results</Text></TouchableOpacity>

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
        {tab === 'gatepass' && (
          <>
            <Text style={styles.heading}>Gate Pass Records</Text>
            {gatePasses.length===0?<Card><Muted>No Gate Pass record found.</Muted></Card>:gatePasses.map((pass:any)=><Card key={pass.id} tone="notice"><View style={styles.gateHeader}><Text style={styles.noticeTitle}>{pass.token_no}</Text><Text style={[styles.gateStatus,pass.status==='returned'&&styles.gateReturned,pass.status==='cancelled'&&styles.gateCancelled]}>{pass.status==='draft'?'Ready to Print':pass.status==='pending'?'Outside / Return Pending':pass.status==='returned'?'Returned':'Cancelled'}</Text></View><Text style={styles.noticeText}>Reason: {pass.reason}</Text><Text style={styles.noticeText}>Departure: {pass.departure_text||String(pass.departure_at||'').slice(0,16).replace('T',' ')}</Text><Text style={styles.noticeText}>Expected Return: {pass.return_text||String(pass.expected_return_at||'').slice(0,16).replace('T',' ')||'-'}</Text>{pass.returned_at&&<Text style={styles.dateText}>Returned: {String(pass.returned_at).slice(0,16).replace('T',' ')}</Text>}</Card>)}
          </>
        )}

        {tab === 'visits' && (
          <>
            <Text style={styles.heading}>Visiting Day Permission</Text>
            {(notices.filter((n: any) => String(n.notice_type || '').toLowerCase() === 'visit').length === 0) ? (
              <Card tone="notice"><Muted>No visiting day permission notification.</Muted></Card>
            ) : notices.filter((n: any) => String(n.notice_type || '').toLowerCase() === 'visit').map((notice: any, index: number) => (
              <Card key={notice.id || index} tone="notice">
                <Text style={styles.noticeTitle}>{notice.title || 'Visit Permission Approved'}</Text>
                <Text style={styles.noticeText}>{notice.notice_text || notice.message || ''}</Text>
                <Text style={styles.dateText}>{String(notice.published_at || notice.created_at || '').slice(0, 16).replace('T', ' ')}</Text>
              </Card>
            ))}
          </>
        )}

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
                value={formatProfileDate(s.date_of_birth)}
              />
              <Info label="Gender" value={s.gender} />
              <Info label="Blood Group" value={s.blood_group} />
              <Info label="Mobile" value={s.mobile_number} />
              <Info label="WhatsApp" value={s.whatsapp_number} />
              <Info label="Email" value={s.email} />
              <Info label="Aadhaar No" value={s.aadhaar_no} />
              <Info label="Caste" value={s.caste_name} />
              <Info label="Disability" value={s.is_handicapped} />
              <Info label="Orphan" value={s.is_orphan} />
            </Card>

            <Text style={styles.subHeading}>Admission & Education</Text>
            <Card>
              <Info label="Admission Date" value={formatProfileDate(s.admission_date)} />
              <Info label="Session From" value={s.session_from} />
              <Info label="Session To" value={s.session_to} />
              <Info label="Student Type" value={s.student_type} />
              <Info label="Room Number" value={s.room_number} />
              <Info label="Monthly Fees" value={s.monthly_fees} />
              <Info label="School" value={s.admitted_school_name} />
              <Info label="Stream" value={s.stream} />
              <Info label="Previous Branch" value={s.previous_branch_name} />
              <Info label="Banglar Shiksha ID" value={s.banglarshiksha_id} />
              <Info label="Kanyashree ID" value={s.kanyashree_id} />
              <Info label="Aikyashree ID" value={s.aikyashree_id} />
            </Card>

            <Text style={styles.subHeading}>Father</Text>
            <Card>
              <Info label="Name" value={s.father_name} />
              <Info label="Mobile" value={s.father_mobile} />
              <Info label="Occupation" value={s.father_occupation} />
              <Info label="Qualification" value={s.father_qualification} />
              <Info label="Aadhaar No" value={s.father_aadhaar_no} />
              <Info label="Annual Income" value={s.father_annual_income} />
            </Card>

            <Text style={styles.subHeading}>Mother</Text>
            <Card>
              <Info label="Name" value={s.mother_name} />
              <Info label="Mobile" value={s.mother_mobile} />
              <Info label="Occupation" value={s.mother_occupation} />
              <Info label="Qualification" value={s.mother_qualification} />
              <Info label="Aadhaar No" value={s.mother_aadhaar_no} />
              <Info label="Annual Income" value={s.mother_annual_income} />
            </Card>

            <Text style={styles.subHeading}>Guardian & Contact</Text>
            <Card>
              <Info label="Guardian Name" value={s.guardian_name} />
              <Info label="Guardian Mobile" value={s.guardian_mobile} />
              <Info label="Alternate Mobile" value={s.alternate_mobile} />
            </Card>

            <Text style={styles.subHeading}>Present Address</Text>
            <Card>
              <Info label="Address" value={s.address} />
              <AddressDetails data={{
                village: s.present_village || s.village,
                post_office: s.present_post_office || s.post_office,
                police_station: s.present_police_station || s.police_station,
                district: s.present_district || s.district,
                pin_code: s.present_pin_code || s.pin_code,
                block: s.present_block,
                state: s.present_state,
              }} />
            </Card>

            <Text style={styles.subHeading}>Permanent Address</Text>
            <Card>
              <AddressDetails data={{
                village: s.permanent_village,
                post_office: s.permanent_post_office,
                police_station: s.permanent_police_station,
                district: s.permanent_district,
                pin_code: s.permanent_pin_code,
                block: s.permanent_block,
                state: s.permanent_state,
              }} />
            </Card>

            <Text style={styles.subHeading}>Bank Details</Text>
            <Card>
              <Info label="Account No" value={s.bank_account_no} />
              <Info label="Bank" value={s.bank_name} />
              <Info label="IFSC Code" value={s.bank_ifsc_code} />
              <Info label="Branch" value={s.bank_branch_name} />
              <Info label="Branch Address" value={s.bank_branch_address} />
            </Card>

            <Text style={styles.subHeading}>Visitor 1</Text>
            <Card>
              <Info label="Name" value={profile?.visitor1?.visitor_name} />
              <Info label="Relation" value={profile?.visitor1?.relation} />
              <Info label="Mobile" value={profile?.visitor1?.mobile_number} />
              <Info label="Email" value={profile?.visitor1?.email} />
              <AddressDetails data={profile?.visitor1} />
            </Card>

            <Text style={styles.subHeading}>Visitor 2</Text>
            <Card>
              <Info label="Name" value={profile?.visitor2?.visitor_name} />
              <Info label="Relation" value={profile?.visitor2?.relation} />
              <Info label="Mobile" value={profile?.visitor2?.mobile_number} />
              <Info label="Email" value={profile?.visitor2?.email} />
              <AddressDetails data={profile?.visitor2} />
            </Card>
          </>
        )}

        {/* DOCUMENTS */}
        {tab === 'documents' && (
          <>
            <Text style={styles.heading}>Documents</Text>

            {documents.length === 0 ? (
              <Card><Muted>No document available.</Muted></Card>
            ) : (
              <View style={styles.documentGrid}>
                {documents.map((doc: any, index: number) => {
                  const title = doc.document_title || doc.document_type || 'Document';
                  const preview = /^https?:\/\//i.test(String(doc.file_url || '')) ? String(doc.file_url) : '';
                  return <View key={doc.id || index} style={styles.documentCard}>
                    <Text style={styles.documentCardTitle}>{title.replace(/_/g, ' ')}</Text>
                    <View style={styles.documentPreview}>{preview ? <Image source={{uri: preview}} style={styles.documentPreviewImage} resizeMode="contain"/> : <Text style={styles.documentNoPreview}>Click View to open</Text>}</View>
                    <View style={styles.documentCardActions}>
                      <TouchableOpacity style={styles.documentEyeButton} onPress={() => openGuardianDocument(doc, false)}><Text style={styles.documentActionText}>View</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.documentPrintButton} onPress={() => openGuardianDocument(doc, false)}><Text style={styles.documentActionText}>Print</Text></TouchableOpacity>
                      {doc.guardian_download_allowed && <TouchableOpacity style={styles.documentDownloadButton} onPress={() => openGuardianDocument(doc, true)}><Text style={styles.documentActionText}>Download</Text></TouchableOpacity>}
                    </View>
                  </View>;
                })}
              </View>
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
                    placeholder="Re-enter New Password"
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

function formatProfileDate(value: unknown) {
  if (!value) return null;
  const date = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return date ? `${date[3]}-${date[2]}-${date[1]}` : String(value);
}

function AddressDetails({ data }: { data: any }) {
  return <>
    <Info label="Village" value={data?.village} />
    <Info label="Post Office" value={data?.post_office} />
    <Info label="Police Station" value={data?.police_station} />
    <Info label="Block" value={data?.block} />
    <Info label="District" value={data?.district} />
    <Info label="State" value={data?.state} />
    <Info label="PIN Code" value={data?.pin_code} />
  </>;
}

function Info({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return null;
  }

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>
        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
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
    marginBottom: 8,
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
    height: 62,
    minHeight: 62,
    maxHeight: 62,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#d9deea',
    zIndex: 2,
  },

  tabContent: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 8,
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

  documentGrid:{flexDirection:'row',flexWrap:'wrap',gap:14},documentCard:{width:210,borderWidth:1,borderColor:'#b8bec6',borderRadius:8,overflow:'hidden',backgroundColor:'#fff'},documentCardTitle:{textAlign:'center',fontSize:16,color:'#174f75',paddingVertical:7},documentPreview:{height:155,marginHorizontal:10,alignItems:'center',justifyContent:'center',backgroundColor:'#fafafa'},documentPreviewImage:{width:'100%',height:'100%'},documentNoPreview:{color:'#667085'},documentCardActions:{flexDirection:'row',justifyContent:'center',gap:10,padding:8,backgroundColor:'#d9d9d9'},documentEyeButton:{backgroundColor:'#1769e8',paddingHorizontal:13,paddingVertical:8,borderRadius:5},documentPrintButton:{backgroundColor:'#16834f',paddingHorizontal:13,paddingVertical:8,borderRadius:5},documentActionText:{color:'#fff',fontWeight:'800'},documentActions:{flexDirection:'row',gap:8,marginTop:10},documentViewButton:{backgroundColor:'#1764a5',paddingHorizontal:14,paddingVertical:9,borderRadius:7},documentDownloadButton:{backgroundColor:'#16814d',paddingHorizontal:14,paddingVertical:9,borderRadius:7},documentButtonText:{color:'#fff',fontWeight:'800'},
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
  gateHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},gateStatus:{backgroundColor:'#fff0b8',color:'#7c5200',fontWeight:'800',fontSize:11,paddingHorizontal:9,paddingVertical:5,borderRadius:12},gateReturned:{backgroundColor:'#dcfce7',color:'#166534'},gateCancelled:{backgroundColor:'#fee2e2',color:'#991b1b'},
    noticeCard: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  feesCard: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
});
