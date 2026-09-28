import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';

export default function SuperAdminDashboard() {
  const menus = [
    'Students',
    'Teachers',
    'Guardians',
    'Rooms',
    'Attendance',
    'Student Behaviour',
    'Room Problems',
    'Routine',
    'Notice',
    'Marks & Result',
    'Documents',
    'Dues',
    'Reports',
    'Backup & Export',
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Al-Ameen Mission</Text>
        <Text style={styles.subtitle}>Memari Khadija Campus</Text>
        <Text style={styles.role}>Super Admin Dashboard</Text>

        <View style={styles.grid}>
          {menus.map((item) => (
            <TouchableOpacity
              key={item}
              style={styles.card}
              onPress={() => {}}
            >
              <Text style={styles.cardText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f6f9',
  },
  content: {
    padding: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginTop: 5,
  },
  role: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 25,
    marginBottom: 15,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    paddingVertical: 22,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 14,
    elevation: 3,
  },
  cardText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
  },
});