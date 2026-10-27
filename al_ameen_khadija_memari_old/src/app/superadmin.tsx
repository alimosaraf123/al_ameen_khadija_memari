import React, { useEffect, useState } from 'react';

import {
  ScrollView,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
  View,
  Modal,
  Pressable,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  router,
} from 'expo-router';

import {
  clearSession,
  getUser,
} from '../lib/auth';
import AcademyHeader from '../components/AcademyHeader';
import { api } from '../lib/api';


const menuPermission:Record<string,string>={
 '/students':'students','/teachers':'teachers','/hostel-menu':'rooms','/academy-menu':'marks','/service-staff':'service_staff','/office':'office_panel','/library':'library_panel','/dining-stock':'dining_stock','/guardians':'guardians','/rooms':'rooms','/room-assignments':'room_assignments','/attendance':'attendance','/behavior':'behavior','/asset-register':'asset_register','/gate-pass':'gate_passes','/visits':'visits','/student-lifecycle':'student_lifecycle','/illness':'illness','/marks':'marks','/terminal-exams':'terminal_exams','/class-results':'published_results','/problems':'problems','/routines':'routines','/notices':'notices','/deposit-fund':'deposit_fund','/audit-log':'audit_log'
};

const menus: any[] = [

  ['Students', '/students'],

  ['Staff', '/teachers'],

  ['Hostel', '/hostel-menu'],

  ['Academy', '/academy-menu'],

  ['Guardians', '/guardians'],

  ['Student Gate Pass', '/gate-pass'],

  ['Visiting Day Record / Permission', '/visits'],

  ['Student Deposit Fund', '/deposit-fund'],
  ['Asset Register', '/asset-register'],

  ['Activity Audit Log', '/audit-log'],

  ['System Administration', '/system-admin'],

];

function AdminLink({ path, style, onPress, children }: { path: string; style: any; onPress: () => void; children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <a href={path} onClick={(event) => { event.preventDefault(); onPress(); }} style={{ ...StyleSheet.flatten(style), display: 'flex', boxSizing: 'border-box', textDecorationLine: 'none', textDecoration: 'none' } as any}>{children}</a>;
  }
  return <TouchableOpacity style={style} onPress={onPress}>{children}</TouchableOpacity>;
}


