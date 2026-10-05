import React, { useEffect, useState } from 'react';

import {
  ScrollView,
  Text,
  TouchableOpacity,
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
 '/students':'students','/teachers':'teachers','/hostel-menu':'rooms','/academy-menu':'marks','/service-staff':'service_staff','/office':'office_panel','/library':'library_panel','/dining-stock':'dining_stock','/guardians':'guardians','/rooms':'rooms','/room-assignments':'room_assignments','/attendance':'attendance','/behavior':'behavior','/gate-pass':'gate_passes','/visits':'visits','/student-lifecycle':'student_lifecycle','/illness':'illness','/marks':'marks','/terminal-exams':'terminal_exams','/class-results':'published_results','/problems':'problems','/routines':'routines','/notices':'notices','/deposit-fund':'deposit_fund','/audit-log':'audit_log'
};

const menus: any[] = [

  ['Students', '/students'],

  ['Teachers', '/teachers'],

  ['Hostel', '/hostel-menu'],

  ['Academy', '/academy-menu'],

  ['Guardians', '/guardians'],

  ['Student Gate Pass', '/gate-pass'],

  ['Visiting Day Record / Permission', '/visits'],

  ['Student Deposit Fund', '/deposit-fund'],

  ['Activity Audit Log', '/audit-log'],

  ['System Administration', '/system-admin'],

];


