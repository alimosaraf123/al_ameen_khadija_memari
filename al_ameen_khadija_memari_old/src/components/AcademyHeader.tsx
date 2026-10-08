import React, { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { clearSession, getUser } from '../lib/auth';
import { api, API_BASE } from '../lib/api';

const homeFor = (role: string) =>
  role === 'guardian' ? '/guardian' :
  role === 'teacher' ? '/teacher' :
  role === 'gateman' ? '/gateman' :
  role === 'office' ? '/office' :
  role === 'library' ? '/library' : '/superadmin';

const isTeacher = (user: any) =>
  [user?.role, user?.staff_role, user?.user_role, user?.user?.role, user?.data?.role]
    .some(value => String(value || '').trim().toLowerCase() === 'teacher');

type HeaderProps = {
  extraActions?: React.ReactNode;
  fixed?: boolean;
  hideDefaultActions?: boolean;
  profilePhoto?: string;
};

export default function AcademyHeader({
  extraActions,
  fixed = false,
  hideDefaultActions = false,
  profilePhoto,
}: HeaderProps = {}) {
  const [user, setUser] = useState<any>(null);
  const [headerPhoto, setHeaderPhoto] = useState(profilePhoto || '');

  useEffect(() => {
    void getUser<any>().then(async currentUser => {
      setUser(currentUser);
      if (currentUser?.role === 'teacher' && !profilePhoto) {
        try {
          const response = await api('/api/teachers/me');
          const photo = response?.teacher?.photo_url || '';
          setHeaderPhoto(photo ? (/^https?:/.test(photo) ? photo : API_BASE + photo) : '');
        } catch {
          setHeaderPhoto('');
        }
      }
    });
  }, [profilePhoto]);

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  const showTeacherActions = isTeacher(user);

  return (
    <View style={[styles.header, fixed && styles.fixedHeader]}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../assets/images/al-ameen-logo.jpg')}
          resizeMode="contain"
          accessibilityLabel="Al-Ameen Mission Academy Memari logo"
          style={styles.logo}
        />
        <Text style={styles.name}>Al-Ameen Mission Academy Memari</Text>
        {headerPhoto ? (
          <Image
            source={{ uri: headerPhoto }}
            resizeMode="cover"
            accessibilityLabel="Teacher profile photo"
            style={styles.teacherPhoto}
          />
        ) : null}
      </View>

      {user ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.actions}
          contentContainerStyle={styles.actionsContent}
        >
          <TouchableOpacity style={styles.home} onPress={() => router.push(homeFor(user.role) as any)}>
            <Text style={styles.actionText}>Home</Text>
          </TouchableOpacity>

          {extraActions}

          {!extraActions && showTeacherActions ? (
            <>
              <TouchableOpacity style={styles.attendance} onPress={() => router.push('/attendance')}>
                <Text style={styles.actionText}>Atte.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exam} onPress={() => router.push('/marks')}>
                <Text style={styles.actionText}>Exam</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.room} onPress={() => router.push('/problems')}>
                <Text style={styles.actionText}>Room</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.more} onPress={() => router.push('/teacher?openMore=1')}>
                <Text style={styles.actionText}>More...</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {!hideDefaultActions && user.role === 'office' ? (
            <TouchableOpacity style={styles.gatePass} onPress={() => router.push('/gate-pass')}>
              <Text style={styles.actionText}>Gate Pass</Text>
            </TouchableOpacity>
          ) : null}

          {!hideDefaultActions && !showTeacherActions ? (
            <>
              <TouchableOpacity style={styles.settings} onPress={() => router.push('/settings')}>
                <Text style={styles.actionText}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logout} onPress={logout}>
                <Text style={styles.actionText}>Logout</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    minWidth: 360,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 14,
    zIndex: 100,
    elevation: 8,
    ...Platform.select({
      web: { position: 'sticky' as any, top: 0, boxShadow: '0 4px 12px rgba(15,23,42,0.12)' },
      default: {},
    }),
  },
  fixedHeader: {
    ...Platform.select({
      web: { position: 'fixed' as any, top: 0, left: 0, right: 0, zIndex: 1000 },
      default: {},
    }),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teacherPhoto: { width: 48, height: 48, flexShrink: 0, borderRadius: 24, borderWidth: 2, borderColor: '#17643f', marginLeft: 'auto', marginRight: 20 },
  logo: { width: 58, height: 60 },
  name: { width: 180, flexGrow: 1, flexShrink: 1, minWidth: 0, color: '#166534', fontSize: 19, fontWeight: '800' },
  actions: { width: '100%', minWidth: 0, marginLeft: 0 },
  actionsContent: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  notice: { backgroundColor: '#783453', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  profile: { backgroundColor: '#17643f', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  home: { backgroundColor: '#1768c5', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  exam: { backgroundColor: '#2369b3', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  room: { backgroundColor: '#c56a14', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  more: { backgroundColor: '#475569', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  attendance: { backgroundColor: '#157347', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  gatePass: { backgroundColor: '#174f75', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  settings: { backgroundColor: '#6840a5', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  logout: { backgroundColor: '#b52d3a', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 7 },
  actionText: { color: '#fff', fontWeight: '800' },
});

