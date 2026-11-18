import { Platform } from 'react-native';

export interface AgoraCallEvents {
  onJoinSuccess?: (channel: string, uid: number) => void;
  onUserJoined?: (uid: number) => void;
  onUserOffline?: (uid: number, reason: number) => void;
  onError?: (errCode: number, message: string) => void;
  onAudioVolumeIndication?: (speakers: any[]) => void;
}

class AgoraWebService {
  private client: any = null;
  private localAudioTrack: any = null;
  private currentAppId: string = '';
  private events: AgoraCallEvents = {};
  private isMuted: boolean = false;
  private isSpeakerOn: boolean = true;
  private AgoraRTC: any = null;

  isSupported() {
    return Platform.OS === 'web' && typeof window !== 'undefined';
  }

  private async getAgoraRTC() {
    if (this.AgoraRTC) return this.AgoraRTC;
    if (typeof window === 'undefined') return null;
    try {
      const module = await import('agora-rtc-sdk-ng');
      this.AgoraRTC = module.default || module;
      return this.AgoraRTC;
    } catch (err) {
      console.error('[AgoraWeb] Failed to dynamically load agora-rtc-sdk-ng:', err);
      return null;
    }
  }

  async init(appId: string, events: AgoraCallEvents = {}) {
    if (!this.isSupported()) {
      return false;
    }

    try {
      this.currentAppId = appId;
      this.events = events;

      const AgoraRTC = await this.getAgoraRTC();
      if (!AgoraRTC) {
        console.error('[AgoraWeb] AgoraRTC SDK is not available');
        return false;
      }

      if (this.client) {
        try {
          await this.leaveChannel();
        } catch {}
      }

      this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      // Handle remote user publishing audio
      this.client.on('user-published', async (user: any, mediaType: string) => {
        console.log('[AgoraWeb] Remote user published media:', user.uid, mediaType);
        try {
          await this.client.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            user.audioTrack?.play();
            console.log('[AgoraWeb] Remote audio playing for user:', user.uid);
          }
          this.events.onUserJoined?.(Number(user.uid) || 0);
        } catch (err) {
          console.error('[AgoraWeb] Failed to subscribe to user audio:', err);
        }
      });

      this.client.on('user-left', (user: any, reason: any) => {
        console.log('[AgoraWeb] Remote user left:', user.uid, reason);
        this.events.onUserOffline?.(Number(user.uid) || 0, 0);
      });

      this.client.on('exception', (event: any) => {
        console.warn('[AgoraWeb] Exception:', event);
      });

      return true;
    } catch (err) {
      console.error('[AgoraWeb] Init failed:', err);
      return false;
    }
  }

  async joinChannel(channelName: string, token: string = '', uid: number = 0) {
    if (!this.client || !this.currentAppId) return false;
    try {
      const AgoraRTC = await this.getAgoraRTC();
      const numericUid = Number(uid) || null;

      // 1. Join RTC channel
      const joinedUid = await this.client.join(
        this.currentAppId,
        channelName,
        token || null,
        numericUid
      );
      console.log('[AgoraWeb] Joined channel:', channelName, 'with UID:', joinedUid);
      this.events.onJoinSuccess?.(channelName, Number(joinedUid) || 0);

      // 2. Request microphone audio track
      try {
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'speech_standard',
          AEC: true,
          ANS: true,
          AGC: true,
        });

        // 3. Publish microphone audio to channel
        await this.client.publish([this.localAudioTrack]);
        console.log('[AgoraWeb] Published local microphone track');
      } catch (micErr) {
        console.warn('[AgoraWeb] Microphone capture failed (permission denied or no mic):', micErr);
      }

      return true;
    } catch (err: any) {
      console.error('[AgoraWeb] Failed to join channel:', err);
      this.events.onError?.(1, err?.message || 'Join failed');
      return false;
    }
  }

  async leaveChannel() {
    try {
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack.close();
        this.localAudioTrack = null;
      }
      if (this.client) {
        await this.client.leave();
      }
      console.log('[AgoraWeb] Left channel successfully');
    } catch (err) {
      console.warn('[AgoraWeb] Error leaving channel:', err);
    }
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.localAudioTrack) {
      this.localAudioTrack.setEnabled(!mute);
    }
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  setSpeaker(speakerOn: boolean) {
    this.isSpeakerOn = speakerOn;
  }

  toggleSpeaker() {
    this.isSpeakerOn = !this.isSpeakerOn;
    return this.isSpeakerOn;
  }

  destroy() {
    void this.leaveChannel();
    this.client = null;
    this.currentAppId = '';
  }
}

export const agoraService = new AgoraWebService();
export default agoraService;
