import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';

let RNCallKeep: any = null;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    RNCallKeep = require('react-native-callkeep').default;
  } catch (err) {
    console.warn('react-native-callkeep native module not loaded:', err);
  }
}

let isSetup = false;
let activeCallData: Record<string, any> = {};

export interface CallKeepOptions {
  onAnswerCall?: (callId: string, data: any) => void;
  onEndCall?: (callId: string) => void;
}

let callbacks: CallKeepOptions = {};

/**
 * Initialize CallKeep for native Incoming Call UI
 */
export async function setupCallKeep(options: CallKeepOptions = {}) {
  callbacks = options;
  if (!RNCallKeep || isSetup || Platform.OS === 'web') return;

  try {
    const config = {
      ios: {
        appName: 'Al-Ameen Calling',
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription: 'Al-Ameen requires Phone Calling permissions to show native incoming calls.',
        cancelButton: 'Cancel',
        okButton: 'Ok',
        imageName: 'ic_launcher',
        additionalPermissions: [],
        selfManaged: true, // Use self-managed ConnectionService for in-app WebRTC calls
        foregroundService: {
          channelId: 'call',
          channelName: 'Al-Ameen Call Service',
          notificationTitle: 'Al-Ameen Call is active',
          notificationIcon: 'ic_launcher',
        },
      },
    };

    await RNCallKeep.setup(config);
    RNCallKeep.setAvailable(true);

    // Event: User answers call from native Incoming Call UI
    RNCallKeep.addEventListener('answerCall', async ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKeep] answerCall:', callUUID);
      RNCallKeep.setCurrentCallActive(callUUID);
      const callInfo = activeCallData[callUUID] || {};
      
      // Notify backend that call was answered
      try {
        await api(`/api/calls/${callUUID}/answer`, { method: 'POST' });
      } catch (e) {
        console.warn('Failed to post call answer to backend:', e);
      }

      if (callbacks.onAnswerCall) {
        callbacks.onAnswerCall(callUUID, callInfo);
      } else {
        router.push({
          pathname: '/call/[id]' as any,
          params: {
            id: callUUID,
            role: 'callee',
            channel: callInfo.channelName,
            token: callInfo.token,
            uid: callInfo.uid,
            callerName: callInfo.callerName,
            appId: callInfo.agoraAppId,
          },
        });
      }
    });

    // Event: User rejects / ends call from native UI
    RNCallKeep.addEventListener('endCall', async ({ callUUID }: { callUUID: string }) => {
      console.log('[CallKeep] endCall:', callUUID);
      delete activeCallData[callUUID];
      try {
        await api(`/api/calls/${callUUID}/end`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'rejected' }),
        });
      } catch (e) {
        console.warn('Failed to notify backend of ended call:', e);
      }

      if (callbacks.onEndCall) {
        callbacks.onEndCall(callUUID);
      }
    });

    isSetup = true;
    console.log('[CallKeep] initialized successfully');
  } catch (err) {
    console.warn('Failed to setup CallKeep:', err);
  }
}

/**
 * Display native full-screen incoming call UI
 */
export function displayIncomingCall(callId: string, callerName: string, meta: any = {}) {
  if (!RNCallKeep) return;
  activeCallData[callId] = meta;
  try {
    RNCallKeep.displayIncomingCall(
      callId,
      callerName || 'Unknown Caller',
      callerName || 'Al-Ameen Calling',
      'generic',
      meta.callType === 'video'
    );
  } catch (err) {
    console.warn('Failed to display incoming call UI via CallKeep:', err);
  }
}

/**
 * End / dismiss CallKeep call UI
 */
export function endCallKeepCall(callId: string) {
  if (!RNCallKeep) return;
  delete activeCallData[callId];
  try {
    RNCallKeep.endCall(callId);
  } catch (err) {
    console.warn('Failed to end CallKeep call:', err);
  }
}

/**
 * Notify CallKeep that outgoing call is connected
 */
export function setCallConnected(callId: string) {
  if (!RNCallKeep) return;
  try {
    RNCallKeep.setCurrentCallActive(callId);
  } catch {}
}

export default {
  setupCallKeep,
  displayIncomingCall,
  endCallKeepCall,
  setCallConnected,
};

