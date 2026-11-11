import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { clearSession, getUser } from '../lib/auth';
import AcademyHeader from '../components/AcademyHeader';
import { api } from '../lib/api';

const menuPermission: Record<string, string> = {
  '/students': 'students',
  '/teachers': 'teachers',
  '/hostel-menu': 'rooms',
  '/academy-menu': 'marks',
  '/omr-evaluation': 'omr_evaluation',
  '/service-staff': 'service_staff',
  '/office': 'office_panel',
  '/library': 'library_panel',
  '/dining-stock': 'dining_stock',
  '/guardians': 'guardians',
  '/rooms': 'rooms',
  '/room-assignments': 'room_assignments',
  '/attendance': 'attendance',
  '/daily-attendance': 'attendance',
  '/behavior': 'behavior',
  '/asset-register': 'asset_register',
  '/gate-pass': 'gate_passes',
  '/visits': 'visits',
  '/student-lifecycle': 'student_lifecycle',
  '/illness': 'illness',
  '/marks': 'marks',
  '/terminal-exams': 'terminal_exams',
  '/class-results': 'published_results',
  '/problems': 'problems',
  '/routines': 'routines',
  '/notices': 'notices',
  '/deposit-fund': 'deposit_fund',
  '/fees': 'fees',
  '/due-fees': 'fees',
  '/bank-statement-matcher': 'fees',
  '/audit-log': 'audit_log',
};

function AdminLink({
  path,
  style,
  onPress,
  children,
}: {
  path: string;
  style: any;
  onPress: () => void;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'web') {
    return (
      <a
        href={path}
        onClick={(event: any) => {
          if (event.metaKey || event.ctrlKey || event.button === 1) return;
          event.preventDefault();
          onPress();
        }}
        style={
          {
            ...StyleSheet.flatten(style),
            display: 'flex',
            boxSizing: 'border-box',
            textDecorationLine: 'none',
            textDecoration: 'none',
            cursor: 'pointer',
          } as any
        }
      >
        {children}
      </a>
    );
  }
  return (
    <TouchableOpacity style={style} onPress={onPress}>
      {children}
    </TouchableOpacity>
  );
}

