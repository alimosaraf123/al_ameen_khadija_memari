import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  BackHandler,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { agoraService } from '../../lib/agoraService';
import { endCallKeepCall, setCallConnected } from '../../lib/callkeep';
import { api } from '../../lib/api';

export default function CallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    role?: string;
    channel?: string;
    token?: string;
    uid?: string;
    callerName?: string;
    recipientName?: string;
    appId?: string;
  }>();

  const callId = params.id;
  const isCallee = params.role === 'callee';
  const displayName = isCallee
    ? params.callerName || 'Incoming Caller'
    : params.recipientName || 'Recipient';

  const [callStatus, setCallStatus] = useState<string>(isCallee ? 'Connecting...' : 'Ringing...');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statusPollRef = useRef<NodeJS.Timeout | null>(null);
  const isLeavingRef = useRef<boolean>(false);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  const endCall = async (reason: string = 'completed') => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;

    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    if (statusPollRef.current) clearInterval(statusPollRef.current);

    // 1. Leave Agora RTC session
    await agoraService.leaveChannel();

    // 2. Dismiss CallKeep native call UI
    if (callId) endCallKeepCall(callId);

    // 3. Inform Backend
    try {
      if (callId) {
        await api(`/api/calls/${callId}/end`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
    } catch (err) {
      console.warn('Failed to post end call:', err);
    }

    // 4. Navigate back
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/' as any);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Prevent Android hardware back button from exiting without cleaning up call
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      void endCall('user_cancelled');
      return true;
    });

    async function startCallSession() {
      const appId = params.appId;
      const channel = params.channel;
      const token = params.token || '';
      const uid = Number(params.uid) || 0;

      if (!appId || !channel) {
        setCallStatus('Call configuration missing');
        setTimeout(() => endCall('error'), 2000);
        return;
      }

      // Initialize Agora RTC Engine
      const inited = await agoraService.init(appId, {
        onJoinSuccess: (ch, u) => {
          if (!mounted) return;
          console.log('[CallScreen] Agora joined:', ch, u);
          if (callId) setCallConnected(callId);
        },
        onUserJoined: (remoteUid) => {
          if (!mounted) return;
          console.log('[CallScreen] Remote user connected:', remoteUid);
          setIsConnected(true);
          setCallStatus('Connected');

          // Start duration timer
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => {
              setDuration((prev) => prev + 1);
            }, 1000);
          }
        },
        onUserOffline: (remoteUid, reason) => {
          if (!mounted) return;
          console.log('[CallScreen] Remote user left:', remoteUid, reason);
          setCallStatus('Call ended');
          setTimeout(() => endCall('remote_offline'), 1500);
        },
        onError: (errCode, msg) => {
          console.warn('[CallScreen] Agora error:', errCode, msg);
        },
      });

      if (!inited) {
        setCallStatus('Audio engine initialization failed');
        return;
      }

      // Join Agora Channel
      await agoraService.joinChannel(channel, token, uid);

      // If Callee, notify backend of answer
      if (isCallee && callId) {
        try {
          await api(`/api/calls/${callId}/answer`, { method: 'POST' });
        } catch {}
      }

      // Poll status every 3 seconds to detect if remote party rejected / ended
      statusPollRef.current = setInterval(async () => {
        if (!mounted || isLeavingRef.current || !callId) return;
        try {
          const res = await api(`/api/calls/${callId}/status`);
          if (res?.call?.status === 'ended' || res?.call?.status === 'rejected') {
            setCallStatus(res.call.status === 'rejected' ? 'Call Rejected' : 'Call Ended');
            void endCall(res.call.status);
          }
        } catch {}
      }, 3000);
    }

    void startCallSession();

    return () => {
      mounted = false;
      backHandler.remove();
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      agoraService.destroy();
    };
  }, [callId]);

  const handleToggleMute = () => {
    const next = agoraService.toggleMute();
    setIsMuted(next);
  };

  const handleToggleSpeaker = () => {
    const next = agoraService.toggleSpeaker();
    setIsSpeakerOn(next);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.securityBadge}>🔒 End-to-End Encrypted HD Voice</Text>
      </View>

      {/* Center Caller Profile */}
      <View style={styles.profileSection}>
        <View style={styles.avatarOuterRing}>
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>
              {displayName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.callerName} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={[styles.statusText, isConnected && styles.connectedText]}>
          {isConnected ? formatTime(duration) : callStatus}
        </Text>
      </View>

      {/* Bottom Controls Bar */}
      <View style={styles.controlsBar}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.actionButton, isMuted && styles.activeButton]}
          onPress={handleToggleMute}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
          <Text style={styles.actionLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {/* End Call Button */}
        <TouchableOpacity
          style={styles.endCallButton}
          onPress={() => endCall('user_hangup')}
          activeOpacity={0.8}
        >
          <Text style={styles.endCallIcon}>📞</Text>
          <Text style={styles.endCallLabel}>End</Text>
        </TouchableOpacity>

        {/* Speakerphone Button */}
        <TouchableOpacity
          style={[styles.actionButton, isSpeakerOn && styles.activeButton]}
          onPress={handleToggleSpeaker}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>{isSpeakerOn ? '🔊' : '📱'}</Text>
          <Text style={styles.actionLabel}>{isSpeakerOn ? 'Speaker' : 'Earpiece'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Midnight slate
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    alignItems: 'center',
  },
  securityBadge: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#1e293b',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    letterSpacing: 0.3,
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  avatarOuterRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  avatarInner: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  avatarText: {
    color: '#38bdf8',
    fontSize: 48,
    fontWeight: '800',
  },
  callerName: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  statusText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedText: {
    color: '#4ade80',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'android' ? 40 : 28,
    paddingHorizontal: 20,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  activeButton: {
    backgroundColor: '#38bdf8',
    borderColor: '#0284c7',
  },
  actionIcon: {
    fontSize: 26,
    marginBottom: 2,
  },
  actionLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  endCallButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  endCallIcon: {
    fontSize: 32,
    transform: [{ rotate: '135deg' }],
    marginBottom: 2,
  },
  endCallLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});