export default function Dashboard() {
  const [unread,setUnread]=useState(0);
  const [teacherMenu,setTeacherMenu]=useState(false);
  const [hostelMenu,setHostelMenu]=useState(false);
  const [academyMenu,setAcademyMenu]=useState(false);
  const [studentMenu,setStudentMenu]=useState(false);
  const [genericMenu,setGenericMenu]=useState<{title:string;path:string}|null>(null);
  const [restricted,setRestricted]=useState(false),[permissions,setPermissions]=useState<string[]>([]),[userRole,setUserRole]=useState(''),[dashboardName,setDashboardName]=useState('');
  const loadCounter=async()=>{try{const d=await api('/api/notices/admin-counter');setUnread(d.unread||0);}catch{}};
  useEffect(()=>{void getUser<any>().then(u=>{if(u)setDashboardName(String(u.full_name||u.name||u.login_id||'').trim())});void api('/api/me').then(d=>{setRestricted(!!d.restricted);setPermissions(d.permissions||[]);setUserRole(d.user?.role||'');setDashboardName(String(d.user?.full_name||d.user?.name||d.user?.login_id||'').trim())}).catch(()=>{});void loadCounter();const timer=setInterval(loadCounter,30000);return()=>clearInterval(timer);},[]);
  const openNotifications=async()=>{try{await api('/api/notices/read-all',{method:'POST'});setUnread(0);}finally{router.push('/notices');}};
  const openMenu=(title:string,path:string)=>{
    if(title==='Staff'){setTeacherMenu(true);return;}
    if(title==='Students'){setStudentMenu(true);return;}
    if(title==='Hostel'){setHostelMenu(true);return;}
    if(title==='Academy'){setAcademyMenu(true);return;}
    router.push(path as any);
  };

  const logout =
    async () => {

      await clearSession();

      router.replace('/');

    };


  return (

    <SafeAreaView
      style={s.page}
    >

      <ScrollView
        contentContainerStyle={
          s.content
        }
      >

        <AcademyHeader compact />

        <View style={s.topBar}>
          <Text style={s.sub}>
            {restricted ? (dashboardName ? dashboardName+' Dashboard' : 'Dashboard') : 'Super Admin Dashboard'}
          </Text>
          <TouchableOpacity onPress={openNotifications} style={s.notification}>
            <Text style={s.notificationText}>🔔 Admin Notifications</Text>
            {unread>0&&<View style={s.badge}><Text style={s.badgeText}>{unread>99?'99+':unread}</Text></View>}
          </TouchableOpacity>
        </View>


        <View
          style={s.grid}
        >

          {menus.filter(([,path])=>!['/gateman','/office','/library','/dining-stock'].includes(path) && (path==='/system-admin'?userRole==='super_admin':!restricted||permissions.includes(menuPermission[path]))).map(
            ([title, path]) => (

              <AdminLink

                key={title}

                path={title==='Students' || title==='Staff' || title==='Hostel' || title==='Academy' ? '#' : path}

                style={s.card}

                onPress={() => openMenu(title,path)}

              >

                <Text
                  style={
                    s.cardText
                  }
                >
                  {title}
                </Text>

              </AdminLink>

            )
          )}

        </View>


        <TouchableOpacity
          style={s.logout}
          onPress={logout}
        >

          <Text
            style={
              s.logoutText
            }
          >
            Logout
          </Text>

        </TouchableOpacity>

      </ScrollView>

      <Modal visible={teacherMenu} transparent animationType="fade" onRequestClose={()=>setTeacherMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setTeacherMenu(false)} accessibilityRole="button" accessibilityLabel="Close teachers menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Staff</Text><TouchableOpacity onPress={()=>setTeacherMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>
            {[["Add Staff","/teachers?mode=add"],["View Staff","/teachers?mode=view"],["I-Card & Form","/teachers?mode=icard"],["Staff Attendance","/teacher-attendance"],["Staff Summary","/staff-summary"],["Gateman & Service Staff","/service-staff"]].map(([label,path])=><AdminLink path={path} key={label} style={s.modalItem} onPress={()=>{setTeacherMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></AdminLink>)}
          </View>
        </View></View>
      </Modal>

      <Modal visible={studentMenu} transparent animationType="fade" onRequestClose={()=>setStudentMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setStudentMenu(false)} accessibilityRole="button" accessibilityLabel="Close students menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Students</Text><TouchableOpacity onPress={()=>setStudentMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Student Details","/students"]].map(([label,path])=><AdminLink path={path} key={label} style={s.modalItem} onPress={()=>{setStudentMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></AdminLink>)}</View>
        </View></View>
      </Modal>

      <Modal visible={academyMenu} transparent animationType="fade" onRequestClose={()=>setAcademyMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setAcademyMenu(false)} accessibilityRole="button" accessibilityLabel="Close academy menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Academy</Text><TouchableOpacity onPress={()=>setAcademyMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Weekly Marks","/marks"],["Terminal Exam","/terminal-exams"],["Print Terminal Result","/class-results"],["Routine","/routines"],["Notice","/notices"],["Library","/library"]].map(([label,path])=><AdminLink path={path} key={label} style={s.modalItem} onPress={()=>{setAcademyMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></AdminLink>)}</View>
        </View></View>
      </Modal>

      <Modal visible={hostelMenu} transparent animationType="fade" onRequestClose={()=>setHostelMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setHostelMenu(false)} accessibilityRole="button" accessibilityLabel="Close hostel menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Hostel</Text><TouchableOpacity onPress={()=>setHostelMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Rooms","/rooms"],["Teacher Room Assignment","/room-assignments"],["Evening Room Attendance","/attendance"],["Student Behaviour","/behavior"],["Student Illness","/illness"],["Room Problem","/problems"],["Stock","/dining-stock"]].map(([label,path])=><AdminLink path={path} key={label} style={s.modalItem} onPress={()=>{setHostelMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></AdminLink>)}</View>
        </View></View>
      </Modal>

      <Modal visible={!!genericMenu} transparent animationType="fade" onRequestClose={()=>setGenericMenu(null)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setGenericMenu(null)} accessibilityRole="button" accessibilityLabel="Close menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>{genericMenu?.title}</Text><TouchableOpacity onPress={()=>setGenericMenu(null)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{genericMenu&&<AdminLink path={genericMenu.path} style={s.modalItem} onPress={()=>{const path=genericMenu.path;setGenericMenu(null);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{genericMenu.title}</Text></AdminLink>}</View>
        </View></View>
      </Modal>

    </SafeAreaView>

  );

}


const s =
  StyleSheet.create({

    page: {
      flex: 1,
      backgroundColor:
        '#f3f6f9',
    },

    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 24,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 2,
      marginBottom: 10,
    },

    title: {
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
    },

    sub: {
      fontSize: 18,
      fontWeight: '800',
      color: '#0f3a61',
    },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent:
        'space-between',
    },

    card: {
      width: '48%',
      backgroundColor: '#fff',
      minHeight: 68,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 12,
      marginBottom: 10,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 2,
    },

    cardText: {
      width: '100%',
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '700',
      color: '#124a94',
    },

    notification: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#e8f1fb',
      paddingVertical: 7,
      paddingHorizontal: 13,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#cbdcf0',
    },
    notificationText: { color: '#124a94', fontWeight: '800', fontSize: 13 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    teacherModal: { width: '100%', maxWidth: 830, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden' },
    modalHeader: { backgroundColor: '#11101d', padding: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
    closeText: { color: '#fff', fontSize: 32, lineHeight: 32 },
    modalGrid: { padding: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    modalItem: { width: '48%', minWidth: 260, minHeight: 80, borderWidth: 1, borderColor: '#d7dde5', backgroundColor: '#f8fafc', borderRadius: 12, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
    arrow: { color: '#075b9c', fontSize: 28, fontWeight: '900' },
    modalItemText: { color: '#172033', fontSize: 19, fontWeight: '600' },
    badge: { marginLeft: 8, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: '#c62828', alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

    logout: {
      backgroundColor: '#c62828',
      padding: 14,
      borderRadius: 10,
      marginTop: 10,
    },

    logoutText: {
      color: '#fff',
      fontWeight: '700',
      textAlign: 'center',
    },

  });
