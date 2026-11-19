import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { api } from '../lib/api';

const MISSION_LOCATION = {
  latitude: 23.186813165763375,
  longitude: 88.11163491185468,
  maxDistanceMeters: 200,
};
const LOCATION_ERROR_MSG = 'please contact- 7479020091 for submit attednance';

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function showAttendanceAlert(message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message);
  } else {
    Alert.alert('Attendance Alert', message);
  }
}

async function getDeviceCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!perm || perm.status !== 'granted') {
      perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    }
    if (perm?.status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (loc?.coords && Number.isFinite(loc.coords.latitude) && Number.isFinite(loc.coords.longitude)) {
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      }
    }
  } catch {}

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      return coords;
    } catch {}
  }

  return null;
}

export default function MissionStatus({
  style,
  compact = false,
  containerStyle,
  onStatusChange,
}: {
  style?: any;
  compact?: boolean;
  containerStyle?: any;
  onStatusChange?: (status: string) => void;
}) {
  const [availability, setAvailability] = useState<string>('Present');
  const [hasStaffProfile, setHasStaffProfile] = useState<boolean | null>(null);
  const [submittingAvailability, setSubmittingAvailability] = useState(false);

  useEffect(() => {
    let active = true;
    const dateStr = new Date().toISOString().slice(0, 10);
    api('/api/teachers/me/availability?date=' + dateStr)
      .then((res: any) => {
        if (!active) return;
        if (res && res.has_staff_profile === false) {
          setHasStaffProfile(false);
          return;
        }
        setHasStaffProfile(true);
        if (res?.status) {
          setAvailability(res.status);
        }
      })
      .catch(() => {
        if (!active) return;
        setHasStaffProfile(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSetAvailability(nextStatus: 'Present' | 'Absent') {
    if (submittingAvailability) return;
    setSubmittingAvailability(true);
    try {
      const coords = await getDeviceCoordinates();
      if (!coords) {
        showAttendanceAlert(LOCATION_ERROR_MSG);
        return;
      }

      const dist = calculateDistanceMeters(
        coords.latitude,
        coords.longitude,
        MISSION_LOCATION.latitude,
        MISSION_LOCATION.longitude
      );

      if (!Number.isFinite(dist) || dist > MISSION_LOCATION.maxDistanceMeters) {
        showAttendanceAlert(LOCATION_ERROR_MSG);
        return;
      }

      const res = await api('/api/teachers/me/availability', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          status: nextStatus,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });

      setAvailability(res.status || nextStatus);
      if (onStatusChange) onStatusChange(res.status || nextStatus);
      showAttendanceAlert(
        nextStatus === 'Present'
          ? `Marked IN / PRESENT successfully (${Math.round(dist)}m from mission).`
          : `Marked OUT / ABSENT successfully (${Math.round(dist)}m from mission).`
      );
    } catch (e: any) {
      showAttendanceAlert(e?.message || LOCATION_ERROR_MSG);
    } finally {
      setSubmittingAvailability(false);
    }
  }

  if (hasStaffProfile === false) {
    return null;
  }

  return (
    <View style={[styles.availabilityWrap, containerStyle]}>
      <View style={[styles.availability, compact && styles.availabilityCompact, style]}>
        <Text style={[styles.availabilityLabel, compact && styles.availabilityLabelCompact]}>
          Mission Status
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Mark IN or Present"
          disabled={submittingAvailability}
          style={[
            styles.availabilityButton,
            availability === 'Present' && styles.availabilityIn,
            submittingAvailability && { opacity: 0.6 },
          ]}
          onPress={() => handleSetAvailability('Present')}
        >
          <Text style={styles.availabilityText}>
            {submittingAvailability ? 'CHECKING...' : 'IN / PRESENT'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Mark OUT or Absent"
          disabled={submittingAvailability}
          style={[
            styles.availabilityButton,
            availability === 'Absent' && styles.availabilityOut,
            submittingAvailability && { opacity: 0.6 },
          ]}
          onPress={() => handleSetAvailability('Absent')}
        >
          <Text style={styles.availabilityText}>
            {submittingAvailability ? 'CHECKING...' : 'OUT / ABSENT'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  availabilityWrap: {
    width: '100%',
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
    flexWrap: 'nowrap',
  },
  availabilityCompact: {
    marginVertical: 4,
    gap: 6,
  },
  availabilityLabel: {
    fontWeight: '900',
    color: '#365b4b',
    marginRight: 2,
    fontSize: 12,
  },
  availabilityLabelCompact: {
    fontSize: 11,
  },
  availabilityButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#dbe7df',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  availabilityIn: {
    backgroundColor: '#198754',
  },
  availabilityOut: {
    backgroundColor: '#dc3545',
  },
  availabilityText: {
    fontWeight: '900',
    color: '#ffffff',
    fontSize: 11,
    letterSpacing: -0.2,
  },
});
