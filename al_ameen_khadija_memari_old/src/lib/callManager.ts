import { Alert } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';

export async function initiateAudioCall(recipientId: number | string, recipientName: string) {
  try {
    const res = await api('/api/calls/initiate', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id: Number(recipientId),
        call_type: 'audio',
      }),
    });

    if (!res?.success || !res?.call) {
      Alert.alert('Call Failed', res?.message || 'Could not initiate call.');
      return false;
    }

    const { id, channel_name, token, uid, agora_app_id, recipient } = res.call;

    // Navigate to active Call screen as caller
    router.push({
      pathname: '/call/[id]' as any,
      params: {
        id: String(id),
        role: 'caller',
        channel: channel_name,
        token: token || '',
        uid: String(uid),
        recipientName: recipient?.full_name || recipientName,
        appId: agora_app_id,
      },
    });

    return true;
  } catch (err: any) {
    console.error('Call initiation error:', err);
    Alert.alert('Calling Error', err?.message || 'Network error occurred while placing call.');
    return false;
  }
}

export default {
  initiateAudioCall,
};

