import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  Text,
  Alert,
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { api } from '../lib/api';
import {
  Field,
  Button,
  Card,
  H1,
  Muted,
} from '../components/ui';

export default function Rooms() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [editingId, setEditingId] = useState<any>(null);

  const load = async () => {
    try {
      const data = await api('/api/rooms');
      setRooms(data.rooms || []);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearForm = () => {
    setName('');
    setDesc('');
    setEditingId(null);
  };

  const saveRoom = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter room number');
      return;
    }

    try {
      if (editingId !== null) {
        // EDIT ROOM
        await api(`/api/rooms/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            room_name: name.trim(),
            description: desc.trim(),
            is_active: true,
          }),
        });

        Alert.alert('Success', 'Room updated successfully');
      } else {
        // ADD ROOM
        await api('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            room_name: name.trim(),
            description: desc.trim(),
          }),
        });

        Alert.alert('Success', 'Room added successfully');
      }

      clearForm();
      await load();

    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const startEdit = (room: any) => {
    setEditingId(room.id);
    setName(room.room_name || '');
    setDesc(room.description || '');
  };



  return (
    <SafeAreaView style={styles.container}>
      <View style={{flexDirection:'row',gap:8,padding:15}}><TouchableOpacity onPress={()=>router.back()} style={styles.navButton}><Text>Back</Text></TouchableOpacity><TouchableOpacity onPress={()=>router.push('/superadmin')} style={styles.navButton}><Text>Home</Text></TouchableOpacity></View>
      <ScrollView contentContainerStyle={styles.content}>

        <H1>Rooms</H1>

        {editingId !== null && (
          <Text style={styles.editingText}>
            Editing Room
          </Text>
        )}

        <Field
          placeholder="Room number"
          value={name}
          onChangeText={setName}
        />

        <Field
          placeholder="Description"
          value={desc}
          onChangeText={setDesc}
        />

        <Button
          title={editingId !== null ? 'Update Room' : 'Add Room'}
          onPress={saveRoom}
        />

        {editingId !== null && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={clearForm}
          >
            <Text style={styles.cancelText}>
              Cancel Edit
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.space} />

        {rooms.map((room) => (
          <Card key={room.id}>

            <Text style={styles.roomName}>
              {room.room_name}
            </Text>

            <Muted>
              {room.description || 'No description'}
            </Muted>

            <View style={styles.actionRow}>

              <TouchableOpacity
                style={styles.editButton}
                onPress={() => startEdit(room)}
              >
                <Text style={styles.actionText}>
                  Edit
                </Text>
              </TouchableOpacity>



            </View>

          </Card>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  navButton:{backgroundColor:'#e4eef8',paddingHorizontal:14,paddingVertical:9,borderRadius:8},
  container: {
    flex: 1,
    backgroundColor: '#f3f6f9',
  },

  content: {
    padding: 16,
  },

  editingText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },

  space: {
    height: 16,
  },

  roomName: {
    fontWeight: '800',
    fontSize: 17,
    marginBottom: 4,
  },

  actionRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },

  editButton: {
    flex: 1,
    backgroundColor: '#1565c0',
    paddingVertical: 11,
    borderRadius: 9,
  },

  deleteButton: {
    flex: 1,
    backgroundColor: '#c62828',
    paddingVertical: 11,
    borderRadius: 9,
  },

  actionText: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: '700',
  },

  cancelButton: {
    paddingVertical: 11,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#777',
    borderRadius: 9,
  },

  cancelText: {
    textAlign: 'center',
    fontWeight: '700',
  },
});