export default function Dashboard() {
  const [unread,setUnread]=useState(0);
  const [teacherMenu,setTeacherMenu]=useState(false);
  const [hostelMenu,setHostelMenu]=useState(false);
  const [academyMenu,setAcademyMenu]=useState(false);
  const [studentMenu,setStudentMenu]=useState(false);
  const [restricted,setRestricted]=useState(false),[permissions,setPermissions]=useState<string[]>([]),[userRole,setUserRole]=useState(''),[dashboardName,setDashboardName]=useState('');
  const loadCounter=async()=>{try{const d=await api('/api/notices/admin-counter');setUnread(d.unread||0);}catch{}};
  useEffect(()=>{void getUser<any>().then(u=>{if(u)setDashboardName(String(u.full_name||u.name||u.login_id||'').trim())});void api('/api/me').then(d=>{setRestricted(!!d.restricted);setPermissions(d.permissions||[]);setUserRole(d.user?.role||'');setDashboardName(String(d.user?.full_name||d.user?.name||d.user?.login_id||'').trim())}).catch(()=>{});void loadCounter();const timer=setInterval(loadCounter,30000);return()=>clearInterval(timer);},[]);
  const openNotifications=async()=>{try{await api('/api/notices/read-all',{method:'POST'});setUnread(0);}finally{router.push('/notices');}};

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

        <AcademyHeader />


        <Text
          style={s.sub}
        >
          {restricted ? (dashboardName ? dashboardName+' Dashboard' : 'Dashboard') : 'Super Admin Dashboard'}
        </Text>
        <TouchableOpacity onPress={openNotifications} style={s.notification}><Text style={s.notificationText}>🔔 Admin Notifications</Text>{unread>0&&<View style={s.badge}><Text style={s.badgeText}>{unread>99?'99+':unread}</Text></View>}</TouchableOpacity>


        <View
          style={s.grid}
        >

          {menus.filter(([,path])=>!['/gateman','/office','/library','/dining-stock'].includes(path) && (path==='/system-admin'?userRole==='super_admin':!restricted||permissions.includes(menuPermission[path]))).map(
            ([title, path]) => (

              <TouchableOpacity

                key={title}

                style={s.card}

                onPress={() => title==='Students'?router.push('/students' as any):title==='Teachers'?setTeacherMenu(true):title==='Hostel'?setHostelMenu(true):title==='Academy'?setAcademyMenu(true):router.push(path as any)}

              >

                <Text
                  style={
                    s.cardText
                  }
                >
                  {title}
                </Text>

              </TouchableOpacity>

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
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setTeacherMenu(false)} accessibilityRole="button" accessibilityLabel="Close teachers menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Teachers</Text><TouchableOpacity onPress={()=>setTeacherMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>
            {[["Add Teacher","/teachers?mode=add"],["View Teacher","/teachers?mode=view"],["I-Card & Form","/teachers?mode=icard"],["Attendance","/attendance"],["Teacher Password Reset","/teachers?mode=view"]].map(([label,path])=><TouchableOpacity key={label} style={s.modalItem} onPress={()=>{setTeacherMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></TouchableOpacity>)}
          </View>
        </View></View>
      </Modal>

      <Modal visible={studentMenu} transparent animationType="fade" onRequestClose={()=>setStudentMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setStudentMenu(false)} accessibilityRole="button" accessibilityLabel="Close students menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Students</Text><TouchableOpacity onPress={()=>setStudentMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Student Details","/students"]].map(([label,path])=><TouchableOpacity key={label} style={s.modalItem} onPress={()=>{setStudentMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></TouchableOpacity>)}</View>
        </View></View>
      </Modal>

      <Modal visible={academyMenu} transparent animationType="fade" onRequestClose={()=>setAcademyMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setAcademyMenu(false)} accessibilityRole="button" accessibilityLabel="Close academy menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Academy</Text><TouchableOpacity onPress={()=>setAcademyMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Weekly Marks","/marks"],["Terminal Exam","/terminal-exams"],["Print Terminal Result","/class-results"],["Routine","/routines"],["Notice","/notices"]].map(([label,path])=><TouchableOpacity key={label} style={s.modalItem} onPress={()=>{setAcademyMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></TouchableOpacity>)}</View>
        </View></View>
      </Modal>

      <Modal visible={hostelMenu} transparent animationType="fade" onRequestClose={()=>setHostelMenu(false)}>
        <View style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>setHostelMenu(false)} accessibilityRole="button" accessibilityLabel="Close hostel menu" /><View style={s.teacherModal}><View style={s.modalHeader}><Text style={s.modalTitle}>Hostel</Text><TouchableOpacity onPress={()=>setHostelMenu(false)}><Text style={s.closeText}>×</Text></TouchableOpacity></View>
          <View style={s.modalGrid}>{[["Rooms","/rooms"],["Teacher Room Assignment","/room-assignments"],["Evening Room Attendance","/attendance"],["Student Behaviour","/behavior"],["Student Illness","/illness"],["Room Problem","/problems"]].map(([label,path])=><TouchableOpacity key={label} style={s.modalItem} onPress={()=>{setHostelMenu(false);router.push(path as any)}}><Text style={s.arrow}>›</Text><Text style={s.modalItemText}>{label}</Text></TouchableOpacity>)}</View>
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
      padding: 16,
    },

    title: {
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
    },

    sub: {
      fontSize: 17,
      textAlign: 'center',
      color: '#667085',
      marginBottom: 20,
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
      paddingVertical: 22,
      paddingHorizontal: 8,
      borderRadius: 14,
      marginBottom: 12,
      elevation: 2,
    },

    cardText: {
      textAlign: 'center',
      fontWeight: '700',
      color: '#124a94',
    },

    notification: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: '#e8f1fb', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9, marginBottom: 16 },
    notificationText: { color: '#124a94', fontWeight: '800' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    teacherModal: { width: '100%', maxWidth: 670, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
    modalHeader: { backgroundColor: '#11101d', padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
    closeText: { color: '#fff', fontSize: 32, lineHeight: 32 },
    modalGrid: { padding: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    modalItem: { width: '48%', minWidth: 220, borderWidth: 1, borderColor: '#d7dde5', backgroundColor: '#f8fafc', borderRadius: 10, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 16 },
    arrow: { color: '#075b9c', fontSize: 22, fontWeight: '900' },
    modalItemText: { color: '#172033', fontSize: 16, fontWeight: '600' },
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
