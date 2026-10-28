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

const DEFAULT_GATEMAN_PHOTO_URL = 'https://res.cloudinary.com/dftzjdhb/image/upload/v1793159487/staff/aparna_mondal.jpg';

const cleanPhotoUrl = (url?: string | null) => {
  if (!url) return DEFAULT_GATEMAN_PHOTO_URL;
  let finalUrl = url;
  if (/^https?:/.test(finalUrl)) {
    return finalUrl.replace(/\.webp$/i, '.jpg');
  }
  const clean = finalUrl.startsWith('/') ? finalUrl : `/${finalUrl}`;
  return `${API_BASE || ''}${clean}`.replace(/\.webp$/i, '.jpg');
};

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
  compact?: boolean;
  hideDefaultActions?: boolean;
  profilePhoto?: string;
};

function HeaderLink({ path, style, onPress, children }: { path: string; style: any; onPress: () => void; children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <a href={path} onClick={(event) => { event.preventDefault(); onPress(); }} style={{ ...StyleSheet.flatten(style), textDecorationLine: 'none', textDecoration: 'none' } as any}>{children}</a>;
  }
  return <TouchableOpacity style={style} onPress={onPress}>{children}</TouchableOpacity>;
}

export default function AcademyHeader({
  extraActions,
  fixed = false,
  compact = false,
  hideDefaultActions = false,
  profilePhoto,
}: HeaderProps = {}) {
  const [user, setUser] = useState<any>(null);
  const [headerPhoto, setHeaderPhoto] = useState(profilePhoto ? cleanPhotoUrl(profilePhoto) : '');

  useEffect(() => {
    void getUser<any>().then(async currentUser => {
      setUser(currentUser);
      if (profilePhoto) {
        setHeaderPhoto(cleanPhotoUrl(profilePhoto));
        return;
      }
      if (currentUser?.photo_url) {
        setHeaderPhoto(cleanPhotoUrl(currentUser.photo_url));
        return;
      }
      if (currentUser?.role === 'teacher') {
        try {
          const response = await api('/api/teachers/me');
          const photo = response?.teacher?.photo_url || '';
          setHeaderPhoto(photo ? cleanPhotoUrl(photo) : '');
        } catch {
          setHeaderPhoto('');
        }
      } else if (currentUser?.role === 'gateman') {
        try {
          const response = await api('/api/service-panels/staff/me');
          const photo = response?.staff?.photo_url || '';
          if (photo) {
            setHeaderPhoto(cleanPhotoUrl(photo));
          } else {
            setHeaderPhoto(DEFAULT_GATEMAN_PHOTO_URL);
          }
        } catch {
          setHeaderPhoto(DEFAULT_GATEMAN_PHOTO_URL);
        }
      }
    });
  }, [profilePhoto]);

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  const showTeacherActions = isTeacher(user);
  const gatemanDisplayName = user?.full_name && !user.full_name.startsWith('Gateman') ? user.full_name : 'Aparna Mondal';

  return (
    <View style={[styles.header, compact && styles.compactHeader, fixed && styles.fixedHeader]}>
      <View style={[styles.brandRow, compact && styles.compactBrandRow]}>
        <Image
          source={require('../../assets/images/al-ameen-logo.jpg')}
          resizeMode="contain"
          accessibilityLabel="Al-Ameen Mission Academy Memari logo"
          style={[styles.logo, compact && styles.compactLogo]}
        />
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.name}>Al-Ameen Mission Academy Memari</Text>
          {user?.role === 'gateman' ? (
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857', marginTop: 1 }}>
              👮 Gate Duty: {gatemanDisplayName}
            </Text>
          ) : null}
        </View>
        {user?.role === 'gateman' || headerPhoto ? (
          <Image
            source={{ uri: (headerPhoto && headerPhoto !== 'local_gateman') ? headerPhoto : DEFAULT_GATEMAN_PHOTO_URL }}
            resizeMode="cover"
            accessibilityLabel="Gateman profile photo"
            style={[styles.teacherPhoto, { borderColor: '#059669' }]}
          />
        ) : null}
      </View>

      {user ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.actions, compact && styles.compactActions]}
          contentContainerStyle={styles.actionsContent}
        >
          <HeaderLink path={homeFor(user.role)} style={styles.home} onPress={() => router.push(homeFor(user.role) as any)}>
            <Text style={styles.actionText}>Home</Text>
          </HeaderLink>

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
              <HeaderLink path="/settings" style={styles.settings} onPress={() => router.push('/settings')}>
                <Text style={styles.actionText}>Settings</Text>
              </HeaderLink>
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
    minWidth: 320,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    zIndex: 100,
    elevation: 4,
    ...Platform.select({
      web: { position: 'sticky' as any, top: 0, boxShadow: '0 2px 8px rgba(15,23,42,0.08)' },
      default: {},
    }),
  },
  compactHeader: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 6,
    marginBottom: 6,
  },
  fixedHeader: {
    ...Platform.select({
      web: { position: 'fixed' as any, top: 0, left: 0, right: 0, zIndex: 1000 },
      default: {},
    }),
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  compactBrandRow: { flex: 1, minWidth: 0 },
  teacherPhoto: { width: 38, height: 38, flexShrink: 0, borderRadius: 19, borderWidth: 2, borderColor: '#17643f', marginLeft: 'auto', marginRight: 10 },
  logo: { width: 42, height: 44 },
  compactLogo: { width: 34, height: 36 },
  name: { color: '#166534', fontSize: 17, fontWeight: '800', flexShrink: 1 },
  actions: { flexGrow: 0, flexShrink: 0, marginLeft: 'auto' },
  compactActions: { width: 'auto', flexGrow: 0, marginLeft: 'auto' },
  actionsContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notice: { backgroundColor: '#783453', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  profile: { backgroundColor: '#17643f', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  home: { backgroundColor: '#1768c5', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  exam: { backgroundColor: '#2369b3', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  room: { backgroundColor: '#c56a14', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  more: { backgroundColor: '#475569', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  attendance: { backgroundColor: '#157347', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  gatePass: { backgroundColor: '#174f75', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  settings: { backgroundColor: '#6840a5', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  logout: { backgroundColor: '#b52d3a', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});

