import React, { useEffect, useState, useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getUser, clearSession } from '../lib/auth';

const menuPermission: Record<string, string | string[]> = {
  // Student Management
  '/students': 'students',
  '/student-entry': 'students',
  '/student-registration-form': 'students',
  '/daily-attendance': 'attendance',
  '/id-cards': 'id_cards',
  '/documents': 'documents',
  '/student-lifecycle': 'student_lifecycle',
  '/student-transfer': 'student_transfer',
  '/kanyashree': 'kanyashree',
  '/behavior': 'behavior',
  '/gate-pass': 'gate_pass',
  '/visits': 'visits',
  '/guardians': 'guardians',

  // Staff Management
  '/teachers': 'teachers',
  '/teachers?mode=view': 'teachers',
  '/teachers?mode=add': 'teachers',
  '/teachers?mode=icard': 'teachers',
  '/staff-registration-form': 'teachers',
  '/teacher-attendance': 'teacher_attendance',
  '/staff-summary': 'staff_summary',
  '/teachers?action=gateman_sheet': 'teachers',
  '/service-staff': 'service_staff',
  '/gateman': 'gateman_panel',

  // Hostel Management
  '/hostel-menu': 'rooms',
  '/rooms': 'rooms',
  '/room-assignments': 'room_assignments',
  '/calling-schedule': ['rooms', 'students'],
  '/attendance': 'attendance',
  '/dining-stock': 'dining_stock',

  // Academic Management
  '/academy-menu': 'marks',
  '/marks': 'marks',
  '/omr-evaluation': 'omr_evaluation',
  '/terminal-exams': 'terminal_exams',
  '/class-results': ['published_results', 'class_results'],
  '/routines': 'routines',
  '/notices': 'notices',
  '/library': 'library_panel',
  '/illness': 'illness',
  '/problems': 'problems',

  // Accounts & Fees
  '/fees': ['fees', 'receipt_payment'],
  '/fees?tab=fees_collection': 'fees',
  '/fees?tab=receipt_payment': ['receipt_payment', 'fees'],
  '/due-fees': ['due_fees', 'fees'],
  '/bank-statement-matcher': ['bank_matcher', 'fees'],
  '/hostel-fees': ['fees', 'due_fees', 'hostel_fees'],
  '/daily-cashbook': ['fees', 'receipt_payment', 'daily_cashbook'],
  '/deposit-fund': 'deposit_fund',

  // Governance & System
  '/asset-register': 'asset_register',
  '/audit-log': 'audit_log',
  '/office': 'office_panel',
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
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            ...StyleSheet.flatten(style),
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

export default function TopInstitutionNav() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [restricted, setRestricted] = useState(false);

  // Modals
  const [studentMenu, setStudentMenu] = useState(false);
  const [teacherMenu, setTeacherMenu] = useState(false);
  const [hostelMenu, setHostelMenu] = useState(false);
  const [academyMenu, setAcademyMenu] = useState(false);
  const [accountsMenu, setAccountsMenu] = useState(false);
  const [allMenusDrawer, setAllMenusDrawer] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');

  useEffect(() => {
    void getUser<any>().then((u) => {
      setCurrentUser(u);
      const role = String(u?.role || '').toLowerCase();
      setUserRole(role);
      const isRestricted = !!u?.is_restricted_access && role !== 'super_admin';
      setRestricted(isRestricted);
      const perms = Array.isArray(u?.permissions) ? u.permissions : [];
      setPermissions(perms);
    });
  }, []);

  const canAccess = (path: string) => {
    if (userRole === 'super_admin') return true;
    if (path === '/system-admin') return false;
    if (!restricted) return true;
    let required = menuPermission[path];
    if (!required) {
      const base = path.split('?')[0];
      required = menuPermission[base];
    }
    if (!required) return true;
    if (Array.isArray(required)) {
      return required.some((req) => permissions.includes(req));
    }
    return permissions.includes(required);
  };

  const canAccessGroup = (paths: string[]) => paths.some((p) => canAccess(p));

  const navigateToPath = (path: string) => {
    if (!canAccess(path)) {
      const msg = 'Access Restricted: You do not have permission for this module.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Permission Denied', msg);
      }
      return;
    }
    if (path.includes('?')) {
      const [pathname, queryString] = path.split('?');
      const searchParams: Record<string, string> = {};
      const sp = new URLSearchParams(queryString);
      sp.forEach((val, key) => {
        searchParams[key] = val;
      });
      router.push({ pathname: pathname as any, params: searchParams });
    } else {
      router.push(path as any);
    }
  };

  const handleLogout = async () => {
    await clearSession();
    router.replace('/' as any);
  };

  return (
    <View style={s.topNavWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.topNavScroll}
      >
        <TouchableOpacity
          style={[s.navBtn, { backgroundColor: '#1e3a5f', borderColor: '#1e3a5f' }]}
          onPress={() => setAllMenusDrawer(true)}
        >
          <Text style={[s.navBtnText, { color: '#ffffff' }]}>☰ All Menus</Text>
        </TouchableOpacity>

        {canAccessGroup([
          '/students',
          '/student-entry',
          '/student-registration-form',
          '/daily-attendance',
          '/id-cards',
          '/documents',
          '/student-lifecycle',
          '/student-transfer',
          '/behavior',
          '/gate-pass',
          '/visits',
          '/guardians',
        ]) && (
          <TouchableOpacity style={s.navBtn} onPress={() => setStudentMenu(true)}>
            <Text style={s.navBtnIcon}>🎓</Text>
            <Text style={s.navBtnText}>Students ▾</Text>
          </TouchableOpacity>
        )}

        {canAccessGroup([
          '/teachers',
          '/teachers?mode=view',
          '/teachers?mode=add',
          '/teachers?mode=icard',
          '/staff-registration-form',
          '/teacher-attendance',
          '/staff-summary',
          '/teachers?action=gateman_sheet',
          '/service-staff',
          '/gateman',
        ]) && (
          <TouchableOpacity style={s.navBtn} onPress={() => setTeacherMenu(true)}>
            <Text style={s.navBtnIcon}>👥</Text>
            <Text style={s.navBtnText}>Staff ▾</Text>
          </TouchableOpacity>
        )}

        {canAccessGroup([
          '/hostel-menu',
          '/rooms',
          '/room-assignments',
          '/calling-schedule',
          '/attendance',
          '/dining-stock',
          '/asset-register',
        ]) && (
          <TouchableOpacity style={s.navBtn} onPress={() => setHostelMenu(true)}>
            <Text style={s.navBtnIcon}>🏢</Text>
            <Text style={s.navBtnText}>Hostel ▾</Text>
          </TouchableOpacity>
        )}

        {canAccessGroup([
          '/marks',
          '/omr-evaluation',
          '/terminal-exams',
          '/class-results',
          '/routines',
          '/notices',
          '/display-control',
          '/library',
          '/illness',
          '/problems',
        ]) && (
          <TouchableOpacity style={s.navBtn} onPress={() => setAcademyMenu(true)}>
            <Text style={s.navBtnIcon}>📚</Text>
            <Text style={s.navBtnText}>Academy ▾</Text>
          </TouchableOpacity>
        )}

        {canAccessGroup([
          '/fees',
          '/fees?tab=fees_collection',
          '/fees?tab=receipt_payment',
          '/due-fees',
          '/bank-statement-matcher',
          '/deposit-fund',
          '/daily-cashbook',
        ]) && (
          <TouchableOpacity style={s.navBtn} onPress={() => setAccountsMenu(true)}>
            <Text style={s.navBtnIcon}>💳</Text>
            <Text style={s.navBtnText}>Accounts ▾</Text>
          </TouchableOpacity>
        )}

        {canAccess('/audit-log') && (
          <TouchableOpacity style={s.navBtn} onPress={() => router.push('/audit-log' as any)}>
            <Text style={s.navBtnIcon}>📜</Text>
            <Text style={s.navBtnText}>Audit Log</Text>
          </TouchableOpacity>
        )}

        {userRole === 'super_admin' && (
          <TouchableOpacity
            style={[s.navBtn, s.navBtnAdmin]}
            onPress={() => router.push('/system-admin' as any)}
          >
            <Text style={s.navBtnIcon}>⚙️</Text>
            <Text style={[s.navBtnText, { color: '#b91c1c' }]}>System Admin</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[s.navBtn, s.navBtnLogout]} onPress={handleLogout}>
          <Text style={s.navBtnIcon}>🚪</Text>
          <Text style={[s.navBtnText, { color: '#b91c1c' }]}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Staff Menu Modal */}
      <Modal visible={teacherMenu} transparent animationType="fade" onRequestClose={() => setTeacherMenu(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTeacherMenu(false)} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Staff Management</Text>
              <TouchableOpacity onPress={() => setTeacherMenu(false)}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['View Staff', '/teachers?mode=view'],
                ['Add Staff', '/teachers?mode=add'],
                ['I-Card, Form & Download', '/teachers?mode=icard'],
                ['Staff Registration Form', '/staff-registration-form'],
                ['Staff Attendance', '/teacher-attendance'],
                ['Staff Summary', '/staff-summary'],
                ['Gateman Sheet (Excel)', '/teachers?action=gateman_sheet'],
                ['Gateman & Service Staff', '/service-staff'],
                ['Gateman Portal', '/gateman'],
              ].filter(([_, path]) => canAccess(path)).map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setTeacherMenu(false);
                    navigateToPath(path);
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
      <Modal visible={studentMenu} transparent animationType="fade" onRequestClose={() => setStudentMenu(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStudentMenu(false)} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Student Management</Text>
              <TouchableOpacity onPress={() => setStudentMenu(false)}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Student Details', '/students'],
                ['Student Entry', '/student-entry'],
                ['Student Registration Form', '/student-registration-form'],
                ['Daily Student Attendance', '/daily-attendance'],
                ['Student ID Cards & Form', '/id-cards'],
                ['Document Upload', '/documents'],
                ['Promotion / TC (Lifecycle)', '/student-lifecycle'],
                ['Excel & Bulk Documents', '/student-transfer'],
                ['Kanyashree Portal (K1/K2)', '/kanyashree'],
                ['Student Behavior', '/behavior'],
                ['Student Gate Pass', '/gate-pass'],
                ['Visit Permission', '/visits'],
                ['Guardians & Passwords', '/guardians'],
              ].filter(([_, path]) => canAccess(path)).map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setStudentMenu(false);
                    navigateToPath(path);
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
      <Modal visible={academyMenu} transparent animationType="fade" onRequestClose={() => setAcademyMenu(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAcademyMenu(false)} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Academic Management</Text>
              <TouchableOpacity onPress={() => setAcademyMenu(false)}>
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
                ['Projector Display Control', '/display-control'],
                ['Library Portal', '/library'],
                ['Student Behaviour', '/behavior'],
                ['Student Illness', '/illness'],
                ['Room Problems', '/problems'],
              ].filter(([_, path]) => canAccess(path)).map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setAcademyMenu(false);
                    navigateToPath(path);
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
      <Modal visible={hostelMenu} transparent animationType="fade" onRequestClose={() => setHostelMenu(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHostelMenu(false)} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Hostel Management</Text>
              <TouchableOpacity onPress={() => setHostelMenu(false)}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Rooms', '/rooms'],
                ['Teacher Room Assignment', '/room-assignments'],
                ['Calling Schedule', '/calling-schedule'],
                ['Evening Room Attendance', '/attendance'],
                ['Dining Stock Inventory', '/dining-stock'],
                ['Asset Register', '/asset-register'],
              ].filter(([_, path]) => canAccess(path)).map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setHostelMenu(false);
                    navigateToPath(path);
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
      <Modal visible={accountsMenu} transparent animationType="fade" onRequestClose={() => setAccountsMenu(false)}>
        <View style={s.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAccountsMenu(false)} />
          <View style={s.teacherModal}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Accounts & Fees</Text>
              <TouchableOpacity onPress={() => setAccountsMenu(false)}>
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalGrid}>
              {[
                ['Fee Collection', '/fees?tab=fees_collection'],
                ['Due Fees Tracker', '/due-fees'],
                ['Receipt & Payment', '/fees?tab=receipt_payment'],
                ['Bank Matcher', '/bank-statement-matcher'],
                ['Hostel Fees (Class-wise)', '/hostel-fees'],
                ['Daily Cash Book', '/daily-cashbook'],
                ['Student Deposit Fund', '/deposit-fund'],
              ].filter(([_, path]) => canAccess(path)).map(([label, path]) => (
                <AdminLink
                  path={path}
                  key={label}
                  style={s.modalItem}
                  onPress={() => {
                    setAccountsMenu(false);
                    navigateToPath(path);
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

      {/* All Menus Drawer Modal */}
      <Modal
        visible={allMenusDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAllMenusDrawer(false);
          setMenuSearchQuery('');
        }}
      >
        <View style={s.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setAllMenusDrawer(false);
              setMenuSearchQuery('');
            }}
          />
          <View style={[s.teacherModal, { maxWidth: 960, maxHeight: '90%' }]}>
            <View style={[s.modalHeader, { flexWrap: 'wrap', gap: 10, alignItems: 'center' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <Text style={s.modalTitle}>All Institution Menus & Portals</Text>
              </View>

              {/* Menu Search Box */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: Platform.OS === 'web' ? 5 : 2,
                  borderWidth: 1.5,
                  borderColor: '#cbd5e1',
                  minWidth: 260,
                  maxWidth: 380,
                  flex: 1,
                }}
              >
                <Text style={{ marginRight: 6, fontSize: 13, color: '#64748b' }}>🔍</Text>
                <TextInput
                  value={menuSearchQuery}
                  onChangeText={setMenuSearchQuery}
                  placeholder="Search menu or portal..."
                  placeholderTextColor="#94a3b8"
                  style={
                    {
                      flex: 1,
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#0f172a',
                      padding: 0,
                      ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
                    } as any
                  }
                />
                {menuSearchQuery.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setMenuSearchQuery('')} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 13, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  setAllMenusDrawer(false);
                  setMenuSearchQuery('');
                }}
                style={{ padding: 4 }}
              >
                <Text style={s.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, gap: 16 }}>
              {(() => {
                const q = menuSearchQuery.trim().toLowerCase();
                const allGroups = [
                  {
                    category: '🎓 Student Management',
                    items: [
                      ['Student Details', '/students'],
                      ['Student Entry', '/student-entry'],
                      ['Student Registration Form', '/student-registration-form'],
                      ['Daily Student Attendance', '/daily-attendance'],
                      ['Student ID Cards & Form', '/id-cards'],
                      ['Document Upload', '/documents'],
                      ['Promotion / TC (Lifecycle)', '/student-lifecycle'],
                      ['Excel & Bulk Documents', '/student-transfer'],
                      ['Kanyashree Portal (K1/K2)', '/kanyashree'],
                      ['Student Behavior', '/behavior'],
                      ['Student Gate Pass', '/gate-pass'],
                      ['Visit Permission', '/visits'],
                      ['Guardians & Passwords', '/guardians'],
                    ],
                  },
                  {
                    category: '👥 Staff & Administration',
                    items: [
                      ['View Staff', '/teachers?mode=view'],
                      ['Add Staff', '/teachers?mode=add'],
                      ['I-Card, Form & Download', '/teachers?mode=icard'],
                      ['Staff Registration Form', '/staff-registration-form'],
                      ['Staff Attendance', '/teacher-attendance'],
                      ['Staff Summary', '/staff-summary'],
                      ['Gateman Sheet (Excel)', '/teachers?action=gateman_sheet'],
                      ['Gateman & Service Staff', '/service-staff'],
                      ['Gateman Portal', '/gateman'],
                    ],
                  },
                  {
                    category: '📚 Academic & Examination',
                    items: [
                      ['Weekly Marks', '/marks'],
                      ['OMR Exam & Evaluation', '/omr-evaluation'],
                      ['Terminal Exam', '/terminal-exams'],
                      ['Print Terminal Result', '/class-results'],
                      ['Teacher Routine', '/routines'],
                      ['Notice Board', '/notices'],
                      ['Projector Display Control', '/display-control'],
                      ['Library Portal', '/library'],
                      ['Student Behaviour', '/behavior'],
                      ['Student Illness', '/illness'],
                      ['Room Problems', '/problems'],
                    ],
                  },
                  {
                    category: '🏢 Hostel & Mess',
                    items: [
                      ['Rooms List', '/rooms'],
                      ['Teacher Room Assignment', '/room-assignments'],
                      ['Calling Schedule', '/calling-schedule'],
                      ['Evening Room Attendance', '/attendance'],
                      ['Dining Stock Inventory', '/dining-stock'],
                      ['Asset Register', '/asset-register'],
                    ],
                  },
                  {
                    category: '💳 Accounts & Finance',
                    items: [
                      ['Fee Collection', '/fees?tab=fees_collection'],
                      ['Due Fees Tracker', '/due-fees'],
                      ['Receipt & Payment', '/fees?tab=receipt_payment'],
                      ['Bank Matcher', '/bank-statement-matcher'],
                      ['Hostel Fees (Class-wise)', '/hostel-fees'],
                      ['Daily Cash Book', '/daily-cashbook'],
                      ['Student Deposit Fund', '/deposit-fund'],
                    ],
                  },
                  {
                    category: '🚪 Gate Pass & Visitors',
                    items: [
                      ['Student Gate Pass', '/gate-pass'],
                      ['Visiting Day Record / Permission', '/visits'],
                      ['Guardians Directory', '/guardians'],
                    ],
                  },
                  {
                    category: '⚙️ Governance & System',
                    items: [
                      ['Asset Register', '/asset-register'],
                      ['Activity Audit Log', '/audit-log'],
                      ...(userRole === 'super_admin'
                        ? [['System Administration', '/system-admin'] as [string, string]]
                        : []),
                    ],
                  },
                ];

                const filtered = allGroups
                  .map((grp) => {
                    const visibleItems = grp.items.filter(([label, path]) => {
                      if (!canAccess(path)) return false;
                      if (!q) return true;
                      return (
                        label.toLowerCase().includes(q) ||
                        grp.category.toLowerCase().includes(q) ||
                        path.toLowerCase().includes(q)
                      );
                    });
                    return { ...grp, visibleItems };
                  })
                  .filter((grp) => grp.visibleItems.length > 0);

                if (filtered.length === 0 && q) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                      <Text style={{ fontSize: 32 }}>🔍</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#334155' }}>
                        No menus found matching "{menuSearchQuery}"
                      </Text>
                      <TouchableOpacity
                        onPress={() => setMenuSearchQuery('')}
                        style={{
                          marginTop: 8,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          backgroundColor: '#0f172a',
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>
                          Clear Search
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                return filtered.map((grp) => (
                  <View key={grp.category} style={{ gap: 8 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '800',
                        color: '#0f172a',
                        borderBottomWidth: 1,
                        borderBottomColor: '#e2e8f0',
                        paddingBottom: 4,
                      }}
                    >
                      {grp.category} {q ? `(${grp.visibleItems.length})` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {grp.visibleItems.map(([label, path]) => (
                        <AdminLink
                          path={path}
                          key={label}
                          style={[
                            s.modalItem,
                            { minWidth: 200, width: '31%', minHeight: 48, paddingVertical: 8 },
                          ]}
                          onPress={() => {
                            setAllMenusDrawer(false);
                            setMenuSearchQuery('');
                            navigateToPath(path);
                          }}
                        >
                          <Text style={s.arrow}>›</Text>
                          <Text style={[s.modalItemText, { fontSize: 13 }]}>{label}</Text>
                        </AdminLink>
                      ))}
                    </View>
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  topNavWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    zIndex: 100,
    marginBottom: 10,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  teacherModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 680,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  closeText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#64748b',
    paddingHorizontal: 8,
  },
  modalGrid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '48%',
    minWidth: 200,
    gap: 8,
  },
  arrow: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2563eb',
  },
  modalItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    flexShrink: 1,
  },
});