export default function Dashboard() {
  const { menu } = useLocalSearchParams<{ menu?: string }>();
  const [unread, setUnread] = useState(0);
  const [teacherMenu, setTeacherMenu] = useState(false);
  const [hostelMenu, setHostelMenu] = useState(false);
  const [academyMenu, setAcademyMenu] = useState(false);
  const [studentMenu, setStudentMenu] = useState(false);
  const [accountsMenu, setAccountsMenu] = useState(false);
  const [allMenusDrawer, setAllMenusDrawer] = useState(false);
  const [genericMenu, setGenericMenu] = useState<{ title: string; path: string } | null>(null);

  const [restricted, setRestricted] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('');
  const [dashboardName, setDashboardName] = useState('');
  const [currentDateTime, setCurrentDateTime] = useState('');

  // Institutional overview data
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [stats, setStats] = useState<any>({
    studentDemographics: [],
    staffDistribution: [],
    gatePassSummary: [],
    staffAttendance: [],
    missingStudentDocs: [],
    missingStaffDocs: [],
  });

  // Check which menus the user is allowed to access
  const canAccess = (path: string) => {
    if (userRole === 'super_admin') return true;
    if (path === '/system-admin') return false;
    if (!restricted) return true;
    const required = menuPermission[path];
    return !required || permissions.includes(required);
  };

  const canAccessGroup = (paths: string[]) => paths.some((p) => canAccess(p));

  const loadCounter = async () => {
    try {
      const d = await api('/api/notices/admin-counter');
      setUnread(d.unread || 0);
    } catch {}
  };

  const loadOverview = async () => {
    try {
      setOverviewLoading(true);
      const data = await api('/api/system-admin/dashboard-overview');
      if (data && data.success) {
        setStats(data);
      }
    } catch {
      // Graceful fallback to default demo numbers if offline or loading
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentDateTime(
        now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const clock = setInterval(updateTime, 60000);

    void getUser<any>().then((u) => {
      if (u) setDashboardName(String(u.full_name || u.name || u.login_id || '').trim());
    });
    void api('/api/me')
      .then((d) => {
        setRestricted(!!d.restricted);
        setPermissions(d.permissions || []);
        setUserRole(d.user?.role || '');
        setDashboardName(String(d.user?.full_name || d.user?.name || d.user?.login_id || '').trim());
      })
      .catch(() => {});

    void loadCounter();
    void loadOverview();

    const timer = setInterval(() => {
      void loadCounter();
      void loadOverview();
    }, 30000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (menu === 'staff' || menu === 'teachers') {
      setTeacherMenu(true);
    } else if (menu === 'students') {
      setStudentMenu(true);
    } else if (menu === 'hostel') {
      setHostelMenu(true);
    } else if (menu === 'academy') {
      setAcademyMenu(true);
    } else if (menu === 'accounts') {
      setAccountsMenu(true);
    }
  }, [menu]);

  const closeTeacherMenu = () => {
    setTeacherMenu(false);
    if (menu === 'staff' || menu === 'teachers') router.setParams({ menu: '' });
  };
  const closeStudentMenu = () => {
    setStudentMenu(false);
    if (menu === 'students') router.setParams({ menu: '' });
  };
  const closeHostelMenu = () => {
    setHostelMenu(false);
    if (menu === 'hostel') router.setParams({ menu: '' });
  };
  const closeAcademyMenu = () => {
    setAcademyMenu(false);
    if (menu === 'academy') router.setParams({ menu: '' });
  };
  const closeAccountsMenu = () => {
    setAccountsMenu(false);
    if (menu === 'accounts') router.setParams({ menu: '' });
  };

  const openNotifications = async () => {
    try {
      await api('/api/notices/read-all', { method: 'POST' });
      setUnread(0);
    } finally {
      router.push('/notices');
    }
  };

  const logout = async () => {
    await clearSession();
    router.replace('/');
  };

  // Demographics aggregates
  const demoList = stats.studentDemographics || [];
  const demoTotal = useMemo(() => {
    return demoList.reduce(
      (acc: any, row: any) => ({
        male: acc.male + Number(row.male || 0),
        female: acc.female + Number(row.female || 0),
        total: acc.total + Number(row.total || 0),
        orphan: acc.orphan + Number(row.orphan || 0),
        d_able: acc.d_able + Number(row.d_able || 0),
        general: acc.general + Number(row.general || 0),
        obc: acc.obc + Number(row.obc || 0),
        pass_out: acc.pass_out + Number(row.pass_out || 0),
        drop_out: acc.drop_out + Number(row.drop_out || 0),
      }),
      { male: 0, female: 0, total: 0, orphan: 0, d_able: 0, general: 0, obc: 0, pass_out: 0, drop_out: 0 }
    );
  }, [demoList]);

  // Staff Distribution aggregates
  const staffList = stats.staffDistribution || [];
  const staffTotal = useMemo(() => {
    return staffList.reduce(
      (acc: any, row: any) => ({
        male: acc.male + Number(row.male || 0),
        female: acc.female + Number(row.female || 0),
        total: acc.total + Number(row.total || 0),
      }),
      { male: 0, female: 0, total: 0 }
    );
  }, [staffList]);

  // Staff Attendance aggregates
  const attendanceList = stats.staffAttendance || [];
  const attendanceTotal = useMemo(() => {
    return attendanceList.reduce(
      (acc: any, row: any) => ({
        present: acc.present + Number(row.present || 0),
        absent: acc.absent + Number(row.absent || 0),
        leave: acc.leave + Number(row.leave || 0),
        total: acc.total + Number(row.total || 0),
      }),
      { present: 0, absent: 0, leave: 0, total: 0 }
    );
  }, [attendanceList]);

  // Gate Pass active count
  const gatePassList = stats.gatePassSummary || [];
  const gatePassActiveTotal = useMemo(() => {
    return gatePassList.reduce((acc: number, row: any) => acc + Number(row.active || 0), 0);
  }, [gatePassList]);

  return (
    <SafeAreaView style={s.page}>
      <AcademyHeader compact />

      {/* ============================================================== */}
      {/* TOP NAVIGATION BAR - MENUS AT THE VERY TOP                     */}
      {/* ============================================================== */}
      <View style={s.topNavWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.topNavScroll}
        >
          {canAccessGroup(['/students', '/daily-attendance', '/student-summary']) && (
            <TouchableOpacity style={s.navBtn} onPress={() => setStudentMenu(true)}>
              <Text style={s.navBtnIcon}>🎓</Text>
              <Text style={s.navBtnText}>Students ▾</Text>
            </TouchableOpacity>
          )}

          {canAccessGroup(['/teachers', '/teacher-attendance', '/staff-summary', '/service-staff']) && (
            <TouchableOpacity style={s.navBtn} onPress={() => setTeacherMenu(true)}>
              <Text style={s.navBtnIcon}>👥</Text>
              <Text style={s.navBtnText}>Staff ▾</Text>
            </TouchableOpacity>
          )}

          {canAccessGroup(['/hostel-menu', '/rooms', '/room-assignments', '/dining-stock']) && (
            <TouchableOpacity style={s.navBtn} onPress={() => setHostelMenu(true)}>
              <Text style={s.navBtnIcon}>🏢</Text>
              <Text style={s.navBtnText}>Hostel ▾</Text>
            </TouchableOpacity>
          )}

          {canAccessGroup(['/marks', '/omr-evaluation', '/terminal-exams', '/routines', '/notices']) && (
            <TouchableOpacity style={s.navBtn} onPress={() => setAcademyMenu(true)}>
              <Text style={s.navBtnIcon}>📚</Text>
              <Text style={s.navBtnText}>Academy ▾</Text>
            </TouchableOpacity>
          )}

          {canAccess('/gate-pass') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/gate-pass' as any)}>
              <Text style={s.navBtnIcon}>🎫</Text>
              <Text style={s.navBtnText}>Gate Pass</Text>
            </TouchableOpacity>
          )}

          {canAccessGroup(['/fees', '/due-fees', '/bank-statement-matcher', '/deposit-fund']) && (
            <TouchableOpacity style={s.navBtn} onPress={() => setAccountsMenu(true)}>
              <Text style={s.navBtnIcon}>💳</Text>
              <Text style={s.navBtnText}>Accounts ▾</Text>
            </TouchableOpacity>
          )}

          {canAccess('/guardians') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/guardians' as any)}>
              <Text style={s.navBtnIcon}>👨‍👩‍👧</Text>
              <Text style={s.navBtnText}>Guardians</Text>
            </TouchableOpacity>
          )}

          {canAccess('/visits') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/visits' as any)}>
              <Text style={s.navBtnIcon}>🤝</Text>
              <Text style={s.navBtnText}>Visiting Day</Text>
            </TouchableOpacity>
          )}

          {canAccess('/deposit-fund') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/deposit-fund' as any)}>
              <Text style={s.navBtnIcon}>💰</Text>
              <Text style={s.navBtnText}>Deposit Fund</Text>
            </TouchableOpacity>
          )}

          {canAccess('/asset-register') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/asset-register' as any)}>
              <Text style={s.navBtnIcon}>🏷️</Text>
              <Text style={s.navBtnText}>Asset Register</Text>
            </TouchableOpacity>
          )}

          {canAccess('/audit-log') && (
            <TouchableOpacity style={s.navBtn} onPress={() => router.push('/audit-log' as any)}>
              <Text style={s.navBtnIcon}>📜</Text>
              <Text style={s.navBtnText}>Audit Log</Text>
            </TouchableOpacity>
          )}

          {userRole === 'super_admin' && (
            <TouchableOpacity style={[s.navBtn, s.navBtnAdmin]} onPress={() => router.push('/system-admin' as any)}>
              <Text style={s.navBtnIcon}>⚙️</Text>
              <Text style={[s.navBtnText, { color: '#b91c1c' }]}>System Admin</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[s.navBtn, s.navBtnLogout]} onPress={logout}>
            <Text style={s.navBtnIcon}>🚪</Text>
            <Text style={[s.navBtnText, { color: '#b91c1c' }]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* ============================================================== */}
        {/* INSTITUTIONAL WELCOME BANNER (MATCHING IMAGE 2)               */}
        {/* ============================================================== */}
        <View style={s.welcomeBanner}>
          <View style={s.welcomeLeft}>
            <Text style={s.welcomeUser}>
              Welcome, {dashboardName || 'User'}
            </Text>
            <Text style={s.welcomeSubtitle}>
              Last Login / IST: {currentDateTime || 'Today'}
            </Text>
          </View>

          <View style={s.welcomeRight}>
            <TouchableOpacity
              onPress={() => router.push('/students' as any)}
              style={s.searchPill}
            >
              <Text style={s.searchPillText}>🔍 Student Search</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openNotifications} style={s.notificationPill}>
              <Text style={s.notificationPillText}>🔔 Notifications</Text>
              {unread > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {overviewLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color="#166534" />
            <Text style={s.loadingText}>Loading live institution records...</Text>
          </View>
        ) : (
          /* ============================================================== */
          /* TWO-COLUMN INSTITUTIONAL DASHBOARD GRID (MATCHING IMAGE 2)     */
          /* ============================================================== */
          <View style={s.dashboardGrid}>
            {/* ------------------------------------------------------------ */}
            {/* LEFT COLUMN: Student Demographics & Gate Pass                */}
            {/* ------------------------------------------------------------ */}
            <View style={s.gridColumn}>
              {/* Card 1: Student Demographics */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>👥</Text>
                    <Text style={s.panelTitle}>Student Demographics</Text>
                    <View style={s.sessionBadge}>
                      <Text style={s.sessionBadgeText}>Session 2026</Text>
                    </View>
                  </View>
                  <Text style={s.panelHeaderRight}>
                    Total Active: <Text style={s.boldNumber}>{demoTotal.total}</Text>
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={s.tableContainer}>
                    <View style={[s.tRow, s.tHeadRow]}>
                      <Text style={[s.tHeadCell, { width: 50 }]}>CLASS</Text>
                      <Text style={[s.tHeadCell, { width: 55 }]}>MALE</Text>
                      <Text style={[s.tHeadCell, { width: 65 }]}>FEMALE</Text>
                      <Text style={[s.tHeadCell, s.tHighlightHead, { width: 65 }]}>TOTAL</Text>
                      <Text style={[s.tHeadCell, { width: 65 }]}>ORPHAN</Text>
                      <Text style={[s.tHeadCell, { width: 65 }]}>D.ABLE</Text>
                      <Text style={[s.tHeadCell, { width: 75 }]}>GENERAL</Text>
                      <Text style={[s.tHeadCell, { width: 55 }]}>OBC</Text>
                      <Text style={[s.tHeadCell, { width: 75 }]}>PASS OUT</Text>
                      <Text style={[s.tHeadCell, { width: 75 }]}>DROP OUT</Text>
                    </View>

                    {demoList.length === 0 ? (
                      <View style={s.emptyRow}>
                        <Text style={s.emptyText}>No student demographic records</Text>
                      </View>
                    ) : (
                      demoList.map((row: any, i: number) => (
                        <View key={row.class_name + i} style={[s.tRow, i % 2 === 1 && s.tRowZebra]}>
                          <Text style={[s.tCell, s.tClassCell, { width: 50 }]}>{row.class_name}</Text>
                          <Text style={[s.tCell, { width: 55 }]}>{row.male}</Text>
                          <Text style={[s.tCell, { width: 65 }]}>{row.female}</Text>
                          <Text style={[s.tCell, s.tHighlightCell, { width: 65 }]}>{row.total}</Text>
                          <Text style={[s.tCell, { width: 65 }]}>{row.orphan}</Text>
                          <Text style={[s.tCell, { width: 65 }]}>{row.d_able}</Text>
                          <Text style={[s.tCell, { width: 75 }]}>{row.general}</Text>
                          <Text style={[s.tCell, { width: 55 }]}>{row.obc}</Text>
                          <Text style={[s.tCell, { width: 75 }]}>{row.pass_out}</Text>
                          <Text style={[s.tCell, { width: 75 }]}>{row.drop_out}</Text>
                        </View>
                      ))
                    )}

                    {/* Total Row */}
                    <View style={[s.tRow, s.tTotalRow]}>
                      <Text style={[s.tCell, s.tTotalLabel, { width: 50 }]}>Total</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 55 }]}>{demoTotal.male}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 65 }]}>{demoTotal.female}</Text>
                      <Text style={[s.tCell, s.tTotalValHighlight, { width: 65 }]}>{demoTotal.total}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 65 }]}>{demoTotal.orphan}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 65 }]}>{demoTotal.d_able}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 75 }]}>{demoTotal.general}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 55 }]}>{demoTotal.obc}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 75 }]}>{demoTotal.pass_out}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 75 }]}>{demoTotal.drop_out}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>

              {/* Card 2: Gate Pass */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>🎫</Text>
                    <Text style={s.panelTitle}>Gate Pass</Text>
                    <View style={[s.sessionBadge, { backgroundColor: '#fef3c7' }]}>
                      <Text style={[s.sessionBadgeText, { color: '#92400e' }]}>Session 2026</Text>
                    </View>
                  </View>
                  <Text style={s.panelHeaderRight}>
                    Active: <Text style={[s.boldNumber, { color: '#b45309' }]}>{gatePassActiveTotal}</Text>
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={s.tableContainer}>
                    <View style={[s.tRow, s.tHeadRow]}>
                      <Text style={[s.tHeadCell, { width: 70 }]}>CLASS</Text>
                      <Text style={[s.tHeadCell, { width: 100 }]}>ISSUED</Text>
                      <Text style={[s.tHeadCell, s.tHighlightHead, { width: 100 }]}>ACTIVE</Text>
                      <Text style={[s.tHeadCell, { width: 100 }]}>EXPIRED</Text>
                    </View>

                    {gatePassList.length === 0 ? (
                      <View style={s.emptyRow}>
                        <Text style={s.emptyText}>No gate passes recorded</Text>
                      </View>
                    ) : (
                      gatePassList.map((row: any, i: number) => (
                        <View key={row.class_name + i} style={[s.tRow, i % 2 === 1 && s.tRowZebra]}>
                          <Text style={[s.tCell, s.tClassCell, { width: 70 }]}>{row.class_name}</Text>
                          <Text style={[s.tCell, { width: 100 }]}>{row.issued}</Text>
                          <Text style={[s.tCell, s.tHighlightCell, { width: 100, color: row.active > 0 ? '#b45309' : '#475569' }]}>
                            {row.active}
                          </Text>
                          <Text style={[s.tCell, { width: 100 }]}>{row.expired}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* Card 3: Student Documents Required */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>📁</Text>
                    <Text style={s.panelTitle}>Student Documents Required</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/students' as any)}>
                    <Text style={s.viewAllLink}>View All ›</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.docList}>
                  {(stats.missingStudentDocs || []).length === 0 ? (
                    <Text style={s.allClearText}>✓ All student documents are complete</Text>
                  ) : (
                    (stats.missingStudentDocs || []).slice(0, 5).map((st: any) => (
                      <View key={st.id} style={s.docItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.docItemName}>
                            #{st.registration_no} - {st.student_name} ({st.class_name})
                          </Text>
                          <View style={s.missingPillContainer}>
                            {(st.missing || []).map((m: string) => (
                              <View key={m} style={s.missingPill}>
                                <Text style={s.missingPillText}>{m}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={s.docActionBtn}
                          onPress={() => router.push('/students' as any)}
                        >
                          <Text style={s.docActionBtnText}>Upload</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>

            {/* ------------------------------------------------------------ */}
            {/* RIGHT COLUMN: Staff Distribution & Staff Attendance          */}
            {/* ------------------------------------------------------------ */}
            <View style={s.gridColumn}>
              {/* Card 4: Staff Distribution */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>📊</Text>
                    <Text style={s.panelTitle}>Staff Distribution</Text>
                  </View>
                  <Text style={s.panelHeaderRight}>
                    Total: <Text style={s.boldNumber}>{staffTotal.total}</Text>
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={s.tableContainer}>
                    <View style={[s.tRow, s.tHeadRow]}>
                      <Text style={[s.tHeadCell, s.tLeftCell, { width: 170 }]}>STAFF ROLE</Text>
                      <Text style={[s.tHeadCell, { width: 70 }]}>MALE</Text>
                      <Text style={[s.tHeadCell, { width: 70 }]}>FEMALE</Text>
                      <Text style={[s.tHeadCell, s.tHighlightHead, { width: 70 }]}>TOTAL</Text>
                    </View>

                    {staffList.length === 0 ? (
                      <View style={s.emptyRow}>
                        <Text style={s.emptyText}>No staff records</Text>
                      </View>
                    ) : (
                      staffList.map((row: any, i: number) => (
                        <View key={row.role + i} style={[s.tRow, i % 2 === 1 && s.tRowZebra]}>
                          <Text style={[s.tCell, s.tLeftCell, s.tRoleCell, { width: 170 }]}>{row.role}</Text>
                          <Text style={[s.tCell, { width: 70 }]}>{row.male}</Text>
                          <Text style={[s.tCell, { width: 70 }]}>{row.female}</Text>
                          <Text style={[s.tCell, s.tHighlightCell, { width: 70 }]}>{row.total}</Text>
                        </View>
                      ))
                    )}

                    {/* Total Row */}
                    <View style={[s.tRow, s.tTotalRow]}>
                      <Text style={[s.tCell, s.tLeftCell, s.tTotalLabel, { width: 170 }]}>Total</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 70 }]}>{staffTotal.male}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 70 }]}>{staffTotal.female}</Text>
                      <Text style={[s.tCell, s.tTotalValHighlight, { width: 70 }]}>{staffTotal.total}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>

              {/* Card 5: Staff Attendance */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>📝</Text>
                    <Text style={s.panelTitle}>Staff Attendance</Text>
                    <View style={[s.sessionBadge, { backgroundColor: '#e0e7ff' }]}>
                      <Text style={[s.sessionBadgeText, { color: '#3730a3' }]}>
                        {stats.today ? stats.today.split('-').reverse().join('/') : 'Today'}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.panelHeaderRight}>
                    Total: <Text style={s.boldNumber}>{attendanceTotal.total}</Text>
                  </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                  <View style={s.tableContainer}>
                    <View style={[s.tRow, s.tHeadRow]}>
                      <Text style={[s.tHeadCell, s.tLeftCell, { width: 150 }]}>ROLE</Text>
                      <Text style={[s.tHeadCell, { width: 70 }]}>PRESENT</Text>
                      <Text style={[s.tHeadCell, { width: 70 }]}>ABSENT</Text>
                      <Text style={[s.tHeadCell, { width: 60 }]}>LEAVE</Text>
                      <Text style={[s.tHeadCell, s.tHighlightHead, { width: 70 }]}>TOTAL</Text>
                    </View>

                    {attendanceList.length === 0 ? (
                      <View style={s.emptyRow}>
                        <Text style={s.emptyText}>No staff attendance records today</Text>
                      </View>
                    ) : (
                      attendanceList.map((row: any, i: number) => (
                        <View key={row.role + i} style={[s.tRow, i % 2 === 1 && s.tRowZebra]}>
                          <Text style={[s.tCell, s.tLeftCell, s.tRoleCell, { width: 150 }]}>{row.role}</Text>
                          <Text style={[s.tCell, { width: 70, color: '#15803d', fontWeight: '700' }]}>{row.present}</Text>
                          <Text style={[s.tCell, { width: 70, color: row.absent > 0 ? '#b91c1c' : '#64748b' }]}>{row.absent}</Text>
                          <Text style={[s.tCell, { width: 60 }]}>{row.leave}</Text>
                          <Text style={[s.tCell, s.tHighlightCell, { width: 70 }]}>{row.total}</Text>
                        </View>
                      ))
                    )}

                    {/* Total Row */}
                    <View style={[s.tRow, s.tTotalRow]}>
                      <Text style={[s.tCell, s.tLeftCell, s.tTotalLabel, { width: 150 }]}>Total</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 70, color: '#15803d' }]}>{attendanceTotal.present}</Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 70, color: attendanceTotal.absent > 0 ? '#b91c1c' : '#1e293b' }]}>
                        {attendanceTotal.absent}
                      </Text>
                      <Text style={[s.tCell, s.tTotalVal, { width: 60 }]}>{attendanceTotal.leave}</Text>
                      <Text style={[s.tCell, s.tTotalValHighlight, { width: 70 }]}>{attendanceTotal.total}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>

              {/* Card 6: Staff Documents Required */}
              <View style={s.panelCard}>
                <View style={s.panelHeader}>
                  <View style={s.panelHeaderLeft}>
                    <Text style={s.panelHeaderIcon}>📁</Text>
                    <Text style={s.panelTitle}>Staff Documents Required</Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/teachers?mode=view' as any)}>
                    <Text style={s.viewAllLink}>View All ›</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.docList}>
                  {(stats.missingStaffDocs || []).length === 0 ? (
                    <Text style={s.allClearText}>✓ All staff profiles and documents are complete</Text>
                  ) : (
                    (stats.missingStaffDocs || []).slice(0, 5).map((st: any) => (
                      <View key={st.id} style={s.docItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.docItemName}>
                            #{st.staff_id} - {st.name} ({st.designation || 'Staff'})
                          </Text>
                          <View style={s.missingPillContainer}>
                            {(st.missing || []).map((m: string) => (
                              <View key={m} style={[s.missingPill, { backgroundColor: '#fee2e2' }]}>
                                <Text style={[s.missingPillText, { color: '#991b1b' }]}>{m}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={s.docActionBtn}
                          onPress={() => router.push('/teachers?mode=view' as any)}
                        >
                          <Text style={s.docActionBtnText}>Upload</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ============================================================== */}
      {/* MODALS FOR CATEGORIZED TOP MENUS                               */}
      {/* ============================================================== */}

      {/* Staff Menu Modal */}
      <Modal visible={teacherMenu} transparent animationType="fade" onRequestClose={closeTeacherMenu}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTeacherMenu} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Staff Management</Text>
              <TouchableOpacity onPress={closeTeacherMenu}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['View Staff', '/teachers?mode=view'],
                ['Add Staff', '/teachers?mode=add'],
                ['I-Card & Form', '/teachers?mode=icard'],
                ['Staff Attendance', '/teacher-attendance'],
                ['Staff Summary', '/staff-summary'],
                ['Gateman Sheet (Excel)', '/teachers?action=gateman_sheet'],
                ['Gateman & Service Staff', '/service-staff'],
              ].map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setTeacherMenu(false);
                    router.push(path as any);
                  }}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={s.modalItemText}>{label}</Text>
                </AdminLink>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Students Menu Modal */}
      <Modal visible={studentMenu} transparent animationType="fade" onRequestClose={closeStudentMenu}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeStudentMenu} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Student Management</Text>
              <TouchableOpacity onPress={closeStudentMenu}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Student Details', '/students'],
                ['Daily Student Attendance', '/daily-attendance'],
                ['Student Summary', '/student-summary'],
                ['Student Transfer', '/student-transfer'],
                ['Student Lifecycle', '/student-lifecycle'],
              ].map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setStudentMenu(false);
                    router.push(path as any);
                  }}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={s.modalItemText}>{label}</Text>
                </AdminLink>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Academy Menu Modal */}
      <Modal visible={academyMenu} transparent animationType="fade" onRequestClose={closeAcademyMenu}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAcademyMenu} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Academic Management</Text>
              <TouchableOpacity onPress={closeAcademyMenu}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Weekly Marks', '/marks'],
                ['OMR Exam & Evaluation', '/omr-evaluation'],
                ['Terminal Exam', '/terminal-exams'],
                ['Print Terminal Result', '/class-results'],
                ['Teacher Routine', '/routines'],
                ['Notice Board', '/notices'],
                ['Library Portal', '/library'],
                ['Student Behaviour', '/behavior'],
                ['Student Illness', '/illness'],
                ['Room Problems', '/problems'],
              ].map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setAcademyMenu(false);
                    router.push(path as any);
                  }}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={s.modalItemText}>{label}</Text>
                </AdminLink>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Hostel Menu Modal */}
      <Modal visible={hostelMenu} transparent animationType="fade" onRequestClose={closeHostelMenu}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeHostelMenu} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Hostel Management</Text>
              <TouchableOpacity onPress={closeHostelMenu}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Rooms', '/rooms'],
                ['Teacher Room Assignment', '/room-assignments'],
                ['Evening Room Attendance', '/attendance'],
                ['Dining Stock Inventory', '/dining-stock'],
              ].map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setHostelMenu(false);
                    router.push(path as any);
                  }}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={s.modalItemText}>{label}</Text>
                </AdminLink>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Accounts Menu Modal */}
      <Modal visible={accountsMenu} transparent animationType="fade" onRequestClose={closeAccountsMenu}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAccountsMenu} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Accounts & Fees</Text>
              <TouchableOpacity onPress={closeAccountsMenu}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Fee Collection', '/fees?tab=fees_collection'],
                ['Due Fees', '/due-fees'],
                ['Receipt & Payment', '/fees?tab=receipt_payment'],
                ['Bank Matcher', '/bank-statement-matcher'],
                ['Student Deposit Fund', '/deposit-fund'],
                ['Deposit Fund Report', '/deposit-fund-report'],
              ].map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setAccountsMenu(false);
                    router.push(path as any);
                  }}
                >
                  <Text style={s.arrow}>›</Text>
                  <Text style={s.modalItemText}>{label}</Text>
                </AdminLink>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 36,
    maxWidth: 1440,
    width: '100%',
    alignSelf: 'center',
  },

  // ==========================================
  // TOP NAVIGATION BAR (MENUS AT THE VERY TOP)
  // ==========================================
  topNavWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  topNavScroll: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  navBtnAdmin: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  navBtnLogout: {
    backgroundColor: '#fff1f2',
    borderColor: '#ffe4e6',
  },
  navBtnIcon: {
    fontSize: 14,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },

  // ==========================================
  // INSTITUTIONAL WELCOME BANNER (IMAGE 2)
  // ==========================================
  welcomeBanner: {
    backgroundColor: '#3c7365', // Deep academic teal matching Image 2
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  welcomeLeft: {
    flex: 1,
    minWidth: 220,
  },
  welcomeUser: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  welcomeSubtitle: {
    color: '#d1fae5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  welcomeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  searchPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  searchPillText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  notificationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  notificationPillText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  badge: {
    marginLeft: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },

  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },

  // ==========================================
  // DASHBOARD GRID (2 COLUMNS ON DESKTOP)
  // ==========================================
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  gridColumn: {
    flex: 1,
    minWidth: 320,
    gap: 14,
  },

  // ==========================================
  // PANEL CARDS & TABLES
  // ==========================================
  panelCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  panelHeader: {
    backgroundColor: '#f8fafc',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  panelHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelHeaderIcon: {
    fontSize: 15,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
  },
  sessionBadge: {
    backgroundColor: '#dbeafe',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
  },
  sessionBadgeText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '800',
  },
  panelHeaderRight: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  boldNumber: {
    fontWeight: '900',
    color: '#0f172a',
  },

  // Tables
  tableContainer: {
    width: '100%',
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    minHeight: 30,
    alignItems: 'center',
  },
  tRowZebra: {
    backgroundColor: '#fafafa',
  },
  tHeadRow: {
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  tHeadCell: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  tHighlightHead: {
    backgroundColor: '#bbf7d0', // Light green
    color: '#14532d',
  },
  tCell: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 12,
    color: '#1e293b',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#f1f5f9',
  },
  tClassCell: {
    fontWeight: '800',
    color: '#0f172a',
  },
  tRoleCell: {
    fontWeight: '600',
    color: '#1e293b',
  },
  tLeftCell: {
    textAlign: 'left',
  },
  tHighlightCell: {
    backgroundColor: '#dcfce7',
    fontWeight: '800',
    color: '#166534',
  },
  tTotalRow: {
    backgroundColor: '#86efac', // Soft green matching total row of Image 2
    borderBottomWidth: 0,
  },
  tTotalLabel: {
    fontWeight: '900',
    color: '#14532d',
    fontSize: 12,
  },
  tTotalVal: {
    fontWeight: '800',
    color: '#14532d',
    fontSize: 12,
  },
  tTotalValHighlight: {
    fontWeight: '900',
    color: '#14532d',
    fontSize: 12,
    backgroundColor: '#4ade80',
  },
  emptyRow: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
  },

  // Documents list
  docList: {
    padding: 10,
    gap: 8,
  },
  allClearText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
    padding: 8,
  },
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  docItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  missingPillContainer: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  missingPill: {
    backgroundColor: '#fef3c7',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  missingPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400e',
  },
  docActionBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  docActionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  viewAllLink: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '800',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  teacherModal: {
    width: '100%',
    maxWidth: 780,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    backgroundColor: '#11101d',
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  closeText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
  },
  modalGrid: {
    padding: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalItem: {
    width: '48%',
    minWidth: 230,
    minHeight: 60,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  arrow: {
    color: '#0284c7',
    fontSize: 22,
    fontWeight: '900',
  },
  modalItemText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
});
