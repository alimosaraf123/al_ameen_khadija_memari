import { Platform } from 'react-native';

let createAgoraRtcEngine: any = null;
let ChannelProfileType: any = null;
let ClientRoleType: any = null;

if (Platform.OS === 'android' || Platform.OS === 'ios') {
  try {
    const agoraModule = require('react-native-agora');
    createAgoraRtcEngine = agoraModule.default || agoraModule.createAgoraRtcEngine;
    ChannelProfileType = agoraModule.ChannelProfileType;
    ClientRoleType = agoraModule.ClientRoleType;
  } catch (err) {
    console.warn('react-native-agora module failed to load:', err);
  }
}

export interface AgoraCallEvents {
  onJoinSuccess?: (channel: string, uid: number) => void;
  onUserJoined?: (uid: number) => void;
  onUserOffline?: (uid: number, reason: number) => void;
  onError?: (errCode: number, message: string) => void;
  onAudioVolumeIndication?: (speakers: any[]) => void;
}

class AgoraService {
  private engine: any = null;
  private currentAppId: string = '';
  private isJoined: boolean = false;
  private isMuted: boolean = false;
  private isSpeakerOn: boolean = true;

  isSupported() {
    return Boolean(createAgoraRtcEngine) && Platform.OS !== 'web';
  }

  async init(appId: string, events: AgoraCallEvents = {}) {
    if (!this.isSupported()) {
      console.warn('Agora RTC is only supported on native Android/iOS');
      return false;
    }

    try {
      if (!this.engine) {
        this.engine = createAgoraRtcEngine();
      }

      if (this.currentAppId !== appId) {
        this.engine.initialize({
          appId,
          channelProfile: ChannelProfileType?.ChannelProfileCommunication || 0,
        });
        this.currentAppId = appId;
      }

      this.engine.registerEventHandler({
        onJoinChannelSuccess: (connection: any, elapsed: number) => {
          console.log('[Agora] Joined channel successfully:', connection?.channelId);
          this.isJoined = true;
          events.onJoinSuccess?.(connection?.channelId || '', connection?.localUid || 0);
        },
        onUserJoined: (connection: any, remoteUid: number, elapsed: number) => {
          console.log('[Agora] Remote user joined:', remoteUid);
          events.onUserJoined?.(remoteUid);
        },
        onUserOffline: (connection: any, remoteUid: number, reason: number) => {
          console.log('[Agora] Remote user went offline:', remoteUid);
          events.onUserOffline?.(remoteUid, reason);
        },
        onError: (err: number, msg: string) => {
          console.error('[Agora] Error:', err, msg);
          events.onError?.(err, msg);
        },
        onAudioVolumeIndication: (connection: any, speakers: any[], totalVolume: number) => {
          events.onAudioVolumeIndication?.(speakers);
        },
      });

      this.engine.enableAudio();
      this.engine.enableAudioVolumeIndication(200, 3, true);
      this.engine.setDefaultAudioRouteToSpeakerphone(true);
      return true;
    } catch (err) {
      console.error('Failed to init Agora RTC Engine:', err);
      return false;
    }
  }

  async joinChannel(channelName: string, token: string = '', uid: number = 0) {
    if (!this.engine) return false;
    try {
      const options = {
        clientRoleType: ClientRoleType?.ClientRoleBroadcaster || 1,
        publishMicrophoneTrack: true,
        autoSubscribeAudio: true,
      };

      const res = this.engine.joinChannel(token || '', channelName, Number(uid) || 0, options);
      console.log('[Agora] joinChannel returned:', res);
      return res === 0;
    } catch (err) {
      console.error('Failed to join Agora channel:', err);
      return false;
    }
  }

  async leaveChannel() {
    if (!this.engine) return;
    try {
      this.engine.leaveChannel();
      this.isJoined = false;
      console.log('[Agora] Left channel');
    } catch (err) {
      console.warn('Failed to leave Agora channel:', err);
    }
  }

  setMute(mute: boolean) {
    if (!this.engine) return;
    try {
      this.isMuted = mute;
      this.engine.muteLocalAudioStream(mute);
    } catch (err) {
      console.warn('Failed to toggle mute:', err);
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setSpeaker(speakerOn: boolean) {
    if (!this.engine) return;
    try {
      this.isSpeakerOn = speakerOn;
      this.engine.setEnableSpeakerphone(speakerOn);
    } catch (err) {
      console.warn('Failed to toggle speakerphone:', err);
    }
  }

  toggleSpeaker() {
    this.setSpeaker(!this.isSpeakerOn);
    return this.isSpeakerOn;
  }

  destroy() {
    if (!this.engine) return;
    try {
      this.leaveChannel();
      this.engine.release();
      this.engine = null;
      this.currentAppId = '';
    } catch (err) {
      console.warn('Failed to release Agora engine:', err);
    }
  }
}

export const agoraService = new AgoraService();
export default agoraService;

