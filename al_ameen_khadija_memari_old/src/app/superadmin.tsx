import React from 'react';

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


const menus: any[] = [

  ['Students', '/students'],

  ['Teachers', '/teachers'],

  ['Guardians', '/guardians'],

  ['Rooms', '/rooms'],

  ['Teacher Room Assignment', '/room-assignments'],

  ['Evening Room Attendance', '/attendance'],

  ['Student Behaviour', '/behavior'],

  ['Student Illness / Problem', '/illness'],

  ['Weekly Test Marks', '/marks'],

  ['Room Problems', '/problems'],

  ['Routine', '/routines'],

  ['Notice', '/notices'],

  ['Student Deposit Fund', '/deposit-fund'],

];


export default function Dashboard() {

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
          Super Admin Dashboard
        </Text>


        <View
          style={s.grid}
        >

          {menus.map(
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
