import React, { useEffect, useState } from 'react';

import {
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
} from 'react-native';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  router,
} from 'expo-router';

import {
  clearSession,
} from '../lib/auth';
import AcademyHeader from '../components/AcademyHeader';
import { api } from '../lib/api';


const menuPermission:Record<string,string>={
 '/students':'students','/teachers':'teachers','/service-staff':'service_staff','/gateman':'gateman_panel','/office':'office_panel','/library':'library_panel','/dining-stock':'dining_stock','/guardians':'guardians','/rooms':'rooms','/room-assignments':'room_assignments','/attendance':'attendance','/behavior':'behavior','/gate-pass':'gate_passes','/visits':'visits','/student-lifecycle':'student_lifecycle','/illness':'illness','/marks':'marks','/terminal-exams':'terminal_exams','/class-results':'published_results','/problems':'problems','/routines':'routines','/notices':'notices','/deposit-fund':'deposit_fund','/audit-log':'audit_log'
};

const menus: any[] = [

  ['Students', '/students'],

  ['Teachers', '/teachers'],

  ['Gateman / Office / Library Accounts', '/service-staff'],

  ['Gateman Panel', '/gateman'],

  ['Office Panel', '/office'],

  ['Library Panel', '/library'],

  ['Dining Stock', '/dining-stock'],

  ['Guardians', '/guardians'],

  ['Rooms', '/rooms'],

  ['Teacher Room Assignment', '/room-assignments'],

  ['Evening Room Attendance', '/attendance'],

  ['Student Behaviour', '/behavior'],

  ['Student Gate Pass', '/gate-pass'],

  ['Visiting Day Record / Permission', '/visits'],

  ['Promotion / TC / Re-Activation', '/student-lifecycle'],

  ['Student Illness / Problem', '/illness'],

  ['Weekly Test Marks', '/marks'],

  ['Terminal Exam', '/terminal-exams'],

  ['Published Results', '/class-results'],

  ['Room Problems', '/problems'],

  ['Routine', '/routines'],

  ['Notice', '/notices'],

  ['Student Deposit Fund', '/deposit-fund'],

  ['Activity Audit Log', '/audit-log'],

  ['System Administration', '/system-admin'],

];


export default function Dashboard() {
  const [unread,setUnread]=useState(0);
  const [restricted,setRestricted]=useState(false),[permissions,setPermissions]=useState<string[]>([]),[userRole,setUserRole]=useState('');
  const loadCounter=async()=>{try{const d=await api('/api/notices/admin-counter');setUnread(d.unread||0);}catch{}};
  useEffect(()=>{void api('/api/me').then(d=>{setRestricted(!!d.restricted);setPermissions(d.permissions||[]);setUserRole(d.user?.role||'')}).catch(()=>{});void loadCounter();const timer=setInterval(loadCounter,30000);return()=>clearInterval(timer);},[]);
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
          {restricted ? 'Nasmin Dashboard' : 'Super Admin Dashboard'}
        </Text>
        <TouchableOpacity onPress={openNotifications} style={s.notification}><Text style={s.notificationText}>🔔 Admin Notifications</Text>{unread>0&&<View style={s.badge}><Text style={s.badgeText}>{unread>99?'99+':unread}</Text></View>}</TouchableOpacity>


        <View
          style={s.grid}
        >

          {menus.filter(([,path])=>path==='/system-admin'?userRole==='super_admin':!restricted||permissions.includes(menuPermission[path])).map(
            ([title, path]) => (

              <TouchableOpacity

                key={title}

                style={s.card}

                onPress={() =>
                  router.push(
                    path as any
                  )
                }

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
